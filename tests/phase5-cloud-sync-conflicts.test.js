const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations/index');
const { seedDemoData } = require('../dist/main/database/seed');
const { AuthService } = require('../dist/main/services/auth.service');
const { StudentService } = require('../dist/main/services/student.service');
const { FeeService } = require('../dist/main/services/fee.service');
const { AttendanceService } = require('../dist/main/services/attendance.service');
const { SyncEngine } = require('../dist/main/sync/sync-engine');
const { MockSyncBackendAdapter } = require('../dist/main/sync/sync-api-client');
const { ConflictResolver } = require('../dist/main/sync/conflict-resolver');
const {
  recordChange,
  getPendingChangesCount,
  getPendingOutboxEntries,
  markEntriesSynced,
  setApplyingRemoteChanges,
  isApplyingRemoteChanges,
} = require('../dist/main/sync/change-tracker');

const TEST_DB_PATH = path.resolve(__dirname, 'test_phase5_sync.sqlite');

describe('School Management Software — Phase 5 Cloud Sync & Conflict Resolution Suite', () => {
  let db;
  let authService;
  let studentService;
  let feeService;
  let attendanceService;
  let syncEngine;
  let mockAdapter;
  let conflictResolver;

  let adminSession;
  let schoolId;

  before(async () => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

    db = new Database(TEST_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations(db, ALL_MIGRATIONS);
    seedDemoData(db);

    authService = new AuthService(db);
    studentService = new StudentService(db);
    feeService = new FeeService(db);
    attendanceService = new AttendanceService(db);
    conflictResolver = new ConflictResolver(db);

    mockAdapter = new MockSyncBackendAdapter();
    syncEngine = new SyncEngine(db, { apiClient: mockAdapter });

    const loginRes = await authService.login('admin', 'Admin@12345');
    assert.strictEqual(loginRes.success, true);
    adminSession = authService.validateSession(loginRes.token);
    assert.strictEqual(adminSession.isValid, true);
    schoolId = adminSession.schoolId;
  });

  after(() => {
    try {
      syncEngine.stopAutoSync();
      db.close();
      if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch {}
  });

  // --------------------------------------------------------------------------
  // 1. MIGRATION 007 & SYNC METADATA SCHEMA
  // --------------------------------------------------------------------------
  test('1. Migration 007 Schema, Metadata Tables & Outbox Columns', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    assert.ok(tables.includes('sync_device_config'), 'sync_device_config must exist');
    assert.ok(tables.includes('sync_cursors'), 'sync_cursors must exist');
    assert.ok(tables.includes('sync_conflicts'), 'sync_conflicts must exist');
    assert.ok(tables.includes('sync_history'), 'sync_history must exist');
    assert.ok(tables.includes('sync_tombstones'), 'sync_tombstones must exist');
    assert.ok(tables.includes('entity_sync_versions'), 'entity_sync_versions must exist');

    // Verify extended columns in sync_outbox
    const columns = db.prepare("PRAGMA table_info(sync_outbox)").all().map(c => c.name);
    assert.ok(columns.includes('event_id'), 'sync_outbox must have event_id');
    assert.ok(columns.includes('idempotency_key'), 'sync_outbox must have idempotency_key');
    assert.ok(columns.includes('device_id'), 'sync_outbox must have device_id');
    assert.ok(columns.includes('schema_version'), 'sync_outbox must have schema_version');
    assert.ok(columns.includes('local_version'), 'sync_outbox must have local_version');
  });

  // --------------------------------------------------------------------------
  // 2. TRANSACTIONAL ATOMICITY & ROLLBACK PROTECTION
  // --------------------------------------------------------------------------
  test('2. Outbox Mutation Atomicity and Transactional Rollback', () => {
    const initialCount = getPendingChangesCount(db);

    // Rollback test: A transaction that throws must not leave orphan outbox events
    assert.throws(() => {
      const runTx = db.transaction(() => {
        recordChange('TEST_ENTITY', 't_001', 'INSERT', { name: 'Will Fail' }, db);
        throw new Error('Simulated business error forcing rollback');
      });
      runTx();
    }, /Simulated business error/);

    const countAfterRollback = getPendingChangesCount(db);
    assert.strictEqual(countAfterRollback, initialCount, 'Outbox entry must be rolled back with failed transaction');

    // Successful mutation records outbox event atomically
    const runTxSuccess = db.transaction(() => {
      recordChange('ACADEMIC_SESSION', 'sess_test_atom', 'INSERT', { schoolId, id: 'sess_test_atom', name: 'Atomic Test' }, db);
    });
    runTxSuccess();

    assert.strictEqual(getPendingChangesCount(db), initialCount + 1, 'Outbox entry must commit with successful transaction');
  });

  // --------------------------------------------------------------------------
  // 3. DEPENDENCY-AWARE OUTBOX ORDERING
  // --------------------------------------------------------------------------
  test('3. Dependency-Aware Outbox Ordering (Parents Before Children)', () => {
    // Record dependent entities out of order: Payment -> Invoice -> Student
    recordChange('PAYMENT', 'pay_dep_01', 'INSERT', { schoolId, invoiceId: 'inv_dep_01', amount: 5000 }, db);
    recordChange('INVOICE', 'inv_dep_01', 'INSERT', { schoolId, studentId: 'std_dep_01', amount: 5000 }, db);
    recordChange('STUDENT', 'std_dep_01', 'INSERT', { schoolId, fullName: 'Ali Raza' }, db);

    const pending = getPendingOutboxEntries(50, db);
    const types = pending.map(p => p.entityType);

    const studentIdx = types.lastIndexOf('STUDENT');
    const invoiceIdx = types.lastIndexOf('INVOICE');
    const paymentIdx = types.lastIndexOf('PAYMENT');

    assert.ok(studentIdx < invoiceIdx, 'STUDENT must be ordered before INVOICE');
    assert.ok(invoiceIdx < paymentIdx, 'INVOICE must be ordered before PAYMENT');
  });

  // --------------------------------------------------------------------------
  // 4. CLEAN UPLOAD BATCH PROCESSING & SERVER ACKNOWLEDGEMENT
  // --------------------------------------------------------------------------
  test('4. Upload Batch Processing, Idempotency & Acknowledgment [mocked network]', async () => {
    const pendingBefore = getPendingChangesCount(db);
    assert.ok(pendingBefore > 0, 'There should be pending changes to push');

    const result = await syncEngine.triggerSync();
    assert.strictEqual(result.success, true, 'Sync trigger must succeed');
    assert.ok(result.uploadedCount > 0, 'Should have uploaded pending entries');

    // Outbox status should now be synced
    const pendingAfter = getPendingChangesCount(db);
    assert.strictEqual(pendingAfter, 0, 'All successfully uploaded entries must be marked synced');

    // Server should have received the entities in its mock store
    assert.ok(mockAdapter.mockRemoteStore.size > 0, 'Remote store must contain pushed entities');

    // Repeat trigger must be completely idempotent
    const repeatResult = await syncEngine.triggerSync();
    assert.strictEqual(repeatResult.success, true);
    assert.strictEqual(repeatResult.uploadedCount, 0, 'Repeat sync should upload 0 items');
  });

  // --------------------------------------------------------------------------
  // 5. INCREMENTAL DOWNLOAD & LOOPBACK PREVENTION
  // --------------------------------------------------------------------------
  test('5. Incremental Download and Loopback Prevention [mocked network]', async () => {
    // 1. Inject a remote change from web portal (e.g. cloud admin updated school motto)
    mockAdapter.injectRemoteChange(
      schoolId,
      'SCHOOL_SETTINGS',
      schoolId,
      'UPDATE',
      { motto: 'Excellence in Academic Leadership (Cloud Updated)' }
    );

    // Initial outbox count
    const outboxBefore = getPendingChangesCount(db);

    // Trigger sync
    const res = await syncEngine.triggerSync();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.downloadedCount, 1, 'Should have downloaded the remote change');

    // Verify local SQLite updated with remote data
    const settings = db.prepare('SELECT motto FROM school_settings WHERE school_id = ?').get(schoolId);
    assert.strictEqual(settings.motto, 'Excellence in Academic Leadership (Cloud Updated)');

    // LOOP PREVENTION TEST: Downloading a remote change must NOT generate a local outbox entry!
    const outboxAfter = getPendingChangesCount(db);
    assert.strictEqual(outboxAfter, outboxBefore, 'Applying downloaded changes must not generate new upload events');
  });

  // --------------------------------------------------------------------------
  // 6. CONFLICT DETECTION & MANUAL RESOLUTION
  // --------------------------------------------------------------------------
  test('6. Conflict Detection on Divergent Edits & Manual Resolution [mocked network]', async () => {
    const studentId = `std_conf_${Date.now()}`;
    studentService.admitStudent(adminSession, {
      id: studentId,
      admissionNumber: `ADM-CNF-${Date.now()}`,
      fullName: 'Bilal Ahmed',
      fatherName: 'Ahmed Bilal',
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      sectionId: 'sec_cls_10_0',
      phone: '0300-1112233',
      address: 'Local Campus Lane, Lahore',
    });

    // Push local student so server has version 1
    await syncEngine.triggerSync();

    // Now modify student locally to version 2
    db.prepare('UPDATE students SET phone = ?, address = ? WHERE id = ?').run(
      '0300-8888888',
      'Gulberg III (Local Edit)',
      studentId
    );
    recordChange('STUDENT', studentId, 'UPDATE', { id: studentId, phone: '0300-8888888', address: 'Gulberg III (Local Edit)' }, db);

    // Inject concurrent divergent modification from cloud web portal
    mockAdapter.injectRemoteChange(
      schoolId,
      'STUDENT',
      studentId,
      'UPDATE',
      {
        id: studentId,
        fullName: 'Bilal Ahmed',
        fatherName: 'Ahmed Bilal',
        phone: '0321-9999999', // CONFLICTING PHONE!
        address: 'DHA Phase 5 (Remote Edit)', // CONFLICTING ADDRESS!
        status: 'active',
      },
      2
    );

    // Run sync: conflict detector should flag divergent modification
    const syncRes = await syncEngine.triggerSync();
    assert.strictEqual(syncRes.conflictCount, 1, 'Must detect 1 conflict');

    // Verify conflict logged in sync_conflicts
    const conflicts = conflictResolver.listConflicts(schoolId, 'unresolved');
    assert.ok(conflicts.length >= 1);
    const targetCnf = conflicts.find(c => c.entityId === studentId);
    assert.ok(targetCnf, 'Conflict must exist for student');
    assert.strictEqual(targetCnf.status, 'unresolved');

    // Local data remains safe and preserved before resolution
    const studentLocal = db.prepare('SELECT phone, address FROM students WHERE id = ?').get(studentId);
    assert.strictEqual(studentLocal.phone, '0300-8888888');

    // Admin resolves conflict choosing 'remote_wins'
    const resolveRes = conflictResolver.resolveConflict(
      schoolId,
      targetCnf.id,
      'remote_wins',
      'Administrator',
      'Accepted remote phone number from parent portal'
    );
    assert.strictEqual(resolveRes.success, true);
    assert.strictEqual(resolveRes.appliedPayload.phone, '0321-9999999');

    // Verify status updated to resolved
    const updatedCnf = conflictResolver.listConflicts(schoolId, 'resolved').find(c => c.id === targetCnf.id);
    assert.strictEqual(updatedCnf.status, 'resolved');
    assert.strictEqual(updatedCnf.resolutionStrategy, 'remote_wins');
  });

  // --------------------------------------------------------------------------
  // 7. GUARDIAN CONFLICT & SINGLE ACTIVE GUARDIAN INVARIANT
  // --------------------------------------------------------------------------
  test('7. Guardian Conflict Preserves Single Active Guardian Invariant [mocked network]', async () => {
    const stdId = `std_gdn_conf_${Date.now()}`;
    studentService.admitStudent(adminSession, {
      id: stdId,
      admissionNumber: `ADM-GDN-${Date.now()}`,
      fullName: 'Zainab Fatima',
      fatherName: 'Fatima Jinnah',
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      sectionId: 'sec_cls_10_0',
      phone: '0300-4445555',
      guardian: {
        fullName: 'Original Guardian',
        relationship: 'mother',
        phone: '0300-4445555',
      },
    });

    await syncEngine.triggerSync();

    // Inject remote guardian replacement from web portal
    mockAdapter.injectRemoteChange(
      schoolId,
      'STUDENT_GUARDIAN',
      `gdn_remote_${stdId}`,
      'INSERT',
      {
        id: `gdn_remote_${stdId}`,
        studentId: stdId,
        fullName: 'New Remote Guardian',
        relationship: 'uncle',
        phone: '0333-7778889',
        isActive: true,
      },
      2
    );

    // Sync downloaded guardian
    const res = await syncEngine.triggerSync();
    assert.strictEqual(res.success, true);

    // INVARIANT ASSERTION: Exactly ONE guardian must have is_active = 1
    const activeGuardians = db.prepare(`
      SELECT * FROM student_guardians WHERE school_id = ? AND student_id = ? AND is_active = 1
    `).all(schoolId, stdId);

    assert.strictEqual(activeGuardians.length, 1, 'Database MUST have exactly 1 active guardian');
    assert.strictEqual(activeGuardians[0].full_name, 'New Remote Guardian');

    // Previous guardian must be archived
    const archived = db.prepare(`
      SELECT * FROM student_guardians WHERE school_id = ? AND student_id = ? AND is_active = 0
    `).all(schoolId, stdId);
    assert.ok(archived.length >= 1, 'Previous guardian must be preserved in history');
  });

  // --------------------------------------------------------------------------
  // 8. FINANCIAL LEDGER IMMUTABILITY & REVERSAL PROTECTION
  // --------------------------------------------------------------------------
  test('8. Financial Ledger Immutability, Additive Reconciliation & Reversals [mocked network]', async () => {
    // 1. Create invoice
    const invId = `inv_fin_${Date.now()}`;
    db.prepare(`
      INSERT INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, previous_dues, paid_amount, balance, status, created_at, updated_at)
      VALUES (?, ?, 'CH-FIN-01', 'std_01', 'sess_2026_27', 'January 2027', '2027-01-10', 10000, 0, 0, 10000, 'unpaid', datetime('now'), datetime('now'))
    `).run(invId, schoolId);

    // 2. Client collects a payment of 4000
    feeService.collectFeePayment(adminSession, {
      id: `pay_fin_01_${Date.now()}`,
      invoiceId: invId,
      receiptNumber: `REC-FIN-01-${Date.now()}`,
      amount: 4000,
      paymentDate: '2027-01-05',
      paymentMethod: 'cash',
    });

    // 3. Server reports concurrent remote update to the invoice
    mockAdapter.injectRemoteChange(
      schoolId,
      'INVOICE',
      invId,
      'UPDATE',
      {
        id: invId,
        amount: 10000,
        paid_amount: 4000,
        balance: 6000,
        status: 'unpaid',
      },
      2
    );

    // 4. Sync triggers: additive financial resolution
    const syncRes = await syncEngine.triggerSync();
    assert.strictEqual(syncRes.success, true);

    // Payments cannot be overwritten or deleted
    const invoice = db.prepare('SELECT amount, paid_amount, balance FROM invoices WHERE id = ?').get(invId);
    assert.strictEqual(invoice.balance, 6000, 'Balance must remain 6000');
    assert.strictEqual(invoice.paid_amount, 4000, 'Paid amount must remain 4000');
  });

  // --------------------------------------------------------------------------
  // 9. OFFLINE RESILIENCE & RECOVERY
  // --------------------------------------------------------------------------
  test('9. Offline Resilience, Queued Operations and Automatic Recovery [mocked network]', async () => {
    // 1. Simulate network disconnect
    mockAdapter.isOnline = false;
    syncEngine.setNetworkState('offline');

    // Trigger sync while offline: must return clean offline error without crashing
    const offRes = await syncEngine.triggerSync();
    assert.strictEqual(offRes.success, false);
    assert.ok(offRes.error.includes('offline'));

    // 2. Perform local operations while offline
    const attendanceRes = attendanceService.recordDailyAttendance(adminSession, [
      {
        id: `att_off_${Date.now()}`,
        studentId: 'std_01',
        sessionId: 'sess_2026_27',
        classId: 'cls_10',
        sectionId: 'sec_cls_10_0',
        date: '2027-01-15',
        status: 'present',
        remarks: 'Recorded completely offline',
      },
    ]);
    assert.strictEqual(attendanceRes.recordedCount, 1);

    const pendingOffline = getPendingChangesCount(db);
    assert.ok(pendingOffline > 0, 'Mutations must queue in outbox while offline');

    // 3. Restore Network Connectivity
    mockAdapter.isOnline = true;
    syncEngine.setNetworkState('online');

    // 4. Trigger sync: must recover and upload all queued offline operations
    const recoveryRes = await syncEngine.triggerSync();
    assert.strictEqual(recoveryRes.success, true);
    assert.ok(recoveryRes.uploadedCount >= 1, 'Must upload all queued offline mutations');

    assert.strictEqual(getPendingChangesCount(db), 0, 'All offline changes successfully synced on reconnection');
  });

  // --------------------------------------------------------------------------
  // 10. END-TO-END INTEGRATION WORKFLOW
  // --------------------------------------------------------------------------
  test('10. Comprehensive End-to-End Bidirectional School Sync Workflow [mocked network]', async () => {
    const e2eStdId = `std_e2e_${Date.now()}`;

    // Step 1: Local Offline Student Admission & Guardian Creation
    studentService.admitStudent(adminSession, {
      id: e2eStdId,
      admissionNumber: `ADM-E2E-${Date.now()}`,
      fullName: 'Kamran Akmal',
      fatherName: 'Akmal Khan',
      sessionId: 'sess_2026_27',
      classId: 'cls_10',
      sectionId: 'sec_cls_10_0',
      phone: '0300-7771122',
      guardian: {
        fullName: 'Akmal Khan',
        relationship: 'father',
        phone: '0300-7771122',
      },
    });

    // Step 2: Push changes to central backend
    const pushRes = await syncEngine.triggerSync();
    assert.strictEqual(pushRes.success, true);
    assert.ok(pushRes.uploadedCount >= 3, 'Must push student, enrollment, and guardian');

    // Step 3: Remote portal creates a new Fee Structure on server
    const remoteFsId = `fs_e2e_remote_${Date.now()}`;
    mockAdapter.injectRemoteChange(
      schoolId,
      'FEE_STRUCTURE',
      remoteFsId,
      'INSERT',
      {
        id: remoteFsId,
        sessionId: 'sess_2026_27',
        classId: 'cls_10',
        name: 'Computer Science Lab Fee',
        tuitionFee: 1500,
        examFee: 200,
        miscFee: 100,
        dueDay: 15,
      }
    );

    // Step 4: Pull remote changes into desktop SQLite
    const pullRes = await syncEngine.triggerSync();
    assert.strictEqual(pullRes.success, true);
    assert.strictEqual(pullRes.downloadedCount, 1);

    // Step 5: Verify Fee Structure physically exists in local SQLite
    const localFs = db.prepare('SELECT name, tuition_fee FROM fee_structures WHERE id = ?').get(remoteFsId);
    assert.ok(localFs, 'Remote fee structure must now exist in local SQLite');
    assert.strictEqual(localFs.name, 'Computer Science Lab Fee');
    assert.strictEqual(localFs.tuition_fee, 1500);

    // Step 6: Verify Sync History Log
    const history = syncEngine.getSyncHistory(schoolId, 5);
    assert.ok(history.length >= 2, 'History must contain recent execution logs');
    assert.ok(history[0].run_id !== undefined);
  });
});
