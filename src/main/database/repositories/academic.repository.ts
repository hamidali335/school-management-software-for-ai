import Database from 'better-sqlite3';

export interface AcademicSessionRecord {
  id: string;
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt?: string;
}

export interface ClassRecord {
  id: string;
  schoolId: string;
  name: string;
  orderIndex: number;
  sections?: SectionRecord[];
  createdAt?: string;
}

export interface SectionRecord {
  id: string;
  schoolId: string;
  classId: string;
  name: string;
  roomNumber?: string | null;
}

export class AcademicRepository {
  constructor(private db: Database.Database) {}

  public listSessions(schoolId: string): AcademicSessionRecord[] {
    return this.db.prepare(`
      SELECT id, school_id as schoolId, name, start_date as startDate, end_date as endDate,
             is_current as isCurrent, created_at as createdAt
      FROM academic_sessions
      WHERE school_id = ?
      ORDER BY start_date DESC
    `).all(schoolId) as AcademicSessionRecord[];
  }

  public createSession(session: AcademicSessionRecord): AcademicSessionRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(session.id, session.schoolId, session.name, session.startDate, session.endDate, session.isCurrent ? 1 : 0, now);
    return { ...session, createdAt: now };
  }

  public listClasses(schoolId: string): (ClassRecord & { studentCount: number })[] {
    const classes = this.db.prepare(`
      SELECT c.id, c.school_id as schoolId, c.name, c.order_index as orderIndex, c.created_at as createdAt,
             COUNT(DISTINCT e.student_id) as studentCount
      FROM classes c
      LEFT JOIN student_enrollments e ON c.id = e.class_id AND c.school_id = e.school_id
      WHERE c.school_id = ?
      GROUP BY c.id
      ORDER BY c.order_index ASC
    `).all(schoolId) as (ClassRecord & { studentCount: number })[];

    const secStmt = this.db.prepare(`
      SELECT id, school_id as schoolId, class_id as classId, name, room_number as roomNumber
      FROM sections
      WHERE school_id = ? AND class_id = ?
      ORDER BY name ASC
    `);

    return classes.map(cls => ({
      ...cls,
      sections: secStmt.all(schoolId, cls.id) as SectionRecord[],
    }));
  }

  public createClassWithSections(
    schoolId: string,
    cls: { id: string; name: string; orderIndex: number; sections: string[] }
  ): ClassRecord {
    const runTx = this.db.transaction(() => {
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO classes (id, school_id, name, order_index, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(cls.id, schoolId, cls.name, cls.orderIndex, now);

      const createdSections: SectionRecord[] = [];
      const secStmt = this.db.prepare(`
        INSERT INTO sections (id, school_id, class_id, name)
        VALUES (?, ?, ?, ?)
      `);

      for (let i = 0; i < cls.sections.length; i++) {
        const secName = cls.sections[i].trim();
        if (secName) {
          const secId = `sec_${cls.id}_${i + 1}`;
          secStmt.run(secId, schoolId, cls.id, secName);
          createdSections.push({
            id: secId,
            schoolId,
            classId: cls.id,
            name: secName,
          });
        }
      }

      return {
        id: cls.id,
        schoolId,
        name: cls.name,
        orderIndex: cls.orderIndex,
        sections: createdSections,
        createdAt: now,
      };
    });

    return runTx();
  }
}
