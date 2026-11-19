const { spawn } = require('node:child_process');
const path = require('node:path');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [path.join(__dirname, 'capture-qa-screenshots.js')], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
});

child.on('close', (code) => {
  console.log(`[CAPTURE_RUNNER] Exited with code: ${code}`);
  process.exit(code || 0);
});
