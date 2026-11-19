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
const { UserRepository } = require('../dist/main/database/repositories/user.repository');
const { FeeRepository } = require('../dist/main/database/repositories/fee.repository');
const { StudentListQuerySchema } = require('../dist/shared/schemas/student.schema');

const testDbPath = path.join(__dirname, 'phase2_supplementary_temp.db');

function cleanupTempDb() {
  for (const ext of ['', '-wal', '-shm']) {
    const p = testDbPath + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

test('Phase 2 Supplementary Verification Suite', async (suite) => {
  cleanupTempDb();

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');

  runMigrations(db, ALL_MIGRATIONS);

  // Initialize school installation and initial admin
  const authService = new AuthService(db);
  const prov = await authService.provisionInitialAdmin({
    schoolName: 'Quaid Campus Model School',
    schoolCode: 'QCMS',
    adminName: 'Principal Tariq',
    adminEmail: 'tariq@qcms.edu.pk',
    adminUsername: 'tariq_admin',
    adminPassword: 'Password@2026',
  });
  const schoolId = prov.installation.schoolId;

  // --- AREA 1: Financial Ledger Immutability ---
  await suite.test('1. Financial Ledger Immutability & Linked Reversal Contra-Entry', () => {
    const feeRepo = new FeeRepository(db);
    const feeService = new FeeService(db);
    const session = {
      isValid: true,
      userId: prov.adminUser.id,
      schoolId,
      userName: 'Principal Tariq',
      role: 'school_owner',
      permissions: ['*'],
    };

    // Setup academic session, class, student
    db.prepare("INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current) VALUES ('sess_v2', ?, '2026-2027', '2026-04-01', '2027-03-31', 1)").run(schoolId);
    db.prepare("INSERT INTO classes (id, school_id, name, order_index) VALUES ('cls_v2', ?, 'Class 9', 9)").run(schoolId);
    db.prepare("INSERT INTO sections (id, school_id, class_id, name) VALUES ('sec_v2', ?, 'cls_v2', 'Rose')").run(schoolId);
    db.prepare(`
      INSERT INTO students (id, school_id, admission_number, full_name, father_name, gender, status)
      VALUES ('std_v2', ?, 'QCMS-2026-001', 'Bilal Ahmed', 'Farooq Ahmed', 'male', 'active')
    `).run(schoolId);

    // 1. Create Invoice of Rs. 8,000
    feeRepo.createInvoice({
      id: 'inv_v2_1',
      schoolId,
      challanNumber: 'CH-V2-001',
      studentId: 'std_v2',
      sessionId: 'sess_v2',
      month: 'December 2026',
      dueDate: '2026-12-10',
      amount: 8000,
      previousDues: 0,
      paidAmount: 0,
      balance: 8000,
      status: 'unpaid',
    });

    // 2. Collect Payment of Rs. 5,000
    const payRes = feeService.collectFeePayment(session, {
      id: 'pay_v2_1',
      invoiceId: 'inv_v2_1',
      receiptNumber: 'RCP-V2-001',
      amount: 5000,
      paymentDate: '2026-11-13',
      paymentMethod: 'cash',
    });
    assert.strictEqual(payRes.newBalance, 3000);
    assert.strictEqual(payRes.newStatus, 'partially_paid');

    // Verify original payment stored accurately
    const origPay = db.prepare('SELECT * FROM payments WHERE id = ?').get('pay_v2_1');
    assert.strictEqual(origPay.amount, 5000);
    assert.strictEqual(origPay.is_reversed, 0);
    assert.strictEqual(origPay.receipt_number, 'RCP-V2-001');

    // 3. Reverse Payment of Rs. 5,000
    const revRes = feeService.reverseFeePayment(session, 'pay_v2_1', 'Cashier double entry error');
    assert.strictEqual(revRes.restoredBalance, 8000);
    assert.ok(revRes.reversalPaymentId, 'Must return linked reversal transaction ID');

    // 4. Verify Original Payment Record: STRICT IMMUTABILITY (Row remains 100% identical!)
    const origPayAfter = db.prepare('SELECT * FROM payments WHERE id = ?').get('pay_v2_1');
    assert.deepStrictEqual(origPayAfter, origPay, 'Original payment row must be 100% bit-for-bit identical before and after reversal');

    // 5. Verify Linked Reversal Contra-Entry in Ledger
    const linkedReversal = db.prepare('SELECT * FROM payments WHERE id = ?').get(revRes.reversalPaymentId);
    assert.ok(linkedReversal, 'Linked contra-entry must exist in payments table');
    assert.strictEqual(linkedReversal.reversal_for_payment_id, 'pay_v2_1', 'Must link directly to original payment ID');
    assert.strictEqual(linkedReversal.amount, -5000, 'Contra-entry amount must be exact negative of original payment');
    assert.strictEqual(linkedReversal.receipt_number, 'REV-RCP-V2-001', 'Reversal receipt number must follow traceable convention');
    assert.strictEqual(linkedReversal.reversal_reason, 'Cashier double entry error');

    // 6. Net Ledger Sum Invariant
    const ledgerSum = db.prepare('SELECT SUM(amount) as netCollected FROM payments WHERE invoice_id = ?').get('inv_v2_1');
    assert.strictEqual(ledgerSum.netCollected, 0, 'Net collected in ledger must sum to 0 after reversal');

    // 7. Verify Invoice Balance Restored
    const invoiceAfter = db.prepare('SELECT paid_amount, balance, status FROM invoices WHERE id = ?').get('inv_v2_1');
    assert.strictEqual(invoiceAfter.paid_amount, 0);
    assert.strictEqual(invoiceAfter.balance, 8000);
    assert.strictEqual(invoiceAfter.status, 'unpaid');

    // 8. Prevent Duplicate Reversals
    assert.throws(() => {
      feeService.reverseFeePayment(session, 'pay_v2_1', 'Duplicate attempt');
    }, /Payment has already been reversed/);

    // 9. Prevent Deleting Invoices with Payment History
    assert.throws(() => {
      db.prepare('DELETE FROM invoices WHERE id = ?').run('inv_v2_1');
    }, /FOREIGN KEY constraint failed|Cannot delete fee invoice: associated payment history exists/);
  });

  // --- AREA 2: Session Invalidation & Policy Verification ---
  await suite.test('2. Session Invalidation Policy: Revoke Other Sessions vs Revoke All', async () => {
    const userRepo = new UserRepository(db);
    const user = userRepo.findByIdentifier(schoolId, 'tariq_admin');

    // Create 3 concurrent sessions for this user
    const sessionA = SessionManager.createSession(db, user.id, user.schoolId);
    const sessionB = SessionManager.createSession(db, user.id, user.schoolId);
    const sessionC = SessionManager.createSession(db, user.id, user.schoolId);

    assert.strictEqual(SessionManager.validateSession(db, sessionA.token).isValid, true);
    assert.strictEqual(SessionManager.validateSession(db, sessionB.token).isValid, true);
    assert.strictEqual(SessionManager.validateSession(db, sessionC.token).isValid, true);

    // Policy 1: Password change from Session A with currentRawToken supplied
    // Expected: Session B & Session C are revoked; Session A remains valid (current session preserved policy)
    const changeResult = await authService.changePassword(
      user.id,
      user.schoolId,
      'Password@2026',
      'NewSecurePassword@2027',
      sessionA.token
    );

    assert.strictEqual(changeResult.success, true);
    assert.strictEqual(changeResult.currentSessionPreserved, true);
    assert.strictEqual(changeResult.revokedSessionsCount, 2);

    // Session A must remain valid
    const sessionACheck = SessionManager.validateSession(db, sessionA.token);
    assert.strictEqual(sessionACheck.isValid, true, 'Caller session must remain valid under retained policy');

    // Session B and Session C must be revoked
    const sessionBCheck = SessionManager.validateSession(db, sessionB.token);
    assert.strictEqual(sessionBCheck.isValid, false, 'Other session B must be revoked');
    assert.strictEqual(sessionBCheck.reason, 'Session has been revoked');

    const sessionCCheck = SessionManager.validateSession(db, sessionC.token);
    assert.strictEqual(sessionCCheck.isValid, false, 'Other session C must be revoked');
    assert.strictEqual(sessionCCheck.reason, 'Session has been revoked');

    // Policy 2: Password change without token (e.g. admin reset)
    // Expected: ALL sessions (including Session A) are invalidated
    const resetResult = await authService.changePassword(
      user.id,
      user.schoolId,
      'NewSecurePassword@2027',
      'ThirdMasterPassword@2028'
    );
    assert.strictEqual(resetResult.currentSessionPreserved, false);
    assert.strictEqual(resetResult.revokedSessionsCount >= 1, true);

    const sessionAPostReset = SessionManager.validateSession(db, sessionA.token);
    assert.strictEqual(sessionAPostReset.isValid, false, 'Session A must be revoked when all sessions invalidated');

    // Live Account Status Invalidation: Disabling an account immediately revokes session
    const freshLogin = await authService.login('tariq_admin', 'ThirdMasterPassword@2028');
    assert.ok(freshLogin.token);

    // Disable user in DB
    db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(user.id);
    const disabledSessionCheck = SessionManager.validateSession(db, freshLogin.token);
    assert.strictEqual(disabledSessionCheck.isValid, false);
    assert.strictEqual(disabledSessionCheck.reason, 'User account is disabled');

    // Re-enable user
    db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(user.id);
  });

  // --- AREA 3: Complete IPC Security & Boundary Enforcement ---
  await suite.test('3. Complete IPC Channel Security & Input Boundary Verification', async () => {
    // 1. Zod query schema validation for students:get-list
    const validQuery = { search: 'Bilal', classId: 'cls_v2', limit: 25 };
    assert.strictEqual(StudentListQuerySchema.safeParse(validQuery).success, true);

    const oversizedLimitQuery = { limit: 9999 };
    assert.strictEqual(StudentListQuerySchema.safeParse(oversizedLimitQuery).success, false, 'Must reject limit > 200');

    const oversizedSearchQuery = { search: 'a'.repeat(150) };
    assert.strictEqual(StudentListQuerySchema.safeParse(oversizedSearchQuery).success, false, 'Must reject search > 100 chars');

    // 2. RBAC Channel Privileges
    const teacherSession = {
      isValid: true,
      userId: 'usr_teacher_1',
      schoolId,
      userName: 'Teacher Rashida',
      role: 'teacher',
      permissions: ['attendance:read', 'attendance:mark', 'students:read'],
    };

    // Teacher can read students and mark attendance
    assert.strictEqual(RbacService.hasPermission(teacherSession.role, teacherSession.permissions, 'students:read'), true);
    assert.strictEqual(RbacService.hasPermission(teacherSession.role, teacherSession.permissions, 'attendance:mark'), true);

    // Teacher CANNOT trigger cloud sync, backup database, or reverse fees
    assert.strictEqual(RbacService.hasPermission(teacherSession.role, teacherSession.permissions, 'sync:trigger'), false);
    assert.strictEqual(RbacService.hasPermission(teacherSession.role, teacherSession.permissions, 'database:backup'), false);
    assert.strictEqual(RbacService.hasPermission(teacherSession.role, teacherSession.permissions, 'fees:reverse'), false);
    assert.strictEqual(RbacService.hasPermission(teacherSession.role, teacherSession.permissions, 'school:settings'), false);

    assert.throws(() => {
      RbacService.assertPermission(teacherSession, 'sync:trigger');
    }, AccessDeniedError);

    assert.throws(() => {
      RbacService.assertPermission(teacherSession, 'fees:reverse');
    }, AccessDeniedError);
  });

  db.close();
  cleanupTempDb();
});
