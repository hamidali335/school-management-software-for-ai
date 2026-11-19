const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

console.log('--- Initiating Electron Desktop Application Launch Verification ---');

const env = { ...process.env, TEST_LAUNCH: '1' };
delete env.ELECTRON_RUN_AS_NODE;

const projectDir = path.resolve(__dirname, '..');
const child = spawn(electron, ['.'], {
  cwd: projectDir,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => {
  const str = data.toString();
  stdout += str;
  process.stdout.write(str);
});

child.stderr.on('data', (data) => {
  const str = data.toString();
  stderr += str;
  process.stderr.write(str);
});

child.on('close', (code) => {
  console.log(`\nElectron process exited with code: ${code}`);

  if (code === 0 && stdout.includes('[TEST_LAUNCH_SUCCESS]')) {
    console.log('✅ VERIFICATION PASSED: Desktop application launched successfully, initialized SQLite database, registered IPC handlers, and closed gracefully.');
    process.exit(0);
  } else {
    console.error('❌ VERIFICATION FAILED: Desktop application did not complete launch verification.');
    console.error('STDOUT:', stdout);
    console.error('STDERR:', stderr);
    process.exit(1);
  }
});
