import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export const migration015SubjectsAndSchoolRules: Migration = {
  version: 15,
  name: '015_subjects_and_school_rules',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'core' CHECK (type IN ('core', 'elective')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(school_id, code)
      );
      CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);
    `);

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(
      (t) => t.name,
    );
    if (tables.includes('school_settings')) {
      addColumnIfMissing(db, 'school_settings', 'pass_percentage', 'INTEGER DEFAULT 40');
      addColumnIfMissing(db, 'school_settings', 'low_attendance_threshold', 'INTEGER DEFAULT 75');
      addColumnIfMissing(db, 'school_settings', 'consecutive_absence_alert', 'INTEGER DEFAULT 3');
      addColumnIfMissing(db, 'school_settings', 'invoice_due_day', 'INTEGER DEFAULT 10');
      addColumnIfMissing(db, 'school_settings', 'late_fee_amount', 'REAL DEFAULT 0');
      addColumnIfMissing(db, 'school_settings', 'invoice_prefix', "TEXT DEFAULT 'INV-'");
      addColumnIfMissing(db, 'school_settings', 'receipt_prefix', "TEXT DEFAULT 'RCP-'");
      addColumnIfMissing(db, 'school_settings', 'expense_approval_threshold', 'REAL DEFAULT 50000');
    }
  },
  down(db: Database.Database) {
    db.exec(`DROP TABLE IF EXISTS subjects;`);
  },
};
