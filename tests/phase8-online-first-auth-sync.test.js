const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations/index');
const { AuthService } = require('../dist/main/services/auth.service');
const { InstallationService } = require('../dist/main/services/installation.service');
const { OnlineSyncDispatcher } = require('../dist/main/sync/online-sync-dispatcher');
const { MockSyncBackendAdapter } = require('../dist/main/sync/sync-api-client');
const { getPendingChangesCount, recordChange } = require('../dist/main/sync/change-tracker');

const TEST_DB_PATH = path.resolve(__dirname, 'test_phase8_online_sync.sqlite');

describe('School Management Software — Phase 8 Online-First Auth & Sync Architecture Verification', () => {
  let db;
  let authService;
  let installService;
  let mockServer;
  let mockServerPort = 0;
  let mockBackendUrl = '';
  let serverAuthSuccess = true;
  let serverSyncSuccess = true;

  before(async () => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

    db = new Database(TEST_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations(db, ALL_MIGRATIONS);

    authService = new AuthService(db);
    installService = new InstallationService(db);

    // Create an ephemeral HTTP mock server mimicking School-OS Cloud Backend
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const parsed = body ? JSON.parse(body) : {};

        // Mock /api/v1/auth/login
        if (req.url && req.url.includes('/auth/login')) {
          if (!serverAuthSuccess) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid cloud credentials or inactive account' }));
            return;
          }
          if (parsed.email === 'principal@iqbalhigh.edu.pk' && parsed.password === 'ValidPass@123') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              user: {
                _id: 'usr_cloud_principal_001',
                name: 'Professor Aslam Iqbal',
                email: 'principal@iqbalhigh.edu.pk',
                username: 'aslam_iqbal',
                role: 'principal',
                status: 'active',
              },
              school: {
                _id: 'sch_cloud_iqbal_high',
                name: 'Allama Iqbal Public High School',
                code: 'AIPHS',
              },
              accessToken: 'mock_jwt_access_token_xyz',
              refreshToken: 'mock_jwt_refresh_token_xyz',
              permissions: ['students:view', 'students:manage', 'fees:view', 'fees:manage'],
            }));
            return;
          } else if (parsed.email === 'different@otherschool.edu.pk') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              user: {
                _id: 'usr_different_school',
                name: 'Other Principal',
                email: 'different@otherschool.edu.pk',
                role: 'principal',
                status: 'active',
              },
              school: {
                _id: 'sch_different_unrelated_school',
                name: 'Different Unrelated Academy',
                code: 'DUA',
              },
              accessToken: 'mock_jwt_diff_token',
              permissions: ['students:view'],
            }));
            return;
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid email or password' }));
            return;
          }
        }

        // Mock /api/v1/licensing/activate
        if (req.url && req.url.includes('/licensing/activate')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            data: {
              active: true,
              plan: 'professional',
              schoolName: 'Allama Iqbal Public High School',
              offlineGraceDays: 30,
            },
          }));
          return;
        }

        // Mock 404 for other endpoints
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });
    });

    await new Promise((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        mockServerPort = mockServer.address().port;
        mockBackendUrl = `http://127.0.0.1:${mockServerPort}/api/v1`;
        resolve();
      });
    });
  });

  after(() => {
    if (mockServer) mockServer.close();
    if (db) db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  describe('1. SaaS School Identity & Workstation Provisioning', () => {
    test('Unprovisioned workstation denies offline authentication', async () => {
      assert.strictEqual(installService.isProvisioned(), false);
      await assert.rejects(
        async () => {
          await authService.loginOnlineFirst({
            identifier: 'principal@iqbalhigh.edu.pk',
            password: 'ValidPass@123',
            backendUrl: 'http://127.0.0.1:1', // Unreachable port to force offline check
          });
        },
        /Workstation activation requires an active internet connection/
      );
    });

    test('Cloud rejection refuses activation without writing local records', async () => {
      await assert.rejects(
        async () => {
          await authService.loginOnlineFirst({
            identifier: 'principal@iqbalhigh.edu.pk',
            password: 'WrongPassword!',
            backendUrl: mockBackendUrl,
          });
        },
        /Invalid email or password/
      );
      assert.strictEqual(installService.isProvisioned(), false);
    });

    test('Valid cloud login provisions workstation with SaaS school identity and scrypt verifier', async () => {
      const result = await authService.loginOnlineFirst({
        identifier: 'principal@iqbalhigh.edu.pk',
        password: 'ValidPass@123',
        backendUrl: mockBackendUrl,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.isOnline, true);
      assert.strictEqual(result.schoolName, 'Allama Iqbal Public High School');
      assert.strictEqual(result.user.name, 'Professor Aslam Iqbal');
      assert.strictEqual(result.user.schoolId, 'sch_cloud_iqbal_high');
      assert.strictEqual(installService.isProvisioned(), true);

      const installation = installService.getInstallation();
      assert.strictEqual(installation.schoolId, 'sch_cloud_iqbal_high');
      assert.strictEqual(installation.schoolName, 'Allama Iqbal Public High School');
    });

    test('Offline fallback succeeds using stored salted scrypt verifier when cloud unreachable', async () => {
      const offlineResult = await authService.loginOnlineFirst({
        identifier: 'principal@iqbalhigh.edu.pk',
        password: 'ValidPass@123',
        backendUrl: 'http://127.0.0.1:1', // Simulated network outage
      });

      assert.strictEqual(offlineResult.success, true);
      assert.strictEqual(offlineResult.isOnline, false);
      assert.strictEqual(offlineResult.user.id, 'usr_cloud_principal_001');
      assert.strictEqual(offlineResult.schoolName, 'Allama Iqbal Public High School');
    });

    test('Offline login with incorrect password is denied with lock-tracking', async () => {
      await assert.rejects(
        async () => {
          await authService.loginOnlineFirst({
            identifier: 'principal@iqbalhigh.edu.pk',
            password: 'BadPassword@456',
            backendUrl: 'http://127.0.0.1:1',
          });
        },
        /Invalid email\/username or password/
      );
    });

    test('Data isolation violation prevents unrelated school cloud accounts from accessing workstation', async () => {
      await assert.rejects(
        async () => {
          await authService.loginOnlineFirst({
            identifier: 'different@otherschool.edu.pk',
            password: 'ValidPass@123',
            backendUrl: mockBackendUrl,
          });
        },
        /Data isolation violation: This workstation is provisioned for/
      );
    });
  });

  describe('2. Online-First Synchronization Dispatcher (SERVER FIRST -> LOCAL SQLITE)', () => {
    let mockSyncAdapter;
    let dispatcher;
    let pushBatchCallCount = 0;

    before(() => {
      mockSyncAdapter = new MockSyncBackendAdapter();
      // Intercept pushBatch to count calls and verify server-first behavior
      const originalPush = mockSyncAdapter.pushBatch.bind(mockSyncAdapter);
      mockSyncAdapter.pushBatch = async (...args) => {
        pushBatchCallCount++;
        return originalPush(...args);
      };
      dispatcher = new OnlineSyncDispatcher(db, mockSyncAdapter);
    });

    test('Online mutation commits to cloud first, then local SQLite with ZERO outbox entries [mocked network]', async () => {
      const initialOutbox = getPendingChangesCount(db);

      const entityId = 'stu_online_test_001';
      const payload = {
        name: 'Fatima Zahra',
        father_name: 'Dr. Tariq Zahra',
        gender: 'female',
        date_of_birth: '2014-03-12',
        admission_number: 'ADM-2026-ONLINE-01',
      };

      const result = await dispatcher.dispatchMutation({
        schoolId: 'sch_cloud_iqbal_high',
        entityType: 'STUDENT',
        entityId,
        operation: 'INSERT',
        payload,
        isOnline: true,
        executeLocal: () => {
          db.prepare(`
            INSERT INTO students (id, school_id, admission_number, full_name, father_name, gender, date_of_birth, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
          `).run(entityId, 'sch_cloud_iqbal_high', payload.admission_number, payload.name, payload.father_name, payload.gender, payload.date_of_birth);
          recordChange('STUDENT', entityId, 'INSERT', payload, db);
          return { id: entityId, name: payload.name };
        },
      });

      assert.strictEqual(result.syncStatus, 'confirmed');
      assert.strictEqual(result.result.id, entityId);

      // Verify server push was called
      assert.strictEqual(pushBatchCallCount >= 1, true);

      // Verify row exists in local SQLite
      const row = db.prepare('SELECT id, full_name FROM students WHERE id = ?').get(entityId);
      assert.strictEqual(row.id, entityId);
      assert.strictEqual(row.full_name, 'Fatima Zahra');

      // Verify outbox count did NOT increase (zero pending changes because server confirmed)
      const afterOutbox = getPendingChangesCount(db);
      assert.strictEqual(afterOutbox, initialOutbox);
    });

    test('Server rejection prevents local SQLite write and throws error without corrupting state [mocked network]', async () => {
      // Force mock adapter to simulate server validation failure (400 Bad Request / Business rule violation)
      mockSyncAdapter.pushBatch = async () => {
        throw new Error('Server validation error: Duplicate national B-Form ID in central registry');
      };

      const rejectedId = 'stu_rejected_001';
      await assert.rejects(
        async () => {
          await dispatcher.dispatchMutation({
            schoolId: 'sch_cloud_iqbal_high',
            entityType: 'STUDENT',
            entityId: rejectedId,
            operation: 'INSERT',
            payload: { name: 'Rejected Student' },
            isOnline: true,
            executeLocal: () => {
              db.prepare(`
                INSERT INTO students (id, school_id, admission_number, full_name, father_name, gender, date_of_birth, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
              `).run(rejectedId, 'sch_cloud_iqbal_high', 'ADM-REJECT', 'Rejected Student', 'Father', 'male', '2015-01-01');
            },
          });
        },
        /Server validation error: Duplicate national B-Form ID/
      );

      // Verify that local database does NOT have the rejected student
      const row = db.prepare('SELECT id FROM students WHERE id = ?').get(rejectedId);
      assert.strictEqual(row, undefined);
    });

    test('Offline operation writes to local SQLite AND creates durable outbox entry for later synchronization [mocked network]', async () => {
      const initialOutbox = getPendingChangesCount(db);

      const offlineId = 'stu_offline_test_002';
      const payload = {
        name: 'Zainab Bibi',
        admission_number: 'ADM-2026-OFFLINE-02',
      };

      const result = await dispatcher.dispatchMutation({
        schoolId: 'sch_cloud_iqbal_high',
        entityType: 'STUDENT',
        entityId: offlineId,
        operation: 'INSERT',
        payload,
        isOnline: false, // Offline mode
        executeLocal: () => {
          db.prepare(`
            INSERT INTO students (id, school_id, admission_number, full_name, father_name, gender, date_of_birth, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
          `).run(offlineId, 'sch_cloud_iqbal_high', payload.admission_number, payload.name, 'Father', 'female', '2016-05-10');
          recordChange('STUDENT', offlineId, 'INSERT', payload, db);
          return { id: offlineId, name: payload.name };
        },
      });

      assert.strictEqual(result.syncStatus, 'pending');

      // Verify local record was saved
      const row = db.prepare('SELECT id, full_name FROM students WHERE id = ?').get(offlineId);
      assert.strictEqual(row.id, offlineId);
      assert.strictEqual(row.full_name, 'Zainab Bibi');

      // Verify durable outbox entry WAS created
      const afterOutbox = getPendingChangesCount(db);
      assert.strictEqual(afterOutbox, initialOutbox + 1);

      const pendingRow = db.prepare('SELECT entity_type, entity_id, operation FROM sync_outbox WHERE entity_id = ?').get(offlineId);
      assert.strictEqual(pendingRow.entity_type, 'STUDENT');
      assert.strictEqual(pendingRow.operation, 'INSERT');
    });
  });
});
