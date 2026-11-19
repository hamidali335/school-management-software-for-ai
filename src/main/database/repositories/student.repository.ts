import Database from 'better-sqlite3';

export interface StudentRecord {
  id: string;
  schoolId: string;
  admissionNumber: string;
  fullName: string;
  fatherName: string;
  gender: 'male' | 'female' | 'other' | null;
  dateOfBirth: string | null;
  cnicBform: string | null;
  phone: string | null;
  address: string | null;
  admissionDate?: string | null;
  previousSchool?: string | null;
  adminNotes?: string | null;
  status: 'active' | 'inactive' | 'graduated' | 'withdrawn';
  createdAt: string;
  updatedAt: string;
}

export interface StudentEnrollmentRecord {
  id: string;
  schoolId: string;
  studentId: string;
  sessionId: string;
  classId: string;
  sectionId: string;
  rollNumber: string | null;
  status: 'enrolled' | 'promoted' | 'repeating' | 'graduated' | 'withdrawn';
  createdAt: string;
}

export class StudentRepository {
  constructor(private db: Database.Database) {}

  public createStudent(student: Omit<StudentRecord, 'createdAt' | 'updatedAt'>): StudentRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO students (
        id, school_id, admission_number, full_name, father_name, gender,
        date_of_birth, cnic_bform, phone, address, admission_date, previous_school, admin_notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      student.id,
      student.schoolId,
      student.admissionNumber,
      student.fullName,
      student.fatherName,
      student.gender || null,
      student.dateOfBirth || null,
      student.cnicBform || null,
      student.phone || null,
      student.address || null,
      student.admissionDate || now.split('T')[0],
      student.previousSchool || null,
      student.adminNotes || null,
      student.status || 'active',
      now,
      now
    );

    return this.findById(student.schoolId, student.id)!;
  }

  public enrollStudent(enrollment: Omit<StudentEnrollmentRecord, 'createdAt'>): StudentEnrollmentRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO student_enrollments (
        id, school_id, student_id, session_id, class_id, section_id, roll_number, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      enrollment.id,
      enrollment.schoolId,
      enrollment.studentId,
      enrollment.sessionId,
      enrollment.classId,
      enrollment.sectionId,
      enrollment.rollNumber || null,
      enrollment.status || 'enrolled',
      now
    );

    return { ...enrollment, createdAt: now };
  }

  public findById(schoolId: string, id: string): StudentRecord | null {
    const row = this.db.prepare(`
      SELECT 
        id, school_id as schoolId, admission_number as admissionNumber,
        full_name as fullName, father_name as fatherName, gender,
        date_of_birth as dateOfBirth, cnic_bform as cnicBform,
        phone, address, admission_date as admissionDate, previous_school as previousSchool,
        admin_notes as adminNotes, status, created_at as createdAt, updated_at as updatedAt
      FROM students
      WHERE school_id = ? AND id = ?
    `).get(schoolId, id) as StudentRecord | undefined;

    return row || null;
  }

  public getNextRollNumber(schoolId: string, sessionId: string, classId: string, sectionId?: string): string {
    let sql = `
      SELECT MAX(CAST(roll_number AS INTEGER)) as maxRoll
      FROM student_enrollments
      WHERE school_id = ? AND session_id = ? AND class_id = ?
    `;
    const params: any[] = [schoolId, sessionId, classId];
    if (sectionId) {
      sql += ' AND section_id = ?';
      params.push(sectionId);
    }
    const row = this.db.prepare(sql).get(...params) as { maxRoll: number | null };
    const nextVal = (row && row.maxRoll !== null && !isNaN(row.maxRoll)) ? row.maxRoll + 1 : 1;
    return String(nextVal);
  }

  public getStudentProfile(schoolId: string, studentId: string): any {
    const student = this.findById(schoolId, studentId);
    if (!student) return null;

    // Active guardian
    const activeGuardian = this.db.prepare(`
      SELECT id, full_name as fullName, relationship, cnic, phone, email, occupation, address, created_at as createdAt
      FROM student_guardians
      WHERE school_id = ? AND student_id = ? AND is_active = 1
    `).get(schoolId, studentId) as any;

    // Guardian history
    const guardianHistory = this.db.prepare(`
      SELECT id, full_name as fullName, relationship, cnic, phone, email, is_active as isActive,
             replaced_at as replacedAt, replacement_reason as replacementReason, created_at as createdAt
      FROM student_guardians
      WHERE school_id = ? AND student_id = ?
      ORDER BY is_active DESC, created_at DESC
    `).all(schoolId, studentId) as any[];

    // Enrollments
    const enrollments = this.db.prepare(`
      SELECT e.id, e.session_id, e.class_id, e.section_id, e.roll_number, e.status, e.created_at,
             s.name as session_name, c.name as class_name, sec.name as section_name
      FROM student_enrollments e
      JOIN academic_sessions s ON e.session_id = s.id
      JOIN classes c ON e.class_id = c.id
      JOIN sections sec ON e.section_id = sec.id
      WHERE e.school_id = ? AND e.student_id = ?
      ORDER BY e.created_at DESC
    `).all(schoolId, studentId) as any[];

    // Invoices and financial summary
    const invoices = this.db.prepare(`
      SELECT id, challan_number, month, due_date, amount, paid_amount, balance, status, discount_amount, created_at
      FROM invoices
      WHERE school_id = ? AND student_id = ?
      ORDER BY created_at DESC
    `).all(schoolId, studentId) as any[];

    const payments = this.db.prepare(`
      SELECT p.id, p.invoice_id, p.receipt_number, p.amount, p.payment_date, p.payment_method, p.is_reversed, p.reversal_reason, p.created_at,
             i.challan_number, i.month
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      WHERE p.school_id = ? AND i.student_id = ?
      ORDER BY p.created_at DESC
    `).all(schoolId, studentId) as any[];

    const totalBilled = invoices.reduce((acc, inv) => acc + (inv.status !== 'cancelled' ? inv.amount : 0), 0);
    const totalPaid = invoices.reduce((acc, inv) => acc + (inv.status !== 'cancelled' ? inv.paid_amount : 0), 0);
    const totalBalance = invoices.reduce((acc, inv) => acc + (inv.status !== 'cancelled' ? inv.balance : 0), 0);

    // Attendance summary
    const attendanceStats = this.db.prepare(`
      SELECT 
        COUNT(*) as totalRecorded,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as presentCount,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absentCount,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as lateCount,
        SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leaveCount
      FROM attendance
      WHERE school_id = ? AND student_id = ?
    `).get(schoolId, studentId) as any;

    const recentAttendance = this.db.prepare(`
      SELECT date, status, remarks
      FROM attendance
      WHERE school_id = ? AND student_id = ?
      ORDER BY date DESC
      LIMIT 20
    `).all(schoolId, studentId) as any[];

    // Examination Marks
    const marks = this.db.prepare(`
      SELECT m.id, m.obtained_marks as obtainedMarks, m.is_absent as isAbsent, m.remarks,
             p.subject_name as subjectName, p.max_marks as maxMarks, p.pass_marks as passMarks,
             e.name as examName, e.term, s.name as sessionName
      FROM student_marks m
      JOIN exam_papers p ON m.paper_id = p.id
      JOIN exams e ON m.exam_id = e.id
      JOIN academic_sessions s ON e.session_id = s.id
      WHERE m.school_id = ? AND m.student_id = ?
      ORDER BY e.start_date DESC
    `).all(schoolId, studentId) as any[];

    // Concessions
    const concessions = this.db.prepare(`
      SELECT id, concession_type as concessionType, value, reason, approved_by as approvedBy, status, created_at as createdAt
      FROM fee_concessions
      WHERE school_id = ? AND student_id = ?
      ORDER BY created_at DESC
    `).all(schoolId, studentId) as any[];

    return {
      student,
      guardian: activeGuardian,
      activeGuardian,
      guardianHistory,
      enrollments,
      currentEnrollment: enrollments[0] || null,
      financialSummary: {
        totalBilled,
        totalPaid,
        totalBalance,
      },
      invoices,
      payments,
      attendanceSummary: {
        ...attendanceStats,
        rate: attendanceStats.totalRecorded > 0
          ? Math.round((attendanceStats.presentCount / attendanceStats.totalRecorded) * 100)
          : 100,
      },
      recentAttendance,
      marks,
      concessions,
    };
  }

  public bulkPromote(
    schoolId: string,
    promotions: { studentId: string; targetSessionId: string; targetClassId: string; targetSectionId: string; rollNumber?: string }[]
  ): { promotedCount: number } {
    const runTx = this.db.transaction(() => {
      const now = new Date().toISOString();
      const updateOldStmt = this.db.prepare(`
        UPDATE student_enrollments
        SET status = 'promoted'
        WHERE school_id = ? AND student_id = ? AND status = 'enrolled'
      `);

      const insertNewStmt = this.db.prepare(`
        INSERT INTO student_enrollments (id, school_id, student_id, session_id, class_id, section_id, roll_number, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'enrolled', ?)
      `);

      for (const p of promotions) {
        updateOldStmt.run(schoolId, p.studentId);
        const newId = `enr_p_${p.studentId}_${p.targetSessionId}`;
        insertNewStmt.run(
          newId,
          schoolId,
          p.studentId,
          p.targetSessionId,
          p.targetClassId,
          p.targetSectionId,
          p.rollNumber || null,
          now
        );
      }

      return { promotedCount: promotions.length };
    });

    return runTx();
  }

  public listStudents(schoolId: string, query?: { search?: string; classId?: string; sessionId?: string; limit?: number }) {
    let sql = `
      SELECT 
        s.id, s.school_id as schoolId, s.admission_number, s.full_name, s.father_name, s.gender,
        s.phone, s.cnic_bform, s.status,
        c.name as class_name, sec.name as section_name, e.roll_number, e.session_id,
        e.class_id, e.section_id
      FROM students s
      LEFT JOIN student_enrollments e ON s.id = e.student_id AND s.school_id = e.school_id
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN sections sec ON e.section_id = sec.id
      WHERE s.school_id = ?
    `;
    const params: any[] = [schoolId];

    if (query?.search) {
      sql += ` AND (s.full_name LIKE ? OR s.admission_number LIKE ? OR s.father_name LIKE ?)`;
      const searchPattern = `%${query.search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (query?.classId) {
      sql += ` AND e.class_id = ? AND e.status IN ('enrolled', 'active')`;
      params.push(query.classId);
    }

    if (query?.sessionId) {
      sql += ` AND e.session_id = ? AND e.status IN ('enrolled', 'active')`;
      params.push(query.sessionId);
    }

    sql += ` ORDER BY s.admission_number ASC LIMIT ?`;
    params.push(query?.limit || 50);

    return this.db.prepare(sql).all(...params);
  }

  public countStudents(schoolId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM students WHERE school_id = ?').get(schoolId) as { c: number };
    return row.c;
  }

  public updateStatus(
    schoolId: string,
    studentId: string,
    status: 'active' | 'inactive' | 'graduated' | 'withdrawn'
  ): StudentRecord {
    const now = new Date().toISOString();
    const res = this.db.prepare(`
      UPDATE students
      SET status = ?, updated_at = ?
      WHERE school_id = ? AND id = ?
    `).run(status, now, schoolId, studentId);

    if (res.changes === 0) {
      throw new Error(`Student ${studentId} not found in this school`);
    }

    return this.findById(schoolId, studentId)!;
  }

  public deleteStudent(schoolId: string, studentId: string): void {
    // Attempt physical deletion (protected by trg_prevent_student_deletion_with_financials & foreign keys)
    this.db.prepare('DELETE FROM students WHERE school_id = ? AND id = ?').run(schoolId, studentId);
  }
}
