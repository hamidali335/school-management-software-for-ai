import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration009PerformanceAndUpdates: Migration = {
  version: 9,
  name: '009_performance_optimization_and_update_state',
  up: (db: Database.Database) => {
    db.exec(`
      -- 1. Performance Indexes for High-Frequency Queries
      CREATE INDEX IF NOT EXISTS idx_students_school_name ON students(school_id, full_name);
      CREATE INDEX IF NOT EXISTS idx_students_school_status ON students(school_id, status);
      CREATE INDEX IF NOT EXISTS idx_enrollment_student_status ON student_enrollments(student_id, status);
      CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, date);
      CREATE INDEX IF NOT EXISTS idx_invoices_school_due ON invoices(school_id, status, due_date);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_queue ON sync_outbox(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_school_date ON audit_logs(school_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_staff_att_emp_date ON staff_attendance(employee_id, date);

      -- 2. Desktop Application Update Configuration & Channel State
      CREATE TABLE IF NOT EXISTS app_update_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_version TEXT NOT NULL DEFAULT '1.0.0',
        channel TEXT NOT NULL DEFAULT 'stable' CHECK (channel IN ('stable', 'beta')),
        update_endpoint TEXT NOT NULL DEFAULT 'http://localhost:5000/api/v1/updates/desktop',
        auto_download INTEGER NOT NULL DEFAULT 0,
        last_checked_at TEXT,
        last_update_status TEXT NOT NULL DEFAULT 'idle',
        pending_version TEXT,
        pending_installer_path TEXT,
        pending_release_notes TEXT,
        last_error TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      INSERT OR IGNORE INTO app_update_config (id, current_version, channel, update_endpoint, auto_download, last_update_status)
      VALUES (1, '1.0.0', 'stable', 'http://localhost:5000/api/v1/updates/desktop', 0, 'idle');
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS app_update_config;
      DROP INDEX IF EXISTS idx_students_school_name;
      DROP INDEX IF EXISTS idx_students_school_status;
      DROP INDEX IF EXISTS idx_enrollment_student_status;
      DROP INDEX IF EXISTS idx_attendance_student_date;
      DROP INDEX IF EXISTS idx_invoices_school_due;
      DROP INDEX IF EXISTS idx_sync_outbox_queue;
      DROP INDEX IF EXISTS idx_audit_logs_school_date;
      DROP INDEX IF EXISTS idx_staff_att_emp_date;
    `);
  }
};
