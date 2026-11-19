const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations/index');
const { seedDemoData } = require('../dist/main/database/seed');
const { AuthService } = require('../dist/main/services/auth.service');
const { StudentService } = require('../dist/main/services/student.service');
const { FeeService } = require('../dist/main/services/fee.service');
const { ExamService } = require('../dist/main/services/exam.service');
const { AttendanceService } = require('../dist/main/services/attendance.service');
const { TimetableService } = require('../dist/main/services/timetable.service');
const { EmployeeService } = require('../dist/main/services/employee.service');
const { PayrollService } = require('../dist/main/services/payroll.service');
const { SettingsService } = require('../dist/main/services/settings.service');
const { ExpenseService } = require('../dist/main/services/expense.service');
const { ReportService } = require('../dist/main/services/report.service');
const { GuardianRepository } = require('../dist/main/database/repositories/guardian.repository');
const { FeeRepository } = require('../dist/main/database/repositories/fee.repository');

const TEST_DB_PATH = path.resolve(__dirname, 'test_phase4_workflows.sqlite');

describe('School Management Software — Phase 4 Comprehensive Business Workflows Suite', () => {
  let db;
  let authService;
  let studentService;
  let feeService;
  let examService;
  let attendanceService;
  let timetableService;
  let employeeService;
  let payrollService;
  let settingsService;
  let expenseService;
  let reportService;
  let guardianRepo;
  let feeRepo;

  let adminSession;
  let schoolId;

  before(async () => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

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
    settingsService = new SettingsService(db);
    expenseService = new ExpenseService(db);
    reportService = new ReportService(db);
    guardianRepo = new GuardianRepository(db);
    feeRepo = new FeeRepository(db);

    const loginRes = await authService.login('admin', 'Admin@12345');
    assert.strictEqual(loginRes.success, true, 'Admin login must succeed');
    adminSession = authService.validateSession(loginRes.token);
    assert.strictEqual(adminSession.isValid, true);
    schoolId = adminSession.schoolId;
  });

  after(() => {
    try {
      db.close();
      if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch {}
  });

  // --------------------------------------------------------------------------
  // 1. MIGRATION 006 & SCHEMA INTEGRITY
  // --------------------------------------------------------------------------
  test('1. Migration 006 Schema & Constraints Verification', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    assert.ok(tables.includes('student_guardians'), 'student_guardians table must exist');
    assert.ok(tables.includes('fee_concessions'), 'fee_concessions table must exist');
    assert.ok(tables.includes('grading_scales'), 'grading_scales table must exist');
    assert.ok(tables.includes('staff_attendance'), 'staff_attendance table must exist');
    assert.ok(tables.includes('staff_salaries'), 'staff_salaries table must exist');
    assert.ok(tables.includes('payroll_runs'), 'payroll_runs table must exist');
    assert.ok(tables.includes('payroll_slips'), 'payroll_slips table must exist');
    assert.ok(tables.includes('school_settings'), 'school_settings table must exist');

    // Verify partial unique index for single active guardian
    const indexRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_single_active_guardian'").get();
    assert.ok(indexRow, 'idx_single_active_guardian index must exist');
    assert.ok(indexRow.sql.includes('WHERE is_active = 1'), 'Must be a partial index on is_active = 1');
  });

  // --------------------------------------------------------------------------
  // 2. STUDENT ADMISSION & SINGLE ACTIVE GUARDIAN INVARIANT
  // --------------------------------------------------------------------------
  test('2. Student Admission & Strict Single Active Guardian Invariant', () => {
    const studentId = `std_test_${Date.now()}`;
    const admitted = studentService.admitStudent(adminSession, {
      id: studentId,
      admissionNumber: 'ADM-P4-001',
      fullName: 'Hamza Tariq',
      fatherName: 'Tariq Mehmood',
      gender: 'male',
      dateOfBirth: '2014-03-20',
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      sectionId: 'sec_cls_10_0',
      phone: '0300-9876543',
      guardian: {
        fullName: 'Tariq Mehmood',
        relationship: 'father',
        phone: '0300-9876543',
        cnic: '35201-1122334-5',
        occupation: 'Civil Engineer',
      },
    });

    assert.strictEqual(admitted.fullName, 'Hamza Tariq');

    // Verify active guardian created
    const activeGuardian = guardianRepo.getActiveGuardian(schoolId, studentId);
    assert.ok(activeGuardian, 'Active guardian must exist');
    assert.strictEqual(activeGuardian.fullName, 'Tariq Mehmood');
    assert.strictEqual(activeGuardian.isActive, 1);

    // Database Invariant: Attempting to insert a 2nd active guardian directly into SQLite must fail!
    assert.throws(() => {
      db.prepare(`
        INSERT INTO student_guardians (id, school_id, student_id, full_name, relationship, phone, is_active)
        VALUES ('gdn_dup', ?, ?, 'Duplicate Active Guardian', 'uncle', '0300-0000000', 1)
      `).run(schoolId, studentId);
    }, /UNIQUE constraint failed/, 'Database must reject duplicate active guardian');

    // Replace Guardian with audit trail
    const replaced = studentService.replaceGuardian(
      adminSession,
      studentId,
      {
        fullName: 'Ayesha Tariq',
        relationship: 'mother',
        phone: '0321-4455667',
        occupation: 'Professor',
      },
      'Father moved abroad on work permit'
    );

    assert.strictEqual(replaced.fullName, 'Ayesha Tariq');
    assert.strictEqual(replaced.isActive, 1);

    // Old guardian should now be archived with reason
    const history = guardianRepo.getGuardianHistory(schoolId, studentId);
    assert.strictEqual(history.length, 2, 'History must contain 2 guardians');
    const archived = history.find(g => g.isActive === 0);
    assert.strictEqual(archived.fullName, 'Tariq Mehmood');
    assert.strictEqual(archived.replacementReason, 'Father moved abroad on work permit');

    // Aggregate Profile
    const profile = studentService.getStudentProfile(adminSession, studentId);
    assert.strictEqual(profile.student.fullName, 'Hamza Tariq');
    assert.strictEqual(profile.activeGuardian.fullName, 'Ayesha Tariq');
    assert.strictEqual(profile.guardianHistory.length, 2);
  });

  // --------------------------------------------------------------------------
  // 3. SESSION ROLLOVER & BULK PROMOTION
  // --------------------------------------------------------------------------
  test('3. Session Rollover & Atomic Bulk Student Promotion', () => {
    // Admit another student in 2026-27 session
    const std2Id = `std_test_2_${Date.now()}`;
    studentService.admitStudent(adminSession, {
      id: std2Id,
      admissionNumber: 'ADM-P4-002',
      fullName: 'Sara Khan',
      fatherName: 'Aslam Khan',
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      sectionId: 'sec_cls_10_0',
      phone: '0300-5551122',
    });

    // Create target session 2027-28
    const academicService = new (require('../dist/main/services/academic.service').AcademicService)(db);
    academicService.createSession(adminSession, {
      id: 'sess_2027_28',
      name: 'Academic Session 2027-2028',
      startDate: '2027-04-01',
      endDate: '2028-03-31',
      isCurrent: false,
    });

    // Bulk promote both students to next session
    const studentsToPromote = [
      { studentId: std2Id, targetSessionId: 'sess_2027_28', targetClassId: 'cls_10', targetSectionId: 'sec_cls_10_0' },
    ];

    const bulkRes = studentService.bulkPromoteStudents(adminSession, studentsToPromote);
    assert.strictEqual(bulkRes.promotedCount, 1);

    // Verify student is active in new session
    const currentEnr = db.prepare(`
      SELECT session_id, status FROM student_enrollments
      WHERE school_id = ? AND student_id = ? AND session_id = 'sess_2027_28'
    `).get(schoolId, std2Id);
    assert.ok(['enrolled', 'active'].includes(currentEnr.status), 'New enrollment status should be enrolled');

    // Verify old enrollment is marked promoted
    const oldEnr = db.prepare(`
      SELECT status FROM student_enrollments
      WHERE school_id = ? AND student_id = ? AND session_id = 'sess_2026_27'
    `).get(schoolId, std2Id);
    assert.strictEqual(oldEnr.status, 'promoted');
  });

  // --------------------------------------------------------------------------
  // 4. STUDENT ATTENDANCE & CLASS ELIGIBILITY
  // --------------------------------------------------------------------------
  test('4. Student Daily Attendance, Eligibility Verification & Correction', () => {
    const today = '2026-11-13';
    const students = studentService.listStudents(adminSession, { classId: 'cls_10' });
    assert.ok(students.length > 0);
    const validStudent = students[0];

    // 1. Valid Attendance Roll-Call
    const res = attendanceService.recordDailyAttendance(adminSession, [
      {
        id: `att_${validStudent.id}_${today}`,
        studentId: validStudent.id,
        sessionId: 'sess_2026_27',
        classId: 'cls_10',
        sectionId: 'sec_cls_10_0',
        date: today,
        status: 'absent',
        remarks: 'Sick leave requested',
      },
    ]);
    assert.strictEqual(res.recordedCount, 1);

    // 2. Class Eligibility: marking attendance for student not enrolled in class throws error
    assert.throws(() => {
      attendanceService.recordDailyAttendance(adminSession, [
        {
          id: `att_fake_${Date.now()}`,
          studentId: validStudent.id,
          sessionId: 'sess_2026_27',
          classId: 'non_existent_class',
          sectionId: 'sec_cls_10_0',
          date: today,
          status: 'present',
        },
      ]);
    }, /not actively enrolled/, 'Must reject attendance for unenrolled student');

    // 3. Attendance Correction with Audit
    const attRecord = db.prepare('SELECT id FROM attendance WHERE school_id = ? AND student_id = ? AND date = ?').get(schoolId, validStudent.id, today);
    assert.ok(attRecord);

    const corr = attendanceService.correctAttendance(
      adminSession,
      attRecord.id,
      'present',
      'Student arrived with gate pass'
    );
    assert.strictEqual(corr.oldStatus, 'absent');
    assert.strictEqual(corr.newStatus, 'present');

    // Verify updated record
    const updated = db.prepare('SELECT status, remarks FROM attendance WHERE id = ?').get(attRecord.id);
    assert.strictEqual(updated.status, 'present');
    assert.ok(updated.remarks.includes('Corrected to present'));
  });

  // --------------------------------------------------------------------------
  // 5. FEE STRUCTURE, CONCESSIONS & IDEMPOTENT BULK INVOICES
  // --------------------------------------------------------------------------
  test('5. Fee Structure, Concessions, Idempotent Bulk Invoicing & Overpayment Prevention', () => {
    // 1. Create Class Fee Structure
    const structure = feeService.createFeeStructure(adminSession, {
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      name: 'Class 10 Standard Fee',
      tuitionFee: 8000,
      examFee: 1000,
      miscFee: 500,
      dueDay: 10,
    });
    assert.strictEqual(structure.tuitionFee, 8000);

    // 2. Grant Concession to a student (20% discount)
    const students = studentService.listStudents(adminSession, { classId: 'cls_10' });
    const concStudent = students[0];

    const conc = feeService.createConcession(adminSession, {
      studentId: concStudent.id,
      sessionId: 'sess_2026_27',
      concessionType: 'percentage',
      value: 20,
      reason: 'Academic Excellence Scholarship',
    });
    assert.strictEqual(conc.status, 'active');

    // 3. Bulk Generate Invoices for December 2026
    const bulkGen = feeService.bulkGenerateInvoices(adminSession, {
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      month: 'December 2026',
      dueDate: '2026-12-10',
    });
    assert.ok(bulkGen.generatedCount > 0);

    // Verify discounted invoice for concession student
    const studentInv = db.prepare(`
      SELECT * FROM invoices WHERE school_id = ? AND student_id = ? AND month = 'December 2026'
    `).get(schoolId, concStudent.id);
    assert.ok(studentInv);
    assert.strictEqual(studentInv.discount_amount, (8000 + 1000 + 500) * 0.20); // 9500 * 0.2 = 1900

    // 4. Idempotency Check: Running bulk generate again for December must skip already-billed students
    const bulkGen2 = feeService.bulkGenerateInvoices(adminSession, {
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      month: 'December 2026',
      dueDate: '2026-12-10',
    });
    assert.strictEqual(bulkGen2.generatedCount, 0, 'Must generate 0 new invoices on repeat run');
    assert.strictEqual(bulkGen2.skippedCount, bulkGen.generatedCount, 'Must skip all previously generated students');

    // 5. Strict Overpayment Rejection
    const invBalance = studentInv.balance;
    assert.throws(() => {
      feeService.collectFeePayment(adminSession, {
        id: `pay_over_${Date.now()}`,
        invoiceId: studentInv.id,
        receiptNumber: 'REC-OVERPAY',
        amount: invBalance + 1000, // exceeds balance!
        paymentDate: '2026-12-05',
        paymentMethod: 'cash',
      });
    }, /exceeds outstanding balance/, 'Must strictly reject payment amount exceeding invoice balance');

    // 6. Valid Payment Collection & Contra-Reversal
    const payRes = feeService.collectFeePayment(adminSession, {
      id: `pay_valid_${Date.now()}`,
      invoiceId: studentInv.id,
      receiptNumber: 'REC-VALID-01',
      amount: 2000,
      paymentDate: '2026-12-05',
      paymentMethod: 'cash',
    });
    assert.strictEqual(payRes.success, true);
    assert.strictEqual(payRes.newBalance, invBalance - 2000);

    // Reverse payment
    const paymentRow = db.prepare('SELECT id FROM payments WHERE receipt_number = ?').get('REC-VALID-01');
    const rev = feeService.reverseFeePayment(adminSession, paymentRow.id, 'Cheque return');
    assert.strictEqual(rev.success, true);
    assert.strictEqual(rev.restoredBalance, invBalance);

    // Verify Defaulters Register
    const defaulters = feeService.getDefaulters(adminSession, 1, 'December 2026');
    assert.ok(defaulters.length > 0);
    assert.ok(defaulters[0].guardianPhone !== undefined);
  });

  // --------------------------------------------------------------------------
  // 6. EXAMINATIONS, PAPERS, GRADING & GAZETTE
  // --------------------------------------------------------------------------
  test('6. Examinations, Grading Rules, Result Calculation & Official Gazette', () => {
    // 1. Create Exam
    const exam = examService.createExam(adminSession, {
      id: `exam_${Date.now()}`,
      sessionId: 'sess_2026_27',
      name: 'Final Term Examination 2026',
      term: 'final_term',
      startDate: '2026-12-15',
      endDate: '2026-12-30',
      status: 'scheduled',
    });
    assert.strictEqual(exam.name, 'Final Term Examination 2026');

    // 2. Create Papers
    const mathPaper = examService.createExamPaper(adminSession, {
      id: `paper_math_${Date.now()}`,
      examId: exam.id,
      classId: 'cls_10',
      subjectName: 'Mathematics',
      maxMarks: 100,
      passMarks: 40,
    });
    const engPaper = examService.createExamPaper(adminSession, {
      id: `paper_eng_${Date.now()}`,
      examId: exam.id,
      classId: 'cls_10',
      subjectName: 'English Literature',
      maxMarks: 100,
      passMarks: 40,
    });

    // 3. Record Marks for students
    const students = studentService.listStudents(adminSession, { sessionId: 'sess_2026_27', classId: 'cls_10' });
    assert.ok(students.length >= 2);

    examService.recordMarks(adminSession, exam.id, mathPaper.id, [
      { studentId: students[0].id, obtainedMarks: 95, isAbsent: false },
      { studentId: students[1].id, obtainedMarks: 35, isAbsent: false }, // failed
    ]);

    examService.recordMarks(adminSession, exam.id, engPaper.id, [
      { studentId: students[0].id, obtainedMarks: 88, isAbsent: false },
      { studentId: students[1].id, obtainedMarks: 70, isAbsent: false },
    ]);

    // 4. Calculate Exam Results
    const results = examService.calculateExamResults(adminSession, exam.id, 'cls_10');
    assert.strictEqual(results.totalStudents, students.length);

    // Student 0 should have rank 1 with high percentage
    const topStudent = results.results.find(r => r.studentId === students[0].id);
    assert.strictEqual(topStudent.rank, 1);
    assert.strictEqual(topStudent.status, 'PASS');
    assert.strictEqual(topStudent.overallPercentage, 91.5); // (95 + 88) / 200 = 91.5%
    assert.strictEqual(topStudent.overallGrade, 'A+');

    // Student 1 failed math, so overall status should be FAIL
    const failedStudent = results.results.find(r => r.studentId === students[1].id);
    assert.strictEqual(failedStudent.status, 'FAIL');

    // 5. Generate Report Card
    const reportCard = examService.generateReportCard(adminSession, exam.id, students[0].id);
    assert.strictEqual(reportCard.student.fullName, students[0].full_name);
    assert.strictEqual(reportCard.result.overallGrade, 'A+');
    assert.strictEqual(reportCard.result.rank, 1);
    assert.strictEqual(reportCard.result.subjects.length, 2);

    // 6. Publish Exam
    const pub = examService.publishExam(adminSession, exam.id);
    assert.strictEqual(pub.success, true);
    const updatedExam = examService.listExams(adminSession, 'sess_2026_27').find(e => e.id === exam.id);
    assert.strictEqual(updatedExam.status, 'published');
  });

  // --------------------------------------------------------------------------
  // 7. TIMETABLE CONFLICT DETECTION
  // --------------------------------------------------------------------------
  test('7. Timetable Multi-Dimensional Conflict Detection', () => {
    const staff = employeeService.listEmployees(adminSession);
    assert.ok(staff.length >= 2);
    const teacher1 = staff[0];
    const teacher2 = staff[1];

    // 1. Create first slot: Teacher 1 in Section 0 from 10:00 to 11:00 on Thursday
    const entry1 = timetableService.createEntry(adminSession, {
      id: `tt_slot_1_${Date.now()}`,
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      sectionId: 'sec_cls_10_0',
      dayOfWeek: 4, // Thursday
      periodName: 'Period 3',
      startTime: '10:00',
      endTime: '11:00',
      subjectName: 'Physics',
      teacherId: teacher1.id,
      roomNumber: 'Room 101',
    });
    assert.ok(entry1.id);

    // 2. Conflict Test: Teacher Clash (Same teacher scheduled in Section 1 at overlapping time 10:30-11:30)
    assert.throws(() => {
      timetableService.createEntry(adminSession, {
        id: `tt_clash_teacher_${Date.now()}`,
        sessionId: 'sess_2026_27',
        classId: 'cls_10',
        sectionId: 'sec_cls_10_1',
        dayOfWeek: 4,
        periodName: 'Period 3',
        startTime: '10:30',
        endTime: '11:30',
        subjectName: 'Chemistry',
        teacherId: teacher1.id, // CLASH!
        roomNumber: 'Room 202',
      });
    }, /Teacher Conflict/, 'Must reject overlapping teacher schedule');

    // 3. Conflict Test: Room Clash (Different teacher in Room 101 at 10:15-10:45)
    assert.throws(() => {
      timetableService.createEntry(adminSession, {
        id: `tt_clash_room_${Date.now()}`,
        sessionId: 'sess_2026_27',
        classId: 'cls_10',
        sectionId: 'sec_cls_10_1',
        dayOfWeek: 4,
        periodName: 'Period 3',
        startTime: '10:15',
        endTime: '10:45',
        subjectName: 'Biology',
        teacherId: teacher2.id,
        roomNumber: 'Room 101', // CLASH!
      });
    }, /Room Conflict/, 'Must reject overlapping room assignment');

    // 4. Conflict Test: Section Period Clash (Same section scheduled for another subject at 10:00-11:00)
    assert.throws(() => {
      timetableService.createEntry(adminSession, {
        id: `tt_clash_section_${Date.now()}`,
        sessionId: 'sess_2026_27',
        classId: 'cls_10',
        sectionId: 'sec_cls_10_0', // CLASH!
        dayOfWeek: 4,
        periodName: 'Period 3 Dup',
        startTime: '10:00',
        endTime: '11:00',
        subjectName: 'Islamic Studies',
        teacherId: teacher2.id,
        roomNumber: 'Room 303',
      });
    }, /Section Conflict/, 'Must reject overlapping period in the same section');
  });

  // --------------------------------------------------------------------------
  // 8. STAFF ATTENDANCE & PAYROLL LIFECYCLE
  // --------------------------------------------------------------------------
  test('8. Staff Daily Attendance, Salary Structure & Monthly Payroll Run', () => {
    const staff = employeeService.listEmployees(adminSession);
    const emp1 = staff[0];

    // 1. Staff Daily Attendance
    const today = '2026-11-13';
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

    const attSummary = employeeService.getStaffAttendanceSummary(adminSession, today);
    assert.ok(attSummary.present >= 1);

    // 2. Configure Salary Structure
    const salary = payrollService.saveSalaryStructure(adminSession, {
      employeeId: emp1.id,
      basicSalary: 65000,
      allowancesJson: JSON.stringify([{ title: 'Medical Allowance', amount: 5000 }, { title: 'Conveyance', amount: 3000 }]),
      deductionsJson: JSON.stringify([{ title: 'Income Tax', amount: 2000 }]),
    });
    assert.strictEqual(salary.basicSalary, 65000);

    // 3. Generate Monthly Payroll Run
    const payrollRun = payrollService.generatePayrollRun(adminSession, {
      month: 'November',
      year: 2026,
    });
    assert.strictEqual(payrollRun.run.month, 'November');
    assert.strictEqual(payrollRun.run.year, 2026);
    assert.ok(payrollRun.slipCount >= 1);

    // Net Salary: 65000 + 8000 - 2000 = 71000
    const details = payrollService.getPayrollRunDetails(adminSession, payrollRun.run.id);
    const slip = details.slips.find(s => s.employeeId === emp1.id);
    assert.ok(slip);
    assert.strictEqual(slip.basicSalary, 65000);
    assert.strictEqual(slip.totalAllowances, 8000);
    assert.strictEqual(slip.totalDeductions, 2000);
    assert.strictEqual(slip.netSalary, 71000);
    assert.strictEqual(slip.paymentStatus, 'unpaid');

    // 4. Mark Payslip Paid
    const markRes = payrollService.markSlipPaid(adminSession, slip.id, 'bank_transfer', 'TXN-PAYROLL-9988');
    assert.strictEqual(markRes.success, true);

    const updatedSlip = db.prepare('SELECT payment_status, payment_reference FROM payroll_slips WHERE id = ?').get(slip.id);
    assert.strictEqual(updatedSlip.payment_status, 'paid');
    assert.strictEqual(updatedSlip.payment_reference, 'TXN-PAYROLL-9988');
  });

  // --------------------------------------------------------------------------
  // 9. ACCOUNTS, EXPENSES & NET OPERATING CASH CALCULATION
  // --------------------------------------------------------------------------
  test('9. Accounts, Expense Vouchers & Net Operating Cash Calculation', () => {
    // 1. Record Institutional Expenses
    const exp1 = expenseService.recordExpense(adminSession, {
      id: `exp_test_${Date.now()}`,
      category: 'utilities',
      amount: 15000,
      expenseDate: '2026-11-10',
      vendor: 'LESCO Electricity Board',
      description: 'Campus monthly electricity bill',
      paymentMethod: 'bank_transfer',
      reference: 'LESCO-NOV-2026',
    });
    assert.strictEqual(exp1.amount, 15000);

    // 2. Fetch Voucher Details
    const voucher = expenseService.getVoucherDetails(adminSession, exp1.id);
    assert.strictEqual(voucher.amount, 15000);
    assert.strictEqual(voucher.vendor, 'LESCO Electricity Board');

    // 3. Net Operating Cash Flow Report
    const cashReport = reportService.getNetOperatingCashReport(adminSession, '2026-11-01', '2026-11-30');
    assert.ok(cashReport.summary.totalExpenses >= 15000);
    // Net Operating Cash = Realized Revenue - Total Expenses
    assert.strictEqual(
      cashReport.summary.netOperatingCash,
      cashReport.summary.realizedRevenue - cashReport.summary.totalExpenses
    );
  });

  // --------------------------------------------------------------------------
  // 10. SYSTEM SETTINGS & VERIFIED PHYSICAL DATABASE BACKUP
  // --------------------------------------------------------------------------
  test('10. School Profile Settings & Physically Verified Database Backup', async () => {
    // 1. Update School Institutional Settings
    const updated = settingsService.updateSchoolSettings(adminSession, {
      contactEmail: 'principal@schoolos.edu.pk',
      contactPhone: '+92 42 35789000',
      address: 'Gulberg III, Lahore, Punjab',
      motto: 'Knowledge, Integrity and Leadership',
      challanInstructions: '1. Pay at any Allied Bank branch.\n2. Non-refundable late fee after due date.',
    });
    assert.strictEqual(updated.contactEmail, 'principal@schoolos.edu.pk');
    assert.strictEqual(updated.motto, 'Knowledge, Integrity and Leadership');

    // 2. Physical Database Backup Verification
    const backupResult = await settingsService.createVerifiedBackup(adminSession);
    assert.strictEqual(backupResult.verified, true);
    assert.strictEqual(backupResult.integrityStatus, 'ok');
    assert.ok(backupResult.fileSizeBytes > 10000, 'Backup file must contain real database bytes');
    assert.ok(fs.existsSync(backupResult.backupPath), 'Backup file must physically exist on disk');

    // Clean up temporary test backup
    try {
      fs.unlinkSync(backupResult.backupPath);
    } catch {}
  });
});
