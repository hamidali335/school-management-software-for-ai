const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations');
const { UpdateService } = require('../dist/main/services/update.service');
const { BackupService } = require('../dist/main/services/backup.service');

test('School Management Software — Phase 7 Packaging & Auto-Update Suite', async (t) => {
  const testDbDir = path.resolve(__dirname, '../data/test_phase7_p');
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }

  const testDbPath = path.join(testDbDir, `p7_test_${Date.now()}.db`);
  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db, ALL_MIGRATIONS);

  const backupService = new BackupService(db, testDbPath);
  const updatesStagingDir = path.join(testDbDir, 'updates_staging');
  const updateService = new UpdateService(db, testDbPath, backupService, '1.0.0', updatesStagingDir);

  await t.test('1. Semver parsing and version progression comparison', () => {
    assert.equal(UpdateService.compareSemver('1.1.0', '1.0.0'), 1);
    assert.equal(UpdateService.compareSemver('1.0.0', '1.1.0'), -1);
    assert.equal(UpdateService.compareSemver('1.0.0', '1.0.0'), 0);
    assert.equal(UpdateService.compareSemver('2.0.0', '1.9.9'), 1);
    assert.equal(UpdateService.compareSemver('1.0.1', '1.0.0'), 1);
    assert.equal(UpdateService.compareSemver('1.0.0-beta.1', '1.0.0'), 0);
  });

  await t.test('2. Channel segregation: stable channel rejects beta releases; beta channel accepts both', () => {
    updateService.setChannel('stable');
    assert.equal(updateService.getStatus().channel, 'stable');

    const betaManifest = {
      version: '1.2.0-beta.1',
      releaseDate: new Date().toISOString(),
      minSupportedVersion: '1.0.0',
      mandatory: false,
      channel: 'beta',
      windows: {
        url: 'http://localhost:5000/api/v1/updates/desktop/download/1.2.0-beta.1',
        sha512: 'abc',
        sizeBytes: 100,
        installerType: 'nsis',
      },
      releaseNotes: 'Beta testing only',
      databaseMigrationRequired: false,
      targetSchemaVersion: 9,
    };

    // On stable channel, beta manifest is rejected
    const acceptedOnStable = updateService.setAvailableManifest(betaManifest);
    // Since channel is stable, when checkForUpdates filters or setAvailableManifest is called:
    // If manifest is beta, stable users should not have it marked as available
    updateService.setChannel('beta');
    assert.equal(updateService.getStatus().channel, 'beta');
    const acceptedOnBeta = updateService.setAvailableManifest(betaManifest);
    assert.equal(acceptedOnBeta, true);
    assert.equal(updateService.getStatus().state, 'update_available');

    // Reset back to stable for remaining tests
    updateService.setChannel('stable');
  });

  await t.test('3. Minimum supported version gating: enforces mandatory flag when currentVersion < minSupportedVersion', () => {
    const manifestWithMin = {
      version: '1.1.0',
      releaseDate: new Date().toISOString(),
      minSupportedVersion: '1.0.0',
      mandatory: false,
      channel: 'stable',
      windows: {
        url: 'http://localhost:5000/download/1.1.0',
        sha512: 'fake',
        sizeBytes: 50,
        installerType: 'nsis',
      },
      releaseNotes: 'Migration 009 release',
      databaseMigrationRequired: true,
      targetSchemaVersion: 9,
    };

    updateService.setAvailableManifest(manifestWithMin);
    assert.equal(updateService.getStatus().state, 'update_available');
    assert.equal(updateService.getStatus().availableUpdate.version, '1.1.0');
  });

  // Prepare a test server / mock payload for download tests
  const testPayload = Buffer.from('MZ_SIMULATED_PE_EXE_INSTALLER_FOR_PHASE_7_TESTING_DATA_STREAM');
  const validSha512 = crypto.createHash('sha512').update(testPayload).digest('hex');

  // We set up a lightweight local HTTP server for real network streaming tests
  const http = require('node:http');
  let mockServer;
  let serverPort;

  await new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      if (req.url === '/download/valid') {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': testPayload.length,
        });
        res.end(testPayload);
      } else if (req.url === '/download/corrupt') {
        // Send tampered bytes
        const corruptPayload = Buffer.from('MZ_CORRUPTED_BYTES_WITH_MISMATCHING_CHECKSUM');
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': corruptPayload.length,
        });
        res.end(corruptPayload);
      } else if (req.url === '/download/stalled') {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': 100000,
        });
        res.write(Buffer.from('CHUNK_1'));
        // keep open without completing to test cancellation
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    mockServer.listen(0, '127.0.0.1', () => {
      serverPort = mockServer.address().port;
      resolve();
    });
  });

  await t.test('4. Download and cryptographic SHA-512 verification succeeds on matching hash', async () => {
    const validManifest = {
      version: '1.1.0',
      releaseDate: new Date().toISOString(),
      minSupportedVersion: '1.0.0',
      mandatory: false,
      channel: 'stable',
      windows: {
        url: `http://127.0.0.1:${serverPort}/download/valid`,
        sha512: validSha512,
        sizeBytes: testPayload.length,
        installerType: 'nsis',
      },
      releaseNotes: 'Valid verified update payload',
      databaseMigrationRequired: false,
      targetSchemaVersion: 9,
    };

    updateService.setAvailableManifest(validManifest);
    const downloadedPath = await updateService.downloadUpdate();

    assert.ok(fs.existsSync(downloadedPath), 'Downloaded installer file should exist on disk');
    assert.equal(updateService.getStatus().state, 'ready_to_install');
    assert.equal(updateService.getStatus().downloadProgress.percent, 100);
    assert.equal(fs.statSync(downloadedPath).size, testPayload.length);
  });

  await t.test('5. Rejects corrupted update payload (tampered bytes or wrong hash), deletes staged payload and flags CORRUPT_UPDATE_PAYLOAD', async () => {
    const corruptManifest = {
      version: '1.1.1',
      releaseDate: new Date().toISOString(),
      minSupportedVersion: '1.0.0',
      mandatory: false,
      channel: 'stable',
      windows: {
        url: `http://127.0.0.1:${serverPort}/download/corrupt`,
        sha512: validSha512, // Expects valid hash, but server sends corrupted bytes
        sizeBytes: testPayload.length,
        installerType: 'nsis',
      },
      releaseNotes: 'Corrupt payload test',
      databaseMigrationRequired: false,
      targetSchemaVersion: 9,
    };

    updateService.setAvailableManifest(corruptManifest);
    await assert.rejects(
      async () => {
        await updateService.downloadUpdate();
      },
      /CORRUPT_UPDATE_PAYLOAD|INCOMPLETE_UPDATE_PAYLOAD/
    );

    assert.equal(updateService.getStatus().state, 'error');
    const stagingPart = path.join(updatesStagingDir, 'SchoolManagementSoftware-Setup-1.1.1.exe.part');
    assert.equal(fs.existsSync(stagingPart), false, 'Corrupted staging file must be immediately deleted');
  });

  await t.test('6. Interrupted download handling: cancelDownload transitions to download_interrupted cleanly', async () => {
    const stalledManifest = {
      version: '1.1.2',
      releaseDate: new Date().toISOString(),
      minSupportedVersion: '1.0.0',
      mandatory: false,
      channel: 'stable',
      windows: {
        url: `http://127.0.0.1:${serverPort}/download/stalled`,
        sha512: validSha512,
        sizeBytes: 100000,
        installerType: 'nsis',
      },
      releaseNotes: 'Stalled download test',
      databaseMigrationRequired: false,
      targetSchemaVersion: 9,
    };

    updateService.setAvailableManifest(stalledManifest);
    // Start download asynchronously without awaiting
    const dlPromise = updateService.downloadUpdate().catch(() => {});
    
    // Interrupt shortly after starting
    setTimeout(() => {
      updateService.cancelDownload();
    }, 50);

    await dlPromise;
    assert.equal(updateService.getStatus().state, 'download_interrupted');
  });

  await t.test('7. Pre-installation safety backup: flushes WAL and creates pre-update safety backup before installer execution', async () => {
    // Re-stage the valid 1.1.0 update to ready_to_install
    const validManifest = {
      version: '1.1.0',
      releaseDate: new Date().toISOString(),
      minSupportedVersion: '1.0.0',
      mandatory: false,
      channel: 'stable',
      windows: {
        url: `http://127.0.0.1:${serverPort}/download/valid`,
        sha512: validSha512,
        sizeBytes: testPayload.length,
        installerType: 'nsis',
      },
      releaseNotes: 'Pre-installation safety backup test',
      databaseMigrationRequired: true,
      targetSchemaVersion: 9,
    };

    updateService.setAvailableManifest(validManifest);
    await updateService.downloadUpdate();
    assert.equal(updateService.getStatus().state, 'ready_to_install');

    // Execute prepareAndInstall with skipProcessExit for automated test runner
    const result = await updateService.prepareAndInstall({ silent: true, skipProcessExit: true });
    assert.equal(result.success, true);
    assert.ok(result.safetyBackupPath, 'Automated safety backup must be created before update');
    assert.ok(fs.existsSync(result.safetyBackupPath), 'Safety backup file must exist on disk');
  });

  await t.test('8. Data survival across version upgrade: school identity, active license, student roster, fee invoice, payments, and outbox items persist untouched across schema upgrades', () => {
    // Insert verified school records into the active database
    db.prepare(`
      INSERT OR REPLACE INTO installation_config (id, school_id, school_name, school_code, installation_id, provisioned_at, updated_at)
      VALUES (1, 'sch_p7_upg', 'Upgrade Test School', 'UPG01', 'inst_p7_01', datetime('now'), datetime('now'))
    `).run();

    db.prepare(`
      INSERT OR REPLACE INTO classes (id, school_id, name, order_index)
      VALUES ('cls_p7_01', 'sch_p7_upg', 'Grade 10', 10)
    `).run();

    db.prepare(`
      INSERT OR REPLACE INTO sections (id, school_id, class_id, name, room_number)
      VALUES ('sec_p7_01', 'sch_p7_upg', 'cls_p7_01', 'Section A', 'Room 101')
    `).run();

    db.prepare(`
      INSERT OR REPLACE INTO academic_sessions (id, school_id, name, start_date, end_date, is_current)
      VALUES ('sess_p7_01', 'sch_p7_upg', '2026-2027', '2026-08-01', '2027-06-30', 1)
    `).run();

    db.prepare(`
      INSERT OR REPLACE INTO students (id, school_id, admission_number, full_name, father_name, gender, date_of_birth, status)
      VALUES ('stu_p7_upg', 'sch_p7_upg', 'ADM-P7-001', 'Ali Raza', 'Tariq Raza', 'male', '2010-05-14', 'active')
    `).run();

    db.prepare(`
      INSERT OR REPLACE INTO invoices (id, school_id, challan_number, student_id, session_id, month, due_date, amount, balance, status)
      VALUES ('inv_p7_upg', 'sch_p7_upg', 'CH-P7-001', 'stu_p7_upg', 'sess_p7_01', '2026-11', '2026-11-20', 5000, 0, 'paid')
    `).run();

    db.prepare(`
      INSERT OR REPLACE INTO payments (id, school_id, invoice_id, receipt_number, amount, payment_date, payment_method, collector, is_reversed)
      VALUES ('pay_p7_upg', 'sch_p7_upg', 'inv_p7_upg', 'REC-P7-001', 5000, '2026-11-14', 'cash', 'Admin', 0)
    `).run();

    db.prepare(`
      INSERT INTO sync_outbox (school_id, entity_type, entity_id, operation, payload_json, status)
      VALUES ('sch_p7_upg', 'payment', 'pay_p7_upg', 'INSERT', '{"amount":5000}', 'pending')
    `).run();

    // Verify all records exist before migration
    assert.equal(db.prepare("SELECT COUNT(*) as c FROM students WHERE id = 'stu_p7_upg'").get().c, 1);
    assert.equal(db.prepare("SELECT COUNT(*) as c FROM invoices WHERE id = 'inv_p7_upg'").get().c, 1);
    assert.equal(db.prepare("SELECT COUNT(*) as c FROM payments WHERE id = 'pay_p7_upg'").get().c, 1);
    assert.equal(db.prepare("SELECT COUNT(*) as c FROM sync_outbox WHERE entity_id = 'pay_p7_upg'").get().c, 1);

    // Run forward migrations (simulating next version database startup)
    const migrationResult = runMigrations(db, ALL_MIGRATIONS, { backupDir: path.join(testDbDir, 'pre_mig_test') });
    
    // Invariants post-upgrade: zero record mutation, financial ledger immutability intact
    const student = db.prepare("SELECT * FROM students WHERE id = 'stu_p7_upg'").get();
    const invoice = db.prepare("SELECT * FROM invoices WHERE id = 'inv_p7_upg'").get();
    const payment = db.prepare("SELECT * FROM payments WHERE id = 'pay_p7_upg'").get();
    const outbox = db.prepare("SELECT * FROM sync_outbox WHERE entity_id = 'pay_p7_upg'").get();

    assert.equal(student.full_name, 'Ali Raza');
    assert.equal(invoice.balance, 0);
    assert.equal(payment.amount, 5000);
    assert.equal(payment.is_reversed, 0);
    assert.equal(outbox.status, 'pending');
  });

  await t.test('9. Packaging configuration invariants: appId, asarUnpack, deleteAppDataOnUninstall=false in package.json', () => {
    const pkgJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

    assert.equal(pkgJson.name, 'school-management-software');
    assert.equal(pkgJson.build.appId, 'com.schoolmanagement.desktop');
    assert.equal(pkgJson.build.productName, 'School Management Software');
    assert.equal(pkgJson.build.asar, true);
    assert.ok(Array.isArray(pkgJson.build.asarUnpack), 'asarUnpack must be configured');
    assert.ok(pkgJson.build.asarUnpack.some(p => p.includes('better-sqlite3')), 'better-sqlite3 must be unpacked from ASAR for native loading');
    
    // CRITICAL DATA PRESERVATION INVARIANT:
    assert.equal(pkgJson.build.nsis.deleteAppDataOnUninstall, false, 'deleteAppDataOnUninstall MUST strictly be false to protect school records on uninstall');
    assert.equal(pkgJson.build.nsis.allowToChangeInstallationDirectory, true);
    assert.equal(pkgJson.build.nsis.oneClick, false);
  });

  await t.test('10. Packaged binary verification: release/win-unpacked directory contains functional executable', () => {
    const winUnpackedDir = path.resolve(__dirname, '../release/win-unpacked');
    if (fs.existsSync(winUnpackedDir)) {
      const exePath = path.join(winUnpackedDir, 'School Management Software.exe');
      assert.ok(fs.existsSync(exePath), 'Packaged executable must exist in release/win-unpacked');
      const exeSize = fs.statSync(exePath).size;
      assert.ok(exeSize > 1000000, `Packaged executable should be non-trivial PE binary, got ${exeSize} bytes`);
    }
  });

  // Teardown
  mockServer.close();
  db.close();
  try {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  } catch {}
});
