const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations');
const { AuthService } = require('../dist/main/services/auth.service');
const { ReportService } = require('../dist/main/services/report.service');
const { StudentService } = require('../dist/main/services/student.service');
const { FeeService } = require('../dist/main/services/fee.service');
const { ExpenseService } = require('../dist/main/services/expense.service');
const { AttendanceService } = require('../dist/main/services/attendance.service');
const { ExamService } = require('../dist/main/services/exam.service');
const { EmployeeService } = require('../dist/main/services/employee.service');

const testDbPath = path.join(__dirname, 'reports_verification_temp.db');

function cleanupTempDb() {
  for (const ext of ['', '-wal', '-shm']) {
    const p = testDbPath + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

test('School Management Software — Reports & Data Export Verification Suite', async (suite) => {
  cleanupTempDb();

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');

  runMigrations(db, ALL_MIGRATIONS);

  // Setup School Administrator
  const authService = new AuthService(db);
  const prov = await authService.provisionInitialAdmin({
    schoolName: 'Crescent Model High School Lahore',
    schoolCode: 'CMHSL-01',
    adminName: 'Principal Dr. Farooq',
    adminEmail: 'principal@crescent.edu.pk',
    adminUsername: 'crescent_admin',
    adminPassword: 'Password@2026',
  });
  const schoolId = prov.installation.schoolId;

  const session = {
    isValid: true,
    userId: prov.adminUser.id,
    schoolId,
    userName: 'Principal Dr. Farooq',
    role: 'school_owner',
    permissions: ['*'],
  };

  const reportService = new ReportService(db);
  const studentService = new StudentService(db);
  const feeService = new FeeService(db);
  const expenseService = new ExpenseService(db);
  const attendanceService = new AttendanceService(db);
  const examService = new ExamService(db);
  const employeeService = new EmployeeService(db);

  // 1. Setup Academic Base
  db.prepare("INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current) VALUES ('sess_2026', ?, '2026-2027', '2026-04-01', '2027-03-31', 1)").run(schoolId);
  db.prepare("INSERT INTO classes (id, school_id, name, order_index) VALUES ('cls_10th', ?, 'Class 10', 10)").run(schoolId);
  db.prepare("INSERT INTO sections (id, school_id, class_id, name) VALUES ('sec_10a', ?, 'cls_10th', 'Section A')").run(schoolId);

  // 2. Admit Students
  const s1 = studentService.admitStudent(session, {
    id: 'stud_101',
    admissionNumber: 'ADM-101',
    fullName: 'Bilal Tariq',
    fatherName: 'Tariq Mehmood',
    gender: 'male',
    dob: '2010-05-15',
    admissionDate: '2026-04-01',
    sessionId: 'sess_2026',
    classId: 'cls_10th',
    sectionId: 'sec_10a',
    rollNumber: '10',
    phone: '03001234567',
    guardian: {
      fullName: 'Tariq Mehmood',
      relationship: 'father',
      cnic: '35202-1234567-1',
      phone: '03001234567',
    },
  });

  const s2 = studentService.admitStudent(session, {
    id: 'stud_102',
    admissionNumber: 'ADM-102',
    fullName: 'Ayesha Khan',
    fatherName: 'Imran Khan',
    gender: 'female',
    dob: '2010-08-20',
    admissionDate: '2026-04-01',
    sessionId: 'sess_2026',
    classId: 'cls_10th',
    sectionId: 'sec_10a',
    rollNumber: '11',
    phone: '03009876543',
    guardian: {
      fullName: 'Imran Khan',
      relationship: 'father',
      cnic: '35202-7654321-1',
      phone: '03009876543',
    },
  });

  // 3. Setup Fee Invoices and Payments
  feeService.createFeeStructure(session, {
    id: 'fs_10th',
    sessionId: 'sess_2026',
    classId: 'cls_10th',
    name: 'Class 10 Standard Fee',
    tuitionFee: 8000,
    examFee: 0,
    miscFee: 0,
    dueDay: 10,
  });

  const invResult = feeService.bulkGenerateInvoices(session, {
    sessionId: 'sess_2026',
    classId: 'cls_10th',
    month: '2026-04',
    dueDate: '2026-04-10',
  });

  // Pay s1 in full (8000)
  const invoices = db.prepare("SELECT * FROM invoices WHERE school_id = ?").all(schoolId);
  const invS1 = invoices.find(i => i.student_id === 'stud_101');
  const invS2 = invoices.find(i => i.student_id === 'stud_102');

  feeService.collectFeePayment(session, {
    id: 'pay_101',
    invoiceId: invS1.id,
    amount: invS1.amount,
    paymentDate: '2026-04-05',
    paymentMethod: 'cash',
    receiptNumber: 'RCP-001',
  });

  // 4. Record Expenses
  expenseService.recordExpense(session, {
    id: 'exp_001',
    category: 'utilities',
    description: 'LESCO Electricity Bill',
    amount: 3500,
    expenseDate: '2026-04-08',
    paymentMethod: 'cash',
    vendor: 'LESCO',
  });

  // 5. Record Staff Members
  employeeService.createEmployee(session, {
    id: 'emp_001',
    employeeCode: 'EMP-01',
    fullName: 'Sir Aslam Javed',
    designation: 'Senior Physics Teacher',
    qualification: 'M.Sc Physics',
    phone: '03211122334',
    email: 'aslam@crescent.edu.pk',
    joinedDate: '2024-01-15',
    basicSalary: 65000,
  });

  // 6. Record Attendance
  attendanceService.recordDailyAttendance(session, [
    {
      id: 'att_101',
      studentId: 'stud_101',
      sessionId: 'sess_2026',
      classId: 'cls_10th',
      sectionId: 'sec_10a',
      date: '2026-04-06',
      status: 'present',
    },
    {
      id: 'att_102',
      studentId: 'stud_102',
      sessionId: 'sess_2026',
      classId: 'cls_10th',
      sectionId: 'sec_10a',
      date: '2026-04-06',
      status: 'absent',
    },
  ]);

  // 7. Record Examination and Marks
  examService.createExam(session, {
    id: 'exam_mid_2026',
    sessionId: 'sess_2026',
    name: 'Mid-Term Examinations 2026',
    term: 'mid_term',
    startDate: '2026-09-15',
    endDate: '2026-09-25',
  });

  examService.createExamPaper(session, {
    id: 'paper_phy_10',
    examId: 'exam_mid_2026',
    classId: 'cls_10th',
    subjectName: 'Physics',
    maxMarks: 100,
    passMarks: 40,
    examDate: '2026-09-16',
  });

  examService.recordMarks(session, 'exam_mid_2026', 'paper_phy_10', [
    { studentId: 'stud_101', obtainedMarks: 85, isAbsent: false },
    { studentId: 'stud_102', obtainedMarks: 72, isAbsent: false },
  ]);

  await suite.test('Report 1: Student Roster generates valid columns and accurate student rows', () => {
    const report = reportService.getStudentRoster(session);
    assert.strictEqual(report.title, 'Official Student Enrollment Roster');
    assert.strictEqual(report.rows.length, 2);
    assert(report.columns.some(c => c.key === 'admissionNumber'));
    assert(report.columns.some(c => c.key === 'fullName'));
    assert.strictEqual(report.summary.totalStudents, 2);

    // Test class filtering
    const classReport = reportService.getStudentRoster(session, 'cls_10th');
    assert.strictEqual(classReport.rows.length, 2);

    const emptyReport = reportService.getStudentRoster(session, 'cls_nonexistent');
    assert.strictEqual(emptyReport.rows.length, 0);
  });

  await suite.test('Report 2: Fee Defaulters correctly identifies outstanding balances', () => {
    const report = reportService.getFeeDefaulters(session);
    assert.strictEqual(report.title, 'Fee Defaulters & Outstanding Register');
    // s1 paid in full (balance 0), s2 owes full amount (balance > 0)
    assert.strictEqual(report.rows.length, 1);
    assert.strictEqual(report.rows[0].admissionNumber, 'ADM-102');
    assert.strictEqual(report.rows[0].studentName, 'Ayesha Khan');
    assert.strictEqual(report.rows[0].balance, 8000);
    assert.strictEqual(report.summary.totalOutstanding, 8000);
  });

  await suite.test('Report 3: Net Operating Cash Flow calculates real revenue minus expense surplus', () => {
    const report = reportService.getNetOperatingCashReport(session, '2026-04-01', '2026-04-30');
    assert.strictEqual(report.title, 'Net Operating Cash Flow Statement');
    // Revenue = 8000 (s1 payment), Expense = 3500 (LESCO) -> Net = 4500 surplus
    assert.strictEqual(report.summary.realizedRevenue, 8000);
    assert.strictEqual(report.summary.totalExpenses, 3500);
    assert.strictEqual(report.summary.netOperatingCash, 4500);
    assert.strictEqual(report.summary.isSurplus, true);
    assert(report.rows.some(r => r.item.includes('LESCO') || r.item.includes('UTILITIES')));
  });

  await suite.test('Report 4: Examination Gazette computes correct ranking, grades, and marks', () => {
    const report = reportService.getExamGazetteReport(session, 'exam_mid_2026', 'cls_10th');
    assert(report.title.includes('Mid-Term Examinations 2026'));
    assert.strictEqual(report.rows.length, 2);
    // Student 101 has 85/100 (rank 1), Student 102 has 72/100 (rank 2)
    assert.strictEqual(report.rows[0].admissionNumber, 'ADM-101');
    assert.strictEqual(report.rows[0].rank, 1);
    assert.strictEqual(report.rows[0].totalObtainedMarks, 85);
    assert.strictEqual(report.rows[1].admissionNumber, 'ADM-102');
    assert.strictEqual(report.rows[1].rank, 2);
    assert.strictEqual(report.rows[1].totalObtainedMarks, 72);
  });

  await suite.test('Report 5: Attendance Register correctly tallies attendance percentages', () => {
    const report = reportService.getAttendanceRegister(session, '2026-04-01', '2026-04-30', 'cls_10th');
    assert.strictEqual(report.title, 'Attendance Register Summary');
    assert.strictEqual(report.rows.length, 2);
    const s1Row = report.rows.find(r => r.admissionNumber === 'ADM-101');
    const s2Row = report.rows.find(r => r.admissionNumber === 'ADM-102');
    assert.strictEqual(s1Row.presentDays, 1);
    assert.strictEqual(s1Row.absentDays, 0);
    assert.strictEqual(s1Row.attendancePercentage, '100.0%');
    assert.strictEqual(s2Row.presentDays, 0);
    assert.strictEqual(s2Row.absentDays, 1);
    assert.strictEqual(s2Row.attendancePercentage, '0.0%');
  });

  await suite.test('Report 6: Staff Roster reflects institutional personnel directory', () => {
    const report = reportService.getStaffRoster(session);
    assert.strictEqual(report.title, 'Faculty & Administrative Staff Roster');
    assert.strictEqual(report.rows.length, 1);
    assert.strictEqual(report.rows[0].employeeCode, 'EMP-01');
    assert.strictEqual(report.rows[0].fullName, 'Sir Aslam Javed');
    assert.strictEqual(report.rows[0].designation, 'Senior Physics Teacher');
  });

  await suite.test('Export Formatting: Excel-ready CSV generation produces UTF-8 BOM and escaped cells', () => {
    const report = reportService.getStudentRoster(session);
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += `${escapeCsv(report.title)}\n`;
    csvContent += `${escapeCsv(report.subtitle)}\n\n`;
    csvContent += report.columns.map(c => escapeCsv(c.header)).join(',') + '\n';
    for (const row of report.rows) {
      csvContent += report.columns.map(c => escapeCsv(row[c.key] ?? '')).join(',') + '\n';
    }

    assert(csvContent.startsWith('\uFEFF'));
    assert(csvContent.includes('"Official Student Enrollment Roster"'));
    assert(csvContent.includes('"Bilal Tariq"'));
    assert(csvContent.includes('"Ayesha Khan"'));
    assert(csvContent.includes('"ADM-101"'));
  });

  db.close();
  cleanupTempDb();
});
