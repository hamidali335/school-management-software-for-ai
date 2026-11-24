const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { runMigrations, ALL_MIGRATIONS } = require('../dist/main/database/migrations/index');
const { WriteCoordinator } = require('../dist/main/sync/write-coordinator');
const { SyncManager } = require('../dist/main/sync/sync-manager');

describe('Server-First, Offline Fallback & Automatic Reconnect Sync Suite', () => {
  let db;
  let dbPath;

  before(() => {
    dbPath = path.join(os.tmpdir(), `sms-server-first-test-${Date.now()}.db`);
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db, ALL_MIGRATIONS);

    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM sync_device_config').run();
    db.prepare('DELETE FROM installation_config').run();
    db.prepare(`
      INSERT INTO installation_config (id, installation_id, school_id, school_name, school_code, currency, provisioned_at, updated_at)
      VALUES (1, 'inst_sf_01', 'school_sf_01', 'Apex Grammar School', 'APEX', 'PKR', datetime('now'), datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO sync_device_config (id, school_id, device_id, device_name, api_base_url, device_status, registered_at, updated_at)
      VALUES (1, 'school_sf_01', 'dev_sf_01', 'Admin-PC', 'http://127.0.0.1:4099/api/v1', 'registered', datetime('now'), datetime('now'))
    `).run();
    db.pragma('foreign_keys = ON');
  });

  after(() => {
    try { db.close(); } catch {}
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(`${dbPath}-wal`); } catch {}
    try { fs.unlinkSync(`${dbPath}-shm`); } catch {}
  });

  it('1. Server-First Online Mode: pushes mutation to backend first and confirms locally', async () => {
    const pushedEvents = [];
    const mockClient = {
      async pushBatch(schoolId, deviceId, events) {
        pushedEvents.push(...events);
        return {
          events: events.map((e) => ({
            eventId: e.eventId,
            entityId: e.entityId,
            status: 'synced',
            serverVersion: 2,
          })),
        };
      },
      async verifyConnectivity() { return { online: true }; },
    };

    const wc = new WriteCoordinator(db, mockClient);
    let localCalledWith = null;

    const res = await wc.dispatchMutation({
      entityType: 'STUDENT',
      entityId: 'stu_online_01',
      operation: 'INSERT',
      payload: { firstName: 'Amina', lastName: 'Tariq', admissionNo: 'ADM-2026-001' },
      schoolId: 'school_sf_01',
      isOnline: true,
      executeLocal: (isConfirmed) => {
        localCalledWith = isConfirmed;
        return { id: 'stu_online_01', synced: isConfirmed };
      },
    });

    assert.strictEqual(res.syncStatus, 'confirmed');
    assert.strictEqual(res.serverVersion, 2);
    assert.strictEqual(localCalledWith, true);
    assert.strictEqual(res.result.id, 'stu_online_01');
    assert.strictEqual(pushedEvents.length, 1);

    const outboxRow = db.prepare('SELECT state, status FROM sync_outbox WHERE operation_id = ?').get(res.operationId);
    assert.strictEqual(outboxRow.state, 'synced');
  });

  it('2. Offline Fallback on Backend Outage: saves locally and queues durable retrying outbox row', async () => {
    const failingClient = {
      async pushBatch() {
        throw new Error('ECONNREFUSED: Central backend unreachable');
      },
      async verifyConnectivity() { return { online: false }; },
    };

    const wc = new WriteCoordinator(db, failingClient);
    let localCalledWith = null;

    const res = await wc.dispatchMutation({
      entityType: 'STUDENT',
      entityId: 'stu_offline_02',
      operation: 'INSERT',
      payload: { firstName: 'Bilal', lastName: 'Ahmed', admissionNo: 'ADM-2026-002' },
      schoolId: 'school_sf_01',
      isOnline: true,
      executeLocal: (isConfirmed) => {
        localCalledWith = isConfirmed;
        return { id: 'stu_offline_02', provisional: !isConfirmed };
      },
    });

    assert.strictEqual(res.syncStatus, 'pending');
    assert.strictEqual(localCalledWith, false);
    assert.ok(res.result && res.result.id === 'stu_offline_02', 'Fallback must return locally saved record');
    assert.ok(res.idempotencyKey && res.idempotencyKey.startsWith('idemp_STUDENT_'));

    const outboxRow = db.prepare('SELECT state, attempt_count, idempotency_key FROM sync_outbox WHERE operation_id = ?').get(res.operationId);
    assert.strictEqual(outboxRow.state, 'retrying');
    assert.strictEqual(outboxRow.attempt_count, 1);
    assert.strictEqual(outboxRow.idempotency_key, res.idempotencyKey);
  });

  it('3. Crash & Restart Recovery: in-flight processing rows recover to retrying with identical idempotency_key', () => {
    const opId = 'op_crash_recovery_01';
    const idempKey = 'idemp_PAYMENT_pay_01_fixed';
    db.prepare(`
      INSERT INTO sync_outbox (
        operation_id, idempotency_key, school_id, entity_type, entity_id,
        base_version, payload_json, state, status, attempt_count, created_at
      ) VALUES (?, ?, 'school_sf_01', 'PAYMENT', 'pay_01', 1, '{"amount":5000}', 'processing', 'processing', 1, datetime('now'))
    `).run(opId, idempKey);

    new WriteCoordinator(db);

    const recovered = db.prepare('SELECT state, idempotency_key FROM sync_outbox WHERE operation_id = ?').get(opId);
    assert.strictEqual(recovered.state, 'retrying');
    assert.strictEqual(recovered.idempotency_key, idempKey);
  });

  it('4. Validation / Business Rule Rejection (HTTP 422): marks needs_attention without falling back locally', async () => {
    const rejectingClient = {
      async pushBatch(schoolId, deviceId, events) {
        return {
          events: events.map((e) => ({
            eventId: e.eventId,
            entityId: e.entityId,
            status: 'rejected',
            errorMessage: 'Duplicate admission number',
          })),
        };
      },
      async verifyConnectivity() { return { online: true }; },
    };

    const wc = new WriteCoordinator(db, rejectingClient);
    let localCalled = false;

    await assert.rejects(
      () => wc.dispatchMutation({
        entityType: 'STUDENT',
        entityId: 'stu_dup_03',
        operation: 'INSERT',
        payload: { admissionNo: 'ADM-2026-001' },
        schoolId: 'school_sf_01',
        isOnline: true,
        executeLocal: () => {
          localCalled = true;
          return { id: 'stu_dup_03' };
        },
      }),
      /Duplicate admission number/
    );

    assert.strictEqual(localCalled, false);
    const row = db.prepare("SELECT state FROM sync_outbox WHERE entity_id = 'stu_dup_03'").get();
    assert.strictEqual(row.state, 'needs_attention');
  });

  it('5. SyncManager Reconnect Detection: distinguishes backend availability and transitions cleanly', () => {
    const manager = new SyncManager();
    const mockClient = {
      async verifyConnectivity() { return { online: true }; },
    };
    manager.resetEngineForTesting(db, mockClient);

    manager.setNetworkState('offline');
    assert.strictEqual(manager.getStatus().network, 'offline');
    assert.strictEqual(manager.getStatus().state, 'offline');

    manager.setNetworkState('online');
    assert.strictEqual(manager.getStatus().network, 'online');
  });
});
