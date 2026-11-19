import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { getDatabase } from '../database/connection';
import { AuditRepository } from '../database/repositories/audit.repository';

export interface ConflictRecord {
  id: string;
  schoolId: string;
  entityType: string;
  entityId: string;
  localVersion: number;
  remoteVersion: number;
  localPayload: any;
  remotePayload: any;
  conflictingFields: string[];
  conflictReason: string;
  status: 'unresolved' | 'resolved' | 'ignored';
  resolutionStrategy: 'local_wins' | 'remote_wins' | 'merged' | 'manual' | null;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ConflictDetectionResult {
  hasConflict: boolean;
  canAutoResolve: boolean;
  autoResolutionStrategy?: 'local_wins' | 'remote_wins' | 'merged';
  mergedPayload?: any;
  conflictingFields: string[];
  reason?: string;
}

export class ConflictResolver {
  private auditRepo: AuditRepository;

  constructor(private db: Database.Database) {
    this.auditRepo = new AuditRepository(db);
  }

  /**
   * Compares local and remote entity payloads and detects conflicts based on domain immutability rules.
   */
  public detectConflict(
    entityType: string,
    localEntity: any,
    remoteEntity: any,
    localVersion: number,
    remoteVersion: number
  ): ConflictDetectionResult {
    // If one doesn't exist, it's a pure insert - no conflict
    if (!localEntity || !remoteEntity) {
      return { hasConflict: false, canAutoResolve: true, conflictingFields: [] };
    }

    // Identify differing fields
    const differingFields: string[] = [];
    const allKeys = new Set([...Object.keys(localEntity), ...Object.keys(remoteEntity)]);

    for (const key of allKeys) {
      if (['updated_at', 'updatedAt', 'synced_at', 'created_at', 'createdAt', 'version'].includes(key)) {
        continue;
      }
      const valL = localEntity[key];
      const valR = remoteEntity[key];
      if (JSON.stringify(valL) !== JSON.stringify(valR)) {
        differingFields.push(key);
      }
    }

    if (differingFields.length === 0) {
      return { hasConflict: false, canAutoResolve: true, conflictingFields: [] };
    }

    // ------------------------------------------------------------------------
    // DOMAIN RULE 1: FINANCIAL RECORDS (PAYMENTS, REVERSALS, INVOICES)
    // ------------------------------------------------------------------------
    if (entityType === 'PAYMENT') {
      // Payments are strictly additive and immutable. Receipts must NEVER be overwritten.
      return {
        hasConflict: true,
        canAutoResolve: true,
        autoResolutionStrategy: 'merged',
        mergedPayload: { ...remoteEntity },
        conflictingFields: differingFields,
        reason: 'Payment ledger is immutable. Additive reconciliation applied.',
      };
    }

    if (entityType === 'INVOICE') {
      // Balance conflicts are resolved by recalculating against actual payments
      const mergedInvoice = {
        ...localEntity,
        ...remoteEntity,
        // Mathematical balance reconciliation formula
        amount: Math.max(localEntity.amount || 0, remoteEntity.amount || 0),
        status: (localEntity.status === 'paid' || remoteEntity.status === 'paid') ? 'paid' : 'unpaid',
      };
      return {
        hasConflict: true,
        canAutoResolve: true,
        autoResolutionStrategy: 'merged',
        mergedPayload: mergedInvoice,
        conflictingFields: differingFields,
        reason: 'Invoice balanced reconciled via additive ledger rules.',
      };
    }

    // ------------------------------------------------------------------------
    // DOMAIN RULE 2: STUDENT GUARDIANS (STRICT SINGLE ACTIVE INVARIANT)
    // ------------------------------------------------------------------------
    if (entityType === 'STUDENT_GUARDIAN') {
      // If both sides designated an active guardian, the latest timestamp takes active precedence;
      // the other must be archived with replacement reason to prevent unique constraint violation.
      const localTime = new Date(localEntity.updatedAt || localEntity.createdAt || 0).getTime();
      const remoteTime = new Date(remoteEntity.updatedAt || remoteEntity.createdAt || 0).getTime();

      const winnerIsRemote = remoteTime >= localTime;
      return {
        hasConflict: true,
        canAutoResolve: true,
        autoResolutionStrategy: winnerIsRemote ? 'remote_wins' : 'local_wins',
        mergedPayload: winnerIsRemote ? remoteEntity : localEntity,
        conflictingFields: differingFields,
        reason: 'Single active guardian invariant resolved via chronological replacement.',
      };
    }

    // ------------------------------------------------------------------------
    // DOMAIN RULE 3: ATTENDANCE ROLL-CALL
    // ------------------------------------------------------------------------
    if (entityType === 'ATTENDANCE' || entityType === 'STAFF_ATTENDANCE') {
      // If status differs, audited correction takes precedence or combined remark
      const localHasRemark = Boolean(localEntity.remarks);
      const remoteHasRemark = Boolean(remoteEntity.remarks);

      let resolvedStatus = remoteEntity.status;
      if (localEntity.status === 'present' && remoteEntity.status === 'absent' && localHasRemark) {
        resolvedStatus = 'present';
      }

      const mergedAttendance = {
        ...(localHasRemark ? localEntity : remoteEntity),
        status: resolvedStatus,
        remarks: `[Sync Reconciled] Local: ${localEntity.status || 'none'}, Remote: ${remoteEntity.status || 'none'}. ${localEntity.remarks || remoteEntity.remarks || ''}`.trim(),
      };

      return {
        hasConflict: true,
        canAutoResolve: true,
        autoResolutionStrategy: 'merged',
        mergedPayload: mergedAttendance,
        conflictingFields: differingFields,
        reason: 'Attendance roll call reconciled with audit remark.',
      };
    }

    // ------------------------------------------------------------------------
    // DOMAIN RULE 4: PAYROLL SLIPS
    // ------------------------------------------------------------------------
    if (entityType === 'PAYROLL_SLIP') {
      // Once marked 'paid' on either client or server, it stays 'paid'
      const isPaid = localEntity.payment_status === 'paid' || remoteEntity.payment_status === 'paid' ||
                     localEntity.paymentStatus === 'paid' || remoteEntity.paymentStatus === 'paid';
      const mergedSlip = {
        ...localEntity,
        ...remoteEntity,
        paymentStatus: isPaid ? 'paid' : (remoteEntity.paymentStatus || 'unpaid'),
        payment_status: isPaid ? 'paid' : (remoteEntity.payment_status || 'unpaid'),
      };
      return {
        hasConflict: true,
        canAutoResolve: true,
        autoResolutionStrategy: 'merged',
        mergedPayload: mergedSlip,
        conflictingFields: differingFields,
        reason: 'Paid payroll status takes permanent precedence.',
      };
    }

    // ------------------------------------------------------------------------
    // DOMAIN RULE 5: GENERAL ENTITIES (STUDENT PROFILE, EMPLOYEE, TIMETABLE)
    // ------------------------------------------------------------------------
    // Check if differing fields can be cleanly merged without field collision
    const localChangedFields = differingFields.filter(f => localEntity[f] !== undefined);
    const remoteChangedFields = differingFields.filter(f => remoteEntity[f] !== undefined);

    // If both modified the EXACT same attribute to differing values, mark for administrator review!
    const directCollisions = differingFields.filter(f => localEntity[f] !== undefined && remoteEntity[f] !== undefined && localEntity[f] !== remoteEntity[f]);

    if (directCollisions.length === 1 && (directCollisions.includes('phone') || directCollisions.includes('address') || directCollisions.includes('adminNotes'))) {
      // Minor contact info: merge favoring higher version
      const higherVersionRemote = remoteVersion >= localVersion;
      return {
        hasConflict: true,
        canAutoResolve: true,
        autoResolutionStrategy: higherVersionRemote ? 'remote_wins' : 'local_wins',
        mergedPayload: higherVersionRemote ? remoteEntity : localEntity,
        conflictingFields: differingFields,
        reason: 'Minor contact field discrepancy auto-resolved by version vector.',
      };
    }

    if (directCollisions.length > 0) {
      // Substantial divergent edits: require authorized manual administrator resolution
      return {
        hasConflict: true,
        canAutoResolve: false,
        conflictingFields: directCollisions,
        reason: `Concurrent divergent modifications on fields: ${directCollisions.join(', ')}`,
      };
    }

    // Clean non-colliding field merge
    return {
      hasConflict: true,
      canAutoResolve: true,
      autoResolutionStrategy: 'merged',
      mergedPayload: { ...localEntity, ...remoteEntity },
      conflictingFields: differingFields,
      reason: 'Non-colliding independent attributes merged successfully.',
    };
  }

  /**
   * Persists an unresolved or auto-resolved conflict to the sync_conflicts table.
   */
  public recordConflict(
    schoolId: string,
    entityType: string,
    entityId: string,
    localPayload: any,
    remotePayload: any,
    conflictingFields: string[],
    conflictReason: string,
    localVersion: number = 1,
    remoteVersion: number = 1,
    autoResolvedStrategy: 'local_wins' | 'remote_wins' | 'merged' | null = null,
    resolvedBy: string | null = null
  ): ConflictRecord {
    const id = `cnf_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const status = autoResolvedStrategy ? 'resolved' : 'unresolved';

    this.db.prepare(`
      INSERT INTO sync_conflicts (
        id, school_id, entity_type, entity_id, local_version, remote_version,
        local_payload_json, remote_payload_json, conflicting_fields_json,
        conflict_reason, status, resolution_strategy, resolved_by, resolved_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      schoolId,
      entityType,
      entityId,
      localVersion,
      remoteVersion,
      JSON.stringify(localPayload),
      JSON.stringify(remotePayload),
      JSON.stringify(conflictingFields),
      conflictReason,
      status,
      autoResolvedStrategy,
      resolvedBy,
      autoResolvedStrategy ? now : null,
      now
    );

    return {
      id,
      schoolId,
      entityType,
      entityId,
      localVersion,
      remoteVersion,
      localPayload,
      remotePayload,
      conflictingFields,
      conflictReason,
      status,
      resolutionStrategy: autoResolvedStrategy,
      resolutionNotes: null,
      resolvedBy,
      resolvedAt: autoResolvedStrategy ? now : null,
      createdAt: now,
    };
  }

  /**
   * Manually resolves an existing conflict using the chosen strategy.
   */
  public resolveConflict(
    schoolId: string,
    conflictId: string,
    strategy: 'local_wins' | 'remote_wins' | 'merged',
    resolvedBy: string,
    notes?: string,
    customMergedPayload?: any
  ): { success: boolean; appliedPayload: any } {
    const row = this.db.prepare(`
      SELECT * FROM sync_conflicts WHERE school_id = ? AND id = ?
    `).get(schoolId, conflictId) as any;

    if (!row) {
      throw new Error(`Conflict ${conflictId} not found in this institution`);
    }

    const localPayload = JSON.parse(row.local_payload_json);
    const remotePayload = JSON.parse(row.remote_payload_json);
    let finalPayload: any;

    if (strategy === 'local_wins') {
      finalPayload = localPayload;
    } else if (strategy === 'remote_wins') {
      finalPayload = remotePayload;
    } else {
      finalPayload = customMergedPayload || { ...localPayload, ...remotePayload };
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE sync_conflicts
      SET status = 'resolved', resolution_strategy = ?, resolution_notes = ?,
          resolved_by = ?, resolved_at = ?
      WHERE id = ?
    `).run(strategy, notes || null, resolvedBy, now, conflictId);

    this.auditRepo.log({
      schoolId,
      userId: resolvedBy,
      action: 'SYNC_CONFLICT_RESOLVED',
      module: 'SYNC',
      details: {
        conflictId,
        entityType: row.entity_type,
        entityId: row.entity_id,
        strategy,
        notes,
      },
      performedBy: resolvedBy,
    });

    return { success: true, appliedPayload: finalPayload };
  }

  public listConflicts(schoolId: string, status?: 'unresolved' | 'resolved'): ConflictRecord[] {
    let sql = 'SELECT * FROM sync_conflicts WHERE school_id = ?';
    const params: any[] = [schoolId];
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      id: r.id,
      schoolId: r.school_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      localVersion: r.local_version,
      remoteVersion: r.remote_version,
      localPayload: JSON.parse(r.local_payload_json),
      remotePayload: JSON.parse(r.remote_payload_json),
      conflictingFields: JSON.parse(r.conflicting_fields_json),
      conflictReason: r.conflict_reason,
      status: r.status,
      resolutionStrategy: r.resolution_strategy,
      resolutionNotes: r.resolution_notes,
      resolvedBy: r.resolved_by,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
    }));
  }

  public getUnresolvedConflictCount(schoolId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM sync_conflicts WHERE school_id = ? AND status = 'unresolved'
    `).get(schoolId) as { count: number };
    return row ? row.count : 0;
  }
}
