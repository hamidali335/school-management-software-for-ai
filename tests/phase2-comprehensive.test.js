const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations, getAppliedMigrationVersions } = require('../dist/main/database/migrations');
const { PasswordHasher } = require('../dist/main/security/password-hasher');
const { SessionManager } = require('../dist/main/security/session-manager');
const { CredentialVault } = require('../dist/main/security/credential-vault');
const { InstallationRepository } = require('../dist/main/database/repositories/installation.repository');
const { UserRepository } = require('../dist/main/database/repositories/user.repository');
const { StudentRepository } = require('../dist/main/database/repositories/student.repository');
const { AttendanceRepository } = require('../dist/main/database/repositories/attendance.repository');
const { FeeRepository } = require('../dist/main/database/repositories/fee.repository');
const { InstallationService } = require('../dist/main/services/installation.service');
const { AuthService } = require('../dist/main/services/auth.service');
const { RbacService } = require('../dist/main/services/rbac.service');
const { StudentService } = require('../dist/main/services/student.service');
const { FeeService } = require('../dist/main/services/fee.service');
const { LoginInputSchema } = require('../dist/shared/schemas/auth.schema');
const { AdmitStudentInputSchema } = require('../dist/shared/schemas/student.schema');
const { CollectPaymentInputSchema } = require('../dist/shared/schemas/fee.schema');

test('School Management Software — Phase 2 Comprehensive Test Suite', async (suite) => {
  const testDbDir = path.join(__dirname, '../data/test_run');
  if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
  const testDbFile = path.join(testDbDir, `test_school_${Date.now()}.db`);

  let db;

  suite.after(() => {
    if (db) {
      try { db.close(); } catch {}
    }
    try {
      if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
      const wal = testDbFile + '-wal';
      const shm = testDbFile + '-shm';
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
      if (fs.existsSync(testDbDir)) fs.rmdirSync(testDbDir);
    } catch {}
  });

  // 1. Initialization and WAL Configuration
  await suite.test('1. Database Initialization, WAL Mode and Integrity Check', () => {
    db = new Database(testDbFile);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = FULL');

    const journal = db.pragma('journal_mode', { simple: true });
    assert.strictEqual(journal.toLowerCase(), 'wal', 'Journal mode must be WAL');

    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    assert.strictEqual(foreignKeys, 1, 'Foreign keys must be ON (1)');

    const synchronous = db.pragma('synchronous', { simple: true });
    assert.strictEqual(synchronous, 2, 'Synchronous must be FULL (2)');

    const integrity = db.pragma('integrity_check', { simple: true });
    assert.strictEqual(integrity, 'ok', 'Database file integrity check must be ok');
  });

  // 2. Migration Execution & Version Tracking
  await suite.test('2. Migration Execution and Version Tracking', () => {
    const res = runMigrations(db, ALL_MIGRATIONS);
    assert.strictEqual(res.appliedCount, ALL_MIGRATIONS.length, 'Must apply all migrations on empty database');

    const appliedVersions = getAppliedMigrationVersions(db);
    assert.ok(appliedVersions.has(1), 'Migration 1 must be recorded');
    assert.ok(appliedVersions.has(2), 'Migration 2 must be recorded');
    assert.ok(appliedVersions.has(3), 'Migration 3 must be recorded');
    assert.ok(appliedVersions.has(4), 'Migration 4 must be recorded');
    assert.ok(appliedVersions.has(5), 'Migration 5 must be recorded');
    assert.ok(appliedVersions.has(6), 'Migration 6 must be recorded');

    // Re-running migrations should be idempotent
    const rerun = runMigrations(db, ALL_MIGRATIONS);
    assert.strictEqual(rerun.appliedCount, 0, 'Subsequent migration run must apply 0 migrations');
  });

  // 3. Persistent Database Reopening
  await suite.test('3. Persistent Database Reopening without Data Loss', () => {
    const installRepo = new InstallationRepository(db);
    installRepo.setConfig({
      schoolId: 'sch_pak_01',
      schoolName: 'Quaid Academy Lahore',
      schoolCode: 'QAL-01',
      installationId: 'inst_machine_guid_123',
    });

    db.close();

    // Reopen from disk
    db = new Database(testDbFile);
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = FULL');
    const reopenedRepo = new InstallationRepository(db);
    const cfg = reopenedRepo.getConfig();

    assert.ok(cfg, 'Config must persist on disk');
    assert.strictEqual(cfg.schoolId, 'sch_pak_01');
    assert.strictEqual(cfg.schoolName, 'Quaid Academy Lahore');
  });

  // 4. Foreign Key Enforcement
  await suite.test('4. Foreign Key Constraint Enforcement', () => {
    // Attempting to insert student with an unprovisioned foreign school_id must fail
    assert.throws(() => {
      db.prepare(`
        INSERT INTO students (id, school_id, admission_number, full_name, father_name)
        VALUES ('std_invalid', 'sch_non_existent', 'ADM-999', 'Fake Student', 'Fake Father')
      `).run();
    }, /FOREIGN KEY constraint failed/);
  });

  // 5. Unique Constraints
  await suite.test('5. Unique Constraints (Admission #, User Email, Attendance Roll Call)', () => {
    const studentRepo = new StudentRepository(db);

    // 5.1 Unique Admission # per school
    studentRepo.createStudent({
      id: 'std_01',
      schoolId: 'sch_pak_01',
      admissionNumber: 'ADM-2026-101',
      fullName: 'Ali Raza',
      fatherName: 'Raza Ahmed',
    });

    assert.throws(() => {
      studentRepo.createStudent({
        id: 'std_02',
        schoolId: 'sch_pak_01',
        admissionNumber: 'ADM-2026-101', // Duplicate admission number!
        fullName: 'Another Ali',
        fatherName: 'Another Father',
      });
    }, /UNIQUE constraint failed: students\.school_id, students\.admission_number/);

    // Setup academic class & session for attendance testing
    db.prepare("INSERT INTO academic_sessions (id, school_id, name, start_date, end_date) VALUES ('sess_01', 'sch_pak_01', 'Session 2026', '2026-04-01', '2027-03-31')").run();
    db.prepare("INSERT INTO classes (id, school_id, name, order_index) VALUES ('cls_10', 'sch_pak_01', 'Grade 10', 10)").run();
    db.prepare("INSERT INTO sections (id, school_id, class_id, name) VALUES ('sec_10_a', 'sch_pak_01', 'cls_10', 'Section A')").run();

    // 5.2 Unique Attendance per student per calendar date
    const attRepo = new AttendanceRepository(db);
    attRepo.recordAttendance({
      id: 'att_01',
      schoolId: 'sch_pak_01',
      studentId: 'std_01',
      sessionId: 'sess_01',
      classId: 'cls_10',
      sectionId: 'sec_10_a',
      date: '2026-11-13',
      status: 'present',
    });

    // Attempting raw duplicate insert
    assert.throws(() => {
      db.prepare(`
        INSERT INTO attendance (id, school_id, student_id, session_id, class_id, section_id, date, status)
        VALUES ('att_02', 'sch_pak_01', 'std_01', 'sess_01', 'cls_10', 'sec_10_a', '2026-11-13', 'absent')
      `).run();
    }, /UNIQUE constraint failed: attendance\.student_id, attendance\.date/);
  });

  // 6. Transaction Rollback Safety
  await suite.test('6. Atomic Transaction Rollback on Failure', () => {
    const studentCountBefore = db.prepare('SELECT COUNT(*) as c FROM students').get().c;

    assert.throws(() => {
      const runTx = db.transaction(() => {
        db.prepare(`
          INSERT INTO students (id, school_id, admission_number, full_name, father_name)
          VALUES ('std_tx_test', 'sch_pak_01', 'ADM-TX-001', 'Tx Student', 'Tx Father')
        `).run();

        // Intentionally trigger foreign key error
        db.prepare(`
          INSERT INTO student_enrollments (id, school_id, student_id, session_id, class_id, section_id)
          VALUES ('enr_fail', 'sch_pak_01', 'std_tx_test', 'non_existent_session', 'cls_10', 'sec_10_a')
        `).run();
      });
      runTx();
    });

    const studentCountAfter = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
    assert.strictEqual(studentCountAfter, studentCountBefore, 'Failed transaction must roll back completely');
  });

  // 7. Password Hashing (Scrypt & Timing-Safe Verification)
  await suite.test('7. Password Hashing and Timing-Safe Verification', () => {
    const plain = 'StrongPass@2026';
    const { hash, salt } = PasswordHasher.hashPassword(plain);

    assert.ok(hash.startsWith('scrypt$'), 'Hash must start with scrypt envelope');
    assert.strictEqual(salt.length, 64, 'Salt must be 32 bytes hex');

    assert.strictEqual(PasswordHasher.verifyPassword(plain, hash), true, 'Correct password must verify');
    assert.strictEqual(PasswordHasher.verifyPassword('WrongPass', hash), false, 'Wrong password must fail');
    assert.strictEqual(PasswordHasher.verifyPassword('', hash), false, 'Empty password must fail');
  });

  // 8. Offline Authentication & Account Provisioning
  await suite.test('8. Offline Authentication Service & Session Provisioning', async () => {
    const authService = new AuthService(db);

    // Provision admin account
    const admin = await authService.provisionUser({
      id: 'usr_admin',
      name: 'Headmaster Tariq',
      email: 'principal@quaid.edu.pk',
      username: 'principal',
      password: 'AdminPassword123!',
      role: 'school_owner',
      permissions: ['*'],
      performedBy: 'Initial Setup',
    });

    assert.strictEqual(admin.name, 'Headmaster Tariq');
    assert.strictEqual(admin.role, 'school_owner');

    // Successful offline login
    const loginRes = await authService.login('principal', 'AdminPassword123!');
    assert.strictEqual(loginRes.success, true);
    assert.ok(loginRes.token, 'Must return session token');
    assert.strictEqual(loginRes.user.name, 'Headmaster Tariq');

    // Session validation
    const sessionRes = authService.validateSession(loginRes.token);
    assert.strictEqual(sessionRes.isValid, true);
    assert.strictEqual(sessionRes.userName, 'Headmaster Tariq');

    // Logout
    const logoutRes = authService.logout(loginRes.token);
    assert.strictEqual(logoutRes, true);

    // Session after logout must be revoked
    const postLogout = authService.validateSession(loginRes.token);
    assert.strictEqual(postLogout.isValid, false);
    assert.strictEqual(postLogout.reason, 'Session has been revoked');
  });

  // 9. Invalid Credentials and Lockout Protection
  await suite.test('9. Failed Login Tracking & 5-Attempt Lockout Protection', async () => {
    const authService = new AuthService(db);

    // Fail 4 times
    for (let i = 1; i <= 4; i++) {
      await assert.rejects(async () => {
        await authService.login('principal', 'IncorrectPassword');
      }, /attempt\(s\) remaining/);
    }

    // 5th failure must trigger lockout
    await assert.rejects(async () => {
      await authService.login('principal', 'IncorrectPassword');
    }, /Account has been locked for 15 minutes/);

    // Subsequent attempt during lockout period must be blocked
    await assert.rejects(async () => {
      await authService.login('principal', 'AdminPassword123!');
    }, /Account is temporarily locked/);

    // Reset lockout for further testing
    db.prepare("UPDATE users SET failed_login_count = 0, lock_until = NULL WHERE username = 'principal'").run();
  });

  // 10. Disabled and Suspended Accounts
  await suite.test('10. Disabled and Suspended Accounts Handling', async () => {
    const authService = new AuthService(db);
    const userRepo = new UserRepository(db);

    const { hash, salt } = PasswordHasher.hashPassword('TeacherPass123!');
    userRepo.createUser({
      id: 'usr_disabled',
      schoolId: 'sch_pak_01',
      name: 'Former Staff',
      username: 'former_staff',
      passwordHash: hash,
      salt,
      role: 'teacher',
      permissions: [],
      status: 'disabled',
    });

    await assert.rejects(async () => {
      await authService.login('former_staff', 'TeacherPass123!');
    }, /Account has been disabled/);
  });

  // 11. Role-Based Access Control (RBAC) Enforcement
  await suite.test('11. Role-Based Access Control (RBAC) Enforcement', () => {
    // School Owner has all permissions
    assert.strictEqual(RbacService.hasPermission('school_owner', [], 'fees:reverse'), true);
    assert.strictEqual(RbacService.hasPermission('school_owner', [], 'students:manage'), true);

    // Teacher cannot reverse fee payments
    assert.strictEqual(RbacService.hasPermission('teacher', [], 'fees:reverse'), false);
    assert.strictEqual(RbacService.hasPermission('teacher', [], 'attendance:mark'), true);

    // Accountant cannot mark attendance
    assert.strictEqual(RbacService.hasPermission('accountant', [], 'attendance:mark'), false);
    assert.strictEqual(RbacService.hasPermission('accountant', [], 'fees:collect'), true);

    // assertPermission helper throws on violation
    assert.throws(() => {
      RbacService.assertPermission({ role: 'teacher', permissions: [] }, 'fees:reverse');
    }, /Forbidden: Insufficient privileges/);
  });

  // 12. School Data Isolation Enforcement
  await suite.test('12. School Data Isolation Enforcement', () => {
    const installService = new InstallationService(db);

    // Correct school succeeds
    assert.strictEqual(installService.assertSchoolIsolation('sch_pak_01'), 'sch_pak_01');

    // Spoofed foreign schoolId throws isolation violation
    assert.throws(() => {
      installService.assertSchoolIsolation('sch_foreign_unauthorized');
    }, /Data isolation violation/);
  });

  // 13. Fee Collection and Payment Reversal Invariants
  await suite.test('13. Fee Collection and Reversal Invariants', () => {
    const feeRepo = new FeeRepository(db);

    // 1. Create Invoice
    feeRepo.createInvoice({
      id: 'inv_test_01',
      schoolId: 'sch_pak_01',
      challanNumber: 'CH-2026-TEST',
      studentId: 'std_01',
      sessionId: 'sess_01',
      month: 'November 2026',
      dueDate: '2026-11-20',
      amount: 10000,
      previousDues: 0,
      paidAmount: 0,
      balance: 10000,
      status: 'unpaid',
    });

    // 2. Partial Payment
    const payRes = feeRepo.recordPayment({
      id: 'pay_test_01',
      schoolId: 'sch_pak_01',
      invoiceId: 'inv_test_01',
      receiptNumber: 'RCP-TEST-001',
      amount: 4000,
      paymentDate: '2026-11-13',
      paymentMethod: 'cash',
      collector: 'Accountant',
    });

    assert.strictEqual(payRes.newBalance, 6000);
    assert.strictEqual(payRes.newStatus, 'partially_paid');

    // 3. Overpayment must fail
    assert.throws(() => {
      feeRepo.recordPayment({
        id: 'pay_test_02',
        schoolId: 'sch_pak_01',
        invoiceId: 'inv_test_01',
        receiptNumber: 'RCP-TEST-002',
        amount: 8000, // 8000 > remaining 6000
        paymentDate: '2026-11-13',
        paymentMethod: 'cash',
        collector: 'Accountant',
      });
    }, /exceeds outstanding balance/);

    // 4. Payment Reversal (Audit-safe, non-destructive!)
    const revRes = feeRepo.reversePayment('sch_pak_01', 'pay_test_01', 'Bounced cheque adjustment');
    assert.strictEqual(revRes.restoredBalance, 10000);

    // Double reversal must fail
    assert.throws(() => {
      feeRepo.reversePayment('sch_pak_01', 'pay_test_01', 'Repeat reversal attempt');
    }, /already been reversed/);
  });

  // 14. IPC Zod Input Boundary Validation
  await suite.test('14. Zod Input Boundary Validation', () => {
    // Login input validation
    assert.strictEqual(LoginInputSchema.safeParse({ identifier: 'ab', password: '123' }).success, false);
    assert.strictEqual(LoginInputSchema.safeParse({ identifier: 'admin', password: 'ValidPassword123' }).success, true);

    // Admission validation
    const invalidAdmission = AdmitStudentInputSchema.safeParse({
      id: '1',
      admissionNumber: '',
      fullName: 'A', // too short
      fatherName: 'B',
      sessionId: 'sess_1',
      classId: 'cls_1',
      sectionId: 'sec_1',
      cnicBform: 'invalid_format',
    });
    assert.strictEqual(invalidAdmission.success, false);

    // Fee payment validation
    assert.strictEqual(CollectPaymentInputSchema.safeParse({
      id: '1',
      invoiceId: 'inv_1',
      receiptNumber: 'rcp_1',
      amount: -500, // negative amount invalid
      paymentDate: '2026-11-13',
      paymentMethod: 'cash',
    }).success, false);
  });

  // 15. Credential Vault (Windows DPAPI / AES-256-GCM Envelope)
  await suite.test('15. Credential Vault Encryption & Decryption', () => {
    const secret = 'cloud_refresh_token_super_secret_xyz123';
    const encrypted = CredentialVault.encryptSecret(secret);

    assert.ok(encrypted.startsWith('dpapi:') || encrypted.startsWith('aes-gcm:'), 'Must produce secure envelope');
    const decrypted = CredentialVault.decryptSecret(encrypted);
    assert.strictEqual(decrypted, secret, 'Decrypted secret must match original');
  });
});
