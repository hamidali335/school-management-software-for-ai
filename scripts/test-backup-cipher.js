const Database = require('better-sqlite3');
const fs = require('fs');

if (fs.existsSync('src.db')) fs.unlinkSync('src.db');
if (fs.existsSync('dst.db')) fs.unlinkSync('dst.db');

const db = new Database('src.db');
db.pragma("cipher = 'sqlcipher'");
db.pragma("key = 'testpass'");
db.pragma('journal_mode = WAL');
db.exec('CREATE TABLE test (name TEXT)');
db.prepare('INSERT INTO test VALUES (?)').run('hello');

// Method 1: wal_checkpoint(TRUNCATE) then copyFileSync
db.pragma('wal_checkpoint(TRUNCATE)');
fs.copyFileSync('src.db', 'dst.db');

const dstDb = new Database('dst.db');
dstDb.pragma("cipher = 'sqlcipher'");
dstDb.pragma("key = 'testpass'");
const rows = dstDb.prepare('SELECT * FROM test').all();
console.log('Method 1 (wal_checkpoint + copyFileSync) succeeded! Rows:', rows);
dstDb.close();

// Method 2: VACUUM INTO
try {
  db.exec("VACUUM INTO 'dst2.db'");
  const dst2Db = new Database('dst2.db');
  dst2Db.pragma("cipher = 'sqlcipher'");
  dst2Db.pragma("key = 'testpass'");
  const rows2 = dst2Db.prepare('SELECT * FROM test').all();
  console.log('Method 2 (VACUUM INTO) succeeded! Rows:', rows2);
  dst2Db.close();
  fs.unlinkSync('dst2.db');
} catch (e) {
  console.log('Method 2 failed:', e.message);
}

db.close();
fs.unlinkSync('src.db');
fs.unlinkSync('dst.db');
