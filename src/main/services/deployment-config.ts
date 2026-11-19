import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
let app: any;
try {
  app = require('electron').app;
} catch {}
import Database from 'better-sqlite3';
import { PasswordHasher } from '../security/password-hasher';
import { PRODUCTION_DEFAULT_CLOUD_URL, getDefaultCloudApiBaseUrl } from '../config/endpoints';

export interface DeploymentConfig {
  cloudApiBaseUrl: string;
  source: 'env' | 'file_userdata' | 'file_resource' | 'database' | 'default';
  isProductionDefault: boolean;
}

interface TechnicianSession {
  token: string;
  expiresAt: number;
}

export class DeploymentConfigService {
  private static cachedConfig: DeploymentConfig | null = null;
  private static technicianSessions: Map<string, TechnicianSession> = new Map();

  /**
   * Resolves authoritative cloud backend URL based on prioritized deployment layers:
   * 1. Environment variable (SMS_CLOUD_URL or CLOUD_BACKEND_URL)
   * 2. Deployment config file in app userData (deployment-config.json)
   * 3. Deployment config file in installation resources
   * 4. Stored database setting in sync_device_config table
   * 5. Environment-appropriate fallback (localhost:4000 in dev; production endpoint in packaged)
   */
  public static resolveConfig(db?: Database.Database): DeploymentConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    // 1. Environment variable
    const envUrl = process.env.SMS_CLOUD_URL || process.env.CLOUD_BACKEND_URL;
    if (envUrl && envUrl.trim()) {
      this.cachedConfig = {
        cloudApiBaseUrl: envUrl.trim().replace(/\/+$/, ''),
        source: 'env',
        isProductionDefault: false,
      };
      return this.cachedConfig;
    }

    // 2. UserData deployment-config.json
    try {
      if (typeof app !== 'undefined' && app.getPath) {
        const userDataCfg = path.join(app.getPath('userData'), 'deployment-config.json');
        if (fs.existsSync(userDataCfg)) {
          const content = JSON.parse(fs.readFileSync(userDataCfg, 'utf8').replace(/^\uFEFF/, ''));
          if (content.cloudApiBaseUrl && typeof content.cloudApiBaseUrl === 'string') {
            this.cachedConfig = {
              cloudApiBaseUrl: content.cloudApiBaseUrl.trim().replace(/\/+$/, ''),
              source: 'file_userdata',
              isProductionDefault: false,
            };
            return this.cachedConfig;
          }
        }
      }
    } catch {}

    // 3. Resources deployment-config.json
    try {
      const resPath = (typeof process !== 'undefined' && (process as any).resourcesPath) || path.resolve(__dirname, '../../..');
      const resCfg = path.join(resPath, 'deployment-config.json');
      if (fs.existsSync(resCfg)) {
        const content = JSON.parse(fs.readFileSync(resCfg, 'utf8').replace(/^\uFEFF/, ''));
        if (content.cloudApiBaseUrl && typeof content.cloudApiBaseUrl === 'string') {
          this.cachedConfig = {
            cloudApiBaseUrl: content.cloudApiBaseUrl.trim().replace(/\/+$/, ''),
            source: 'file_resource',
            isProductionDefault: false,
          };
          return this.cachedConfig;
        }
      }
    } catch {}

    // 4. Stored database setting
    if (db) {
      try {
        const row = db.prepare('SELECT api_base_url FROM sync_device_config WHERE id = 1').get() as { api_base_url?: string } | undefined;
        if (row?.api_base_url && row.api_base_url.trim()) {
          this.cachedConfig = {
            cloudApiBaseUrl: row.api_base_url.trim().replace(/\/+$/, ''),
            source: 'database',
            isProductionDefault: false,
          };
          return this.cachedConfig;
        }
      } catch {}
    }

    // 5. Fallback determination: resolves from endpoints.ts
    const defaultUrl = getDefaultCloudApiBaseUrl();
    const isPackaged = typeof app !== 'undefined' && app.isPackaged;

    this.cachedConfig = {
      cloudApiBaseUrl: defaultUrl,
      source: 'default',
      isProductionDefault: isPackaged && defaultUrl === PRODUCTION_DEFAULT_CLOUD_URL,
    };
    return this.cachedConfig;
  }

  public static clearCache(): void {
    this.cachedConfig = null;
  }

  public static setRuntimeUrl(db: Database.Database, newUrl: string): void {
    const cleanUrl = newUrl.trim().replace(/\/+$/, '');
    try {
      db.prepare(`
        UPDATE sync_device_config
        SET api_base_url = ?, updated_at = datetime('now')
        WHERE id = 1
      `).run(cleanUrl);
    } catch {}

    try {
      if (typeof app !== 'undefined' && app.getPath) {
        const userDataCfg = path.join(app.getPath('userData'), 'deployment-config.json');
        let existing: Record<string, any> = {};
        if (fs.existsSync(userDataCfg)) {
          existing = JSON.parse(fs.readFileSync(userDataCfg, 'utf8').replace(/^\uFEFF/, ''));
        }
        existing.cloudApiBaseUrl = cleanUrl;
        fs.writeFileSync(userDataCfg, JSON.stringify(existing, null, 2), 'utf8');
      }
    } catch {}

    this.cachedConfig = {
      cloudApiBaseUrl: cleanUrl,
      source: 'database',
      isProductionDefault: false,
    };
  }

  /**
   * Validates target cloud endpoint URL syntax, protocol, and transport security.
   * In packaged production mode, mandates HTTPS unless loopback testing is explicitly configured.
   */
  public static validateCloudUrl(urlStr: string, isPackaged: boolean): { valid: boolean; error?: string; cleanUrl?: string } {
    if (!urlStr || typeof urlStr !== 'string') {
      return { valid: false, error: 'Cloud backend URL is required' };
    }
    const trimmed = urlStr.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { valid: false, error: `Invalid URL format. Example: ${PRODUCTION_DEFAULT_CLOUD_URL}` };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Protocol must be http: or https:' };
    }

    if (isPackaged && parsed.protocol === 'http:') {
      const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
      if (!isLoopback) {
        return { valid: false, error: 'Insecure HTTP endpoints are not permitted in production. Please use HTTPS.' };
      }
    }

    const cleanUrl = trimmed.replace(/\/+$/, '');
    return { valid: true, cleanUrl };
  }

  /**
   * Verifies technician authorization key using secure constant-time comparisons.
   * Never stores or compares credentials in plaintext renderer memory.
   * Issues a short-lived ephemeral session token upon successful authentication.
   */
  public static async verifyTechnicianKey(candidateKey: string, db?: Database.Database): Promise<{ success: boolean; token?: string; error?: string }> {
    if (!candidateKey || typeof candidateKey !== 'string' || candidateKey.trim().length === 0) {
      return { success: false, error: 'Technician authorization key is required.' };
    }

    // Check persistent lockout in protected storage (encrypted SQLite table)
    if (db) {
      try {
        const lockout = db.prepare('SELECT failed_attempts, locked_until FROM technician_lockout WHERE id = 1').get() as { failed_attempts: number; locked_until?: string } | undefined;
        if (lockout?.locked_until) {
          const lockTime = new Date(lockout.locked_until).getTime();
          if (lockTime > Date.now()) {
            const minutesLeft = Math.ceil((lockTime - Date.now()) / 60000);
            return {
              success: false,
              error: `Technician access is locked due to repeated failed attempts. Please retry in ${minutesLeft} minute(s).`,
            };
          }
        }
      } catch {}
    }

    const trimmedInput = candidateKey.trim();
    let isAuthorized = false;

    // 1. Check environment variable SMS_TECHNICIAN_KEY or TECHNICIAN_ACCESS_KEY or DEPLOYMENT_KEY
    const envKey = process.env.SMS_TECHNICIAN_KEY || process.env.TECHNICIAN_ACCESS_KEY || process.env.DEPLOYMENT_KEY;
    if (envKey && envKey.trim()) {
      const hInput = crypto.createHash('sha256').update(trimmedInput).digest();
      const hEnv = crypto.createHash('sha256').update(envKey.trim()).digest();
      if (crypto.timingSafeEqual(hInput, hEnv)) {
        isAuthorized = true;
      }
    }

    // 2. Check deployment-config.json file for technicianKeyHash or technicianKey
    if (!isAuthorized) {
      try {
        const checkPaths: string[] = [];
        if (typeof app !== 'undefined' && app.getPath) {
          checkPaths.push(path.join(app.getPath('userData'), 'deployment-config.json'));
        }
        const resPath = (typeof process !== 'undefined' && (process as any).resourcesPath) || path.resolve(__dirname, '../../..');
        checkPaths.push(path.join(resPath, 'deployment-config.json'));

        for (const cfgPath of checkPaths) {
          if (fs.existsSync(cfgPath)) {
            const content = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, ''));
            if (content.technicianKeyHash && typeof content.technicianKeyHash === 'string') {
              const matches = await PasswordHasher.verifyPasswordAsync(trimmedInput, content.technicianKeyHash);
              if (matches) {
                isAuthorized = true;
                break;
              }
            } else if (content.technicianKey && typeof content.technicianKey === 'string') {
              const hInput = crypto.createHash('sha256').update(trimmedInput).digest();
              const hFile = crypto.createHash('sha256').update(content.technicianKey.trim()).digest();
              if (crypto.timingSafeEqual(hInput, hFile)) {
                isAuthorized = true;
                break;
              }
            }
          }
        }
      } catch {}
    }

    // 3. SMS_DEV_TECH_KEY is accepted ONLY when the app is NOT packaged (development only)
    const isPackaged = typeof app !== 'undefined' && app.isPackaged;
    if (!isAuthorized && !isPackaged) {
      const devKey = process.env.SMS_DEV_TECH_KEY;
      if (devKey && devKey.trim()) {
        const hInput = crypto.createHash('sha256').update(trimmedInput).digest();
        const hDev = crypto.createHash('sha256').update(devKey.trim()).digest();
        if (crypto.timingSafeEqual(hInput, hDev)) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      // Record failed attempt in protected technician_lockout table
      if (db) {
        try {
          const row = db.prepare('SELECT failed_attempts FROM technician_lockout WHERE id = 1').get() as { failed_attempts: number } | undefined;
          const currentAttempts = (row?.failed_attempts || 0) + 1;
          if (currentAttempts >= 5) {
            const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            db.prepare('UPDATE technician_lockout SET failed_attempts = ?, locked_until = ?, updated_at = datetime(\'now\') WHERE id = 1').run(currentAttempts, lockedUntil);
          } else {
            db.prepare('UPDATE technician_lockout SET failed_attempts = ?, updated_at = datetime(\'now\') WHERE id = 1').run(currentAttempts);
          }
        } catch {}
      }

      // Artificial delay to deter timing and brute-force attacks
      await new Promise(r => setTimeout(r, 250));
      return {
        success: false,
        error: isPackaged && !envKey
          ? 'Technician authorization key is invalid or not configured on this installation.'
          : 'Invalid technician authorization key.'
      };
    }

    // Reset lockout counters on success
    if (db) {
      try {
        db.prepare('UPDATE technician_lockout SET failed_attempts = 0, locked_until = NULL, updated_at = datetime(\'now\') WHERE id = 1').run();
      } catch {}
    }

    // Issue ephemeral token valid for 15 minutes
    const token = 'tech_' + crypto.randomUUID();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    this.technicianSessions.set(token, { token, expiresAt });

    // Evict expired sessions
    const now = Date.now();
    for (const [k, v] of this.technicianSessions.entries()) {
      if (v.expiresAt < now) {
        this.technicianSessions.delete(k);
      }
    }

    return {
      success: true,
      token,
    };
  }

  public static validateTechnicianSession(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    const session = this.technicianSessions.get(token);
    if (!session) return false;
    if (session.expiresAt < Date.now()) {
      this.technicianSessions.delete(token);
      return false;
    }
    return true;
  }

  public static getDeploymentConfig(techToken: string, db?: Database.Database): { success: boolean; config?: DeploymentConfig; error?: string } {
    if (!this.validateTechnicianSession(techToken)) {
      return { success: false, error: 'Technician authorization expired or invalid. Please re-authenticate.' };
    }
    const config = this.resolveConfig(db);
    return { success: true, config };
  }

  public static setDeploymentConfig(techToken: string, newUrl: string, db?: Database.Database): { success: boolean; config?: DeploymentConfig; error?: string } {
    if (!this.validateTechnicianSession(techToken)) {
      return { success: false, error: 'Technician authorization expired or invalid. Please re-authenticate.' };
    }

    const isPackaged = typeof app !== 'undefined' && app.isPackaged;
    const validation = this.validateCloudUrl(newUrl, isPackaged);
    if (!validation.valid || !validation.cleanUrl) {
      return { success: false, error: validation.error || 'Invalid URL' };
    }

    const cleanUrl = validation.cleanUrl;

    // 1. Update SQLite sync_device_config if db available
    if (db) {
      try {
        db.prepare(`
          UPDATE sync_device_config
          SET api_base_url = ?, updated_at = datetime('now')
          WHERE id = 1
        `).run(cleanUrl);
      } catch (err: any) {
        console.warn('[DEPLOY_CONFIG] Could not update sync_device_config:', err.message);
      }
    }

    // 2. Persist to userData deployment-config.json
    try {
      if (typeof app !== 'undefined' && app.getPath) {
        const userDataCfg = path.join(app.getPath('userData'), 'deployment-config.json');
        fs.writeFileSync(userDataCfg, JSON.stringify({
          cloudApiBaseUrl: cleanUrl,
          updatedAt: new Date().toISOString(),
          configuredBy: 'technician',
        }, null, 2), 'utf8');
      }
    } catch (err: any) {
      console.warn('[DEPLOY_CONFIG] Could not write userData deployment-config.json:', err.message);
    }

    this.cachedConfig = {
      cloudApiBaseUrl: cleanUrl,
      source: 'file_userdata',
      isProductionDefault: false,
    };

    return { success: true, config: this.cachedConfig };
  }
}
