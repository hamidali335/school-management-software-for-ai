import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration001CoreSchema: Migration = {
  version: 1,
  name: '001_core_schema',
  up: (db: Database.Database) => {
    db.exec(`
      -- Single installation identity configuration bound to one school
      CREATE TABLE IF NOT EXISTS installation_config (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        school_id TEXT UNIQUE NOT NULL,
        school_name TEXT NOT NULL,
        school_code TEXT NOT NULL,
        currency TEXT DEFAULT 'Rs.',
        current_session_id TEXT,
        installation_id TEXT NOT NULL,
        provisioned_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Academic Sessions (bound to school_id)
      CREATE TABLE IF NOT EXISTS academic_sessions (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        is_current INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      -- Classes (Grade Levels)
      CREATE TABLE IF NOT EXISTS classes (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      -- Sections per Class
      CREATE TABLE IF NOT EXISTS sections (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        name TEXT NOT NULL,
        room_number TEXT,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(class_id, name)
      );

      -- Students: Permanent Personal Identity
      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        admission_number TEXT NOT NULL,
        full_name TEXT NOT NULL,
        father_name TEXT NOT NULL,
        gender TEXT CHECK(gender IN ('male', 'female', 'other')),
        date_of_birth TEXT,
        cnic_bform TEXT,
        phone TEXT,
        address TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'graduated', 'withdrawn')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(school_id, admission_number)
      );

      -- Student Enrollments (Session Scoped)
      CREATE TABLE IF NOT EXISTS student_enrollments (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        roll_number TEXT,
        status TEXT DEFAULT 'enrolled' CHECK(status IN ('enrolled', 'promoted', 'repeating', 'graduated', 'withdrawn')),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
        FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(session_id, student_id)
      );

      -- Attendance Roll-Call (Strict Uniqueness: One record per student per calendar date)
      CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'leave')),
        remarks TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
        FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(student_id, date)
      );

      -- Fee Structures
      CREATE TABLE IF NOT EXISTS fee_structures (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        name TEXT NOT NULL,
        tuition_fee REAL NOT NULL,
        exam_fee REAL DEFAULT 0,
        misc_fee REAL DEFAULT 0,
        due_day INTEGER DEFAULT 10,
        FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      -- Fee Invoices / Challans
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        challan_number TEXT NOT NULL,
        student_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        month TEXT NOT NULL,
        due_date TEXT NOT NULL,
        amount REAL NOT NULL,
        previous_dues REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        balance REAL NOT NULL,
        status TEXT DEFAULT 'unpaid' CHECK(status IN ('unpaid', 'partially_paid', 'paid', 'overdue')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
        FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(school_id, challan_number)
      );

      -- Payment Receipts (Immutable record with explicit reversal support)
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        receipt_number TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'cheque')),
        collector TEXT,
        is_reversed INTEGER DEFAULT 0,
        reversal_reason TEXT,
        reversed_at TEXT,
        reversal_for_payment_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        FOREIGN KEY (reversal_for_payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
        UNIQUE(school_id, receipt_number)
      );

      -- Faculty & Employees
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        employee_code TEXT NOT NULL,
        full_name TEXT NOT NULL,
        designation TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        qualification TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'on_leave', 'resigned', 'terminated')),
        joined_date TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(school_id, employee_code)
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_students_school_adm ON students(school_id, admission_number);
      CREATE INDEX IF NOT EXISTS idx_enrollment_session ON student_enrollments(session_id, class_id, section_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(school_id, date, class_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(school_id, student_id, status);
      CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(school_id, invoice_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reversal_for_payment_id ON payments(reversal_for_payment_id) WHERE reversal_for_payment_id IS NOT NULL;
    `);
  },
};
