const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { runMigrations, ALL_MIGRATIONS } = require('../dist/main/database/migrations/index.js');
const { BackupService } = require('../dist/main/services/backup.service.js');

describe('School Management Software — Phase 6 Automated Backups & Safe Restore Suite', () => {
  let db;
  let backupService;
  const testDir = path.resolve(__dirname, 'temp_backup_test_sandbox');
  const activeDbPath = path.join(testDir, 'active_school.sqlite');
  const schoolId = 'sch_p6_backup_test';

  let mockCloudStorage = new Map();
  const mockCloudClient = {
    uploadBackup: async (meta, buffer) => {
      mockCloudStorage.set(meta.backupId, { meta, buffer });
      return { success: true, backupId: meta.backupId };
    },
    listBackups: async () => Array.from(mockCloudStorage.values()).map(v => v.meta),
    downloadBackup: async (backupId) => {
      const item = mockCloudStorage.get(backupId);
      if (!item) throw new Error('Not found');
      return { buffer: item.buffer, fileName: item.meta.fileName };
    },
  };

  before(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    db = new Database(activeDbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db, ALL_MIGRATIONS);

    // Seed installation
    db.prepare(`
      INSERT INTO installation_config (
        id, school_id, school_name, school_code, installation_id, provisioned_at, updated_at
      ) VALUES (1, ?, 'Backup Test Grammar School', 'BTGS', 'inst_backup_secret_777', datetime('now'), datetime('now'))
    `).run(schoolId);

    // Seed academic session, student, invoice, payment, attendance
    db.prepare(`
      INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current)
      VALUES ('sess_2026', ?, '2026-2027 Academic Year', '2026-04-01', '2027-03-31', 1)
    `).run(schoolId);

    db.prepare(`
      INSERT INTO classes (id, school_id, name, order_index)
      VALUES ('cls_10', ?, 'Class 10', 10)
    `).run(schoolId);

    db.prepare(`
      INSERT INTO sections (id, school_id, class_id, name, room_number)
      VALUES ('sec_10_a', ?, 'cls_10', 'Section A', 'Room 101')
    `).run(schoolId);

    db.prepare(`
      INSERT INTO students (id, school_id, admission_number, full_name, father_name, status)
      VALUES ('std_p6_01', ?, 'ADM-P6-001', 'Bilal Ahmed', 'Ahmed Raza', 'active')
    `).run(schoolId);

    db.prepare(`
      INSERT INTO student_enrollments (id, school_id, student_id, session_id, class_id, section_id, roll_number, status)
      VALUES ('enr_p6_01', ?, 'std_p6_01', 'sess_2026', 'cls_10', 'sec_10_a', 1, 'enrolled')
    `).run(schoolId);

    db.prepare(`
      INSERT INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, previous_dues, paid_amount, balance, status)
      VALUES ('inv_p6_01', ?, 'INV-2026-001', 'std_p6_01', 'sess_2026', '2026-04', '2026-04-10', 5000, 0, 5000, 0, 'paid')
    `).run(schoolId);

    // Permanent payment record + reversal contra-entry
    db.prepare(`
      INSERT INTO payments (id, school_id, invoice_id, receipt_number, amount, payment_method, payment_date, is_reversed)
      VALUES ('pay_p6_01', ?, 'inv_p6_01', 'RCP-2026-001', 5000, 'cash', '2026-04-05', 0)
    `).run(schoolId);

    db.prepare(`
      INSERT INTO payments (id, school_id, invoice_id, receipt_number, amount, payment_method, payment_date, is_reversed, reversal_for_payment_id, reversal_reason)
      VALUES ('pay_p6_01_rev', ?, 'inv_p6_01', 'REV-2026-001', -5000, 'cash', '2026-04-06', 1, 'pay_p6_01', 'Correction contra-entry')
    `).run(schoolId);

    db.prepare(`
      INSERT INTO attendance (id, school_id, student_id, session_id, class_id, section_id, date, status)
      VALUES ('att_p6_01', ?, 'std_p6_01', 'sess_2026', 'cls_10', 'sec_10_a', '2026-04-07', 'present')
    `).run(schoolId);

    // Sync Outbox event with idempotency key
    db.prepare(`
      INSERT INTO sync_outbox (school_id, entity_type, entity_id, operation, payload_json, status, event_id, idempotency_key)
      VALUES (?, 'PAYMENT', 'pay_p6_01', 'INSERT', '{"id":"pay_p6_01","amount":5000}', 'synced', 'evt_pay_01', 'idemp_sha256_pay_01')
    `).run(schoolId);

    backupService = new BackupService(db, activeDbPath, mockCloudClient);
  });

  after(() => {
    if (db) db.close();
    if (fs.existsSync(testDir)) {
      try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    }
  });

  let createdLocalBackupPath = '';

  it('1. Retrieves multi-destination backup configurations', () => {
    const dests = backupService.getDestinationConfigs();
    assert.strictEqual(dests.length, 3);
    const types = dests.map(d => d.destinationType);
    assert.strictEqual(types.includes('local'), true);
    assert.strictEqual(types.includes('cloud'), true);
    assert.strictEqual(types.includes('external'), true);
  });

  it('2. Creates a WAL-consistent encrypted local backup (AES-256-GCM)', async () => {
    // Configure local backup directory inside test sandbox
    const localTargetDir = path.join(testDir, 'local_backups');
    backupService.updateDestinationConfig({
      destinationType: 'local',
      destinationPath: localTargetDir,
      retentionCount: 5,
    });

    const entry = await backupService.createBackup({
      destinationType: 'local',
      triggerType: 'manual',
    });

    assert.strictEqual(entry.destinationType, 'local');
    assert.strictEqual(entry.status, 'completed');
    assert.strictEqual(entry.isEncrypted, true);
    assert.strictEqual(entry.fileSizeBytes > 1024, true);
    assert.strictEqual(fs.existsSync(entry.filePath), true);

    createdLocalBackupPath = entry.filePath;

    // Verify binary magic header 'SMSBAK01'
    const headerBytes = Buffer.alloc(8);
    const fd = fs.openSync(entry.filePath, 'r');
    fs.readSync(fd, headerBytes, 0, 8, 0);
    fs.closeSync(fd);
    assert.strictEqual(headerBytes.toString('utf8'), 'SMSBAK01');
  });

  it('3. Creates a cloud backup and verifies through mock backend storage', async () => {
    const entry = await backupService.createBackup({
      destinationType: 'cloud',
      triggerType: 'scheduled',
    });

    assert.strictEqual(entry.destinationType, 'cloud');
    assert.strictEqual(entry.status, 'completed');
    assert.strictEqual(mockCloudStorage.has(entry.backupId), true);

    const stored = mockCloudStorage.get(entry.backupId);
    assert.strictEqual(stored.meta.checksumSha256, entry.checksumSha256);
  });

  it('4. Rejects tampered or corrupted backup file (Authentication tag failure)', () => {
    // Read valid backup bytes and tamper with 1 byte in ciphertext
    const validBytes = fs.readFileSync(createdLocalBackupPath);
    const tamperedBytes = Buffer.from(validBytes);
    tamperedBytes[tamperedBytes.length - 10] ^= 0xff; // flip bits in ciphertext

    const corruptedPath = path.join(testDir, 'corrupted_backup.enc.bak');
    fs.writeFileSync(corruptedPath, tamperedBytes);

    assert.throws(() => {
      backupService.verifyBackupFile(corruptedPath);
    }, /TAMPERED_OR_CORRUPT_BACKUP/);
  });

  it('5. Rejects backup file with invalid magic header', () => {
    const fakeBytes = Buffer.alloc(100);
    fakeBytes.write('FAKEHEAD', 0, 8, 'utf8');
    const fakePath = path.join(testDir, 'fake_header.enc.bak');
    fs.writeFileSync(fakePath, fakeBytes);

    assert.throws(() => {
      backupService.verifyBackupFile(fakePath);
    }, /INVALID_BACKUP_HEADER/);
  });

  it('6. Non-destructive sandbox verification inspects schema and record counts without altering active DB', () => {
    const preview = backupService.verifyBackupFile(createdLocalBackupPath);

    assert.strictEqual(preview.verified, true);
    assert.strictEqual(preview.integrityStatus, 'ok');
    assert.strictEqual(preview.recordCounts.students, 1);
    assert.strictEqual(preview.recordCounts.invoices, 1);
    assert.strictEqual(preview.recordCounts.payments, 2); // 1 original + 1 reversal contra-entry
    assert.strictEqual(preview.recordCounts.attendance, 1);
    assert.strictEqual(preview.recordCounts.outboxEvents, 1);
    assert.strictEqual(preview.schemaVersion >= 8, true);
  });

  it('7. Automatic backup rotation respects configured retention count', async () => {
    const localTargetDir = path.join(testDir, 'local_backups');
    backupService.updateDestinationConfig({
      destinationType: 'local',
      destinationPath: localTargetDir,
      retentionCount: 3, // keep only latest 3
    });

    // Create 4 additional backups
    for (let i = 0; i < 4; i++) {
      await backupService.createBackup({ destinationType: 'local', triggerType: 'scheduled' });
    }

    const files = fs.readdirSync(localTargetDir).filter(f => f.endsWith('.enc.bak'));
    assert.strictEqual(files.length, 3); // exactly 3 retained
    createdLocalBackupPath = path.join(localTargetDir, files[0]);
  });

  it('8. Safe restoration requires explicit confirmation and creates automatic pre-restore safety snapshot', async () => {
    // Attempt restore without confirm: true -> throws error
    await assert.rejects(async () => {
      await backupService.restoreBackup({
        backupFilePath: createdLocalBackupPath,
        confirm: false,
      });
    }, /Explicit confirmation is required/);

    // Perform restore with confirm: true
    const result = await backupService.restoreBackup({
      backupFilePath: createdLocalBackupPath,
      confirm: true,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(fs.existsSync(result.preRestoreBackupPath), true); // pre-restore snapshot verified!
  });

  it('9. Restored database preserves complete financial ledger immutability and contra-entries', () => {
    const payments = db.prepare(`
      SELECT id, amount, is_reversed, reversal_for_payment_id FROM payments ORDER BY id ASC
    `).all();

    assert.strictEqual(payments.length, 2);
    // Original payment
    assert.strictEqual(payments[0].id, 'pay_p6_01');
    assert.strictEqual(payments[0].amount, 5000);
    assert.strictEqual(payments[0].is_reversed, 0);

    // Reversal contra-entry
    assert.strictEqual(payments[1].id, 'pay_p6_01_rev');
    assert.strictEqual(payments[1].amount, -5000);
    assert.strictEqual(payments[1].is_reversed, 1);
    assert.strictEqual(payments[1].reversal_for_payment_id, 'pay_p6_01');

    // Invoice balance is preserved
    const invoice = db.prepare('SELECT balance, status FROM invoices WHERE id = ?').get('inv_p6_01');
    assert.strictEqual(invoice.status, 'paid');
    assert.strictEqual(invoice.balance, 0);
  });

  it('10. Restored database preserves academic enrollments, attendance, and sync outbox idempotency', () => {
    const student = db.prepare('SELECT full_name, admission_number FROM students WHERE id = ?').get('std_p6_01');
    assert.strictEqual(student.full_name, 'Bilal Ahmed');

    const enrollment = db.prepare('SELECT session_id, class_id FROM student_enrollments WHERE id = ?').get('enr_p6_01');
    assert.strictEqual(enrollment.class_id, 'cls_10');

    const attendance = db.prepare('SELECT status, date FROM attendance WHERE id = ?').get('att_p6_01');
    assert.strictEqual(attendance.status, 'present');

    // Sync outbox event preserved with idempotency key
    const outbox = db.prepare('SELECT event_id, idempotency_key, status FROM sync_outbox WHERE event_id = ?').get('evt_pay_01');
    assert.strictEqual(outbox.event_id, 'evt_pay_01');
    assert.strictEqual(outbox.idempotency_key, 'idemp_sha256_pay_01');
    assert.strictEqual(outbox.status, 'synced');
  });

  it('11. Disaster Recovery Runbook: Restores onto a replacement workstation and re-binds safely', async () => {
    // Simulate setting up a replacement workstation: new database file
    const replacementDbPath = path.join(testDir, 'replacement_workstation.sqlite');
    const replacementDb = new Database(replacementDbPath);
    replacementDb.pragma('journal_mode = WAL');
    runMigrations(replacementDb, ALL_MIGRATIONS);

    const replacementService = new BackupService(replacementDb, replacementDbPath);

    // Restore the backup into the replacement workstation database using school master recovery key
    const restoreResult = await replacementService.restoreBackup({
      backupFilePath: createdLocalBackupPath,
      confirm: true,
      passphrase: 'sch_p6_backup_test_inst_backup_secret_777_backup_key',
    });

    assert.strictEqual(restoreResult.success, true);
    assert.strictEqual(restoreResult.preview.verified, true);

    // Reopen database to verify restored pages on replacement workstation
    replacementDb.close();
    const verifiedDb = new Database(replacementDbPath);

    // Verify data exists inside replacement workstation DB
    const student = verifiedDb.prepare('SELECT admission_number FROM students WHERE id = ?').get('std_p6_01');
    assert.strictEqual(student.admission_number, 'ADM-P6-001');

    const paymentsCount = verifiedDb.prepare('SELECT COUNT(*) as count FROM payments').get().count;
    assert.strictEqual(paymentsCount, 2);

    verifiedDb.close();
  });
});
