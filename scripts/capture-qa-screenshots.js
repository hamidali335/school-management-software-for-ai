const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Ensure isolated database & seed demo data
const { initDatabase, closeDatabase } = require('../dist/main/database/connection');
const { DatabaseKeyManager } = require('../dist/main/security/database-key-manager');
const { seedDemoData } = require('../dist/main/database/seed');
const { registerIpcHandlers } = require('../dist/main/ipc/handlers');

const SCREENSHOT_DIR = path.resolve(__dirname, '../qa-evidence/screenshots');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.whenReady().then(async () => {
  console.log('[QA_SCREENSHOTS] Initializing QA screenshot capture suite...');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const testDbPath = path.join(app.getPath('userData'), 'qa_evidence_run.db');
  const testVaultDir = path.join(app.getPath('userData'), 'qa_evidence_vault');

  if (fs.existsSync(testVaultDir)) {
    try { fs.rmSync(testVaultDir, { recursive: true, force: true }); } catch {}
  }
  for (const ext of ['', '-wal', '-shm']) {
    if (fs.existsSync(testDbPath + ext)) {
      try { fs.unlinkSync(testDbPath + ext); } catch {}
    }
  }

  // 1. Initialize isolated database and handlers
  DatabaseKeyManager.resetInstanceForTesting();
  const db = initDatabase(testDbPath, { vaultDir: testVaultDir });
  try {
    seedDemoData(db);
  } catch (err) {
    console.warn('[QA_SCREENSHOTS] Seed note:', err.message);
  }
  registerIpcHandlers();

  // 2. Create high-resolution window for screenshots
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'School Management Software — Visual QA Evidence',
    backgroundColor: '#0f172a',
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../dist/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const indexPath = path.join(__dirname, '../dist/renderer/index.html');
  await win.loadFile(indexPath);
  win.show();

  async function takeScreenshot(name) {
    await sleep(2000);
    const image = await win.webContents.capturePage();
    const dest = path.join(SCREENSHOT_DIR, name);
    fs.writeFileSync(dest, image.toPNG());
    console.log(`[QA_SCREENSHOTS] Saved: ${name} (${image.getSize().width}x${image.getSize().height})`);
  }

  try {
    // 1. Login View
    console.log('[QA_SCREENSHOTS] Capturing 01_login_view.png...');
    await sleep(2500);
    await takeScreenshot('01_login_view.png');

    // 2. Perform Login via desktopAPI
    console.log('[QA_SCREENSHOTS] Logging into administrative session...');
    const loginResult = await win.webContents.executeJavaScript(`
      (async () => {
        try {
          const res = await window.desktopAPI.login({
            identifier: 'admin',
            password: 'Admin@12345',
            backendUrl: 'http://127.0.0.1:9999/offline'
          });
          if (res.success && res.token) {
            localStorage.setItem('sms_desktop_session_token', res.token);
            location.reload();
            return { ok: true, res };
          }
          return { ok: false, res };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      })();
    `);

    console.log('[QA_SCREENSHOTS] login response:', JSON.stringify(loginResult));
    if (!loginResult.ok) {
      console.error('[QA_SCREENSHOTS] Login failed inside renderer:', loginResult);
      app.exit(1);
      return;
    }

    // Wait for reload & dashboard rendering
    await sleep(4000);
    console.log('[QA_SCREENSHOTS] Capturing 02_dashboard_view.png...');
    await takeScreenshot('02_dashboard_view.png');

    // Navigation targets: label matching Sidebar aria-label
    const views = [
      { label: 'Students & Admissions', filename: '03_students_view.png' },
      { label: 'Daily Attendance', filename: '04_attendance_view.png' },
      { label: 'Fees & Invoicing', filename: '05_fees_view.png' },
      { label: 'Sessions & Classes', filename: '06_academics_view.png' },
      { label: 'Exams & Marks', filename: '07_exams_view.png' },
      { label: 'Faculty & Staff', filename: '08_staff_view.png' },
      { label: 'Timetable & Scheduling', filename: '09_timetable_view.png' },
      { label: 'Accounts & Expenses', filename: '10_accounts_view.png' },
      { label: 'Reports & Export', filename: '11_reports_view.png' },
    ];

    for (const v of views) {
      console.log(`[QA_SCREENSHOTS] Navigating to: ${v.label}...`);
      await win.webContents.executeJavaScript(`
        (() => {
          const btn = document.querySelector('button[aria-label="${v.label}"]');
          if (btn) btn.click();
        })();
      `);
      await sleep(1500);
      await takeScreenshot(v.filename);
    }

    // Settings view
    console.log('[QA_SCREENSHOTS] Navigating to Settings...');
    await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('button[aria-label="Settings"]');
        if (btn) btn.click();
      })();
    `);
    await sleep(1500);
    await takeScreenshot('12_settings_view.png');

    // Dark Mode verification (toggle theme and go back to dashboard)
    console.log('[QA_SCREENSHOTS] Toggling Dark Theme...');
    await win.webContents.executeJavaScript(`
      (() => {
        const themeBtn = document.querySelector('button[aria-label="Toggle theme"]');
        if (themeBtn) themeBtn.click();
        const dashBtn = document.querySelector('button[aria-label="Dashboard"]');
        if (dashBtn) dashBtn.click();
      })();
    `);
    await sleep(1500);
    await takeScreenshot('13_dark_theme_dashboard.png');

    console.log('[QA_SCREENSHOTS] ALL 13 SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } catch (error) {
    console.error('[QA_SCREENSHOTS] Capture error:', error);
  } finally {
    try {
      closeDatabase();
    } catch {}
    win.destroy();
    app.quit();
  }
});
