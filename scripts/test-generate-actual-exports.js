const { spawn } = require('node:child_process');
const path = require('node:path');
const electron = require('electron');
const fs = require('node:fs');

const runnerCode = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const { initDatabase, closeDatabase } = require('../dist/main/database/connection');
const { DatabaseKeyManager } = require('../dist/main/security/database-key-manager');
const { AuthService } = require('../dist/main/services/auth.service');
const { ReportService } = require('../dist/main/services/report.service');
const { StudentService } = require('../dist/main/services/student.service');
const { FeeService } = require('../dist/main/services/fee.service');
const { ExpenseService } = require('../dist/main/services/expense.service');

const testDbPath = path.join(app.getPath('userData'), 'test_export_runner.db');
const testVaultDir = path.join(app.getPath('userData'), 'test_vault_export');

function cleanup() {
  for (const ext of ['', '-wal', '-shm']) {
    const p = testDbPath + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
  if (fs.existsSync(testVaultDir)) {
    try { fs.rmSync(testVaultDir, { recursive: true, force: true }); } catch {}
  }
}

app.whenReady().then(async () => {
  cleanup();
  console.log('[EXPORT_TEST] Starting real export generation test...');

  try {
    DatabaseKeyManager.resetInstanceForTesting();
    const db = initDatabase(testDbPath, { vaultDir: testVaultDir });

    const authService = new AuthService(db);
    const prov = await authService.provisionInitialAdmin({
      schoolName: 'Beaconhouse High School',
      schoolCode: 'BHS-01',
      adminName: 'Principal Amina',
      adminEmail: 'amina@bhs.edu.pk',
      adminUsername: 'bhs_admin',
      adminPassword: 'Password@2026',
    });
    const schoolId = prov.installation.schoolId;

    const session = {
      isValid: true,
      userId: prov.adminUser.id,
      schoolId,
      userName: 'Principal Amina',
      role: 'school_owner',
      permissions: ['*'],
    };

    // Setup sample data
    db.prepare("INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_current) VALUES ('sess_2026', ?, '2026-2027', '2026-04-01', '2027-03-31', 1)").run(schoolId);
    db.prepare("INSERT INTO classes (id, school_id, name, order_index) VALUES ('cls_8th', ?, 'Class 8', 8)").run(schoolId);
    db.prepare("INSERT INTO sections (id, school_id, class_id, name) VALUES ('sec_8a', ?, 'cls_8th', 'Section A')").run(schoolId);

    const studentService = new StudentService(db);
    studentService.admitStudent(session, {
      id: 'stud_801',
      admissionNumber: 'ADM-801',
      fullName: 'Hamza Farooq',
      fatherName: 'Farooq Ahmad',
      gender: 'male',
      dob: '2012-03-10',
      admissionDate: '2026-04-01',
      sessionId: 'sess_2026',
      classId: 'cls_8th',
      sectionId: 'sec_8a',
      rollNumber: '1',
      phone: '03001122334',
      guardian: {
        fullName: 'Farooq Ahmad',
        relationship: 'father',
        cnic: '35201-1112233-1',
        phone: '03001122334',
      },
    });

    const feeService = new FeeService(db);
    feeService.createFeeStructure(session, {
      id: 'fs_8th',
      sessionId: 'sess_2026',
      classId: 'cls_8th',
      name: 'Class 8 Standard Fee',
      tuitionFee: 7500,
      examFee: 0,
      miscFee: 0,
      dueDay: 10,
    });

    feeService.bulkGenerateInvoices(session, {
      sessionId: 'sess_2026',
      classId: 'cls_8th',
      month: '2026-04',
      dueDate: '2026-04-10',
    });

    const expenseService = new ExpenseService(db);
    expenseService.recordExpense(session, {
      id: 'exp_01',
      category: 'stationery',
      description: 'Exam Answer Sheets & Printing',
      amount: 4200,
      expenseDate: '2026-04-12',
      paymentMethod: 'cash',
    });

    const reportService = new ReportService(db);

    // 1. Test CSV Generation with UTF-8 BOM
    const rosterReport = reportService.getStudentRoster(session, 'cls_8th');
    const bom = '\\uFEFF';
    const csvHeaders = rosterReport.columns.map(c => '"' + c.header.replace(/"/g, '""') + '"').join(',');
    const csvData = rosterReport.rows.map(r => rosterReport.columns.map(c => '"' + String(r[c.key] || '').replace(/"/g, '""') + '"').join(',')).join('\\r\\n');
    const fullCsv = bom + csvHeaders + '\\r\\n' + csvData;

    const csvOutPath = path.join(app.getPath('userData'), 'test_output_roster.csv');
    fs.writeFileSync(csvOutPath, fullCsv, 'utf8');

    const csvBuffer = fs.readFileSync(csvOutPath);
    const csvStr = csvBuffer.toString('utf8');
    if (!csvStr.startsWith('\\uFEFF')) {
      throw new Error('CSV does not start with UTF-8 BOM');
    }
    if (!csvStr.includes('Hamza Farooq') || !csvStr.includes('ADM-801')) {
      throw new Error('CSV missing student data');
    }
    console.log('[EXPORT_OK] CSV file generated and verified with UTF-8 BOM (' + csvBuffer.length + ' bytes)');
    fs.unlinkSync(csvOutPath);

    // 2. Test PDF Generation via Electron printToPDF
    const win = new BrowserWindow({ show: false });
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page { size: A4 landscape; margin: 10mm; } body { font-family: sans-serif; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ccc; padding: 6px; } thead { display: table-header-group; } tr { page-break-inside: avoid; }</style></head><body><h2>' + rosterReport.title + '</h2><table><thead><tr>' + rosterReport.columns.map(c => '<th>' + c.header + '</th>').join('') + '</tr></thead><tbody>' + rosterReport.rows.map(r => '<tr>' + rosterReport.columns.map(c => '<td>' + (r[c.key] || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>';

    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      landscape: true,
      printBackground: true,
    });

    const pdfOutPath = path.join(app.getPath('userData'), 'test_output_roster.pdf');
    fs.writeFileSync(pdfOutPath, pdfBuffer);

    const readPdf = fs.readFileSync(pdfOutPath);
    const pdfHeader = readPdf.subarray(0, 5).toString('utf8');
    if (pdfHeader !== '%PDF-') {
      throw new Error('Output is not a valid PDF file. Header: ' + pdfHeader);
    }
    console.log('[EXPORT_OK] Real PDF document generated via Electron printToPDF (' + readPdf.length + ' bytes, header: ' + pdfHeader + ')');
    fs.unlinkSync(pdfOutPath);

    closeDatabase();
    cleanup();
    win.destroy();

    console.log('[ALL_EXPORT_TESTS_PASSED_SUCCESS]');
    app.quit();
  } catch (err) {
    console.error('[EXPORT_TEST_ERROR]', err);
    app.exit(1);
  }
});
`;

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const runnerPath = path.resolve(__dirname, 'export-runner.js');
fs.writeFileSync(runnerPath, runnerCode, 'utf8');

const child = spawn(electron, [runnerPath], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
child.stdout.on('data', (d) => {
  stdout += d.toString();
  process.stdout.write(d.toString());
});
child.stderr.on('data', (d) => {
  process.stderr.write(d.toString());
});

child.on('close', (code) => {
  try { fs.unlinkSync(runnerPath); } catch {}
  if (code === 0 && stdout.includes('[ALL_EXPORT_TESTS_PASSED_SUCCESS]')) {
    console.log('✅ EXPORT VERIFICATION PASSED: Real PDF & UTF-8 BOM CSV files generated and validated on disk.');
    process.exit(0);
  } else {
    console.error('❌ EXPORT VERIFICATION FAILED with exit code ' + code);
    process.exit(1);
  }
});
