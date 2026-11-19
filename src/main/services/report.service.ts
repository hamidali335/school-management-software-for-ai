import Database from 'better-sqlite3';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { ExamRepository } from '../database/repositories/exam.repository';

export interface ReportOutput {
  title: string;
  subtitle: string;
  generatedAt: string;
  columns: { key: string; header: string; align?: 'right' | 'left' }[];
  rows: Record<string, any>[];
  summary?: Record<string, any>;
}

export class ReportService {
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.installService = new InstallationService(db);
  }

  public getStudentRoster(session: ValidatedSession, classId?: string): ReportOutput {
    RbacService.assertPermission(session, 'reports:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    let sql = `
      SELECT s.admission_number as admissionNumber, s.full_name as fullName, s.father_name as fatherName,
             s.gender, s.phone, s.status, c.name as className, sec.name as sectionName, e.roll_number as rollNumber
      FROM students s
      LEFT JOIN student_enrollments e ON s.id = e.student_id AND s.school_id = e.school_id
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN sections sec ON e.section_id = sec.id
      WHERE s.school_id = ?
    `;
    const params: any[] = [schoolId];
    if (classId) {
      sql += ' AND e.class_id = ?';
      params.push(classId);
    }
    sql += ' ORDER BY c.order_index ASC, s.admission_number ASC';

    const rows = this.db.prepare(sql).all(...params) as Record<string, any>[];

    return {
      title: 'Official Student Enrollment Roster',
      subtitle: classId ? `Class Enrollment Roster` : 'All School Students Directory',
      generatedAt: new Date().toISOString(),
      columns: [
        { key: 'admissionNumber', header: 'Admission #' },
        { key: 'fullName', header: 'Student Name' },
        { key: 'fatherName', header: 'Father Name' },
        { key: 'className', header: 'Class' },
        { key: 'sectionName', header: 'Section' },
        { key: 'rollNumber', header: 'Roll #' },
        { key: 'phone', header: 'Contact' },
        { key: 'status', header: 'Status' },
      ],
      rows,
      summary: { totalStudents: rows.length },
    };
  }

  public getFeeDefaulters(session: ValidatedSession, month?: string): ReportOutput {
    RbacService.assertPermission(session, 'reports:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    let sql = `
      SELECT i.challan_number as challanNumber, s.full_name as studentName, s.admission_number as admissionNumber,
             c.name as className, i.month, i.due_date as dueDate, i.amount, i.paid_amount as paidAmount,
             i.balance, i.status
      FROM invoices i
      JOIN students s ON i.student_id = s.id
      LEFT JOIN student_enrollments e ON s.id = e.student_id AND i.session_id = e.session_id
      LEFT JOIN classes c ON e.class_id = c.id
      WHERE i.school_id = ? AND i.balance > 0 AND (i.is_cancelled IS NULL OR i.is_cancelled = 0)
    `;
    const params: any[] = [schoolId];
    if (month) {
      sql += ' AND i.month = ?';
      params.push(month);
    }
    sql += ' ORDER BY i.balance DESC';

    const rows = this.db.prepare(sql).all(...params) as Record<string, any>[];
    const totalOutstanding = rows.reduce((acc, r) => acc + (r.balance || 0), 0);

    return {
      title: 'Fee Defaulters & Outstanding Register',
      subtitle: month ? `Unpaid Challans for ${month}` : 'All Outstanding Institutional Challans',
      generatedAt: new Date().toISOString(),
      columns: [
        { key: 'challanNumber', header: 'Challan #' },
        { key: 'admissionNumber', header: 'Adm #' },
        { key: 'studentName', header: 'Student Name' },
        { key: 'className', header: 'Class' },
        { key: 'month', header: 'Month' },
        { key: 'amount', header: 'Billed (Rs.)', align: 'right' },
        { key: 'paidAmount', header: 'Paid (Rs.)', align: 'right' },
        { key: 'balance', header: 'Balance Due (Rs.)', align: 'right' },
      ],
      rows,
      summary: { totalDefaulters: rows.length, totalOutstanding },
    };
  }

  public getAttendanceRegister(session: ValidatedSession, startDate: string, endDate: string, classId?: string): ReportOutput {
    RbacService.assertPermission(session, 'reports:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    let sql = `
      SELECT s.admission_number as admissionNumber, s.full_name as studentName, c.name as className,
             COUNT(a.id) as totalRecorded,
             SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as presentDays,
             SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absentDays,
             SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as lateDays,
             SUM(CASE WHEN a.status = 'leave' THEN 1 ELSE 0 END) as leaveDays
      FROM students s
      JOIN attendance a ON s.id = a.student_id
      LEFT JOIN student_enrollments e ON s.id = e.student_id AND a.session_id = e.session_id
      LEFT JOIN classes c ON a.class_id = c.id
      WHERE s.school_id = ? AND a.date >= ? AND a.date <= ?
    `;
    const params: any[] = [schoolId, startDate, endDate];
    if (classId) {
      sql += ' AND a.class_id = ?';
      params.push(classId);
    }
    sql += ' GROUP BY s.id ORDER BY c.order_index ASC, s.admission_number ASC';

    const rawRows = this.db.prepare(sql).all(...params) as any[];
    const rows = rawRows.map(r => ({
      ...r,
      attendancePercentage: r.totalRecorded > 0 ? `${((r.presentDays / r.totalRecorded) * 100).toFixed(1)}%` : '0%',
    }));

    return {
      title: 'Attendance Register Summary',
      subtitle: `Date Range: ${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      columns: [
        { key: 'admissionNumber', header: 'Adm #' },
        { key: 'studentName', header: 'Student Name' },
        { key: 'className', header: 'Class' },
        { key: 'presentDays', header: 'Present', align: 'right' },
        { key: 'absentDays', header: 'Absent', align: 'right' },
        { key: 'lateDays', header: 'Late', align: 'right' },
        { key: 'leaveDays', header: 'Leave', align: 'right' },
        { key: 'attendancePercentage', header: '% Present', align: 'right' },
      ],
      rows,
      summary: { totalStudents: rows.length },
    };
  }

  public getStaffRoster(session: ValidatedSession): ReportOutput {
    RbacService.assertPermission(session, 'reports:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const rows = this.db.prepare(`
      SELECT employee_code as employeeCode, full_name as fullName, designation, qualification, phone, email, status, joined_date as joinedDate
      FROM employees
      WHERE school_id = ?
      ORDER BY employee_code ASC
    `).all(schoolId) as Record<string, any>[];

    return {
      title: 'Faculty & Administrative Staff Roster',
      subtitle: 'Complete Institutional Personnel Directory',
      generatedAt: new Date().toISOString(),
      columns: [
        { key: 'employeeCode', header: 'Code' },
        { key: 'fullName', header: 'Name' },
        { key: 'designation', header: 'Designation' },
        { key: 'qualification', header: 'Qualification' },
        { key: 'phone', header: 'Phone' },
        { key: 'joinedDate', header: 'Joined Date' },
        { key: 'status', header: 'Status' },
      ],
      rows,
      summary: { totalStaff: rows.length },
    };
  }

  public getNetOperatingCashReport(session: ValidatedSession, startDate: string, endDate: string): ReportOutput {
    RbacService.assertPermission(session, 'reports:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    // 1. Realized collected fee revenue (payments minus reversals)
    const revenueRow = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as totalCollected
      FROM payments
      WHERE school_id = ? AND payment_date >= ? AND payment_date <= ?
    `).get(schoolId, startDate, endDate) as { totalCollected: number };
    const realizedRevenue = revenueRow.totalCollected;

    // 2. Incurred expenses
    const expenseRow = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as totalExpense
      FROM expenses
      WHERE school_id = ? AND expense_date >= ? AND expense_date <= ?
    `).get(schoolId, startDate, endDate) as { totalExpense: number };
    const totalExpenses = expenseRow.totalExpense;

    const netOperatingCash = realizedRevenue - totalExpenses;

    // Category breakdown
    const expenseBreakdown = this.db.prepare(`
      SELECT category, SUM(amount) as amount, COUNT(*) as count
      FROM expenses
      WHERE school_id = ? AND expense_date >= ? AND expense_date <= ?
      GROUP BY category
    `).all(schoolId, startDate, endDate) as any[];

    const rows: Record<string, any>[] = [
      { item: 'Realized Collected Fee Revenue', type: 'INCOME', amount: realizedRevenue, notes: 'Net fee payments collected' },
      ...expenseBreakdown.map(e => ({
        item: `Expense: ${String(e.category).toUpperCase().replace('_', ' ')}`,
        type: 'EXPENSE',
        amount: -e.amount,
        notes: `${e.count} vouchers`,
      })),
      { item: 'NET OPERATING CASH FLOW', type: 'NET', amount: netOperatingCash, notes: netOperatingCash >= 0 ? 'Operating Cash Surplus' : 'Operating Cash Deficit' },
    ];

    return {
      title: 'Net Operating Cash Flow Statement',
      subtitle: `Period: ${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      columns: [
        { key: 'item', header: 'Financial Line Item' },
        { key: 'type', header: 'Classification' },
        { key: 'notes', header: 'Details' },
        { key: 'amount', header: 'Amount (Rs.)', align: 'right' },
      ],
      rows,
      summary: {
        realizedRevenue,
        totalExpenses,
        netOperatingCash,
        isSurplus: netOperatingCash >= 0,
      },
    };
  }

  public getExamGazetteReport(session: ValidatedSession, examId?: string, classId?: string): ReportOutput {
    RbacService.assertPermission(session, 'reports:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const defaultColumns = [
      { key: 'rank', header: 'Rank' },
      { key: 'rollNumber', header: 'Roll #' },
      { key: 'admissionNumber', header: 'Adm #' },
      { key: 'studentName', header: 'Student Name' },
      { key: 'totalObtainedMarks', header: 'Obtained', align: 'right' as const },
      { key: 'totalMaxMarks', header: 'Max', align: 'right' as const },
      { key: 'overallPercentage', header: '%', align: 'right' as const },
      { key: 'overallGrade', header: 'Grade' },
      { key: 'status', header: 'Status' },
    ];

    if (!examId || !classId) {
      return {
        title: 'Official Examination Gazette',
        subtitle: 'Select an active examination and class from the filter bar above',
        generatedAt: new Date().toISOString(),
        columns: defaultColumns,
        rows: [],
        summary: { totalStudents: 0, totalPassed: 0, totalFailed: 0, classAverage: 0 },
      };
    }

    const examRepo = new ExamRepository(this.db);
    const exam = examRepo.getExamById(schoolId, examId);
    if (!exam) {
      return {
        title: 'Official Examination Gazette',
        subtitle: `Selected examination was not found in institutional records`,
        generatedAt: new Date().toISOString(),
        columns: defaultColumns,
        rows: [],
        summary: { totalStudents: 0, totalPassed: 0, totalFailed: 0, classAverage: 0 },
      };
    }

    const results = examRepo.calculateExamResults(schoolId, examId, classId);
    const classRow = this.db.prepare('SELECT name FROM classes WHERE id = ?').get(classId) as any;
    const className = classRow?.name || classId;

    const rows = results.results.map(r => ({
      rank: r.rank,
      rollNumber: r.rollNumber,
      admissionNumber: r.admissionNumber,
      studentName: r.studentName,
      fatherName: r.fatherName,
      totalObtainedMarks: r.totalObtainedMarks,
      totalMaxMarks: r.totalMaxMarks,
      overallPercentage: `${r.overallPercentage}%`,
      overallGrade: r.overallGrade,
      gpa: r.gpa,
      status: r.status,
    }));

    return {
      title: `Official Examination Gazette — ${exam?.name || 'Exam'}`,
      subtitle: `Class: ${className} | Total Enrolled: ${results.totalStudents}`,
      generatedAt: new Date().toISOString(),
      columns: [
        { key: 'rank', header: 'Rank' },
        { key: 'rollNumber', header: 'Roll #' },
        { key: 'admissionNumber', header: 'Adm #' },
        { key: 'studentName', header: 'Student Name' },
        { key: 'totalObtainedMarks', header: 'Obtained', align: 'right' },
        { key: 'totalMaxMarks', header: 'Max', align: 'right' },
        { key: 'overallPercentage', header: '%', align: 'right' },
        { key: 'overallGrade', header: 'Grade' },
        { key: 'status', header: 'Status' },
      ],
      rows,
      summary: results.summary,
    };
  }
}
