import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration006ComprehensiveBusinessWorkflows: Migration = {
  version: 6,
  name: '006_comprehensive_business_workflows',
  up: (db: Database.Database) => {
    db.exec(`
      -- 1. Student Guardians Table (Strict Invariant: Exactly one active guardian per student)
      CREATE TABLE IF NOT EXISTS student_guardians (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        cnic TEXT,
        phone TEXT NOT NULL,
        email TEXT,
        occupation TEXT,
        address TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        replaced_at TEXT,
        replacement_reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      -- Partial unique index guarantees that NO student can have more than ONE active guardian
      CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_guardian
      ON student_guardians(school_id, student_id)
      WHERE is_active = 1;

      CREATE INDEX IF NOT EXISTS idx_guardians_student ON student_guardians(school_id, student_id);

      -- 2. Fee Concessions & Discounts Table
      CREATE TABLE IF NOT EXISTS fee_concessions (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        concession_type TEXT NOT NULL CHECK(concession_type IN ('percentage', 'fixed_amount')),
        value REAL NOT NULL CHECK(value > 0),
        reason TEXT NOT NULL,
        approved_by TEXT NOT NULL,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
        FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_concessions_student ON fee_concessions(school_id, student_id, status);

      -- 3. Grading Standards & Scales Table
      CREATE TABLE IF NOT EXISTS grading_scales (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        grade TEXT NOT NULL,
        min_percentage REAL NOT NULL CHECK(min_percentage >= 0),
        max_percentage REAL NOT NULL CHECK(max_percentage <= 100),
        gpa REAL,
        description TEXT,
        order_index INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(school_id, grade)
      );

      -- 4. Staff Daily Attendance Table (Completely separate from student attendance)
      CREATE TABLE IF NOT EXISTS staff_attendance (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'leave', 'half_day')),
        check_in_time TEXT,
        check_out_time TEXT,
        remarks TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(school_id, employee_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_staff_att_date ON staff_attendance(school_id, date);

      -- 5. Staff Salary Structures
      CREATE TABLE IF NOT EXISTS staff_salaries (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        employee_id TEXT UNIQUE NOT NULL,
        basic_salary REAL NOT NULL CHECK(basic_salary >= 0),
        allowances_json TEXT DEFAULT '[]',
        deductions_json TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      -- 6. Monthly Payroll Runs
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        month TEXT NOT NULL,
        year INTEGER NOT NULL,
        total_disbursed REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'paid')),
        approved_by TEXT,
        approved_at TEXT,
        paid_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(school_id, month, year)
      );

      -- 7. Individual Staff Payroll Slips
      CREATE TABLE IF NOT EXISTS payroll_slips (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        payroll_run_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        basic_salary REAL NOT NULL,
        total_allowances REAL NOT NULL DEFAULT 0,
        total_deductions REAL NOT NULL DEFAULT 0,
        net_salary REAL NOT NULL,
        payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'paid')),
        payment_method TEXT DEFAULT 'bank_transfer',
        payment_reference TEXT,
        paid_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE RESTRICT,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(payroll_run_id, employee_id)
      );

      -- 8. School Institutional Profile & Settings Table
      CREATE TABLE IF NOT EXISTS school_settings (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        school_id TEXT UNIQUE NOT NULL,
        contact_email TEXT,
        contact_phone TEXT,
        address TEXT,
        logo_url TEXT,
        motto TEXT,
        challan_instructions TEXT,
        grading_system TEXT DEFAULT 'percentage',
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );
    `);

    // Add extra columns conditionally if not already present
    const invoiceCols = new Set((db.pragma('table_info(invoices)') as any[]).map(c => c.name));
    if (!invoiceCols.has('discount_amount')) {
      db.exec('ALTER TABLE invoices ADD COLUMN discount_amount REAL DEFAULT 0;');
    }
    if (!invoiceCols.has('concession_id')) {
      db.exec('ALTER TABLE invoices ADD COLUMN concession_id TEXT;');
    }

    const studentCols = new Set((db.pragma('table_info(students)') as any[]).map(c => c.name));
    if (!studentCols.has('admission_date')) {
      db.exec('ALTER TABLE students ADD COLUMN admission_date TEXT;');
    }
    if (!studentCols.has('previous_school')) {
      db.exec('ALTER TABLE students ADD COLUMN previous_school TEXT;');
    }
    if (!studentCols.has('admin_notes')) {
      db.exec('ALTER TABLE students ADD COLUMN admin_notes TEXT;');
    }

    const empCols = new Set((db.pragma('table_info(employees)') as any[]).map(c => c.name));
    if (!empCols.has('department')) {
      db.exec('ALTER TABLE employees ADD COLUMN department TEXT DEFAULT "Academics";');
    }
    if (!empCols.has('is_teaching')) {
      db.exec('ALTER TABLE employees ADD COLUMN is_teaching INTEGER DEFAULT 1;');
    }

    const userCols = new Set((db.pragma('table_info(users)') as any[]).map(c => c.name));
    if (!userCols.has('employee_id')) {
      db.exec('ALTER TABLE users ADD COLUMN employee_id TEXT;');
    }

    // Backfill guardians for any existing student that lacks an active guardian
    const studentsWithoutGuardian = db.prepare(`
      SELECT s.id, s.school_id, s.father_name, s.phone, s.address, s.created_at
      FROM students s
      LEFT JOIN student_guardians g ON s.id = g.student_id AND g.is_active = 1
      WHERE g.id IS NULL
    `).all() as any[];

    const insertGuardianStmt = db.prepare(`
      INSERT INTO student_guardians (
        id, school_id, student_id, full_name, relationship, cnic, phone, email, occupation, address, is_active, created_at
      ) VALUES (?, ?, ?, ?, 'father', null, ?, null, 'Business / Employed', ?, 1, ?)
    `);

    for (const s of studentsWithoutGuardian) {
      insertGuardianStmt.run(
        `gdn_${s.id}`,
        s.school_id,
        s.id,
        s.father_name || 'Guardian',
        s.phone || '0300-0000000',
        s.address || 'Lahore, Pakistan',
        s.created_at || new Date().toISOString()
      );
    }

    // Seed default grading scales for existing schools if empty
    const scaleCount = (db.prepare('SELECT COUNT(*) as c FROM grading_scales').get() as any).c;
    if (scaleCount === 0) {
      const schoolRow = db.prepare('SELECT school_id FROM installation_config WHERE id = 1').get() as any;
      if (schoolRow) {
        const schId = schoolRow.school_id;
        const scales = [
          { grade: 'A+', min: 80, max: 100, gpa: 4.0, desc: 'Exceptional Distinction', order: 1 },
          { grade: 'A', min: 70, max: 79.99, gpa: 3.7, desc: 'Excellent', order: 2 },
          { grade: 'B', min: 60, max: 69.99, gpa: 3.0, desc: 'Very Good', order: 3 },
          { grade: 'C', min: 50, max: 59.99, gpa: 2.5, desc: 'Good / Average', order: 4 },
          { grade: 'D', min: 40, max: 49.99, gpa: 2.0, desc: 'Passing Grade', order: 5 },
          { grade: 'F', min: 0, max: 39.99, gpa: 0.0, desc: 'Failed — Needs Retake', order: 6 },
        ];
        const scaleStmt = db.prepare(`
          INSERT INTO grading_scales (id, school_id, grade, min_percentage, max_percentage, gpa, description, order_index)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const sc of scales) {
          scaleStmt.run(`scale_${sc.grade.replace('+', 'plus')}`, schId, sc.grade, sc.min, sc.max, sc.gpa, sc.desc, sc.order);
        }
      }
    }

    // Seed default school_settings row if not exists
    const schoolRow = db.prepare('SELECT school_id, school_name FROM installation_config WHERE id = 1').get() as any;
    if (schoolRow) {
      db.prepare(`
        INSERT OR IGNORE INTO school_settings (id, school_id, contact_email, contact_phone, address, motto, challan_instructions)
        VALUES (1, ?, 'admin@aiphs.edu.pk', '0300-8451234', 'Lahore, Punjab, Pakistan', 'Knowledge is Power and Light', 'Please pay fee by due date to avoid late fee surcharge.')
      `).run(schoolRow.school_id);
    }
  },
};
