const test = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations');
const { seedDemoData } = require('../dist/main/database/seed');

test('Embedded SQLite Engine & Invariant Integrity Tests', async (t) => {
  let db;

  await t.test('1. Initialize In-Memory SQLite with WAL and foreign keys', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = FULL');
    runMigrations(db, ALL_MIGRATIONS);
    assert.strictEqual(db.pragma('foreign_keys', { simple: true }), 1, 'Foreign keys must be ON');
    assert.strictEqual(db.pragma('synchronous', { simple: true }), 2, 'Synchronous must be FULL (2)');
    assert.ok(db, 'Database initialized successfully');
  });

  await t.test('2. Verify all core tables exist in schema', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    const expectedTables = [
      'installation_config',
      'academic_sessions',
      'classes',
      'sections',
      'students',
      'student_enrollments',
      'attendance',
      'fee_structures',
      'invoices',
      'payments',
      'employees',
      'users',
      'auth_sessions',
      'sync_outbox',
      'audit_logs'
    ];

    for (const exp of expectedTables) {
      assert.ok(tables.includes(exp), `Expected table "${exp}" to exist in schema`);
    }
  });

  await t.test('3. Seed demo data and verify counts', () => {
    seedDemoData(db);

    const students = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
    const classes = db.prepare('SELECT COUNT(*) as c FROM classes').get().c;
    const staff = db.prepare('SELECT COUNT(*) as c FROM employees').get().c;
    const invoices = db.prepare('SELECT COUNT(*) as c FROM invoices').get().c;

    assert.ok(students > 0, 'Students should be seeded');
    assert.ok(classes > 0, 'Classes should be seeded');
    assert.ok(staff > 0, 'Staff should be seeded');
    assert.ok(invoices > 0, 'Invoices should be seeded');
  });

  await t.test('4. Enforce attendance uniqueness constraint (one record per student per date)', () => {
    const today = new Date().toISOString().split('T')[0];
    const std = db.prepare('SELECT student_id, session_id, class_id, section_id FROM student_enrollments LIMIT 1').get();

    // First insert succeeds (or already exists from seed)
    // Attempting a second insert for the same student on the same date must fail with UNIQUE constraint
    assert.throws(() => {
      db.prepare(`
        INSERT INTO attendance (id, school_id, student_id, session_id, class_id, section_id, date, status)
        VALUES ('att_duplicate_test', 'sch_01', ?, ?, ?, ?, ?, 'present')
      `).run(std.student_id, std.session_id, std.class_id, std.section_id, today);
    }, /UNIQUE constraint failed: attendance\.student_id, attendance\.date/);
  });

  await t.test('5. Test Sync Outbox change recording', () => {
    db.prepare(`
      INSERT INTO sync_outbox (school_id, entity_type, entity_id, operation, payload_json, status)
      VALUES ('sch_01', 'STUDENT', 'std_test_01', 'INSERT', '{"name":"Test Student"}', 'pending')
    `).run();

    const pending = db.prepare("SELECT COUNT(*) as c FROM sync_outbox WHERE status = 'pending'").get().c;
    assert.ok(pending >= 1, 'Should have at least 1 pending change in sync_outbox');
  });

  await t.test('6. Verify exactly six valid outbox states and auxiliary sync tables', () => {
    const validStates = ['pending', 'processing', 'retrying', 'synced', 'conflict', 'needs_attention'];
    for (const state of validStates) {
      db.prepare(`
        INSERT INTO sync_outbox (school_id, entity_type, entity_id, operation, payload_json, state)
        VALUES ('sch_01', 'ATTENDANCE', ?, 'INSERT', '{"status":"present"}', ?)
      `).run(`att_${state}`, state);
    }

    const invalidStates = ['in_flight', 'permanently_failed', 'invalid_state', 'queued'];
    for (const invalid of invalidStates) {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO sync_outbox (school_id, entity_type, entity_id, operation, payload_json, state)
          VALUES ('sch_01', 'ATTENDANCE', ?, 'INSERT', '{"status":"present"}', ?)
        `).run(`att_${invalid}`, invalid);
      }, /CHECK constraint failed/);
    }

    // Verify technician_lockout table exists and has row id=1
    const techLockout = db.prepare('SELECT * FROM technician_lockout WHERE id = 1').get();
    assert.ok(techLockout, 'technician_lockout row id=1 must exist');
    assert.strictEqual(techLockout.failed_attempts, 0);

    // Verify sync_school_cursor table exists
    db.prepare("INSERT OR REPLACE INTO sync_school_cursor (school_id, last_seq) VALUES ('sch_01', 42)").run();
    const cursor = db.prepare("SELECT last_seq FROM sync_school_cursor WHERE school_id = 'sch_01'").get();
    assert.strictEqual(cursor.last_seq, 42);
  });

  await t.test('7. Clean shutdown', () => {
    db.close();
    assert.ok(true, 'Database cleanly closed');
  });
});
