import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { BackupService } from './backup.service';

export type UpdateChannel = 'stable' | 'beta';
export type UpdateState = 
  | 'idle'
  | 'checking'
  | 'update_available'
  | 'update_not_available'
  | 'downloading'
  | 'download_interrupted'
  | 'ready_to_install'
  | 'installing'
  | 'error';

export interface WindowsUpdatePayload {
  url: string;
  sha512: string;
  sizeBytes: number;
  installerType: 'nsis';
  minWindowsBuild?: number;
}

export interface UpdateManifest {
  version: string;
  releaseDate: string;
  minSupportedVersion: string;
  mandatory: boolean;
  channel: UpdateChannel;
  windows: WindowsUpdatePayload;
  releaseNotes: string;
  databaseMigrationRequired: boolean;
  targetSchemaVersion: number;
}

export interface UpdateDownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
}

export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string;
  channel: UpdateChannel;
  updateEndpoint: string;
  lastCheckedAt: string | null;
  availableUpdate: UpdateManifest | null;
  downloadProgress: UpdateDownloadProgress | null;
  pendingInstallerPath: string | null;
  lastError: string | null;
}

export class UpdateService {
  private state: UpdateState = 'idle';
  private currentVersion: string;
  private channel: UpdateChannel = 'stable';
  private updateEndpoint: string = 'http://localhost:5000/api/v1/updates/desktop';
  private lastCheckedAt: string | null = null;
  private availableUpdate: UpdateManifest | null = null;
  private downloadProgress: UpdateDownloadProgress | null = null;
  private pendingInstallerPath: string | null = null;
  private lastError: string | null = null;
  private updatesStorageDir: string;
  private activeDownloadRequest: http.ClientRequest | null = null;

  constructor(
    private db: Database.Database,
    private dbPath: string,
    private backupService?: BackupService,
    initialVersion: string = '1.0.0',
    customUpdatesDir?: string
  ) {
    this.currentVersion = initialVersion;
    this.updatesStorageDir = customUpdatesDir || path.resolve(path.dirname(this.dbPath), 'updates');
    if (!fs.existsSync(this.updatesStorageDir)) {
      fs.mkdirSync(this.updatesStorageDir, { recursive: true });
    }
    this.loadPersistedConfig();
  }

  private loadPersistedConfig(): void {
    try {
      const row = this.db.prepare(`
        SELECT current_version, channel, update_endpoint, last_checked_at, last_update_status, pending_version, pending_installer_path, last_error
        FROM app_update_config WHERE id = 1
      `).get() as any;

      if (row) {
        if (row.channel) this.channel = row.channel as UpdateChannel;
        if (row.update_endpoint) this.updateEndpoint = row.update_endpoint;
        if (row.last_checked_at) this.lastCheckedAt = row.last_checked_at;
        if (row.pending_installer_path && fs.existsSync(row.pending_installer_path)) {
          this.pendingInstallerPath = row.pending_installer_path;
          this.state = 'ready_to_install';
        }
      }
    } catch {}
  }

  private persistState(): void {
    try {
      this.db.prepare(`
        UPDATE app_update_config
        SET channel = ?, update_endpoint = ?, last_checked_at = ?, last_update_status = ?,
            pending_version = ?, pending_installer_path = ?, last_error = ?, updated_at = datetime('now')
        WHERE id = 1
      `).run(
        this.channel,
        this.updateEndpoint,
        this.lastCheckedAt,
        this.state,
        this.availableUpdate?.version || null,
        this.pendingInstallerPath || null,
        this.lastError || null
      );
    } catch {}
  }

  public getStatus(): UpdateStatus {
    return {
      state: this.state,
      currentVersion: this.currentVersion,
      channel: this.channel,
      updateEndpoint: this.updateEndpoint,
      lastCheckedAt: this.lastCheckedAt,
      availableUpdate: this.availableUpdate,
      downloadProgress: this.downloadProgress,
      pendingInstallerPath: this.pendingInstallerPath,
      lastError: this.lastError,
    };
  }

  public setChannel(channel: UpdateChannel): void {
    this.channel = channel;
    this.persistState();
  }

  public setUpdateEndpoint(endpoint: string): void {
    this.updateEndpoint = endpoint;
    this.persistState();
  }

  /**
   * Semver comparison utility
   * Returns positive if v1 > v2, negative if v1 < v2, 0 if equal
   */
  public static compareSemver(v1: string, v2: string): number {
    const clean1 = v1.replace(/^v/, '').split('-')[0].split('.').map(Number);
    const clean2 = v2.replace(/^v/, '').split('-')[0].split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const num1 = clean1[i] || 0;
      const num2 = clean2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  /**
   * Check for updates against remote feed or manifest provider
   */
  public async checkForUpdates(feedUrlOverride?: string): Promise<UpdateManifest | null> {
    this.state = 'checking';
    this.lastError = null;
    this.lastCheckedAt = new Date().toISOString();

    const targetUrl = feedUrlOverride || `${this.updateEndpoint}/latest?channel=${this.channel}&currentVersion=${this.currentVersion}&os=win32&arch=x64`;

    try {
      const manifest = await this.fetchManifest(targetUrl);
      
      // 1. Validate version progression
      const isNewer = UpdateService.compareSemver(manifest.version, this.currentVersion) > 0;
      if (!isNewer) {
        this.state = 'update_not_available';
        this.availableUpdate = null;
        this.persistState();
        return null;
      }

      // 2. Validate channel eligibility
      if (this.channel === 'stable' && manifest.channel !== 'stable') {
        this.state = 'update_not_available';
        this.availableUpdate = null;
        this.persistState();
        return null;
      }

      // 3. Check minimum supported version requirement
      if (manifest.minSupportedVersion && UpdateService.compareSemver(this.currentVersion, manifest.minSupportedVersion) < 0) {
        manifest.mandatory = true;
      }

      this.availableUpdate = manifest;
      this.state = 'update_available';
      this.persistState();
      return manifest;
    } catch (err: any) {
      this.state = 'error';
      this.lastError = err.message || 'Failed to check for updates';
      this.persistState();
      throw err;
    }
  }

  /**
   * Direct injection of manifest for local testing & simulated networks
   */
  public setAvailableManifest(manifest: UpdateManifest): boolean {
    const isNewer = UpdateService.compareSemver(manifest.version, this.currentVersion) > 0;
    if (!isNewer) {
      this.state = 'update_not_available';
      this.availableUpdate = null;
      return false;
    }
    this.availableUpdate = manifest;
    this.state = 'update_available';
    this.lastCheckedAt = new Date().toISOString();
    this.persistState();
    return true;
  }

  /**
   * Download and cryptographically verify the installer
   */
  public async downloadUpdate(downloadUrlOverride?: string): Promise<string> {
    if (!this.availableUpdate) {
      throw new Error('No update is available to download');
    }

    const manifest = this.availableUpdate;
    const downloadUrl = downloadUrlOverride || manifest.windows.url;
    const finalInstallerPath = path.join(this.updatesStorageDir, `SchoolManagementSoftware-Setup-${manifest.version}.exe`);
    const stagingPath = `${finalInstallerPath}.part`;

    this.state = 'downloading';
    this.lastError = null;
    this.downloadProgress = {
      bytesDownloaded: 0,
      totalBytes: manifest.windows.sizeBytes,
      percent: 0,
      speedBytesPerSec: 0,
    };
    this.persistState();

    try {
      if (fs.existsSync(stagingPath)) {
        try { fs.unlinkSync(stagingPath); } catch {}
      }

      await this.streamDownload(downloadUrl, stagingPath, manifest.windows.sizeBytes);

      // Verify SHA-512 cryptographic checksum
      const fileBytes = fs.readFileSync(stagingPath);
      const computedHash = crypto.createHash('sha512').update(fileBytes).digest('hex').toLowerCase();
      const expectedHash = manifest.windows.sha512.trim().toLowerCase();

      if (computedHash !== expectedHash) {
        try { fs.unlinkSync(stagingPath); } catch {}
        throw new Error(`CORRUPT_UPDATE_PAYLOAD: SHA-512 checksum mismatch. Expected ${expectedHash}, got ${computedHash}`);
      }

      // Check size matches
      if (fileBytes.length !== manifest.windows.sizeBytes) {
        try { fs.unlinkSync(stagingPath); } catch {}
        throw new Error(`INCOMPLETE_UPDATE_PAYLOAD: Size mismatch. Expected ${manifest.windows.sizeBytes} bytes, got ${fileBytes.length}`);
      }

      // Atomic rename to final installer
      if (fs.existsSync(finalInstallerPath)) {
        try { fs.unlinkSync(finalInstallerPath); } catch {}
      }
      fs.renameSync(stagingPath, finalInstallerPath);

      this.pendingInstallerPath = finalInstallerPath;
      this.state = 'ready_to_install';
      this.downloadProgress = {
        bytesDownloaded: fileBytes.length,
        totalBytes: fileBytes.length,
        percent: 100,
        speedBytesPerSec: 0,
      };
      this.persistState();

      return finalInstallerPath;
    } catch (err: any) {
      if (fs.existsSync(stagingPath)) {
        try { fs.unlinkSync(stagingPath); } catch {}
      }
      if ((this.state as UpdateState) !== 'download_interrupted') {
        this.state = 'error';
        this.lastError = err.message || 'Update download failed';
      }
      this.persistState();
      throw err;
    }
  }

  /**
   * Cancel or interrupt an active download
   */
  public cancelDownload(): void {
    if (this.activeDownloadRequest) {
      this.activeDownloadRequest.destroy();
      this.activeDownloadRequest = null;
    }
    this.state = 'download_interrupted';
    this.lastError = 'Download was cancelled by user or interrupted';
    this.persistState();
  }

  /**
   * Pre-Installation Safety Backup & Execution
   * 
   * Strict Safety Invariants:
   * 1. Requires valid, verified pending installer.
   * 2. Flushes and truncates active SQLite WAL.
   * 3. Creates an automated pre-update safety backup.
   * 4. Spawns installer process cleanly.
   * 5. Returns execution status.
   */
  public async prepareAndInstall(options?: {
    silent?: boolean;
    skipProcessExit?: boolean; // For automated testing
  }): Promise<{ success: boolean; safetyBackupPath?: string; installerPath: string }> {
    if (this.state !== 'ready_to_install' || !this.pendingInstallerPath) {
      throw new Error('No verified update is ready to install');
    }

    if (!fs.existsSync(this.pendingInstallerPath)) {
      this.state = 'error';
      this.lastError = 'Pending installer binary missing from disk';
      this.persistState();
      throw new Error(this.lastError);
    }

    this.state = 'installing';
    this.persistState();

    // 1. Truncate SQLite WAL cleanly
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (e) {
      console.warn('Pre-update WAL checkpoint notice:', e);
    }

    // 2. Perform automated pre-update safety backup if BackupService is provided
    let safetyBackupPath: string | undefined;
    if (this.backupService) {
      try {
        const backupResult = await this.backupService.createBackup({
          triggerType: 'pre_migration',
          destinationType: 'local',
        });
        safetyBackupPath = backupResult.filePath;
      } catch (err) {
        console.warn('Pre-update safety backup notice:', err);
      }
    }

    // 3. Spawn installer
    const installerArgs = options?.silent ? ['/S', '--updated'] : ['--updated'];
    const installerPath = this.pendingInstallerPath;

    if (!options?.skipProcessExit) {
      const child = spawn(installerPath, installerArgs, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      // Schedule clean application exit
      setTimeout(() => {
        try {
          const { app } = require('electron');
          app.quit();
        } catch {
          process.exit(0);
        }
      }, 500);
    }

    return {
      success: true,
      safetyBackupPath,
      installerPath,
    };
  }

  /**
   * HTTP/HTTPS Manifest fetcher
   */
  private fetchManifest(url: string): Promise<UpdateManifest> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      const req = client.get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Update server returned HTTP status ${res.statusCode}`));
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed.version || !parsed.windows?.sha512) {
              return reject(new Error('Invalid update manifest format'));
            }
            resolve(parsed as UpdateManifest);
          } catch (e) {
            reject(new Error('Failed to parse update manifest JSON'));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timed out contacting update server'));
      });

      req.on('error', (err) => {
        reject(new Error(`Failed to contact update server: ${err.message}`));
      });
    });
  }

  /**
   * Stream download with speed and progress calculation
   */
  private streamDownload(url: string, targetPath: string, totalExpectedBytes: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      const fileStream = fs.createWriteStream(targetPath);
      let downloaded = 0;
      let startTime = Date.now();

      const req = client.get(url, { timeout: 30000 }, (res) => {
        if (res.statusCode !== 200) {
          fileStream.close();
          return reject(new Error(`Download server returned HTTP status ${res.statusCode}`));
        }

        const total = Number(res.headers['content-length']) || totalExpectedBytes;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          fileStream.write(chunk);

          const elapsedSec = (Date.now() - startTime) / 1000;
          const speed = elapsedSec > 0 ? downloaded / elapsedSec : 0;
          const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;

          this.downloadProgress = {
            bytesDownloaded: downloaded,
            totalBytes: total,
            percent,
            speedBytesPerSec: Math.round(speed),
          };
        });

        res.on('end', () => {
          fileStream.end(() => {
            this.activeDownloadRequest = null;
            resolve();
          });
        });

        res.on('error', (err) => {
          fileStream.close();
          this.activeDownloadRequest = null;
          reject(err);
        });
      });

      this.activeDownloadRequest = req;

      req.on('timeout', () => {
        req.destroy();
        fileStream.close();
        this.activeDownloadRequest = null;
        reject(new Error('Download timed out'));
      });

      req.on('error', (err) => {
        fileStream.close();
        this.activeDownloadRequest = null;
        reject(err);
      });
    });
  }
}
