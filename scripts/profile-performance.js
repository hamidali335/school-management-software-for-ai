const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { ALL_MIGRATIONS, runMigrations } = require('../dist/main/database/migrations');
const { seedDemoData } = require('../dist/main/database/seed');
const { DatabaseKeyManager } = require('../dist/main/security/database-key-manager');
const { AuthService } = require('../dist/main/services/auth.service');
const { StudentService } = require('../dist/main/services/student.service');
const { FeeService } = require('../dist/main/services/fee.service');
const { ReportService } = require('../dist/main/services/report.service');

const PROFILE_DIR = path.resolve(__dirname, '../qa-evidence');
const PROFILE_DB = path.resolve(PROFILE_DIR, 'profile_run.sqlite');
const PROFILE_VAULT = path.resolve(PROFILE_DIR, 'profile_vault');

async function runProfiling() {
  console.log('=== School Management Software — Performance & Reliability Profiling ===\n');

  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
  if (fs.existsSync(PROFILE_VAULT)) fs.rmSync(PROFILE_VAULT, { recursive: true, force: true });
  for (const ext of ['', '-wal', '-shm']) {
    if (fs.existsSync(PROFILE_DB + ext)) fs.unlinkSync(PROFILE_DB + ext);
  }

  // 1. Cold Startup & Key Unsealing
  const t0 = process.hrtime.bigint();
  DatabaseKeyManager.resetInstanceForTesting();
  const keyManager = DatabaseKeyManager.getInstance(PROFILE_VAULT);
  const rawKeyHex = keyManager.getEncryptionKeyHex();
  const tKey = process.hrtime.bigint();

  const db = new Database(PROFILE_DB);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');

  runMigrations(db, ALL_MIGRATIONS);
  seedDemoData(db);
  const tInit = process.hrtime.bigint();

  const keyUnsealMs = Number(tKey - t0) / 1e6;
  const dbInitAndSeedMs = Number(tInit - tKey) / 1e6;
  const totalStartupMs = Number(tInit - t0) / 1e6;

  console.log(`[STARTUP] Key Unsealing Latency: ${keyUnsealMs.toFixed(2)} ms`);
  console.log(`[STARTUP] DB Migrations & Demo Seed Latency: ${dbInitAndSeedMs.toFixed(2)} ms`);
  console.log(`[STARTUP] Total Engine Cold Start: ${totalStartupMs.toFixed(2)} ms`);

  // 2. Authentication Profiling
  const authService = new AuthService(db);
  const tAuthStart = process.hrtime.bigint();
  const loginRes = await authService.login('admin', 'Admin@12345');
  const tAuthEnd = process.hrtime.bigint();
  const authLatencyMs = Number(tAuthEnd - tAuthStart) / 1e6;
  console.log(`[AUTH] Scrypt Secure Verification Latency: ${authLatencyMs.toFixed(2)} ms`);

  const session = authService.validateSession(loginRes.token);
  const studentService = new StudentService(db);
  const feeService = new FeeService(db);
  const reportService = new ReportService(db);

  // 3. Database Query Latency (100 consecutive operations)
  const queryCount = 100;
  const tQueriesStart = process.hrtime.bigint();
  for (let i = 0; i < queryCount; i++) {
    studentService.listStudents(session, { classId: 'cls_10' });
  }
  const tQueriesEnd = process.hrtime.bigint();
  const avgStudentQueryMs = (Number(tQueriesEnd - tQueriesStart) / 1e6) / queryCount;
  console.log(`[DATABASE] Student List Query (x${queryCount}): Avg ${avgStudentQueryMs.toFixed(3)} ms/query`);

  // 4. Memory Footprint
  const mem = process.memoryUsage();
  const memReport = {
    rssMb: (mem.rss / 1024 / 1024).toFixed(2),
    heapTotalMb: (mem.heapTotal / 1024 / 1024).toFixed(2),
    heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(2),
    externalMb: (mem.external / 1024 / 1024).toFixed(2),
  };
  console.log(`[MEMORY] RSS: ${memReport.rssMb} MB | Heap Total: ${memReport.heapTotalMb} MB | Heap Used: ${memReport.heapUsedMb} MB | External: ${memReport.externalMb} MB`);

  // 5. Report Generation Latency
  const tReportStart = process.hrtime.bigint();
  const rosterReport = reportService.getStudentRoster(session);
  const tReportEnd = process.hrtime.bigint();
  const reportGenMs = Number(tReportEnd - tReportStart) / 1e6;
  console.log(`[REPORTS] Student Roster Report Aggregation: ${reportGenMs.toFixed(2)} ms (${rosterReport.rows.length} rows)`);

  // CSV formatting latency
  const tCsvStart = process.hrtime.bigint();
  const bom = '\uFEFF';
  const csvHeaders = rosterReport.columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',');
  const csvData = rosterReport.rows.map(r => rosterReport.columns.map(c => `"${String(r[c.key] || '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const fullCsv = bom + csvHeaders + '\r\n' + csvData;
  const tCsvEnd = process.hrtime.bigint();
  const csvMs = Number(tCsvEnd - tCsvStart) / 1e6;
  console.log(`[EXPORTS] UTF-8 BOM CSV Serialization: ${csvMs.toFixed(3)} ms (${Buffer.byteLength(fullCsv)} bytes)`);

  // 6. Clean Database Checkpoint & Shutdown
  const tCloseStart = process.hrtime.bigint();
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  const tCloseEnd = process.hrtime.bigint();
  const closeMs = Number(tCloseEnd - tCloseStart) / 1e6;
  console.log(`[SHUTDOWN] WAL Checkpoint & Clean Database Close: ${closeMs.toFixed(2)} ms`);

  // Cleanup profiling files
  if (fs.existsSync(PROFILE_VAULT)) fs.rmSync(PROFILE_VAULT, { recursive: true, force: true });
  for (const ext of ['', '-wal', '-shm']) {
    if (fs.existsSync(PROFILE_DB + ext)) fs.unlinkSync(PROFILE_DB + ext);
  }

  const profileSummary = {
    keyUnsealMs,
    dbInitAndSeedMs,
    totalStartupMs,
    authLatencyMs,
    avgStudentQueryMs,
    memReport,
    reportGenMs,
    csvMs,
    closeMs,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(PROFILE_DIR, 'profiling-results.json'),
    JSON.stringify(profileSummary, null, 2),
    'utf8'
  );
  console.log(`\n[PROFILE_COMPLETE] Results saved to qa-evidence/profiling-results.json`);
}

runProfiling().catch((e) => {
  console.error('[PROFILE_ERROR]', e);
  process.exit(1);
});
