import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { initDatabase, closeDatabase, getDatabase } from './database/connection';
import { seedDemoData } from './database/seed';
import { InstallationRepository } from './database/repositories/installation.repository';
import { registerIpcHandlers } from './ipc/handlers';
import { SubscriptionEnforcer } from './services/subscription-enforcer';
import { DatabaseKeyManager } from './security/database-key-manager';

let mainWindow: BrowserWindow | null = null;

// Catch and visibly report uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('[CRITICAL UNCAUGHT EXCEPTION]', error);
  try {
    dialog.showErrorBox(
      'School Management Software — Fatal Error',
      `An unexpected critical error occurred:\n\n${error?.message || error}\n\nThe application will now close safely.`
    );
  } catch {}
  try {
    closeDatabase();
  } catch {}
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL UNHANDLED REJECTION]', reason);
  try {
    dialog.showErrorBox(
      'School Management Software — Fatal Startup Error',
      `An unhandled asynchronous error occurred during execution:\n\n${reason instanceof Error ? reason.message : reason}\n\nThe application will now close safely.`
    );
  } catch {}
  try {
    closeDatabase();
  } catch {}
  app.exit(1);
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  async function createWindow() {
    try {
      // 1. Initialize embedded local SQLite database with migrations
      const db = initDatabase();

      // Automatically purge any stale demo fixtures from database on startup
      try {
        const installRepo = new InstallationRepository(db);
        const rawConfig = installRepo.getRawConfig();
        if (rawConfig && ['sch_01', 'sch_default', 'sch_pkg_test'].includes(rawConfig.schoolId)) {
          console.log('[STARTUP] Purging legacy demo seed fixtures from local database...');
          installRepo.purgeDemoData();
        }
      } catch (purgeErr) {
        console.warn('[STARTUP] Demo fixture purge notice:', purgeErr);
      }

      // 2. Seed demo data strictly when explicitly enabled in development mode
      const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
      if (isDev && process.env.ENABLE_DEMO_SEED === '1') {
        seedDemoData(db);
      }

      // 3. Start independent subscription enforcement timer & database protection
      const subscriptionEnforcer = SubscriptionEnforcer.getInstance(db);
      subscriptionEnforcer.startPeriodicEnforcement(10000);

      // 4. Register IPC handlers for renderer communication
      registerIpcHandlers();

      // 4. Create the native Windows application shell
      mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        title: 'School Management Software',
        backgroundColor: '#f8fafc',
        show: false,
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, '../preload/preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });

      // Defensive fallback timer: ensure window displays even if ready-to-show is delayed
      let showFallbackTimer: NodeJS.Timeout | null = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
          console.warn('[WINDOW] ready-to-show event timed out; displaying window defensively.');
          mainWindow.show();
        }
      }, 5000);

      mainWindow.once('ready-to-show', () => {
        if (showFallbackTimer) {
          clearTimeout(showFallbackTimer);
          showFallbackTimer = null;
        }
        mainWindow?.show();

        // Automated launch verification support
        if (process.env.TEST_LAUNCH === '1') {
          console.log('[TEST_LAUNCH_SUCCESS] Electron window created, SQLite database initialized, IPC handlers registered.');
          setTimeout(() => {
            app.quit();
          }, 1500);
        } else if (process.env.TEST_FUNCTIONAL === '1') {
          (async () => {
            try {
              console.log('[PACKAGED_TEST] Running functional verification suite inside packaged Electron environment...');
              // 1. Verify encrypted DB and cipher pragma
              let activeCipher = '';
              try {
                const cipherRows = db.pragma('cipher');
                activeCipher = JSON.stringify(cipherRows);
              } catch (e: any) {
                activeCipher = e.message;
              }
              console.log('[PACKAGED_TEST] SQLCipher active cipher pragma:', activeCipher);

              // 1b. In-depth on-disk SQLCipher key & ciphertext validation in packaged runtime
              const fsMod = await import('fs');
              const cryptoMod = await import('crypto');
              const DatabaseCtor = (await import('better-sqlite3')).default;
              const { getBetterSqliteNativeBinding } = await import('./database/native-binding');
              const nativeBinding = getBetterSqliteNativeBinding();

              const pkgTestDbPath = path.join(app.getPath('userData'), 'pkg_cipher_audit.sqlite');
              if (fsMod.existsSync(pkgTestDbPath)) fsMod.unlinkSync(pkgTestDbPath);

              const testKeyHex = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
              const auditDb = new DatabaseCtor(pkgTestDbPath, { nativeBinding });
              auditDb.pragma("cipher = 'sqlcipher'");
              auditDb.pragma(`key = 'x''${testKeyHex}'''`);
              auditDb.pragma('journal_mode = WAL');
              auditDb.prepare("CREATE TABLE secret_audit (id INT, pii_text TEXT)").run();
              auditDb.prepare("INSERT INTO secret_audit VALUES (1, 'PackagedPIIStudent_Zainab')").run();
              auditDb.pragma('wal_checkpoint(TRUNCATE)');
              auditDb.close();

              // Open without key must fail closed
              const auditNoKey = new DatabaseCtor(pkgTestDbPath, { nativeBinding });
              let noKeyFailedClosed = false;
              try {
                auditNoKey.prepare("SELECT * FROM secret_audit").get();
              } catch (e: any) {
                if (e.code === 'SQLITE_NOTADB') noKeyFailedClosed = true;
              }
              auditNoKey.close();
              if (!noKeyFailedClosed) throw new Error('Packaged DB opened without key!');

              // Open with wrong key must fail closed
              const auditWrongKey = new DatabaseCtor(pkgTestDbPath, { nativeBinding });
              auditWrongKey.pragma("cipher = 'sqlcipher'");
              auditWrongKey.pragma("key = 'x''0000000000000000000000000000000000000000000000000000000000000000'''");
              let wrongKeyFailedClosed = false;
              try {
                auditWrongKey.prepare("SELECT * FROM secret_audit").get();
              } catch (e: any) {
                if (e.code === 'SQLITE_NOTADB') wrongKeyFailedClosed = true;
              }
              auditWrongKey.close();
              if (!wrongKeyFailedClosed) throw new Error('Packaged DB opened with wrong key!');

              // Open with correct key must succeed
              const auditCorrect = new DatabaseCtor(pkgTestDbPath, { nativeBinding });
              auditCorrect.pragma("cipher = 'sqlcipher'");
              auditCorrect.pragma(`key = 'x''${testKeyHex}'''`);
              const readRow = auditCorrect.prepare("SELECT pii_text FROM secret_audit WHERE id = 1").get() as any;
              auditCorrect.close();
              if (readRow?.pii_text !== 'PackagedPIIStudent_Zainab') throw new Error('Packaged DB failed to read back with correct key!');

              // Raw disk bytes inspection
              const rawDiskBytes = fsMod.readFileSync(pkgTestDbPath);
              const rawDiskStr = rawDiskBytes.toString('binary');
              const hasSqliteHeader = rawDiskBytes.subarray(0, 16).toString('utf8').includes('SQLite format 3');
              const hasPiiCleartext = rawDiskStr.includes('PackagedPIIStudent_Zainab');
              if (hasSqliteHeader || hasPiiCleartext) throw new Error('Cleartext header or PII detected on disk!');

              if (fsMod.existsSync(pkgTestDbPath)) fsMod.unlinkSync(pkgTestDbPath);
              console.log('[PACKAGED_TEST] SQLCipher whole-database page encryption verified: missing key fails closed, wrong key fails closed, correct key succeeds, zero plaintext on disk.');

              // Ensure installation_config exists for foreign keys
              db.prepare(`
                INSERT OR IGNORE INTO installation_config (id, school_id, school_name, school_code, installation_id, provisioned_at, updated_at)
                VALUES (1, 'sch_pkg_test', 'Packaged Test School', 'PTS-01', 'inst_pkg_01', datetime('now'), datetime('now'))
              `).run();

              const instRow = db.prepare('SELECT school_id FROM installation_config LIMIT 1').get() as any;
              const testSchoolId = instRow?.school_id || 'sch_pkg_test';

              // 2. Test offline mutation & durable outbox dispatch
              const { OnlineSyncDispatcher } = await import('./sync/online-sync-dispatcher');
              const dispatcher = new OnlineSyncDispatcher(db);
              const dispatchRes = await dispatcher.dispatchMutation({
                entityType: 'STUDENT_TEST',
                entityId: 'stu_packaged_01',
                operation: 'INSERT',
                payload: { id: 'stu_packaged_01', name: 'Packaged Test Student', schoolId: testSchoolId },
                schoolId: testSchoolId,
                isOnline: false,
                executeLocal: () => ({ created: true }),
              });
              console.log('[PACKAGED_TEST] Mutation dispatch result status:', dispatchRes.syncStatus);

              // 3. Verify outbox entry in encrypted SQLite
              const outbox = db.prepare("SELECT * FROM sync_outbox WHERE entity_id = 'stu_packaged_01'").get() as any;
              if (!outbox) throw new Error('Outbox entry missing in local SQLite');
              console.log('[PACKAGED_TEST] Durable outbox entry verified, status:', outbox.state || outbox.status);

              // 4. Test SubscriptionEnforcer
              const enforcer = SubscriptionEnforcer.getInstance(db);
              const enforcerRes = enforcer.evaluate();
              console.log('[PACKAGED_TEST] Subscription enforcer evaluated:', enforcerRes.state);

              // 5. Test BackupService
              const { BackupService } = await import('./services/backup.service');
              const { getDatabasePath } = await import('./database/connection');
              const backupService = new BackupService(db, getDatabasePath());
              const backupRes = await backupService.createBackup({
                destinationType: 'local',
                triggerType: 'maintenance',
                encryptionPassphrase: 'PackagedTestPassphrase2026!',
              });
              console.log('[PACKAGED_TEST] Encrypted backup created & verified in sandbox:', backupRes.status, backupRes.fileName);

              // 6. Clean up temporary functional verification fixtures from real database
              try {
                db.prepare("DELETE FROM sync_outbox WHERE entity_id = 'stu_packaged_01'").run();
                db.prepare("DELETE FROM installation_config WHERE school_id = 'sch_pkg_test'").run();
              } catch {}

              console.log('[PACKAGED_FUNCTIONAL_VERIFICATION_SUCCESS]');
              setTimeout(() => {
                app.quit();
              }, 1000);
            } catch (err) {
              console.error('[PACKAGED_FUNCTIONAL_VERIFICATION_FAILED]', err);
              app.exit(1);
            }
          })();
        }
      });

      mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error(`[RENDERER LOAD FAILURE] Code: ${errorCode}, Description: ${errorDescription}, URL: ${validatedURL}`);
        dialog.showErrorBox(
          'School Management Software — UI Load Failure',
          `Failed to load application interface:\n\nError ${errorCode}: ${errorDescription}\nURL: ${validatedURL}`
        );
      });

      // Check if running in Vite dev mode or production build
      const devUrl = 'http://localhost:5173';

      if (isDev && process.env.VITE_DEV_SERVER_URL) {
        await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
      } else {
        const prodPath = path.join(__dirname, '../renderer/index.html');
        try {
          await mainWindow.loadFile(prodPath);
        } catch (loadErr) {
          console.error('[LOAD FILE FAILED]', loadErr);
          if (isDev) {
            await mainWindow.loadURL(devUrl);
          } else {
            throw loadErr;
          }
        }
      }

      mainWindow.on('closed', () => {
        mainWindow = null;
      });
    } catch (startupError: any) {
      console.error('[FATAL STARTUP ERROR]', startupError);
      try {
        dialog.showErrorBox(
          'School Management Software — Initialization Failed',
          `The application encountered an error during initialization and cannot continue:\n\n${startupError?.message || startupError}\n\nPlease check your configuration or contact support.`
        );
      } catch {}
      try {
        closeDatabase();
      } catch {}
      app.exit(1);
    }
  }

  app.whenReady().then(createWindow).catch((err) => {
    console.error('[APP READY ERROR]', err);
    try {
      dialog.showErrorBox('School Management Software — Startup Error', String(err?.message || err));
    } catch {}
    app.exit(1);
  });

  app.on('window-all-closed', () => {
    try {
      const db = getDatabase();
      SubscriptionEnforcer.getInstance(db).stopPeriodicEnforcement();
      DatabaseKeyManager.getInstance().lock('MANUAL_LOCK');
    } catch {}
    closeDatabase();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
