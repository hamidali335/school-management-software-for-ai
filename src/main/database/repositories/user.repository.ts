import Database from 'better-sqlite3';

export interface UserRecord {
  id: string;
  schoolId: string;
  name: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  passwordHash: string;
  salt: string;
  role: 'school_owner' | 'principal' | 'school_admin' | 'accountant' | 'teacher' | 'staff';
  permissions: string[];
  status: 'pending' | 'active' | 'suspended' | 'disabled';
  statusReason: string | null;
  failedLoginCount: number;
  lockUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class UserRepository {
  constructor(private db: Database.Database) {}

  public findById(schoolId: string, id: string): UserRecord | null {
    const row = this.db.prepare(`
      SELECT 
        id, school_id as schoolId, name, email, username, phone,
        password_hash as passwordHash, salt, role, permissions_json as permissionsJson,
        status, status_reason as statusReason, failed_login_count as failedLoginCount,
        lock_until as lockUntil, last_login_at as lastLoginAt,
        created_at as createdAt, updated_at as updatedAt
      FROM users
      WHERE school_id = ? AND id = ?
    `).get(schoolId, id) as any;

    if (!row) return null;
    return this.mapUser(row);
  }

  public findByIdentifier(schoolId: string, identifier: string): UserRecord | null {
    const clean = identifier.trim().toLowerCase();
    const row = this.db.prepare(`
      SELECT 
        id, school_id as schoolId, name, email, username, phone,
        password_hash as passwordHash, salt, role, permissions_json as permissionsJson,
        status, status_reason as statusReason, failed_login_count as failedLoginCount,
        lock_until as lockUntil, last_login_at as lastLoginAt,
        created_at as createdAt, updated_at as updatedAt
      FROM users
      WHERE school_id = ? AND (LOWER(email) = ? OR LOWER(username) = ?)
    `).get(schoolId, clean, clean) as any;

    if (!row) return null;
    return this.mapUser(row);
  }

  public createUser(user: {
    id: string;
    schoolId: string;
    name: string;
    email?: string | null;
    username?: string | null;
    phone?: string | null;
    passwordHash: string;
    salt: string;
    role: UserRecord['role'];
    permissions: string[];
    status?: UserRecord['status'];
  }): UserRecord {
    const now = new Date().toISOString();
    const permissionsJson = JSON.stringify(user.permissions || []);
    const status = user.status || 'active';

    this.db.prepare(`
      INSERT INTO users (
        id, school_id, name, email, username, phone, password_hash, salt,
        role, permissions_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.schoolId,
      user.name,
      user.email || null,
      user.username || null,
      user.phone || null,
      user.passwordHash,
      user.salt,
      user.role,
      permissionsJson,
      status,
      now,
      now
    );

    return this.findById(user.schoolId, user.id)!;
  }

  public upsertUser(user: {
    id: string;
    schoolId: string;
    name: string;
    email?: string | null;
    username?: string | null;
    phone?: string | null;
    passwordHash: string;
    salt: string;
    role: UserRecord['role'];
    permissions: string[];
    status?: UserRecord['status'];
  }): UserRecord {
    const now = new Date().toISOString();
    const permissionsJson = JSON.stringify(user.permissions || []);
    const status = user.status || 'active';

    this.db.prepare(`
      INSERT INTO users (
        id, school_id, name, email, username, phone, password_hash, salt,
        role, permissions_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        school_id = excluded.school_id,
        name = excluded.name,
        email = excluded.email,
        username = excluded.username,
        phone = excluded.phone,
        password_hash = excluded.password_hash,
        salt = excluded.salt,
        role = excluded.role,
        permissions_json = excluded.permissions_json,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      user.id,
      user.schoolId,
      user.name,
      user.email || null,
      user.username || null,
      user.phone || null,
      user.passwordHash,
      user.salt,
      user.role,
      permissionsJson,
      status,
      now,
      now
    );

    return this.findById(user.schoolId, user.id)!;
  }

  public recordFailedLogin(schoolId: string, userId: string, maxAttempts = 5, lockoutDurationMs = 15 * 60 * 1000): { isLocked: boolean; lockUntil: string | null; attempts: number } {
    const user = this.findById(schoolId, userId);
    if (!user) return { isLocked: false, lockUntil: null, attempts: 0 };

    const newCount = (user.failedLoginCount || 0) + 1;
    let lockUntil: string | null = null;
    let isLocked = false;

    if (newCount >= maxAttempts) {
      lockUntil = new Date(Date.now() + lockoutDurationMs).toISOString();
      isLocked = true;
    }

    this.db.prepare(`
      UPDATE users 
      SET failed_login_count = ?, lock_until = ?, updated_at = datetime('now')
      WHERE school_id = ? AND id = ?
    `).run(newCount, lockUntil, schoolId, userId);

    return { isLocked, lockUntil, attempts: newCount };
  }

  public resetFailedLogins(schoolId: string, userId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE users 
      SET failed_login_count = 0, lock_until = NULL, last_login_at = ?, updated_at = ?
      WHERE school_id = ? AND id = ?
    `).run(now, now, schoolId, userId);
  }

  public updatePassword(schoolId: string, userId: string, passwordHash: string, salt: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE users 
      SET password_hash = ?, salt = ?, updated_at = ?
      WHERE school_id = ? AND id = ?
    `).run(passwordHash, salt, now, schoolId, userId);
  }

  public countUsers(schoolId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM users WHERE school_id = ?').get(schoolId) as { c: number };
    return row.c;
  }

  private mapUser(row: any): UserRecord {
    let permissions: string[] = [];
    try {
      permissions = JSON.parse(row.permissionsJson || '[]');
    } catch {
      permissions = [];
    }

    return {
      id: row.id,
      schoolId: row.schoolId,
      name: row.name,
      email: row.email,
      username: row.username,
      phone: row.phone,
      passwordHash: row.passwordHash,
      salt: row.salt,
      role: row.role,
      permissions,
      status: row.status,
      statusReason: row.statusReason,
      failedLoginCount: row.failedLoginCount,
      lockUntil: row.lockUntil,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
