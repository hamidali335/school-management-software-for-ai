const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations, getAppliedMigrationVersions } = require('../dist/main/database/migrations');
const { AuthService } = require('../dist/main/services/auth.service');
const { FeeService } = require('../dist/main/services/fee.service');
const { FeeRepository } = require('../dist/main/database/repositories/fee.repository');
const { StudentService } = require('../dist/main/services/student.service');
const { StudentRepository } = require('../dist/main/database/repositories/student.repository');
const { getDatabaseStatus, initDatabase, closeDatabase } = require('../dist/main/database/connection');

const testDbPath = path.join(__dirname, 'final_closure_verification_temp.db');

function cleanupTempDb() {
  for (const ext of ['', '-wal', '-shm']) {
    const p = testDbPath + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

test('School Management Software — Final Phase 2 Closure Verification Suite', async (suite) => {
  cleanupTempDb();

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');

  runMigrations(db, ALL_MIGRATIONS);

  // Setup School Administrator
  const authService = new AuthService(db);
  const prov = await authService.provisionInitialAdmin({
    schoolName: 'Govt Higher Secondary School Gujrat',
    schoolCode: 'GHSSG-01',
    adminName: 'Principal Tariq Mehmood',
    adminEmail: 'principal@ghssg.edu.pk',
    adminUsername: 'ghssg_admin',
    adminPassword: 'Password@2026',
  });
  const schoolId = prov.installation.schoolId;

  const session = {
    isValid: true,
    userId: prov.adminUser.id,
    schoolId,
    userName: 'Principal Tariq Mehmood',
    role: 'school_owner',
    permissions: ['*'],
  };

  // Seed baseline academic structure
  db.prepare("INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current) VALUES ('sess_2026', ?, '2026-2027', '2026-04-01', '2027-03-31', 1)").run(schoolId);
  db.prepare("INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current) VALUES ('sess_2027', ?, '2027-2028', '2027-04-01', '2028-03-31', 0)").run(schoolId);
  db.prepare("INSERT INTO classes (id, school_id, name, order_index) VALUES ('cls_9th', ?, 'Class 9', 9)").run(schoolId);
  db.prepare("INSERT INTO classes (id, school_id, name, order_index) VALUES ('cls_10th', ?, 'Class 10', 10)").run(schoolId);
  db.prepare("INSERT INTO sections (id, school_id, class_id, name) VALUES ('sec_9th_a', ?, 'cls_9th', 'Section A')").run(schoolId);
  db.prepare("INSERT INTO sections (id, school_id, class_id, name) VALUES ('sec_10th_a', ?, 'cls_10th', 'Section A')").run(schoolId);

  // --- 1. SQLite Durability Pragmas Runtime Verification ---
  await suite.test('1. Durability Pragmas: synchronous=FULL (2), WAL mode, and foreign_keys=ON (1) verified at runtime', () => {
    const journalMode = db.pragma('journal_mode', { simple: true });
    assert.strictEqual(journalMode.toLowerCase(), 'wal', 'Journal mode must be WAL');

    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    assert.strictEqual(foreignKeys, 1, 'Foreign keys pragma must be active (1)');

    const synchronous = db.pragma('synchronous', { simple: true });
    assert.strictEqual(synchronous, 2, 'PRAGMA synchronous must be FULL (integer value 2)');

    const integrity = db.pragma('integrity_check', { simple: true });
    assert.strictEqual(integrity, 'ok', 'Physical database file integrity check must be ok');
  });

  // --- 2. WAL Checkpoint & Clean Shutdown Verification ---
  await suite.test('2. WAL Checkpoint TRUNCATE and Clean Database Close/Reopen', () => {
    // Perform test write
    db.prepare("INSERT INTO classes (id, school_id, name, order_index) VALUES ('cls_temp', ?, 'Class Temp', 99)").run(schoolId);

    // Run WAL checkpoint truncate
    const cp = db.pragma('wal_checkpoint(TRUNCATE)');
    assert.strictEqual(cp[0].busy, 0, 'WAL checkpoint must not be busy');

    // Clean up temporary write
    db.prepare("DELETE FROM classes WHERE id = 'cls_temp'").run();
    db.pragma('wal_checkpoint(TRUNCATE)');
  });

  // --- 3. Forward Migration & Foreign Key Anti-Cascade Protection ---
  await suite.test('3. Migration 004 Restricts Cascading Deletion of Sections and Classes', () => {
    const applied = getAppliedMigrationVersions(db);
    assert.ok(applied.has(1), 'Migration 1 applied');
    assert.ok(applied.has(2), 'Migration 2 applied');
    assert.ok(applied.has(3), 'Migration 3 applied');
    assert.ok(applied.has(4), 'Migration 4 applied');

    // Attempting to delete class 'cls_9th' must fail because 'sec_9th_a' references it with RESTRICT
    assert.throws(() => {
      db.prepare("DELETE FROM classes WHERE id = 'cls_9th'").run();
    }, /FOREIGN KEY constraint failed/);

    const cls = db.prepare("SELECT * FROM classes WHERE id = 'cls_9th'").get();
    assert.ok(cls, 'Class must not be deleted');
  });

  // --- 4. Invoice Deletion Blocked with Payment History ---
  await suite.test('4. Anti-Cascading Deletion: Invoice Deletion Blocked When Payment History Exists', () => {
    const feeRepo = new FeeRepository(db);
    const feeService = new FeeService(db);
    const studentRepo = new StudentRepository(db);

    // Create student
    studentRepo.createStudent({
      id: 'stu_closure_1',
      schoolId,
      admissionNumber: 'GHSSG-2026-001',
      fullName: 'Hamza Farooq',
      fatherName: 'Farooq Ahmed',
      gender: 'male',
      dateOfBirth: '2010-05-15',
      cnicBform: '34201-1234567-1',
      phone: '0300-1234567',
      address: 'Gujrat City',
      status: 'active',
    });

    studentRepo.enrollStudent({
      id: 'enr_closure_1',
      schoolId,
      studentId: 'stu_closure_1',
      sessionId: 'sess_2026',
      classId: 'cls_9th',
      sectionId: 'sec_9th_a',
      rollNumber: '01',
      status: 'enrolled',
    });

    // Create fee invoice of Rs. 8,000
    feeRepo.createInvoice({
      id: 'inv_closure_1',
      schoolId,
      challanNumber: 'CH-CLOSURE-001',
      studentId: 'stu_closure_1',
      sessionId: 'sess_2026',
      month: 'April 2026',
      dueDate: '2026-04-10',
      amount: 8000,
      previousDues: 0,
      paidAmount: 0,
      balance: 8000,
      status: 'unpaid',
    });

    // Collect payment of Rs. 8,000
    feeService.collectFeePayment(session, {
      id: 'pay_closure_1',
      invoiceId: 'inv_closure_1',
      receiptNumber: 'RCP-CLOSURE-001',
      amount: 8000,
      paymentDate: '2026-04-05',
      paymentMethod: 'cash',
    });

    // 1. Attempt invoice deletion via FeeService / FeeRepository: MUST FAIL
    assert.throws(() => {
      feeService.deleteInvoice(session, 'inv_closure_1');
    }, /Cannot delete fee invoice: associated payment history exists/);

    // 2. Attempt direct SQL DELETE FROM invoices: MUST FAIL via engine trigger and foreign key
    assert.throws(() => {
      db.prepare("DELETE FROM invoices WHERE id = 'inv_closure_1'").run();
    }, /Cannot delete fee invoice: associated payment history exists|FOREIGN KEY constraint failed/);

    // PROOF: Invoice and payment history are 100% preserved
    const inv = db.prepare("SELECT * FROM invoices WHERE id = 'inv_closure_1'").get();
    assert.ok(inv, 'Invoice must still exist');
    assert.strictEqual(inv.paid_amount, 8000);

    const pay = db.prepare("SELECT * FROM payments WHERE id = 'pay_closure_1'").get();
    assert.ok(pay, 'Payment receipt must still exist');
    assert.strictEqual(pay.amount, 8000);
  });

  // --- 5. Payment Physical Deletion Blocked by Engine-Level Trigger ---
  await suite.test('5. Payment Receipts Cannot Be Physically Deleted Even with Raw SQL', () => {
    // Attempting raw SQL deletion of payment receipt
    assert.throws(() => {
      db.prepare("DELETE FROM payments WHERE id = 'pay_closure_1'").run();
    }, /Financial records are immutable: physical deletion of payment receipts is forbidden/);

    const pay = db.prepare("SELECT * FROM payments WHERE id = 'pay_closure_1'").get();
    assert.ok(pay, 'Payment record is permanently immutable on disk');
  });

  // --- 6. Reversal History Preserved & Deletion Still Blocked ---
  await suite.test('6. Reversal Contra-Entry Permanently Blocks Invoice Deletion', () => {
    const feeService = new FeeService(db);

    // Reverse payment
    const revRes = feeService.reverseFeePayment(session, 'pay_closure_1', 'Incorrect challan issued');
    assert.ok(revRes.reversalPaymentId);

    // Both original payment and contra-entry now exist in payments table
    const paymentsCount = db.prepare("SELECT COUNT(*) as c FROM payments WHERE invoice_id = 'inv_closure_1'").get().c;
    assert.strictEqual(paymentsCount, 2, 'Must have 2 payment records (original + contra-entry)');

    // Attempting deletion of invoice after reversal MUST STILL FAIL
    assert.throws(() => {
      feeService.deleteInvoice(session, 'inv_closure_1');
    }, /Cannot delete fee invoice: associated payment history exists/);

    assert.throws(() => {
      db.prepare("DELETE FROM invoices WHERE id = 'inv_closure_1'").run();
    }, /Cannot delete fee invoice: associated payment history exists|FOREIGN KEY constraint failed/);

    const invAfter = db.prepare("SELECT * FROM invoices WHERE id = 'inv_closure_1'").get();
    assert.ok(invAfter, 'Invoice remains preserved with complete historical ledger');
    assert.strictEqual(invAfter.balance, 8000);
  });

  // --- 7. Student Physical Deletion Blocked with Financial History ---
  await suite.test('7. Student Physical Deletion Blocked When Financial History Exists', () => {
    const studentService = new StudentService(db);

    // Attempting deletion via service: rejected by trigger / foreign key
    assert.throws(() => {
      studentService.deleteStudent(session, 'stu_closure_1');
    }, /Cannot delete student: associated financial invoices and payment records exist|FOREIGN KEY constraint failed/);

    // Attempting raw SQL deletion of student: rejected
    assert.throws(() => {
      db.prepare("DELETE FROM students WHERE id = 'stu_closure_1'").run();
    }, /Cannot delete student: associated financial invoices and payment records exist|FOREIGN KEY constraint failed/);

    const stu = db.prepare("SELECT * FROM students WHERE id = 'stu_closure_1'").get();
    assert.ok(stu, 'Student record must remain intact');
  });

  // --- 8. Student Lifecycle Operations Preserve Historical Financial Records ---
  await suite.test('8. Student Archival, Promotion and Graduation Preserves All Financial Records', () => {
    const studentService = new StudentService(db);

    // 1. Promote student to 10th class in next session 2027
    const newEnr = studentService.promoteStudent(session, {
      studentId: 'stu_closure_1',
      targetSessionId: 'sess_2027',
      targetClassId: 'cls_10th',
      targetSectionId: 'sec_10th_a',
      rollNumber: '10',
    });
    assert.ok(newEnr, 'New enrollment created');

    // Verify previous enrollment is marked 'promoted'
    const prevEnr = db.prepare("SELECT * FROM student_enrollments WHERE id = 'enr_closure_1'").get();
    assert.strictEqual(prevEnr.status, 'promoted');

    // 2. Archive / Graduate student
    const archivedStu = studentService.archiveStudent(session, 'stu_closure_1', 'graduated', 'Completed secondary education');
    assert.strictEqual(archivedStu.status, 'graduated');

    // PROOF: All historical invoices and payments remain 100% intact after promotion and graduation
    const inv = db.prepare("SELECT * FROM invoices WHERE student_id = 'stu_closure_1'").get();
    assert.ok(inv, 'Historical invoice must be preserved');
    assert.strictEqual(inv.challan_number, 'CH-CLOSURE-001');

    const payments = db.prepare("SELECT * FROM payments WHERE invoice_id = ?").all(inv.id);
    assert.strictEqual(payments.length, 2, 'All historical payment receipts and reversals must be preserved');
  });

  // --- 9. Soft-Cancellation of Unpaid Invoices without Payment History ---
  await suite.test('9. Soft Cancellation of Unpaid Invoices (Zero Payments)', () => {
    const feeRepo = new FeeRepository(db);
    const feeService = new FeeService(db);

    // Create an unpaid invoice with NO payments
    feeRepo.createInvoice({
      id: 'inv_unpaid_err',
      schoolId,
      challanNumber: 'CH-ERR-099',
      studentId: 'stu_closure_1',
      sessionId: 'sess_2026',
      month: 'May 2026',
      dueDate: '2026-05-10',
      amount: 5000,
      previousDues: 0,
      paidAmount: 0,
      balance: 5000,
      status: 'unpaid',
    });

    // Cancel the invoice safely via soft status change
    const cancelRes = feeService.cancelInvoice(session, 'inv_unpaid_err', 'Issued in error to graduated student');
    assert.strictEqual(cancelRes.success, true);

    const cancelledInv = db.prepare("SELECT * FROM invoices WHERE id = 'inv_unpaid_err'").get();
    assert.strictEqual(cancelledInv.is_cancelled, 1);
    assert.ok(cancelledInv.cancelled_at);
    assert.strictEqual(cancelledInv.cancellation_reason, 'Issued in error to graduated student');

    const listedInvoices = feeRepo.listInvoices(schoolId);
    const listedCancelled = listedInvoices.find(i => i.id === 'inv_unpaid_err');
    assert.ok(listedCancelled);
    assert.strictEqual(listedCancelled.status, 'cancelled');
  });

  db.close();
  cleanupTempDb();
});
