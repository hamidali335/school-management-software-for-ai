const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { DeploymentConfigService } = require('../dist/main/services/deployment-config');
const { PasswordHasher } = require('../dist/main/security/password-hasher');

describe('School Management Software — Technician Authorization & Deployment Configuration Suite', () => {
  let db;
  const originalEnvTech = process.env.SMS_TECHNICIAN_KEY;
  const originalEnvCloud = process.env.SMS_CLOUD_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    DeploymentConfigService.clearCache();
    db = new Database(':memory:');
    db.prepare(`
      CREATE TABLE sync_device_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        device_id TEXT NOT NULL,
        api_base_url TEXT NOT NULL,
        auth_token_encrypted TEXT,
        refresh_token_encrypted TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
    db.prepare(`
      INSERT INTO sync_device_config (id, device_id, api_base_url)
      VALUES (1, 'dev_test_01', 'http://localhost:4000/api/v1')
    `).run();
  });

  afterEach(() => {
    if (originalEnvTech) process.env.SMS_TECHNICIAN_KEY = originalEnvTech;
    else delete process.env.SMS_TECHNICIAN_KEY;

    if (originalEnvCloud) process.env.SMS_CLOUD_URL = originalEnvCloud;
    else delete process.env.SMS_CLOUD_URL;

    process.env.NODE_ENV = originalNodeEnv;
    DeploymentConfigService.clearCache();
    try { db.close(); } catch {}
  });

  test('1. Environment variable key verification: accepts valid key, rejects invalid key', async () => {
    process.env.SMS_TECHNICIAN_KEY = 'Secret-Enterprise-Deploy-Key-2026!';

    // Invalid attempt
    const failRes = await DeploymentConfigService.verifyTechnicianKey('wrong-key');
    assert.strictEqual(failRes.success, false);
    assert.strictEqual(failRes.token, undefined);

    // Empty attempt
    const emptyRes = await DeploymentConfigService.verifyTechnicianKey('');
    assert.strictEqual(emptyRes.success, false);

    // Valid attempt
    const successRes = await DeploymentConfigService.verifyTechnicianKey('Secret-Enterprise-Deploy-Key-2026!');
    assert.strictEqual(successRes.success, true);
    assert.ok(typeof successRes.token === 'string');
    assert.ok(successRes.token.startsWith('tech_'));
    assert.strictEqual(DeploymentConfigService.validateTechnicianSession(successRes.token), true);
  });

  test('2. Development fallback key verification when SMS_DEV_TECH_KEY is set in unpackaged build', async () => {
    delete process.env.SMS_TECHNICIAN_KEY;
    delete process.env.TECHNICIAN_ACCESS_KEY;
    delete process.env.DEPLOYMENT_KEY;
    process.env.SMS_DEV_TECH_KEY = 'sms-dev-technician-2026';
    process.env.NODE_ENV = 'development';

    const failRes = await DeploymentConfigService.verifyTechnicianKey('arbitrary-wrong-pass');
    assert.strictEqual(failRes.success, false);

    const devRes = await DeploymentConfigService.verifyTechnicianKey('sms-dev-technician-2026');
    assert.strictEqual(devRes.success, true);
    assert.ok(devRes.token.startsWith('tech_'));
  });

  test('3. URL Validation: accepts valid HTTPS and loopback HTTP; rejects malformed protocols', () => {
    // Valid HTTPS production URL
    const httpsRes = DeploymentConfigService.validateCloudUrl('https://smsapi.teachassist.site/api/v1/', true);
    assert.strictEqual(httpsRes.valid, true);
    assert.strictEqual(httpsRes.cleanUrl, 'https://smsapi.teachassist.site/api/v1');

    // Loopback HTTP in production for local testing
    const loopbackRes = DeploymentConfigService.validateCloudUrl('http://localhost:4000/api/v1', true);
    assert.strictEqual(loopbackRes.valid, true);
    assert.strictEqual(loopbackRes.cleanUrl, 'http://localhost:4000/api/v1');

    // Insecure remote HTTP in packaged production is rejected
    const insecureRes = DeploymentConfigService.validateCloudUrl('http://insecure-school.example.com/api/v1', true);
    assert.strictEqual(insecureRes.valid, false);
    assert.ok(insecureRes.error.includes('HTTPS'));

    // Malformed URL
    const malformed = DeploymentConfigService.validateCloudUrl('not-a-valid-url', false);
    assert.strictEqual(malformed.valid, false);

    // Non-HTTP protocol
    const ftpRes = DeploymentConfigService.validateCloudUrl('ftp://my-server.com/api', false);
    assert.strictEqual(ftpRes.valid, false);
  });

  test('4. Protected deployment configuration update requires valid technician session', async () => {
    process.env.SMS_TECHNICIAN_KEY = 'TechKey-Protected-99';
    const authRes = await DeploymentConfigService.verifyTechnicianKey('TechKey-Protected-99');
    assert.strictEqual(authRes.success, true);

    // Unauthenticated update attempt with bogus token
    const unauthRes = DeploymentConfigService.setDeploymentConfig('tech_bogus_token', 'https://smsapi.teachassist.site/api/v1', db);
    assert.strictEqual(unauthRes.success, false);
    assert.ok(unauthRes.error.includes('expired or invalid'));

    // Authenticated update attempt with valid technician token
    const updateRes = DeploymentConfigService.setDeploymentConfig(authRes.token, 'https://smsapi.teachassist.site/api/v1', db);
    assert.strictEqual(updateRes.success, true);
    assert.strictEqual(updateRes.config.cloudApiBaseUrl, 'https://smsapi.teachassist.site/api/v1');

    // Verify persisted into SQLite sync_device_config table
    const row = db.prepare('SELECT api_base_url FROM sync_device_config WHERE id = 1').get();
    assert.strictEqual(row.api_base_url, 'https://smsapi.teachassist.site/api/v1');

    // Verify getDeploymentConfig succeeds with valid token
    const getRes = DeploymentConfigService.getDeploymentConfig(authRes.token, db);
    assert.strictEqual(getRes.success, true);
    assert.strictEqual(getRes.config.cloudApiBaseUrl, 'https://smsapi.teachassist.site/api/v1');
  });

  test('5. Zero hardcoded passkeys: TECH-ADMIN-2026, admin, sms@2026 are rejected when not configured', async () => {
    delete process.env.SMS_TECHNICIAN_KEY;
    delete process.env.TECHNICIAN_ACCESS_KEY;
    delete process.env.DEPLOYMENT_KEY;

    const res1 = await DeploymentConfigService.verifyTechnicianKey('TECH-ADMIN-2026');
    assert.strictEqual(res1.success, false);

    const res2 = await DeploymentConfigService.verifyTechnicianKey('admin');
    assert.strictEqual(res2.success, false);

    const res3 = await DeploymentConfigService.verifyTechnicianKey('sms@2026');
    assert.strictEqual(res3.success, false);

    const res4 = await DeploymentConfigService.verifyTechnicianKey('deployment');
    assert.strictEqual(res4.success, false);
  });

  test('6. Production cloud API URL lives ONLY in src/main/config/endpoints.ts and no other source file contains hardcoded cloud API URLs', () => {
    const endpointsPath = path.resolve(__dirname, '../src/main/config/endpoints.ts');
    const endpointsContent = fs.readFileSync(endpointsPath, 'utf8');
    assert.ok(endpointsContent.includes('https://smsapi.teachassist.site/api/v1'), 'endpoints.ts must define production URL');

    const srcDir = path.resolve(__dirname, '../src');
    const violations = [];

    function scanFiles(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanFiles(fullPath);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js')) {
          if (path.resolve(fullPath) === endpointsPath) continue;
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('schoolos.cloud')) {
            violations.push(`${fullPath}: contains legacy domain schoolos.cloud`);
          }
          if (content.includes('https://smsapi.teachassist.site')) {
            violations.push(`${fullPath}: contains hardcoded production cloud URL outside endpoints.ts`);
          }
        }
      }
    }

    scanFiles(srcDir);
    assert.deepStrictEqual(violations, [], `Disallowed hardcoded URLs found in source files:\n${violations.join('\n')}`);
  });
});
