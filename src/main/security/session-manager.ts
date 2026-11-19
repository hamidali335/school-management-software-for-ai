import Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface SessionData {
  sessionId: string;
  token: string;
  userId: string;
  schoolId: string;
  expiresAt: string;
}

export interface ValidatedSession {
  isValid: boolean;
  sessionId?: string;
  userId?: string;
  schoolId?: string;
  role?: string;
  permissions?: string[];
  userName?: string;
  userEmail?: string;
  userStatus?: string;
  reason?: string;
}

export class SessionManager {
  private static SESSION_SLIDE_MS = 8 * 60 * 60 * 1000;  // 8 hours slide
  private static IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;   // 4 hours idle timeout
  private static MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours max session age

  public static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  public static createSession(db: Database.Database, userId: string, schoolId: string): SessionData {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const sessionId = 'sess_' + crypto.randomBytes(16).toString('hex');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.SESSION_SLIDE_MS).toISOString();
    const nowIso = now.toISOString();

    const stmt = db.prepare(`
      INSERT INTO auth_sessions (
        id, user_id, school_id, session_token_hash, created_at, expires_at, last_activity_at, is_revoked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);

    stmt.run(sessionId, userId, schoolId, tokenHash, nowIso, expiresAt, nowIso);

    return {
      sessionId,
      token: rawToken,
      userId,
      schoolId,
      expiresAt,
    };
  }

  public static validateSession(db: Database.Database, rawToken: string): ValidatedSession {
    if (!rawToken || typeof rawToken !== 'string') {
      return { isValid: false, reason: 'Missing or malformed session token' };
    }

    const tokenHash = this.hashToken(rawToken);

    const row = db.prepare(`
      SELECT 
        s.id as session_id, s.user_id, s.school_id, s.created_at, s.expires_at, s.last_activity_at, s.is_revoked,
        u.name, u.email, u.role, u.permissions_json, u.status as user_status, u.lock_until
      FROM auth_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token_hash = ?
    `).get(tokenHash) as any;

    if (!row) {
      return { isValid: false, reason: 'Session not found' };
    }

    if (row.is_revoked === 1) {
      return { isValid: false, reason: 'Session has been revoked' };
    }

    const now = new Date();
    const expiresAt = new Date(row.expires_at);
    const createdAt = new Date(row.created_at);
    const lastActivity = new Date(row.last_activity_at);

    // 1. Check absolute session expiration
    if (now.getTime() > expiresAt.getTime()) {
      return { isValid: false, reason: 'Session has expired' };
    }

    // 2. Check maximum session lifetime (24 hours from initial creation)
    if (now.getTime() - createdAt.getTime() > this.MAX_SESSION_AGE_MS) {
      this.revokeSession(db, rawToken);
      return { isValid: false, reason: 'Session reached maximum 24-hour lifetime. Please sign in again.' };
    }

    // 3. Check idle inactivity timeout (4 hours)
    if (now.getTime() - lastActivity.getTime() > this.IDLE_TIMEOUT_MS) {
      this.revokeSession(db, rawToken);
      return { isValid: false, reason: 'Session expired due to 4 hours of inactivity' };
    }

    // 4. Live check of user account status
    if (row.user_status !== 'active') {
      return { isValid: false, reason: `User account is ${row.user_status}` };
    }

    // 5. Live check of account lockout
    if (row.lock_until && new Date(row.lock_until).getTime() > now.getTime()) {
      return { isValid: false, reason: 'Account is temporarily locked' };
    }

    // 6. Sliding window: update last_activity_at and extend expires_at up to MAX_SESSION_AGE
    const maxExpiryTime = createdAt.getTime() + this.MAX_SESSION_AGE_MS;
    const prospectiveExpiry = now.getTime() + this.SESSION_SLIDE_MS;
    const newExpiresAt = new Date(Math.min(prospectiveExpiry, maxExpiryTime)).toISOString();

    db.prepare(`
      UPDATE auth_sessions 
      SET last_activity_at = ?, expires_at = ?
      WHERE id = ?
    `).run(now.toISOString(), newExpiresAt, row.session_id);

    let permissions: string[] = [];
    try {
      permissions = JSON.parse(row.permissions_json || '[]');
    } catch {
      permissions = [];
    }

    return {
      isValid: true,
      sessionId: row.session_id,
      userId: row.user_id,
      schoolId: row.school_id,
      role: row.role,
      permissions,
      userName: row.name,
      userEmail: row.email,
      userStatus: row.user_status,
    };
  }

  public static revokeSession(db: Database.Database, rawToken: string): boolean {
    if (!rawToken) return false;
    const tokenHash = this.hashToken(rawToken);
    const result = db.prepare('UPDATE auth_sessions SET is_revoked = 1 WHERE session_token_hash = ?').run(tokenHash);
    return result.changes > 0;
  }

  public static revokeAllSessions(db: Database.Database): number {
    const result = db.prepare('UPDATE auth_sessions SET is_revoked = 1 WHERE is_revoked = 0').run();
    return result.changes;
  }

  public static revokeAllUserSessions(db: Database.Database, userId: string): number {
    const result = db.prepare('UPDATE auth_sessions SET is_revoked = 1 WHERE user_id = ? AND is_revoked = 0').run(userId);
    return result.changes;
  }

  /**
   * Invalidates all other active sessions for a user, preserving the current caller session.
   * Explicitly follows the security policy of preventing unauthorized parallel access after credential updates.
   */
  public static revokeOtherUserSessions(db: Database.Database, userId: string, currentRawToken: string): number {
    if (!currentRawToken) return this.revokeAllUserSessions(db, userId);
    const currentHash = this.hashToken(currentRawToken);
    const result = db.prepare(`
      UPDATE auth_sessions 
      SET is_revoked = 1 
      WHERE user_id = ? AND session_token_hash != ? AND is_revoked = 0
    `).run(userId, currentHash);
    return result.changes;
  }

  public static cleanupExpiredSessions(db: Database.Database): number {
    const nowIso = new Date().toISOString();
    const result = db.prepare('DELETE FROM auth_sessions WHERE expires_at < ? OR is_revoked = 1').run(nowIso);
    return result.changes;
  }
}
