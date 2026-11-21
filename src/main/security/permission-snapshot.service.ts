import Database from 'better-sqlite3';

export const DEFAULT_PERMISSION_SNAPSHOT_HOURS = 72;
export const MIN_PERMISSION_SNAPSHOT_HOURS = 24;
export const MAX_PERMISSION_SNAPSHOT_HOURS = 168;

export interface PermissionSnapshotEvaluation {
  exists: boolean;
  valid: boolean;
  expired: boolean;
  readOnly: boolean;
  canWrite: boolean;
  canSync: boolean;
  canBackup: boolean;
  canExport: boolean;
  maxAgeHours: number;
  issuedAt: string | null;
  expiresAt: string | null;
}

export class PermissionSnapshotService {
  constructor(private db: Database.Database) {}

  public static clampMaxAgeHours(hours?: number): number {
    if (typeof hours !== 'number' || Number.isNaN(hours)) return DEFAULT_PERMISSION_SNAPSHOT_HOURS;
    return Math.min(MAX_PERMISSION_SNAPSHOT_HOURS, Math.max(MIN_PERMISSION_SNAPSHOT_HOURS, Math.round(hours)));
  }

  public saveSnapshot(params: {
    schoolId: string;
    userId: string;
    role: string;
    permissions: string[];
    maxAgeHours?: number;
    issuedAt?: string;
    signature?: string | null;
  }): { issuedAt: string; expiresAt: string; maxAgeHours: number } {
    const maxAgeHours = PermissionSnapshotService.clampMaxAgeHours(params.maxAgeHours);
    const issuedDate = params.issuedAt ? new Date(params.issuedAt) : new Date();
    const expiresDate = new Date(issuedDate.getTime() + maxAgeHours * 3600 * 1000);
    const issuedAt = issuedDate.toISOString();
    const expiresAt = expiresDate.toISOString();

    this.db
      .prepare(`
        INSERT INTO permission_snapshots (
          school_id, user_id, role, permissions_json, max_age_hours, issued_at, expires_at, signature, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(school_id, user_id) DO UPDATE SET
          role = excluded.role,
          permissions_json = excluded.permissions_json,
          max_age_hours = excluded.max_age_hours,
          issued_at = excluded.issued_at,
          expires_at = excluded.expires_at,
          signature = excluded.signature,
          updated_at = datetime('now')
      `)
      .run(
        params.schoolId,
        params.userId,
        params.role,
        JSON.stringify(params.permissions || []),
        maxAgeHours,
        issuedAt,
        expiresAt,
        params.signature ?? null,
      );

    return { issuedAt, expiresAt, maxAgeHours };
  }

  public evaluateSnapshot(schoolId: string, userId: string, nowMs = Date.now()): PermissionSnapshotEvaluation {
    const row = this.db
      .prepare('SELECT max_age_hours, issued_at, expires_at FROM permission_snapshots WHERE school_id = ? AND user_id = ?')
      .get(schoolId, userId) as { max_age_hours: number; issued_at: string; expires_at: string } | undefined;

    if (!row) {
      return {
        exists: false,
        valid: false,
        expired: true,
        readOnly: true,
        canWrite: false,
        canSync: false,
        canBackup: true,
        canExport: true,
        maxAgeHours: DEFAULT_PERMISSION_SNAPSHOT_HOURS,
        issuedAt: null,
        expiresAt: null,
      };
    }

    const expiresMs = new Date(row.expires_at).getTime();
    const expired = Number.isNaN(expiresMs) || nowMs > expiresMs;

    return {
      exists: true,
      valid: !expired,
      expired,
      readOnly: expired,
      canWrite: !expired,
      canSync: !expired,
      canBackup: true,
      canExport: true,
      maxAgeHours: row.max_age_hours,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Enforces Decision 1: after permission snapshot expiry, app is read-only;
   * backup and export remain available; local data is never deleted.
   */
  public assertWriteAllowed(schoolId: string, userId: string, featureKey: string, nowMs = Date.now()): void {
    if (featureKey === 'core.backup' || featureKey === 'core.export') {
      return;
    }
    const ev = this.evaluateSnapshot(schoolId, userId, nowMs);
    if (ev.expired) {
      throw new Error(
        'PERMISSION_SNAPSHOT_EXPIRED: Offline permission snapshot has expired. Application is in read-only mode; backup and export remain available until you reconnect.',
      );
    }
  }
}
