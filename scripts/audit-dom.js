const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { initDatabase, closeDatabase } = require('../dist/main/database/connection');
const { DatabaseKeyManager } = require('../dist/main/security/database-key-manager');
const { seedDemoData } = require('../dist/main/database/seed');
const { registerIpcHandlers } = require('../dist/main/ipc/handlers');

app.whenReady().then(async () => {
  const testDbPath = path.join(app.getPath('userData'), 'audit_dom.db');
  const testVaultDir = path.join(app.getPath('userData'), 'audit_dom_vault');
  DatabaseKeyManager.resetInstanceForTesting();
  const db = initDatabase(testDbPath, { vaultDir: testVaultDir });
  try { seedDemoData(db); } catch {}
  registerIpcHandlers();

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
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

  await new Promise((r) => setTimeout(r, 3000));

  const domReport = await win.webContents.executeJavaScript(`
    (() => {
      const header = document.querySelector('header');
      const footer = document.querySelector('footer');
      const sidebar = document.querySelector('aside');
      const main = document.querySelector('main');
      const navButtons = Array.from(sidebar ? sidebar.querySelectorAll('button') : []).map(b => ({
        text: b.innerText.trim(),
        title: b.getAttribute('title'),
        ariaLabel: b.getAttribute('aria-label')
      }));

      return {
        header: header ? {
          rect: header.getBoundingClientRect(),
          children: Array.from(header.children).map(c => ({
            rect: c.getBoundingClientRect(),
            text: c.innerText.trim(),
            html: c.innerHTML.slice(0, 100)
          }))
        } : null,
        footer: footer ? {
          rect: footer.getBoundingClientRect(),
          children: Array.from(footer.children).map(c => ({
            rect: c.getBoundingClientRect(),
            text: c.innerText.trim(),
            html: c.innerHTML.slice(0, 100)
          }))
        } : null,
        sidebar: sidebar ? {
          rect: sidebar.getBoundingClientRect(),
          navButtonsCount: navButtons.length,
          navButtons
        } : null,
        main: main ? {
          rect: main.getBoundingClientRect(),
          scrollWidth: main.scrollWidth,
          clientWidth: main.clientWidth,
          hasHorizontalScroll: main.scrollWidth > main.clientWidth
        } : null
      };
    })()
  `);

  console.log('--- DOM REPORT ---');
  console.log(JSON.stringify(domReport, null, 2));

  try { closeDatabase(); } catch {}
  win.destroy();
  app.quit();
});
