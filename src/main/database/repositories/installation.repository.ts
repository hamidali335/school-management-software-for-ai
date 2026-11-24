import Database from 'better-sqlite3';

export interface InstallationConfig {
  id: number;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  currency: string;
  currentSessionId: string | null;
  installationId: string;
  provisionedAt: string;
  updatedAt: string;
}

export class InstallationRepository {
  constructor(private db: Database.Database) {}

  public getConfig(): InstallationConfig | null {
    const row = this.db.prepare(`
      SELECT 
        id, school_id as schoolId, school_name as schoolName, school_code as schoolCode,
        currency, current_session_id as currentSessionId, installation_id as installationId,
        provisioned_at as provisionedAt, updated_at as updatedAt
      FROM installation_config
      WHERE id = 1
    `).get() as InstallationConfig | undefined;

    return row || null;
  }

  public getRawConfig(): InstallationConfig | null {
    const row = this.db.prepare(`
      SELECT 
        id, school_id as schoolId, school_name as schoolName, school_code as schoolCode,
        currency, current_session_id as currentSessionId, installation_id as installationId,
        provisioned_at as provisionedAt, updated_at as updatedAt
      FROM installation_config
      WHERE id = 1
    `).get() as InstallationConfig | undefined;

    return row || null;
  }

  public purgeDemoData(): void {
    const demoIds = ['sch_01', 'sch_default', 'sch_pkg_test'];
    const placeholders = demoIds.map(() => '?').join(',');
    this.db.transaction(() => {
      const tables = [
        'payments', 'invoices', 'fee_concessions', 'fee_structures',
        'student_marks', 'exam_papers', 'exams', 'grading_scales',
        'timetable_entries', 'expenses',
        'payroll_slips', 'payroll_runs', 'staff_salaries', 'staff_attendance', 'employees',
        'attendance', 'student_enrollments', 'student_guardians', 'students',
        'sections', 'classes', 'academic_sessions',
        'notices_cache', 'offline_mirror_cache', 'sync_conflicts', 'sync_outbox',
        'audit_logs', 'license_cache', 'user_sessions', 'users',
        'installation_config'
      ];
      try {
        this.db.prepare('UPDATE sync_apply_context SET applying_server_tombstone = 1 WHERE id = 1').run();
      } catch {}
      try {
        for (const tbl of tables) {
          try {
            this.db.prepare(`DELETE FROM ${tbl} WHERE school_id IN (${placeholders})`).run(...demoIds);
          } catch {}
        }
      } finally {
        try {
          this.db.prepare('UPDATE sync_apply_context SET applying_server_tombstone = 0 WHERE id = 1').run();
        } catch {}
      }
    })();
  }

  public setConfig(config: {
    schoolId: string;
    schoolName: string;
    schoolCode: string;
    currency?: string;
    currentSessionId?: string | null;
    installationId: string;
  }): InstallationConfig {
    const now = new Date().toISOString();
    const currency = config.currency || 'Rs.';
    const currentSessionId = config.currentSessionId || null;

    this.db.prepare(`
      INSERT INTO installation_config (
        id, school_id, school_name, school_code, currency, current_session_id,
        installation_id, provisioned_at, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        school_id = excluded.school_id,
        school_name = excluded.school_name,
        school_code = excluded.school_code,
        currency = excluded.currency,
        current_session_id = excluded.current_session_id,
        updated_at = excluded.updated_at
    `).run(
      config.schoolId,
      config.schoolName,
      config.schoolCode,
      currency,
      currentSessionId,
      config.installationId,
      now,
      now
    );

    return this.getConfig()!;
  }

  public isProvisioned(): boolean {
    const cfg = this.getConfig();
    return cfg !== null && Boolean(cfg.schoolId);
  }
}
