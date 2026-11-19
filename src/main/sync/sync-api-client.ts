export class SyncHttpError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly body?: any;

  constructor(status: number, code?: string, body?: any, message?: string) {
    const detail = message || (typeof body === 'string' ? body : '');
    super(`HTTP ${status}${code ? ` (${code})` : ''}${detail ? `: ${detail}` : ''}`);
    this.name = 'SyncHttpError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export interface SyncPushEvent {
  eventId: string;
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
  localVersion: number;
  idempotencyKey: string;
  deviceId: string;
  schemaVersion: number;
  dependencyId?: string | null;
  createdAt: string;
}

export interface SyncPushEventAck {
  eventId: string;
  entityId: string;
  status: 'synced' | 'conflict' | 'rejected';
  serverVersion?: number;
  conflictDetails?: {
    remotePayload: any;
    conflictingFields: string[];
    reason: string;
  };
  errorMessage?: string;
  permanent?: boolean;
  errorCode?: string;
  retryAfterSeconds?: number;
}

export interface SyncPushResponse {
  success: boolean;
  acknowledgedCount: number;
  failedCount: number;
  conflictCount: number;
  events: SyncPushEventAck[];
  serverTime: string;
}

export interface RemoteChangeItem {
  changeId: string;
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
  remoteVersion: number;
  timestamp: string;
  originDeviceId?: string;
  seq?: number;
  deleted?: boolean;
}

export interface SyncStreamResponse {
  changes: RemoteChangeItem[];
  hasMore: boolean;
  latestSeq: number;
  minRetainedSeq: number;
}

export interface SyncPullResponse {
  success: boolean;
  hasMore: boolean;
  nextCursors: Record<string, string>;
  changes: RemoteChangeItem[];
  serverTime: string;
}

export interface DeviceRegistrationResponse {
  success: boolean;
  deviceId: string;
  token?: string;
  refreshToken?: string;
  serverTime: string;
  error?: string;
}

export interface ISyncApiClient {
  verifyConnectivity(): Promise<{ online: boolean; latencyMs?: number; serverTime?: string }>;
  registerDevice(schoolId: string, deviceName: string, clientToken?: string): Promise<DeviceRegistrationResponse>;
  pushBatch(schoolId: string, deviceId: string, events: SyncPushEvent[], authToken?: string): Promise<SyncPushResponse>;
  pullChanges(schoolId: string, deviceId: string, cursors: Record<string, string>, limit?: number, authToken?: string): Promise<SyncPullResponse>;
  getChanges(afterSeq: number, limit?: number, authToken?: string, deviceId?: string): Promise<SyncStreamResponse>;
  startSnapshot(entities?: string[], authToken?: string, deviceId?: string): Promise<{ snapshotId: string; expiresAt: string; entities: string[] }>;
  getSnapshotPage(snapshotId: string, entity: string, cursor?: string | null, limit?: number, authToken?: string, deviceId?: string): Promise<{ items: any[]; nextCursor: string | null; hasMore: boolean }>;
}

/**
 * Production HTTP client connecting to central School OS Backend.
 */
export class HttpSyncApiClient implements ISyncApiClient {
  constructor(private baseUrl: string) {
    if (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim()) {
      throw new Error('Cloud server URL is required');
    }
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public async verifyConnectivity(): Promise<{ online: boolean; latencyMs?: number; serverTime?: string }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let res = await fetch(`${this.baseUrl}/sync/health`, {
        method: 'GET',
        headers: {
          'X-Client-Type': 'desktop',
          'X-Client-Version': '1.0.0',
        },
        signal: controller.signal,
      }).catch(() => null);

      if (!res || !res.ok) {
        const rootHealth = this.baseUrl.endsWith('/api/v1') ? this.baseUrl.replace(/\/api\/v1$/, '/health') : `${this.baseUrl}/health`;
        res = await fetch(rootHealth, {
          method: 'GET',
          headers: {
            'X-Client-Type': 'desktop',
            'X-Client-Version': '1.0.0',
          },
          signal: controller.signal,
        }).catch(() => null);
      }
      clearTimeout(timeoutId);

      const latency = Date.now() - start;
      if (res && res.ok) {
        return { online: true, latencyMs: latency, serverTime: new Date().toISOString() };
      }
      return { online: false, latencyMs: latency };
    } catch {
      return { online: false };
    }
  }

  public async registerDevice(schoolId: string, deviceName: string, clientToken?: string): Promise<DeviceRegistrationResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/sync/devices/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Type': 'desktop',
          'X-Client-Version': '1.0.0',
          'X-Outbox-Schema-Version': '2',
          ...(clientToken ? { Authorization: `Bearer ${clientToken}` } : {}),
        },
        body: JSON.stringify({ schoolId, deviceName, platform: 'windows_desktop' }),
      });

      if (!res.ok) {
        let errJson: any = {};
        try { errJson = await res.json(); } catch {}
        return { success: false, deviceId: '', error: errJson.error?.message || errJson.message || `HTTP ${res.status}`, serverTime: new Date().toISOString() };
      }

      const data = await res.json() as any;
      const unwrapped = (data && data.data) ? data.data : data;
      return {
        success: true,
        deviceId: unwrapped.deviceId,
        token: unwrapped.token,
        refreshToken: unwrapped.refreshToken,
        serverTime: unwrapped.serverTime || new Date().toISOString(),
      };
    } catch (err: any) {
      return { success: false, deviceId: '', error: err.message, serverTime: new Date().toISOString() };
    }
  }

  public async pushBatch(schoolId: string, deviceId: string, events: SyncPushEvent[], authToken?: string): Promise<SyncPushResponse> {
    const res = await fetch(`${this.baseUrl}/sync/batch/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'desktop',
        'X-Client-Version': '1.0.0',
        'X-Outbox-Schema-Version': '2',
        'X-Device-Id': deviceId,
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ schoolId, events }),
    });

    if (!res.ok) {
      let body: any = null;
      let errCode = 'HTTP_ERROR';
      try {
        body = await res.json();
        errCode = body?.error?.code || body?.code || (res.status === 426 ? 'UPGRADE_REQUIRED' : res.status === 410 ? 'FULL_RESYNC_REQUIRED' : 'HTTP_ERROR');
      } catch {
        try { body = await res.text(); } catch {}
      }
      throw new SyncHttpError(res.status, errCode, body, typeof body === 'object' ? body?.error?.message || body?.message : body);
    }

    const json = await res.json() as any;
    return ((json && json.data) ? json.data : json) as SyncPushResponse;
  }

  public async pullChanges(
    schoolId: string,
    deviceId: string,
    cursors: Record<string, string>,
    limit: number = 100,
    authToken?: string
  ): Promise<SyncPullResponse> {
    const res = await fetch(`${this.baseUrl}/sync/batch/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'desktop',
        'X-Client-Version': '1.0.0',
        'X-Outbox-Schema-Version': '2',
        'X-Device-Id': deviceId,
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ schoolId, cursors, limit }),
    });

    if (!res.ok) {
      let body: any = null;
      let errCode = 'HTTP_ERROR';
      try {
        body = await res.json();
        errCode = body?.error?.code || (res.status === 426 ? 'UPGRADE_REQUIRED' : res.status === 410 ? 'FULL_RESYNC_REQUIRED' : 'HTTP_ERROR');
      } catch {
        try { body = await res.text(); } catch {}
      }
      throw new SyncHttpError(res.status, errCode, body);
    }

    const json = await res.json() as any;
    return ((json && json.data) ? json.data : json) as SyncPullResponse;
  }

  public async getChanges(
    afterSeq: number,
    limit: number = 100,
    authToken?: string,
    deviceId?: string,
  ): Promise<SyncStreamResponse> {
    const url = `${this.baseUrl}/sync/changes?after=${afterSeq}&limit=${limit}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Client-Type': 'desktop',
        'X-Client-Version': '1.0.0',
        'X-Outbox-Schema-Version': '2',
        ...(deviceId ? { 'X-Device-Id': deviceId } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });

    if (!res.ok) {
      let body: any = null;
      let code = 'SYNC_ERROR';
      try {
        body = await res.json();
        code = body?.error?.code || (res.status === 410 ? 'FULL_RESYNC_REQUIRED' : res.status === 426 ? 'UPGRADE_REQUIRED' : 'SYNC_ERROR');
      } catch {}
      throw new SyncHttpError(res.status, code, body);
    }

    const json = await res.json() as any;
    const data = (json && json.data) ? json.data : json;
    return {
      changes: (data.changes || []).map((c: any) => ({
        changeId: c.changeId || `chg_${c.seq}`,
        entityType: c.entityType,
        entityId: c.entityId,
        operation: c.operation,
        payload: c.payload,
        remoteVersion: c.version || c.remoteVersion || 1,
        timestamp: c.timestamp || new Date().toISOString(),
        originDeviceId: c.originDeviceId,
        seq: c.seq,
        deleted: Boolean(c.deleted),
      })),
      hasMore: Boolean(data.hasMore),
      latestSeq: data.latestSeq || 0,
      minRetainedSeq: data.minRetainedSeq || 0,
    };
  }

  public async startSnapshot(
    entities: string[] = ['STUDENT', 'ATTENDANCE'],
    authToken?: string,
    deviceId?: string,
  ): Promise<{ snapshotId: string; expiresAt: string; entities: string[] }> {
    const res = await fetch(`${this.baseUrl}/sync/snapshot/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'desktop',
        'X-Client-Version': '1.0.0',
        'X-Outbox-Schema-Version': '2',
        ...(deviceId ? { 'X-Device-Id': deviceId } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ entities }),
    });

    if (!res.ok) {
      let body: any = null;
      try { body = await res.json(); } catch {}
      throw new SyncHttpError(res.status, body?.error?.code || 'SNAPSHOT_START_ERROR', body);
    }

    const json = await res.json() as any;
    const data = (json && json.data) ? json.data : json;
    return data;
  }

  public async getSnapshotPage(
    snapshotId: string,
    entity: string,
    cursor?: string | null,
    limit: number = 100,
    authToken?: string,
    deviceId?: string,
  ): Promise<{ items: any[]; nextCursor: string | null; hasMore: boolean }> {
    const q = new URLSearchParams();
    q.set('entity', entity);
    q.set('limit', String(limit));
    if (cursor) q.set('cursor', cursor);

    const res = await fetch(`${this.baseUrl}/sync/snapshot/${snapshotId}/page?${q.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Client-Type': 'desktop',
        'X-Client-Version': '1.0.0',
        'X-Outbox-Schema-Version': '2',
        ...(deviceId ? { 'X-Device-Id': deviceId } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });

    if (!res.ok) {
      let body: any = null;
      try { body = await res.json(); } catch {}
      throw new SyncHttpError(res.status, body?.error?.code || 'SNAPSHOT_PAGE_ERROR', body);
    }

    const json = await res.json() as any;
    const data = (json && json.data) ? json.data : json;
    return data;
  }
}

/**
 * In-memory Mock/Test Backend Adapter for isolated testing without live cloud servers.
 */
export class MockSyncBackendAdapter implements ISyncApiClient {
  public isOnline: boolean = true;
  public simulateLatencyMs: number = 5;
  public mockRemoteStore: Map<string, { version: number; payload: any; timestamp: string }> = new Map();
  public mockRemoteChangeLog: RemoteChangeItem[] = [];
  public forcePushConflicts: Set<string> = new Set();
  public forceRejectedEvents: Map<string, string> = new Map();
  public processedIdempotencyKeys: Set<string> = new Set();
  public latestSeq: number = 0;
  public minRetainedSeq: number = 0;

  public async verifyConnectivity(): Promise<{ online: boolean; latencyMs?: number; serverTime?: string }> {
    if (!this.isOnline) return { online: false };
    return { online: true, latencyMs: this.simulateLatencyMs, serverTime: new Date().toISOString() };
  }

  public async registerDevice(schoolId: string, deviceName: string): Promise<DeviceRegistrationResponse> {
    if (!this.isOnline) throw new SyncHttpError(503, 'OFFLINE', null, 'Network offline');
    const deviceId = `dev_mock_${schoolId}_01`;
    return {
      success: true,
      deviceId,
      token: `mock_jwt_token_${schoolId}`,
      refreshToken: `mock_refresh_token_${schoolId}`,
      serverTime: new Date().toISOString(),
    };
  }

  public async pushBatch(schoolId: string, deviceId: string, events: SyncPushEvent[]): Promise<SyncPushResponse> {
    if (!this.isOnline) throw new SyncHttpError(503, 'OFFLINE', null, 'Cannot reach central server: offline');

    const acks: SyncPushEventAck[] = [];
    let ackCount = 0;
    let failCount = 0;
    let confCount = 0;

    for (const ev of events) {
      if (this.processedIdempotencyKeys.has(ev.idempotencyKey)) {
        acks.push({
          eventId: ev.eventId,
          entityId: ev.entityId,
          status: 'synced',
          serverVersion: 1,
        });
        ackCount++;
        continue;
      }

      if (this.forceRejectedEvents.has(ev.entityId)) {
        acks.push({
          eventId: ev.eventId,
          entityId: ev.entityId,
          status: 'rejected',
          permanent: true,
          errorMessage: this.forceRejectedEvents.get(ev.entityId),
        });
        failCount++;
        continue;
      }

      if (this.forcePushConflicts.has(ev.entityId)) {
        const storeKey = `${schoolId}:${ev.entityType}:${ev.entityId}`;
        const existing = this.mockRemoteStore.get(storeKey) || {
          version: 2,
          payload: { ...ev.payload, phone: '0333-9999999', address: 'Remote Head Office, Cloud Server' },
          timestamp: new Date().toISOString(),
        };

        acks.push({
          eventId: ev.eventId,
          entityId: ev.entityId,
          status: 'conflict',
          serverVersion: existing.version,
          conflictDetails: {
            remotePayload: existing.payload,
            conflictingFields: ['phone', 'address'],
            reason: 'Concurrent modification on remote cloud server',
          },
        });
        confCount++;
        continue;
      }

      const storeKey = `${schoolId}:${ev.entityType}:${ev.entityId}`;
      const existing = this.mockRemoteStore.get(storeKey);
      const newVersion = (existing?.version || 0) + 1;
      const now = new Date().toISOString();

      this.mockRemoteStore.set(storeKey, {
        version: newVersion,
        payload: ev.payload,
        timestamp: now,
      });

      this.processedIdempotencyKeys.add(ev.idempotencyKey);
      this.latestSeq++;

      this.mockRemoteChangeLog.push({
        changeId: `chg_${this.latestSeq}`,
        entityType: ev.entityType,
        entityId: ev.entityId,
        operation: ev.operation,
        payload: ev.payload,
        remoteVersion: newVersion,
        timestamp: now,
        originDeviceId: deviceId,
        seq: this.latestSeq,
      });

      acks.push({
        eventId: ev.eventId,
        entityId: ev.entityId,
        status: 'synced',
        serverVersion: newVersion,
      });
      ackCount++;
    }

    return {
      success: failCount === 0 && confCount === 0,
      acknowledgedCount: ackCount,
      failedCount: failCount,
      conflictCount: confCount,
      events: acks,
      serverTime: new Date().toISOString(),
    };
  }

  public async pullChanges(
    schoolId: string,
    deviceId: string,
    cursors: Record<string, string>,
    limit: number = 100
  ): Promise<SyncPullResponse> {
    if (!this.isOnline) throw new SyncHttpError(503, 'OFFLINE', null, 'Cannot reach central server: offline');

    const relevantChanges = this.mockRemoteChangeLog.filter(c => {
      const cur = cursors[c.entityType] || '0';
      return c.changeId > cur && c.originDeviceId !== deviceId;
    }).slice(0, limit);

    const nextCursors = { ...cursors };
    for (const c of relevantChanges) {
      if (!nextCursors[c.entityType] || c.changeId > nextCursors[c.entityType]) {
        nextCursors[c.entityType] = c.changeId;
      }
    }

    return {
      success: true,
      hasMore: this.mockRemoteChangeLog.length > limit,
      nextCursors,
      changes: relevantChanges,
      serverTime: new Date().toISOString(),
    };
  }

  public async getChanges(
    afterSeq: number,
    limit: number = 100,
  ): Promise<SyncStreamResponse> {
    if (!this.isOnline) throw new SyncHttpError(503, 'OFFLINE', null, 'Cannot reach central server: offline');

    if (afterSeq < this.minRetainedSeq) {
      throw new SyncHttpError(410, 'FULL_RESYNC_REQUIRED', null, 'Sequence cursor is older than min retained sequence');
    }

    const filtered = this.mockRemoteChangeLog.filter(c => (c.seq || 0) > afterSeq).slice(0, limit);
    return {
      changes: filtered,
      hasMore: this.mockRemoteChangeLog.filter(c => (c.seq || 0) > afterSeq).length > limit,
      latestSeq: this.latestSeq,
      minRetainedSeq: this.minRetainedSeq,
    };
  }

  public async startSnapshot(
    entities: string[] = ['STUDENT', 'ATTENDANCE'],
  ): Promise<{ snapshotId: string; expiresAt: string; entities: string[] }> {
    return {
      snapshotId: `snap_mock_${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      entities,
    };
  }

  public async getSnapshotPage(
    snapshotId: string,
    entity: string,
    cursor?: string | null,
    limit: number = 100,
  ): Promise<{ items: any[]; nextCursor: string | null; hasMore: boolean }> {
    const items = Array.from(this.mockRemoteStore.entries())
      .filter(([k]) => k.includes(`:${entity}:`))
      .map(([, v]) => v.payload)
      .slice(0, limit);

    return {
      items,
      nextCursor: null,
      hasMore: false,
    };
  }

  public injectRemoteChange(
    schoolId: string,
    entityType: string,
    entityId: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: any,
    remoteVersion: number = 2
  ): void {
    this.latestSeq++;
    const changeId = `chg_${this.latestSeq}`;
    const item: RemoteChangeItem = {
      changeId,
      entityType,
      entityId,
      operation,
      payload: { ...payload, schoolId },
      remoteVersion,
      timestamp: new Date().toISOString(),
      originDeviceId: 'dev_cloud_web_01',
      seq: this.latestSeq,
    };
    this.mockRemoteChangeLog.push(item);

    const storeKey = `${schoolId}:${entityType}:${entityId}`;
    this.mockRemoteStore.set(storeKey, {
      version: remoteVersion,
      payload: item.payload,
      timestamp: item.timestamp,
    });
  }
}

export class UnconfiguredSyncApiClient implements ISyncApiClient {
  public async verifyConnectivity(): Promise<{ online: boolean }> {
    return { online: false };
  }
  public async registerDevice(): Promise<any> {
    throw new Error('Cloud server not configured');
  }
  public async pushBatch(): Promise<any> {
    throw new Error('Cloud server not configured');
  }
  public async pullChanges(): Promise<any> {
    throw new Error('Cloud server not configured');
  }
  public async getChanges(): Promise<any> {
    throw new Error('Cloud server not configured');
  }
  public async startSnapshot(): Promise<any> {
    throw new Error('Cloud server not configured');
  }
  public async getSnapshotPage(): Promise<any> {
    throw new Error('Cloud server not configured');
  }
}
