import Database from 'better-sqlite3';
import { CredentialVault } from './credential-vault';
import { getDefaultCloudApiBaseUrl } from '../config/endpoints';

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Manages the cloud JWT access token and single-use rotating refresh token
 * stored encrypted in `sync_device_config`.
 *
 * Uses a single-flight mutex so concurrent 401 responses across SyncEngine,
 * WriteCoordinator, OnlineModuleProxyService, and License revalidation share
 * one `/auth/refresh` call and never double-spend a rotating refresh token.
 */
export class CloudTokenManager {
  public static getAccessToken(db: Database.Database): string | null {
    try {
      const row = db
        .prepare('SELECT auth_token_encrypted FROM sync_device_config WHERE id = 1')
        .get() as { auth_token_encrypted?: string } | undefined;
      if (!row?.auth_token_encrypted) return null;
      return CredentialVault.decryptSecret(row.auth_token_encrypted);
    } catch {
      return null;
    }
  }

  public static getApiBaseUrl(db: Database.Database): string {
    try {
      const row = db
        .prepare('SELECT api_base_url FROM sync_device_config WHERE id = 1')
        .get() as { api_base_url?: string } | undefined;
      return (row?.api_base_url || getDefaultCloudApiBaseUrl()).replace(/\/+$/, '');
    } catch {
      return getDefaultCloudApiBaseUrl().replace(/\/+$/, '');
    }
  }

  public static async refreshAccessToken(db: Database.Database): Promise<string | null> {
    if (refreshInFlight) {
      return refreshInFlight;
    }

    refreshInFlight = (async () => {
      try {
        const row = db
          .prepare('SELECT api_base_url, refresh_token_encrypted, device_id FROM sync_device_config WHERE id = 1')
          .get() as { api_base_url?: string; refresh_token_encrypted?: string; device_id?: string } | undefined;

        if (!row?.refresh_token_encrypted) {
          return null;
        }

        const refreshToken = CredentialVault.decryptSecret(row.refresh_token_encrypted);
        if (!refreshToken || refreshToken.length < 20) {
          return null;
        }

        const baseUrl = (row.api_base_url || getDefaultCloudApiBaseUrl()).replace(/\/+$/, '');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);

        try {
          const res = await fetch(`${baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Client-Type': 'desktop',
              'X-Client-Version': '1.0.0',
              'X-Device-Id': row.device_id || 'desktop_ws',
            },
            body: JSON.stringify({ refreshToken }),
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (!res.ok) {
            return null;
          }

          const json = (await res.json().catch(() => null)) as any;
          const payload = json?.data ?? json;
          const newAccessToken: string | undefined = payload?.accessToken || payload?.token;
          const newRefreshToken: string | undefined = payload?.refreshToken;

          if (!newAccessToken) {
            return null;
          }

          const encAccess = CredentialVault.encryptSecret(newAccessToken);
          const encRefresh = newRefreshToken
            ? CredentialVault.encryptSecret(newRefreshToken)
            : row.refresh_token_encrypted;

          db.prepare(`
            UPDATE sync_device_config
            SET auth_token_encrypted = ?,
                refresh_token_encrypted = ?,
                updated_at = datetime('now')
            WHERE id = 1
          `).run(encAccess, encRefresh);

          return newAccessToken;
        } catch {
          clearTimeout(timer);
          return null;
        }
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  }
}
