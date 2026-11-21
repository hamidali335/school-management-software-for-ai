const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { runMigrations, ALL_MIGRATIONS } = require('../dist/main/database/migrations/index');
const { ReceiptBlockManager } = require('../dist/main/sync/receipt-block-manager');
const { WriteCoordinator } = require('../dist/main/sync/write-coordinator');

describe('Phase 1 Desktop Unit Suite: Migration 012, Receipt Blocks & Offline WriteCoordinator', () => {
  let dbPath;
  let db;

  before(() => {
    dbPath = path.join(os.tmpdir(), `sms_phase1_unit_${Date.now()}.sqlite`);
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    runMigrations(db, ALL_MIGRATIONS);
  });

  after(() => {
    if (db) db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
    }
  });

  it('1. Migration 012 creates receipt_blocks and provisional_receipt_seq tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('receipt_blocks', 'provisional_receipt_seq')")
      .all()
      .map((r) => r.name);
    assert.ok(tables.includes('receipt_blocks'));
    assert.ok(tables.includes('provisional_receipt_seq'));
  });

  it('2. ReceiptBlockManager issues 100 sequential numbers, flags refill at < 30 remaining, then issues PROV-<workstation>-nnnn offline', () => {
    const rbm = new ReceiptBlockManager(db);
    rbm.storeAllocatedBlock('school-1', {
      blockId: 'blk-1',
      deviceId: 'desk_ws09',
      series: '2026',
      prefix: 'RCP',
      rangeStart: 1001,
      rangeEnd: 1100,
    });

    let lastIssued;
    for (let i = 0; i < 71; i++) {
      lastIssued = rbm.issueNextReceiptNumber('school-1', 'desk_ws09', '2026');
    }
    assert.equal(lastIssued.receiptNo, 'RCP-001071');
    assert.equal(lastIssued.isProvisional, false);
    assert.equal(lastIssued.remainingInBlocks, 29);
    assert.equal(lastIssued.needsRefill, true);

    // Exhaust remaining 29 numbers
    for (let i = 0; i < 29; i++) {
      lastIssued = rbm.issueNextReceiptNumber('school-1', 'desk_ws09', '2026');
    }
    assert.equal(lastIssued.receiptNo, 'RCP-001100');
    assert.equal(lastIssued.remainingInBlocks, 0);

    // Next receipt offline MUST be provisional
    const prov1 = rbm.issueNextReceiptNumber('school-1', 'desk_ws09', '2026');
    const prov2 = rbm.issueNextReceiptNumber('school-1', 'desk_ws09', '2026');
    assert.equal(prov1.isProvisional, true);
    assert.match(prov1.receiptNo, /^PROV-WS09-0001$/);
    assert.match(prov2.receiptNo, /^PROV-WS09-0002$/);
  });

  it('3. WriteCoordinator offline ATTENDANCE saves provisional outbox row and recovers processing -> retrying with same idempotency key on restart', async () => {
    const coord = new WriteCoordinator(db);
    let localSaved = false;
    const res = await coord.dispatchMutation({
      entityType: 'ATTENDANCE',
      entityId: 'att-student-1-2026-11-20',
      operation: 'INSERT',
      schoolId: 'school-1',
      isOnline: false,
      payload: { studentId: 'student-1', date: '2026-11-20', status: 'present' },
      executeLocal: () => {
        localSaved = true;
        return { saved: true };
      },
    });
    assert.equal(localSaved, true);
    assert.equal(res.syncStatus, 'pending');
    assert.ok(res.idempotencyKey);

    // Simulate crash while in 'processing'
    db.prepare("UPDATE sync_outbox SET state = 'processing' WHERE operation_id = ?").run(res.operationId);

    // Restart recovery
    const coord2 = new WriteCoordinator(db);
    const row = db.prepare('SELECT state, idempotency_key FROM sync_outbox WHERE operation_id = ?').get(res.operationId);
    assert.equal(row.state, 'retrying');
    assert.equal(row.idempotency_key, res.idempotencyKey);
  });
});
