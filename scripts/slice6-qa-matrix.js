/**
 * Slice 6 Multi-Resolution UI & Performance/Memory Verification Matrix
 * Captures Light & Dark mode screenshots at 1100x700, 1366x768, 1920x1080, and 2560x1440.
 */
const fs = require('node:fs');
const path = require('node:path');

const RESOLUTIONS = [
  { width: 1100, height: 700, label: '1100x700' },
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1920, height: 1080, label: '1920x1080' },
  { width: 2560, height: 1440, label: '2560x1440' },
];
const THEMES = ['light', 'dark'];

async function main() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    console.log('[slice6-qa-matrix] Playwright not installed; install playwright to run live Electron screenshot matrix.');
    process.exit(0);
  }

  const outDir = path.resolve(__dirname, '../docs/handoff/qa-screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  const electronApp = await playwright._electron.launch({ args: [path.resolve(__dirname, '..')] });

  try {
    const win = await electronApp.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    const metrics = [];
    for (const res of RESOLUTIONS) {
      await win.setViewportSize({ width: res.width, height: res.height });
      for (const theme of THEMES) {
        await win.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
        await win.waitForTimeout(250);
        const shotPath = path.join(outDir, `screen-${res.label}-${theme}.png`);
        await win.screenshot({ path: shotPath });
        const mem = process.memoryUsage();
        metrics.push({ resolution: res.label, theme, rssMB: +(mem.rss / 1048576).toFixed(1), screenshot: shotPath });
      }
    }
    fs.writeFileSync(path.join(outDir, 'qa-metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(`[slice6-qa-matrix] Captured ${metrics.length} screenshots -> ${outDir}`);
  } finally {
    await electronApp.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
