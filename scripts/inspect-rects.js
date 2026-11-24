const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { initDatabase, closeDatabase } = require('../dist/main/database/connection');
const { DatabaseKeyManager } = require('../dist/main/security/database-key-manager');
const { seedDemoData } = require('../dist/main/database/seed');
const { registerIpcHandlers } = require('../dist/main/ipc/handlers');

app.whenReady().then(async () => {
  const testDbPath = path.join(app.getPath('userData'), 'audit_rects.db');
  const testVaultDir = path.join(app.getPath('userData'), 'audit_rects_vault');
  DatabaseKeyManager.resetInstanceForTesting();
  const db = initDatabase(testDbPath, { vaultDir: testVaultDir });
  try { seedDemoData(db); } catch {}
  registerIpcHandlers();

  // In Electron, to get 1280x720 CSS viewport on 2x DPI:
  const win = new BrowserWindow({
    width: 2560,
    height: 1440,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../dist/preload/preload.js'),
    },
  });

  await win.loadFile(path.join(__dirname, '../dist/renderer/index.html'));

  await win.webContents.executeJavaScript(`
    (async () => {
      const res = await window.desktopAPI.login({ identifier: 'admin', password: 'Admin@12345' });
      if (res.token) {
        localStorage.setItem('sms_desktop_session_token', res.token);
        location.reload();
      }
    })();
  `);

  await new Promise((r) => setTimeout(r, 2500));

  const rects = await win.webContents.executeJavaScript(`
    (() => {
      const aside = document.querySelector('aside');
      const header = document.querySelector('header');
      const main = document.querySelector('main');
      const footer = document.querySelector('footer');
      const titlebar = document.querySelector('.window-drag-region');
      return {
        windowInnerWidth: window.innerWidth,
        windowInnerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        titlebar: titlebar ? { width: titlebar.offsetWidth, height: titlebar.offsetHeight } : null,
        aside: aside ? { width: aside.offsetWidth, height: aside.offsetHeight } : null,
        header: header ? { width: header.offsetWidth, height: header.offsetHeight } : null,
        main: main ? { width: main.offsetWidth, height: main.offsetHeight, clientWidth: main.clientWidth, scrollWidth: main.scrollWidth } : null,
        footer: footer ? { width: footer.offsetWidth, height: footer.offsetHeight } : null
      };
    })()
  `);

  console.log('--- RECTS AT 1280x720 CSS VIEWPORT ---');
  console.log(JSON.stringify(rects, null, 2));

  try { closeDatabase(); } catch {}
  win.destroy();
  app.quit();
});
