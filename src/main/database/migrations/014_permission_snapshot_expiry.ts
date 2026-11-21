import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration014PermissionSnapshotExpiry: Migration = {
  version: 14,
  name: '014_permission_snapshot_expiry',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS permission_snapshots (
        school_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        permissions_json TEXT NOT NULL DEFAULT '[]',
        max_age_hours INTEGER NOT NULL DEFAULT 72 CHECK (max_age_hours >= 24 AND max_age_hours <= 168),
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        signature TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (school_id, user_id)
      );
    `);

    try {
      const cols = db.prepare("PRAGMA table_info(sync_outbox)").all() as { name: string }[];
      if (!cols.some(c => c.name === 'payload')) {
        db.exec("ALTER TABLE sync_outbox ADD COLUMN payload TEXT;");
      }
    } catch {}
  },
  down(db: Database.Database) {
    db.exec(`DROP TABLE IF EXISTS permission_snapshots;`);
  },
};
