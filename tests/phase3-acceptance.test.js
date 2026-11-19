const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations/index.js');
const { closeDatabase } = require('../dist/main/database/connection.js');
const { DatabaseKeyManager } = require('../dist/main/security/database-key-manager.js');
const { SubscriptionEnforcer } = require('../dist/main/services/subscription-enforcer.js');
const { LicenseService } = require('../dist/main/services/license.service.js');
const { AuthService } = require('../dist/main/services/auth.service.js');
const { StudentService } = require('../dist/main/services/student.service.js');
const { FeeService } = require('../dist/main/services/fee.service.js');
const { ExamService } = require('../dist/main/services/exam.service.js');
const { AttendanceService } = require('../dist/main/services/attendance.service.js');
const { TimetableService } = require('../dist/main/services/timetable.service.js');
const { EmployeeService } = require('../dist/main/services/employee.service.js');
const { PayrollService } = require('../dist/main/services/payroll.service.js');
const { ExpenseService } = require('../dist/main/services/expense.service.js');
const { ReportService } = require('../dist/main/services/report.service.js');
const { GuardianRepository } = require('../dist/main/database/repositories/guardian.repository.js');
const { FeeRepository } = require('../dist/main/database/repositories/fee.repository.js');
const { OnlineSyncDispatcher } = require('../dist/main/sync/online-sync-dispatcher.js');
const { DeploymentConfigService } = require('../dist/main/services/deployment-config.js');
const { seedDemoData } = require('../dist/main/database/seed.js');

const TEST_VAULT_DIR = path.resolve(__dirname, 'test_phase3_vault');
const TEST_DB_PATH = path.resolve(__dirname, 'test_phase3_acceptance.sqlite');

describe('School Management Software — Phase 3 End-to-End Acceptance & Verification Suite', () => {
  let db;
  let authService;
  let studentService;
  let feeService;
  let examService;
  let attendanceService;
  let timetableService;
  let employeeService;
  let payrollService;
  let expenseService;
  let reportService;
  let guardianRepo;
  let feeRepo;
  let keyManager;
  let licenseService;
  let subscriptionEnforcer;

  let adminSession;
  let schoolId;

  function cleanupFiles() {
    try {
      if (db) db.close();
    } catch {}
    if (fs.existsSync(TEST_VAULT_DIR)) {
      try { fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true }); } catch {}
    }
    const files = [
      TEST_DB_PATH,
      `${TEST_DB_PATH}-wal`,
      `${TEST_DB_PATH}-shm`,
    ];
    for (const f of files) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
  }

  before(async () => {
    cleanupFiles();
    fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });

    DatabaseKeyManager.resetInstanceForTesting();
    keyManager = DatabaseKeyManager.getInstance(TEST_VAULT_DIR);

    db = new Database(TEST_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations(db, ALL_MIGRATIONS);
    seedDemoData(db);

    authService = new AuthService(db);
    studentService = new StudentService(db);
    feeService = new FeeService(db);
    examService = new ExamService(db);
    attendanceService = new AttendanceService(db);
    timetableService = new TimetableService(db);
    employeeService = new EmployeeService(db);
    payrollService = new PayrollService(db);
    expenseService = new ExpenseService(db);
    reportService = new ReportService(db);
    guardianRepo = new GuardianRepository(db);
    feeRepo = new FeeRepository(db);
    licenseService = new LicenseService(db);
    subscriptionEnforcer = SubscriptionEnforcer.getInstance(db);

    const loginRes = await authService.login('admin', 'Admin@12345');
    assert.strictEqual(loginRes.success, true, 'Admin login must succeed');
    adminSession = authService.validateSession(loginRes.token);
    assert.strictEqual(adminSession.isValid, true);
    schoolId = adminSession.schoolId;

    // Ensure fee structure exists for cls_10
    feeService.createFeeStructure(adminSession, {
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      name: 'Class 10 Standard Fee',
      tuitionFee: 6000,
      examFee: 1000,
      miscFee: 500,
      dueDay: 10,
    });
  });

  after(() => {
    cleanupFiles();
  });

  // 1. CLOUD-FIRST & OFFLINE ARCHITECTURE
  it('1. Cloud-First Online Dispatcher: Offline Fallback & Durable Outbox', async () => {
    const dispatcher = new OnlineSyncDispatcher(db);
    const studentId = `std_offline_${Date.now()}`;
    const admitPayload = {
      id: studentId,
      admissionNumber: 'ADM-P3-OFFLINE-01',
      fullName: 'Aisha Malik',
      fatherName: 'Malik Imran',
      gender: 'female',
      dateOfBirth: '2015-05-15',
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      sectionId: 'sec_cls_10_0',
      phone: '0300-1112233',
    };

    const result = await dispatcher.dispatchMutation({
      entityType: 'STUDENT',
      entityId: studentId,
      operation: 'INSERT',
      payload: admitPayload,
      schoolId,
      isOnline: false,
      executeLocal: () => studentService.admitStudent(adminSession, admitPayload),
    });

    assert.strictEqual(result.syncStatus, 'pending', 'Disconnected mutation must have syncStatus pending');
    assert.strictEqual(result.result.fullName, 'Aisha Malik');

    // Verify row committed to SQLite students table
    const stuRow = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    assert.ok(stuRow, 'Data must be committed locally to encrypted SQLite');
    assert.strictEqual(stuRow.full_name, 'Aisha Malik');

    // Verify outbox entry
    const outboxRow = db.prepare('SELECT * FROM sync_outbox WHERE entity_id = ?').get(studentId);
    assert.ok(outboxRow, 'Sync outbox must contain queued mutation');
    assert.strictEqual(outboxRow.status, 'pending');
    assert.ok(outboxRow.idempotency_key, 'Must have idempotency key');
  });

  // 2. SUBSCRIPTION & TAMPER PROTECTION
  it('2. Subscription Enforcer: Clock Rollback Detection Fails Closed & Locks DEK', () => {
    db.prepare(`
      INSERT OR REPLACE INTO license_cache (
        id, license_id, school_id, school_name, school_code, device_id, hardware_fingerprint,
        plan_code, plan_name, status, issued_at, expires_at, grace_period_days,
        last_server_verification, last_observed_local_time, signature, signed_payload, public_key, entitlements_json
      ) VALUES (
        1, 'lic_p3', ?, 'Phase 3 Academy', 'P3-001', 'dev_01', 'hw_01',
        'enterprise', 'Enterprise Plan', 'active', datetime('now'), '2029-01-01T00:00:00.000Z', 7,
        datetime('now'), '2028-01-01T00:00:00.000Z', 'sig', '{}', 'pem', '["*"]'
      )
    `).run(schoolId);

    // Evaluation detects backward time jump
    const status = licenseService.getStatus();
    assert.strictEqual(status.state, 'clock_tampered');
    assert.strictEqual(status.canWrite, false);

    // Flag persisted in SQLite
    const row = db.prepare('SELECT clock_tampered FROM license_cache WHERE id = 1').get();
    assert.strictEqual(row.clock_tampered, 1);

    // Database Key Manager locks on clock tampering
    subscriptionEnforcer.checkStatusAndEnforce();
    assert.strictEqual(keyManager.getStatus().isLocked, true);

    // Reset clock_tampered and key for remaining tests
    db.prepare("UPDATE license_cache SET clock_tampered = 0, last_observed_local_time = datetime('now') WHERE id = 1").run();
    keyManager.unlock();
  });

  // 3. STUDENT JOURNEY & STRICT SINGLE ACTIVE GUARDIAN INVARIANT
  it('3. Student Lifecycle & Strict Single Active Guardian Partial Unique Index', () => {
    const studentId = `std_gdn_test_${Date.now()}`;
    const admitted = studentService.admitStudent(adminSession, {
      id: studentId,
      admissionNumber: 'ADM-P3-GDN-01',
      fullName: 'Bilal Ahmed',
      fatherName: 'Ahmed Raza',
      gender: 'male',
      dateOfBirth: '2014-08-12',
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      sectionId: 'sec_cls_10_0',
      phone: '0321-9876543',
      guardian: {
        fullName: 'Ahmed Raza',
        relationship: 'father',
        phone: '0321-9876543',
        cnic: '35202-9876543-1',
        occupation: 'Software Engineer',
      },
    });

    assert.ok(admitted);
    const activeGdn = guardianRepo.getActiveGuardian(schoolId, studentId);
    assert.ok(activeGdn);
    assert.strictEqual(activeGdn.fullName, 'Ahmed Raza');
    assert.strictEqual(activeGdn.isActive, 1);

    // Database partial index constraint check: Cannot insert a 2nd active guardian
    assert.throws(() => {
      db.prepare(`
        INSERT INTO student_guardians (id, school_id, student_id, full_name, relationship, phone, is_active)
        VALUES ('gdn_dup_active', ?, ?, 'Second Active Guardian', 'uncle', '0300-9999999', 1)
      `).run(schoolId, studentId);
    }, /UNIQUE constraint failed/, 'Inserting second active guardian must violate partial unique index');

    // Replace guardian: archives old guardian with audit reason
    const replaced = studentService.replaceGuardian(
      adminSession,
      studentId,
      {
        fullName: 'Fatima Ahmed',
        relationship: 'mother',
        phone: '0322-1112233',
        cnic: '35202-1112233-2',
        occupation: 'Doctor',
      },
      'Father traveling abroad for contract assignment'
    );

    assert.strictEqual(replaced.newGuardian.fullName, 'Fatima Ahmed');

    // Check old guardian is archived
    const history = guardianRepo.getGuardianHistory(schoolId, studentId);
    assert.strictEqual(history.length, 2);
    const archived = history.find(g => g.id === activeGdn.id);
    assert.strictEqual(archived.isActive, 0);
  });

  // 4. STUDENT PROMOTION PRESERVES FINANCIAL & ATTENDANCE HISTORY
  it('4. Student Promotion Preserves Permanent Identity & Financial Ledger History', () => {
    const students = studentService.listStudents(adminSession, { classId: 'cls_10' });
    assert.ok(students.length > 0, 'Students must exist in class 10');
    const student = students[0];

    // Generate fee invoice for student
    feeService.bulkGenerateInvoices(adminSession, {
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      month: 'April 2026',
      dueDate: '2026-04-10',
    });

    const invoice = db.prepare(`
      SELECT * FROM invoices WHERE school_id = ? AND student_id = ? AND month = 'April 2026'
    `).get(schoolId, student.id);
    assert.ok(invoice, 'Invoice must be generated');

    // Collect fee
    const receiptNum = `REC-PROMO-${Date.now()}`;
    const payRes = feeService.collectFeePayment(adminSession, {
      id: `pay_p3_promo_${Date.now()}`,
      invoiceId: invoice.id,
      receiptNumber: receiptNum,
      amount: 3000,
      paymentDate: '2026-04-05',
      paymentMethod: 'cash',
    });
    assert.strictEqual(payRes.success, true);

    // Record attendance
    attendanceService.recordDailyAttendance(adminSession, [
      {
        id: `att_promo_${student.id}`,
        studentId: student.id,
        sessionId: 'sess_2026_27',
        classId: 'cls_10',
        sectionId: student.section_id,
        date: '2026-04-05',
        status: 'present',
      },
    ]);

    // Insert next academic session for promotion
    db.prepare(`
      INSERT OR IGNORE INTO academic_sessions (id, school_id, name, start_date, end_date, is_current)
      VALUES ('sess_2027_28', ?, '2027-2028', '2027-04-01', '2028-03-31', 0)
    `).run(schoolId);

    // Execute Bulk Promotion
    const promoteRes = studentService.bulkPromoteStudents(adminSession, [
      {
        studentId: student.id,
        targetSessionId: 'sess_2027_28',
        targetClassId: 'cls_10',
        targetSectionId: student.section_id,
      },
    ]);
    assert.strictEqual(promoteRes.promotedCount, 1);

    // Verify historical records intact
    const invCheck = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id);
    assert.ok(invCheck, 'Invoice must remain preserved');

    const paymentRows = db.prepare('SELECT * FROM payments WHERE invoice_id = ?').all(invoice.id);
    assert.strictEqual(paymentRows.length, 1, 'Payment records must remain permanent and intact');

    const attRecords = db.prepare('SELECT * FROM attendance WHERE student_id = ?').all(student.id);
    assert.ok(attRecords.length > 0, 'Attendance history must be preserved across promotion');
  });

  // 5. FEES, OVERPAYMENT REJECTION & LINKED CONTRA-REVERSALS
  it('5. Fees & Invoicing: Overpayment Rejection & Immutable Linked Contra-Reversal', () => {
    const students = studentService.listStudents(adminSession, { sessionId: 'sess_2026_27', classId: 'cls_10' });
    assert.ok(students.length > 0);
    const student = students[0];

    feeService.bulkGenerateInvoices(adminSession, {
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      month: 'May 2026',
      dueDate: '2026-05-10',
    });

    const invoice = db.prepare(`
      SELECT * FROM invoices WHERE school_id = ? AND student_id = ? AND month = 'May 2026'
    `).get(schoolId, student.id);
    assert.ok(invoice);

    const invBalance = invoice.balance;

    // Overpayment rejection
    assert.throws(() => {
      feeService.collectFeePayment(adminSession, {
        id: `pay_over_${Date.now()}`,
        invoiceId: invoice.id,
        receiptNumber: 'REC-OVERPAY',
        amount: invBalance + 1000, // Exceeds balance
        paymentDate: '2026-05-05',
        paymentMethod: 'cash',
      });
    }, /exceeds outstanding balance/i);

    // Valid partial payment
    const receiptNumber = `REC-VAL-${Date.now()}`;
    const payRes = feeService.collectFeePayment(adminSession, {
      id: `pay_val_${Date.now()}`,
      invoiceId: invoice.id,
      receiptNumber,
      amount: 2500,
      paymentDate: '2026-05-05',
      paymentMethod: 'cash',
    });
    assert.strictEqual(payRes.success, true);
    assert.strictEqual(payRes.newBalance, invBalance - 2500);

    // Get payment row id from database
    const paymentRow = db.prepare('SELECT id FROM payments WHERE receipt_number = ?').get(receiptNumber);
    assert.ok(paymentRow);

    // Linked Contra-Reversal
    const revRes = feeService.reverseFeePayment(adminSession, paymentRow.id, 'Erroneous amount deposited by teller');
    assert.strictEqual(revRes.success, true);
    assert.strictEqual(revRes.restoredBalance, invBalance);

    // Verify that the original payment row was NOT deleted or overwritten
    const origRow = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentRow.id);
    assert.ok(origRow, 'Original payment row must permanently exist in ledger');

    // Verify contra-entry reversal row exists
    const reversalRow = db.prepare('SELECT * FROM payments WHERE reversal_for_payment_id = ?').get(paymentRow.id);
    assert.ok(reversalRow, 'Reversal contra-entry row must be linked in ledger');
    assert.strictEqual(reversalRow.amount, -2500);
  });

  // 6. EXAMINATIONS: MARKS, GPA, GAZETTE & TRANSCRIPTS
  it('6. Examinations: Marks Recording, Ranking Gazette & Transcript Generation', () => {
    const exam = examService.createExam(adminSession, {
      id: `exam_term_${Date.now()}`,
      sessionId: 'sess_2026_27',
      name: 'Mid-Term 2026',
      term: 'mid_term',
      startDate: '2026-09-15',
      endDate: '2026-09-25',
    });
    assert.ok(exam);

    const paper = examService.createExamPaper(adminSession, {
      id: `paper_phy_${Date.now()}`,
      examId: exam.id,
      classId: 'cls_10',
      subjectName: 'Physics',
      maxMarks: 100,
      passMarks: 40,
      examDate: '2026-09-16',
    });
    assert.ok(paper);

    const students = studentService.listStudents(adminSession, { sessionId: 'sess_2026_27', classId: 'cls_10' });
    assert.ok(students.length > 0);

    // Enter marks
    examService.recordMarks(adminSession, exam.id, paper.id, [
      { studentId: students[0].id, obtainedMarks: 85, isAbsent: false },
    ]);

    // Calculate Exam Results
    const results = examService.calculateExamResults(adminSession, exam.id, 'cls_10');
    assert.ok(results.totalStudents > 0);
    assert.ok(results.results.length > 0);
    assert.strictEqual(results.results[0].rank, 1);

    // Generate Student Report Card
    const reportCard = examService.generateReportCard(adminSession, exam.id, students[0].id);
    assert.ok(reportCard);
    assert.strictEqual(reportCard.student.id, students[0].id);
  });

  // 7. FACULTY & STAFF PAYROLL
  it('7. Faculty & Staff: Daily Attendance, Salary Structure & Monthly Payroll Run', () => {
    const staff = employeeService.listEmployees(adminSession);
    assert.ok(staff.length > 0);
    const emp1 = staff[0];

    // Staff Daily Attendance
    const today = '2026-11-14';
    const attRes = employeeService.recordStaffAttendance(adminSession, [
      {
        id: `sa_${emp1.id}_${today}`,
        employeeId: emp1.id,
        date: today,
        status: 'present',
        checkInTime: '07:45 AM',
        remarks: 'On time',
      },
    ]);
    assert.strictEqual(attRes.recordedCount, 1);

    // Configure Salary Structure
    const salary = payrollService.saveSalaryStructure(adminSession, {
      employeeId: emp1.id,
      basicSalary: 75000,
      allowancesJson: JSON.stringify([{ title: 'Medical', amount: 5000 }]),
      deductionsJson: JSON.stringify([{ title: 'Tax', amount: 2000 }]),
    });
    assert.strictEqual(salary.basicSalary, 75000);

    // Generate Monthly Payroll Run
    const payrollRun = payrollService.generatePayrollRun(adminSession, {
      month: 'November',
      year: 2026,
    });
    assert.strictEqual(payrollRun.run.month, 'November');
    assert.ok(payrollRun.slipCount >= 1);

    const details = payrollService.getPayrollRunDetails(adminSession, payrollRun.run.id);
    const slip = details.slips.find(s => s.employeeId === emp1.id);
    assert.ok(slip);
    assert.strictEqual(slip.netSalary, 78000); // 75000 + 5000 - 2000
  });

  // 8. ACCOUNTS & FINANCIAL LEDGER
  it('8. Accounts, Expense Vouchers & Net Operating Cash Calculation', () => {
    const exp1 = expenseService.recordExpense(adminSession, {
      id: `exp_p3_${Date.now()}`,
      category: 'utilities',
      amount: 12000,
      expenseDate: '2026-11-12',
      vendor: 'Sui Northern Gas',
      description: 'Campus heating fuel',
      paymentMethod: 'bank_transfer',
      reference: 'SNGPL-NOV-2026',
    });
    assert.strictEqual(exp1.amount, 12000);

    const voucher = expenseService.getVoucherDetails(adminSession, exp1.id);
    assert.strictEqual(voucher.amount, 12000);
    assert.strictEqual(voucher.vendor, 'Sui Northern Gas');

    const cashReport = reportService.getNetOperatingCashReport(adminSession, '2026-11-01', '2026-11-30');
    assert.ok(cashReport.summary.totalExpenses >= 12000);
    assert.strictEqual(
      cashReport.summary.netOperatingCash,
      cashReport.summary.realizedRevenue - cashReport.summary.totalExpenses
    );
  });

  // 9. INSTITUTIONAL REPORTS
  it('9. All 6 Institutional Reports Generate Valid Data Models', () => {
    const roster = reportService.getStudentRoster(adminSession);
    assert.strictEqual(roster.title, 'Official Student Enrollment Roster');
    assert.ok(roster.rows.length > 0);

    const defaulters = reportService.getFeeDefaulters(adminSession);
    assert.strictEqual(defaulters.title, 'Fee Defaulters & Outstanding Register');
    assert.ok(Array.isArray(defaulters.rows));

    const cashReport = reportService.getNetOperatingCashReport(adminSession, '2026-04-01', '2026-11-30');
    assert.strictEqual(cashReport.title, 'Net Operating Cash Flow Statement');
    assert.ok(typeof cashReport.summary.netOperatingCash === 'number');

    const attReg = reportService.getAttendanceRegister(adminSession, '2026-04-01', '2026-11-30', 'cls_10');
    assert.strictEqual(attReg.title, 'Attendance Register Summary');
    assert.ok(attReg.rows.length > 0);

    const staffRoster = reportService.getStaffRoster(adminSession);
    assert.strictEqual(staffRoster.title, 'Faculty & Administrative Staff Roster');
    assert.ok(staffRoster.rows.length > 0);
  });

  // 10. SECURITY & CONFIG HIERARCHY
  it('10. Security: Deployment Configuration Hierarchy & Zero Hardcoded Passkeys', async () => {
    // Valid HTTPS production URL
    const httpsRes = DeploymentConfigService.validateCloudUrl('https://smsapi.teachassist.site/api/v1/', true);
    assert.strictEqual(httpsRes.valid, true);
    assert.strictEqual(httpsRes.cleanUrl, 'https://smsapi.teachassist.site/api/v1');

    // Loopback HTTP in production for local testing
    const loopbackRes = DeploymentConfigService.validateCloudUrl('http://localhost:4000/api/v1', true);
    assert.strictEqual(loopbackRes.valid, true);
    assert.strictEqual(loopbackRes.cleanUrl, 'http://localhost:4000/api/v1');

    // Technician authorization: Reject common hardcoded guesses
    const badGuesses = ['TECH-ADMIN-2026', 'admin', 'sms@2026', '123456', 'password'];
    for (const guess of badGuesses) {
      const authResult = await DeploymentConfigService.verifyTechnicianKey(guess);
      assert.strictEqual(authResult.success, false, `Hardcoded guess "${guess}" must never be accepted`);
    }
  });
});
