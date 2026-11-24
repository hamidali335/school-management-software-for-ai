const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { initDatabase, closeDatabase } = require('../dist/main/database/connection');
const { DatabaseKeyManager } = require('../dist/main/security/database-key-manager');
const { seedDemoData } = require('../dist/main/database/seed');
const { registerIpcHandlers } = require('../dist/main/ipc/handlers');

const OUT_DIR = path.resolve(__dirname, '../qa-evidence/audit_1280_1366');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

app.whenReady().then(async () => {
  const testDbPath = path.join(app.getPath('userData'), 'audit_views.db');
  const testVaultDir = path.join(app.getPath('userData'), 'audit_views_vault');
  DatabaseKeyManager.resetInstanceForTesting();
  const db = initDatabase(testDbPath, { vaultDir: testVaultDir });
  try { seedDemoData(db); } catch {}
  registerIpcHandlers();

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../dist/preload/preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));

  // Log in
  await win.webContents.executeJavaScript(`
    (async () => {
      const res = await window.desktopAPI.login({
        identifier: 'admin',
        password: 'Admin@12345',
      });
      if (res.success && res.token) {
        localStorage.setItem('sms_desktop_session_token', res.token);
        location.reload();
      }
    })();
  `);

  await sleep(3000);

  async function capture(name, width, height) {
    win.setSize(width, height);
    await sleep(800);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT_DIR, `${name}_${width}x${height}.png`), img.toPNG());
  }

  const viewsToTest = [
    { id: 'dashboard', name: '01_dashboard' },
    { id: 'students', name: '02_students' },
    { id: 'attendance', name: '03_attendance' },
    { id: 'fees', name: '04_fees' },
    { id: 'academics', name: '05_academics' },
    { id: 'examinations', name: '06_exams' },
    { id: 'staff', name: '07_staff' },
    { id: 'timetable', name: '08_timetable' },
    { id: 'accounts', name: '09_accounts' },
    { id: 'reports', name: '10_reports' },
    { id: 'settings', name: '11_settings' },
    { id: 'sync-center', name: '12_sync_center' },
  ];

  const results = [];

  for (const v of viewsToTest) {
    // Navigate via JavaScript by finding button with text
    await win.webContents.executeJavaScript(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('aside nav button'));
        const target = buttons.find(b => b.innerText.toLowerCase().includes('${v.id}') || b.innerText.toLowerCase().includes('${v.name.slice(3)}'));
        if (target) target.click();
      })();
    `);
    await sleep(1000);

    // Test 1280x720
    await capture(v.name, 1280, 720);
    const metrics1280 = await win.webContents.executeJavaScript(`
      (() => {
        const main = document.querySelector('main');
        return {
          view: '${v.id}',
          viewport: '1280x720',
          scrollWidth: main ? main.scrollWidth : 0,
          clientWidth: main ? main.clientWidth : 0,
          hasHScroll: main ? main.scrollWidth > main.clientWidth : false,
          scrollHeight: main ? main.scrollHeight : 0,
          clientHeight: main ? main.clientHeight : 0,
          hasVScroll: main ? main.scrollHeight > main.clientHeight : false
        };
      })()
    `);
    results.push(metrics1280);

    // Test 1366x768
    await capture(v.name, 1366, 768);
    const metrics1366 = await win.webContents.executeJavaScript(`
      (() => {
        const main = document.querySelector('main');
        return {
          view: '${v.id}',
          viewport: '1366x768',
          scrollWidth: main ? main.scrollWidth : 0,
          clientWidth: main ? main.clientWidth : 0,
          hasHScroll: main ? main.scrollWidth > main.clientWidth : false,
          scrollHeight: main ? main.scrollHeight : 0,
          clientHeight: main ? main.clientHeight : 0,
          hasVScroll: main ? main.scrollHeight > main.clientHeight : false
        };
      })()
    `);
    results.push(metrics1366);
  }

  console.log('=== AUDIT RESULTS ACROSS VIEWPORTS ===');
  console.log(JSON.stringify(results, null, 2));

  try { closeDatabase(); } catch {}
  win.destroy();
  app.quit();
});
