const { spawn } = require('child_process');
const path = require('path');

const exePath = path.resolve(__dirname, '../release/win-unpacked/School Management Software.exe');
console.log(`Testing packaged executable: ${exePath}`);

const env = { ...process.env, TEST_LAUNCH: '1' };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(`"${exePath}"`, [], {
  cwd: path.dirname(exePath),
  env,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (d) => {
  const str = d.toString();
  stdout += str;
  process.stdout.write(str);
});

child.stderr.on('data', (d) => {
  const str = d.toString();
  stderr += str;
  process.stderr.write(str);
});

child.on('close', (code) => {
  console.log(`Packaged app exited with code: ${code}`);
  if (code === 0 && stdout.includes('[TEST_LAUNCH_SUCCESS]')) {
    console.log('SUCCESS: Packaged application launched, initialized SQLite and IPC, and exited cleanly.');
    process.exit(0);
  } else {
    console.error('FAILURE: Packaged app did not launch successfully.');
    console.error('STDOUT:', stdout);
    console.error('STDERR:', stderr);
    process.exit(1);
  }
});
