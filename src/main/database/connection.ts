import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { ALL_MIGRATIONS, runMigrations } from './migrations';
import { DatabaseStatus, DashboardMetrics } from '../../shared/types';
import { InstallationRepository } from './repositories/installation.repository';
import { InstallationService } from '../services/installation.service';
import { DatabaseKeyManager } from '../security/database-key-manager';
import { getBetterSqliteNativeBinding } from './native-binding';

export { getBetterSqliteNativeBinding };

let dbInstance: Database.Database | null = null;
let currentDbPath: string = '';

export interface DatabaseInitOptions {
  encryptionKey?: Buffer | string;
  disableEncryption?: boolean;
  vaultDir?: string;
}

export function getDatabasePath(): string {
  try {
    if (app && typeof app.getPath === 'function') {
      const userDataDir = app.getPath('userData');
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      return path.join(userDataDir, 'school_local.db');
    }
  } catch (e) {
    // Fallback if app is not available (e.g. test runner)
  }

  const localDataDir = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(localDataDir)) {
    fs.mkdirSync(localDataDir, { recursive: true });
  }
  return path.join(localDataDir, 'school_local.db');
}

export function initDatabase(customPath?: string, options?: DatabaseInitOptions): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = customPath || getDatabasePath();
  currentDbPath = dbPath;

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir) && dbPath !== ':memory:') {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // 1. Detect if an existing database file on disk is legacy unencrypted SQLite
  let isExistingPlaintext = false;
  if (dbPath !== ':memory:' && fs.existsSync(dbPath) && fs.statSync(dbPath).size >= 16) {
    try {
      const fd = fs.openSync(dbPath, 'r');
      const header = Buffer.alloc(16);
      fs.readSync(fd, header, 0, 16, 0);
      fs.closeSync(fd);
      if (header.toString('utf8', 0, 15) === 'SQLite format 3') {
        isExistingPlaintext = true;
      }
    } catch {}
  }

  // 2. Resolve whole-database encryption key
  let keyHex: string | null = null;
  const isMemory = dbPath === ':memory:';
  if (!options?.disableEncryption && !isMemory) {
    if (options?.encryptionKey) {
      keyHex = Buffer.isBuffer(options.encryptionKey)
        ? options.encryptionKey.toString('hex')
        : options.encryptionKey;
    } else {
      try {
        const effectiveVaultDir = options?.vaultDir || (dbPath !== ':memory:' ? path.join(path.dirname(dbPath), '.vault') : undefined);
        const keyManager = DatabaseKeyManager.getInstance(effectiveVaultDir);
        keyHex = keyManager.getEncryptionKeyHex();
      } catch (err) {
        // Fail closed: if key manager is locked or isolated to another workstation, rethrow
        throw err;
      }
    }
  }

  // 3. Open Database connection
  const dbOptions: Database.Options = {};
  const nativeBinding = getBetterSqliteNativeBinding();
  if (nativeBinding) {
    dbOptions.nativeBinding = nativeBinding;
  }
  const db = new Database(dbPath, dbOptions);

  // 4. Configure SQLCipher whole-database page encryption
  if (keyHex) {
    db.pragma("cipher = 'sqlcipher'");
    if (isExistingPlaintext) {
      // In-place transparent migration from plaintext to SQLCipher encrypted database
      db.pragma(`rekey = 'x''${keyHex}'''`);
    } else {
      db.pragma(`key = 'x''${keyHex}'''`);
    }
  }

  // 5. Enforce strict ACID invariants, foreign key enforcement, and durable WAL fsync
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');

  // 6. Execute explicit database migrations with version tracking and automated pre-migration safety snapshots
  const preMigrationDir = path.join(dbDir, 'backups', 'pre_migration');
  runMigrations(db, ALL_MIGRATIONS, { backupDir: preMigrationDir });

  // 7. Verify database file integrity
  const integrityResult = db.pragma('integrity_check', { simple: true }) as string;
  if (integrityResult !== 'ok') {
    throw new Error(`Database integrity check failed: ${integrityResult}`);
  }

  dbInstance = db;
  return db;
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      // Checkpoint and truncate WAL file cleanly before shutdown
      dbInstance.pragma('wal_checkpoint(TRUNCATE)');
      dbInstance.close();
    } catch (err) {
      console.error('Error during database shutdown checkpoint:', err);
    } finally {
      dbInstance = null;
    }
  }
}

export function runIntegrityCheck(): { ok: boolean; result: string } {
  const db = getDatabase();
  const res = db.pragma('integrity_check', { simple: true }) as string;
  return { ok: res === 'ok', result: res };
}

export function getDatabaseStatus(): DatabaseStatus {
  const db = getDatabase();
  let sizeBytes = 0;
  try {
    if (fs.existsSync(currentDbPath)) {
      sizeBytes = fs.statSync(currentDbPath).size;
    }
  } catch (err) {
    // Stat error ignored
  }

  const installRepo = new InstallationRepository(db);
  const config = installRepo.getConfig();
  const schoolId = config?.schoolId;

  let studentsCount = 0;
  let teachersCount = 0;
  let classesCount = 0;
  let invoicesCount = 0;

  if (schoolId) {
    studentsCount = (db.prepare('SELECT COUNT(*) as c FROM students WHERE school_id = ?').get(schoolId) as { c: number }).c;
    teachersCount = (db.prepare("SELECT COUNT(*) as c FROM employees WHERE school_id = ? AND status = 'active'").get(schoolId) as { c: number }).c;
    classesCount = (db.prepare('SELECT COUNT(*) as c FROM classes WHERE school_id = ?').get(schoolId) as { c: number }).c;
    invoicesCount = (db.prepare('SELECT COUNT(*) as c FROM invoices WHERE school_id = ?').get(schoolId) as { c: number }).c;
  }

  const journalMode = (db.pragma('journal_mode', { simple: true }) as string).toLowerCase();
  const foreignKeys = db.pragma('foreign_keys', { simple: true }) as number;
  const synchronous = db.pragma('synchronous', { simple: true }) as number;

  return {
    connected: true,
    engine: 'better-sqlite3',
    path: currentDbPath,
    sizeBytes,
    totalStudents: studentsCount,
    totalTeachers: teachersCount,
    totalClasses: classesCount,
    totalInvoices: invoicesCount,
    lastBackupAt: null,
    walEnabled: journalMode === 'wal',
    foreignKeysEnabled: foreignKeys === 1,
    synchronousMode: synchronous === 2 ? 'FULL' : synchronous === 1 ? 'NORMAL' : String(synchronous),
  };
}

export function getDashboardMetrics(): DashboardMetrics {
  const db = getDatabase();
  const installRepo = new InstallationRepository(db);
  const config = installRepo.getConfig();

  if (!config) {
    return {
      totalStudents: 0,
      activeStudents: 0,
      totalFaculty: 0,
      classesCount: 0,
      todayAttendancePercent: 0,
      todayPresentCount: 0,
      todayAbsentCount: 0,
      todayLateCount: 0,
      todayLeaveCount: 0,
      monthlyBilledAmount: 0,
      monthlyCollectedAmount: 0,
      outstandingBalance: 0,
      currentAcademicSession: 'No Active Session',
      recentActivities: [],
    };
  }

  const schoolId = config.schoolId;

  const totalStudents = (db.prepare('SELECT COUNT(*) as c FROM students WHERE school_id = ?').get(schoolId) as { c: number }).c;
  const activeStudents = (db.prepare("SELECT COUNT(*) as c FROM students WHERE school_id = ? AND status = 'active'").get(schoolId) as { c: number }).c;
  const totalFaculty = (db.prepare("SELECT COUNT(*) as c FROM employees WHERE school_id = ? AND status = 'active'").get(schoolId) as { c: number }).c;
  const classesCount = (db.prepare('SELECT COUNT(*) as c FROM classes WHERE school_id = ?').get(schoolId) as { c: number }).c;

  const today = new Date().toISOString().split('T')[0];
  const attRows = db.prepare('SELECT status, COUNT(*) as c FROM attendance WHERE school_id = ? AND date = ? GROUP BY status').all(schoolId, today) as { status: string; c: number }[];

  let present = 0;
  let absent = 0;
  let late = 0;
  let leave = 0;

  for (const row of attRows) {
    if (row.status === 'present') present = row.c;
    else if (row.status === 'absent') absent = row.c;
    else if (row.status === 'late') late = row.c;
    else if (row.status === 'leave') leave = row.c;
  }

  const totalRecorded = present + absent + late + leave;
  const attendancePct = totalRecorded > 0 ? Math.round(((present + late) / totalRecorded) * 100) : 0;

  const feeRow = db.prepare(`
    SELECT 
      COALESCE(SUM(amount), 0) as billed,
      COALESCE(SUM(paid_amount), 0) as collected,
      COALESCE(SUM(balance), 0) as outstanding
    FROM invoices
    WHERE school_id = ?
  `).get(schoolId) as { billed: number; collected: number; outstanding: number };

  const sessionRow = db.prepare('SELECT name FROM academic_sessions WHERE school_id = ? AND is_current = 1 LIMIT 1').get(schoolId) as { name: string } | undefined;

  const recentLogs = db.prepare(`
    SELECT id, action, module, created_at, status 
    FROM audit_logs 
    WHERE school_id = ?
    ORDER BY id DESC 
    LIMIT 5
  `).all(schoolId) as any[];

  return {
    totalStudents,
    activeStudents,
    totalFaculty,
    classesCount,
    todayAttendancePercent: attendancePct,
    todayPresentCount: present,
    todayAbsentCount: absent,
    todayLateCount: late,
    todayLeaveCount: leave,
    monthlyBilledAmount: feeRow?.billed || 0,
    monthlyCollectedAmount: feeRow?.collected || 0,
    outstandingBalance: feeRow?.outstanding || 0,
    currentAcademicSession: sessionRow?.name || 'Academic Session 2026-2027',
    recentActivities: recentLogs.map(l => ({
      id: String(l.id),
      action: l.action,
      module: l.module,
      timestamp: l.created_at,
      status: l.status || 'success',
    })),
  };
}

export function createLocalBackup(): { success: boolean; backupPath: string } {
  const db = getDatabase();
  const backupDir = path.join(path.dirname(currentDbPath), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `school_local_backup_${timestamp}.db`;
  const backupPath = path.join(backupDir, backupFileName);

  db.backup(backupPath)
    .then(() => {
      const install = new InstallationRepository(db).getConfig();
      if (install) {
        db.prepare('INSERT INTO audit_logs (school_id, action, module, details_json, performed_by) VALUES (?, ?, ?, ?, ?)')
          .run(install.schoolId, 'LOCAL_BACKUP_CREATED', 'DATABASE', JSON.stringify({ backupFileName }), 'System Administrator');
      }
    })
    .catch((err) => {
      console.error('Backup error:', err);
    });

  return { success: true, backupPath };
}
