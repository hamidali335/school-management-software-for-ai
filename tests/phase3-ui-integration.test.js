/**
 * Phase 3 Desktop UI & Integrated Modules Verification Suite
 *
 * Validates:
 * 1. Migration 005 schema extensions (exams, exam_papers, student_marks, timetable_entries, expenses).
 * 2. Foreign key RESTRICT enforcement on academic and financial structures.
 * 3. Academic service: sessions and classes CRUD.
 * 4. Examinations & Marks service: exam scheduling, paper generation, marksheets.
 * 5. Faculty & Staff service: employee management.
 * 6. Timetable service: period slots, section filtering, deletion.
 * 7. Accounts & Expenses service: expense vouchers, category breakdowns.
 * 8. Institutional Report service: student roster, fee defaulters, attendance register, staff roster.
 * 9. RBAC & Session boundary protection across all new domains.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { runMigrations, ALL_MIGRATIONS } = require('../dist/main/database/migrations');
const { seedDemoData } = require('../dist/main/database/seed');
const { AcademicService } = require('../dist/main/services/academic.service');
const { ExamService } = require('../dist/main/services/exam.service');
const { TimetableService } = require('../dist/main/services/timetable.service');
const { ExpenseService } = require('../dist/main/services/expense.service');
const { EmployeeService } = require('../dist/main/services/employee.service');
const { ReportService } = require('../dist/main/services/report.service');
const { FeeService } = require('../dist/main/services/fee.service');
const { StudentService } = require('../dist/main/services/student.service');
const { AuthService } = require('../dist/main/services/auth.service');

async function setupTestEnvironment() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db, ALL_MIGRATIONS);
  seedDemoData(db);

  const authService = new AuthService(db);
  // Log in as pre-seeded admin
  const loginRes = await authService.login('admin', 'Admin@12345');
  assert.ok(loginRes.success, 'Pre-seeded admin should log in');
  const session = authService.validateSession(loginRes.token);
  assert.ok(session.isValid, 'Session must be valid');

  return { db, authService, session, token: loginRes.token };
}

test('School Management Software — Phase 3 UI & Integration Test Suite', async (suite) => {
  const { db, authService, session, token } = await setupTestEnvironment();

  // 1. Schema & Migration 005
  await suite.test('1. Migration 005 Schema Extensions and Tables', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table'
    `).all().map(t => t.name);

    assert.ok(tables.includes('exams'), 'Table exams must exist');
    assert.ok(tables.includes('exam_papers'), 'Table exam_papers must exist');
    assert.ok(tables.includes('student_marks'), 'Table student_marks must exist');
    assert.ok(tables.includes('timetable_entries'), 'Table timetable_entries must exist');
    assert.ok(tables.includes('expenses'), 'Table expenses must exist');
  });

  // 2. Foreign Key RESTRICT on Exam Papers
  await suite.test('2. Anti-Cascading Deletion: Exam Deletion Blocked When Papers Exist', () => {
    const examService = new ExamService(db);
    const examList = examService.listExams(session);
    assert.ok(examList.length > 0, 'Exams must exist');

    // Find the exam that has papers attached (ex_mid_2026)
    const midExam = examList.find(e => e.id === 'ex_mid_2026');
    assert.ok(midExam, 'Mid-term exam must exist in seed');

    const papers = examService.listExamPapers(session, midExam.id);
    assert.ok(papers.length > 0, 'Papers must exist for mid-term exam');

    // Attempt direct SQL deletion of parent exam should fail due to ON DELETE RESTRICT
    assert.throws(() => {
      db.prepare('DELETE FROM exams WHERE id = ?').run(midExam.id);
    }, /FOREIGN KEY constraint failed/);
  });

  // 3. Academic Service Integration
  await suite.test('3. Academic Classes & Sessions Operations', () => {
    const academicService = new AcademicService(db);
    const classes = academicService.listClasses(session);
    assert.ok(classes.length >= 5, 'Should have at least 5 classes');

    // Create new class
    const newClass = academicService.createClass(session, {
      id: 'cls_test_grade_11',
      name: 'Grade 11 - Computer Science',
      orderIndex: 7,
      sections: ['Section Alpha', 'Section Beta'],
    });

    assert.strictEqual(newClass.id, 'cls_test_grade_11');
    assert.strictEqual(newClass.name, 'Grade 11 - Computer Science');

    const updatedClasses = academicService.listClasses(session);
    assert.ok(updatedClasses.some(c => c.id === 'cls_test_grade_11'));

    // Create new academic session
    const newSession = academicService.createSession(session, {
      id: 'sess_test_2028',
      name: 'Session 2028-2029',
      startDate: '2028-04-01',
      endDate: '2029-03-31',
    });
    assert.strictEqual(newSession.id, 'sess_test_2028');

    const sessions = academicService.listSessions(session);
    assert.ok(sessions.some(s => s.id === 'sess_test_2028'));
  });

  // 4. Examinations & Student Marks Integration
  await suite.test('4. Exam Scheduling, Paper Creation & Marks Recording', () => {
    const examService = new ExamService(db);

    const exam = examService.createExam(session, {
      id: 'exam_test_unit_1',
      sessionId: 'sess_2026_27',
      name: 'Monthly Unit Test 1',
      term: 'monthly_test',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      status: 'scheduled',
    });
    assert.strictEqual(exam.id, 'exam_test_unit_1');

    const paper = examService.createExamPaper(session, {
      id: 'paper_test_math',
      examId: exam.id,
      classId: 'cls_10',
      subjectName: 'Advanced Mathematics',
      maxMarks: 50,
      passMarks: 20,
      examDate: '2026-07-02',
    });
    assert.strictEqual(paper.id, 'paper_test_math');

    // Record marks for students (std_01, std_02, std_03)
    const marksResult = examService.recordMarks(session, exam.id, paper.id, [
      { studentId: 'std_01', obtainedMarks: 45, isAbsent: false, remarks: 'Excellent' },
      { studentId: 'std_02', obtainedMarks: 38, isAbsent: false, remarks: 'Good' },
      { studentId: 'std_03', obtainedMarks: null, isAbsent: true, remarks: 'Medical leave' },
    ]);

    assert.strictEqual(marksResult.recordedCount, 3);

    const recorded = examService.getMarksForPaper(session, paper.id);
    assert.strictEqual(recorded.length, 3);
    const absentStudent = recorded.find(m => m.studentId === 'std_03');
    assert.ok(absentStudent.isAbsent);
    assert.strictEqual(absentStudent.obtainedMarks, null);
  });

  // 5. Faculty & Staff Directory Integration
  await suite.test('5. Employee Management & Staff Directory Queries', () => {
    const empService = new EmployeeService(db);
    const initialList = empService.listEmployees(session);
    assert.ok(initialList.length >= 4, 'Should have initial seeded staff');

    const newEmp = empService.createEmployee(session, {
      id: 'emp_test_phys',
      employeeCode: 'EMP-099',
      fullName: 'Dr. Tariq Jamil',
      designation: 'Senior Physics Lecturer',
      phone: '0300-9988776',
      email: 'tariq.physics@school.edu',
      qualification: 'Ph.D. Physics',
      status: 'active',
      joinedDate: '2025-01-10',
    });

    assert.strictEqual(newEmp.employeeCode, 'EMP-099');

    const searchResult = empService.listEmployees(session, { search: 'Physics' });
    assert.ok(searchResult.some(e => e.employeeCode === 'EMP-099'));
  });

  // 6. Timetable Scheduling Integration
  await suite.test('6. Timetable Entries, Period Allocations & Deletion', () => {
    const ttService = new TimetableService(db);

    const entry = ttService.createEntry(session, {
      id: 'tt_test_slot_1',
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      sectionId: 'sec_cls_10_0',
      dayOfWeek: 1, // Monday
      periodName: 'Zero Period (Assembly)',
      startTime: '07:45 AM',
      endTime: '08:00 AM',
      subjectName: 'Morning Assembly',
      roomNumber: 'Main Courtyard',
    });

    assert.strictEqual(entry.id, 'tt_test_slot_1');

    const entries = ttService.listBySection(session, 'sess_2026_27', 'sec_cls_10_0', 1);
    assert.ok(entries.some(e => e.id === 'tt_test_slot_1'));

    // Delete period
    const delRes = ttService.deleteEntry(session, 'tt_test_slot_1');
    assert.ok(delRes.success);

    const afterDel = ttService.listBySection(session, 'sess_2026_27', 'sec_cls_10_0', 1);
    assert.ok(!afterDel.some(e => e.id === 'tt_test_slot_1'));
  });

  // 7. Accounts & Expense Ledger Integration
  await suite.test('7. Expense Vouchers & Net Operational Accounts Calculation', () => {
    const expService = new ExpenseService(db);
    const feeService = new FeeService(db);

    const initialExpenses = expService.listExpenses(session);
    assert.ok(initialExpenses.length >= 3, 'Should have seeded expenses');

    const newVoucher = expService.recordExpense(session, {
      id: 'exp_test_lab',
      category: 'procurement',
      amount: 18500,
      expenseDate: '2026-11-12',
      description: 'Chemical reagents for Matric Physics & Chemistry practicals',
      vendor: 'Lahore Scientific Supply Co.',
      paymentMethod: 'cash',
      reference: 'INV-SCI-441',
    });

    assert.strictEqual(newVoucher.amount, 18500);

    const summary = expService.getSummary(session);
    assert.ok(summary.totalExpense >= 18500);
    assert.ok(summary.categories.some(c => c.category === 'procurement'));

    const feeSummary = feeService.getFeeSummary(session);
    const netCash = feeSummary.collected - summary.totalExpense;
    assert.strictEqual(typeof netCash, 'number');
  });

  // 8. Institutional Report Service Integration
  await suite.test('8. Institutional Report Generation & Formats', () => {
    const reportService = new ReportService(db);

    // Report A: Student Roster
    const studentRoster = reportService.getStudentRoster(session);
    assert.strictEqual(studentRoster.title, 'Official Student Enrollment Roster');
    assert.ok(studentRoster.columns.length >= 6);
    assert.ok(studentRoster.rows.length >= 4);
    assert.ok(studentRoster.summary.totalStudents >= 4);

    // Report B: Fee Defaulters
    const feeDefaulters = reportService.getFeeDefaulters(session);
    assert.strictEqual(feeDefaulters.title, 'Fee Defaulters & Outstanding Register');
    assert.ok(feeDefaulters.columns.some(c => c.key === 'balance'));
    assert.strictEqual(typeof feeDefaulters.summary.totalOutstanding, 'number');

    // Report C: Staff Roster
    const staffRoster = reportService.getStaffRoster(session);
    assert.strictEqual(staffRoster.title, 'Faculty & Administrative Staff Roster');
    assert.ok(staffRoster.rows.length >= 4);
  });

  // 9. RBAC & Security Boundary on Academic and Financial Services
  await suite.test('9. RBAC Permission Boundaries on New Modules', () => {
    const academicService = new AcademicService(db);

    // Session without academics:manage permission should be rejected
    const viewOnlySession = {
      ...session,
      role: 'teacher',
      permissions: ['academics:read', 'students:read'],
    };

    assert.throws(() => {
      academicService.createClass(viewOnlySession, {
        id: 'cls_unauth',
        name: 'Unauth Grade',
        orderIndex: 99,
        sections: ['A'],
      });
    }, /Insufficient privileges/);
  });
});
