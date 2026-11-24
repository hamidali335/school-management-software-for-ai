import Database from 'better-sqlite3';

export interface EmployeeRecord {
  id: string;
  schoolId: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  department?: string | null;
  isTeaching?: boolean;
  phone?: string | null;
  email?: string | null;
  qualification?: string | null;
  status: 'active' | 'on_leave' | 'resigned' | 'terminated';
  joinedDate?: string | null;
  createdAt?: string;
}

export interface StaffAttendanceRecord {
  id: string;
  schoolId: string;
  employeeId: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'leave' | 'half_day';
  checkInTime?: string | null;
  checkOutTime?: string | null;
  remarks?: string | null;
}

export class EmployeeRepository {
  constructor(private db: Database.Database) {}

  public createEmployee(emp: EmployeeRecord): EmployeeRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO employees (
        id, school_id, employee_code, full_name, designation, department, is_teaching,
        phone, email, qualification, status, joined_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      emp.id,
      emp.schoolId,
      emp.employeeCode,
      emp.fullName,
      emp.designation,
      emp.department || 'Academics',
      emp.isTeaching !== undefined ? (emp.isTeaching ? 1 : 0) : 1,
      emp.phone || null,
      emp.email || null,
      emp.qualification || null,
      emp.status || 'active',
      emp.joinedDate || null,
      now
    );
    return { ...emp, createdAt: now };
  }

  public listEmployees(schoolId: string, query?: { search?: string; status?: string; department?: string; isTeaching?: boolean }): EmployeeRecord[] {
    let sql = `
      SELECT id, school_id as schoolId, employee_code as employeeCode, full_name as fullName,
             designation, department, is_teaching as isTeaching, phone, email, qualification,
             status, joined_date as joinedDate, created_at as createdAt
      FROM employees
      WHERE school_id = ?
    `;
    const params: any[] = [schoolId];

    if (query?.status) {
      sql += ' AND status = ?';
      params.push(query.status);
    }
    if (query?.department) {
      sql += ' AND department = ?';
      params.push(query.department);
    }
    if (typeof query?.isTeaching === 'boolean') {
      sql += ' AND is_teaching = ?';
      params.push(query.isTeaching ? 1 : 0);
    }
    if (query?.search) {
      sql += ' AND (full_name LIKE ? OR employee_code LIKE ? OR designation LIKE ?)';
      const p = `%${query.search}%`;
      params.push(p, p, p);
    }
    sql += ' ORDER BY employee_code ASC';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      ...r,
      isTeaching: Boolean(r.isTeaching),
    }));
  }

  public findById(schoolId: string, id: string): EmployeeRecord | null {
    const row = this.db.prepare(`
      SELECT id, school_id as schoolId, employee_code as employeeCode, full_name as fullName,
             designation, department, is_teaching as isTeaching, phone, email, qualification,
             status, joined_date as joinedDate, created_at as createdAt
      FROM employees
      WHERE school_id = ? AND id = ?
    `).get(schoolId, id) as any;

    if (!row) return null;
    return {
      ...row,
      isTeaching: Boolean(row.isTeaching),
    };
  }

  // ----------------------------------------------------------------------
  // STAFF DAILY ATTENDANCE
  // ----------------------------------------------------------------------

  public recordStaffAttendance(entries: StaffAttendanceRecord[]): { recordedCount: number } {
    const runTx = this.db.transaction(() => {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO staff_attendance (
          id, school_id, employee_id, date, status, check_in_time, check_out_time, remarks, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(school_id, employee_id, date) DO UPDATE SET
          status = excluded.status,
          check_in_time = excluded.check_in_time,
          check_out_time = excluded.check_out_time,
          remarks = excluded.remarks
      `);

      for (const entry of entries) {
        stmt.run(
          entry.id,
          entry.schoolId,
          entry.employeeId,
          entry.date,
          entry.status,
          entry.checkInTime || null,
          entry.checkOutTime || null,
          entry.remarks || null,
          now
        );
      }

      return entries.length;
    });

    const count = runTx();
    return { recordedCount: count };
  }

  public getStaffAttendanceByDate(schoolId: string, date: string): any[] {
    return this.db.prepare(`
      SELECT sa.id, sa.school_id, sa.employee_id, sa.date, sa.status, sa.check_in_time, sa.check_out_time, sa.remarks,
             e.full_name as employee_name, e.employee_code, e.designation, e.department
      FROM staff_attendance sa
      JOIN employees e ON sa.employee_id = e.id AND sa.school_id = e.school_id
      WHERE sa.school_id = ? AND sa.date = ?
      ORDER BY e.employee_code ASC
    `).all(schoolId, date);
  }

  public getStaffAttendanceSummary(schoolId: string, date: string) {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM staff_attendance
      WHERE school_id = ? AND date = ?
      GROUP BY status
    `).all(schoolId, date) as { status: string; count: number }[];

    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let half_day = 0;

    for (const r of rows) {
      if (r.status === 'present') present = r.count;
      else if (r.status === 'absent') absent = r.count;
      else if (r.status === 'late') late = r.count;
      else if (r.status === 'leave') leave = r.count;
      else if (r.status === 'half_day') half_day = r.count;
    }

    const total = present + absent + late + leave + half_day;
    const percentage = total > 0 ? Math.round(((present + late + (half_day * 0.5)) / total) * 100) : 0;

    return { date, total, present, absent, late, leave, half_day, percentage };
  }

  // ----------------------------------------------------------------------
  // USER ACCOUNT PROVISIONING LINK
  // ----------------------------------------------------------------------

  public linkUserAccount(schoolId: string, employeeId: string, userId: string): boolean {
    const res = this.db.prepare(`
      UPDATE users SET employee_id = ? WHERE school_id = ? AND id = ?
    `).run(employeeId, schoolId, userId);
    return res.changes > 0;
  }
}
