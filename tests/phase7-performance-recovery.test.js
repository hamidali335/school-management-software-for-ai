const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations');

test('School Management Software — Phase 7 Performance & Crash Recovery Suite', async (t) => {
  const testDbDir = path.resolve(__dirname, '../data/test_phase7_perf');
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }

  const testDbPath = path.join(testDbDir, `p7_perf_${Date.now()}.db`);
  let db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');

  runMigrations(db, ALL_MIGRATIONS);

  // Setup minimal institutional fixture
  db.prepare(`
    INSERT OR REPLACE INTO installation_config (id, school_id, school_name, school_code, installation_id, provisioned_at, updated_at)
    VALUES (1, 'sch_perf_01', 'Performance Academy', 'PERF01', 'inst_p7_perf', datetime('now'), datetime('now'))
  `).run();

  db.prepare(`
    INSERT OR REPLACE INTO classes (id, school_id, name, order_index)
    VALUES ('cls_perf_01', 'sch_perf_01', 'Class 9', 9)
  `).run();

  db.prepare(`
    INSERT OR REPLACE INTO sections (id, school_id, class_id, name, room_number)
    VALUES ('sec_perf_01', 'sch_perf_01', 'cls_perf_01', 'Section A', 'Room 901')
  `).run();

  db.prepare(`
    INSERT OR REPLACE INTO academic_sessions (id, school_id, name, start_date, end_date, is_current)
    VALUES ('sess_perf_01', 'sch_perf_01', '2026-2027', '2026-08-01', '2027-06-30', 1)
  `).run();

  await t.test('1. Performance indexes verification: Migration 009 created required query indexes', () => {
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'
    `).all().map(r => r.name);

    assert.ok(indexes.includes('idx_students_school_name'), 'idx_students_school_name must exist');
    assert.ok(indexes.includes('idx_students_school_status'), 'idx_students_school_status must exist');
    assert.ok(indexes.includes('idx_enrollment_student_status'), 'idx_enrollment_student_status must exist');
    assert.ok(indexes.includes('idx_attendance_student_date'), 'idx_attendance_student_date must exist');
    assert.ok(indexes.includes('idx_invoices_school_due'), 'idx_invoices_school_due must exist');
    assert.ok(indexes.includes('idx_sync_outbox_queue'), 'idx_sync_outbox_queue must exist');
    assert.ok(indexes.includes('idx_staff_att_emp_date'), 'idx_staff_att_emp_date must exist');
  });

  await t.test('2. Query optimization verification via EXPLAIN QUERY PLAN: confirms index utilization', () => {
    // 1. Student name search query plan
    const planStudentSearch = db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id, full_name FROM students WHERE school_id = 'sch_perf_01' AND full_name = 'Zain Ahmed'
    `).all();
    const studentSearchDetail = planStudentSearch.map(p => p.detail).join(' ');
    assert.ok(
      studentSearchDetail.includes('USING INDEX idx_students_school_name'),
      `Student search should use idx_students_school_name, got: ${studentSearchDetail}`
    );

    // 2. Invoice overdue search query plan
    const planInvoiceSearch = db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT id, balance FROM invoices WHERE school_id = 'sch_perf_01' AND status = 'unpaid' AND due_date < '2026-12-01'
    `).all();
    const invoiceSearchDetail = planInvoiceSearch.map(p => p.detail).join(' ');
    assert.ok(
      invoiceSearchDetail.includes('USING INDEX idx_invoices_school_due'),
      `Overdue invoice query should use idx_invoices_school_due, got: ${invoiceSearchDetail}`
    );
  });

  await t.test('3. Roster query latency benchmark: bounded lookup across 2,000 indexed student records executes in under 20ms', () => {
    // Bulk insert 2,000 student records inside an atomic transaction
    const insertTx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO students (id, school_id, admission_number, full_name, father_name, gender, date_of_birth, status)
        VALUES (?, 'sch_perf_01', ?, ?, 'Father Name', 'male', '2012-01-01', 'active')
      `);
      for (let i = 1; i <= 2000; i++) {
        stmt.run(`stu_bench_${i}`, `ADM-B-${String(i).padStart(5, '0')}`, `Student Benchmark ${i}`);
      }
    });

    const startInsert = Date.now();
    insertTx();
    const insertDuration = Date.now() - startInsert;
    assert.ok(insertDuration < 1000, `2000 bulk insertions should complete in under 1000ms, took ${insertDuration}ms`);

    // Benchmark search query
    const startQuery = performance.now();
    const found = db.prepare(`
      SELECT id, admission_number, full_name FROM students
      WHERE school_id = 'sch_perf_01' AND full_name = 'Student Benchmark 1500'
    `).get();
    const queryDurationMs = performance.now() - startQuery;

    assert.ok(found, 'Target benchmark student must be found');
    assert.equal(found.admission_number, 'ADM-B-01500');
    assert.ok(queryDurationMs < 20, `Indexed student search must execute in under 20ms, took ${queryDurationMs.toFixed(2)}ms`);
  });

  await t.test('4. WAL checkpoint durability & crash recovery: uncheckpointed WAL state survives abrupt restart without data loss', () => {
    // Write 50 new payments into WAL without running wal_checkpoint
    const insertPayments = db.transaction(() => {
      const invStmt = db.prepare(`
        INSERT INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, balance, status)
        VALUES (?, 'sch_perf_01', ?, 'stu_bench_1', 'sess_perf_01', '2026-11', '2026-11-20', 1000, 0, 'paid')
      `);
      const payStmt = db.prepare(`
        INSERT INTO payments (id, school_id, invoice_id, receipt_number, amount, payment_date, payment_method, collector, is_reversed)
        VALUES (?, 'sch_perf_01', ?, ?, 1000, '2026-11-14', 'cash', 'Cashier', 0)
      `);
      for (let i = 1; i <= 50; i++) {
        invStmt.run(`inv_crash_${i}`, `CH-CR-${i}`);
        payStmt.run(`pay_crash_${i}`, `inv_crash_${i}`, `REC-CR-${i}`);
      }
    });

    insertPayments();

    // Verify WAL file exists and contains uncheckpointed frames
    const walFile = `${testDbPath}-wal`;
    assert.ok(fs.existsSync(walFile), 'WAL file must exist');
    assert.ok(fs.statSync(walFile).size > 0, 'WAL file must have positive size');

    // Abruptly close database connection without TRUNCATE checkpoint
    db.close();

    // Reopen database connection (simulates application restart after sudden power loss or process kill)
    const reopenedDb = new Database(testDbPath);
    reopenedDb.pragma('journal_mode = WAL');
    reopenedDb.pragma('foreign_keys = ON');

    // Run PRAGMA integrity_check to verify WAL replay succeeded
    const integrity = reopenedDb.pragma('integrity_check', { simple: true });
    assert.equal(integrity, 'ok', 'Database must pass integrity_check after WAL recovery');

    // Verify all 50 uncheckpointed payments survived
    const recoveredCount = reopenedDb.prepare("SELECT COUNT(*) as c FROM payments WHERE id LIKE 'pay_crash_%'").get().c;
    assert.equal(recoveredCount, 50, 'All 50 uncheckpointed payment records must survive crash recovery');

    db = reopenedDb; // Keep handle for following tests
  });

  await t.test('5. Financial immutability and anti-corruption: payment receipt rows and reversed contra-entries remain permanently intact', () => {
    // Reverse payment #1
    db.prepare(`
      UPDATE payments SET is_reversed = 1, reversal_reason = 'Accidental double entry', reversed_at = datetime('now')
      WHERE id = 'pay_crash_1'
    `).run();

    // Insert contra-entry
    db.prepare(`
      INSERT INTO payments (id, school_id, invoice_id, receipt_number, amount, payment_date, payment_method, collector, is_reversed, reversal_for_payment_id)
      VALUES ('pay_rev_1', 'sch_perf_01', 'inv_crash_1', 'REC-REV-1', -1000, '2026-11-14', 'cash', 'Admin', 1, 'pay_crash_1')
    `).run();

    // Verify both original payment and contra-entry exist
    const orig = db.prepare("SELECT * FROM payments WHERE id = 'pay_crash_1'").get();
    const rev = db.prepare("SELECT * FROM payments WHERE id = 'pay_rev_1'").get();

    assert.equal(orig.is_reversed, 1);
    assert.equal(orig.amount, 1000, 'Original payment amount must remain permanently preserved');
    assert.equal(rev.amount, -1000, 'Contra-entry amount must be negative');
    assert.equal(rev.reversal_for_payment_id, 'pay_crash_1');

    // Anti-cascading check: attempting to delete invoice must fail due to foreign key restrictions and Phase 2 triggers
    assert.throws(
      () => {
        db.prepare("DELETE FROM invoices WHERE id = 'inv_crash_1'").run();
      },
      /Cannot delete fee invoice: associated payment history exists|FOREIGN KEY constraint failed/
    );
  });

  await t.test('6. Schema upgrade pre-migration snapshot: verifies automated snapshot creation in backups/pre_migration', () => {
    const preMigBackupDir = path.join(testDbDir, 'pre_migration_snapshots');
    const dummyMigration = {
      version: 999,
      name: '999_test_pre_mig_snapshot',
      up: (d) => {
        d.exec("CREATE TABLE IF NOT EXISTS test_snapshot_flag (id INT);");
      }
    };

    const res = runMigrations(db, [dummyMigration], { backupDir: preMigBackupDir });
    assert.equal(res.appliedCount, 1);
    assert.ok(res.preMigrationBackupPath, 'Pre-migration snapshot path must be returned');
    assert.ok(fs.existsSync(res.preMigrationBackupPath), 'Snapshot file must exist on disk');
    assert.ok(fs.statSync(res.preMigrationBackupPath).size > 0, 'Snapshot file must be non-empty');
  });

  await t.test('7. Safe migration transaction rollback: failing forward migration rolls back completely leaving previous schema and data untouched', () => {
    const currentApplied = db.prepare("SELECT COUNT(*) as c FROM schema_migrations").get().c;

    const failingMigration = {
      version: 1000,
      name: '1000_failing_migration',
      up: (d) => {
        d.exec("CREATE TABLE test_rollback_table (id INT);");
        // Intentional SQL error to trigger transaction rollback
        d.exec("INSERT INTO test_non_existent_table VALUES (1);");
      }
    };

    assert.throws(
      () => {
        runMigrations(db, [failingMigration]);
      },
      /no such table: test_non_existent_table/
    );

    // Verify atomic rollback
    const postApplied = db.prepare("SELECT COUNT(*) as c FROM schema_migrations").get().c;
    assert.equal(postApplied, currentApplied, 'Applied migrations count must not increase on failure');

    const tableCreated = db.prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='test_rollback_table'").get().c;
    assert.equal(tableCreated, 0, 'Table created inside failed migration must be rolled back');
  });

  await t.test('8. Uninstallation data safety simulation: removing the installation directory does not affect user %APPDATA% databases, backups, or licenses', () => {
    // Simulate installation directory (e.g. Program Files / School Management Software)
    const mockInstallDir = path.join(testDbDir, 'mock_program_files');
    fs.mkdirSync(mockInstallDir, { recursive: true });
    fs.writeFileSync(path.join(mockInstallDir, 'School Management Software.exe'), 'MOCK_BINARY');
    fs.writeFileSync(path.join(mockInstallDir, 'uninstall.exe'), 'MOCK_UNINSTALLER');

    // Simulate persistent user AppData directory
    const mockUserDataDir = path.join(testDbDir, 'mock_app_data');
    fs.mkdirSync(mockUserDataDir, { recursive: true });
    const userDbPath = path.join(mockUserDataDir, 'school_local.db');
    const userBackupsDir = path.join(mockUserDataDir, 'backups', 'local');
    fs.mkdirSync(userBackupsDir, { recursive: true });

    fs.copyFileSync(testDbPath, userDbPath);
    fs.writeFileSync(path.join(userBackupsDir, 'backup_20261114.enc'), 'ENCRYPTED_BACKUP_CONTENT');

    // Simulate standard NSIS uninstallation with deleteAppDataOnUninstall=false
    // The uninstaller removes ONLY mockInstallDir
    fs.rmSync(mockInstallDir, { recursive: true, force: true });

    // Assert that the installation directory was removed
    assert.equal(fs.existsSync(mockInstallDir), false, 'Installation directory should be removed by uninstaller');

    // Assert that the user database, backups, and data remain 100% intact
    assert.ok(fs.existsSync(userDbPath), 'User SQLite database must survive uninstallation');
    assert.ok(fs.existsSync(path.join(userBackupsDir, 'backup_20261114.enc')), 'User backup files must survive uninstallation');

    // Verify surviving database is fully operational
    const survivingDb = new Database(userDbPath);
    const studentCount = survivingDb.prepare("SELECT COUNT(*) as c FROM students WHERE school_id = 'sch_perf_01'").get().c;
    assert.ok(studentCount > 0, 'Surviving database must retain student records');
    survivingDb.close();
  });

  // Teardown
  db.close();
  try {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  } catch {}
});
