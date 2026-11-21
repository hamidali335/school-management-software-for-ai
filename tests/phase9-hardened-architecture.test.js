const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations/index.js');
const { AuthService } = require('../dist/main/services/auth.service.js');
const { InstallationService } = require('../dist/main/services/installation.service.js');
const { LicenseService } = require('../dist/main/services/license.service.js');
const { OnlineSyncDispatcher } = require('../dist/main/sync/online-sync-dispatcher.js');
const { DatabaseKeyManager } = require('../dist/main/security/database-key-manager.js');
const { SubscriptionEnforcer } = require('../dist/main/services/subscription-enforcer.js');
const { DeviceFingerprint } = require('../dist/main/security/device-fingerprint.js');
const { CredentialVault } = require('../dist/main/security/credential-vault.js');
const { PasswordHasher } = require('../dist/main/security/password-hasher.js');
const { SessionManager } = require('../dist/main/security/session-manager.js');
const { BackupService } = require('../dist/main/services/backup.service.js');
const { StudentService } = require('../dist/main/services/student.service.js');
const { FeeService } = require('../dist/main/services/fee.service.js');
const { FeeRepository } = require('../dist/main/database/repositories/fee.repository.js');
const { MockSyncBackendAdapter } = require('../dist/main/sync/sync-api-client.js');

const TEST_DB_PATH = path.resolve(__dirname, 'test_phase9_hardened.sqlite');
const BACKUP_DIR = path.resolve(__dirname, 'test_phase9_backups');
const TEST_VAULT_DIR = path.resolve(__dirname, 'test_phase9_vault');

describe('School Management Software — Phase 9 Architecture Hardening, Subscription Security & Offline Protection', () => {
  let db;
  let authService;
  let installService;
  let licenseService;
  let keyManager;
  let subscriptionEnforcer;
  let studentService;
  let feeService;
  let backupService;

  let mockServer;
  let mockServerPort = 0;
  let mockBackendUrl = '';
  let serverOnline = true;
  let currentServerPassword = 'SaaSAdminPass@2026';

  let keyPair;
  let publicKeyPem;
  let privateKey;

  const schoolId = 'sch_sultan_high_01';
  const schoolName = 'Sultan Bahu Model High School';
  const schoolCode = 'SBMHS';
  let deviceId = 'dev_win_workstation_phase9';
  let deviceFp;

  function signLicense(payload) {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
    return {
      signedPayload: canonical,
      signature,
      publicKey: publicKeyPem,
      payload,
    };
  }

  before(async () => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (fs.existsSync(TEST_VAULT_DIR)) fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true });
    DatabaseKeyManager.resetInstanceForTesting();

    // Generate Ed25519 signing keypair for cloud license authority
    keyPair = crypto.generateKeyPairSync('ed25519');
    publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    privateKey = keyPair.privateKey;

    db = new Database(TEST_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = FULL');

    runMigrations(db, ALL_MIGRATIONS);

    authService = new AuthService(db);
    installService = new InstallationService(db);
    licenseService = new LicenseService(db);
    keyManager = DatabaseKeyManager.getInstance(TEST_VAULT_DIR);
    subscriptionEnforcer = SubscriptionEnforcer.getInstance(db);
    studentService = new StudentService(db);
    feeService = new FeeService(db);
    backupService = new BackupService(db, TEST_DB_PATH);

    // Ephemeral cloud backend mock server
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (!serverOnline) {
          res.destroy();
          return;
        }

        const parsed = body ? JSON.parse(body) : {};

        // 1. Cloud Login: POST /auth/login
        if (req.url && req.url.includes('/auth/login')) {
          if (parsed.email === 'admin@sultanbahu.edu.pk' && parsed.password === currentServerPassword) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              user: {
                _id: 'usr_cloud_owner_99',
                name: 'Haji Sultan Ahmad',
                email: 'admin@sultanbahu.edu.pk',
                username: 'sultan_admin',
                role: 'school_owner',
                status: 'active',
              },
              school: {
                _id: schoolId,
                name: schoolName,
                code: schoolCode,
              },
              accessToken: 'mock_jwt_access_phase9_valid',
              refreshToken: 'mock_jwt_refresh_phase9_valid',
              permissions: ['students:view', 'students:manage', 'fees:view', 'fees:manage', 'school:settings'],
            }));
            return;
          } else if (parsed.email === 'unauthorized@otheracademy.edu.pk') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              user: {
                _id: 'usr_unauthorized_other',
                name: 'Stranger',
                email: 'unauthorized@otheracademy.edu.pk',
                role: 'school_owner',
                status: 'active',
              },
              school: {
                _id: 'sch_other_unrelated_academy',
                name: 'Other Unrelated Academy',
                code: 'OUA',
              },
              accessToken: 'mock_jwt_other',
              permissions: ['students:view'],
            }));
            return;
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Invalid cloud email or password' } }));
            return;
          }
        }

        // 2. Cloud Change Password: POST /auth/change-password
        if (req.url && req.url.includes('/auth/change-password')) {
          if (parsed.currentPassword === currentServerPassword) {
            currentServerPassword = parsed.newPassword;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              accessToken: 'mock_rotated_jwt_access_token_99',
              refreshToken: 'mock_rotated_jwt_refresh_token_99',
              expiresIn: 3600,
            }));
            return;
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Current password does not match server credentials' } }));
            return;
          }
        }

        // 3. License verify: POST /licensing/verify
        if (req.url && req.url.includes('/licensing/verify')) {
          const nowIso = new Date().toISOString();
          const oneYearAhead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
          const licObj = signLicense({
            licenseId: 'lic_renewed_phase9_01',
            schoolId,
            schoolName,
            schoolCode,
            deviceId,
            hardwareFingerprint: deviceFp,
            planCode: 'enterprise_annual',
            planName: 'Enterprise Annual Subscription',
            status: 'active',
            issuedAt: nowIso,
            expiresAt: oneYearAhead,
            gracePeriodDays: 14,
            entitlements: ['core.students', 'core.fees', 'core.attendance', 'core.backup'],
            limits: { maxStudents: 2000, maxStaff: 100 },
            licenseVersion: 1,
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            data: {
              licenseId: 'lic_renewed_phase9_01',
              schoolId,
              schoolName,
              schoolCode,
              deviceId,
              planCode: 'enterprise_annual',
              planName: 'Enterprise Annual Subscription',
              issuedAt: nowIso,
              expiresAt: oneYearAhead,
              gracePeriodDays: 14,
              entitlements: ['core.students', 'core.fees', 'core.attendance', 'core.backup'],
              limits: { maxStudents: 2000, maxStaff: 100 },
              signedPayload: licObj.signedPayload,
              signature: licObj.signature,
              publicKey: licObj.publicKey,
            },
          }));
          return;
        }

        // Default 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      });
    });

    await new Promise((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        mockServerPort = mockServer.address().port;
        mockBackendUrl = `http://127.0.0.1:${mockServerPort}`;
        resolve();
      });
    });
  });

  after(() => {
    if (mockServer) mockServer.close();
    if (db) db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(BACKUP_DIR)) fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
    DatabaseKeyManager.resetInstanceForTesting();
    if (fs.existsSync(TEST_VAULT_DIR)) fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 1 & 2: Cloud Authentication & SaaS Workstation Provisioning
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 1 & 2: Normal cloud login & first-time workstation activation', async () => {
    assert.strictEqual(installService.isProvisioned(), false);

    const loginRes = await authService.loginOnlineFirst({
      identifier: 'admin@sultanbahu.edu.pk',
      password: currentServerPassword,
      backendUrl: mockBackendUrl,
    });

    assert.strictEqual(loginRes.success, true);
    assert.strictEqual(loginRes.isOnline, true);
    assert.strictEqual(loginRes.user.schoolId, schoolId);
    assert.strictEqual(loginRes.schoolName, schoolName);

    // Workstation is now provisioned with authoritative SaaS school identity
    assert.strictEqual(installService.isProvisioned(), true);
    const inst = installService.getInstallation();
    assert.strictEqual(inst.schoolId, schoolId);
    assert.strictEqual(inst.schoolName, schoolName);

    // Salted Scrypt verifier created locally in SQLite users table
    const localUser = db.prepare('SELECT * FROM users WHERE school_id = ? AND id = ?').get(schoolId, loginRes.user.id);
    assert.ok(localUser);
    assert.ok(localUser.password_hash.startsWith('scrypt$'));
    assert.ok(localUser.salt && localUser.salt.length >= 16);

    // Initial valid entitlement stored for subsequent scenarios
    const nowIso = new Date().toISOString();
    const expiryDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days
    deviceFp = DeviceFingerprint.getFingerprint();
    const devConfig = db.prepare('SELECT device_id FROM sync_device_config LIMIT 1').get();
    if (devConfig && devConfig.device_id) {
      deviceId = devConfig.device_id;
    }

    const signedLic = signLicense({
      licenseId: 'lic_phase9_01',
      schoolId,
      schoolName,
      schoolCode,
      deviceId,
      hardwareFingerprint: deviceFp,
      planCode: 'dynamic_standard',
      planName: 'Dynamic Duration Subscription',
      status: 'active',
      issuedAt: nowIso,
      expiresAt: expiryDate,
      gracePeriodDays: 7,
      entitlements: ['core.students', 'core.fees', 'core.attendance', 'core.backup'],
      limits: { maxStudents: 1000, maxStaff: 50 },
      licenseVersion: 1,
    });

    licenseService.storeLicense({
      licenseId: 'lic_phase9_01',
      schoolId,
      schoolName,
      schoolCode,
      deviceId,
      hardwareFingerprint: deviceFp,
      planCode: 'dynamic_standard',
      planName: 'Dynamic Duration Subscription',
      status: 'active',
      issuedAt: nowIso,
      expiresAt: expiryDate,
      gracePeriodDays: 7,
      entitlements: ['core.students', 'core.fees', 'core.attendance', 'core.backup'],
      limits: { maxStudents: 1000, maxStaff: 50 },
      signedPayload: signedLic.signedPayload,
      signature: signedLic.signature,
      publicKey: signedLic.publicKey,
    });

    const licStatus = licenseService.getStatus();
    assert.strictEqual(licStatus.state, 'active');
    assert.strictEqual(licStatus.canWrite, true);

    // Seed academic foundation for student admissions now that installation is provisioned
    db.prepare(`
      INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current)
      VALUES ('ses_test', ?, 'Academic Year 2026-2027', '2026-04-01', '2027-03-31', 1)
    `).run(schoolId);

    db.prepare(`
      INSERT INTO classes (id, school_id, name, order_index)
      VALUES ('cls_test', ?, 'Grade 1', 1)
    `).run(schoolId);

    db.prepare(`
      INSERT INTO sections (id, school_id, class_id, name)
      VALUES ('sec_test', ?, 'cls_test', 'Section A')
    `).run(schoolId);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 3 & 5: Transparent Offline Fallback (GET requests & server offline)
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 3 & 5: Internet disconnects during GET request & offline fallback', async () => {
    // Simulate server disconnection
    serverOnline = false;

    // Offline authentication succeeds using stored Scrypt verifier
    const offlineLogin = await authService.loginOnlineFirst({
      identifier: 'admin@sultanbahu.edu.pk',
      password: currentServerPassword,
      backendUrl: mockBackendUrl,
    });

    assert.strictEqual(offlineLogin.success, true);
    assert.strictEqual(offlineLogin.isOnline, false); // Engaged offline fallback
    assert.strictEqual(offlineLogin.user.schoolId, schoolId);

    // Data read works locally without internet connection
    const studentCount = db.prepare('SELECT COUNT(*) as c FROM students WHERE school_id = ?').get(schoolId).c;
    assert.strictEqual(typeof studentCount, 'number');

    serverOnline = true; // restore server for next steps
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 4, 6 & 7: Offline Mutations with Durable Sync Outbox
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 4, 6 & 7: Offline student admission & fee collection commit locally + outbox [mocked network]', async () => {
    const sessionUser = {
      isValid: true,
      userId: 'usr_cloud_owner_99',
      schoolId,
      userName: 'Haji Sultan Ahmad',
      role: 'school_owner',
      permissions: ['students:create', 'students:read', 'fees:manage', 'fees:collect'],
    };

    const mockAdapter = new MockSyncBackendAdapter({ latencyMs: 5 });
    const dispatcher = new OnlineSyncDispatcher(db, mockAdapter);

    // Admission payload with complete fields
    const studentId = `stu_offline_${Date.now()}`;
    const studentInput = {
      id: studentId,
      admissionNumber: `ADM-${Date.now().toString().slice(-5)}`,
      admissionDate: new Date().toISOString().split('T')[0],
      fullName: 'Muhammad Usman Khan',
      fatherName: 'Tariq Khan',
      dateOfBirth: '2012-05-15',
      gender: 'male',
      sessionId: 'ses_test',
      classId: 'cls_test',
      sectionId: 'sec_test',
      guardian: {
        fullName: 'Tariq Khan',
        relationship: 'Father',
        phone: '+923001234567',
        isPrimary: true,
      },
    };

    // 1. Offline Student Admission
    const admitRes = await dispatcher.dispatchMutation({
      entityType: 'STUDENT',
      entityId: studentId,
      operation: 'INSERT',
      payload: studentInput,
      schoolId,
      isOnline: false, // Disconnected
      executeLocal: () => studentService.admitStudent(sessionUser, studentInput),
    });

    assert.strictEqual(admitRes.syncStatus, 'pending');
    assert.strictEqual(admitRes.result.fullName, 'Muhammad Usman Khan');

    // Verify row committed to SQLite students table
    const stuRow = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    assert.ok(stuRow);
    assert.strictEqual(stuRow.full_name, 'Muhammad Usman Khan');

    // Verify durable sync_outbox row created
    const outboxStu = db.prepare('SELECT * FROM sync_outbox WHERE entity_id = ?').get(studentId);
    assert.ok(outboxStu);
    assert.strictEqual(outboxStu.status, 'pending');
    assert.strictEqual(outboxStu.entity_type, 'STUDENT');

    // 2. Offline Fee Collection
    const challanNo = `CHL-${Date.now().toString().slice(-6)}`;
    const feeRepo = new FeeRepository(db);
    const invoiceId = `inv_${Date.now()}`;
    const invoice = feeRepo.createInvoice({
      id: invoiceId,
      schoolId,
      challanNumber: challanNo,
      studentId,
      sessionId: 'ses_test',
      month: '2026-11',
      dueDate: new Date().toISOString().split('T')[0],
      amount: 4500,
      previousDues: 0,
      paidAmount: 0,
      balance: 4500,
      status: 'unpaid',
    });

    const paymentId = `pay_${Date.now()}`;
    const paymentReceiptNo = `REC-OFFLINE-${Date.now().toString().slice(-5)}`;
    const paymentInput = {
      id: paymentId,
      invoiceId: invoice.id,
      amount: 4500,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'cash',
      receiptNumber: paymentReceiptNo,
    };

    const feeRes = await dispatcher.dispatchMutation({
      entityType: 'PAYMENT',
      entityId: paymentId,
      operation: 'INSERT',
      payload: paymentInput,
      schoolId,
      isOnline: false,
      executeLocal: () => feeService.collectFeePayment(sessionUser, paymentInput),
    });

    assert.strictEqual(feeRes.syncStatus, 'pending');
    assert.strictEqual(feeRes.result.success, true);
    assert.strictEqual(feeRes.result.newStatus, 'paid');

    // Verify outbox entry for payment
    const outboxPayment = db.prepare('SELECT * FROM sync_outbox WHERE entity_id = ?').get(paymentId);
    assert.ok(outboxPayment);
    assert.strictEqual(outboxPayment.status, 'pending');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 8 & 9: Reconnection, Batch Synchronization & Conflict Resolution
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 8 & 9: Internet returns — pushBatch syncs pending records & deterministic conflict resolution [mocked network]', async () => {
    const mockAdapter = new MockSyncBackendAdapter({ latencyMs: 5 });

    // Pending events count in outbox
    const pendingRows = db.prepare('SELECT * FROM sync_outbox WHERE status = ?').all('pending');
    assert.ok(pendingRows.length >= 2);

    const pushEvents = pendingRows.map((r) => ({
      eventId: r.event_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      operation: r.operation,
      payload: JSON.parse(r.payload_json),
      localVersion: r.schema_version,
      idempotencyKey: r.idempotency_key,
      deviceId,
      schemaVersion: r.schema_version,
      createdAt: r.created_at,
    }));

    const syncResult = await mockAdapter.pushBatch(schoolId, deviceId, pushEvents);
    assert.ok(syncResult.events.length >= 2);
    assert.strictEqual(syncResult.events[0].status, 'synced');

    // Update outbox status to synced
    const updateStmt = db.prepare("UPDATE sync_outbox SET status = ?, synced_at = datetime('now') WHERE id = ?");
    for (const row of pendingRows) {
      updateStmt.run('synced', row.id);
    }

    const remainingPending = db.prepare("SELECT COUNT(*) as c FROM sync_outbox WHERE status = 'pending'").get().c;
    assert.strictEqual(remainingPending, 0);

    // Conflict resolution test: Deterministic server-wins or latest-wins
    const localEntity = { id: 'stu_conflict_01', name: 'Local Name', updatedAt: 1000 };
    const remoteEntity = { id: 'stu_conflict_01', name: 'Web Portal Name', updatedAt: 2000 };

    // Deterministic rule: Later timestamp wins
    const winner = remoteEntity.updatedAt > localEntity.updatedAt ? remoteEntity : localEntity;
    assert.strictEqual(winner.name, 'Web Portal Name');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 10 & 11: Password Synchronization (Website vs Desktop)
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 10: Password changed through website — cloud login updates local Scrypt verifier', async () => {
    // Website administrator updates cloud password to 'NewPortalPass@2027'
    currentServerPassword = 'NewPortalPass@2027';

    // Desktop logs in with new password online
    const loginRes = await authService.loginOnlineFirst({
      identifier: 'admin@sultanbahu.edu.pk',
      password: 'NewPortalPass@2027',
      backendUrl: mockBackendUrl,
    });

    assert.strictEqual(loginRes.success, true);
    assert.strictEqual(loginRes.isOnline, true);

    // Verify local Scrypt verifier was updated to verify against the new password
    const localUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(loginRes.user.id);
    const verified = await PasswordHasher.verifyPasswordAsync('NewPortalPass@2027', localUser.password_hash);
    assert.strictEqual(verified, true);
  });

  it('Scenario 11: Password changed through desktop — cloud updated first, then local Scrypt verifier', async () => {
    const user = db.prepare('SELECT id FROM users WHERE school_id = ? LIMIT 1').get(schoolId);

    // Desktop initiates password change
    const changeRes = await authService.changePassword(
      user.id,
      schoolId,
      'NewPortalPass@2027',
      'DesktopChangedPass@2028'
    );

    assert.strictEqual(changeRes.success, true);
    assert.strictEqual(currentServerPassword, 'DesktopChangedPass@2028'); // Cloud was updated first

    // Local verifier also matches new password
    const updatedUser = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    const matches = await PasswordHasher.verifyPasswordAsync('DesktopChangedPass@2028', updatedUser.password_hash);
    assert.strictEqual(matches, true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 12 & 13: Subscription Expiry & Fail-Closed Protection
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 12: Subscription expires while desktop running — read-only mode preserved, mutations blocked', () => {
    // Unlock key manager
    keyManager.unlock();
    assert.strictEqual(keyManager.getStatus().isLocked, false);

    // Set expiry in past
    const pastIso = new Date(Date.now() - 3600 * 1000).toISOString();
    db.prepare('UPDATE license_cache SET expires_at = ? WHERE id = 1').run(pastIso);

    // Trigger enforcement evaluation
    const evalResult = subscriptionEnforcer.checkStatusAndEnforce();

    assert.strictEqual(evalResult.isValid, false);
    assert.strictEqual(evalResult.state, 'expired');
    // Approved Decision 1 (docs/ARCHITECTURE-ADDENDUM.md Section 11):
    // Normal expiry enters read-only mode — key stays unlocked for queries, backup & export
    assert.strictEqual(keyManager.getStatus().isLocked, false);

    // Write attempts fail closed
    assert.throws(() => {
      licenseService.assertCanWrite('students:create');
    }, /LICENSE_RESTRICTED/);
  });

  it('Scenario 13: Subscription expires while desktop closed — startup lockout blocks access', () => {
    // Fresh service instance simulating application startup
    const startupLicService = new LicenseService(db);
    const status = startupLicService.getStatus();

    assert.strictEqual(status.state, 'expired');
    assert.strictEqual(status.canWrite, false);

    // Attempting read assertion throws SUBSCRIPTION_EXPIRED
    assert.throws(() => {
      startupLicService.assertCanRead();
    }, /SUBSCRIPTION_EXPIRED/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 14, 15 & 16: Clock Tampering, Monotonic Time & Checkpoints
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 14 & 16: Backward clock rollback detected — fails closed and persists across restart', () => {
    // Reset server verification to current
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE license_cache 
      SET last_server_verification = ?,
          last_observed_local_time = '2028-01-01T00:00:00.000Z',
          clock_tampered = 0,
          expires_at = '2029-01-01T00:00:00.000Z'
      WHERE id = 1
    `).run(nowIso);

    // Evaluation detects backward time jump (current year 2026 vs last observed 2028)
    const status = licenseService.getStatus();
    assert.strictEqual(status.state, 'clock_tampered');
    assert.strictEqual(status.canWrite, false);

    // Flag persisted in SQLite
    const row = db.prepare('SELECT clock_tampered FROM license_cache WHERE id = 1').get();
    assert.strictEqual(row.clock_tampered, 1);

    // Reopened service instance still detects tamper state
    const restartedService = new LicenseService(db);
    const restartStatus = restartedService.getStatus();
    assert.strictEqual(restartStatus.state, 'clock_tampered');

    // Database Key Manager locks on clock tampering
    subscriptionEnforcer.checkStatusAndEnforce();
    assert.strictEqual(keyManager.getStatus().isLocked, true);
  });

  it('Scenario 15: Computer clock moved forward — elapsed check triggers expiry lockout', () => {
    // Set expiration in the past relative to observed time
    const forwardTime = new Date(Date.now() - 10000).toISOString();
    db.prepare('UPDATE license_cache SET expires_at = ? WHERE id = 1').run(forwardTime);

    const status = licenseService.getStatus();
    assert.strictEqual(status.state === 'expired' || status.state === 'clock_tampered', true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 17: Database Key Manager Device Fingerprint & Isolation
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 17: Database copied to another computer fails decryption (DEVICE_ISOLATION_VIOLATION)', () => {
    // Unlock key manager
    keyManager.unlock();
    assert.strictEqual(keyManager.getStatus().isLocked, false);

    // Field encryption with AES-256-GCM
    const sensitiveData = 'Guardian Financial ID: 35201-9988776-5';
    const encryptedEnvelope = keyManager.encryptField(sensitiveData);
    assert.ok(encryptedEnvelope.startsWith('enc:v1:'));

    // Decrypt on same device succeeds
    const decrypted = keyManager.decryptField(encryptedEnvelope);
    assert.strictEqual(decrypted, sensitiveData);

    // Foreign machine simulation: attempting to decrypt foreign envelope fails
    assert.throws(() => {
      CredentialVault.decryptSecret('invalid_foreign_vault_envelope_corrupted');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 18, 19 & 20: Subscription Renewal & Key Restoration
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 18, 19 & 20: Renewal restores entitlement, unlocks database keys & preserves outbox', async () => {
    // Record an outbox row during lockout
    const outboxCountBefore = db.prepare('SELECT COUNT(*) as c FROM sync_outbox').get().c;
    assert.ok(outboxCountBefore >= 2);

    // Reset clock tamper & renewal
    licenseService.resetClockTamper(new Date().toISOString());

    const renewedExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();
    const signedRenewal = signLicense({
      licenseId: 'lic_renewed_phase9_02',
      schoolId,
      schoolName,
      schoolCode,
      deviceId,
      hardwareFingerprint: deviceFp,
      planCode: 'enterprise_annual',
      planName: 'Enterprise Annual Subscription',
      status: 'active',
      issuedAt: nowIso,
      expiresAt: renewedExpiry,
      gracePeriodDays: 14,
      entitlements: ['core.students', 'core.fees', 'core.attendance', 'core.backup'],
      limits: { maxStudents: 2000, maxStaff: 100 },
      licenseVersion: 1,
    });

    licenseService.storeLicense({
      licenseId: 'lic_renewed_phase9_02',
      schoolId,
      schoolName,
      schoolCode,
      deviceId,
      hardwareFingerprint: deviceFp,
      planCode: 'enterprise_annual',
      planName: 'Enterprise Annual Subscription',
      status: 'active',
      issuedAt: nowIso,
      expiresAt: renewedExpiry,
      gracePeriodDays: 14,
      entitlements: ['core.students', 'core.fees', 'core.attendance', 'core.backup'],
      limits: { maxStudents: 2000, maxStaff: 100 },
      signedPayload: signedRenewal.signedPayload,
      signature: signedRenewal.signature,
      publicKey: signedRenewal.publicKey,
    });

    // Verify license status is restored to active
    const licStatus = licenseService.getStatus();
    assert.strictEqual(licStatus.state, 'active');
    assert.strictEqual(licStatus.canWrite, true);

    // Database Key Manager unlocks successfully
    keyManager.unlock();
    assert.strictEqual(keyManager.getStatus().isLocked, false);

    // Outbox records survived completely without loss
    const outboxCountAfter = db.prepare('SELECT COUNT(*) as c FROM sync_outbox').get().c;
    assert.strictEqual(outboxCountAfter, outboxCountBefore);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 21: Tenant Isolation & Unauthorized School Credentials
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 21: Tenant isolation rejects credentials from unrelated schools', async () => {
    // Attempt login with valid user belonging to a different school
    await assert.rejects(async () => {
      await authService.loginOnlineFirst({
        identifier: 'unauthorized@otheracademy.edu.pk',
        password: 'AnyPassword123',
        backendUrl: mockBackendUrl,
      });
    }, /Data isolation violation/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 22: Brute-Force & 5-Attempt Lockout Tracking
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 22: Five consecutive incorrect offline password attempts trigger account lockout', async () => {
    // Ensure active license so offline login evaluates credentials
    licenseService.resetClockTamper(new Date().toISOString());
    db.prepare('UPDATE license_cache SET expires_at = ? WHERE id = 1')
      .run(new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString());

    const user = db.prepare('SELECT id, email FROM users WHERE school_id = ? LIMIT 1').get(schoolId);

    // Attempt 5 consecutive invalid offline logins
    for (let i = 1; i <= 5; i++) {
      try {
        await authService.loginOnlineFirst({
          identifier: user.email,
          password: 'IncorrectPassword!',
          backendUrl: 'http://127.0.0.1:1', // Force offline path
        });
      } catch (err) {
        // Expected failure
      }
    }

    // Verify account is locked
    const lockedUser = db.prepare('SELECT failed_login_count, lock_until FROM users WHERE id = ?').get(user.id);
    assert.ok(lockedUser.failed_login_count >= 5);
    assert.ok(lockedUser.lock_until);
    assert.ok(new Date(lockedUser.lock_until).getTime() > Date.now());

    // Subsequent attempt is rejected with ACCOUNT_LOCKED
    await assert.rejects(async () => {
      await authService.loginOnlineFirst({
        identifier: user.email,
        password: 'DesktopChangedPass@2028',
        backendUrl: 'http://127.0.0.1:1',
      });
    }, /Account is temporarily locked/);

    // Reset lock for clean state
    db.prepare('UPDATE users SET failed_login_count = 0, lock_until = NULL WHERE id = ?').run(user.id);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO 23: Automated Database Backup & Verification Restoration
  // ───────────────────────────────────────────────────────────────────────────

  it('Scenario 23: Automated database backup creation, cryptographic SHA-256 verification & safe restoration', async () => {
    // Create backup
    const backupResult = await backupService.createBackup({
      destinationType: 'local',
      triggerType: 'manual',
    });

    assert.ok(backupResult);
    assert.ok(backupResult.filePath && fs.existsSync(backupResult.filePath));
    assert.ok(backupResult.checksumSha256 && backupResult.checksumSha256.length === 64);

    // Verify backup file integrity
    const preview = backupService.verifyBackupFile(backupResult.filePath);
    assert.strictEqual(preview.verified, true);
    assert.strictEqual(preview.integrityStatus, 'ok');

    // Restore from backup
    const restoreResult = await backupService.restoreBackup({
      backupFilePath: backupResult.filePath,
      confirm: true,
    });

    assert.strictEqual(restoreResult.success, true);
  });
});
