const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { runMigrations, ALL_MIGRATIONS } = require('../dist/main/database/migrations/index.js');
const { DeviceFingerprint } = require('../dist/main/security/device-fingerprint.js');
const { LicenseVerifier } = require('../dist/main/security/license-verifier.js');
const { LicenseService } = require('../dist/main/services/license.service.js');

describe('School Management Software — Phase 6 Licensing & Offline Grace Period Suite', () => {
  let db;
  let licenseService;
  let keyPair;
  let publicKeyPem;
  let privateKey;
  const schoolId = 'sch_phase6_test';
  const schoolName = 'Phase 6 Grammar High School';
  const schoolCode = 'P6GHS';
  const deviceId = 'dev_win_test_station_01';
  let deviceFp;

  before(() => {
    // Generate Ed25519 key pair for testing
    keyPair = crypto.generateKeyPairSync('ed25519');
    publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    privateKey = keyPair.privateKey;

    db = new Database(':memory:');
    runMigrations(db, ALL_MIGRATIONS);

    // Setup installation config
    db.prepare(`
      INSERT INTO installation_config (
        id, school_id, school_name, school_code, installation_id, provisioned_at, updated_at
      ) VALUES (1, ?, ?, ?, 'inst_phase6_secure_key', datetime('now'), datetime('now'))
    `).run(schoolId, schoolName, schoolCode);

    // Setup device config
    db.prepare(`
      INSERT INTO sync_device_config (
        id, school_id, device_id, device_name, api_base_url, device_status
      ) VALUES (1, ?, ?, 'Principal-Workstation', 'http://localhost:4000/api/v1', 'registered')
    `).run(schoolId, deviceId);

    deviceFp = DeviceFingerprint.getFingerprint('inst_phase6_secure_key');
    licenseService = new LicenseService(db);
  });

  after(() => {
    if (db) db.close();
  });

  function signPayload(payload) {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
    return { canonical, signature };
  }

  it('1. Migration 008 creates license_cache, backup_configs, and backup_history', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('license_cache', 'backup_configs', 'backup_history')
    `).all().map(r => r.name);

    assert.strictEqual(tables.includes('license_cache'), true);
    assert.strictEqual(tables.includes('backup_configs'), true);
    assert.strictEqual(tables.includes('backup_history'), true);

    const defaultConfigs = db.prepare('SELECT * FROM backup_configs').all();
    assert.strictEqual(defaultConfigs.length, 3);
  });

  it('2. Device Fingerprint is stable, deterministic, and conceals raw hardware IDs', () => {
    const fp1 = DeviceFingerprint.getFingerprint();
    const fp2 = DeviceFingerprint.getFingerprint();
    assert.strictEqual(fp1, fp2);
    assert.strictEqual(fp1.startsWith('fp_win_'), true);
    assert.strictEqual(fp1.length, 39); // 'fp_win_' (7) + 32 hex chars
    assert.doesNotMatch(fp1, /MAC|CPU|Serial/i);
  });

  it('3. Unactivated system reports unactivated state with read-only essential access', () => {
    const status = licenseService.getStatus();
    assert.strictEqual(status.state, 'unactivated');
    assert.strictEqual(status.canRead, true);
    assert.strictEqual(status.canWrite, false);
    assert.strictEqual(licenseService.isFeatureEnabled('core.backup'), true);
    assert.strictEqual(licenseService.isFeatureEnabled('core.fees'), false);
  });

  it('4. Activates valid signed Ed25519 license and grants full operational entitlements', () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const payload = {
      licenseId: 'lic_test_active_01',
      schoolId,
      schoolName,
      schoolCode,
      deviceId,
      hardwareFingerprint: deviceFp,
      planCode: 'pro_desktop',
      planName: 'Professional Desktop Plan',
      status: 'active',
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      gracePeriodDays: 7,
      entitlements: ['core.students', 'core.fees', 'core.attendance', 'core.academics', 'core.payroll', 'core.backup'],
      limits: { maxStudents: 1000, maxDevices: 3 },
      licenseVersion: 1,
    };

    const { canonical, signature } = signPayload(payload);

    licenseService.storeLicense({
      ...payload,
      signedPayload: canonical,
      signature,
      publicKey: publicKeyPem,
    });

    const status = licenseService.getStatus();
    assert.strictEqual(status.state, 'active');
    assert.strictEqual(status.canRead, true);
    assert.strictEqual(status.canWrite, true);
    assert.strictEqual(licenseService.isFeatureEnabled('core.fees'), true);
    assert.strictEqual(licenseService.isFeatureEnabled('core.payroll'), true);
    assert.strictEqual(licenseService.isFeatureEnabled('ai.copilot'), false); // not in entitlements
  });

  it('5. Tampered license payload or invalid signature is rejected immediately', () => {
    const row = db.prepare('SELECT * FROM license_cache WHERE id = 1').get();
    const tamperedPayload = row.signed_payload.replace('"status":"active"', '"status":"revoked"');
    assert.notStrictEqual(tamperedPayload, row.signed_payload);

    const result = LicenseVerifier.validateLicense(
      tamperedPayload,
      row.signature,
      row.public_key,
      schoolId,
      deviceId,
      deviceFp,
    );

    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error, 'SIGNATURE_FORGERY_OR_TAMPERED');
  });

  it('6. Rejects license when tenant schoolId does not match installation', () => {
    const row = db.prepare('SELECT * FROM license_cache WHERE id = 1').get();
    const result = LicenseVerifier.validateLicense(
      row.signed_payload,
      row.signature,
      row.public_key,
      'sch_different_unauthorized_school',
      deviceId,
      deviceFp,
    );

    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error, 'TENANT_MISMATCH');
  });

  it('7. Rejects license when device identity or hardware fingerprint does not match', () => {
    const row = db.prepare('SELECT * FROM license_cache WHERE id = 1').get();
    const result = LicenseVerifier.validateLicense(
      row.signed_payload,
      row.signature,
      row.public_key,
      schoolId,
      'dev_win_stolen_or_copied_id',
      deviceFp,
    );

    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error, 'DEVICE_ID_MISMATCH');

    const result2 = LicenseVerifier.validateLicense(
      row.signed_payload,
      row.signature,
      row.public_key,
      schoolId,
      deviceId,
      'fp_win_different_machine_fingerprint',
    );

    assert.strictEqual(result2.isValid, false);
    assert.strictEqual(result2.error, 'DEVICE_FINGERPRINT_MISMATCH');
  });

  it('8. Offline operation within grace period continues smoothly', () => {
    // Simulate 3 days offline (last server verification was 3 days ago)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE license_cache SET last_server_verification = ? WHERE id = 1').run(threeDaysAgo);

    const status = licenseService.getStatus();
    assert.strictEqual(status.state, 'offline_grace');
    assert.strictEqual(status.canWrite, true);
    assert.strictEqual(status.graceDaysRemaining, 4); // 7 - 3 = 4 days remaining
  });

  it('9. Grace period does not reset upon simulated application restart', () => {
    // Simulate application restart: instantiate a fresh LicenseService instance with new DB connection
    const freshService = new LicenseService(db);
    const status = freshService.getStatus();
    assert.strictEqual(status.state, 'offline_grace');
    assert.strictEqual(status.graceDaysRemaining, 4);
  });

  it('10. Offline grace period expiration suspends writes without destroying data', () => {
    // Simulate 8 days offline (grace period is 7 days)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE license_cache SET last_server_verification = ? WHERE id = 1').run(eightDaysAgo);

    const status = licenseService.getStatus();
    assert.strictEqual(status.state, 'grace_expired');
    assert.strictEqual(status.canRead, true); // historical data preserved
    assert.strictEqual(status.canWrite, false); // writes suspended
    assert.strictEqual(status.graceDaysRemaining, 0);

    // Assert write attempt throws LICENSE_RESTRICTED
    assert.throws(() => {
      licenseService.assertCanWrite('core.fees');
    }, /LICENSE_RESTRICTED/);

    // Essential rescue features (backup, export) remain accessible
    assert.doesNotThrow(() => {
      licenseService.assertCanWrite('core.backup');
    });
  });

  it('11. Detects backward system clock rollback and sets tamper protection', () => {
    // Reset server verification to fresh
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE license_cache 
      SET last_server_verification = ?,
          last_observed_local_time = '2027-01-01T00:00:00.000Z',
          clock_tampered = 0
      WHERE id = 1
    `).run(nowIso);

    // Since current time is Nov 2026 and last_observed_local_time is 2027, this represents backward jump!
    const status = licenseService.getStatus();
    assert.strictEqual(status.state, 'clock_tampered');
    assert.strictEqual(status.canWrite, false);
    assert.strictEqual(status.canRead, true);

    const row = db.prepare('SELECT clock_tampered FROM license_cache WHERE id = 1').get();
    assert.strictEqual(row.clock_tampered, 1);
  });

  it('12. Legitimate clock correction recovery restores normal operations upon server revalidation', () => {
    const serverAuthoritativeTime = new Date().toISOString();
    licenseService.resetClockTamper(serverAuthoritativeTime);

    const row = db.prepare('SELECT clock_tampered FROM license_cache WHERE id = 1').get();
    assert.strictEqual(row.clock_tampered, 0);

    const status = licenseService.getStatus();
    assert.strictEqual(status.state, 'active');
    assert.strictEqual(status.canWrite, true);
  });

  it('13. Expired subscription preserves database while restricting writes', () => {
    // Set expiration in the past
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE license_cache SET expires_at = ? WHERE id = 1').run(pastDate);

    const status = licenseService.getStatus();
    assert.strictEqual(status.state, 'expired');
    assert.strictEqual(status.canRead, true);
    assert.strictEqual(status.canWrite, false);

    // Core school data is intact
    const studentCount = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
    assert.strictEqual(typeof studentCount, 'number');
  });
});
