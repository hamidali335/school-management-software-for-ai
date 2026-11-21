const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { runMigrations, ALL_MIGRATIONS } = require('../dist/main/database/migrations/index');
const { ExportBuilderService } = require('../dist/main/services/export-builder.service');
const { PermissionSnapshotService } = require('../dist/main/security/permission-snapshot.service');
const { BackupService } = require('../dist/main/services/backup.service');

describe('Phase 3 Desktop Suite: Real Exports (PDF/CSV/XLSX), Encrypted Outbox Backup & Permission Snapshot Expiry', () => {
  let tmpDir;
  let dbPath;
  let db;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms_phase3_'));
    dbPath = path.join(tmpDir, 'test.sqlite');
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    runMigrations(db, ALL_MIGRATIONS);
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1. Generates valid PDF, RFC 4180 CSV, and true OOXML .xlsx workbook and verifies file contents on disk', () => {
    const sample = {
      title: 'Fee Collection Report',
      sheetName: 'Fees',
      headers: ['Receipt', 'Student', 'Amount'],
      rows: [
        ['RCP-000001', 'Ali, Khan "Sr"', 5000],
        ['PROV-WS01-0001', 'Sara Ahmed', 3500],
      ],
    };

    const pdfBuf = ExportBuilderService.buildPdf(sample);
    const pdfPath = path.join(tmpDir, 'report.pdf');
    fs.writeFileSync(pdfPath, pdfBuf);
    const pdfText = fs.readFileSync(pdfPath, 'utf8');
    assert.ok(pdfText.startsWith('%PDF-1.4'));
    assert.ok(pdfText.includes('Fee Collection Report'));
    assert.ok(pdfText.trim().endsWith('%%EOF'));

    const csvBuf = ExportBuilderService.buildCsv(sample);
    const csvPath = path.join(tmpDir, 'report.csv');
    fs.writeFileSync(csvPath, csvBuf);
    const csvText = fs.readFileSync(csvPath, 'utf8');
    assert.ok(csvText.includes('"Ali, Khan ""Sr"""'));
    assert.ok(csvText.includes('PROV-WS01-0001'));

    const xlsxBuf = ExportBuilderService.buildXlsx(sample);
    const xlsxPath = path.join(tmpDir, 'report.xlsx');
    fs.writeFileSync(xlsxPath, xlsxBuf);
    const readXlsx = fs.readFileSync(xlsxPath);
    assert.equal(readXlsx[0], 0x50);
    assert.equal(readXlsx[1], 0x4b);
    assert.equal(readXlsx[2], 0x03);
    assert.equal(readXlsx[3], 0x04);
    assert.ok(readXlsx.includes(Buffer.from('[Content_Types].xml')));
    assert.ok(readXlsx.includes(Buffer.from('xl/worksheets/sheet1.xml')));
  });

  it('2. Permission snapshot expiry enforces read-only mode (24-168h, default 72h) while keeping backup and export available', () => {
    const pss = new PermissionSnapshotService(db);
    assert.equal(PermissionSnapshotService.clampMaxAgeHours(undefined), 72);
    assert.equal(PermissionSnapshotService.clampMaxAgeHours(5), 24);
    assert.equal(PermissionSnapshotService.clampMaxAgeHours(500), 168);

    const issued80hAgo = new Date(Date.now() - 80 * 3600 * 1000).toISOString();
    pss.saveSnapshot({
      schoolId: 'school-1',
      userId: 'user-1',
      role: 'accountant',
      permissions: ['fees:collect', 'core.backup', 'core.export'],
      maxAgeHours: 72,
      issuedAt: issued80hAgo,
    });

    const ev = pss.evaluateSnapshot('school-1', 'user-1');
    assert.equal(ev.expired, true);
    assert.equal(ev.readOnly, true);
    assert.equal(ev.canWrite, false);
    assert.equal(ev.canSync, false);
    assert.equal(ev.canBackup, true);
    assert.equal(ev.canExport, true);

    assert.throws(() => pss.assertWriteAllowed('school-1', 'user-1', 'fees:collect'), /PERMISSION_SNAPSHOT_EXPIRED/);
    assert.doesNotThrow(() => pss.assertWriteAllowed('school-1', 'user-1', 'core.backup'));
    assert.doesNotThrow(() => pss.assertWriteAllowed('school-1', 'user-1', 'core.export'));
  });

  it('3. Encrypted outbox backup preserves unsynchronized outbox rows without plaintext leakage', () => {
    db.prepare(`
      INSERT INTO sync_outbox (operation_id, idempotency_key, school_id, entity_type, entity_id, operation, payload, state)
      VALUES ('op_bak_1', 'idemp_bak_1', 'school-1', 'PAYMENT', 'txn_1', 'INSERT', '{"amount":500}', 'pending')
    `).run();

    const backupSvc = new BackupService(db, dbPath);
    const snap = backupSvc.exportEncryptedOutboxSnapshot('test-passphrase-123');
    assert.equal(snap.rowCount, 1);
    assert.ok(Buffer.isBuffer(snap.encryptedBuffer));
    assert.ok(snap.encryptedBuffer.length > 32);
    assert.equal(snap.encryptedBuffer.includes(Buffer.from('idemp_bak_1')), false);
  });
});
