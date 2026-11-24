import { SyncStatus, SyncState, NetworkState } from '../../shared/types';
import { getDatabase } from '../database/connection';
import { SyncEngine } from './sync-engine';
import { ISyncApiClient, HttpSyncApiClient } from './sync-api-client';
import { ConflictRecord } from './conflict-resolver';
import { CredentialVault } from '../security/credential-vault';
import { getDefaultCloudApiBaseUrl } from '../config/endpoints';

export class SyncManager {
  private engine: SyncEngine | null = null;
  private networkState: NetworkState = 'online';

  private getEngine(): SyncEngine {
    if (!this.engine) {
      const db = getDatabase();
      this.engine = new SyncEngine(db);
      this.engine.setNetworkState(this.networkState);
      this.startConnectivityMonitor();
    }
    return this.engine;
  }

  /**
   * Keeps the online/offline indicator truthful: checks real reachability of the cloud server
   * at startup and every 15 seconds. (Previously the state was permanently 'online'.)
   */
  private connectivityTimer: ReturnType<typeof setInterval> | null = null;
  private wasOffline: boolean = false;
  private autoReconnectSyncing: boolean = false;

  private startConnectivityMonitor(): void {
    if (this.connectivityTimer) return;
    const check = async () => {
      try {
        const res = await this.getApiClient().verifyConnectivity();
        if (res.online) {
          const recoveredFromOffline = this.wasOffline || this.networkState === 'offline';
          this.wasOffline = false;
          this.setNetworkState('online');
          if (recoveredFromOffline && !this.autoReconnectSyncing) {
            this.autoReconnectSyncing = true;
            this.triggerSync().catch(() => {}).finally(() => {
              this.autoReconnectSyncing = false;
            });
          }
        } else {
          this.wasOffline = true;
          this.setNetworkState('offline');
        }
      } catch {
        this.wasOffline = true;
        this.setNetworkState('offline');
      }
    };
    void check();
    this.connectivityTimer = setInterval(check, 15000);
    (this.connectivityTimer as any).unref?.();
  }

  public setApiClient(client: ISyncApiClient): void {
    this.getEngine().setApiClient(client);
  }

  public getApiClient(): ISyncApiClient {
    return this.getEngine().getApiClient();
  }

  public getAuthToken(): string | undefined {
    return this.getEngine().getAuthToken();
  }

  public async refreshAuthToken(): Promise<string | null> {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT refresh_token_encrypted, api_base_url FROM sync_device_config LIMIT 1').get() as {
        refresh_token_encrypted?: string;
        api_base_url?: string;
      } | undefined;
      if (!row?.refresh_token_encrypted) return null;

      let refreshToken: string;
      try {
        refreshToken = CredentialVault.decryptSecret(row.refresh_token_encrypted);
      } catch {
        refreshToken = row.refresh_token_encrypted;
      }
      if (!refreshToken) return null;

      const baseUrl = row.api_base_url || this.getRemoteBackendUrl();
      if (!baseUrl) return null;

      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        return null;
      }

      const json: any = await res.json();
      const data = json?.data || json;
      const newAccessToken = data?.accessToken;
      const newRefreshToken = data?.refreshToken;

      if (newAccessToken) {
        let encAccess = newAccessToken;
        let encRefresh = newRefreshToken || refreshToken;
        try {
          encAccess = CredentialVault.encryptSecret(newAccessToken);
          if (newRefreshToken) encRefresh = CredentialVault.encryptSecret(newRefreshToken);
        } catch {}

        db.prepare(`
          UPDATE sync_device_config
          SET auth_token_encrypted = ?,
              refresh_token_encrypted = ?,
              updated_at = datetime('now')
          WHERE id = 1
        `).run(encAccess, encRefresh);
        return newAccessToken;
      }
    } catch {}
    return null;
  }

  public getStatus(): SyncStatus {
    try {
      return this.getEngine().getStatus();
    } catch {
      return {
        state: 'error',
        network: this.networkState,
        lastSyncedAt: null,
        pendingChangesCount: 0,
        centralBackendUrl: getDefaultCloudApiBaseUrl(),
        schoolId: 'school_default',
        lastErrorMessage: 'Database connection not initialized',
      };
    }
  }

  public setNetworkState(state: NetworkState): void {
    this.networkState = state;
    if (this.engine) {
      this.engine.setNetworkState(state);
    }
  }

  public async triggerSync(): Promise<{
    success: boolean;
    syncedCount: number;
    uploadedCount?: number;
    downloadedCount?: number;
    conflictCount?: number;
    error?: string;
  }> {
    const res = await this.getEngine().triggerSync();
    return {
      success: res.success,
      syncedCount: res.uploadedCount + res.downloadedCount,
      uploadedCount: res.uploadedCount,
      downloadedCount: res.downloadedCount,
      conflictCount: res.conflictCount,
      error: res.error,
    };
  }

  public listConflicts(status?: 'unresolved' | 'resolved'): ConflictRecord[] {
    const schoolId = this.getStatus().schoolId;
    return this.getEngine().getConflictResolver().listConflicts(schoolId, status);
  }

  public resolveConflict(
    conflictId: string,
    strategy: 'local_wins' | 'remote_wins' | 'merged',
    resolvedBy: string,
    notes?: string,
    customPayload?: any
  ) {
    const schoolId = this.getStatus().schoolId;
    return this.getEngine().getConflictResolver().resolveConflict(schoolId, conflictId, strategy, resolvedBy, notes, customPayload);
  }

  public getSyncHistory(limit: number = 20): any[] {
    const schoolId = this.getStatus().schoolId;
    return this.getEngine().getSyncHistory(schoolId, limit);
  }

  public getRemoteBackendUrl(): string {
    return this.getStatus().centralBackendUrl;
  }

  public resetEngineForTesting(dbInstance?: any, client?: ISyncApiClient) {
    const db = dbInstance || getDatabase();
    this.engine = new SyncEngine(db, { apiClient: client });
    this.engine.setNetworkState(this.networkState);
  }
}

export const syncManagerInstance = new SyncManager();
