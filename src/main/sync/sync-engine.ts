import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { getDatabase } from '../database/connection';
import {
  getPendingOutboxEntries,
  markEntriesSynced,
  markEntryFailed,
  setApplyingRemoteChanges,
  getPendingChangesCount,
  getFailedChangesCount,
  OutboxEntry,
} from './change-tracker';
import { ConflictResolver, ConflictRecord } from './conflict-resolver';
import { ISyncApiClient, HttpSyncApiClient, MockSyncBackendAdapter, SyncPushEvent, SyncHttpError, UnconfiguredSyncApiClient } from './sync-api-client';
import { CredentialVault } from '../security/credential-vault';
import { CloudTokenManager } from '../security/cloud-token-manager';
import { NetworkState, SyncState, SyncStatus } from '../../shared/types';
import { getDefaultCloudApiBaseUrl } from '../config/endpoints';
import { DeploymentConfigService } from '../services/deployment-config';
import { StudentRepository } from '../database/repositories/student.repository';
import { GuardianRepository } from '../database/repositories/guardian.repository';
import { FeeRepository } from '../database/repositories/fee.repository';
import { AttendanceRepository } from '../database/repositories/attendance.repository';
import { ExamRepository } from '../database/repositories/exam.repository';
import { EmployeeRepository } from '../database/repositories/employee.repository';
import { PayrollRepository } from '../database/repositories/payroll.repository';
import { TimetableRepository } from '../database/repositories/timetable.repository';
import { SettingsRepository } from '../database/repositories/settings.repository';
import { ExpenseRepository } from '../database/repositories/expense.repository';

export interface SyncEngineConfig {
  autoSyncIntervalMs?: number;
  batchSize?: number;
  apiClient?: ISyncApiClient;
}

export class SyncEngine {
  private apiClient: ISyncApiClient;
  private conflictResolver: ConflictResolver;
  private isSyncing: boolean = false;
  private autoSyncTimer: NodeJS.Timeout | null = null;
  private networkState: NetworkState = 'online';
  private syncState: SyncState = 'synced';
  private lastSyncedAt: string | null = null;
  private lastErrorMessage: string | null = null;
  private batchSize: number = 50;

  // Repositories for applying remote records
  private studentRepo: StudentRepository;
  private guardianRepo: GuardianRepository;
  private feeRepo: FeeRepository;
  private attendanceRepo: AttendanceRepository;
  private examRepo: ExamRepository;
  private employeeRepo: EmployeeRepository;
  private payrollRepo: PayrollRepository;
  private timetableRepo: TimetableRepository;
  private settingsRepo: SettingsRepository;
  private expenseRepo: ExpenseRepository;

  constructor(private db: Database.Database, config?: SyncEngineConfig) {
    if (config?.apiClient) {
      this.apiClient = config.apiClient;
    } else {
      const cfg = DeploymentConfigService.resolveConfig(db);
      if (cfg.cloudApiBaseUrl) {
        this.apiClient = new HttpSyncApiClient(cfg.cloudApiBaseUrl);
      } else {
        this.apiClient = new UnconfiguredSyncApiClient();
      }
    }
    this.conflictResolver = new ConflictResolver(db);
    this.batchSize = config?.batchSize || 50;

    this.studentRepo = new StudentRepository(db);
    this.guardianRepo = new GuardianRepository(db);
    this.feeRepo = new FeeRepository(db);
    this.attendanceRepo = new AttendanceRepository(db);
    this.examRepo = new ExamRepository(db);
    this.employeeRepo = new EmployeeRepository(db);
    this.payrollRepo = new PayrollRepository(db);
    this.timetableRepo = new TimetableRepository(db);
    this.settingsRepo = new SettingsRepository(db);
    this.expenseRepo = new ExpenseRepository(db);

    if (config?.autoSyncIntervalMs && config.autoSyncIntervalMs > 0) {
      this.startAutoSync(config.autoSyncIntervalMs);
    }
  }

  public setApiClient(client: ISyncApiClient) {
    this.apiClient = client;
  }

  public getApiClient(): ISyncApiClient {
    return this.apiClient;
  }

  public setNetworkState(state: NetworkState) {
    this.networkState = state;
    if (state === 'offline') {
      this.syncState = 'offline';
    } else if (this.syncState === 'offline') {
      this.syncState = 'synced';
    }
  }

  public getConflictResolver(): ConflictResolver {
    return this.conflictResolver;
  }

  public getStatus(): SyncStatus {
    const schoolId = this.getInstallationSchoolId();
    const pendingCount = getPendingChangesCount(this.db);
    const failedCount = getFailedChangesCount(this.db);
    const unresolvedConflicts = this.conflictResolver.getUnresolvedConflictCount(schoolId);
    const effectiveUrl = this.getApiBaseUrl();

    if (this.apiClient instanceof UnconfiguredSyncApiClient) {
      return {
        state: 'error',
        network: this.networkState,
        lastSyncedAt: this.lastSyncedAt,
        pendingChangesCount: pendingCount,
        failedChangesCount: failedCount,
        unresolvedConflictCount: unresolvedConflicts,
        centralBackendUrl: '',
        schoolId,
        lastErrorMessage: 'Cloud server not configured',
      };
    }

    let state: SyncState = this.syncState;
    if (this.networkState === 'offline') {
      state = 'offline';
    } else if (this.isSyncing) {
      state = 'syncing';
    } else if (unresolvedConflicts > 0) {
      state = 'conflict';
    } else if (failedCount > 0) {
      state = 'error';
    } else if (pendingCount > 0) {
      state = 'pending';
    } else {
      state = 'synced';
    }

    return {
      state,
      network: this.networkState,
      lastSyncedAt: this.lastSyncedAt,
      pendingChangesCount: pendingCount,
      failedChangesCount: failedCount,
      unresolvedConflictCount: unresolvedConflicts,
      centralBackendUrl: effectiveUrl,
      schoolId,
      lastErrorMessage: this.lastErrorMessage,
    };
  }

  public startAutoSync(intervalMs: number = 30000) {
    this.stopAutoSync();
    this.autoSyncTimer = setInterval(() => {
      if (this.networkState === 'online' && !this.isSyncing) {
        this.triggerSync().catch(() => {});
      }
    }, intervalMs);
  }

  public stopAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  /**
   * Main synchronization cycle: Executes mutual exclusion, upload batching,
   * download change feeds, conflict detection, and history logging.
   */
  public async triggerSync(): Promise<{
    success: boolean;
    uploadedCount: number;
    downloadedCount: number;
    conflictCount: number;
    error?: string;
  }> {
    if (this.networkState === 'offline') {
      return { success: false, uploadedCount: 0, downloadedCount: 0, conflictCount: 0, error: 'Cannot synchronize: System is currently offline.' };
    }

    if (this.apiClient instanceof UnconfiguredSyncApiClient) {
      this.isSyncing = false;
      const err = 'Cloud server not configured';
      this.lastErrorMessage = err;
      this.syncState = 'error';
      return { success: false, uploadedCount: 0, downloadedCount: 0, conflictCount: 0, error: err };
    }

    if (this.isSyncing) {
      return { success: false, uploadedCount: 0, downloadedCount: 0, conflictCount: 0, error: 'Synchronization run already in progress.' };
    }

    this.isSyncing = true;
    this.syncState = 'syncing';
    const runId = `srun_${crypto.randomUUID()}`;
    const startTime = new Date().toISOString();
    const schoolId = this.getInstallationSchoolId();
    const deviceConfig = this.getDeviceConfig();

    if (!deviceConfig.deviceId) {
      this.isSyncing = false;
      const err = 'Cannot synchronize: Workstation is not registered (missing device ID).';
      this.lastErrorMessage = err;
      this.syncState = 'error';
      return { success: false, uploadedCount: 0, downloadedCount: 0, conflictCount: 0, error: err };
    }

    let uploadedCount = 0;
    let downloadedCount = 0;
    let conflictCount = 0;
    let syncError: string | null = null;

    try {
      // 1. Verify Connectivity
      const conn = await this.apiClient.verifyConnectivity();
      if (!conn.online) {
        throw new Error('Remote central backend is unreachable.');
      }

      // 2. Upload Phase (Push local outbox events)
      const uploadRes = await this.executeUploadPhase(schoolId, deviceConfig.deviceId);
      uploadedCount = uploadRes.uploadedCount;
      conflictCount += uploadRes.conflictCount;

      // 3. Initial Bootstrap Check: if this workstation has no cursor yet or empty local mirror, hydrate from cloud
      let cursorRow: { last_seq?: number } | undefined;
      try {
        cursorRow = this.db
          .prepare('SELECT last_seq FROM sync_school_cursor WHERE school_id = ?')
          .get(schoolId) as { last_seq?: number } | undefined;
      } catch {}

      let localStudentCount = 0;
      let localClassCount = 0;
      try {
        localStudentCount = (this.db.prepare('SELECT COUNT(*) as c FROM students WHERE school_id = ?').get(schoolId) as any)?.c || 0;
        localClassCount = (this.db.prepare('SELECT COUNT(*) as c FROM classes WHERE school_id = ?').get(schoolId) as any)?.c || 0;
      } catch {}

      let localInvoiceCount = 0;
      let localEmployeeCount = 0;
      try {
        localInvoiceCount = (this.db.prepare('SELECT COUNT(*) as c FROM invoices WHERE school_id = ?').get(schoolId) as any)?.c || 0;
        localEmployeeCount = (this.db.prepare('SELECT COUNT(*) as c FROM employees WHERE school_id = ?').get(schoolId) as any)?.c || 0;
      } catch {}
      if (!cursorRow || localStudentCount === 0 || localClassCount === 0 || localInvoiceCount === 0 || localEmployeeCount === 0) {
        try {
          const restCount = await this.hydrateFromCloudRest(schoolId, deviceConfig.deviceId);
          downloadedCount += restCount;
        } catch (restErr) {
          console.warn('[SyncEngine] REST bootstrap hydration skipped:', restErr);
        }
      }

      // 4. Download Phase (Pull remote server changes)
      const downloadRes = await this.executeDownloadPhase(schoolId, deviceConfig.deviceId);
      downloadedCount += downloadRes.downloadedCount;
      conflictCount += downloadRes.conflictCount;

      this.lastSyncedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
      this.lastErrorMessage = null;
      this.syncState = conflictCount > 0 ? 'conflict' : 'synced';

      // Record successful/partial sync history
      this.recordSyncHistory(runId, schoolId, 'bidirectional', conflictCount > 0 ? 'conflict' : 'success', uploadedCount, downloadedCount, conflictCount, null, startTime);

      return {
        success: true,
        uploadedCount,
        downloadedCount,
        conflictCount,
      };
    } catch (err: any) {
      syncError = err.message || 'Synchronization failed unexpectedly';
      this.lastErrorMessage = syncError;
      this.syncState = 'error';

      this.recordSyncHistory(runId, schoolId, 'bidirectional', 'failed', uploadedCount, downloadedCount, conflictCount, syncError, startTime);

      return {
        success: false,
        uploadedCount,
        downloadedCount,
        conflictCount,
        error: syncError || undefined,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  // --------------------------------------------------------------------------
  // UPLOAD PHASE
  // --------------------------------------------------------------------------
  private async executeUploadPhase(schoolId: string, deviceId: string): Promise<{ uploadedCount: number; conflictCount: number }> {
    const pending = getPendingOutboxEntries(this.batchSize, this.db);
    if (pending.length === 0) {
      return { uploadedCount: 0, conflictCount: 0 };
    }

    const pushEvents: SyncPushEvent[] = pending.map(e => ({
      eventId: e.eventId || `evt_${e.id}`,
      entityType: e.entityType,
      entityId: e.entityId,
      operation: e.operation,
      payload: JSON.parse(e.payloadJson),
      localVersion: e.localVersion || 1,
      idempotencyKey: e.idempotencyKey || `idemp_${e.id}`,
      deviceId: e.deviceId || deviceId,
      schemaVersion: 2,
      dependencyId: e.dependencyId,
      createdAt: e.createdAt,
    }));

    let response: any;
    try {
      try {
        response = await this.apiClient.pushBatch(schoolId, deviceId, pushEvents, this.getAuthToken());
      } catch (authErr: any) {
        if (authErr instanceof SyncHttpError && authErr.status === 401) {
          const refreshed = await CloudTokenManager.refreshAccessToken(this.db);
          if (refreshed) {
            response = await this.apiClient.pushBatch(schoolId, deviceId, pushEvents, refreshed);
          } else {
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }
    } catch (err: any) {
      if (err instanceof SyncHttpError && err.status === 426) {
        this.syncState = 'update_required' as any;
        throw err;
      }

      // Backoff calculation: 5s, 15s, 1m, 5m, 15m; after 20 consecutive failures -> needs_attention
      for (const entry of pending) {
        const nextAttempt = (entry.retryCount || 0) + 1;
        if (nextAttempt >= 20) {
          try {
            this.db.prepare(`
              UPDATE sync_outbox
              SET state = 'needs_attention', attempt_count = ?, last_error = ?, last_http_status = ?
              WHERE id = ?
            `).run(nextAttempt, err.message, err.status || 0, entry.id);
          } catch {}
        } else {
          let delaySeconds = 5;
          if (nextAttempt === 2) delaySeconds = 15;
          else if (nextAttempt === 3) delaySeconds = 60;
          else if (nextAttempt === 4) delaySeconds = 300;
          else if (nextAttempt >= 5) delaySeconds = 900;

          try {
            this.db.prepare(`
              UPDATE sync_outbox
              SET state = 'retrying', attempt_count = ?, next_retry_at = datetime('now', '+' || ? || ' seconds'), last_error = ?, last_http_status = ?
              WHERE id = ?
            `).run(nextAttempt, delaySeconds, err.message, err.status || 0, entry.id);
          } catch {}
        }
      }
      throw err;
    }

    let uploadedCount = 0;
    let conflictCount = 0;

    const ackMap = new Map<string, any>(response.events.map((a: any) => [a.eventId, a]));
    const successfulIds: number[] = [];

    for (const entry of pending) {
      const ack = ackMap.get(entry.eventId);
      if (!ack) {
        continue;
      }

      if (ack.status === 'synced') {
        successfulIds.push(entry.id);
        uploadedCount++;
      } else if (ack.status === 'conflict') {
        conflictCount++;
        try {
          this.db.prepare(`
            UPDATE sync_outbox
            SET state = 'conflict', last_error = ?
            WHERE id = ?
          `).run(ack.errorMessage || 'Server conflict detected', entry.id);
        } catch {}
        if (ack.conflictDetails) {
          this.conflictResolver.recordConflict(
            schoolId,
            entry.entityType,
            entry.entityId,
            JSON.parse(entry.payloadJson),
            ack.conflictDetails.remotePayload,
            ack.conflictDetails.conflictingFields,
            ack.conflictDetails.reason,
            entry.localVersion,
            ack.serverVersion || 1
          );
        }
      } else if (ack.status === 'rejected') {
        // Permanent rejection: transition to 'needs_attention'
        try {
          this.db.prepare(`
            UPDATE sync_outbox
            SET state = 'needs_attention', last_error = ?
            WHERE id = ?
          `).run(ack.errorMessage || 'Event rejected by central server', entry.id);
        } catch {}
      }
    }

    if (successfulIds.length > 0) {
      markEntriesSynced(successfulIds, this.db);
    }

    return { uploadedCount, conflictCount };
  }

  // --------------------------------------------------------------------------
  // DOWNLOAD PHASE
  // --------------------------------------------------------------------------
  private async executeDownloadPhase(schoolId: string, deviceId: string): Promise<{ downloadedCount: number; conflictCount: number }> {
    let lastSeq = 0;
    try {
      const row = this.db.prepare('SELECT last_seq FROM sync_school_cursor WHERE school_id = ?').get(schoolId) as { last_seq?: number } | undefined;
      lastSeq = row?.last_seq || 0;
    } catch {}

    let changes: any[] = [];
    if (this.apiClient.getChanges) {
      try {
        let streamRes;
        try {
          streamRes = await this.apiClient.getChanges(lastSeq, this.batchSize, this.getAuthToken(), deviceId);
        } catch (authErr: any) {
          if (authErr instanceof SyncHttpError && authErr.status === 401) {
            const refreshed = await CloudTokenManager.refreshAccessToken(this.db);
            if (refreshed) {
              streamRes = await this.apiClient.getChanges(lastSeq, this.batchSize, refreshed, deviceId);
            } else {
              throw authErr;
            }
          } else {
            throw authErr;
          }
        }
        changes = streamRes.changes || [];
      } catch (err: any) {
        if (err instanceof SyncHttpError && err.status === 410) {
          // HTTP 410: FULL_RESYNC_REQUIRED
          return this.executeFullResync(schoolId, deviceId);
        }
        if (err instanceof SyncHttpError && err.status === 426) {
          this.syncState = 'update_required' as any;
          throw err;
        }
        throw err;
      }
    } else {
      const cursors = this.getCursors(schoolId);
      const pullRes = await this.apiClient.pullChanges(schoolId, deviceId, cursors, this.batchSize, this.getAuthToken());
      changes = pullRes.changes || [];
    }

    if (changes.length === 0) {
      return { downloadedCount: 0, conflictCount: 0 };
    }

    let downloadedCount = 0;
    let conflictCount = 0;

    // Suppress local outbox recording while applying downloaded remote records
    setApplyingRemoteChanges(true);

    try {
      // 1. Strict sequence order (Requirement 1): NO entity-type sort for changes feed
      const sortedChanges = [...changes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

      for (const item of sortedChanges) {
        const itemSeq = item.seq ?? item.remoteVersion ?? 0;

        // Strict Tenant Isolation Verification
        if (item.payload?.schoolId && item.payload.schoolId !== schoolId) {
          console.error(`Cross-tenant change rejected for entity ${item.entityId} from school ${item.payload.schoolId}`);
          continue;
        }

        // 2. Tombstone check (Requirement 2): Keep a tombstone record per deleted entity with its seq
        // so a late older INSERT cannot bring it back.
        const admNo = item.payload?.admissionNumber || item.payload?.admission_number || item.payload?.admissionNo;
        const tombstone = this.db.prepare(`
          SELECT seq FROM sync_tombstones
          WHERE school_id = ? AND entity_type = ? AND (entity_id = ? OR (? IS NOT NULL AND entity_id = ?))
        `).get(schoolId, item.entityType, item.entityId, admNo, admNo) as { seq: number } | undefined;

        if (tombstone && tombstone.seq >= itemSeq) {
          // A newer or equal delete tombstone exists; late older insert/update cannot resurrect!
          continue;
        }

        // 3. Stored seq check (Requirement 2):
        // Store the last applied seq per entity (entity_sync_versions.remote_version holds the seq).
        // Skip an incoming change when change.seq is not greater than the stored seq.
        const storedRow = this.db.prepare(`
          SELECT remote_version FROM entity_sync_versions
          WHERE school_id = ? AND entity_type = ? AND entity_id = ?
        `).get(schoolId, item.entityType, item.entityId) as { remote_version: number } | undefined;
        const storedSeq = storedRow?.remote_version ?? 0;

        if (storedRow !== undefined && itemSeq <= storedSeq) {
          // Change is older than or equal to stored seq; skip duplicate or older change!
          continue;
        }

        // 4. Apply change in its own transaction/savepoint so errors don't abort remaining batch (Requirement 3)
        try {
          const applySingleChange = this.db.transaction(() => {
            const localRecord = this.fetchLocalEntity(item.entityType, item.entityId, schoolId);
            const localVer = this.getLocalEntityVersion(schoolId, item.entityType, item.entityId);

            const hasLocalPending = Boolean(this.db.prepare(`
              SELECT id FROM sync_outbox
              WHERE school_id = ? AND entity_type = ? AND entity_id = ? AND (state IN ('pending', 'retrying') OR status = 'pending')
            `).get(schoolId, item.entityType, item.entityId));

            const isConcurrentEdit = (hasLocalPending || localVer > 1) && localRecord !== null;

            const conflictCheck = isConcurrentEdit
              ? this.conflictResolver.detectConflict(
                  item.entityType,
                  localRecord,
                  item.payload,
                  localVer,
                  item.remoteVersion || itemSeq
                )
              : { hasConflict: false, canAutoResolve: true, conflictingFields: [] };

            if (conflictCheck.hasConflict) {
              if (conflictCheck.canAutoResolve && conflictCheck.mergedPayload) {
                this.applyRecordToLocalDatabase(item.entityType, item.operation, conflictCheck.mergedPayload, schoolId);
                this.conflictResolver.recordConflict(
                  schoolId,
                  item.entityType,
                  item.entityId,
                  localRecord,
                  item.payload,
                  conflictCheck.conflictingFields,
                  conflictCheck.reason || 'Auto-resolved domain conflict',
                  localVer,
                  itemSeq,
                  conflictCheck.autoResolutionStrategy || 'merged',
                  'System Sync Engine'
                );
                this.updateEntitySyncVersion(schoolId, item.entityType, item.entityId, itemSeq);
                downloadedCount++;
              } else {
                this.conflictResolver.recordConflict(
                  schoolId,
                  item.entityType,
                  item.entityId,
                  localRecord,
                  item.payload,
                  conflictCheck.conflictingFields,
                  conflictCheck.reason || 'Divergent attributes require administrator decision',
                  localVer,
                  itemSeq
                );
                this.updateEntitySyncVersion(schoolId, item.entityType, item.entityId, itemSeq);
                conflictCount++;
              }
            } else {
              if (item.deleted || item.operation === 'DELETE') {
                this.applyRecordToLocalDatabase(item.entityType, 'DELETE', item.payload || { id: item.entityId }, schoolId);
                this.recordTombstone(schoolId, item.entityType, item.entityId, itemSeq, item.payload);
              } else {
                this.applyRecordToLocalDatabase(item.entityType, item.operation || 'INSERT', item.payload, schoolId);
              }
              this.updateEntitySyncVersion(schoolId, item.entityType, item.entityId, itemSeq);
              downloadedCount++;
            }
          });

          applySingleChange();
        } catch (applyErr: any) {
          // Requirement 3: A change that cannot be applied (foreign key, validation) must not block the cursor forever.
          // Put it in the conflict/needs_attention list with the reason, continue with the rest, and show it in the sync status.
          console.warn(`[SyncEngine] Failed to apply change ${item.entityType}:${item.entityId} seq ${itemSeq}:`, applyErr.message);
          conflictCount++;
          try {
            this.conflictResolver.recordConflict(
              schoolId,
              item.entityType,
              item.entityId,
              null,
              item.payload,
              [],
              `Failed to apply remote change: ${applyErr.message}`,
              0,
              itemSeq,
              null,
              'System Sync Engine'
            );
          } catch (cnfErr: any) {
            console.error('[SyncEngine] recordConflict error:', cnfErr.message);
          }
          try {
            this.updateEntitySyncVersion(schoolId, item.entityType, item.entityId, itemSeq);
          } catch {}
        }
      }

      // Advance sequence cursor to maxSeq
      const maxSeq = Math.max(...changes.map((c: any) => c.seq || 0), lastSeq);
      try {
        this.db.prepare(`
          INSERT INTO sync_school_cursor (school_id, last_seq, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(school_id) DO UPDATE SET
            last_seq = excluded.last_seq,
            updated_at = excluded.updated_at
        `).run(schoolId, maxSeq);
      } catch {}

      if (conflictCount > 0) {
        this.syncState = 'conflict';
      }
    } finally {
      setApplyingRemoteChanges(false);
    }

    return { downloadedCount, conflictCount };
  }

  /**
   * Hydrates core local SQLite tables (academic_sessions, classes, sections, students, employees, invoices)
   * directly from the authenticated cloud REST API on initial workstation bootstrap so existing cloud data
   * appears immediately across Dashboard, Students, Fees, Academics, and Staff screens.
   */
  public async hydrateFromCloudRest(schoolId: string, deviceId: string): Promise<number> {
    const baseUrl = this.getApiBaseUrl();
    const token = this.getAuthToken();
    if (!baseUrl || !token) return 0;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Client-Type': 'desktop',
      'X-Client-Version': '1.0.0',
      'X-Outbox-Schema-Version': '2',
      'X-Device-Id': deviceId,
    };

    const fetchList = async (endpoint: string): Promise<any[]> => {
      try {
        let res = await fetch(`${baseUrl}${endpoint}`, { method: 'GET', headers });
        if (res.status === 401) {
          const refreshed = await CloudTokenManager.refreshAccessToken(this.db);
          if (refreshed) {
            headers.Authorization = `Bearer ${refreshed}`;
            res = await fetch(`${baseUrl}${endpoint}`, { method: 'GET', headers });
          }
        }
        if (!res.ok) return [];
        const json: any = await res.json();
        const data = json?.data ?? json;
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.items)) return data.items;
        return [];
      } catch {
        return [];
      }
    };

    const [sessions, classes, sections, students, employees, invoices] = await Promise.all([
      fetchList('/academics/sessions?limit=100'),
      fetchList('/academics/classes?limit=200'),
      fetchList('/academics/sections?limit=500'),
      fetchList('/students?limit=500'),
      fetchList('/employees?limit=500'),
      fetchList('/fees/invoices?limit=500'),
    ]);

    let count = 0;
    setApplyingRemoteChanges(true);
    try {
      const tx = this.db.transaction(() => {
        for (const s of sessions) {
          const id = String(s._id || s.id || '');
          if (!id) continue;
          try {
            this.db.prepare(`
              INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                is_current = excluded.is_current
            `).run(
              id,
              schoolId,
              s.name || '2026-2027',
              String(s.startDate || '2026-04-01').slice(0, 10),
              String(s.endDate || '2027-03-31').slice(0, 10),
              s.isCurrent ? 1 : 0,
            );
            count++;
          } catch {}
        }

        for (let i = 0; i < classes.length; i++) {
          const c = classes[i];
          const id = String(c._id || c.id || '');
          if (!id) continue;
          try {
            this.db.prepare(`
              INSERT INTO classes (id, school_id, name, order_index)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                order_index = excluded.order_index
            `).run(id, schoolId, c.name || `Class ${i + 1}`, Number(c.level ?? i + 1));
            count++;
          } catch {}
        }

        for (const sec of sections) {
          const id = String(sec._id || sec.id || '');
          const classId = String(sec.classId?._id || sec.classId || '');
          if (!id || !classId) continue;
          try {
            this.db.prepare(`
              INSERT INTO sections (id, school_id, class_id, name)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                class_id = excluded.class_id
            `).run(id, schoolId, classId, sec.name || 'A');
            count++;
          } catch {}
        }

        for (const st of students) {
          const id = String(st._id || st.id || '');
          if (!id) continue;
          const fullName = `${st.firstName || ''} ${st.lastName || ''}`.trim() || st.fullName || st.admissionNo || 'Student';
          const primaryGuard = Array.isArray(st.guardians) ? st.guardians[0] : null;
          const fatherName = primaryGuard?.parentId?.name || primaryGuard?.name || st.fatherName || 'Guardian';
          const gender = ['male', 'female', 'other'].includes(String(st.gender || '').toLowerCase())
            ? String(st.gender).toLowerCase()
            : 'male';
          try {
            this.db.prepare(`
              INSERT INTO students (id, school_id, admission_number, full_name, father_name, gender, date_of_birth, phone, address, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                full_name = excluded.full_name,
                father_name = excluded.father_name,
                phone = excluded.phone,
                address = excluded.address,
                status = excluded.status
            `).run(
              id,
              schoolId,
              st.admissionNo || st.admissionNumber || id.slice(-8),
              fullName,
              fatherName,
              gender,
              st.dateOfBirth ? String(st.dateOfBirth).slice(0, 10) : null,
              st.phone || null,
              st.address || null,
              st.status || 'active',
            );
            count++;
          } catch {}
        }

        for (const emp of employees) {
          const id = String(emp._id || emp.id || '');
          if (!id) continue;
          const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.fullName || 'Staff';
          try {
            this.db.prepare(`
              INSERT INTO employees (id, school_id, employee_code, full_name, designation, phone, email, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                full_name = excluded.full_name,
                designation = excluded.designation,
                phone = excluded.phone,
                status = excluded.status
            `).run(
              id,
              schoolId,
              emp.employeeNo || id.slice(-6),
              fullName,
              emp.designation || 'Teacher',
              emp.phone || null,
              emp.email || null,
              emp.status || 'active',
            );
            count++;
          } catch {}
        }

        for (const inv of invoices) {
          const id = String(inv._id || inv.id || '');
          const studentId = String(inv.studentId?._id || inv.studentId || '');
          if (!id || !studentId) continue;
          try {
            const defaultSessionId =
              String(inv.sessionId?._id || inv.sessionId || '') ||
              (sessions[0] ? String(sessions[0]._id || sessions[0].id || '') : '');
            if (!defaultSessionId) continue;
            const mappedStatus =
              inv.status === 'partial' ? 'partially_paid' :
              ['unpaid', 'partially_paid', 'paid', 'overdue'].includes(inv.status) ? inv.status : 'unpaid';
            this.db.prepare(`
              INSERT INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, previous_dues, paid_amount, balance, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                amount = excluded.amount,
                paid_amount = excluded.paid_amount,
                balance = excluded.balance,
                status = excluded.status
            `).run(
              id,
              schoolId,
              inv.invoiceNo || id.slice(-8),
              studentId,
              defaultSessionId,
              inv.period || '2026-11',
              inv.dueDate ? String(inv.dueDate).slice(0, 10) : '2026-11-30',
              Number(inv.total || 0),
              Number(inv.paid || 0),
              Number(inv.balance || 0),
              mappedStatus,
            );
            count++;
          } catch {}
        }
      });
      tx();
    } finally {
      setApplyingRemoteChanges(false);
    }

    return count;
  }

  public async executeFullResync(schoolId: string, deviceId: string): Promise<{ downloadedCount: number; conflictCount: number }> {
    // 1. Flush pending outbox changes first
    await this.executeUploadPhase(schoolId, deviceId);

    // 2. Start consistent snapshot for all role-allowed offline-readable entities
    const defaultEntities = [
      'STUDENT', 'ATTENDANCE', 'GUARDIAN', 'CLASS', 'SECTION',
      'SESSION', 'SUBJECT', 'TIMETABLE', 'EXAM', 'FEE_STRUCTURE', 'INVOICE',
    ];
    const snap: any = await this.apiClient.startSnapshot(defaultEntities, this.getAuthToken(), deviceId);
    const entitiesToFetch: string[] = Array.isArray(snap?.entities) && snap.entities.length > 0
      ? snap.entities
      : ['STUDENT', 'ATTENDANCE'];
    const snapshotSeq = typeof snap?.seq === 'number' ? snap.seq : 0;
    let downloadedCount = 0;

    setApplyingRemoteChanges(true);
    try {
      for (const entity of entitiesToFetch) {
        let cursor: string | null = null;
        let hasMore = true;
        while (hasMore) {
          const page = await this.apiClient.getSnapshotPage(snap.snapshotId, entity, cursor, 100, this.getAuthToken(), deviceId);
          const runTx = this.db.transaction(() => {
            for (const item of page.items) {
              if (entity === 'STUDENT' || entity === 'ATTENDANCE' || entity === 'INVOICE') {
                try {
                  this.applyRecordToLocalDatabase(entity, 'INSERT', item, schoolId);
                } catch {}
              }
              try {
                const entityId = String(item.id || item._id || '');
                if (entityId) {
                  this.db.prepare(`
                    INSERT INTO offline_mirror_cache (school_id, entity_type, entity_id, payload_json, seq, updated_at)
                    VALUES (?, ?, ?, ?, ?, datetime('now'))
                    ON CONFLICT(school_id, entity_type, entity_id) DO UPDATE SET
                      payload_json = excluded.payload_json,
                      seq = excluded.seq,
                      updated_at = datetime('now')
                  `).run(schoolId, entity, entityId, JSON.stringify(item), snapshotSeq);
                }
              } catch {}
              downloadedCount++;
            }
          });
          runTx();
          cursor = page.nextCursor;
          hasMore = page.hasMore && Boolean(cursor);
        }
      }

      // 3. Advance cursor to snapshot seq only after all batches commit
      try {
        this.db.prepare(`
          INSERT INTO sync_school_cursor (school_id, last_seq, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(school_id) DO UPDATE SET
            last_seq = excluded.last_seq,
            updated_at = excluded.updated_at
        `).run(schoolId, snapshotSeq);
      } catch {}

      return { downloadedCount, conflictCount: 0 };
    } finally {
      setApplyingRemoteChanges(false);
    }
  }

  // --------------------------------------------------------------------------
  // DATABASE HELPER METHODS
  // --------------------------------------------------------------------------
  private fetchLocalEntity(entityType: string, entityId: string, schoolId: string): any {
    try {
      switch (entityType) {
        case 'STUDENT':
          return this.studentRepo.findById(schoolId, entityId);
        case 'STUDENT_GUARDIAN':
          return this.guardianRepo.getActiveGuardian(schoolId, entityId);
        case 'INVOICE':
          return this.db.prepare('SELECT * FROM invoices WHERE school_id = ? AND id = ?').get(schoolId, entityId);
        case 'EMPLOYEE':
          return this.employeeRepo.findById(schoolId, entityId);
        case 'FEE_STRUCTURE':
          return this.db.prepare('SELECT * FROM fee_structures WHERE school_id = ? AND id = ?').get(schoolId, entityId);
        case 'SCHOOL_SETTINGS':
          return this.settingsRepo.getSchoolSettings(schoolId);
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  private recordTombstone(schoolId: string, entityType: string, entityId: string, seq: number, payload?: any) {
    try {
      this.db.prepare(`
        INSERT INTO sync_tombstones (id, school_id, entity_type, entity_id, seq, deleted_at, reason)
        VALUES (?, ?, ?, ?, ?, datetime('now'), 'Remote delete tombstone')
        ON CONFLICT(id) DO UPDATE SET
          seq = CASE WHEN excluded.seq > sync_tombstones.seq THEN excluded.seq ELSE sync_tombstones.seq END,
          deleted_at = excluded.deleted_at
      `).run(`tb_${schoolId}_${entityType}_${entityId}`, schoolId, entityType, entityId, seq);
    } catch {}

    if (entityType === 'STUDENT' && payload) {
      const altId = payload.id || payload._id || payload.studentId;
      const admNo = payload.admissionNumber || payload.admission_number || payload.admissionNo;
      if (altId && altId !== entityId) {
        try {
          this.db.prepare(`
            INSERT INTO sync_tombstones (id, school_id, entity_type, entity_id, seq, deleted_at, reason)
            VALUES (?, ?, ?, ?, ?, datetime('now'), 'Remote delete tombstone')
            ON CONFLICT(id) DO UPDATE SET
              seq = CASE WHEN excluded.seq > sync_tombstones.seq THEN excluded.seq ELSE sync_tombstones.seq END,
              deleted_at = excluded.deleted_at
          `).run(`tb_${schoolId}_${entityType}_${altId}`, schoolId, entityType, altId, seq);
        } catch {}
      }
      if (admNo && admNo !== entityId) {
        try {
          this.db.prepare(`
            INSERT INTO sync_tombstones (id, school_id, entity_type, entity_id, seq, deleted_at, reason)
            VALUES (?, ?, ?, ?, ?, datetime('now'), 'Remote delete tombstone')
            ON CONFLICT(id) DO UPDATE SET
              seq = CASE WHEN excluded.seq > sync_tombstones.seq THEN excluded.seq ELSE sync_tombstones.seq END,
              deleted_at = excluded.deleted_at
          `).run(`tb_${schoolId}_${entityType}_${admNo}`, schoolId, entityType, admNo, seq);
        } catch {}
      }
    }
  }

  private applyRecordToLocalDatabase(entityType: string, operation: 'INSERT' | 'UPDATE' | 'DELETE', payload: any, schoolId: string) {
    if (operation === 'DELETE') {
      if (entityType === 'STUDENT') {
        const studentId = (payload.id || payload._id || payload.studentId)?.toString();
        const admissionNo = payload.admissionNumber || payload.admission_number || payload.admissionNo;
        let resolvedStudentId = studentId;
        if (!resolvedStudentId && admissionNo) {
          const row = this.db.prepare('SELECT id FROM students WHERE admission_number = ?').get(admissionNo) as { id: string } | undefined;
          resolvedStudentId = row?.id;
        }

        if (resolvedStudentId || admissionNo) {
          // Requirement 4: Delete in child-to-parent order to satisfy FOREIGN KEY RESTRICT in SQLite
          // Use sync_apply_context flag to permit server tombstone cascade past financial triggers
          try {
            this.db.prepare('UPDATE sync_apply_context SET applying_server_tombstone = 1 WHERE id = 1').run();

            if (resolvedStudentId) {
              this.db.prepare('DELETE FROM student_guardians WHERE student_id = ?').run(resolvedStudentId);
              this.db.prepare('DELETE FROM fee_concessions WHERE student_id = ?').run(resolvedStudentId);
              this.db.prepare('DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE student_id = ?)').run(resolvedStudentId);
              this.db.prepare('DELETE FROM invoices WHERE student_id = ?').run(resolvedStudentId);
              this.db.prepare('DELETE FROM attendance WHERE student_id = ?').run(resolvedStudentId);
              this.db.prepare('DELETE FROM student_marks WHERE student_id = ?').run(resolvedStudentId);
              this.db.prepare('DELETE FROM student_enrollments WHERE student_id = ?').run(resolvedStudentId);
              this.db.prepare('DELETE FROM students WHERE id = ?').run(resolvedStudentId);
            } else if (admissionNo) {
              this.db.prepare('DELETE FROM student_guardians WHERE student_id IN (SELECT id FROM students WHERE admission_number = ?)').run(admissionNo);
              this.db.prepare('DELETE FROM fee_concessions WHERE student_id IN (SELECT id FROM students WHERE admission_number = ?)').run(admissionNo);
              this.db.prepare('DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE student_id IN (SELECT id FROM students WHERE admission_number = ?))').run(admissionNo);
              this.db.prepare('DELETE FROM invoices WHERE student_id IN (SELECT id FROM students WHERE admission_number = ?)').run(admissionNo);
              this.db.prepare('DELETE FROM attendance WHERE student_id IN (SELECT id FROM students WHERE admission_number = ?)').run(admissionNo);
              this.db.prepare('DELETE FROM student_marks WHERE student_id IN (SELECT id FROM students WHERE admission_number = ?)').run(admissionNo);
              this.db.prepare('DELETE FROM student_enrollments WHERE student_id IN (SELECT id FROM students WHERE admission_number = ?)').run(admissionNo);
              this.db.prepare('DELETE FROM students WHERE admission_number = ?').run(admissionNo);
            }
          } finally {
            this.db.prepare('UPDATE sync_apply_context SET applying_server_tombstone = 0 WHERE id = 1').run();
          }
        }
        return;
      }
      if (entityType === 'ATTENDANCE') {
        const attId = payload.id || payload._id || payload.attendanceId;
        if (attId) {
          try { this.db.prepare('DELETE FROM attendance WHERE id = ?').run(attId); } catch {}
        }
        return;
      }
      // Historical data protection: reject deletion of financial or academic historical records
      if (['PAYMENT', 'INVOICE', 'EXAM'].includes(entityType)) {
        return;
      }
      return;
    }

    const now = new Date().toISOString();
    switch (entityType) {
      case 'STUDENT': {
        const admissionNo = payload.admissionNumber || payload.admission_number || payload.admissionNo;
        const existing = this.studentRepo.findById(schoolId, payload.id) ||
          (admissionNo ? (this.db.prepare('SELECT * FROM students WHERE school_id = ? AND admission_number = ?').get(schoolId, admissionNo) as any) : null);
        const fatherName = payload.fatherName || payload.father_name || existing?.fatherName || existing?.father_name || 'Not Specified';
        if (existing) {
          this.db.prepare(`
            UPDATE students
            SET full_name = ?, father_name = ?, phone = ?, address = ?, status = ?, updated_at = ?
            WHERE school_id = ? AND id = ?
          `).run(payload.fullName || payload.full_name, fatherName, payload.phone || null, payload.address || null, payload.status || 'active', now, schoolId, existing.id);
        } else {
          const admNo = payload.admissionNumber || payload.admission_number || payload.admissionNo || payload.id || `ADM-${Date.now()}`;
          this.studentRepo.createStudent({
            id: payload.id || `std_${Date.now()}`,
            schoolId,
            admissionNumber: admNo,
            fullName: payload.fullName || payload.full_name || payload.name || 'Student',
            fatherName,
            gender: payload.gender || null,
            dateOfBirth: payload.dateOfBirth || payload.date_of_birth || null,
            cnicBform: payload.cnicBform || payload.cnic_bform || null,
            phone: payload.phone || null,
            address: payload.address || null,
            admissionDate: payload.admissionDate || payload.admission_date || now.split('T')[0],
            previousSchool: payload.previousSchool || payload.previous_school || null,
            adminNotes: payload.adminNotes || payload.admin_notes || null,
            status: payload.status || 'active',
          });
        }
        break;
      }

      case 'STUDENT_GUARDIAN': {
        const gStudentId = payload.studentId || payload.student_id;
        const gStudentExists = this.db.prepare('SELECT id FROM students WHERE school_id = ? AND id = ?').get(schoolId, gStudentId);
        if (!gStudentExists) {
          this.db.prepare(`
            INSERT OR IGNORE INTO students (id, school_id, admission_number, full_name, father_name, status)
            VALUES (?, ?, ?, 'Sync Placeholder', 'Not Specified', 'active')
          `).run(gStudentId, schoolId, `ADM-${gStudentId}`);
        }
        // Enforce single active guardian invariant
        if (payload.isActive || payload.is_active) {
          this.db.prepare('UPDATE student_guardians SET is_active = 0 WHERE school_id = ? AND student_id = ?').run(schoolId, payload.studentId || payload.student_id);
        }
        this.db.prepare(`
          INSERT INTO student_guardians (
            id, school_id, student_id, full_name, relationship, cnic, phone, email, occupation, address, is_active, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            full_name = excluded.full_name,
            phone = excluded.phone,
            is_active = excluded.is_active
        `).run(
          payload.id || `gdn_${payload.studentId}_${Date.now()}`,
          schoolId,
          payload.studentId || payload.student_id,
          payload.fullName || payload.full_name,
          payload.relationship || 'guardian',
          payload.cnic || null,
          payload.phone,
          payload.email || null,
          payload.occupation || null,
          payload.address || null,
          (payload.isActive !== false && payload.is_active !== 0) ? 1 : 0,
          now
        );
        break;
      }

      case 'ATTENDANCE': {
        const studentId = payload.studentId || payload.student_id;
        if (!studentId) return;
        let sessionId = payload.sessionId || payload.session_id;
        let classId = payload.classId || payload.class_id;
        let sectionId = payload.sectionId || payload.section_id;

        if (!sessionId || !classId || !sectionId) {
          const enr = this.db.prepare('SELECT session_id, class_id, section_id FROM student_enrollments WHERE school_id = ? AND student_id = ? ORDER BY id DESC LIMIT 1').get(schoolId, studentId) as any;
          if (enr) {
            sessionId = sessionId || enr.session_id;
            classId = classId || enr.class_id;
            sectionId = sectionId || enr.section_id;
          }
        }
        if (!sessionId) {
          const sess = this.db.prepare('SELECT id FROM academic_sessions WHERE school_id = ? ORDER BY is_current DESC LIMIT 1').get(schoolId) as any;
          sessionId = sess?.id || 'sess_default';
        }
        if (!classId) {
          const cls = this.db.prepare('SELECT id FROM classes WHERE school_id = ? LIMIT 1').get(schoolId) as any;
          classId = cls?.id || 'cls_default';
        }
        if (!sectionId) {
          const sec = this.db.prepare('SELECT id FROM sections WHERE school_id = ? LIMIT 1').get(schoolId) as any;
          sectionId = sec?.id || 'sec_default';
        }

        const sessExists = this.db.prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND id = ?').get(schoolId, sessionId);
        if (!sessExists) {
          this.db.prepare(`
            INSERT OR IGNORE INTO academic_sessions (id, school_id, name, start_date, end_date, is_current)
            VALUES (?, ?, 'Current Session', '2026-04-01', '2027-03-31', 1)
          `).run(sessionId, schoolId);
        }
        const attStudentExists = this.db.prepare('SELECT id FROM students WHERE school_id = ? AND id = ?').get(schoolId, studentId);
        if (!attStudentExists) {
          this.db.prepare(`
            INSERT OR IGNORE INTO students (id, school_id, admission_number, full_name, father_name, status)
            VALUES (?, ?, ?, 'Sync Placeholder', 'Not Specified', 'active')
          `).run(studentId, schoolId, `ADM-${studentId}`);
        }

        this.db.prepare(`
          INSERT INTO attendance (id, school_id, student_id, session_id, class_id, section_id, date, status, remarks, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(student_id, date) DO UPDATE SET
            status = excluded.status,
            remarks = excluded.remarks
        `).run(
          payload.id || `att_${studentId}_${payload.date}`,
          schoolId,
          studentId,
          sessionId,
          classId,
          sectionId,
          payload.date,
          payload.status,
          payload.remarks || null,
          now
        );
        break;
      }

      case 'FEE_STRUCTURE': {
        this.db.prepare(`
          INSERT INTO fee_structures (id, school_id, session_id, class_id, name, tuition_fee, exam_fee, misc_fee, due_day)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            tuition_fee = excluded.tuition_fee,
            exam_fee = excluded.exam_fee,
            misc_fee = excluded.misc_fee,
            due_day = excluded.due_day
        `).run(
          payload.id,
          schoolId,
          payload.sessionId || payload.session_id,
          payload.classId || payload.class_id,
          payload.name,
          payload.tuitionFee || payload.tuition_fee,
          payload.examFee || payload.exam_fee || 0,
          payload.miscFee || payload.misc_fee || 0,
          payload.dueDay || payload.due_day || 10
        );
        break;
      }

      case 'INVOICE': {
        const invId = (payload.id || payload._id)?.toString();
        if (!invId) return;
        const studentId = (payload.studentId || payload.student_id)?.toString();
        const challanNo = payload.challan_number || payload.invoiceNo || payload.challanNumber || `INV-${invId}`;
        const totalAmount = payload.total ?? payload.amount ?? 0;
        const paidAmount = payload.paid ?? payload.paid_amount ?? 0;
        const balance = payload.balance ?? (totalAmount - paidAmount);
        let status = payload.status || 'unpaid';
        if (status === 'partial') status = 'partially_paid';

        if (studentId) {
          const stdExists = this.db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
          if (!stdExists) {
            this.db.prepare(`
              INSERT OR IGNORE INTO students (id, school_id, admission_number, full_name, father_name, status)
              VALUES (?, ?, ?, 'Sync Student', 'Not Specified', 'active')
            `).run(studentId, schoolId, `ADM-${studentId}`);
          }
        }

        let sessionId = payload.sessionId || payload.session_id;
        if (!sessionId) {
          const sess = this.db.prepare('SELECT id FROM academic_sessions WHERE school_id = ? ORDER BY is_current DESC LIMIT 1').get(schoolId) as any;
          sessionId = sess?.id || 'sess_default';
        }
        const sessExists = this.db.prepare('SELECT id FROM academic_sessions WHERE school_id = ? AND id = ?').get(schoolId, sessionId);
        if (!sessExists) {
          this.db.prepare(`
            INSERT OR IGNORE INTO academic_sessions (id, school_id, name, start_date, end_date, is_current)
            VALUES (?, ?, 'Current Session', '2026-04-01', '2027-03-31', 1)
          `).run(sessionId, schoolId);
        }

        const existing = this.db.prepare('SELECT id FROM invoices WHERE id = ?').get(invId);
        if (existing) {
          this.db.prepare(`
            UPDATE invoices SET
              paid_amount = ?,
              balance = ?,
              status = ?,
              updated_at = ?
            WHERE id = ?
          `).run(paidAmount, balance, status, now, invId);
        } else {
          let sessionId = payload.sessionId || payload.session_id;
          if (!sessionId) {
            const sess = this.db.prepare('SELECT id FROM academic_sessions WHERE school_id = ? ORDER BY is_current DESC LIMIT 1').get(schoolId) as any;
            sessionId = sess?.id || 'sess_default';
          }
          this.db.prepare(`
            INSERT INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, paid_amount, balance, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              paid_amount = excluded.paid_amount,
              balance = excluded.balance,
              status = excluded.status,
              updated_at = excluded.updated_at
          `).run(
            invId,
            schoolId,
            challanNo,
            studentId || 'std_default',
            sessionId,
            payload.month || payload.period || new Date().toISOString().slice(0, 7),
            payload.dueDate || payload.due_date || new Date().toISOString().slice(0, 10),
            totalAmount,
            paidAmount,
            balance,
            status,
            now,
            now
          );
        }
        break;
      }

      case 'PAYMENT': {
        const payId = (payload.id || payload._id)?.toString();
        if (!payId) return;
        const invId = (payload.invoiceId || payload.invoice_id)?.toString();
        const receiptNo = payload.receipt_number || payload.receiptNo || `RCP-${payId}`;
        const amount = payload.amount || 0;
        const method = payload.method || payload.payment_method || 'cash';
        const receivedAt = payload.receivedAt || payload.payment_date || payload.createdAt || now;

        if (invId) {
          const invExists = this.db.prepare('SELECT id FROM invoices WHERE id = ?').get(invId);
          if (!invExists) {
            const sess = this.db.prepare('SELECT id FROM academic_sessions WHERE school_id = ? ORDER BY is_current DESC LIMIT 1').get(schoolId) as any;
            const sessId = sess?.id || 'sess_default';
            const std = this.db.prepare('SELECT id FROM students WHERE school_id = ? LIMIT 1').get(schoolId) as any;
            const stdId = std?.id || 'std_default';
            this.db.prepare(`
              INSERT OR IGNORE INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, paid_amount, balance, status)
              VALUES (?, ?, ?, ?, ?, '2026-11', '2026-11-30', ?, ?, 0, 'paid')
            `).run(invId, schoolId, `INV-${invId}`, stdId, sessId, amount, amount);
          }
        }

        this.db.prepare(`
          INSERT INTO payments (id, school_id, invoice_id, receipt_number, amount, payment_date, payment_method, collector, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            amount = excluded.amount,
            payment_date = excluded.payment_date,
            payment_method = excluded.payment_method
        `).run(
          payId,
          schoolId,
          invId,
          receiptNo,
          amount,
          receivedAt,
          method,
          payload.receivedByName || payload.collector || 'Admin',
          now
        );
        break;
      }

      case 'SCHOOL_SETTINGS': {
        this.settingsRepo.updateSchoolSettings(schoolId, payload);
        break;
      }
    }
  }

  private getInstallationSchoolId(): string {
    try {
      const row = this.db.prepare('SELECT school_id FROM installation_config LIMIT 1').get() as { school_id?: string } | undefined;
      return row?.school_id || 'school_default';
    } catch {
      return 'school_default';
    }
  }

  public getDeviceConfig(): { deviceId: string; deviceName: string } {
    try {
      const row = this.db.prepare('SELECT device_id, device_name FROM sync_device_config LIMIT 1').get() as any;
      if (row?.device_id) {
        return { deviceId: row.device_id, deviceName: row.device_name || 'Primary-Workstation' };
      }
      const inst = this.db.prepare('SELECT installation_id, school_code FROM installation_config LIMIT 1').get() as any;
      if (inst?.installation_id) {
        return { deviceId: `dev_${inst.installation_id}`, deviceName: inst.school_code || 'Primary-Workstation' };
      }
    } catch {}
    return { deviceId: 'dev_workstation_local', deviceName: 'Primary-Workstation' };
  }

  private getApiBaseUrl(): string {
    const cfg = DeploymentConfigService.resolveConfig(this.db);
    return cfg.cloudApiBaseUrl || '';
  }

  public getAuthToken(): string | undefined {
    try {
      const row = this.db.prepare('SELECT auth_token_encrypted FROM sync_device_config LIMIT 1').get() as { auth_token_encrypted?: string } | undefined;
      if (row?.auth_token_encrypted) {
        try {
          return CredentialVault.decryptSecret(row.auth_token_encrypted);
        } catch {
          return row.auth_token_encrypted;
        }
      }
    } catch {}
    return undefined;
  }

  private getCursors(schoolId: string): Record<string, string> {
    const rows = this.db.prepare('SELECT entity_type, cursor_token FROM sync_cursors WHERE school_id = ?').all(schoolId) as any[];
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.entity_type] = r.cursor_token;
    }
    return result;
  }

  private saveCursors(schoolId: string, cursors: Record<string, string>) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO sync_cursors (school_id, entity_type, cursor_token, last_synced_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(school_id, entity_type) DO UPDATE SET
        cursor_token = excluded.cursor_token,
        last_synced_at = excluded.last_synced_at
    `);
    for (const [entityType, token] of Object.entries(cursors)) {
      stmt.run(schoolId, entityType, token, now);
    }
  }

  private getLocalEntityVersion(schoolId: string, entityType: string, entityId: string): number {
    const row = this.db.prepare(`
      SELECT local_version FROM entity_sync_versions
      WHERE school_id = ? AND entity_type = ? AND entity_id = ?
    `).get(schoolId, entityType, entityId) as { local_version: number } | undefined;
    return row?.local_version || 1;
  }

  private updateEntitySyncVersion(schoolId: string, entityType: string, entityId: string, remoteVersion: number) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO entity_sync_versions (school_id, entity_type, entity_id, local_version, remote_version, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(school_id, entity_type, entity_id) DO UPDATE SET
        remote_version = excluded.remote_version,
        updated_at = excluded.updated_at
    `).run(schoolId, entityType, entityId, remoteVersion, now);
  }

  private recordSyncHistory(
    runId: string,
    schoolId: string,
    direction: 'upload' | 'download' | 'bidirectional',
    status: 'success' | 'partial' | 'failed' | 'conflict',
    uploadedCount: number,
    downloadedCount: number,
    conflictCount: number,
    errorMessage: string | null,
    startedAt: string
  ) {
    try {
      this.db.prepare(`
        INSERT INTO sync_history (
          id, school_id, run_id, direction, status, uploaded_count, downloaded_count,
          conflict_count, error_message, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `shist_${crypto.randomUUID()}`,
        schoolId,
        runId,
        direction,
        status,
        uploadedCount,
        downloadedCount,
        conflictCount,
        errorMessage,
        startedAt,
        new Date().toISOString()
      );
    } catch {}
  }

  public getSyncHistory(schoolId: string, limit: number = 20): any[] {
    return this.db.prepare(`
      SELECT * FROM sync_history WHERE school_id = ? ORDER BY started_at DESC LIMIT ?
    `).all(schoolId, limit);
  }
}
