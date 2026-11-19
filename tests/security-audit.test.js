const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations');
const { PasswordHasher } = require('../dist/main/security/password-hasher');
const { SessionManager } = require('../dist/main/security/session-manager');
const { AuthService } = require('../dist/main/services/auth.service');
const { InstallationService } = require('../dist/main/services/installation.service');
const { RbacService, AccessDeniedError } = require('../dist/main/services/rbac.service');
const { StudentService } = require('../dist/main/services/student.service');
const { FeeService } = require('../dist/main/services/fee.service');
const { FeeRepository } = require('../dist/main/database/repositories/fee.repository');
const { UserRepository } = require('../dist/main/database/repositories/user.repository');
const { InitialAdminProvisioningSchema, ChangePasswordInputSchema } = require('../dist/shared/schemas/auth.schema');

const testDbPath = path.join(__dirname, 'security_audit_temp.db');

function cleanupTempDb() {
  for (const ext of ['', '-wal', '-shm']) {
    const p = testDbPath + ext;
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  }
}

test('Security & Data Integrity Audit Verification Suite', async (suite) => {
  cleanupTempDb();

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');

  // Load migrations using the migration engine
  runMigrations(db, ALL_MIGRATIONS);

  // --- SECTION 1: SQLite Durability Audit ---
  await suite.test('1. Durability Pragmas & WAL Checkpoint', () => {
    const journalMode = db.pragma('journal_mode', { simple: true });
    assert.strictEqual(journalMode, 'wal', 'Journal mode must be WAL');

    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    assert.strictEqual(foreignKeys, 1, 'Foreign keys must be strictly ON');

    const synchronous = db.pragma('synchronous', { simple: true });
    assert.strictEqual(synchronous, 2, 'Synchronous must be FULL (value 2) for zero data loss on crash');

    // WAL Checkpoint TRUNCATE pragma
    const cpRes = db.pragma('wal_checkpoint(TRUNCATE)');
    assert.ok(Array.isArray(cpRes) && cpRes.length > 0, 'WAL checkpoint must succeed');
  });

  // --- SECTION 2: Database Encryption Reality Audit ---
  await suite.test('2. Physical Storage & Encryption Status Verification', () => {
    // Flush WAL
    db.pragma('wal_checkpoint(TRUNCATE)');

    // Read first 16 bytes of the SQLite file
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(testDbPath, 'r');
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const headerMagic = buffer.toString('utf-8');
    assert.ok(
      headerMagic.startsWith('SQLite format 3'),
      'CRITICAL AUDIT FINDING: Database file begins with standard SQLite magic header "SQLite format 3". ' +
      'better-sqlite3 is NOT compiling SQLCipher; pages are stored unencrypted on disk, relying on Windows OS user ACLs.'
    );
  });

  // --- SECTION 3: Administrator Provisioning & Password Rotation Audit ---
  await suite.test('3. Initial Administrator Provisioning & Password Complexity', async () => {
    const authService = new AuthService(db);

    // Initial status before provisioning
    const statusBefore = authService.getProvisioningStatus();
    assert.strictEqual(statusBefore.isProvisioned, false);
    assert.strictEqual(statusBefore.hasAdmin, false);

    // Test Schema: Reject weak passwords
    const weakInputs = [
      { name: 'Admin', username: 'admin', email: 'admin@school.edu.pk', password: 'short' },
      { name: 'Admin', username: 'admin', email: 'admin@school.edu.pk', password: 'alllowercase1!' },
      { name: 'Admin', username: 'admin', email: 'admin@school.edu.pk', password: 'ALLUPPERCASE1!' },
      { name: 'Admin', username: 'admin', email: 'admin@school.edu.pk', password: 'NoSpecialDigitWord' },
    ];
    for (const weak of weakInputs) {
      const parsed = InitialAdminProvisioningSchema.safeParse(weak);
      assert.strictEqual(parsed.success, false, `Must reject weak password: ${weak.password}`);
    }

    // Provision legitimate admin with strong password
    const provRes = await authService.provisionInitialAdmin({
      schoolName: 'Audit Model High School',
      schoolCode: 'AMHS-001',
      adminName: 'Principal Ahmad',
      adminEmail: 'ahmad@audit.edu.pk',
      adminUsername: 'lead_admin',
      adminPassword: 'StrongPassword@2026',
    });

    assert.ok(provRes.adminUser.id, 'Admin user must be created');
    assert.strictEqual(provRes.adminUser.role, 'school_owner');

    // Attempting to provision a SECOND initial admin must be strictly rejected
    await assert.rejects(async () => {
      await authService.provisionInitialAdmin({
        schoolName: 'Hacker School',
        schoolCode: 'HACK',
        adminName: 'Intruder',
        adminEmail: 'intruder@hack.com',
        adminUsername: 'intruder',
        adminPassword: 'IntruderPass@2026',
      });
    }, /An administrator account has already been provisioned/);

    // Verify login with new admin
    const loginRes = await authService.login('lead_admin', 'StrongPassword@2026');
    assert.strictEqual(loginRes.success, true);
    assert.ok(loginRes.token);

    // Password Rotation / Change
    const changeRes = await authService.changePassword(
      loginRes.user.id,
      loginRes.user.schoolId,
      'StrongPassword@2026',
      'RotatedPassword@2027'
    );
    assert.strictEqual(changeRes.success, true);

    // Old password must fail
    await assert.rejects(async () => {
      await authService.login('lead_admin', 'StrongPassword@2026');
    }, /attempt\(s\) remaining/);

    // New password must succeed
    const reloginRes = await authService.login('lead_admin', 'RotatedPassword@2027');
    assert.strictEqual(reloginRes.success, true);

    // Old token must have been revoked by password change
    const oldSessionCheck = authService.validateSession(loginRes.token);
    assert.strictEqual(oldSessionCheck.isValid, false, 'Old session token must be revoked after password change');
  });

  // --- SECTION 4: Scrypt Cryptographic Verification & Thread Safety ---
  await suite.test('4. Async Scrypt Hashing & Constant-Time Verification', async () => {
    const plain = 'AuditComplexPassword!99#';
    const hashRes = await PasswordHasher.hashPasswordAsync(plain);

    assert.ok(hashRes.hash.startsWith('scrypt$N=32768,r=8,p=1$'), 'Hash format must specify Scrypt params');
    assert.strictEqual(hashRes.salt.length, 64, 'Salt must be 32 bytes hex (64 chars)');

    // Verify valid password
    const valid = await PasswordHasher.verifyPasswordAsync(plain, hashRes.hash);
    assert.strictEqual(valid, true);

    // Verify wrong password
    const invalid = await PasswordHasher.verifyPasswordAsync('WrongPassword!99#', hashRes.hash);
    assert.strictEqual(invalid, false);

    // Verify malformed hash handling
    const malformed = await PasswordHasher.verifyPasswordAsync(plain, 'invalid_hash_string');
    assert.strictEqual(malformed, false);
  });

  // --- SECTION 5: Sessions, Inactivity Timeout & Sliding Expiration ---
  await suite.test('5. Session Lifecycle: Sliding Expiration & 4h Inactivity Timeout', () => {
    const userRepo = new UserRepository(db);
    const install = new InstallationService(db).getInstallation();
    const user = userRepo.findByIdentifier(install.schoolId, 'lead_admin');

    // Create session
    const session = SessionManager.createSession(db, user.id, user.schoolId);
    assert.ok(session.token);

    // Immediate validation
    const validCheck = SessionManager.validateSession(db, session.token);
    assert.strictEqual(validCheck.isValid, true);

    // Simulate 5 hours of inactivity
    const fiveHoursAgo = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    db.prepare('UPDATE auth_sessions SET last_activity_at = ? WHERE session_token_hash = ?')
      .run(fiveHoursAgo, SessionManager.hashToken(session.token));

    const timeoutCheck = SessionManager.validateSession(db, session.token);
    assert.strictEqual(timeoutCheck.isValid, false);
    assert.ok(timeoutCheck.reason.includes('inactivity'), 'Reason must indicate inactivity');

    // Revocation check
    const newSession = SessionManager.createSession(db, user.id, user.schoolId);
    SessionManager.revokeSession(db, newSession.token);
    const postRevoke = SessionManager.validateSession(db, newSession.token);
    assert.strictEqual(postRevoke.isValid, false);
    assert.strictEqual(postRevoke.reason, 'Session has been revoked');
  });

  // --- SECTION 6: RBAC Protection on High-Privilege Operations ---
  await suite.test('6. RBAC Boundary Enforcement', () => {
    const session = {
      isValid: true,
      userId: 'usr_staff_01',
      schoolId: 'sch_pak_01',
      userName: 'Teacher Ali',
      role: 'teacher',
      permissions: ['attendance:mark', 'students:read'],
    };

    // Teacher can mark attendance
    assert.strictEqual(RbacService.hasPermission(session.role, session.permissions, 'attendance:mark'), true);

    // Teacher CANNOT access settings, dump database, or reverse fees
    assert.strictEqual(RbacService.hasPermission(session.role, session.permissions, 'school:settings'), false);
    assert.strictEqual(RbacService.hasPermission(session.role, session.permissions, 'database:backup'), false);
    assert.strictEqual(RbacService.hasPermission(session.role, session.permissions, 'fees:reverse'), false);

    assert.throws(() => {
      RbacService.assertPermission(session, 'database:backup');
    }, AccessDeniedError);
  });

  // --- SECTION 7: School Data Isolation ---
  await suite.test('7. School Isolation Enforcement', () => {
    const studentService = new StudentService(db);
    const session = {
      isValid: true,
      userId: 'usr_owner',
      schoolId: 'sch_tenant_A',
      role: 'school_owner',
      permissions: ['*'],
    };

    // Calling service with mismatched school ID or no installation must throw
    assert.throws(() => {
      studentService.listStudents(session, {});
    }, /Data isolation violation/);
  });

  // --- SECTION 8: Historical & Financial Integrity ---
  await suite.test('8. Financial Ledger Immutability & Reversal Audit', () => {
    const install = new InstallationService(db).getInstallation();
    const feeRepo = new FeeRepository(db);
    const feeService = new FeeService(db);
    const session = {
      isValid: true,
      userId: 'usr_owner',
      schoolId: install.schoolId,
      userName: 'Principal Ahmad',
      role: 'school_owner',
      permissions: ['*'],
    };

    // Create an academic session, class and student
    db.prepare("INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current) VALUES ('sess_aud', ?, '2026-2027', '2026-04-01', '2027-03-31', 1)").run(install.schoolId);
    db.prepare("INSERT INTO classes (id, school_id, name, order_index) VALUES ('cls_aud', ?, 'Class 10', 10)").run(install.schoolId);
    db.prepare("INSERT INTO sections (id, school_id, class_id, name) VALUES ('sec_aud', ?, 'cls_aud', 'A')").run(install.schoolId);
    db.prepare(`
      INSERT INTO students (id, school_id, admission_number, full_name, father_name, gender, status)
      VALUES ('std_aud', ?, 'AMHS-2026-001', 'Zain Abbas', 'Ghulam Abbas', 'male', 'active')
    `).run(install.schoolId);

    // Create fee invoice of Rs. 5,000
    feeRepo.createInvoice({
      id: 'inv_aud_1',
      schoolId: install.schoolId,
      challanNumber: 'CH-AUD-001',
      studentId: 'std_aud',
      sessionId: 'sess_aud',
      month: 'November 2026',
      dueDate: '2026-11-20',
      amount: 5000,
      previousDues: 0,
      paidAmount: 0,
      balance: 5000,
      status: 'unpaid',
    });

    // Collect payment of Rs. 3,000
    const payment = feeService.collectFeePayment(session, {
      id: 'pay_aud_1',
      invoiceId: 'inv_aud_1',
      receiptNumber: 'RCP-AUD-001',
      amount: 3000,
      paymentDate: '2026-11-13',
      paymentMethod: 'cash',
    });

    assert.strictEqual(payment.newBalance, 2000);
    assert.strictEqual(payment.newStatus, 'partially_paid');

    // Verify invoice balance updated to Rs. 2,000
    const invoiceAfterPay = db.prepare('SELECT amount, paid_amount, balance, status FROM invoices WHERE id = ?').get('inv_aud_1');
    assert.strictEqual(invoiceAfterPay.paid_amount, 3000);
    assert.strictEqual(invoiceAfterPay.balance, 2000);
    assert.strictEqual(invoiceAfterPay.status, 'partially_paid');

    // Reverse fee payment
    const revResult = feeService.reverseFeePayment(session, 'pay_aud_1', 'Entered by cashier mistake');
    assert.strictEqual(revResult.restoredBalance, 5000);

    // Verify invoice balance restored to Rs. 5,000
    const invoiceAfterRev = db.prepare('SELECT amount, paid_amount, balance, status FROM invoices WHERE id = ?').get('inv_aud_1');
    assert.strictEqual(invoiceAfterRev.paid_amount, 0);
    assert.strictEqual(invoiceAfterRev.balance, 5000);
    assert.strictEqual(invoiceAfterRev.status, 'unpaid');

    // Verify strict ledger immutability: Original payment row is NEVER mutated!
    const origPayRecord = db.prepare('SELECT is_reversed, reversal_reason, amount FROM payments WHERE id = ?').get('pay_aud_1');
    assert.strictEqual(origPayRecord.is_reversed, 0, 'Original payment is_reversed must remain 0');
    assert.strictEqual(origPayRecord.reversal_reason, null, 'Original payment reversal_reason must remain null');
    assert.strictEqual(origPayRecord.amount, 3000, 'Original payment amount must remain 3000');

    // Verify linked reversal contra-entry
    const contraRecord = db.prepare('SELECT is_reversed, reversal_reason, amount, reversal_for_payment_id FROM payments WHERE reversal_for_payment_id = ?').get('pay_aud_1');
    assert.ok(contraRecord, 'Linked contra-entry must exist');
    assert.strictEqual(contraRecord.is_reversed, 1, 'Contra-entry is_reversed must be 1');
    assert.strictEqual(contraRecord.reversal_reason, 'Entered by cashier mistake');
    assert.strictEqual(contraRecord.amount, -3000, 'Contra-entry amount must be -3000');
    assert.strictEqual(feeRepo.isPaymentReversed(install.schoolId, 'pay_aud_1'), true, 'Reversal status determined from linked entry');
  });

  // Teardown
  db.close();
  cleanupTempDb();
});
