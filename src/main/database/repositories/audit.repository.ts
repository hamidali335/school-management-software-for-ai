import Database from 'better-sqlite3';

export interface AuditLogEntry {
  schoolId: string;
  userId?: string | null;
  action: string;
  module: string;
  details?: Record<string, any> | string;
  status?: 'success' | 'failure' | 'warning';
  performedBy: string;
}

export class AuditRepository {
  constructor(private db: Database.Database) {}

  public log(entry: AuditLogEntry): void {
    const detailsJson = typeof entry.details === 'object' ? JSON.stringify(entry.details) : (entry.details || null);
    const status = entry.status || 'success';
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO audit_logs (
        school_id, user_id, action, module, details_json, status, performed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.schoolId,
      entry.userId || null,
      entry.action,
      entry.module,
      detailsJson,
      status,
      entry.performedBy,
      now
    );
  }

  public getRecent(schoolId: string, limit = 20) {
    return this.db.prepare(`
      SELECT 
        id, school_id as schoolId, user_id as userId, action, module,
        details_json as detailsJson, status, performed_by as performedBy,
        created_at as createdAt
      FROM audit_logs
      WHERE school_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(schoolId, limit);
  }
}
