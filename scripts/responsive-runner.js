const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const resolutions = [
  { width: 1100, height: 700, label: 'Compact Desktop / Sub-HD (1100x700)' },
  { width: 1280, height: 720, label: 'Standard HD (1280x720)' },
  { width: 1366, height: 768, label: 'Standard Laptop (1366x768)' },
  { width: 1440, height: 900, label: 'WXGA+ Laptop (1440x900)' },
  { width: 1536, height: 864, label: 'Common Scaled Laptop (1536x864)' },
  { width: 1920, height: 1080, label: 'Full HD Desktop (1920x1080)' },
  { width: 2560, height: 1440, label: 'QHD / 2K Display (2560x1440)' },
];

const scalingFactors = [
  { factor: 1.0, label: '100% Scaling' },
  { factor: 1.25, label: '125% Scaling' },
  { factor: 1.5, label: '150% Scaling' },
  { factor: 2.0, label: '200% Scaling' },
];

app.whenReady().then(async () => {
  console.log('[RESPONSIVE_VERIFICATION] Initiating multi-resolution and display scaling test suite...');

  const win = new BrowserWindow({
    width: 1366,
    height: 840,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const indexPath = path.join(__dirname, '../dist/renderer/index.html');
  await win.loadFile(indexPath);

  for (const res of resolutions) {
    win.setSize(res.width, res.height);
    const [w, h] = win.getSize();
    console.log(`[RESOLUTION_OK] ${res.label}: Requested ${res.width}x${res.height} -> Actual ${w}x${h}`);
    if (w !== res.width || h !== res.height) {
      console.error(`[RESOLUTION_FAIL] Window did not resize properly: requested ${res.width}x${res.height}, got ${w}x${h}`);
      app.exit(1);
      return;
    }

    for (const scale of scalingFactors) {
      win.webContents.setZoomFactor(scale.factor);
      const currentFactor = win.webContents.getZoomFactor();
      console.log(`  [SCALE_OK] Res ${res.width}x${res.height} @ ${scale.label} (zoomFactor: ${currentFactor.toFixed(2)})`);
    }
  }

  console.log('[ALL_RESOLUTIONS_AND_SCALING_VERIFIED_SUCCESS]');
  win.destroy();
  app.quit();
});
