import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { ISyncApiClient, SyncPushEvent, SyncHttpError } from './sync-api-client';
import { CredentialVault } from '../security/credential-vault';
import { CloudTokenManager } from '../security/cloud-token-manager';
import { setApplyingRemoteChanges } from './change-tracker';

export interface DispatchMutationOptions<T> {
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
  schoolId: string;
  dependencyKey?: string;
  baseVersion?: number;
  executeLocal: (isOnlineConfirmed: boolean) => T;
  isOnline?: boolean;
  apiClient?: ISyncApiClient;
}

export interface DispatchMutationResult<T> {
  result: T;
  syncStatus: 'confirmed' | 'pending';
  serverVersion?: number;
  operationId?: string;
  idempotencyKey?: string;
}

/**
 * WriteCoordinator: Authoritative Single Write Path for all desktop mutations.
 * Binding rules (docs/ARCHITECTURE-ADDENDUM.md Section 2):
 * 1. Generates operationId and idempotencyKey ONCE.
 * 2. Inserts outbox row inside SQLite transaction BEFORE any network call.
 * 3. Provisional local changes permitted ONLY for ATTENDANCE and PAYMENT.
 * 4. For all other entity types, applies server result locally only upon confirmation.
 * 5. On process restart, rows left in 'processing' become 'retrying' with the same idempotency key.
 */
export class WriteCoordinator {
  constructor(private db: any, private apiClient?: ISyncApiClient) {
    this.recoverInFlightOperations();
  }

  /**
   * Resets any dangling in-flight rows from previous process crashes to 'retrying',
   * preserving the exact same idempotency key and operation payload.
   */
  public recoverInFlightOperations(): void {
    try {
      this.db.prepare(`
        UPDATE sync_outbox
        SET state = 'retrying',
            next_retry_at = datetime('now')
        WHERE state = 'processing'
      `).run();
    } catch {
      // Table may not yet exist before migration 011 runs
    }
  }

  public async dispatchMutation<T>(options: DispatchMutationOptions<T>): Promise<DispatchMutationResult<T>> {
    const isProvisionalAllowed = options.entityType.startsWith('ATTENDANCE') || options.entityType.startsWith('PAYMENT');

    // 1. Generate unique identifiers once
    const operationId = `op_${crypto.randomUUID()}`;
    const idempotencyKey = `idemp_${options.entityType}_${options.entityId}_${crypto.randomUUID()}`;
    const baseVersion = options.baseVersion || 1;

    let targetSchoolId = options.schoolId;
    try {
      const inst = this.db.prepare('SELECT school_id FROM installation_config LIMIT 1').get() as { school_id?: string } | undefined;
      if (inst?.school_id) targetSchoolId = inst.school_id;
    } catch {}

    let localResult: T | undefined;

    // 2. Insert outbox row (+ optional provisional local write) inside SQLite transaction
    const insertTx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO sync_outbox (
          operation_id,
          idempotency_key,
          school_id,
          entity_type,
          entity_id,
          dependency_key,
          base_version,
          payload_json,
          state,
          attempt_count,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now'))
      `).run(
        operationId,
        idempotencyKey,
        targetSchoolId,
        options.entityType,
        options.entityId,
        options.dependencyKey || null,
        baseVersion,
        JSON.stringify(options.payload),
      );

      // Provisional write permitted for ATTENDANCE and PAYMENT, or when explicitly running offline
      if (isProvisionalAllowed || options.isOnline === false) {
        try {
          setApplyingRemoteChanges(true);
          localResult = options.executeLocal(false);
        } finally {
          setApplyingRemoteChanges(false);
        }
      }
    });

    insertTx();

    // 3. Online Push Attempt
    const isOnline = options.isOnline !== undefined ? options.isOnline : true;
    const deviceId = this.getDeviceId();
    const authToken = this.getAuthToken();

    if (isOnline && deviceId && this.apiClient) {
      try {
        // Mark row processing
        this.db.prepare(`
          UPDATE sync_outbox
          SET state = 'processing'
          WHERE operation_id = ?
        `).run(operationId);

        const pushEvent: SyncPushEvent = {
          eventId: operationId,
          entityType: options.entityType,
          entityId: options.entityId,
          operation: options.operation,
          payload: options.payload,
          localVersion: baseVersion,
          idempotencyKey,
          deviceId,
          schemaVersion: 2,
          dependencyId: options.dependencyKey || null,
          createdAt: new Date().toISOString(),
        };

        let pushRes;
        try {
          pushRes = await this.apiClient.pushBatch(targetSchoolId, deviceId, [pushEvent], authToken);
        } catch (pushErr: any) {
          if (pushErr instanceof SyncHttpError && pushErr.status === 401) {
            const refreshed = await CloudTokenManager.refreshAccessToken(this.db);
            if (refreshed) {
              pushRes = await this.apiClient.pushBatch(targetSchoolId, deviceId, [pushEvent], refreshed);
            } else {
              throw pushErr;
            }
          } else {
            throw pushErr;
          }
        }

        if (pushRes && pushRes.events && pushRes.events.length > 0) {
          const ack = pushRes.events[0];

          if (ack.status === 'synced') {
            const confirmTx = this.db.transaction(() => {
              // Non-provisional entities apply local mutation now upon confirmed server result
              if (!isProvisionalAllowed) {
                try {
                  setApplyingRemoteChanges(true);
                  localResult = options.executeLocal(true);
                } finally {
                  setApplyingRemoteChanges(false);
                }
              }

              this.updateEntitySyncVersion(
                targetSchoolId,
                options.entityType,
                options.entityId,
                ack.serverVersion || 1,
              );

              this.db.prepare(`
                UPDATE sync_outbox
                SET state = 'synced',
                    status = 'synced',
                    synced_at = datetime('now'),
                    last_error = NULL
                WHERE operation_id = ?
              `).run(operationId);
            });

            confirmTx();

            return {
              result: localResult!,
              syncStatus: 'confirmed',
              serverVersion: ack.serverVersion || 1,
              operationId,
              idempotencyKey,
            };
          }

          if (ack.status === 'rejected') {
            this.db.prepare(`
              UPDATE sync_outbox
              SET state = 'needs_attention',
                  status = 'needs_attention',
                  last_error = ?
              WHERE operation_id = ?
            `).run(ack.errorMessage || 'Server rejected mutation', operationId);

            throw new Error(ack.errorMessage || `Server rejected ${options.entityType} mutation.`);
          }

          if (ack.status === 'conflict') {
            this.db.prepare(`
              UPDATE sync_outbox
              SET state = 'conflict',
                  status = 'conflict',
                  last_error = ?
              WHERE operation_id = ?
            `).run(ack.errorMessage || 'Conflict detected', operationId);

            throw new Error(ack.errorMessage || `Conflict detected on cloud server for ${options.entityType}.`);
          }
        }
      } catch (err: any) {
        const isValidationOrConflict =
          (err instanceof SyncHttpError && (err.status === 422 || err.status === 409 || err.status === 400)) ||
          /validation|rejected|duplicate|conflict/i.test(err.message || '');

        if (isValidationOrConflict) {
          this.db.prepare(`
            UPDATE sync_outbox
            SET state = 'needs_attention',
                status = 'needs_attention',
                last_error = ?,
                last_http_status = ?
            WHERE operation_id = ?
          `).run(err.message, err.status || 422, operationId);
          throw err;
        }

        // Transient network error or 500: mark retrying with initial 5s backoff
        this.db.prepare(`
          UPDATE sync_outbox
          SET state = 'retrying',
              status = 'retrying',
              attempt_count = attempt_count + 1,
              next_retry_at = datetime('now', '+5 seconds'),
              last_error = ?,
              last_http_status = ?
          WHERE operation_id = ?
        `).run(err.message || 'Network error', err.status || 0, operationId);

        if (!isProvisionalAllowed && options.isOnline !== false) {
          return {
            result: localResult as any,
            syncStatus: 'pending',
            operationId,
            idempotencyKey,
          };
        }
      }
    }

    return {
      result: localResult!,
      syncStatus: 'pending',
      operationId,
      idempotencyKey,
    };
  }

  public getDeviceId(): string {
    try {
      const row = this.db.prepare('SELECT device_id FROM sync_device_config LIMIT 1').get() as { device_id?: string } | undefined;
      if (row?.device_id) return row.device_id;
      const inst = this.db.prepare('SELECT installation_id FROM installation_config LIMIT 1').get() as { installation_id?: string } | undefined;
      if (inst?.installation_id) return `dev_${inst.installation_id}`;
      return 'dev_workstation_local';
    } catch {
      return 'dev_workstation_local';
    }
  }

  private getAuthToken(): string | undefined {
    try {
      const row = this.db.prepare('SELECT auth_token_encrypted FROM sync_device_config LIMIT 1').get() as { auth_token_encrypted?: string } | undefined;
      if (!row?.auth_token_encrypted) return undefined;
      if (row.auth_token_encrypted.startsWith('dpapi:') || row.auth_token_encrypted.startsWith('aes-gcm:')) {
        return CredentialVault.decryptSecret(row.auth_token_encrypted);
      }
      return row.auth_token_encrypted;
    } catch {
      return undefined;
    }
  }

  private updateEntitySyncVersion(schoolId: string, entityType: string, entityId: string, remoteVersion: number) {
    try {
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO entity_sync_versions (school_id, entity_type, entity_id, local_version, remote_version, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(school_id, entity_type, entity_id) DO UPDATE SET
          remote_version = excluded.remote_version,
          updated_at = excluded.updated_at
      `).run(schoolId, entityType, entityId, remoteVersion, now);
    } catch {}
  }
}
