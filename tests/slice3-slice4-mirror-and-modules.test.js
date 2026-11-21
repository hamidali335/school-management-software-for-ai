const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const { runMigrations, ALL_MIGRATIONS } = require('../dist/main/database/migrations/index');
const { OnlineModuleProxyService } = require('../dist/main/services/online-module-proxy.service');

describe('Phase 2 Desktop Unit Suite: Migration 013 Offline Mirror & Slice 4 Online-Only Guard', () => {
  let dbPath;
  let db;

  before(() => {
    dbPath = path.join(os.tmpdir(), `sms_phase2_unit_${Date.now()}.sqlite`);
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

  it('1. Migration 013 creates offline_mirror_cache and notices_cache tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('offline_mirror_cache', 'notices_cache')")
      .all()
      .map((r) => r.name);
    assert.ok(tables.includes('offline_mirror_cache'));
    assert.ok(tables.includes('notices_cache'));
  });

  it('2. OnlineModuleProxyService blocks Slice 4 online-only writes while offline', async () => {
    const proxy = new OnlineModuleProxyService(db);
    const res = await proxy.request({
      method: 'POST',
      path: '/admissions/inquiries',
      isOnline: false,
      body: { studentName: 'Test' },
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 0);
    assert.match(res.error, /online-only/i);
  });
});
