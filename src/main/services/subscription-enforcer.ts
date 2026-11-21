import Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';
import { LicenseService, LicenseStatusInfo } from './license.service';
import { DatabaseKeyManager } from '../security/database-key-manager';
import { SessionManager } from '../security/session-manager';

export interface SubscriptionCheckResult {
  isValid: boolean;
  state: string;
  expiresAt: string | null;
  serverTime: string | null;
  message?: string;
  requiresOnlineRenewal: boolean;
}

export class SubscriptionEnforcer {
  private static instance: SubscriptionEnforcer | null = null;
  private timer: NodeJS.Timeout | null = null;
  private licenseService: LicenseService;
  private keyManager: DatabaseKeyManager;
  private isExpiredOrTampered: boolean = false;
  private listeners: Array<(status: LicenseStatusInfo) => void> = [];

  private sessionStartHrtime: bigint;
  private sessionStartLocalMs: number;

  constructor(private db: Database.Database) {
    this.licenseService = new LicenseService(db);
    this.keyManager = DatabaseKeyManager.getInstance();
    this.sessionStartHrtime = process.hrtime.bigint();
    this.sessionStartLocalMs = Date.now();
  }

  public static getInstance(db: Database.Database): SubscriptionEnforcer {
    if (!SubscriptionEnforcer.instance) {
      SubscriptionEnforcer.instance = new SubscriptionEnforcer(db);
    }
    return SubscriptionEnforcer.instance;
  }

  /**
   * Starts independent periodic subscription enforcement timer.
   * Checks every intervalMs (default 10s) without requiring internet connection.
   */
  public startPeriodicEnforcement(intervalMs: number = 10000): void {
    this.stopPeriodicEnforcement();
    // Run initial check immediately
    this.checkStatusAndEnforce();

    this.timer = setInterval(() => {
      this.checkStatusAndEnforce();
    }, intervalMs);
  }

  public stopPeriodicEnforcement(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public evaluate(): SubscriptionCheckResult {
    return this.checkStatusAndEnforce();
  }

  /**
   * Evaluates subscription validity, monotonic continuity, clock tampering and expiration.
   * Enforces immediate fail-closed state upon violation.
   */
  public checkStatusAndEnforce(): SubscriptionCheckResult {
    const now = Date.now();
    const TOLERANCE_MS = 60 * 1000; // 1 minute drift tolerance

    // 1. Monotonic elapsed time check while running
    const elapsedMonoMs = Number((process.hrtime.bigint() - this.sessionStartHrtime) / 1000000n);
    const expectedCurrentMinMs = this.sessionStartLocalMs + elapsedMonoMs;

    if (now < expectedCurrentMinMs - TOLERANCE_MS) {
      try {
        this.db.prepare("UPDATE license_cache SET clock_tampered = 1, updated_at = datetime('now') WHERE id = 1").run();
      } catch {}
    }

    // 2. Persisted checkpoint discontinuity check (detects clock rollback across shutdown)
    try {
      const lastCheckpoint = this.db.prepare('SELECT * FROM subscription_checkpoints ORDER BY id DESC LIMIT 1').get() as any;
      if (lastCheckpoint?.recorded_local_time) {
        const lastTimeMs = new Date(lastCheckpoint.recorded_local_time).getTime();
        if (now < lastTimeMs - TOLERANCE_MS) {
          this.db.prepare("UPDATE license_cache SET clock_tampered = 1, updated_at = datetime('now') WHERE id = 1").run();
        }
      }
    } catch {}

    const status = this.licenseService.getStatus();

    const isExpired = status.state === 'expired';
    const isGraceExpired = status.state === 'grace_expired';
    const isClockTampered = status.state === 'clock_tampered';
    const isRevoked = status.state === 'revoked';
    const isDeviceMismatch = status.state === 'device_mismatch';
    const isUnactivated = status.state === 'unactivated';

    // Approved Decision 1 (docs/ARCHITECTURE-ADDENDUM.md Section 11):
    // - Clock tampering, revoked license, or device mismatch -> fail-closed (lock SQLCipher key until online revalidation).
    // - Normal subscription expiry / grace expiry -> read-only mode (key stays unlocked; backup & export remain available; no writes or sync).
    const mustLockKey = isClockTampered || isRevoked || isDeviceMismatch;
    const isReadOnlyExpired = (isExpired || isGraceExpired) && !mustLockKey;

    if (mustLockKey) {
      this.isExpiredOrTampered = true;

      const reason = isClockTampered ? 'CLOCK_TAMPERED' : isRevoked ? 'LICENSE_REVOKED' : 'DEVICE_MISMATCH';
      this.keyManager.lock(reason);

      try {
        SessionManager.revokeAllSessions(this.db);
      } catch {}

      this.broadcastToRenderers('subscription:status-changed', status);

      return {
        isValid: false,
        state: status.state,
        expiresAt: status.expiresAt,
        serverTime: status.lastServerVerification,
        message: status.message || 'License integrity violation detected. Online revalidation required.',
        requiresOnlineRenewal: true,
      };
    }

    if (isReadOnlyExpired) {
      this.isExpiredOrTampered = true;
      // Preserve read-only access for local data, backup, and export (do NOT lock SQLCipher key or delete local data)
      this.broadcastToRenderers('subscription:status-changed', { ...status, readOnly: true, canBackup: true, canExport: true });

      return {
        isValid: false,
        state: status.state,
        expiresAt: status.expiresAt,
        serverTime: status.lastServerVerification,
        message: status.message || 'Subscription expired. Application is in read-only mode; backup and export remain available.',
        requiresOnlineRenewal: true,
      };
    }

    // Record authenticated checkpoint in SQLite table
    try {
      this.db.prepare(`
        INSERT INTO subscription_checkpoints (school_id, recorded_server_time, recorded_local_time, monotonic_offset_ms)
        VALUES (?, ?, ?, ?)
      `).run(
        status.schoolId || 'unknown',
        status.lastServerVerification || new Date(now).toISOString(),
        new Date(now).toISOString(),
        elapsedMonoMs
      );
    } catch {}

    // Subscription is valid
    if (this.isExpiredOrTampered || this.keyManager.getStatus().isLocked) {
      // Re-activated or renewed! Unlock key manager
      this.keyManager.unlock();
      this.isExpiredOrTampered = false;
      this.broadcastToRenderers('subscription:status-changed', status);
    }

    return {
      isValid: true,
      state: status.state,
      expiresAt: status.expiresAt,
      serverTime: status.lastServerVerification,
      message: status.message,
      requiresOnlineRenewal: false,
    };
  }

  /**
   * Asserts subscription validity before sensitive school operations.
   * Throws SUBSCRIPTION_EXPIRED error if expired or tampered.
   */
  public assertActiveSubscription(): void {
    const check = this.checkStatusAndEnforce();
    if (!check.isValid) {
      throw new Error(`SUBSCRIPTION_EXPIRED: Access to school workspace is blocked. Reason: ${check.message || check.state}. Internet connection and subscription renewal are required.`);
    }
  }

  /**
   * Broadcasts subscription status change to all open BrowserWindow instances.
   */
  private broadcastToRenderers(channel: string, payload: any): void {
    try {
      if (typeof BrowserWindow !== 'undefined' && BrowserWindow.getAllWindows) {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send(channel, payload);
          }
        }
      }
    } catch {}
  }
}

