import Database from 'better-sqlite3';

export interface AttendanceEntry {
  id: string;
  schoolId: string;
  studentId: string;
  sessionId: string;
  classId: string;
  sectionId: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'leave';
  remarks?: string | null;
}

export class AttendanceRepository {
  constructor(private db: Database.Database) {}

  public isStudentEnrolled(schoolId: string, studentId: string, sessionId: string, classId: string): boolean {
    const row = this.db.prepare(`
      SELECT id FROM student_enrollments
      WHERE school_id = ? AND student_id = ? AND session_id = ? AND class_id = ? AND status IN ('enrolled', 'active')
    `).get(schoolId, studentId, sessionId, classId);
    return Boolean(row);
  }

  public recordAttendance(entry: AttendanceEntry): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO attendance (
        id, school_id, student_id, session_id, class_id, section_id, date, status, remarks, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, date) DO UPDATE SET
        status = excluded.status,
        remarks = excluded.remarks,
        session_id = excluded.session_id,
        class_id = excluded.class_id,
        section_id = excluded.section_id
    `).run(
      entry.id,
      entry.schoolId,
      entry.studentId,
      entry.sessionId,
      entry.classId,
      entry.sectionId,
      entry.date,
      entry.status,
      entry.remarks || null,
      now
    );
  }

  public correctAttendance(
    schoolId: string,
    attendanceId: string,
    newStatus: 'present' | 'absent' | 'late' | 'leave',
    reason: string
  ): { success: boolean; oldStatus: string; newStatus: string } {
    const record = this.db.prepare(`
      SELECT id, status, remarks FROM attendance WHERE school_id = ? AND id = ?
    `).get(schoolId, attendanceId) as any;

    if (!record) {
      throw new Error(`Attendance record ${attendanceId} not found`);
    }

    const oldStatus = record.status;
    const now = new Date().toISOString();
    const updatedRemarks = record.remarks
      ? `${record.remarks} | Corrected to ${newStatus} (${reason}) at ${now}`
      : `Corrected to ${newStatus} (${reason}) at ${now}`;

    this.db.prepare(`
      UPDATE attendance
      SET status = ?, remarks = ?
      WHERE school_id = ? AND id = ?
    `).run(newStatus, updatedRemarks, schoolId, attendanceId);

    return { success: true, oldStatus, newStatus };
  }

  public getByDateAndClass(schoolId: string, date: string, classId?: string) {
    let sql = `
      SELECT 
        a.id, a.school_id, a.student_id, a.date, a.status, a.remarks,
        s.full_name, s.admission_number, e.roll_number, c.name as class_name, sec.name as section_name
      FROM attendance a
      JOIN students s ON a.student_id = s.id AND a.school_id = s.school_id
      LEFT JOIN student_enrollments e ON s.id = e.student_id AND a.session_id = e.session_id
      LEFT JOIN classes c ON a.class_id = c.id
      LEFT JOIN sections sec ON a.section_id = sec.id
      WHERE a.school_id = ? AND a.date = ?
    `;
    const params: any[] = [schoolId, date];

    if (classId) {
      sql += ` AND a.class_id = ?`;
      params.push(classId);
    }

    sql += ` ORDER BY s.admission_number ASC`;
    return this.db.prepare(sql).all(...params);
  }

  public getStudentAttendanceHistory(schoolId: string, studentId: string, sessionId?: string): any[] {
    let sql = `
      SELECT a.id, a.date, a.status, a.remarks, c.name as class_name, s.name as section_name
      FROM attendance a
      LEFT JOIN classes c ON a.class_id = c.id
      LEFT JOIN sections s ON a.section_id = s.id
      WHERE a.school_id = ? AND a.student_id = ?
    `;
    const params: any[] = [schoolId, studentId];
    if (sessionId) {
      sql += ' AND a.session_id = ?';
      params.push(sessionId);
    }
    sql += ' ORDER BY a.date DESC';
    return this.db.prepare(sql).all(...params);
  }

  public getSummary(schoolId: string, date: string) {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM attendance
      WHERE school_id = ? AND date = ?
      GROUP BY status
    `).all(schoolId, date) as { status: string; count: number }[];

    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;

    for (const r of rows) {
      if (r.status === 'present') present = r.count;
      else if (r.status === 'absent') absent = r.count;
      else if (r.status === 'late') late = r.count;
      else if (r.status === 'leave') leave = r.count;
    }

    const total = present + absent + late + leave;
    const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return { date, total, present, absent, late, leave, percentage };
  }
}
