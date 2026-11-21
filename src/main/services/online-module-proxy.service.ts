import Database from 'better-sqlite3';
import { CredentialVault } from '../security/credential-vault';
import { CloudTokenManager } from '../security/cloud-token-manager';
import { getDefaultCloudApiBaseUrl } from '../config/endpoints';

export interface OnlineRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: any;
  isOnline?: boolean;
}

export interface OnlineRequestResult<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export class OnlineModuleProxyService {
  constructor(private db: Database.Database) {}

  private getConnectionConfig(): { baseUrl: string; token: string | null; deviceId: string } {
    try {
      const row = this.db
        .prepare('SELECT api_base_url, auth_token_encrypted, device_id FROM sync_device_config WHERE id = 1')
        .get() as { api_base_url?: string; auth_token_encrypted?: string; device_id?: string } | undefined;
      const baseUrl = (row?.api_base_url || getDefaultCloudApiBaseUrl()).replace(/\/+$/, '');
      let token: string | null = null;
      if (row?.auth_token_encrypted) {
        try {
          token = CredentialVault.decryptSecret(row.auth_token_encrypted);
        } catch {}
      }
      return { baseUrl, token, deviceId: row?.device_id || 'desktop_ws' };
    } catch {
      return { baseUrl: getDefaultCloudApiBaseUrl().replace(/\/+$/, ''), token: null, deviceId: 'desktop_ws' };
    }
  }

  private async executeFetch(
    baseUrl: string,
    cleanPath: string,
    deviceId: string,
    token: string | null,
    opts: OnlineRequestOptions
  ): Promise<{ res: Response; json: any }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${baseUrl}${cleanPath}`, {
        method: opts.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Type': 'desktop',
          'X-Client-Version': '1.0.0',
          'X-Outbox-Schema-Version': '2',
          'X-Device-Id': deviceId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: opts.body !== undefined && opts.method !== 'GET' ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const json = await res.json().catch(() => null);
      return { res, json };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  public async request<T = any>(opts: OnlineRequestOptions): Promise<OnlineRequestResult<T>> {
    if (opts.method !== 'GET' && opts.isOnline === false) {
      return {
        ok: false,
        status: 0,
        error: 'This operation is online-only in Version 1. Please reconnect to the internet and try again.',
      };
    }

    const { baseUrl, token, deviceId } = this.getConnectionConfig();
    const cleanPath = opts.path.startsWith('/') ? opts.path : `/${opts.path}`;

    try {
      let { res, json } = await this.executeFetch(baseUrl, cleanPath, deviceId, token, opts);

      // Transparently rotate expired cloud access token and retry once
      if (res.status === 401) {
        const refreshed = await CloudTokenManager.refreshAccessToken(this.db);
        if (refreshed) {
          ({ res, json } = await this.executeFetch(baseUrl, cleanPath, deviceId, refreshed, opts));
        }
      }

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error:
            res.status === 401
              ? 'Cloud session expired. Please sign out and sign in again.'
              : json?.error?.message || `Server returned HTTP ${res.status}`,
        };
      }
      return { ok: true, status: res.status, data: json?.data ?? json };
    } catch (err: any) {
      return {
        ok: false,
        status: 0,
        error: err?.name === 'AbortError'
          ? 'Request timed out after 15 seconds.'
          : 'Unable to reach cloud server. Please check your internet connection.',
      };
    }
  }
}
