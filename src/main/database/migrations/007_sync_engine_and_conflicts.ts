import Database from 'better-sqlite3';
import { Migration } from './migration-runner';
import { PRODUCTION_DEFAULT_CLOUD_URL } from '../../config/endpoints';

export const migration007SyncEngineAndConflicts: Migration = {
  version: 7,
  name: '007_sync_engine_and_conflicts',
  up: (db: Database.Database) => {
    // 1. Extend sync_outbox with enterprise metadata columns
    const columns = db.prepare("PRAGMA table_info(sync_outbox)").all() as { name: string }[];
    const colNames = new Set(columns.map(c => c.name));

    if (!colNames.has('event_id')) {
      db.exec("ALTER TABLE sync_outbox ADD COLUMN event_id TEXT");
    }
    if (!colNames.has('idempotency_key')) {
      db.exec("ALTER TABLE sync_outbox ADD COLUMN idempotency_key TEXT");
    }
    if (!colNames.has('device_id')) {
      db.exec("ALTER TABLE sync_outbox ADD COLUMN device_id TEXT");
    }
    if (!colNames.has('schema_version')) {
      db.exec("ALTER TABLE sync_outbox ADD COLUMN schema_version INTEGER DEFAULT 1");
    }
    if (!colNames.has('local_version')) {
      db.exec("ALTER TABLE sync_outbox ADD COLUMN local_version INTEGER DEFAULT 1");
    }
    if (!colNames.has('dependency_id')) {
      db.exec("ALTER TABLE sync_outbox ADD COLUMN dependency_id TEXT");
    }
    if (!colNames.has('retry_after')) {
      db.exec("ALTER TABLE sync_outbox ADD COLUMN retry_after TEXT");
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_outbox_event_id ON sync_outbox(event_id);
      CREATE INDEX IF NOT EXISTS idx_outbox_idempotency ON sync_outbox(idempotency_key);

      -- 2. Device Registration and Secure Remote Configuration
      CREATE TABLE IF NOT EXISTS sync_device_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        school_id TEXT NOT NULL,
        device_id TEXT UNIQUE NOT NULL,
        device_name TEXT NOT NULL,
        api_base_url TEXT NOT NULL DEFAULT '${PRODUCTION_DEFAULT_CLOUD_URL}',
        auth_token_encrypted TEXT,
        refresh_token_encrypted TEXT,
        device_status TEXT DEFAULT 'registered' CHECK (device_status IN ('unregistered', 'registered', 'revoked', 'expired')),
        last_handshake_at TEXT,
        registered_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      -- 3. Incremental Download Cursors per Entity Type
      CREATE TABLE IF NOT EXISTS sync_cursors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        cursor_token TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        UNIQUE(school_id, entity_type),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      -- 4. Bidirectional Conflict Records & Audit Trail
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_version INTEGER DEFAULT 1,
        remote_version INTEGER DEFAULT 1,
        local_payload_json TEXT NOT NULL,
        remote_payload_json TEXT NOT NULL,
        conflicting_fields_json TEXT NOT NULL,
        conflict_reason TEXT NOT NULL,
        status TEXT DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved', 'ignored')),
        resolution_strategy TEXT CHECK (resolution_strategy IN ('local_wins', 'remote_wins', 'merged', 'manual', NULL)),
        resolution_notes TEXT,
        resolved_by TEXT,
        resolved_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_conflicts_status ON sync_conflicts(school_id, status);
      CREATE INDEX IF NOT EXISTS idx_conflicts_entity ON sync_conflicts(school_id, entity_type, entity_id);

      -- 5. Synchronization Execution History Log
      CREATE TABLE IF NOT EXISTS sync_history (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('upload', 'download', 'bidirectional')),
        status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'conflict')),
        uploaded_count INTEGER DEFAULT 0,
        downloaded_count INTEGER DEFAULT 0,
        conflict_count INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_sync_history_date ON sync_history(school_id, started_at DESC);

      -- 6. Deletion Tombstones
      CREATE TABLE IF NOT EXISTS sync_tombstones (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        seq INTEGER DEFAULT 0,
        deleted_at TEXT NOT NULL,
        deleted_by TEXT,
        reason TEXT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_tombstones_entity ON sync_tombstones(school_id, entity_type, entity_id);

      -- 7. Entity Versioning Metadata
      CREATE TABLE IF NOT EXISTS entity_sync_versions (
        school_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_version INTEGER DEFAULT 1,
        remote_version INTEGER DEFAULT 0,
        last_sync_hash TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (school_id, entity_type, entity_id),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );
    `);
  },
};
