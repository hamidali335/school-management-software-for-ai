import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { getDatabase } from '../database/connection';

export interface OutboxEntry {
  id: number;
  eventId: string;
  schoolId: string;
  entityType: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payloadJson: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  errorMessage?: string | null;
  idempotencyKey?: string | null;
  deviceId?: string | null;
  schemaVersion: number;
  localVersion: number;
  dependencyId?: string | null;
  retryAfter?: string | null;
  createdAt: string;
  syncedAt?: string | null;
}

let applyingRemoteChanges = false;

/**
 * Loop prevention: When applying incoming changes from the remote server,
 * suppress local outbox event emission.
 */
export function setApplyingRemoteChanges(applying: boolean): void {
  applyingRemoteChanges = applying;
}

export function isApplyingRemoteChanges(): boolean {
  return applyingRemoteChanges;
}

/**
 * Determines parent entity ID dependency for hierarchical entities.
 */
function extractDependencyId(entityType: string, payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  switch (entityType) {
    case 'STUDENT_ENROLLMENT':
    case 'STUDENT_GUARDIAN':
      return payload.studentId || payload.student_id || null;
    case 'INVOICE':
      return payload.studentId || payload.student_id || null;
    case 'PAYMENT':
      return payload.invoiceId || payload.invoice_id || null;
    case 'EXAM_PAPER':
      return payload.examId || payload.exam_id || null;
    case 'STUDENT_MARKS':
      return payload.paperId || payload.paper_id || null;
    case 'PAYROLL_SLIP':
      return payload.payrollRunId || payload.payroll_run_id || null;
    case 'SECTION':
      return payload.classId || payload.class_id || null;
    default:
      return null;
  }
}

export function recordChange(
  entityType: string,
  entityId: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: any,
  dbInstance?: Database.Database
): void {
  // If remote changes are being downloaded and applied, avoid circular outbox loops
  if (applyingRemoteChanges) {
    return;
  }

  let db: Database.Database;
  try {
    db = dbInstance || getDatabase();
  } catch {
    return;
  }

  let schoolId = payload?.schoolId || payload?.school_id;
  if (!schoolId) {
    try {
      const inst = db.prepare('SELECT school_id FROM installation_config LIMIT 1').get() as { school_id?: string } | undefined;
      schoolId = inst?.school_id;
    } catch {}
  }

  if (!schoolId) {
    return;
  }

  // 1. Fetch or assign device identifier
  let deviceId: string | null = null;
  try {
    const dev = db.prepare('SELECT device_id FROM sync_device_config LIMIT 1').get() as { device_id?: string } | undefined;
    deviceId = dev?.device_id || null;
  } catch {
    deviceId = null;
  }

  // 2. Manage entity version vector
  let localVersion = 1;
  try {
    const now = new Date().toISOString();
    const verRow = db.prepare(`
      SELECT local_version FROM entity_sync_versions
      WHERE school_id = ? AND entity_type = ? AND entity_id = ?
    `).get(schoolId, entityType, entityId) as { local_version: number } | undefined;

    if (verRow) {
      localVersion = verRow.local_version + 1;
      db.prepare(`
        UPDATE entity_sync_versions
        SET local_version = ?, updated_at = ?
        WHERE school_id = ? AND entity_type = ? AND entity_id = ?
      `).run(localVersion, now, schoolId, entityType, entityId);
    } else {
      db.prepare(`
        INSERT INTO entity_sync_versions (school_id, entity_type, entity_id, local_version, remote_version, updated_at)
        VALUES (?, ?, ?, 1, 0, ?)
      `).run(schoolId, entityType, entityId, now);
      localVersion = 1;
    }
  } catch {
    localVersion = 1;
  }

  // 3. Generate globally unique event ID and deterministic idempotency key
  const eventId = `evt_${crypto.randomUUID()}`;
  const payloadStr = JSON.stringify(payload);
  const hashSource = `${schoolId}:${entityType}:${entityId}:${operation}:${localVersion}:${payloadStr}`;
  const idempotencyKey = `idemp_${crypto.createHash('sha256').update(hashSource).digest('hex').substring(0, 32)}`;
  const dependencyId = extractDependencyId(entityType, payload);

  // 4. Record in sync_outbox
  const opId = `op_${crypto.randomUUID()}`;
  try {
    const stmt = db.prepare(`
      INSERT INTO sync_outbox (
        operation_id, idempotency_key, school_id, entity_type, entity_id,
        operation, payload_json, state, status, base_version, dependency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)
    `);
    stmt.run(opId, idempotencyKey, schoolId, entityType, entityId, operation, payloadStr, localVersion, dependencyId);
  } catch {
    try {
      const stmt = db.prepare(`
        INSERT INTO sync_outbox (
          school_id, entity_type, entity_id, operation, payload_json, status,
          event_id, idempotency_key, device_id, schema_version, local_version, dependency_id
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, 1, ?, ?)
      `);
      stmt.run(schoolId, entityType, entityId, operation, payloadStr, eventId, idempotencyKey, deviceId, localVersion, dependencyId);
    } catch {
      // Fallback for pre-migration-007 schema
      const fallbackStmt = db.prepare(`
        INSERT INTO sync_outbox (school_id, entity_type, entity_id, operation, payload_json, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `);
      fallbackStmt.run(schoolId, entityType, entityId, operation, payloadStr);
    }
  }
}

export function getPendingChangesCount(dbInstance?: Database.Database): number {
  const db = dbInstance || getDatabase();
  try {
    const row = db.prepare("SELECT COUNT(*) as count FROM sync_outbox WHERE state IN ('pending', 'retrying') OR (state IS NULL AND status = 'pending')").get() as { count: number };
    return row ? row.count : 0;
  } catch {
    return 0;
  }
}

export function getFailedChangesCount(dbInstance?: Database.Database): number {
  const db = dbInstance || getDatabase();
  try {
    const row = db.prepare("SELECT COUNT(*) as count FROM sync_outbox WHERE state IN ('conflict', 'needs_attention') OR (state IS NULL AND status = 'failed')").get() as { count: number };
    return row ? row.count : 0;
  } catch {
    return 0;
  }
}

const ENTITY_TYPE_ORDER: Record<string, number> = {
  INSTALLATION_CONFIG: 10,
  CAMPUS: 20,
  ACADEMIC_SESSION: 30,
  CLASS: 40,
  SCHOOL_CLASS: 40,
  SECTION: 50,
  STUDENT: 60,
  EMPLOYEE: 60,
  FEE_HEAD: 60,
  FEE_STRUCTURE: 65,
  STUDENT_ENROLLMENT: 70,
  STUDENT_GUARDIAN: 70,
  ATTENDANCE: 80,
  ATTENDANCE_RECORD: 80,
  INVOICE: 90,
  PAYMENT: 100,
  PAYROLL_SLIP: 110,
  EXAM: 120,
  EXAM_PAPER: 130,
  STUDENT_MARKS: 140,
};

function sortOutboxEntries(entries: OutboxEntry[]): OutboxEntry[] {
  return [...entries].sort((a, b) => {
    const wa = ENTITY_TYPE_ORDER[a.entityType] || 500;
    const wb = ENTITY_TYPE_ORDER[b.entityType] || 500;
    if (wa !== wb) return wa - wb;
    return a.id - b.id;
  });
}

/**
 * Returns pending outbox entries sorted in topological dependency order (parents before children).
 */
export function getPendingOutboxEntries(limit: number = 50, dbInstance?: Database.Database): OutboxEntry[] {
  const db = dbInstance || getDatabase();
  try {
    const rows = db.prepare(`
      SELECT 
        id,
        school_id as schoolId,
        entity_type as entityType,
        entity_id as entityId,
        operation,
        payload_json as payloadJson,
        state as status,
        attempt_count as retryCount,
        last_error as errorMessage,
        operation_id as eventId,
        idempotency_key as idempotencyKey,
        dependency_key as dependencyId,
        next_retry_at as retryAfter,
        created_at as createdAt,
        synced_at as syncedAt
      FROM sync_outbox
      WHERE state IN ('pending', 'retrying')
        AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
      ORDER BY id ASC
      LIMIT ?
    `).all(limit) as OutboxEntry[];

    return sortOutboxEntries(rows);
  } catch {
    try {
      const rows = db.prepare(`
        SELECT 
          id,
          school_id as schoolId,
          entity_type as entityType,
          entity_id as entityId,
          operation,
          payload_json as payloadJson,
          status,
          retry_count as retryCount,
          error_message as errorMessage,
          event_id as eventId,
          idempotency_key as idempotencyKey,
          dependency_id as dependencyId,
          retry_after as retryAfter,
          created_at as createdAt,
          synced_at as syncedAt
        FROM sync_outbox
        WHERE status IN ('pending', 'retrying')
        ORDER BY id ASC
        LIMIT ?
      `).all(limit) as OutboxEntry[];
      return sortOutboxEntries(rows);
    } catch {
      return [];
    }
  }
}

export function markEntriesSynced(ids: number[], dbInstance?: Database.Database): void {
  if (ids.length === 0) return;
  const db = dbInstance || getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  try {
    const stmt = db.prepare(`
      UPDATE sync_outbox
      SET state = 'synced', status = 'synced', synced_at = datetime('now'), last_error = NULL
      WHERE id IN (${placeholders})
    `);
    stmt.run(...ids);
  } catch {
    const stmt = db.prepare(`
      UPDATE sync_outbox
      SET status = 'synced', synced_at = datetime('now'), error_message = NULL
      WHERE id IN (${placeholders})
    `);
    stmt.run(...ids);
  }
}

export function markEntryFailed(id: number, error: string, retryAfter?: string, dbInstance?: Database.Database): void {
  const db = dbInstance || getDatabase();
  try {
    const stmt = db.prepare(`
      UPDATE sync_outbox
      SET state = 'retrying', status = 'failed', attempt_count = attempt_count + 1, last_error = ?, next_retry_at = ?
      WHERE id = ?
    `);
    stmt.run(error, retryAfter || null, id);
  } catch {
    const stmt = db.prepare(`
      UPDATE sync_outbox
      SET status = 'failed', retry_count = retry_count + 1, error_message = ?, retry_after = ?
      WHERE id = ?
    `);
    stmt.run(error, retryAfter || null, id);
  }
}

export function markEntryConflict(id: number, error: string, dbInstance?: Database.Database): void {
  const db = dbInstance || getDatabase();
  const stmt = db.prepare(`
    UPDATE sync_outbox
    SET status = 'failed', error_message = ?
    WHERE id = ?
  `);
  stmt.run(error, id);
}

export function resetFailedEntriesForRetry(dbInstance?: Database.Database): number {
  const db = dbInstance || getDatabase();
  const res = db.prepare(`
    UPDATE sync_outbox
    SET status = 'pending', error_message = NULL
    WHERE status = 'failed'
  `).run();
  return res.changes;
}
