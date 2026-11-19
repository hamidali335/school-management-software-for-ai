import Database from 'better-sqlite3';
import { Migration } from './migration-runner';

export const migration002AuthSchema: Migration = {
  version: 2,
  name: '002_auth_schema',
  up: (db: Database.Database) => {
    db.exec(`
      -- Users Table (Administrator & School Staff Accounts)
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        school_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        username TEXT,
        phone TEXT,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('school_owner', 'principal', 'school_admin', 'accountant', 'teacher', 'staff')),
        permissions_json TEXT NOT NULL DEFAULT '[]',
        status TEXT DEFAULT 'active' CHECK(status IN ('pending', 'active', 'suspended', 'disabled')),
        status_reason TEXT,
        failed_login_count INTEGER DEFAULT 0,
        lock_until TEXT,
        last_login_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      -- Unique user indexes scoped strictly to the local school
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_email ON users(school_id, email) WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_username ON users(school_id, username) WHERE username IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(school_id, status);

      -- Local Sessions Table (Stateful Session Management with Expiry & Sliding Window)
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        school_id TEXT NOT NULL,
        session_token_hash TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        is_revoked INTEGER DEFAULT 0,
        ip_address TEXT DEFAULT '127.0.0.1',
        user_agent TEXT DEFAULT 'Electron Desktop',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (school_id) REFERENCES installation_config(school_id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id, is_revoked);
      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON auth_sessions(session_token_hash);
    `);
  },
};
