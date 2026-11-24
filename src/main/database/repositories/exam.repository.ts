import Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface ExamRecord {
  id: string;
  schoolId: string;
  sessionId: string;
  name: string;
  term: 'first_term' | 'mid_term' | 'final_term' | 'monthly_test' | 'other';
  startDate: string;
  endDate: string;
  status: 'draft' | 'scheduled' | 'marks_entry' | 'published';
  createdAt?: string;
  updatedAt?: string;
}

export interface ExamPaperRecord {
  id: string;
  schoolId: string;
  examId: string;
  classId: string;
  subjectName: string;
  maxMarks: number;
  passMarks: number;
  examDate?: string | null;
  startTime?: string | null;
  durationMinutes?: number | null;
  createdAt?: string;
}

export interface StudentMarkRecord {
  id: string;
  schoolId: string;
  examId: string;
  paperId: string;
  studentId: string;
  obtainedMarks: number | null;
  isAbsent: boolean;
  remarks?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GradingScaleRecord {
  id?: string;
  schoolId: string;
  grade: string;
  minPercentage: number;
  maxPercentage: number;
  gpa: number;
  description?: string;
  orderIndex?: number;
}

export class ExamRepository {
  constructor(private db: Database.Database) {}

  // ----------------------------------------------------------------------
  // EXAMS & PAPERS
  // ----------------------------------------------------------------------

  public createExam(exam: ExamRecord): ExamRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO exams (id, school_id, session_id, name, term, start_date, end_date, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      exam.id,
      exam.schoolId,
      exam.sessionId,
      exam.name,
      exam.term,
      exam.startDate,
      exam.endDate,
      exam.status || 'draft',
      now,
      now
    );
    return { ...exam, createdAt: now, updatedAt: now };
  }

  public listExams(schoolId: string, sessionId?: string): (ExamRecord & { sessionName: string })[] {
    let sql = `
      SELECT e.id, e.school_id as schoolId, e.session_id as sessionId, e.name, e.term,
             e.start_date as startDate, e.end_date as endDate, e.status,
             e.created_at as createdAt, e.updated_at as updatedAt,
             s.name as sessionName
      FROM exams e
      JOIN academic_sessions s ON e.session_id = s.id
      WHERE e.school_id = ?
    `;
    const params: any[] = [schoolId];
    if (sessionId) {
      sql += ' AND e.session_id = ?';
      params.push(sessionId);
    }
    sql += ' ORDER BY e.start_date DESC';
    return this.db.prepare(sql).all(...params) as (ExamRecord & { sessionName: string })[];
  }

  public getExamById(schoolId: string, examId: string): ExamRecord | null {
    const row = this.db.prepare(`
      SELECT id, school_id as schoolId, session_id as sessionId, name, term,
             start_date as startDate, end_date as endDate, status,
             created_at as createdAt, updated_at as updatedAt
      FROM exams
      WHERE school_id = ? AND id = ?
    `).get(schoolId, examId) as ExamRecord | undefined;
    return row || null;
  }

  public publishExam(schoolId: string, examId: string): { success: boolean } {
    const now = new Date().toISOString();
    const res = this.db.prepare(`
      UPDATE exams SET status = 'published', updated_at = ? WHERE school_id = ? AND id = ?
    `).run(now, schoolId, examId);
    if (res.changes === 0) {
      throw new Error(`Exam ${examId} not found`);
    }
    return { success: true };
  }

  public createExamPaper(paper: ExamPaperRecord): ExamPaperRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO exam_papers (id, school_id, exam_id, class_id, subject_name, max_marks, pass_marks, exam_date, start_time, duration_minutes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paper.id,
      paper.schoolId,
      paper.examId,
      paper.classId,
      paper.subjectName,
      paper.maxMarks,
      paper.passMarks,
      paper.examDate || null,
      paper.startTime || null,
      paper.durationMinutes || null,
      now
    );
    return { ...paper, createdAt: now };
  }

  public listExamPapers(schoolId: string, examId: string, classId?: string): (ExamPaperRecord & { className: string })[] {
    let sql = `
      SELECT p.id, p.school_id as schoolId, p.exam_id as examId, p.class_id as classId,
             p.subject_name as subjectName, p.max_marks as maxMarks, p.pass_marks as passMarks,
             p.exam_date as examDate, p.start_time as startTime, p.duration_minutes as durationMinutes,
             c.name as className
      FROM exam_papers p
      JOIN classes c ON p.class_id = c.id
      WHERE p.school_id = ? AND p.exam_id = ?
    `;
    const params: any[] = [schoolId, examId];
    if (classId) {
      sql += ' AND p.class_id = ?';
      params.push(classId);
    }
    sql += ' ORDER BY p.exam_date ASC, p.subject_name ASC';
    return this.db.prepare(sql).all(...params) as (ExamPaperRecord & { className: string })[];
  }

  // ----------------------------------------------------------------------
  // MARKS RECORDING
  // ----------------------------------------------------------------------

  public recordStudentMarks(
    schoolId: string,
    examId: string,
    paperId: string,
    marks: { studentId: string; obtainedMarks: number | null; isAbsent: boolean; remarks?: string }[]
  ): { recordedCount: number } {
    const runTx = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO student_marks (id, school_id, exam_id, paper_id, student_id, obtained_marks, is_absent, remarks, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(paper_id, student_id) DO UPDATE SET
          obtained_marks = excluded.obtained_marks,
          is_absent = excluded.is_absent,
          remarks = excluded.remarks,
          updated_at = datetime('now')
      `);

      let count = 0;
      for (const m of marks) {
        const id = `mark_${paperId}_${m.studentId}`;
        stmt.run(id, schoolId, examId, paperId, m.studentId, m.isAbsent ? null : m.obtainedMarks, m.isAbsent ? 1 : 0, m.remarks || null);
        count++;
      }
      return count;
    });

    const recordedCount = runTx();
    return { recordedCount };
  }

  public getMarksForPaper(schoolId: string, paperId: string): any[] {
    return this.db.prepare(`
      SELECT m.id, m.paper_id as paperId, m.student_id as studentId,
             m.obtained_marks as obtainedMarks, m.is_absent as isAbsent, m.remarks,
             s.full_name as studentName, s.admission_number as admissionNumber,
             e.roll_number as rollNumber
      FROM student_marks m
      JOIN students s ON m.student_id = s.id
      LEFT JOIN student_enrollments e ON s.id = e.student_id AND s.school_id = e.school_id
      WHERE m.school_id = ? AND m.paper_id = ?
      ORDER BY s.admission_number ASC
    `).all(schoolId, paperId);
  }

  // ----------------------------------------------------------------------
  // GRADING SCALES
  // ----------------------------------------------------------------------

  public getGradingScales(schoolId: string): GradingScaleRecord[] {
    const rows = this.db.prepare(`
      SELECT id, school_id as schoolId, grade, min_percentage as minPercentage,
             max_percentage as maxPercentage, gpa, description, order_index as orderIndex
      FROM grading_scales
      WHERE school_id = ?
      ORDER BY order_index ASC, min_percentage DESC
    `).all(schoolId) as GradingScaleRecord[];

    if (rows.length === 0) {
      // Seed standard default Pakistani / British school grading scale
      const defaults = [
        { grade: 'A+', minPercentage: 90, maxPercentage: 100, gpa: 4.0, description: 'Outstanding', orderIndex: 1 },
        { grade: 'A', minPercentage: 80, maxPercentage: 89.99, gpa: 3.7, description: 'Excellent', orderIndex: 2 },
        { grade: 'B', minPercentage: 70, maxPercentage: 79.99, gpa: 3.0, description: 'Very Good', orderIndex: 3 },
        { grade: 'C', minPercentage: 60, maxPercentage: 69.99, gpa: 2.0, description: 'Good / Satisfactory', orderIndex: 4 },
        { grade: 'D', minPercentage: 50, maxPercentage: 59.99, gpa: 1.0, description: 'Pass / Acceptable', orderIndex: 5 },
        { grade: 'F', minPercentage: 0, maxPercentage: 49.99, gpa: 0.0, description: 'Fail', orderIndex: 6 },
      ];

      const insertStmt = this.db.prepare(`
        INSERT INTO grading_scales (id, school_id, grade, min_percentage, max_percentage, gpa, description, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const d of defaults) {
        insertStmt.run(`gs_${crypto.randomBytes(6).toString('hex')}`, schoolId, d.grade, d.minPercentage, d.maxPercentage, d.gpa, d.description, d.orderIndex);
      }

      return this.getGradingScales(schoolId);
    }

    return rows;
  }

  public saveGradingScales(schoolId: string, scales: GradingScaleRecord[]): GradingScaleRecord[] {
    const runTx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM grading_scales WHERE school_id = ?').run(schoolId);
      const insertStmt = this.db.prepare(`
        INSERT INTO grading_scales (id, school_id, grade, min_percentage, max_percentage, gpa, description, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      scales.forEach((s, idx) => {
        const id = s.id || `gs_${crypto.randomBytes(6).toString('hex')}`;
        insertStmt.run(id, schoolId, s.grade, s.minPercentage, s.maxPercentage, s.gpa || 0, s.description || null, s.orderIndex || idx + 1);
      });

      return this.getGradingScales(schoolId);
    });

    return runTx();
  }

  // ----------------------------------------------------------------------
  // RESULT CALCULATION & GAZETTE
  // ----------------------------------------------------------------------

  public calculateExamResults(schoolId: string, examId: string, classId: string) {
    const exam = this.getExamById(schoolId, examId);
    if (!exam) throw new Error(`Exam ${examId} not found`);

    const papers = this.listExamPapers(schoolId, examId, classId);
    if (papers.length === 0) {
      return { examId, classId, totalStudents: 0, results: [], summary: { totalPassed: 0, totalFailed: 0, classAverage: 0 } };
    }

    const gradingScales = this.getGradingScales(schoolId);

    // Fetch enrolled students in this class
    const students = this.db.prepare(`
      SELECT s.id, s.admission_number, s.full_name, s.father_name, e.roll_number
      FROM student_enrollments e
      JOIN students s ON e.student_id = s.id AND e.school_id = s.school_id
      WHERE e.school_id = ? AND e.session_id = ? AND e.class_id = ? AND e.status IN ('enrolled', 'active')
      ORDER BY CAST(e.roll_number AS INTEGER) ASC, s.admission_number ASC
    `).all(schoolId, exam.sessionId, classId) as any[];

    // Fetch marks for all papers of this exam
    const paperIds = papers.map(p => p.id);
    const placeholders = paperIds.map(() => '?').join(',');
    const allMarks = this.db.prepare(`
      SELECT paper_id, student_id, obtained_marks, is_absent, remarks
      FROM student_marks
      WHERE school_id = ? AND exam_id = ? AND paper_id IN (${placeholders})
    `).all(schoolId, examId, ...paperIds) as any[];

    const marksMap = new Map<string, any>();
    for (const m of allMarks) {
      marksMap.set(`${m.paper_id}_${m.student_id}`, m);
    }

    const totalMaxMarks = papers.reduce((sum, p) => sum + p.maxMarks, 0);

    const calculated = students.map(st => {
      let totalObtained = 0;
      let hasFailedAny = false;
      let totalAbsent = 0;
      const subjects: any[] = [];

      for (const p of papers) {
        const mark = marksMap.get(`${p.id}_${st.id}`);
        const isAbsent = mark ? Boolean(mark.is_absent) : false;
        const obtained = (mark && !isAbsent && mark.obtained_marks !== null) ? Number(mark.obtained_marks) : 0;

        if (isAbsent) totalAbsent++;
        totalObtained += obtained;

        const passed = !isAbsent && obtained >= p.passMarks;
        if (!passed) hasFailedAny = true;

        const subjectPct = p.maxMarks > 0 ? (obtained / p.maxMarks) * 100 : 0;
        const subjectGrade = gradingScales.find(g => subjectPct >= g.minPercentage && subjectPct <= g.maxPercentage)?.grade || 'F';

        subjects.push({
          paperId: p.id,
          subjectName: p.subjectName,
          maxMarks: p.maxMarks,
          passMarks: p.passMarks,
          obtainedMarks: isAbsent ? null : obtained,
          isAbsent,
          percentage: Number(subjectPct.toFixed(1)),
          grade: subjectGrade,
          passed,
          remarks: mark?.remarks || null,
        });
      }

      const overallPct = totalMaxMarks > 0 ? (totalObtained / totalMaxMarks) * 100 : 0;
      const matchedScale = gradingScales.find(g => overallPct >= g.minPercentage && overallPct <= g.maxPercentage);
      const overallGrade = matchedScale?.grade || 'F';
      const gpa = matchedScale?.gpa || 0;
      const status = hasFailedAny ? 'FAIL' : 'PASS';

      return {
        studentId: st.id,
        admissionNumber: st.admission_number,
        studentName: st.full_name,
        fatherName: st.father_name,
        rollNumber: st.roll_number,
        totalMaxMarks,
        totalObtainedMarks: totalObtained,
        overallPercentage: Number(overallPct.toFixed(1)),
        overallGrade,
        gpa,
        status,
        absentCount: totalAbsent,
        rank: 0,
        subjects,
      };
    });

    // Compute ranks sorted by totalObtainedMarks descending
    calculated.sort((a, b) => b.totalObtainedMarks - a.totalObtainedMarks);
    calculated.forEach((c, index) => {
      c.rank = index + 1;
    });

    const totalPassed = calculated.filter(c => c.status === 'PASS').length;
    const totalFailed = calculated.filter(c => c.status === 'FAIL').length;
    const classTotalPct = calculated.reduce((sum, c) => sum + c.overallPercentage, 0);
    const classAverage = calculated.length > 0 ? Number((classTotalPct / calculated.length).toFixed(1)) : 0;

    return {
      examId,
      classId,
      totalStudents: calculated.length,
      results: calculated,
      summary: {
        totalPassed,
        totalFailed,
        classAverage,
        highestMarks: calculated[0]?.totalObtainedMarks || 0,
        passPercentage: calculated.length > 0 ? Number(((totalPassed / calculated.length) * 100).toFixed(1)) : 0,
      },
    };
  }

  // ----------------------------------------------------------------------
  // REPORT CARD / TRANSCRIPT
  // ----------------------------------------------------------------------

  public generateReportCard(schoolId: string, examId: string, studentId: string) {
    const exam = this.getExamById(schoolId, examId);
    if (!exam) throw new Error(`Exam ${examId} not found`);

    const student = this.db.prepare(`
      SELECT s.*, e.class_id, e.section_id, e.roll_number, c.name as class_name, sec.name as section_name, ses.name as session_name
      FROM students s
      JOIN student_enrollments e ON s.id = e.student_id AND s.school_id = e.school_id
      JOIN classes c ON e.class_id = c.id
      JOIN sections sec ON e.section_id = sec.id
      JOIN academic_sessions ses ON e.session_id = ses.id
      WHERE s.school_id = ? AND s.id = ? AND e.session_id = ?
    `).get(schoolId, studentId, exam.sessionId) as any;

    if (!student) {
      throw new Error(`Student ${studentId} not enrolled in session ${exam.sessionId}`);
    }

    // Active guardian
    const guardian = this.db.prepare(`
      SELECT full_name, relationship, phone, cnic, occupation
      FROM student_guardians
      WHERE school_id = ? AND student_id = ? AND is_active = 1
    `).get(schoolId, studentId) as any;

    // School institutional settings
    const settings = this.db.prepare('SELECT * FROM school_settings WHERE school_id = ?').get(schoolId) as any;

    // Run calculation for class to obtain rank and subject breakdown
    const classResults = this.calculateExamResults(schoolId, examId, student.class_id);
    const studentResult = classResults.results.find(r => r.studentId === studentId);

    if (!studentResult) {
      throw new Error(`No exam records found for student ${studentId} in exam ${examId}`);
    }

    return {
      schoolSettings: settings,
      exam: {
        id: exam.id,
        name: exam.name,
        term: exam.term,
        sessionName: student.session_name,
        status: exam.status,
      },
      student: {
        id: student.id,
        admissionNumber: student.admission_number,
        fullName: student.full_name,
        fatherName: student.father_name,
        className: student.class_name,
        sectionName: student.section_name,
        rollNumber: student.roll_number,
        guardianName: guardian?.full_name || student.father_name,
        guardianPhone: guardian?.phone || student.phone,
        guardianRelationship: guardian?.relationship || 'Guardian',
      },
      result: studentResult,
      classStatistics: classResults.summary,
    };
  }
}
