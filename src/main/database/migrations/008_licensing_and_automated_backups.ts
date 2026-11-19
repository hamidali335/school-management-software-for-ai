import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration008LicensingAndAutomatedBackups: Migration = {
  version: 8,
  name: '008_licensing_and_automated_backups',
  up: (db: Database.Database) => {
    db.exec(`
      -- 1. Local Signed License Cache & Verification State
      CREATE TABLE IF NOT EXISTS license_cache (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        license_id TEXT NOT NULL,
        school_id TEXT NOT NULL,
        school_name TEXT NOT NULL,
        school_code TEXT NOT NULL,
        device_id TEXT NOT NULL,
        hardware_fingerprint TEXT NOT NULL,
        plan_code TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        status TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        grace_period_days INTEGER DEFAULT 7,
        last_server_verification TEXT NOT NULL,
        last_observed_local_time TEXT NOT NULL,
        clock_tampered INTEGER DEFAULT 0,
        entitlements_json TEXT NOT NULL,
        limits_json TEXT,
        signed_payload TEXT NOT NULL,
        signature TEXT NOT NULL,
        public_key TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      -- 2. Multi-Destination Backup Configurations
      CREATE TABLE IF NOT EXISTS backup_configs (
        destination_type TEXT PRIMARY KEY CHECK (destination_type IN ('local', 'cloud', 'external')),
        is_enabled INTEGER DEFAULT 1,
        destination_path TEXT,
        retention_count INTEGER DEFAULT 10,
        last_backup_at TEXT,
        last_backup_status TEXT DEFAULT 'idle',
        last_error TEXT,
        health_status TEXT DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'warning', 'error', 'disabled')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- 3. Comprehensive Backup History & Verification Log
      CREATE TABLE IF NOT EXISTS backup_history (
        backup_id TEXT PRIMARY KEY,
        destination_type TEXT NOT NULL CHECK (destination_type IN ('local', 'cloud', 'external')),
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        checksum_sha256 TEXT NOT NULL,
        is_encrypted INTEGER DEFAULT 1,
        encryption_algorithm TEXT DEFAULT 'aes-256-gcm',
        status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'verified', 'restored')),
        trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'scheduled', 'pre_migration', 'maintenance')),
        verified_at TEXT,
        restored_at TEXT,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_backup_hist_created ON backup_history(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_backup_hist_dest ON backup_history(destination_type);

      -- Seed default backup destination configs if not present
      INSERT OR IGNORE INTO backup_configs (destination_type, is_enabled, destination_path, retention_count, health_status)
      VALUES 
        ('local', 1, 'backups/local', 10, 'healthy'),
        ('cloud', 1, 'cloud:/api/v1/backups/school', 10, 'healthy'),
        ('external', 0, 'D:/SMS/ExternalBackups', 5, 'disabled');
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS backup_history;
      DROP TABLE IF EXISTS backup_configs;
      DROP TABLE IF EXISTS license_cache;
    `);
  },
};
