import Database from 'better-sqlite3';

export interface TimetableEntryRecord {
  id: string;
  schoolId: string;
  sessionId: string;
  classId: string;
  sectionId: string;
  dayOfWeek: number; // 1 = Monday ... 7 = Sunday
  periodName: string;
  startTime: string;
  endTime: string;
  subjectName: string;
  teacherId?: string | null;
  roomNumber?: string | null;
  createdAt?: string;
}

export class TimetableRepository {
  constructor(private db: Database.Database) {}

  public checkConflict(
    schoolId: string,
    entry: {
      id?: string;
      sessionId: string;
      classId: string;
      sectionId: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      teacherId?: string | null;
      roomNumber?: string | null;
    }
  ): void {
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayName = dayNames[entry.dayOfWeek] || `Day ${entry.dayOfWeek}`;

    // 1. Teacher Clash Check
    if (entry.teacherId) {
      const teacherClash = this.db.prepare(`
        SELECT t.id, t.period_name, t.start_time, t.end_time, t.subject_name,
               c.name as class_name, s.name as section_name, e.full_name as teacher_name
        FROM timetable_entries t
        JOIN classes c ON t.class_id = c.id
        JOIN sections s ON t.section_id = s.id
        LEFT JOIN employees e ON t.teacher_id = e.id
        WHERE t.school_id = ? AND t.session_id = ? AND t.day_of_week = ?
          AND t.teacher_id = ? AND (? IS NULL OR t.id != ?)
          AND (t.start_time < ? AND t.end_time > ?)
        LIMIT 1
      `).get(
        schoolId,
        entry.sessionId,
        entry.dayOfWeek,
        entry.teacherId,
        entry.id || null,
        entry.id || null,
        entry.endTime,
        entry.startTime
      ) as any;

      if (teacherClash) {
        throw new Error(
          `Teacher Conflict: ${teacherClash.teacher_name || 'Teacher'} is already scheduled for ${teacherClash.subject_name} in ${teacherClash.class_name} (${teacherClash.section_name}) from ${teacherClash.start_time} to ${teacherClash.end_time} on ${dayName}.`
        );
      }
    }

    // 2. Room Clash Check
    if (entry.roomNumber && entry.roomNumber.trim().length > 0) {
      const roomClash = this.db.prepare(`
        SELECT t.id, t.period_name, t.start_time, t.end_time, t.subject_name,
               c.name as class_name, s.name as section_name
        FROM timetable_entries t
        JOIN classes c ON t.class_id = c.id
        JOIN sections s ON t.section_id = s.id
        WHERE t.school_id = ? AND t.session_id = ? AND t.day_of_week = ?
          AND LOWER(TRIM(t.room_number)) = LOWER(TRIM(?)) AND (? IS NULL OR t.id != ?)
          AND (t.start_time < ? AND t.end_time > ?)
        LIMIT 1
      `).get(
        schoolId,
        entry.sessionId,
        entry.dayOfWeek,
        entry.roomNumber,
        entry.id || null,
        entry.id || null,
        entry.endTime,
        entry.startTime
      ) as any;

      if (roomClash) {
        throw new Error(
          `Room Conflict: Room ${entry.roomNumber} is already occupied by ${roomClash.class_name} (${roomClash.section_name}) from ${roomClash.start_time} to ${roomClash.end_time} on ${dayName}.`
        );
      }
    }

    // 3. Section Duplicate / Overlap Check
    const sectionClash = this.db.prepare(`
      SELECT t.id, t.period_name, t.start_time, t.end_time, t.subject_name,
             c.name as class_name, s.name as section_name
      FROM timetable_entries t
      JOIN classes c ON t.class_id = c.id
      JOIN sections s ON t.section_id = s.id
      WHERE t.school_id = ? AND t.session_id = ? AND t.day_of_week = ?
        AND t.section_id = ? AND (? IS NULL OR t.id != ?)
        AND (t.start_time < ? AND t.end_time > ?)
      LIMIT 1
    `).get(
      schoolId,
      entry.sessionId,
      entry.dayOfWeek,
      entry.sectionId,
      entry.id || null,
      entry.id || null,
      entry.endTime,
      entry.startTime
    ) as any;

    if (sectionClash) {
      throw new Error(
        `Section Conflict: ${sectionClash.class_name} (${sectionClash.section_name}) already has ${sectionClash.subject_name} scheduled from ${sectionClash.start_time} to ${sectionClash.end_time} on ${dayName}.`
      );
    }
  }

  public createEntry(entry: TimetableEntryRecord): TimetableEntryRecord {
    // Perform conflict detection before inserting
    this.checkConflict(entry.schoolId, entry);

    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO timetable_entries (
        id, school_id, session_id, class_id, section_id, day_of_week,
        period_name, start_time, end_time, subject_name, teacher_id, room_number, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.schoolId,
      entry.sessionId,
      entry.classId,
      entry.sectionId,
      entry.dayOfWeek,
      entry.periodName,
      entry.startTime,
      entry.endTime,
      entry.subjectName,
      entry.teacherId || null,
      entry.roomNumber || null,
      now
    );
    return { ...entry, createdAt: now };
  }

  public listEntriesBySection(schoolId: string, sessionId: string, sectionId: string, dayOfWeek?: number): any[] {
    let sql = `
      SELECT t.id, t.school_id as schoolId, t.session_id as sessionId, t.class_id as classId,
             t.section_id as sectionId, t.day_of_week as dayOfWeek, t.period_name as periodName,
             t.start_time as startTime, t.end_time as endTime, t.subject_name as subjectName,
             t.teacher_id as teacherId, t.room_number as roomNumber,
             e.full_name as teacherName, c.name as className, s.name as sectionName
      FROM timetable_entries t
      JOIN classes c ON t.class_id = c.id
      JOIN sections s ON t.section_id = s.id
      LEFT JOIN employees e ON t.teacher_id = e.id
      WHERE t.school_id = ? AND t.session_id = ? AND t.section_id = ?
    `;
    const params: any[] = [schoolId, sessionId, sectionId];
    if (dayOfWeek) {
      sql += ' AND t.day_of_week = ?';
      params.push(dayOfWeek);
    }
    sql += ' ORDER BY t.day_of_week ASC, t.start_time ASC';
    return this.db.prepare(sql).all(...params);
  }

  public listEntriesByTeacher(schoolId: string, sessionId: string, teacherId: string, dayOfWeek?: number): any[] {
    let sql = `
      SELECT t.id, t.school_id as schoolId, t.session_id as sessionId, t.class_id as classId,
             t.section_id as sectionId, t.day_of_week as dayOfWeek, t.period_name as periodName,
             t.start_time as startTime, t.end_time as endTime, t.subject_name as subjectName,
             t.teacher_id as teacherId, t.room_number as roomNumber,
             c.name as className, s.name as sectionName
      FROM timetable_entries t
      JOIN classes c ON t.class_id = c.id
      JOIN sections s ON t.section_id = s.id
      WHERE t.school_id = ? AND t.session_id = ? AND t.teacher_id = ?
    `;
    const params: any[] = [schoolId, sessionId, teacherId];
    if (dayOfWeek) {
      sql += ' AND t.day_of_week = ?';
      params.push(dayOfWeek);
    }
    sql += ' ORDER BY t.day_of_week ASC, t.start_time ASC';
    return this.db.prepare(sql).all(...params);
  }

  public deleteEntry(schoolId: string, entryId: string): boolean {
    const res = this.db.prepare('DELETE FROM timetable_entries WHERE school_id = ? AND id = ?').run(schoolId, entryId);
    return res.changes > 0;
  }
}
