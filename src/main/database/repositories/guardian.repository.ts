import Database from 'better-sqlite3';

export interface GuardianRecord {
  id: string;
  schoolId: string;
  studentId: string;
  fullName: string;
  relationship: string;
  cnic?: string | null;
  phone: string;
  email?: string | null;
  occupation?: string | null;
  address?: string | null;
  isActive: boolean;
  replacedAt?: string | null;
  replacementReason?: string | null;
  createdAt?: string;
}

export class GuardianRepository {
  constructor(private db: Database.Database) {}

  public getActiveGuardian(schoolId: string, studentId: string): GuardianRecord | null {
    const row = this.db.prepare(`
      SELECT id, school_id as schoolId, student_id as studentId, full_name as fullName,
             relationship, cnic, phone, email, occupation, address,
             is_active as isActive, replaced_at as replacedAt,
             replacement_reason as replacementReason, created_at as createdAt
      FROM student_guardians
      WHERE school_id = ? AND student_id = ? AND is_active = 1
    `).get(schoolId, studentId) as GuardianRecord | undefined;

    return row || null;
  }

  public getGuardianHistory(schoolId: string, studentId: string): GuardianRecord[] {
    return this.db.prepare(`
      SELECT id, school_id as schoolId, student_id as studentId, full_name as fullName,
             relationship, cnic, phone, email, occupation, address,
             is_active as isActive, replaced_at as replacedAt,
             replacement_reason as replacementReason, created_at as createdAt
      FROM student_guardians
      WHERE school_id = ? AND student_id = ?
      ORDER BY is_active DESC, created_at DESC
    `).all(schoolId, studentId) as GuardianRecord[];
  }

  public createGuardian(data: Omit<GuardianRecord, 'isActive' | 'replacedAt' | 'replacementReason' | 'createdAt'>): GuardianRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO student_guardians (
        id, school_id, student_id, full_name, relationship, cnic, phone, email, occupation, address, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      data.id,
      data.schoolId,
      data.studentId,
      data.fullName,
      data.relationship,
      data.cnic || null,
      data.phone,
      data.email || null,
      data.occupation || null,
      data.address || null,
      now
    );

    return {
      ...data,
      isActive: true,
      createdAt: now,
    };
  }

  public replaceGuardian(
    schoolId: string,
    studentId: string,
    newGuardian: Omit<GuardianRecord, 'isActive' | 'replacedAt' | 'replacementReason' | 'createdAt'>,
    reason: string
  ): { previousGuardian: GuardianRecord | null; newGuardian: GuardianRecord } {
    const runTx = this.db.transaction(() => {
      const active = this.getActiveGuardian(schoolId, studentId);
      const now = new Date().toISOString();

      if (active) {
        this.db.prepare(`
          UPDATE student_guardians
          SET is_active = 0, replaced_at = ?, replacement_reason = ?
          WHERE school_id = ? AND id = ?
        `).run(now, reason, schoolId, active.id);
      }

      this.db.prepare(`
        INSERT INTO student_guardians (
          id, school_id, student_id, full_name, relationship, cnic, phone, email, occupation, address, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        newGuardian.id,
        schoolId,
        studentId,
        newGuardian.fullName,
        newGuardian.relationship,
        newGuardian.cnic || null,
        newGuardian.phone,
        newGuardian.email || null,
        newGuardian.occupation || null,
        newGuardian.address || null,
        now
      );

      const created = this.getActiveGuardian(schoolId, studentId)!;
      return { previousGuardian: active, newGuardian: created };
    });

    return runTx();
  }
}
