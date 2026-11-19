import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

export interface MigrationResult {
  appliedCount: number;
  preMigrationBackupPath?: string;
}

export function ensureMigrationTable(db: Database.Database): void {
  // Detect and upgrade unversioned legacy Phase 1 database if present
  try {
    const hasLegacy = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='school_profile'").get() as { c: number };
    const hasMigTable = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get() as { c: number };

    if (hasLegacy && hasLegacy.c > 0 && (!hasMigTable || hasMigTable.c === 0)) {
      db.pragma('foreign_keys = OFF');
      const legacyTables = [
        'school_profile', 'students', 'student_enrollments', 'attendance',
        'fee_structures', 'invoices', 'payments', 'employees', 'classes',
        'sections', 'academic_sessions', 'sync_outbox', 'audit_logs'
      ];
      for (const t of legacyTables) {
        db.exec(`DROP TABLE IF EXISTS ${t};`);
      }
      db.pragma('foreign_keys = ON');
    }
  } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now')),
      checksum TEXT NOT NULL
    );
  `);
}

export function getAppliedMigrationVersions(db: Database.Database): Set<number> {
  ensureMigrationTable(db);
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all() as { version: number }[];
  return new Set(rows.map(r => r.version));
}

export function runMigrations(
  db: Database.Database,
  migrations: Migration[],
  options?: { backupDir?: string }
): MigrationResult {
  ensureMigrationTable(db);
  const applied = getAppliedMigrationVersions(db);
  let appliedCount = 0;

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const pending = sorted.filter(m => !applied.has(m.version));

  if (pending.length === 0) {
    return { appliedCount: 0 };
  }

  let preMigrationBackupPath: string | undefined;

  // Pre-migration safety snapshot: if existing versioned data is present
  if (applied.size > 0 && options?.backupDir) {
    try {
      if (!fs.existsSync(options.backupDir)) {
        fs.mkdirSync(options.backupDir, { recursive: true });
      }
      db.pragma('wal_checkpoint(TRUNCATE)');
      const filename = `pre_migration_v${pending[0].version}_${Date.now()}.sqlite`;
      preMigrationBackupPath = path.join(options.backupDir, filename);
      const serialized = db.serialize();
      fs.writeFileSync(preMigrationBackupPath, serialized);
    } catch (err) {
      console.warn('[MIGRATION] Pre-migration snapshot notice:', err);
    }
  }

  for (const migration of pending) {
    const migrationSource = migration.up.toString();
    const checksum = crypto.createHash('sha256').update(migrationSource).digest('hex');

    const runTx = db.transaction(() => {
      migration.up(db);
      db.prepare(`
        INSERT INTO schema_migrations (version, name, applied_at, checksum)
        VALUES (?, ?, datetime('now'), ?)
      `).run(migration.version, migration.name, checksum);
    });

    runTx();
    appliedCount++;
  }

  return { appliedCount, preMigrationBackupPath };
}
