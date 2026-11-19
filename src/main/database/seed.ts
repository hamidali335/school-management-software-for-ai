import Database from 'better-sqlite3';
import { PasswordHasher } from '../security/password-hasher';

export function seedDemoData(db: Database.Database): void {
  const installRow = db.prepare('SELECT COUNT(*) as count FROM installation_config WHERE id = 1').get() as { count: number };
  if (installRow.count > 0) return;

  const runTx = db.transaction(() => {
    const schoolId = 'sch_01';
    const now = new Date().toISOString();

    // 1. Authoritative Installation Config
    db.prepare(`
      INSERT INTO installation_config (
        id, school_id, school_name, school_code, currency, current_session_id, installation_id, provisioned_at, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      schoolId,
      'Allama Iqbal Public High School',
      'AIPHS-LHR',
      'Rs.',
      'sess_2026_27',
      'inst_lahore_main_001',
      now,
      now
    );

    // 2. Default School Owner Administrator Account
    const { hash, salt } = PasswordHasher.hashPassword('Admin@12345');
    db.prepare(`
      INSERT INTO users (
        id, school_id, name, email, username, phone, password_hash, salt, role, permissions_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      'usr_admin_01',
      schoolId,
      'Muhammad Tariq (Principal)',
      'admin@aiphs.edu.pk',
      'admin',
      '0300-8451234',
      hash,
      salt,
      'school_owner',
      JSON.stringify(['*']),
      now,
      now
    );

    // 3. Academic Session
    db.prepare(`
      INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run('sess_2026_27', schoolId, 'Academic Session 2026-2027', '2026-04-01', '2027-03-31', now);

    // 4. Classes & Sections
    const classStmt = db.prepare('INSERT INTO classes (id, school_id, name, order_index, created_at) VALUES (?, ?, ?, ?, ?)');
    const sectionStmt = db.prepare('INSERT INTO sections (id, school_id, class_id, name, room_number) VALUES (?, ?, ?, ?, ?)');

    const classesData = [
      { id: 'cls_10', name: 'Grade 10 - Matric', order: 10, sections: ['Section A', 'Section B'] },
      { id: 'cls_09', name: 'Grade 9 - Science', order: 9, sections: ['Section A', 'Section B'] },
      { id: 'cls_08', name: 'Grade 8 - Middle', order: 8, sections: ['Section A'] },
      { id: 'cls_07', name: 'Grade 7 - Middle', order: 7, sections: ['Section A'] },
      { id: 'cls_06', name: 'Grade 6 - Middle', order: 6, sections: ['Section A'] },
    ];

    for (const cls of classesData) {
      classStmt.run(cls.id, schoolId, cls.name, cls.order, now);
      cls.sections.forEach((sec, idx) => {
        sectionStmt.run(`sec_${cls.id}_${idx}`, schoolId, cls.id, sec, `Room ${cls.order}0${idx + 1}`);
      });
    }

    // 5. Staff / Faculty
    const staffStmt = db.prepare(`
      INSERT INTO employees (id, school_id, employee_code, full_name, designation, phone, email, qualification, status, joined_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const staffMembers = [
      { id: 'emp_01', code: 'EMP-101', name: 'Muhammad Tariq', designation: 'Principal & Senior Mathematics', phone: '0300-8451234', email: 'tariq@school.edu.pk', qual: 'M.Sc Mathematics (Punjab Univ)', date: '2020-03-01' },
      { id: 'emp_02', code: 'EMP-102', name: 'Ayesha Siddiqua', designation: 'Headmistress & English Faculty', phone: '0321-4567890', email: 'ayesha@school.edu.pk', qual: 'M.A English Linguistics', date: '2021-08-15' },
      { id: 'emp_03', code: 'EMP-103', name: 'Noman Bashir', designation: 'Physics Specialist', phone: '0333-9876543', email: 'noman@school.edu.pk', qual: 'M.Sc Physics', date: '2022-01-10' },
      { id: 'emp_04', code: 'EMP-104', name: 'Abdul Rehman', designation: 'Accountant & Fee Officer', phone: '0312-3344556', email: 'accounts@school.edu.pk', qual: 'B.Com / CMA Inter', date: '2022-09-01' },
    ];

    for (const emp of staffMembers) {
      staffStmt.run(emp.id, schoolId, emp.code, emp.name, emp.designation, emp.phone, emp.email, emp.qual, 'active', emp.date, now);
    }

    // 6. Students & Enrollments
    const studentStmt = db.prepare(`
      INSERT INTO students (id, school_id, admission_number, full_name, father_name, gender, date_of_birth, cnic_bform, phone, address, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);
    const enrollStmt = db.prepare(`
      INSERT INTO student_enrollments (id, school_id, student_id, session_id, class_id, section_id, roll_number, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'enrolled', ?)
    `);

    const studentsData = [
      { id: 'std_01', adm: 'ADM-2026-001', name: 'Hamza Farooq', father: 'Farooq Ahmed', gender: 'male', dob: '2010-05-14', cnic: '35201-1234567-1', phone: '0300-1112233', classId: 'cls_10', secId: 'sec_cls_10_0', roll: '1001' },
      { id: 'std_02', adm: 'ADM-2026-002', name: 'Fatima Noor', father: 'Muhammad Arshad', gender: 'female', dob: '2010-09-22', cnic: '35201-2345678-2', phone: '0321-2223344', classId: 'cls_10', secId: 'sec_cls_10_0', roll: '1002' },
      { id: 'std_03', adm: 'ADM-2026-003', name: 'Bilal Hassan', father: 'Hassan Raza', gender: 'male', dob: '2011-01-18', cnic: '35201-3456789-3', phone: '0333-3334455', classId: 'cls_09', secId: 'sec_cls_09_0', roll: '901' },
      { id: 'std_04', adm: 'ADM-2026-004', name: 'Amina Khalid', father: 'Khalid Mehmood', gender: 'female', dob: '2011-07-30', cnic: '35201-4567890-4', phone: '0345-4445566', classId: 'cls_09', secId: 'sec_cls_09_0', roll: '902' },
    ];

    for (const std of studentsData) {
      studentStmt.run(std.id, schoolId, std.adm, std.name, std.father, std.gender, std.dob, std.cnic, std.phone, 'Lahore, Pakistan', now, now);
      enrollStmt.run(`enr_${std.id}`, schoolId, std.id, 'sess_2026_27', std.classId, std.secId, std.roll, now);
    }

    // 7. Initial Attendance & Fee Invoices
    const today = new Date().toISOString().split('T')[0];
    const attStmt = db.prepare(`
      INSERT INTO attendance (id, school_id, student_id, session_id, class_id, section_id, date, status, remarks, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const invStmt = db.prepare(`
      INSERT INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, previous_dues, paid_amount, balance, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const payStmt = db.prepare(`
      INSERT INTO payments (id, school_id, invoice_id, receipt_number, amount, payment_date, payment_method, collector, is_reversed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);

    studentsData.forEach((std, idx) => {
      const status = idx === 3 ? 'absent' : 'present';
      attStmt.run(`att_${std.id}_${today}`, schoolId, std.id, 'sess_2026_27', std.classId, std.secId, today, status, null, now);

      const isPaid = idx % 2 === 0;
      const amount = 6500;
      const paid = isPaid ? 6500 : 0;
      const balance = amount - paid;
      const invId = `inv_${std.id}_202611`;
      const challan = `CH-202611-00${idx + 1}`;

      invStmt.run(invId, schoolId, challan, std.id, 'sess_2026_27', 'November 2026', '2026-11-15', amount, 0, paid, balance, isPaid ? 'paid' : 'unpaid', now, now);

      if (isPaid) {
        payStmt.run(`pay_${invId}`, schoolId, invId, `RCP-202611-00${idx + 1}`, paid, today, 'cash', 'Abdul Rehman (Accountant)', now);
      }
    });

    // 8. Sample Examinations & Marks
    db.prepare(`
      INSERT INTO exams (id, school_id, session_id, name, term, start_date, end_date, status, created_at, updated_at)
      VALUES ('ex_mid_2026', ?, 'sess_2026_27', 'Mid-Term Assessment 2026', 'mid_term', '2026-10-15', '2026-10-30', 'published', ?, ?)
    `).run(schoolId, now, now);

    db.prepare(`
      INSERT INTO exams (id, school_id, session_id, name, term, start_date, end_date, status, created_at, updated_at)
      VALUES ('ex_final_2027', ?, 'sess_2026_27', 'Final Annual Examination 2027', 'final_term', '2027-02-15', '2027-03-05', 'scheduled', ?, ?)
    `).run(schoolId, now, now);

    const paperStmt = db.prepare(`
      INSERT INTO exam_papers (id, school_id, exam_id, class_id, subject_name, max_marks, pass_marks, exam_date, start_time, duration_minutes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    paperStmt.run('paper_10_math', schoolId, 'ex_mid_2026', 'cls_10', 'Mathematics', 100, 33, '2026-10-16', '09:00 AM', 180, now);
    paperStmt.run('paper_10_eng', schoolId, 'ex_mid_2026', 'cls_10', 'English Grammar', 75, 25, '2026-10-18', '09:00 AM', 150, now);
    paperStmt.run('paper_10_phy', schoolId, 'ex_mid_2026', 'cls_10', 'Physics Theory', 60, 20, '2026-10-20', '09:00 AM', 120, now);

    const markStmt = db.prepare(`
      INSERT INTO student_marks (id, school_id, exam_id, paper_id, student_id, obtained_marks, is_absent, remarks, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    markStmt.run('mk_std1_math', schoolId, 'ex_mid_2026', 'paper_10_math', 'std_01', 88, 0, 'Excellent performance', now, now);
    markStmt.run('mk_std1_eng', schoolId, 'ex_mid_2026', 'paper_10_eng', 'std_01', 65, 0, 'Good grammar', now, now);
    markStmt.run('mk_std2_math', schoolId, 'ex_mid_2026', 'paper_10_math', 'std_02', 94, 0, 'Class highest', now, now);
    markStmt.run('mk_std2_eng', schoolId, 'ex_mid_2026', 'paper_10_eng', 'std_02', 71, 0, 'Distinction', now, now);

    // 9. Sample Timetable Entries
    const ttStmt = db.prepare(`
      INSERT INTO timetable_entries (id, school_id, session_id, class_id, section_id, day_of_week, period_name, start_time, end_time, subject_name, teacher_id, room_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const periods = [
      { id: 'tt_1', day: 1, p: '1st Period', start: '08:00 AM', end: '08:45 AM', sub: 'Mathematics', teacher: 'emp_01', room: 'Room 1001' },
      { id: 'tt_2', day: 1, p: '2nd Period', start: '08:45 AM', end: '09:30 AM', sub: 'English', teacher: 'emp_02', room: 'Room 1001' },
      { id: 'tt_3', day: 1, p: '3rd Period', start: '09:30 AM', end: '10:15 AM', sub: 'Physics', teacher: 'emp_03', room: 'Physics Lab' },
      { id: 'tt_4', day: 2, p: '1st Period', start: '08:00 AM', end: '08:45 AM', sub: 'Mathematics', teacher: 'emp_01', room: 'Room 1001' },
      { id: 'tt_5', day: 2, p: '2nd Period', start: '08:45 AM', end: '09:30 AM', sub: 'Chemistry', teacher: 'emp_03', room: 'Chemistry Lab' },
    ];
    for (const p of periods) {
      ttStmt.run(p.id, schoolId, 'sess_2026_27', 'cls_10', 'sec_cls_10_0', p.day, p.p, p.start, p.end, p.sub, p.teacher, p.room, now);
    }

    // 10. Sample Institutional Expenses
    const expStmt = db.prepare(`
      INSERT INTO expenses (id, school_id, category, amount, expense_date, vendor, description, payment_method, reference, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    expStmt.run('exp_01', schoolId, 'utilities', 45000, '2026-11-05', 'LESCO Electric Utility', 'Monthly commercial electricity bill', 'bank_transfer', 'BILL-LESCO-NOV26', 'Abdul Rehman', now);
    expStmt.run('exp_02', schoolId, 'stationery', 12500, '2026-11-08', 'Al-Rehman Stationers Lahore', 'A4 examination paper reams and printer cartridges', 'cash', 'INV-STAT-892', 'Abdul Rehman', now);
    expStmt.run('exp_03', schoolId, 'maintenance', 18000, '2026-11-10', 'Malik Electric Works', 'Generator maintenance and diesel refill', 'cash', 'RCP-GEN-044', 'Abdul Rehman', now);

    // 11. Fee Structures & Concessions
    const feeStructStmt = db.prepare(`
      INSERT OR IGNORE INTO fee_structures (id, school_id, session_id, class_id, name, tuition_fee, exam_fee, misc_fee, due_day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    feeStructStmt.run('fs_cls_10', schoolId, 'sess_2026_27', 'cls_10', 'Matric Standard Fee', 6500, 500, 200, 10);
    feeStructStmt.run('fs_cls_09', schoolId, 'sess_2026_27', 'cls_09', 'Grade 9 Science Fee', 6000, 500, 200, 10);
    feeStructStmt.run('fs_cls_08', schoolId, 'sess_2026_27', 'cls_08', 'Middle School Standard Fee', 5500, 400, 100, 10);

    // 12. Staff Salaries & Payroll
    const salaryStmt = db.prepare(`
      INSERT OR IGNORE INTO staff_salaries (id, school_id, employee_id, basic_salary, allowances_json, deductions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    salaryStmt.run('sal_emp_01', schoolId, 'emp_01', 85000, JSON.stringify([{ name: 'Head Allowance', amount: 15000 }]), JSON.stringify([{ name: 'Provident Fund', amount: 5000 }]), now, now);
    salaryStmt.run('sal_emp_02', schoolId, 'emp_02', 65000, JSON.stringify([{ name: 'Senior Allowance', amount: 10000 }]), JSON.stringify([{ name: 'Provident Fund', amount: 3500 }]), now, now);
    salaryStmt.run('sal_emp_03', schoolId, 'emp_03', 55000, JSON.stringify([{ name: 'Lab Incharge', amount: 8000 }]), JSON.stringify([{ name: 'Provident Fund', amount: 3000 }]), now, now);
    salaryStmt.run('sal_emp_04', schoolId, 'emp_04', 45000, JSON.stringify([]), JSON.stringify([{ name: 'Provident Fund', amount: 2500 }]), now, now);

    // 13. Staff Daily Attendance
    const staffAttStmt = db.prepare(`
      INSERT OR IGNORE INTO staff_attendance (id, school_id, employee_id, date, status, check_in_time, check_out_time, remarks, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    staffAttStmt.run(`stf_att_01_${today}`, schoolId, 'emp_01', today, 'present', '07:45 AM', '02:15 PM', 'On Duty', now);
    staffAttStmt.run(`stf_att_02_${today}`, schoolId, 'emp_02', today, 'present', '07:50 AM', '02:00 PM', 'On Duty', now);
    staffAttStmt.run(`stf_att_03_${today}`, schoolId, 'emp_03', today, 'present', '07:55 AM', '02:00 PM', 'On Duty', now);
    staffAttStmt.run(`stf_att_04_${today}`, schoolId, 'emp_04', today, 'present', '08:00 AM', '02:30 PM', 'Accounts Counter', now);

    // 14. Security Audit Trail
    db.prepare(`
      INSERT INTO audit_logs (school_id, user_id, action, module, details_json, status, performed_by, created_at)
      VALUES (?, 'usr_admin_01', 'INITIAL_PROVISION_SEED', 'SYSTEM', ?, 'success', 'System Setup', ?)
    `).run(schoolId, JSON.stringify({ schoolName: 'Allama Iqbal Public High School', adminEmail: 'admin@aiphs.edu.pk' }), now);

    // 15. Synchronization Device Configuration (development only)
    const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
    if (isDev) {
      db.prepare(`
        INSERT OR IGNORE INTO sync_device_config (
          id, school_id, device_id, device_name, api_base_url, device_status, registered_at, updated_at
        ) VALUES (1, ?, 'dev_sms_desk_01', 'Principal-Workstation-01', 'http://localhost:4000/api/v1', 'registered', ?, ?)
      `).run(schoolId, now, now);
    }
  });

  runTx();
}
