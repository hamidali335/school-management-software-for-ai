import path from 'path';
import fs from 'fs';

export function getBetterSqliteNativeBinding(): string | undefined {
  if (process.versions && process.versions.electron) {
    const candidates = [
      path.join(__dirname, '../../node_modules/better-sqlite3/build/Release/better_sqlite3_electron.node'),
      path.join(__dirname, '../../../node_modules/better-sqlite3/build/Release/better_sqlite3_electron.node'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3_electron.node'),
      path.join(process.resourcesPath || '', 'node_modules/better-sqlite3/build/Release/better_sqlite3_electron.node'),
      path.resolve(process.cwd(), 'node_modules/better-sqlite3/build/Release/better_sqlite3_electron.node')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }
  }
  return undefined;
}
