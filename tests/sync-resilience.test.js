const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations/index');
const { seedDemoData } = require('../dist/main/database/seed');
const { SyncEngine } = require('../dist/main/sync/sync-engine');

const TEST_DB_PATH = path.resolve(__dirname, 'test_sync_resilience.sqlite');

describe('Slice 0 Fix Round 2: Real SQLite & Real SyncEngine Resilience Suite', () => {
  let db;
  let syncEngine;
  let mockApiClient;
  const schoolId = 'sch_01';

  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

    db = new Database(TEST_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations(db, ALL_MIGRATIONS);
    seedDemoData(db);

    // Update sync_device_config with test api_base_url
    db.prepare(`
      UPDATE sync_device_config
      SET api_base_url = 'http://127.0.0.1:4000/api/v1'
      WHERE id = 1
    `).run();
  });

  after(() => {
    if (db) db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  // Helper to create an in-memory mock client with queued changes
  function createMockClient(queuedChanges = []) {
    let cursor = 0;
    return {
      verifyConnectivity: async () => ({ online: true }),
      registerDevice: async () => ({ success: true }),
      pushBatch: async () => ({ success: true, acknowledgedCount: 0, failedCount: 0, conflictCount: 0, events: [], serverTime: new Date().toISOString() }),
      getChanges: async (afterSeq, limit) => {
        const changes = queuedChanges.filter(c => (c.seq || 0) > afterSeq).slice(0, limit);
        return {
          changes,
          hasMore: false,
          minRetainedSeq: 0,
        };
      },
      pullChanges: async (sId, dId, cursors, limit) => ({
        changes: queuedChanges.slice(0, limit),
        serverTime: new Date().toISOString(),
        hasMore: false,
      }),
      startSnapshot: async () => ({ snapshotId: 'snap_test', expiresAt: new Date().toISOString(), entities: [] }),
      getSnapshotPage: async () => ({ items: [], nextCursor: null, hasMore: false }),
    };
  }

  // --------------------------------------------------------------------------
  // (a) ATTENDANCE seq 3 and STUDENT delete seq 4 in the same batch applies cleanly
  // --------------------------------------------------------------------------
  test('5a. ATTENDANCE seq 3 and STUDENT delete seq 4 in the same batch applies cleanly', async () => {
    const studentId = 'std_test_5a';
    const admissionNo = 'ADM-5A-001';
    const sess = db.prepare('SELECT id FROM academic_sessions LIMIT 1').get();
    const cls = db.prepare('SELECT id FROM classes LIMIT 1').get();
    const sec = db.prepare('SELECT id FROM sections LIMIT 1').get();

    // Insert student, enrollment, invoice and payment first
    db.prepare(`
      INSERT INTO students (id, school_id, admission_number, full_name, father_name, status, created_at, updated_at)
      VALUES (?, ?, ?, 'Student FiveA', 'Father FiveA', 'active', datetime('now'), datetime('now'))
    `).run(studentId, schoolId, admissionNo);

    db.prepare(`
      INSERT INTO student_enrollments (id, school_id, student_id, session_id, class_id, section_id, roll_number, status)
      VALUES ('enr_5a', ?, ?, ?, ?, ?, '01', 'enrolled')
    `).run(schoolId, studentId, sess.id, cls.id, sec.id);

    db.prepare(`
      INSERT INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, balance, status)
      VALUES ('inv_5a', ?, 'CH-5A-01', ?, ?, '2026-10', '2026-10-15', 5000, 5000, 'unpaid')
    `).run(schoolId, studentId, sess.id);

    db.prepare(`
      INSERT INTO payments (id, school_id, invoice_id, receipt_number, amount, payment_date)
      VALUES ('pay_5a', ?, 'inv_5a', 'REC-5A-01', 2000, '2026-10-10')
    `).run(schoolId);

    // Batch contains:
    // 1) ATTENDANCE seq 3 for this student
    // 2) STUDENT delete seq 4 for this student
    const changes = [
      {
        changeId: 'chg_3',
        seq: 3,
        entityType: 'ATTENDANCE',
        entityId: 'att_5a_01',
        operation: 'INSERT',
        remoteVersion: 3,
        payload: {
          id: 'att_5a_01',
          schoolId,
          studentId,
          sessionId: sess.id,
          classId: cls.id,
          sectionId: sec.id,
          date: '2026-10-11',
          status: 'present',
        },
      },
      {
        changeId: 'chg_4',
        seq: 4,
        entityType: 'STUDENT',
        entityId: studentId,
        operation: 'DELETE',
        remoteVersion: 4,
        deleted: true,
        payload: {
          id: studentId,
          schoolId,
          admissionNumber: admissionNo,
        },
      },
    ];

    const client = createMockClient(changes);
    const engine = new SyncEngine(db, { apiClient: client });

    const syncRes = await engine.triggerSync();
    assert.strictEqual(syncRes.success, true, 'Sync must succeed');
    assert.strictEqual(syncRes.downloadedCount, 2, 'Must have applied both changes');

    // Verification:
    // Attendance was created at seq 3, but deleted at seq 4 by student tombstone
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    assert.strictEqual(student, undefined, 'Student must be deleted by seq 4 tombstone');

    const att = db.prepare('SELECT * FROM attendance WHERE id = ?').get('att_5a_01');
    assert.strictEqual(att, undefined, 'Attendance must be deleted by student tombstone');

    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get('inv_5a');
    assert.strictEqual(inv, undefined, 'Invoices must be deleted by student tombstone');

    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get('pay_5a');
    assert.strictEqual(pay, undefined, 'Payments must be deleted by student tombstone');

    // Cursor must have advanced to 4
    const cursor = db.prepare('SELECT last_seq FROM sync_school_cursor WHERE school_id = ?').get(schoolId);
    assert.strictEqual(cursor.last_seq, 4, 'Cursor must advance to 4');
  });

  // --------------------------------------------------------------------------
  // (b) the same change delivered twice applies once
  // --------------------------------------------------------------------------
  test('5b. the same change delivered twice applies once', async () => {
    const studentId = 'std_test_5b';
    const admissionNo = 'ADM-5B-001';

    const change = {
      changeId: 'chg_5',
      seq: 5,
      entityType: 'STUDENT',
      entityId: studentId,
      operation: 'INSERT',
      remoteVersion: 5,
      payload: {
        id: studentId,
        schoolId,
        admissionNumber: admissionNo,
        fullName: 'Student FiveB Initial',
        fatherName: 'Father FiveB',
        status: 'active',
      },
    };

    // First delivery: should apply cleanly
    const client1 = createMockClient([change]);
    const engine1 = new SyncEngine(db, { apiClient: client1 });
    const res1 = await engine1.triggerSync();
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.downloadedCount, 1, 'First delivery must download 1 record');

    // Verify stored remote_version in entity_sync_versions
    const versionRow = db.prepare(`
      SELECT remote_version FROM entity_sync_versions
      WHERE school_id = ? AND entity_type = 'STUDENT' AND entity_id = ?
    `).get(schoolId, studentId);
    assert.strictEqual(versionRow.remote_version, 5);

    // Second delivery of the EXACT same change seq 5 (with altered payload to prove it is NOT applied)
    const duplicateChange = {
      ...change,
      payload: {
        ...change.payload,
        fullName: 'Student FiveB OVERWRITTEN - SHOULD NOT HAPPEN',
      },
    };

    // Reset cursor to 0 to simulate re-fetching the change
    db.prepare('UPDATE sync_school_cursor SET last_seq = 0 WHERE school_id = ?').run(schoolId);

    const client2 = createMockClient([duplicateChange]);
    const engine2 = new SyncEngine(db, { apiClient: client2 });
    const res2 = await engine2.triggerSync();
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.downloadedCount, 0, 'Duplicate delivery of seq 5 must be skipped (0 downloaded)');

    // Verify student name was NOT changed
    const std = db.prepare('SELECT full_name FROM students WHERE id = ?').get(studentId);
    assert.strictEqual(std.full_name, 'Student FiveB Initial', 'Duplicate change must not re-apply');
  });

  // --------------------------------------------------------------------------
  // (c) an older change after a newer one is ignored
  // --------------------------------------------------------------------------
  test('5c. an older change after a newer one is ignored', async () => {
    const studentId = 'std_test_5c';
    const admissionNo = 'ADM-5C-001';

    // Step 1: Apply newer change at seq 10
    const newerChange = {
      changeId: 'chg_10',
      seq: 10,
      entityType: 'STUDENT',
      entityId: studentId,
      operation: 'INSERT',
      remoteVersion: 10,
      payload: {
        id: studentId,
        schoolId,
        admissionNumber: admissionNo,
        fullName: 'Newer Name Seq 10',
        fatherName: 'Father FiveC',
        status: 'active',
      },
    };

    const client1 = createMockClient([newerChange]);
    const engine1 = new SyncEngine(db, { apiClient: client1 });
    await engine1.triggerSync();

    const stdAfterNewer = db.prepare('SELECT full_name FROM students WHERE id = ?').get(studentId);
    assert.strictEqual(stdAfterNewer.full_name, 'Newer Name Seq 10');

    // Step 2: An out-of-order older change arrives at seq 7
    const olderChange = {
      changeId: 'chg_7',
      seq: 7,
      entityType: 'STUDENT',
      entityId: studentId,
      operation: 'UPDATE',
      remoteVersion: 7,
      payload: {
        id: studentId,
        schoolId,
        admissionNumber: admissionNo,
        fullName: 'Older Stale Name Seq 7',
        status: 'active',
      },
    };

    // Reset cursor to 0 to simulate receiving the older change
    db.prepare('UPDATE sync_school_cursor SET last_seq = 0 WHERE school_id = ?').run(schoolId);

    const client2 = createMockClient([olderChange]);
    const engine2 = new SyncEngine(db, { apiClient: client2 });
    const res2 = await engine2.triggerSync();
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.downloadedCount, 0, 'Older change must be skipped (0 downloaded)');

    // Verify name remains from seq 10
    const stdAfterOlder = db.prepare('SELECT full_name FROM students WHERE id = ?').get(studentId);
    assert.strictEqual(stdAfterOlder.full_name, 'Newer Name Seq 10', 'Older change must not overwrite newer state');
  });

  // --------------------------------------------------------------------------
  // (d) a late older INSERT after a delete does not resurrect the record
  // --------------------------------------------------------------------------
  test('5d. a late older INSERT after a delete does not resurrect the record', async () => {
    const studentId = 'std_test_5d';
    const admissionNo = 'ADM-5D-001';

    // Step 1: Create student initially
    db.prepare(`
      INSERT INTO students (id, school_id, admission_number, full_name, father_name, status, created_at, updated_at)
      VALUES (?, ?, ?, 'To Be Deleted', 'Father FiveD', 'active', datetime('now'), datetime('now'))
    `).run(studentId, schoolId, admissionNo);

    // Step 2: Receive DELETE tombstone at seq 20
    const deleteChange = {
      changeId: 'chg_20',
      seq: 20,
      entityType: 'STUDENT',
      entityId: studentId,
      operation: 'DELETE',
      remoteVersion: 20,
      deleted: true,
      payload: {
        id: studentId,
        schoolId,
        admissionNumber: admissionNo,
      },
    };

    const client1 = createMockClient([deleteChange]);
    const engine1 = new SyncEngine(db, { apiClient: client1 });
    await engine1.triggerSync();

    // Verify student is deleted and tombstone recorded with seq 20
    assert.strictEqual(db.prepare('SELECT * FROM students WHERE id = ?').get(studentId), undefined);
    const tombstone = db.prepare(`
      SELECT seq FROM sync_tombstones WHERE school_id = ? AND entity_type = 'STUDENT' AND entity_id = ?
    `).get(schoolId, studentId);
    assert.ok(tombstone, 'Tombstone record must exist');
    assert.strictEqual(tombstone.seq, 20);

    // Step 3: A late older INSERT arrives with seq 15
    const lateOlderInsert = {
      changeId: 'chg_15',
      seq: 15,
      entityType: 'STUDENT',
      entityId: studentId,
      operation: 'INSERT',
      remoteVersion: 15,
      payload: {
        id: studentId,
        schoolId,
        admissionNumber: admissionNo,
        fullName: 'Resurrected Ghost Student',
        fatherName: 'Ghost Father',
        status: 'active',
      },
    };

    // Reset cursor to 0 to simulate late replay
    db.prepare('UPDATE sync_school_cursor SET last_seq = 0 WHERE school_id = ?').run(schoolId);

    const client2 = createMockClient([lateOlderInsert]);
    const engine2 = new SyncEngine(db, { apiClient: client2 });
    const res2 = await engine2.triggerSync();
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.downloadedCount, 0, 'Late older insert must be skipped (0 downloaded)');

    // Verify student is STILL NOT resurrected
    const resurrected = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    assert.strictEqual(resurrected, undefined, 'Deleted student must NEVER be resurrected by older insert');
  });

  // --------------------------------------------------------------------------
  // (e) one bad change does not block the others
  // --------------------------------------------------------------------------
  test('5e. one bad change does not block the others', async () => {
    const student1 = 'std_good_5e_1';
    const student2 = 'std_good_5e_2';

    // Set cursor to 29
    db.prepare('UPDATE sync_school_cursor SET last_seq = 29 WHERE school_id = ?').run(schoolId);

    // Batch of 3 changes:
    // 1. Seq 30: Valid student insert
    // 2. Seq 31: Bad change (ATTENDANCE referencing non-existent student/session which fails FK or validation)
    // 3. Seq 32: Valid student insert
    const changes = [
      {
        changeId: 'chg_30',
        seq: 30,
        entityType: 'STUDENT',
        entityId: student1,
        operation: 'INSERT',
        remoteVersion: 30,
        payload: {
          id: student1,
          schoolId,
          admissionNumber: 'ADM-5E-001',
          fullName: 'Good Student 1',
          fatherName: 'Father Good 1',
          status: 'active',
        },
      },
      {
        changeId: 'chg_31',
        seq: 31,
        entityType: 'ATTENDANCE',
        entityId: 'att_bad_invalid',
        operation: 'INSERT',
        remoteVersion: 31,
        payload: {
          id: 'att_bad_invalid',
          schoolId,
          studentId: 'non_existent_student_fk_violation_xyz',
          sessionId: 'non_existent_session_fk_violation_xyz',
          classId: 'non_existent_class_xyz',
          sectionId: 'non_existent_section_xyz',
          date: '2026-10-15',
          status: 'INVALID_STATUS_CHECK_FAIL', // Will throw FOREIGN KEY or CHECK constraint
        },
      },
      {
        changeId: 'chg_32',
        seq: 32,
        entityType: 'STUDENT',
        entityId: student2,
        operation: 'INSERT',
        remoteVersion: 32,
        payload: {
          id: student2,
          schoolId,
          admissionNumber: 'ADM-5E-002',
          fullName: 'Good Student 2',
          fatherName: 'Father Good 2',
          status: 'active',
        },
      },
    ];

    const client = createMockClient(changes);
    const engine = new SyncEngine(db, { apiClient: client });

    const syncRes = await engine.triggerSync();
    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(syncRes.downloadedCount, 2, 'Good changes 30 and 32 must apply');
    assert.strictEqual(syncRes.conflictCount, 1, 'Bad change 31 must be counted as conflict / needs attention');

    // Verify both good students exist in local database
    const s1 = db.prepare('SELECT full_name FROM students WHERE id = ?').get(student1);
    assert.ok(s1, 'Student 1 must exist');
    assert.strictEqual(s1.full_name, 'Good Student 1');

    const s2 = db.prepare('SELECT full_name FROM students WHERE id = ?').get(student2);
    assert.ok(s2, 'Student 2 must exist');
    assert.strictEqual(s2.full_name, 'Good Student 2');

    // Verify cursor advanced to 32 (was NOT blocked by bad change 31)
    const cursor = db.prepare('SELECT last_seq FROM sync_school_cursor WHERE school_id = ?').get(schoolId);
    assert.strictEqual(cursor.last_seq, 32, 'Cursor must advance to 32 past the bad change');

    // Verify status reflects conflict state
    const status = engine.getStatus();
    assert.strictEqual(status.state, 'conflict', 'Status state must be conflict due to rejected change');
    assert.ok(status.unresolvedConflictCount >= 1, 'Unresolved conflict count must be >= 1');
  });

  // --------------------------------------------------------------------------
  // (f) Raw SQL delete outside apply is blocked by triggers while server tombstone apply succeeds
  // --------------------------------------------------------------------------
  test('5f. raw SQL deletes outside sync apply are blocked by triggers while sync apply succeeds', async () => {
    const studentId = 'std_test_5f';
    const admissionNo = 'ADM-5F-001';
    const sess = db.prepare('SELECT id FROM academic_sessions LIMIT 1').get();
    const cls = db.prepare('SELECT id FROM classes LIMIT 1').get();
    const sec = db.prepare('SELECT id FROM sections LIMIT 1').get();

    // 1. Create student, enrollment, invoice and payment
    db.prepare(`
      INSERT INTO students (id, school_id, admission_number, full_name, father_name, status, created_at, updated_at)
      VALUES (?, ?, ?, 'Student FiveF', 'Father FiveF', 'active', datetime('now'), datetime('now'))
    `).run(studentId, schoolId, admissionNo);

    db.prepare(`
      INSERT INTO student_enrollments (id, school_id, student_id, session_id, class_id, section_id, roll_number, status)
      VALUES ('enr_5f', ?, ?, ?, ?, ?, '01', 'enrolled')
    `).run(schoolId, studentId, sess.id, cls.id, sec.id);

    db.prepare(`
      INSERT INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, balance, status)
      VALUES ('inv_5f', ?, 'CH-5F-01', ?, ?, '2026-10', '2026-10-15', 6000, 6000, 'unpaid')
    `).run(schoolId, studentId, sess.id);

    db.prepare(`
      INSERT INTO payments (id, school_id, invoice_id, receipt_number, amount, payment_date)
      VALUES ('pay_5f', ?, 'inv_5f', 'REC-5F-01', 3000, '2026-10-10')
    `).run(schoolId);

    // 2. Assert raw SQL DELETE on payment is blocked by trigger
    assert.throws(
      () => db.prepare('DELETE FROM payments WHERE id = ?').run('pay_5f'),
      /Financial records are immutable: physical deletion of payment receipts is forbidden/,
      'Raw SQL delete on payment must be blocked by trigger'
    );

    // 3. Assert raw SQL DELETE on invoice with payments is blocked by trigger
    assert.throws(
      () => db.prepare('DELETE FROM invoices WHERE id = ?').run('inv_5f'),
      /Cannot delete fee invoice: associated payment history exists/,
      'Raw SQL delete on invoice with payments must be blocked by trigger'
    );

    // 4. Assert raw SQL DELETE on student with financials is blocked by trigger
    assert.throws(
      () => db.prepare('DELETE FROM students WHERE id = ?').run(studentId),
      /Cannot delete student: associated financial invoices and payment records exist/,
      'Raw SQL delete on student with financials must be blocked by trigger'
    );

    // Context table must have flag 0
    const ctxRowBefore = db.prepare('SELECT applying_server_tombstone FROM sync_apply_context WHERE id = 1').get();
    assert.strictEqual(ctxRowBefore.applying_server_tombstone, 0);

    // 5. Remote server tombstone arrives via SyncEngine
    const deleteChange = {
      changeId: 'chg_50',
      seq: 50,
      entityType: 'STUDENT',
      entityId: studentId,
      operation: 'DELETE',
      remoteVersion: 50,
      deleted: true,
      payload: {
        id: studentId,
        schoolId,
        admissionNumber: admissionNo,
      },
    };

    const client = createMockClient([deleteChange]);
    const engine = new SyncEngine(db, { apiClient: client });

    const syncRes = await engine.triggerSync();
    assert.strictEqual(syncRes.success, true, 'Server tombstone sync apply must succeed');
    assert.strictEqual(syncRes.downloadedCount, 1, 'Tombstone change must be applied');

    // Verify all associated records were deleted by server tombstone apply
    assert.strictEqual(db.prepare('SELECT * FROM students WHERE id = ?').get(studentId), undefined);
    assert.strictEqual(db.prepare('SELECT * FROM invoices WHERE id = ?').get('inv_5f'), undefined);
    assert.strictEqual(db.prepare('SELECT * FROM payments WHERE id = ?').get('pay_5f'), undefined);

    // Context table must be reset to 0 in finally
    const ctxRowAfter = db.prepare('SELECT applying_server_tombstone FROM sync_apply_context WHERE id = 1').get();
    assert.strictEqual(ctxRowAfter.applying_server_tombstone, 0, 'Flag must be reset to 0 after apply');

    // 6. Verify triggers remain active for other records
    // Create a real student first to satisfy foreign keys
    const guardStudentId = 'std_guard_student';
    db.prepare(`
      INSERT INTO students (id, school_id, admission_number, full_name, father_name, status, created_at, updated_at)
      VALUES (?, ?, 'ADM-GUARD-99', 'Guard Student', 'Father Guard', 'active', datetime('now'), datetime('now'))
    `).run(guardStudentId, schoolId);

    const otherInvId = 'inv_other_guard';
    db.prepare(`
      INSERT INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, balance, status)
      VALUES (?, ?, 'CH-GUARD-01', ?, ?, '2026-10', '2026-10-15', 1000, 1000, 'unpaid')
    `).run(otherInvId, schoolId, guardStudentId, sess.id);

    db.prepare(`
      INSERT INTO payments (id, school_id, invoice_id, receipt_number, amount, payment_date)
      VALUES ('pay_guard_01', ?, ?, 'REC-GUARD-01', 500, '2026-10-10')
    `).run(schoolId, otherInvId);

    assert.throws(
      () => db.prepare('DELETE FROM payments WHERE id = ?').run('pay_guard_01'),
      /Financial records are immutable: physical deletion of payment receipts is forbidden/,
      'Triggers must remain strictly active after sync apply completes'
    );
  });
});
