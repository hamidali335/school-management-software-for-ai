export const SCHEMA_SQL = `
-- School Profile
CREATE TABLE IF NOT EXISTS school_profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  currency TEXT DEFAULT 'Rs.',
  current_session_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Academic Sessions
CREATE TABLE IF NOT EXISTS academic_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Classes
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Sections
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  name TEXT NOT NULL,
  room_number TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);

-- Students (Permanent Identity)
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  admission_number TEXT UNIQUE NOT NULL,
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
  sync_version INTEGER DEFAULT 1,
  sync_status TEXT DEFAULT 'synced' CHECK(sync_status IN ('synced', 'pending_insert', 'pending_update', 'pending_delete'))
);

-- Student Enrollments (Session Scoped)
CREATE TABLE IF NOT EXISTS student_enrollments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  roll_number TEXT,
  status TEXT DEFAULT 'enrolled' CHECK(status IN ('enrolled', 'promoted', 'repeating', 'graduated', 'withdrawn')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT
);

-- Attendance (Strict Uniqueness: One record per student per date)
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'leave')),
  remarks TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  UNIQUE(student_id, date)
);

-- Fee Structures
CREATE TABLE IF NOT EXISTS fee_structures (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tuition_fee REAL NOT NULL,
  exam_fee REAL DEFAULT 0,
  misc_fee REAL DEFAULT 0,
  due_day INTEGER DEFAULT 10,
  FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);

-- Invoices / Challans
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  challan_number TEXT UNIQUE NOT NULL,
  student_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  month TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  previous_dues REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  balance REAL NOT NULL,
  status TEXT DEFAULT 'unpaid' CHECK(status IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT
);

-- Payment Receipts
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  receipt_number TEXT UNIQUE NOT NULL,
  amount REAL NOT NULL,
  payment_date TEXT NOT NULL,
  payment_method TEXT DEFAULT 'cash' CHECK(payment_method IN ('cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'cheque')),
  collector TEXT,
  reversal_for_payment_id TEXT,
  reversal_reason TEXT,
  reversed_at TEXT,
  is_reversed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
  FOREIGN KEY (reversal_for_payment_id) REFERENCES payments(id) ON DELETE RESTRICT
);

-- Staff / Faculty
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  designation TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  qualification TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'on_leave', 'resigned', 'terminated')),
  joined_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Offline Sync Change Tracker (Outbox Pattern)
CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  school_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  dependency_key TEXT,
  base_version INTEGER DEFAULT 1,
  payload_json TEXT NOT NULL,
  operation TEXT DEFAULT 'INSERT',
  status TEXT DEFAULT 'pending',
  state TEXT NOT NULL CHECK(state IN ('pending', 'processing', 'retrying', 'synced', 'conflict', 'needs_attention')) DEFAULT 'pending',
  attempt_count INTEGER DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  last_http_status INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  synced_at TEXT
);

-- Sequence cursor table tracking remote change stream
CREATE TABLE IF NOT EXISTS sync_school_cursor (
  school_id TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Protected technician lockout state table
CREATE TABLE IF NOT EXISTS technician_lockout (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  failed_attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Local Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  details TEXT,
  performed_by TEXT DEFAULT 'Local Administrator',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for Fast Query Performance
CREATE INDEX IF NOT EXISTS idx_students_admission ON students(admission_number);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
CREATE INDEX IF NOT EXISTS idx_enrollment_session_class ON student_enrollments(session_id, class_id, section_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date_class ON attendance(date, class_id, section_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
`;
