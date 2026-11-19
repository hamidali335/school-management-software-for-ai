import Database from 'better-sqlite3';
import { Migration } from './migration-runner';
import crypto from 'crypto';

export const migration011RebuildSyncOutboxAndSeq: Migration = {
  version: 11,
  name: '011_rebuild_sync_outbox_and_seq',
  up: (db: Database.Database) => {
    // 1. Check if old sync_outbox exists
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_outbox'")
      .all() as { name: string }[];

    if (tables.length > 0) {
      // Backup old sync_outbox
      db.exec(`
        DROP TABLE IF EXISTS sync_outbox_backup_010;
        ALTER TABLE sync_outbox RENAME TO sync_outbox_backup_010;
      `);
    }

    // 2. Create the clean, unified sync_outbox schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT UNIQUE DEFAULT (lower(hex(randomblob(16)))),
        event_id TEXT,
        idempotency_key TEXT UNIQUE DEFAULT (lower(hex(randomblob(16)))),
        device_id TEXT,
        school_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        dependency_key TEXT,
        dependency_id TEXT,
        schema_version INTEGER DEFAULT 1,
        local_version INTEGER DEFAULT 1,
        base_version INTEGER DEFAULT 1,
        payload_json TEXT NOT NULL,
        operation TEXT DEFAULT 'INSERT',
        status TEXT DEFAULT 'pending',
        state TEXT NOT NULL CHECK(state IN ('pending', 'processing', 'retrying', 'synced', 'conflict', 'needs_attention')) DEFAULT 'pending',
        attempt_count INTEGER DEFAULT 0,
        next_retry_at TEXT,
        retry_after TEXT,
        last_error TEXT,
        error_message TEXT,
        last_http_status INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        synced_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_outbox_school_state ON sync_outbox(school_id, state);
      CREATE INDEX IF NOT EXISTS idx_outbox_school_entity ON sync_outbox(school_id, entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_outbox_dependency ON sync_outbox(dependency_key);
      CREATE INDEX IF NOT EXISTS idx_outbox_operation ON sync_outbox(operation_id);
      CREATE INDEX IF NOT EXISTS idx_outbox_idempotency ON sync_outbox(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
      CREATE INDEX IF NOT EXISTS idx_outbox_event_id ON sync_outbox(event_id);

      CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_state_sync AFTER UPDATE OF state ON sync_outbox
      BEGIN
        UPDATE sync_outbox SET status = NEW.state WHERE id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_status_sync AFTER UPDATE OF status ON sync_outbox
      BEGIN
        UPDATE sync_outbox SET state = NEW.status WHERE id = NEW.id AND NEW.status IN ('pending', 'processing', 'retrying', 'synced', 'conflict', 'needs_attention');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_outbox_insert_sync AFTER INSERT ON sync_outbox
      BEGIN
        UPDATE sync_outbox SET 
          event_id = COALESCE(NEW.event_id, NEW.operation_id),
          operation_id = COALESCE(NEW.operation_id, NEW.event_id),
          state = CASE WHEN NEW.status IN ('pending', 'processing', 'retrying', 'synced', 'conflict', 'needs_attention') THEN NEW.status ELSE NEW.state END
        WHERE id = NEW.id;
      END;

      -- 3. Sequence cursor table tracking remote change stream
      CREATE TABLE IF NOT EXISTS sync_school_cursor (
        school_id TEXT PRIMARY KEY,
        last_seq INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- 4. Protected technician lockout state table
      CREATE TABLE IF NOT EXISTS technician_lockout (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        failed_attempts INTEGER DEFAULT 0,
        locked_until TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      INSERT OR IGNORE INTO technician_lockout (id, failed_attempts, locked_until)
      VALUES (1, 0, NULL);

      -- 5. Context table and triggers for server tombstone application
      CREATE TABLE IF NOT EXISTS sync_apply_context (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        applying_server_tombstone INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO sync_apply_context (id, applying_server_tombstone) VALUES (1, 0);

      DROP TRIGGER IF EXISTS trg_prevent_payment_deletion;
      CREATE TRIGGER IF NOT EXISTS trg_prevent_payment_deletion
      BEFORE DELETE ON payments
      WHEN (SELECT COALESCE(applying_server_tombstone, 0) FROM sync_apply_context WHERE id = 1) = 0
      BEGIN
        SELECT RAISE(ABORT, 'Financial records are immutable: physical deletion of payment receipts is forbidden');
      END;

      DROP TRIGGER IF EXISTS trg_prevent_invoice_deletion_with_payments;
      CREATE TRIGGER IF NOT EXISTS trg_prevent_invoice_deletion_with_payments
      BEFORE DELETE ON invoices
      WHEN (SELECT COALESCE(applying_server_tombstone, 0) FROM sync_apply_context WHERE id = 1) = 0
        AND (SELECT COUNT(*) FROM payments WHERE invoice_id = OLD.id) > 0
      BEGIN
        SELECT RAISE(ABORT, 'Cannot delete fee invoice: associated payment history exists');
      END;

      DROP TRIGGER IF EXISTS trg_prevent_student_deletion_with_financials;
      CREATE TRIGGER IF NOT EXISTS trg_prevent_student_deletion_with_financials
      BEFORE DELETE ON students
      WHEN (SELECT COALESCE(applying_server_tombstone, 0) FROM sync_apply_context WHERE id = 1) = 0
        AND (SELECT COUNT(*) FROM invoices WHERE student_id = OLD.id) > 0
      BEGIN
        SELECT RAISE(ABORT, 'Cannot delete student: associated financial invoices and payment records exist. Use student status archival (inactive/withdrawn/graduated) instead.');
      END;
    `);

    // 6. Ensure sync_tombstones has seq column
    const tombstoneTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_tombstones'").all();
    if (tombstoneTable.length > 0) {
      const tombstoneCols = db.prepare("PRAGMA table_info(sync_tombstones)").all() as { name: string }[];
      if (!tombstoneCols.some(c => c.name === 'seq')) {
        db.exec("ALTER TABLE sync_tombstones ADD COLUMN seq INTEGER DEFAULT 0");
      }
    }

    // 7. Migrate existing rows if backup exists
    const backupExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_outbox_backup_010'")
      .all() as { name: string }[];

    if (backupExists.length > 0) {
      const oldRows = db.prepare('SELECT * FROM sync_outbox_backup_010').all() as any[];
      const insert = db.prepare(`
        INSERT OR IGNORE INTO sync_outbox (
          operation_id,
          idempotency_key,
          school_id,
          entity_type,
          entity_id,
          dependency_key,
          base_version,
          payload_json,
          state,
          attempt_count,
          last_error,
          created_at,
          synced_at
        ) VALUES (
          @operation_id,
          @idempotency_key,
          @school_id,
          @entity_type,
          @entity_id,
          @dependency_key,
          @base_version,
          @payload_json,
          @state,
          @attempt_count,
          @last_error,
          @created_at,
          @synced_at
        )
      `);

      for (const row of oldRows) {
        const opId = row.operation_id || row.event_id || `op_${row.id || crypto.randomUUID()}`;
        const idemKey = row.idempotency_key || `idem_${row.id || crypto.randomUUID()}`;
        let state = 'pending';
        if (row.status === 'synced' || row.state === 'synced') state = 'synced';
        else if (row.status === 'syncing' || row.state === 'processing') state = 'retrying';
        else if (row.status === 'failed' || row.state === 'retrying') state = 'retrying';

        insert.run({
          operation_id: opId,
          idempotency_key: idemKey,
          school_id: row.school_id || 'default_school',
          entity_type: row.entity_type || 'UNKNOWN',
          entity_id: String(row.entity_id || row.id),
          dependency_key: row.dependency_id || row.dependency_key || null,
          base_version: row.local_version || row.base_version || 1,
          payload_json: row.payload_json || '{}',
          state,
          attempt_count: row.retry_count || row.attempt_count || 0,
          last_error: row.error_message || row.last_error || null,
          created_at: row.created_at || new Date().toISOString(),
          synced_at: row.synced_at || null,
        });
      }
    }
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS sync_outbox;
      DROP TABLE IF EXISTS sync_school_cursor;
      DROP TABLE IF EXISTS technician_lockout;
    `);
  },
};
