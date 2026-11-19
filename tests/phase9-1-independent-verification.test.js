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
const { OnlineSyncDispatcher } = require('../dist/main/sync/online-sync-dispatcher.js');
const { DeviceFingerprint } = require('../dist/main/security/device-fingerprint.js');

const TEST_VAULT_DIR = path.resolve(__dirname, 'test_p91_vault');
const ENCRYPTED_DB_PATH = path.resolve(__dirname, 'test_p91_encrypted.sqlite');
const MIGRATION_SRC_DB_PATH = path.resolve(__dirname, 'test_p91_plain_migrate.sqlite');

describe('School Management Software — Phase 9.1 Independent Security & Whole-Database Encryption Suite', () => {
  let keyManager;
  let rawKeyHex;
  let keyPair;
  let publicKeyPem;
  let privateKey;
  const schoolId = 'sch_sultan_p91';
  const deviceId = 'dev_sms_p91_01';

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

  before(() => {
    // Clean up any test artifacts
    if (fs.existsSync(TEST_VAULT_DIR)) fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true });
    if (fs.existsSync(ENCRYPTED_DB_PATH)) fs.unlinkSync(ENCRYPTED_DB_PATH);
    if (fs.existsSync(`${ENCRYPTED_DB_PATH}-wal`)) fs.unlinkSync(`${ENCRYPTED_DB_PATH}-wal`);
    if (fs.existsSync(`${ENCRYPTED_DB_PATH}-shm`)) fs.unlinkSync(`${ENCRYPTED_DB_PATH}-shm`);
    if (fs.existsSync(MIGRATION_SRC_DB_PATH)) fs.unlinkSync(MIGRATION_SRC_DB_PATH);

    // Generate real Ed25519 signing keypair for cloud license authority
    keyPair = crypto.generateKeyPairSync('ed25519');
    publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    privateKey = keyPair.privateKey;

    keyManager = DatabaseKeyManager.getInstance(TEST_VAULT_DIR);
    rawKeyHex = keyManager.getEncryptionKeyHex();
  });

  after(() => {
    closeDatabase();
    if (fs.existsSync(TEST_VAULT_DIR)) fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true });
    if (fs.existsSync(ENCRYPTED_DB_PATH)) fs.unlinkSync(ENCRYPTED_DB_PATH);
    if (fs.existsSync(`${ENCRYPTED_DB_PATH}-wal`)) fs.unlinkSync(`${ENCRYPTED_DB_PATH}-wal`);
    if (fs.existsSync(`${ENCRYPTED_DB_PATH}-shm`)) fs.unlinkSync(`${ENCRYPTED_DB_PATH}-shm`);
    if (fs.existsSync(MIGRATION_SRC_DB_PATH)) fs.unlinkSync(MIGRATION_SRC_DB_PATH);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. WHOLE-DATABASE SQLCIPHER ENCRYPTION VERIFICATION
  // ───────────────────────────────────────────────────────────────────────────

  it('1.1 Whole Database Page Encryption: Creates encrypted SQLite database on disk', () => {
    closeDatabase();
    const encDb = initDatabase(ENCRYPTED_DB_PATH, { vaultDir: TEST_VAULT_DIR });
    assert.ok(encDb);

    // Seed sensitive student and financial records with complete required fields
    encDb.exec(`
      INSERT INTO installation_config (id, school_id, school_name, school_code, installation_id, provisioned_at, updated_at)
      VALUES (1, '${schoolId}', 'Sultan Bahu Model High School', 'SBMHS', 'inst_p91', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET school_id = excluded.school_id;

      INSERT INTO sync_device_config (id, school_id, device_id, device_name, api_base_url, device_status, updated_at)
      VALUES (1, '${schoolId}', '${deviceId}', 'Primary Workstation', 'http://127.0.0.1:4000', 'registered', datetime('now'))
      ON CONFLICT(id) DO UPDATE SET device_id = excluded.device_id;

      INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current)
      VALUES ('ses_p91', '${schoolId}', '2026-2027 Academic Year', '2026-04-01', '2027-03-31', 1)
      ON CONFLICT(id) DO NOTHING;

      INSERT INTO classes (id, school_id, name, order_index)
      VALUES ('cls_p91', '${schoolId}', 'Grade 10 Matriculation', 10)
      ON CONFLICT(id) DO NOTHING;

      INSERT INTO sections (id, school_id, class_id, name)
      VALUES ('sec_p91', '${schoolId}', 'cls_p91', 'Section Alpha')
      ON CONFLICT(id) DO NOTHING;

      INSERT INTO students (
        id, school_id, admission_number, admission_date, full_name, father_name,
        date_of_birth, gender, status
      ) VALUES (
        'stu_secret_999', '${schoolId}', 'ADM-999-SECRET', '2026-09-01', 'Zainab Bibi Sultan', 'Tariq Sultan',
        '2010-04-12', 'female', 'active'
      )
      ON CONFLICT(id) DO NOTHING;

      INSERT INTO student_enrollments (id, school_id, student_id, session_id, class_id, section_id, roll_number, status)
      VALUES ('enr_p91', '${schoolId}', 'stu_secret_999', 'ses_p91', 'cls_p91', 'sec_p91', 'ROLL-10-01', 'enrolled')
      ON CONFLICT(id) DO NOTHING;
    `);

    // Verify row is readable inside active connection
    const student = encDb.prepare('SELECT * FROM students WHERE id = ?').get('stu_secret_999');
    assert.strictEqual(student.full_name, 'Zainab Bibi Sultan');

    closeDatabase();
  });

  it('1.2 Physical Storage Inspection: Raw disk bytes have encrypted pages and no SQLite header', () => {
    assert.strictEqual(fs.existsSync(ENCRYPTED_DB_PATH), true);
    const fileBytes = fs.readFileSync(ENCRYPTED_DB_PATH);
    const fileContent = fileBytes.toString('latin1');

    // 1. The standard plaintext SQLite 16-byte magic header must NOT exist
    const headerPrefix = fileBytes.subarray(0, 16).toString('utf8');
    assert.strictEqual(
      headerPrefix.includes('SQLite format 3'),
      false,
      'Encrypted database file must NOT start with standard SQLite format 3 header'
    );

    // 2. Sensitive plaintext student and parent names must NOT appear in raw disk pages
    assert.strictEqual(fileContent.includes('Zainab Bibi Sultan'), false, 'Student name found in plaintext raw DB pages!');
    assert.strictEqual(fileContent.includes('Tariq Sultan'), false, 'Parent name found in plaintext raw DB pages!');
    assert.strictEqual(fileContent.includes('ADM-999-SECRET'), false, 'Admission number found in plaintext raw DB pages!');
    assert.strictEqual(fileContent.includes('Sultan Bahu Model High School'), false, 'School name found in plaintext raw DB pages!');
  });

  it('1.3 Security Boundary: Opening encrypted database without key fails closed', () => {
    const rawPlainDb = new Database(ENCRYPTED_DB_PATH);
    try {
      assert.throws(
        () => {
          rawPlainDb.prepare('SELECT count(*) FROM students').get();
        },
        /file is not a database/,
        'Opening encrypted database without key pragma must throw "file is not a database"'
      );
    } finally {
      rawPlainDb.close();
    }
  });

  it('1.4 Security Boundary: Opening encrypted database with wrong key fails closed', () => {
    const wrongKeyDb = new Database(ENCRYPTED_DB_PATH);
    try {
      wrongKeyDb.pragma("cipher = 'sqlcipher'");
      wrongKeyDb.pragma("key = 'x''ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'''");
      assert.throws(
        () => {
          wrongKeyDb.prepare('SELECT count(*) FROM students').get();
        },
        /file is not a database/,
        'Opening encrypted database with wrong key must fail closed'
      );
    } finally {
      wrongKeyDb.close();
    }
  });

  it('1.5 Authorized Key Access: Opening with authorized key succeeds and reads back records', () => {
    const authorizedDb = new Database(ENCRYPTED_DB_PATH);
    try {
      authorizedDb.pragma("cipher = 'sqlcipher'");
      authorizedDb.pragma(`key = 'x''${rawKeyHex}'''`);
      const row = authorizedDb.prepare('SELECT * FROM students WHERE id = ?').get('stu_secret_999');
      assert.ok(row);
      assert.strictEqual(row.full_name, 'Zainab Bibi Sultan');
      assert.strictEqual(row.admission_number, 'ADM-999-SECRET');
    } finally {
      authorizedDb.close();
    }
  });

  it('1.6 In-Place Migration: Automatically rekeys legacy plaintext SQLite database into encrypted database', () => {
    closeDatabase();

    // 1. Create a legacy unencrypted SQLite database
    const plainDb = new Database(MIGRATION_SRC_DB_PATH);
    plainDb.exec(`
      CREATE TABLE legacy_records (id TEXT PRIMARY KEY, confidential_info TEXT);
      INSERT INTO legacy_records VALUES ('rec_01', 'Confidential Student Dossier');
    `);
    plainDb.close();

    // Verify file is plaintext SQLite format 3 before migration
    const beforeBytes = fs.readFileSync(MIGRATION_SRC_DB_PATH);
    assert.strictEqual(beforeBytes.subarray(0, 15).toString('utf8'), 'SQLite format 3');
    assert.strictEqual(beforeBytes.toString('latin1').includes('Confidential Student Dossier'), true);

    // 2. Open via initDatabase with encryption enabled -> triggers in-place rekey
    const migratedDb = initDatabase(MIGRATION_SRC_DB_PATH, { vaultDir: TEST_VAULT_DIR });
    const checkRow = migratedDb.prepare('SELECT * FROM legacy_records WHERE id = ?').get('rec_01');
    assert.strictEqual(checkRow.confidential_info, 'Confidential Student Dossier');
    closeDatabase();

    // 3. Verify file on disk is now page-encrypted!
    const afterBytes = fs.readFileSync(MIGRATION_SRC_DB_PATH);
    assert.strictEqual(afterBytes.subarray(0, 15).toString('utf8').includes('SQLite format 3'), false);
    assert.strictEqual(afterBytes.toString('latin1').includes('Confidential Student Dossier'), false);

    // 4. Verify opening without key fails
    const failDb = new Database(MIGRATION_SRC_DB_PATH);
    try {
      assert.throws(() => { failDb.prepare('SELECT * FROM legacy_records').all(); }, /file is not a database/);
    } finally {
      failDb.close();
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. SUBSCRIPTION EXPIRY, MONOTONIC CHECKPOINTS & CLOCK INTEGRITY
  // ───────────────────────────────────────────────────────────────────────────

  it('2.1 Subscription Checkpoints: Enforcer records monotonic checkpoints with server time anchor', () => {
    closeDatabase();
    keyManager.unlock();
    const db = initDatabase(ENCRYPTED_DB_PATH, { vaultDir: TEST_VAULT_DIR });

    const deviceFp = DeviceFingerprint.getFingerprint();
    const licensePayload = {
      licenseId: 'lic_p91',
      schoolId,
      schoolName: 'Sultan Bahu Model High School',
      schoolCode: 'SBMHS',
      deviceId,
      hardwareFingerprint: deviceFp,
      planCode: 'pro',
      planName: 'Professional Plan',
      status: 'active',
      issuedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      gracePeriodDays: 7,
      entitlements: ['students:edit', 'fees:manage'],
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
      hardwareFingerprint: deviceFp,
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

    const enforcer = SubscriptionEnforcer.getInstance(db);
    const check = enforcer.checkStatusAndEnforce();
    assert.strictEqual(check.isValid, true);

    const count = db.prepare('SELECT count(*) as c FROM subscription_checkpoints').get().c;
    assert.ok(count >= 1, 'subscription_checkpoints must record active checkpoints');

    const checkpoint = db.prepare('SELECT * FROM subscription_checkpoints ORDER BY id DESC LIMIT 1').get();
    assert.ok(checkpoint.recorded_server_time);
    assert.ok(checkpoint.recorded_local_time);
    assert.ok(checkpoint.monotonic_offset_ms >= 0);
  });

  it('2.2 Shutdown Clock Rollback Detection: Fails closed when clock rolled back while computer turned off', () => {
    closeDatabase();
    keyManager.unlock();
    const db = initDatabase(ENCRYPTED_DB_PATH, { vaultDir: TEST_VAULT_DIR });

    // Seed future checkpoint simulating computer turned off and clock moved 5 hours backward
    const futureTime = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    db.prepare(`
      INSERT INTO subscription_checkpoints (school_id, recorded_server_time, recorded_local_time, monotonic_offset_ms)
      VALUES (?, ?, ?, 5000)
    `).run(schoolId, futureTime, futureTime);

    const enforcer = new SubscriptionEnforcer(db);
    const result = enforcer.checkStatusAndEnforce();

    assert.strictEqual(result.isValid, false, 'Startup with clock set behind previous checkpoint must fail closed');
    assert.strictEqual(result.state, 'clock_tampered');

    // Verify key manager locked
    assert.strictEqual(keyManager.getStatus().isLocked, true);
    assert.throws(() => keyManager.getKey(), /SUBSCRIPTION_EXPIRED_KEY_LOCKED/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. WORKSTATION HARDWARE REPLACEMENT & ADMINISTRATIVE RE-BINDING
  // ───────────────────────────────────────────────────────────────────────────

  it('3.1 Hardware Isolation: Mismatched hardware fingerprint blocks DEK unsealing', () => {
    assert.throws(
      () => {
        keyManager.reactivateHardwareBinding('new_hw_fp_replacement', '', schoolId);
      },
      /INVALID_AUTHORIZATION/,
      'Reactivation without authorized cloud token must fail'
    );
  });

  it('3.2 Administrative Re-binding: Valid cloud reactivation token re-binds DEK to new hardware', () => {
    const newHardwareFp = 'fp_replacement_motherboard_999';
    const validCloudToken = 'tok_cloud_admin_authorized_' + crypto.randomBytes(8).toString('hex');

    // Admin executes hardware re-binding
    keyManager.reactivateHardwareBinding(newHardwareFp, validCloudToken, schoolId);

    // Key is unlocked and restored
    assert.strictEqual(keyManager.getStatus().isLocked, false);
    assert.strictEqual(keyManager.getEncryptionKeyHex().length, 64);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. SYNCHRONIZATION COMPLETENESS ACROSS ALL REWIRED MUTATION HANDLERS
  // ───────────────────────────────────────────────────────────────────────────

  it('4.1 Rewired Mutation Dispatcher: Bulk student promotion & fee reverse route through OnlineSyncDispatcher', async () => {
    closeDatabase();
    // Re-bind to current device fingerprint for normal operations
    keyManager.reactivateHardwareBinding(DeviceFingerprint.getFingerprint(), 'tok_reset', schoolId);
    const db = initDatabase(ENCRYPTED_DB_PATH, { vaultDir: TEST_VAULT_DIR });
    const dispatcher = new OnlineSyncDispatcher(db);

    const sessionUser = {
      isValid: true,
      userId: 'usr_p91_admin',
      schoolId,
      userName: 'Principal',
      role: 'school_owner',
      permissions: ['students:edit', 'fees:manage', 'fees:reverse'],
    };

    // 1. Offline Bulk Promotion
    const promoRes = await dispatcher.dispatchMutation({
      entityType: 'STUDENT_BULK_PROMOTION',
      entityId: `bp_${Date.now()}`,
      operation: 'UPDATE',
      payload: { studentId: 'stu_secret_999', targetClassId: 'cls_p91' },
      schoolId,
      isOnline: false,
      executeLocal: () => ({ success: true, promotedCount: 1 }),
    });

    assert.strictEqual(promoRes.syncStatus, 'pending');
    assert.strictEqual(promoRes.result.promotedCount, 1);

    // Verify outbox entry created
    const promoOutbox = db.prepare('SELECT * FROM sync_outbox WHERE entity_type = ?').get('STUDENT_BULK_PROMOTION');
    assert.ok(promoOutbox);
    assert.strictEqual(promoOutbox.status, 'pending');

    // 2. Offline Fee Reversal
    const revRes = await dispatcher.dispatchMutation({
      entityType: 'PAYMENT_REVERSAL',
      entityId: `pay_rev_${Date.now()}`,
      operation: 'UPDATE',
      payload: { paymentId: 'pay_01', reason: 'Cheque bounced' },
      schoolId,
      isOnline: false,
      executeLocal: () => ({ success: true, restoredBalance: 5000, reversalPaymentId: 'rev_99' }),
    });

    assert.strictEqual(revRes.syncStatus, 'pending');
    assert.strictEqual(revRes.result.restoredBalance, 5000);

    const revOutbox = db.prepare('SELECT * FROM sync_outbox WHERE entity_type = ?').get('PAYMENT_REVERSAL');
    assert.ok(revOutbox);
    assert.strictEqual(revOutbox.status, 'pending');
  });
});
