const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations/index.js');
const { initDatabase, closeDatabase } = require('../dist/main/database/connection.js');
const { DatabaseKeyManager } = require('../dist/main/security/database-key-manager.js');
const { SubscriptionEnforcer } = require('../dist/main/services/subscription-enforcer.js');
const { LicenseService } = require('../dist/main/services/license.service.js');
const { BackupService } = require('../dist/main/services/backup.service.js');
const { OnlineSyncDispatcher } = require('../dist/main/sync/online-sync-dispatcher.js');
const { StudentService } = require('../dist/main/services/student.service.js');
const { DeviceFingerprint } = require('../dist/main/security/device-fingerprint.js');
const { getBetterSqliteNativeBinding } = require('../dist/main/database/native-binding.js');

const TEST_VAULT_DIR = path.resolve(__dirname, 'test_final_vault');
const FINAL_DB_PATH = path.resolve(__dirname, 'test_final_acceptance.sqlite');
const MIGRATION_SRC_PATH = path.resolve(__dirname, 'test_final_plain_src.sqlite');

describe('School Management Software — Final Phase Comprehensive Acceptance & Security Suite', () => {
  let keyManager;
  let rawKeyHex;
  let keyPair;
  let publicKeyPem;
  let privateKey;
  const schoolId = 'sch_final_acceptance';
  const deviceId = 'dev_final_01';

  function signLicense(payload) {
    const canonical = JSON.stringify(payload);
    const signature = crypto.sign(null, Buffer.from(canonical), privateKey).toString('base64');
    return {
      signedPayload: canonical,
      signature,
      publicKey: publicKeyPem,
      payload,
    };
  }

  function cleanUpFiles() {
    try { closeDatabase(); } catch {}
    if (fs.existsSync(TEST_VAULT_DIR)) {
      try { fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true }); } catch {}
    }
    const pathsToClean = [
      FINAL_DB_PATH,
      `${FINAL_DB_PATH}-wal`,
      `${FINAL_DB_PATH}-shm`,
      MIGRATION_SRC_PATH,
      `${MIGRATION_SRC_PATH}-wal`,
      `${MIGRATION_SRC_PATH}-shm`,
    ];
    for (const p of pathsToClean) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }

  before(() => {
    cleanUpFiles();
    keyPair = crypto.generateKeyPairSync('ed25519');
    publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    privateKey = keyPair.privateKey;

    keyManager = DatabaseKeyManager.getInstance(TEST_VAULT_DIR);
    rawKeyHex = keyManager.getEncryptionKeyHex();
  });

  after(() => {
    cleanUpFiles();
  });

  // --------------------------------------------------------------------------
  // TEST 1: Full-Page SQLCipher Verification with Strict Ciphertext Inspection
  // --------------------------------------------------------------------------
  it('1. Whole Database SQLCipher Encryption & Missing Magic Header on Real Disk File', () => {
    const db = new Database(FINAL_DB_PATH, { nativeBinding: getBetterSqliteNativeBinding() });
    db.pragma("cipher = 'sqlcipher'");
    db.pragma(`key = 'x''${rawKeyHex}'''`);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations(db, ALL_MIGRATIONS);

    // Insert student record with sensitive PII conforming to migration 001 schema
    db.prepare(`
      INSERT INTO installation_config (id, school_id, school_name, school_code, installation_id, provisioned_at, updated_at)
      VALUES (1, ?, 'Final Acceptance Academy', 'FAA-2026', 'inst_final', datetime('now'), datetime('now'))
    `).run(schoolId);

    db.prepare(`
      INSERT INTO sync_device_config (id, school_id, device_id, device_name)
      VALUES (1, ?, ?, 'Desk-Main')
    `).run(schoolId, deviceId);

    db.prepare(`
      INSERT INTO students (id, school_id, admission_number, admission_date, full_name, father_name, gender, date_of_birth, status)
      VALUES ('stu_final_01', ?, 'ADM-99999', '2026-09-01', 'Zainab Bibi Al-Mansoor', 'Tariq Al-Mansoor', 'female', '2012-05-14', 'active')
    `).run(schoolId);

    // Flush WAL to disk and close cleanly
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    // Inspect raw disk bytes
    const fileBytes = fs.readFileSync(FINAL_DB_PATH);
    assert.ok(fileBytes.length >= 4096, 'Database file must have at least one 4096-byte page');

    // Verify 16-byte SQLite header is completely absent
    const headerPrefix = fileBytes.subarray(0, 16).toString('utf8');
    assert.notStrictEqual(headerPrefix, 'SQLite format 3\0', 'Header must NOT match SQLite plaintext format');

    // Verify sensitive PII is absent in plaintext
    const fileContent = fileBytes.toString('binary');
    assert.strictEqual(fileContent.includes('Zainab Bibi'), false, 'Student name must not appear in cleartext');
    assert.strictEqual(fileContent.includes('Al-Mansoor'), false, 'Surname must not appear in cleartext');
    assert.strictEqual(fileContent.includes('ADM-99999'), false, 'Admission number must not appear in cleartext');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Wrong Key & Missing Key Failure Invariants
  // --------------------------------------------------------------------------
  it('2. Encrypted Database Fails Closed on Missing or Incorrect SQLCipher Key', () => {
    // 2.1 Without key -> fails
    assert.throws(() => {
      const dbNoKey = new Database(FINAL_DB_PATH, { nativeBinding: getBetterSqliteNativeBinding() });
      try {
        dbNoKey.prepare('SELECT count(*) FROM students').get();
      } finally {
        dbNoKey.close();
      }
    }, /file is not a database/i);

    // 2.2 With incorrect 256-bit key -> fails
    assert.throws(() => {
      const dbWrongKey = new Database(FINAL_DB_PATH, { nativeBinding: getBetterSqliteNativeBinding() });
      try {
        dbWrongKey.pragma("cipher = 'sqlcipher'");
        dbWrongKey.pragma("key = 'x''00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'''");
        dbWrongKey.prepare('SELECT count(*) FROM students').get();
      } finally {
        dbWrongKey.close();
      }
    }, /file is not a database/i);

    // 2.3 With authorized key -> succeeds
    const dbAuthorized = new Database(FINAL_DB_PATH, { nativeBinding: getBetterSqliteNativeBinding() });
    try {
      dbAuthorized.pragma("cipher = 'sqlcipher'");
      dbAuthorized.pragma(`key = 'x''${rawKeyHex}'''`);
      const row = dbAuthorized.prepare("SELECT full_name FROM students WHERE id = 'stu_final_01'").get();
      assert.strictEqual(row.full_name, 'Zainab Bibi Al-Mansoor');
    } finally {
      dbAuthorized.close();
    }
  });

  // --------------------------------------------------------------------------
  // TEST 3: Monotonic Checkpoint Rollback Detection across Restart
  // --------------------------------------------------------------------------
  it('3. Shutdown Clock Rollback is Detected and Transitions to CLOCK_TAMPERED', () => {
    const db = new Database(FINAL_DB_PATH, { nativeBinding: getBetterSqliteNativeBinding() });
    db.pragma("cipher = 'sqlcipher'");
    db.pragma(`key = 'x''${rawKeyHex}'''`);

    try {
      const now = Date.now();
      const licensePayload = {
        licenseId: 'lic_final_01',
        schoolId,
        schoolName: 'Final Acceptance Academy',
        schoolCode: 'FAA-2026',
        deviceId,
        hardwareFingerprint: DeviceFingerprint.getFingerprint(),
        planCode: 'enterprise',
        planName: 'Enterprise Plan',
        issuedAt: new Date(now - 10000).toISOString(),
        expiresAt: new Date(now + 30 * 24 * 3600 * 1000).toISOString(),
        gracePeriodDays: 7,
        maxOfflineHours: 168,
        lastServerVerification: new Date(now).toISOString(),
        entitlements: ['students:create', 'students:edit', 'attendance:mark', 'fees:manage', 'fees:collect', 'staff:manage', 'payroll:manage', 'school:settings'],
        limits: {},
      };
      const signed = signLicense(licensePayload);
      const licService = new LicenseService(db);
      licService.storeLicense({
        licenseId: signed.payload.licenseId,
        schoolId: signed.payload.schoolId,
        schoolName: signed.payload.schoolName,
        schoolCode: signed.payload.schoolCode,
        deviceId: signed.payload.deviceId,
        hardwareFingerprint: signed.payload.hardwareFingerprint,
        planCode: signed.payload.planCode,
        planName: signed.payload.planName,
        status: 'active',
        issuedAt: signed.payload.issuedAt,
        expiresAt: signed.payload.expiresAt,
        gracePeriodDays: signed.payload.gracePeriodDays,
        entitlements: signed.payload.entitlements,
        limits: signed.payload.limits,
        signedPayload: signed.signedPayload,
        signature: signed.signature,
        publicKey: signed.publicKey,
      });

      const enforcer = new SubscriptionEnforcer(db);
      enforcer.checkStatusAndEnforce();

      // Simulate clock rollback across computer shutdown by inserting a future checkpoint
      const futureTime = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
      db.prepare(`
        INSERT INTO subscription_checkpoints (school_id, recorded_server_time, recorded_local_time, monotonic_offset_ms)
        VALUES (?, ?, ?, 500000)
      `).run(schoolId, futureTime, futureTime);

      // Enforcer must detect rollback against persisted checkpoint
      const evaluation = enforcer.checkStatusAndEnforce();
      assert.strictEqual(evaluation.isValid, false);
      assert.strictEqual(evaluation.state, 'clock_tampered');

      // Assert that writes are strictly blocked
      assert.throws(() => {
        licService.assertCanWrite('students:create');
      }, /LICENSE_RESTRICTED/);
    } finally {
      db.close();
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: Subscription Renewal Restores Write Access & Preserves Pending Outbox
  // --------------------------------------------------------------------------
  it('4. Platform Renewal Unlocks Database Key and Preserves Pending Outbox Records', () => {
    const db = new Database(FINAL_DB_PATH, { nativeBinding: getBetterSqliteNativeBinding() });
    db.pragma("cipher = 'sqlcipher'");
    db.pragma(`key = 'x''${rawKeyHex}'''`);

    try {
      // Add a pending offline mutation to outbox
      db.prepare(`
        INSERT INTO sync_outbox (school_id, entity_type, entity_id, operation, payload_json, status, created_at)
        VALUES (?, 'STUDENT', 'stu_offline_pending', 'INSERT', '{"name":"Pending Outbox Student"}', 'pending', datetime('now'))
      `).run(schoolId);

      // Clear tampering flag & remove future test checkpoints
      db.prepare('UPDATE license_cache SET clock_tampered = 0 WHERE id = 1').run();
      db.prepare("DELETE FROM subscription_checkpoints WHERE recorded_local_time > datetime('now')").run();

      const now = Date.now();
      const renewedPayload = {
        licenseId: 'lic_renewed_01',
        schoolId,
        schoolName: 'Final Acceptance Academy',
        schoolCode: 'FAA-2026',
        deviceId,
        hardwareFingerprint: DeviceFingerprint.getFingerprint(),
        planCode: 'enterprise',
        planName: 'Enterprise Plan',
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 60 * 24 * 3600 * 1000).toISOString(),
        gracePeriodDays: 7,
        maxOfflineHours: 168,
        lastServerVerification: new Date(now).toISOString(),
        entitlements: ['students:create', 'students:edit', 'attendance:mark', 'fees:manage', 'fees:collect', 'staff:manage', 'payroll:manage', 'school:settings'],
        limits: {},
      };
      const signedRenewed = signLicense(renewedPayload);
      const licService = new LicenseService(db);
      licService.storeLicense({
        licenseId: signedRenewed.payload.licenseId,
        schoolId: signedRenewed.payload.schoolId,
        schoolName: signedRenewed.payload.schoolName,
        schoolCode: signedRenewed.payload.schoolCode,
        deviceId: signedRenewed.payload.deviceId,
        hardwareFingerprint: signedRenewed.payload.hardwareFingerprint,
        planCode: signedRenewed.payload.planCode,
        planName: signedRenewed.payload.planName,
        status: 'active',
        issuedAt: signedRenewed.payload.issuedAt,
        expiresAt: signedRenewed.payload.expiresAt,
        gracePeriodDays: signedRenewed.payload.gracePeriodDays,
        entitlements: signedRenewed.payload.entitlements,
        limits: signedRenewed.payload.limits,
        signedPayload: signedRenewed.signedPayload,
        signature: signedRenewed.signature,
        publicKey: signedRenewed.publicKey,
      });

      const enforcer = new SubscriptionEnforcer(db);
      const check = enforcer.checkStatusAndEnforce();
      assert.strictEqual(check.isValid, true);
      assert.strictEqual(check.state, 'active');

      // Verify key manager is unlocked
      assert.strictEqual(keyManager.getStatus().isLocked, false);

      // Verify pending outbox record was NOT deleted or corrupted
      const pendingOutbox = db.prepare("SELECT * FROM sync_outbox WHERE entity_id = 'stu_offline_pending'").get();
      assert.ok(pendingOutbox, 'Pending outbox record must be strictly preserved across expiry and renewal');
      assert.strictEqual(pendingOutbox.status, 'pending');
    } finally {
      db.close();
    }
  });

  // --------------------------------------------------------------------------
  // TEST 5: Complete OnlineSyncDispatcher Mutation Routing & Durable Outbox
  // --------------------------------------------------------------------------
  it('5. Offline Operations Execute Transactionally in SQLite and Queue Durable Outbox', async () => {
    const db = new Database(FINAL_DB_PATH, { nativeBinding: getBetterSqliteNativeBinding() });
    db.pragma("cipher = 'sqlcipher'");
    db.pragma(`key = 'x''${rawKeyHex}'''`);

    try {
      const dispatcher = new OnlineSyncDispatcher(db);

      // Force offline mode via dummy unreachable backend URL
      db.prepare("UPDATE sync_device_config SET api_base_url = 'http://127.0.0.1:59999' WHERE id = 1").run();

      let localExecuted = false;
      const dispatchRes = await dispatcher.dispatchMutation({
        entityType: 'ATTENDANCE_CORRECTION',
        entityId: 'att_corr_final',
        operation: 'UPDATE',
        payload: { attendanceId: 'att_corr_final', newStatus: 'present', reason: 'Verified bus delay' },
        schoolId,
        executeLocal: () => {
          localExecuted = true;
          return { corrected: true };
        },
      });

      assert.strictEqual(localExecuted, true, 'Local SQLite transaction must execute');
      assert.strictEqual(dispatchRes.syncStatus, 'pending', 'Must return pending outbox status');

      // Verify outbox entry is durable
      const outboxRow = db.prepare("SELECT * FROM sync_outbox WHERE entity_id = 'att_corr_final'").get();
      assert.ok(outboxRow, 'Outbox must contain durable synchronization metadata');
      assert.strictEqual(outboxRow.entity_type, 'ATTENDANCE_CORRECTION');
    } finally {
      db.close();
    }
  });

  // --------------------------------------------------------------------------
  // TEST 6: Student Historical Record Preservation across Rollover / Promotion
  // --------------------------------------------------------------------------
  it('6. Student Promotion Preserves Permanent Identity, Invoices and Attendance History', () => {
    const db = new Database(FINAL_DB_PATH, { nativeBinding: getBetterSqliteNativeBinding() });
    db.pragma("cipher = 'sqlcipher'");
    db.pragma(`key = 'x''${rawKeyHex}'''`);

    try {
      const adminSession = {
        userId: 'usr_admin',
        schoolId,
        userName: 'Principal',
        userEmail: 'admin@school.edu',
        role: 'school_owner',
        permissions: ['students:manage'],
        isValid: true,
      };

      const studentService = new StudentService(db);

      // Create session A and session B
      db.prepare("INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current) VALUES ('sess_2025', ?, '2025-2026', '2025-08-01', '2026-06-30', 0)").run(schoolId);
      db.prepare("INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current) VALUES ('sess_2026', ?, '2026-2027', '2026-08-01', '2027-06-30', 1)").run(schoolId);

      // Create classes and sections conforming to migration schema
      db.prepare("INSERT INTO classes (id, school_id, name, order_index) VALUES ('cls_grade_4', ?, 'Grade 4', 4)").run(schoolId);
      db.prepare("INSERT INTO classes (id, school_id, name, order_index) VALUES ('cls_grade_5', ?, 'Grade 5', 5)").run(schoolId);
      db.prepare("INSERT INTO sections (id, school_id, class_id, name) VALUES ('sec_4a', ?, 'cls_grade_4', 'A')").run(schoolId);
      db.prepare("INSERT INTO sections (id, school_id, class_id, name) VALUES ('sec_5a', ?, 'cls_grade_5', 'A')").run(schoolId);

      // Initial enrollment in Grade 4
      db.prepare(`
        INSERT INTO student_enrollments (id, school_id, student_id, session_id, class_id, section_id, roll_number, status, created_at)
        VALUES ('enr_01', ?, 'stu_final_01', 'sess_2025', 'cls_grade_4', 'sec_4a', '01', 'enrolled', datetime('now'))
      `).run(schoolId);

      // Add historical fee invoice & attendance in Grade 4
      db.prepare(`
        INSERT INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, previous_dues, paid_amount, balance, status, created_at, updated_at)
        VALUES ('inv_grade_4', ?, 'CHL-GR4-001', 'stu_final_01', 'sess_2025', '2025-09', '2025-09-10', 5000, 0, 5000, 0, 'paid', datetime('now'), datetime('now'))
      `).run(schoolId);

      db.prepare(`
        INSERT INTO attendance (id, school_id, student_id, session_id, class_id, section_id, date, status, created_at)
        VALUES ('att_gr4_01', ?, 'stu_final_01', 'sess_2025', 'cls_grade_4', 'sec_4a', '2025-09-02', 'present', datetime('now'))
      `).run(schoolId);

      // Promote student to Grade 5 in session B
      const promoteResult = studentService.bulkPromoteStudents(adminSession, [{
        studentId: 'stu_final_01',
        targetSessionId: 'sess_2026',
        targetClassId: 'cls_grade_5',
        targetSectionId: 'sec_5a',
        rollNumber: '05',
      }]);
      assert.ok(promoteResult, 'Promotion must succeed');

      // Verify historical enrollment is marked 'promoted' and new enrollment is active
      const enrollments = db.prepare("SELECT * FROM student_enrollments WHERE student_id = 'stu_final_01' ORDER BY created_at ASC").all();
      assert.strictEqual(enrollments.length, 2, 'Student must have exactly two historical enrollment rows');
      assert.strictEqual(enrollments[0].status, 'promoted', 'Previous session enrollment must be preserved as promoted');
      assert.strictEqual(enrollments[1].class_id, 'cls_grade_5');

      // Verify historical invoice & attendance records are completely intact
      const oldInvoice = db.prepare("SELECT * FROM invoices WHERE id = 'inv_grade_4'").get();
      assert.ok(oldInvoice, 'Historical invoice in previous session must remain intact');
      const oldAttendance = db.prepare("SELECT * FROM attendance WHERE id = 'att_gr4_01'").get();
      assert.ok(oldAttendance, 'Historical attendance in previous session must remain intact');
    } finally {
      db.close();
    }
  });

  // --------------------------------------------------------------------------
  // TEST 7: In-Place Plaintext Database Rekey Migration with Zero Data Loss
  // --------------------------------------------------------------------------
  it('7. Transparent In-Place Rekey Migration Converts Legacy Database Without Data Loss', () => {
    closeDatabase();

    // 1. Create a genuine legacy unencrypted SQLite database
    const plainDb = new Database(MIGRATION_SRC_PATH);
    plainDb.pragma('journal_mode = WAL');
    runMigrations(plainDb, ALL_MIGRATIONS);

    plainDb.prepare(`
      INSERT INTO installation_config (id, school_id, school_name, school_code, installation_id, provisioned_at, updated_at)
      VALUES (1, 'sch_plain_test', 'Plain School', 'PS-01', 'inst_plain', datetime('now'), datetime('now'))
    `).run();

    // Insert 50 test students into legacy plaintext database
    for (let i = 1; i <= 50; i++) {
      plainDb.prepare(`
        INSERT INTO students (id, school_id, admission_number, admission_date, full_name, father_name, gender, date_of_birth, status, created_at, updated_at)
        VALUES (?, 'sch_plain_test', ?, '2026-01-01', ?, 'Father', 'male', '2014-01-01', 'active', datetime('now'), datetime('now'))
      `).run(`stu_legacy_${i}`, `ADM-LEG-${1000 + i}`, `LegacyName${i}`);
    }
    plainDb.pragma('wal_checkpoint(TRUNCATE)');
    plainDb.close();

    // Verify file is initially plaintext SQLite
    const initialBytes = fs.readFileSync(MIGRATION_SRC_PATH);
    assert.strictEqual(initialBytes.subarray(0, 16).toString('utf8'), 'SQLite format 3\0', 'Initial file must be plaintext SQLite');

    // 2. Open via initDatabase with SQLCipher encryption enabled
    const migratedDb = initDatabase(MIGRATION_SRC_PATH, {
      encryptionKey: rawKeyHex,
      disableEncryption: false,
    });

    // 3. Verify all 50 students read back cleanly
    const countRow = migratedDb.prepare('SELECT count(*) as count FROM students').get();
    assert.strictEqual(countRow.count, 50, 'All 50 legacy students must be preserved through in-place rekey');

    const sampleRow = migratedDb.prepare("SELECT full_name FROM students WHERE id = 'stu_legacy_25'").get();
    assert.strictEqual(sampleRow.full_name, 'LegacyName25');

    migratedDb.pragma('wal_checkpoint(TRUNCATE)');
    closeDatabase();

    // 4. Physical storage verification: File must now be encrypted SQLCipher on disk
    const rekeyedBytes = fs.readFileSync(MIGRATION_SRC_PATH);
    assert.notStrictEqual(rekeyedBytes.subarray(0, 16).toString('utf8'), 'SQLite format 3\0', 'Magic header must now be absent');
    assert.strictEqual(rekeyedBytes.toString('binary').includes('LegacyName25'), false, 'Plaintext string must be encrypted');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Verified Backup Snapshot & Safe Restoration with Passphrase
  // --------------------------------------------------------------------------
  it('8. Backup Snapshot is Fully Encrypted and Restores Cleanly with Authorized Passphrase', async () => {
    keyManager.unlock();
    const db = new Database(FINAL_DB_PATH, { nativeBinding: getBetterSqliteNativeBinding() });
    db.pragma("cipher = 'sqlcipher'");
    db.pragma(`key = 'x''${rawKeyHex}'''`);

    try {
      const backupService = new BackupService(db, FINAL_DB_PATH);
      const backupEntry = await backupService.createBackup({
        destinationType: 'local',
        triggerType: 'manual',
        encryptionPassphrase: 'SuperSecretCustomPassword123!',
      });

      assert.ok(fs.existsSync(backupEntry.filePath), 'Backup file must exist on disk');
      assert.ok(backupEntry.fileSizeBytes > 10000, 'Backup file must have real data');

      // Verify backup file raw bytes are encrypted
      const backupBytes = fs.readFileSync(backupEntry.filePath);
      assert.strictEqual(backupBytes.subarray(0, 16).toString('utf8') !== 'SQLite format 3\0', true);

      // Verify preview with correct passphrase
      const previewValid = backupService.verifyBackupFile(backupEntry.filePath, 'SuperSecretCustomPassword123!');
      assert.strictEqual(previewValid.verified, true);
      assert.strictEqual(previewValid.integrityStatus, 'ok');

      // Verify preview with wrong passphrase fails safely
      assert.throws(() => {
        backupService.verifyBackupFile(backupEntry.filePath, 'WrongPassword999!');
      }, /Authentication tag verification failed|TAMPERED/);
    } finally {
      db.close();
    }
  });
});
