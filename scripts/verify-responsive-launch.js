const { spawn } = require('node:child_process');
const path = require('node:path');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const runnerPath = path.resolve(__dirname, 'responsive-runner.js');
const child = spawn(electron, [runnerPath], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
child.stdout.on('data', (d) => {
  stdout += d.toString();
  process.stdout.write(d.toString());
});
child.stderr.on('data', (d) => {
  process.stderr.write(d.toString());
});

child.on('close', (code) => {
  if (code === 0 && stdout.includes('[ALL_RESOLUTIONS_AND_SCALING_VERIFIED_SUCCESS]')) {
    console.log('✅ RESPONSIVE VERIFICATION PASSED across all requested viewports (1100x700 to 2560x1440) and scale factors (100% to 200%).');
    process.exit(0);
  } else {
    console.error('❌ RESPONSIVE VERIFICATION FAILED with code ' + code);
    process.exit(1);
  }
});
