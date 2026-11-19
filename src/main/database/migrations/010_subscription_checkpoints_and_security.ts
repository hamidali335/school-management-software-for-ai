import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration010SubscriptionCheckpointsAndSecurity: Migration = {
  version: 10,
  name: '010_subscription_checkpoints_and_security',
  up: (db: Database.Database) => {
    db.exec(`
      -- 1. Subscription Checkpoints for Monotonic & Rollback Verification
      CREATE TABLE IF NOT EXISTS subscription_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id TEXT NOT NULL,
        recorded_server_time TEXT NOT NULL,
        recorded_local_time TEXT NOT NULL,
        monotonic_offset_ms INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sub_checkpoints_created ON subscription_checkpoints(created_at DESC);

      -- 2. Vault Security Audit Log
      CREATE TABLE IF NOT EXISTS vault_security_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        school_id TEXT,
        device_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'locked', 'unlocked')),
        details TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_vault_sec_created ON vault_security_log(created_at DESC);
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS vault_security_log;
      DROP TABLE IF EXISTS subscription_checkpoints;
    `);
  },
};
