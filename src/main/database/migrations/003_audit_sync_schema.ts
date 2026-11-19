import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration003AuditSyncSchema: Migration = {
  version: 3,
  name: '003_audit_sync_schema',
  up: (db: Database.Database) => {
    db.exec(`
      -- Offline Sync Outbox Journal
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
        payload_json TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'syncing', 'synced', 'failed')),
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        synced_at TEXT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_outbox_status ON sync_outbox(school_id, status);

      -- Local Security and Administrative Audit Logs
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL,
        user_id TEXT,
        action TEXT NOT NULL,
        module TEXT NOT NULL,
        details_json TEXT,
        status TEXT DEFAULT 'success' CHECK(status IN ('success', 'failure', 'warning')),
        performed_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(school_id, module, created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(school_id, user_id);
    `);
  },
};
