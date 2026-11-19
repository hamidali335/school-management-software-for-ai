import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration005AcademicAndFinancialExtensions: Migration = {
  version: 5,
  name: '005_academic_and_financial_extensions',
  up: (db: Database.Database) => {
    db.exec(`
      -- 1. Examinations Table
      CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        term TEXT NOT NULL CHECK(term IN ('first_term', 'mid_term', 'final_term', 'monthly_test', 'other')),
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'marks_entry', 'published')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_exams_school_session ON exams(school_id, session_id);

      -- 2. Exam Papers (Subjects tested in an exam for a class)
      CREATE TABLE IF NOT EXISTS exam_papers (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        max_marks REAL NOT NULL CHECK(max_marks > 0),
        pass_marks REAL NOT NULL CHECK(pass_marks >= 0),
        exam_date TEXT,
        start_time TEXT,
        duration_minutes INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(exam_id, class_id, subject_name)
      );

      CREATE INDEX IF NOT EXISTS idx_exam_papers_exam ON exam_papers(school_id, exam_id);

      -- 3. Student Marks Table
      CREATE TABLE IF NOT EXISTS student_marks (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        obtained_marks REAL,
        is_absent INTEGER DEFAULT 0,
        remarks TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT,
        FOREIGN KEY (paper_id) REFERENCES exam_papers(id) ON DELETE RESTRICT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT,
        UNIQUE(paper_id, student_id)
      );

      CREATE INDEX IF NOT EXISTS idx_marks_student ON student_marks(school_id, student_id);

      -- 4. Timetable Entries Table
      CREATE TABLE IF NOT EXISTS timetable_entries (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
        period_name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        teacher_id TEXT,
        room_number TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT,
        FOREIGN KEY (teacher_id) REFERENCES employees(id) ON DELETE RESTRICT,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_timetable_section ON timetable_entries(school_id, session_id, section_id, day_of_week);
      CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON timetable_entries(school_id, session_id, teacher_id, day_of_week);

      -- 5. School Expenses Table
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('salaries', 'rent', 'utilities', 'maintenance', 'stationery', 'transport_fuel', 'events', 'marketing', 'it_software', 'taxes', 'procurement', 'other')),
        amount REAL NOT NULL CHECK(amount > 0),
        expense_date TEXT NOT NULL,
        vendor TEXT,
        description TEXT NOT NULL,
        payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('cash', 'bank_transfer', 'cheque', 'online', 'card')),
        reference TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(school_id, expense_date);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(school_id, category);
    `);
  },
};
