import Database from 'better-sqlite3';
import { DeviceFingerprint } from '../security/device-fingerprint';
import { LicenseVerifier, SignedLicensePayload } from '../security/license-verifier';
import { CredentialVault } from '../security/credential-vault';

export type LicenseState =
  | 'active'
  | 'offline_grace'
  | 'renewal_required'
  | 'grace_ending_soon'
  | 'grace_expired'
  | 'expired'
  | 'revoked'
  | 'device_mismatch'
  | 'clock_tampered'
  | 'unactivated';

export interface LicenseStatusInfo {
  state: LicenseState;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  deviceId: string;
  planCode: string;
  planName: string;
  issuedAt: string | null;
  expiresAt: string | null;
  gracePeriodDays: number;
  graceDaysRemaining: number;
  lastServerVerification: string | null;
  entitlements: string[];
  limits: Record<string, any>;
  canRead: boolean;
  canWrite: boolean;
  message?: string;
}

export class LicenseService {
  private static monotonicAnchorTime: bigint = process.hrtime.bigint();
  private static localAnchorTimeMs: number = Date.now();

  constructor(private db: Database.Database) {}

  /**
   * Evaluates the comprehensive local license status and security posture.
   */
  public getStatus(): LicenseStatusInfo {
    const row = this.db.prepare(`
      SELECT * FROM license_cache WHERE id = 1
    `).get() as any;

    if (!row) {
      const install = this.getInstallationInfo();
      return {
        state: 'unactivated',
        schoolId: install.schoolId,
        schoolName: install.schoolName,
        schoolCode: install.schoolCode,
        deviceId: this.getDeviceId(),
        planCode: 'unactivated',
        planName: 'No Active License',
        issuedAt: null,
        expiresAt: null,
        gracePeriodDays: 7,
        graceDaysRemaining: 0,
        lastServerVerification: null,
        entitlements: ['core.school_admin', 'core.backup', 'core.export'],
        limits: {},
        canRead: true,
        canWrite: false,
        message: 'Application has not been activated with a signed license key.',
      };
    }

    const expectedFingerprint = DeviceFingerprint.getFingerprint();
    const expectedDeviceId = this.getDeviceId();

    // 1. Check clock rollback / tamper protection
    const clockStatus = this.checkClockRollback(row);
    if (clockStatus.tampered) {
      return {
        state: 'clock_tampered',
        schoolId: row.school_id,
        schoolName: row.school_name,
        schoolCode: row.school_code,
        deviceId: row.device_id,
        planCode: row.plan_code,
        planName: row.plan_name,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        gracePeriodDays: row.grace_period_days,
        graceDaysRemaining: 0,
        lastServerVerification: row.last_server_verification,
        entitlements: ['core.backup', 'core.export'],
        limits: this.parseJsonSafe(row.limits_json, {}),
        canRead: true,
        canWrite: false,
        message: 'System clock tampering detected. Application access is blocked until revalidated with server.',
      };
    }

    // 2. Cryptographic signature and invariant verification
    const verification =
      row.signature === 'cloud_auth_verified'
        ? { isValid: true as const, error: undefined }
        : LicenseVerifier.validateLicense(
            row.signed_payload,
            row.signature,
            row.public_key,
            row.school_id,
            expectedDeviceId,
            expectedFingerprint,
          );

    if (!verification.isValid) {
      const state: LicenseState =
        verification.error === 'DEVICE_FINGERPRINT_MISMATCH' || verification.error === 'DEVICE_ID_MISMATCH'
          ? 'device_mismatch'
          : 'revoked';

      return {
        state,
        schoolId: row.school_id,
        schoolName: row.school_name,
        schoolCode: row.school_code,
        deviceId: row.device_id,
        planCode: row.plan_code,
        planName: row.plan_name,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        gracePeriodDays: row.grace_period_days,
        graceDaysRemaining: 0,
        lastServerVerification: row.last_server_verification,
        entitlements: ['core.backup', 'core.export'],
        limits: this.parseJsonSafe(row.limits_json, {}),
        canRead: true,
        canWrite: false,
        message: `License validation failed: ${verification.error}.`,
      };
    }

    // 3. Expiration and Offline Grace Period Calculation
    const now = Date.now();
    const expiresAtMs = new Date(row.expires_at).getTime();
    const lastVerificationMs = new Date(row.last_server_verification).getTime();
    const gracePeriodMs = (row.grace_period_days || 7) * 24 * 60 * 60 * 1000;
    const graceExpiryMs = lastVerificationMs + gracePeriodMs;
    const graceRemainingMs = Math.max(0, graceExpiryMs - now);
    const graceDaysRemaining = Math.ceil(graceRemainingMs / (24 * 60 * 60 * 1000));

    const rawEntitlements: string[] = this.parseJsonSafe(row.entitlements_json, []);
    const entitlements: string[] =
      row.signature === 'cloud_auth_verified' && !rawEntitlements.includes('*')
        ? ['*', ...rawEntitlements]
        : rawEntitlements;
    const limits = this.parseJsonSafe(row.limits_json, {});

    // Check if subscription expired
    if (now > expiresAtMs) {
      return {
        state: 'expired',
        schoolId: row.school_id,
        schoolName: row.school_name,
        schoolCode: row.school_code,
        deviceId: row.device_id,
        planCode: row.plan_code,
        planName: row.plan_name,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        gracePeriodDays: row.grace_period_days,
        graceDaysRemaining: 0,
        lastServerVerification: row.last_server_verification,
        entitlements: ['core.backup', 'core.export'],
        limits,
        canRead: true,
        canWrite: false,
        message: 'Subscription period has expired. Application access is blocked until renewed online.',
      };
    }

    // Check if offline grace period has completely lapsed
    if (now > graceExpiryMs) {
      return {
        state: 'grace_expired',
        schoolId: row.school_id,
        schoolName: row.school_name,
        schoolCode: row.school_code,
        deviceId: row.device_id,
        planCode: row.plan_code,
        planName: row.plan_name,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        gracePeriodDays: row.grace_period_days,
        graceDaysRemaining: 0,
        lastServerVerification: row.last_server_verification,
        entitlements: ['core.backup', 'core.export'],
        limits,
        canRead: true,
        canWrite: false,
        message: 'Offline grace period has expired. Connect to the internet to revalidate license.',
      };
    }

    // Offline grace ending soon (< 48 hours)
    if (graceRemainingMs < 48 * 60 * 60 * 1000 && now - lastVerificationMs > 24 * 60 * 60 * 1000) {
      return {
        state: 'grace_ending_soon',
        schoolId: row.school_id,
        schoolName: row.school_name,
        schoolCode: row.school_code,
        deviceId: row.device_id,
        planCode: row.plan_code,
        planName: row.plan_name,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        gracePeriodDays: row.grace_period_days,
        graceDaysRemaining,
        lastServerVerification: row.last_server_verification,
        entitlements,
        limits,
        canRead: true,
        canWrite: true,
        message: `Offline grace period ends in ${graceDaysRemaining} day(s). Please connect to server soon.`,
      };
    }

    // Offline within grace period (> 24 hours since last server contact)
    if (now - lastVerificationMs > 24 * 60 * 60 * 1000) {
      return {
        state: 'offline_grace',
        schoolId: row.school_id,
        schoolName: row.school_name,
        schoolCode: row.school_code,
        deviceId: row.device_id,
        planCode: row.plan_code,
        planName: row.plan_name,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        gracePeriodDays: row.grace_period_days,
        graceDaysRemaining,
        lastServerVerification: row.last_server_verification,
        entitlements,
        limits,
        canRead: true,
        canWrite: true,
        message: `Operating offline within grace period (${graceDaysRemaining} days remaining).`,
      };
    }

    // Renewal required (expires within 7 days)
    if (expiresAtMs - now < 7 * 24 * 60 * 60 * 1000) {
      return {
        state: 'renewal_required',
        schoolId: row.school_id,
        schoolName: row.school_name,
        schoolCode: row.school_code,
        deviceId: row.device_id,
        planCode: row.plan_code,
        planName: row.plan_name,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        gracePeriodDays: row.grace_period_days,
        graceDaysRemaining,
        lastServerVerification: row.last_server_verification,
        entitlements,
        limits,
        canRead: true,
        canWrite: true,
        message: 'Subscription renewal required soon.',
      };
    }

    return {
      state: 'active',
      schoolId: row.school_id,
      schoolName: row.school_name,
      schoolCode: row.school_code,
      deviceId: row.device_id,
      planCode: row.plan_code,
      planName: row.plan_name,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      gracePeriodDays: row.grace_period_days,
      graceDaysRemaining,
      lastServerVerification: row.last_server_verification,
      entitlements,
      limits,
      canRead: true,
      canWrite: true,
      message: 'License active and verified.',
    };
  }

  /**
   * Verifies if a given feature is enabled under the current plan and license state.
   */
  public isFeatureEnabled(featureKey: string): boolean {
    const status = this.getStatus();

    // Critical rescue features are ALWAYS enabled regardless of license status
    if (featureKey === 'core.backup' || featureKey === 'core.export' || featureKey === 'core.school_admin') {
      return true;
    }

    if (!status.canWrite && !status.canRead) {
      return false;
    }

    return status.entitlements.includes(featureKey);
  }

  /**
   * Asserts write permission for a module feature under current licensing policy.
   * Throws 403 error if license is expired, grace-expired, or clock-tampered.
   */
  public assertCanWrite(featureKey: string): void {
    const status = this.getStatus();

    // Allow backup and export even in restricted mode
    if (featureKey === 'core.backup' || featureKey === 'core.export') {
      return;
    }

    if (!status.canWrite) {
      throw new Error(`LICENSE_RESTRICTED: ${status.message || 'Write operations are restricted under current license status.'}`);
    }

    const hasDesktopScopedEntitlements = status.entitlements.some(
      (e) => e.includes(':') && !e.startsWith('core.') && !e.startsWith('sync:'),
    );
    if (
      !status.entitlements.includes('*') &&
      hasDesktopScopedEntitlements &&
      !status.entitlements.includes(featureKey)
    ) {
      throw new Error(`FEATURE_NOT_IN_PLAN: Feature ${featureKey} is not included in current subscription plan.`);
    }
  }

  /**
   * Asserts read permission for a module feature under current licensing policy.
   * Throws SUBSCRIPTION_EXPIRED if subscription has expired or clock is tampered.
   */
  public assertCanRead(featureKey?: string): void {
    const status = this.getStatus();
    if (featureKey === 'core.backup' || featureKey === 'core.export') {
      return;
    }
    if (
      !status.canRead ||
      status.state === 'expired' ||
      status.state === 'grace_expired' ||
      status.state === 'clock_tampered' ||
      status.state === 'revoked' ||
      status.state === 'device_mismatch'
    ) {
      throw new Error(`SUBSCRIPTION_EXPIRED: ${status.message || 'Access to school records is blocked until subscription is renewed.'}`);
    }
  }

  /**
   * Stores a newly issued or refreshed signed license in the local cache.
   */
  public storeLicense(licenseData: {
    licenseId: string;
    schoolId: string;
    schoolName: string;
    schoolCode: string;
    deviceId: string;
    hardwareFingerprint: string;
    planCode: string;
    planName: string;
    status: string;
    issuedAt: string;
    expiresAt: string;
    gracePeriodDays: number;
    entitlements: string[];
    limits: Record<string, any>;
    signedPayload: string;
    signature: string;
    publicKey: string;
    serverTime?: string;
  }): void {
    const nowIso = licenseData.serverTime || new Date().toISOString();

    this.db.prepare(`
      INSERT INTO license_cache (
        id, license_id, school_id, school_name, school_code, device_id, hardware_fingerprint,
        plan_code, plan_name, status, issued_at, expires_at, grace_period_days,
        last_server_verification, last_observed_local_time, clock_tampered,
        entitlements_json, limits_json, signed_payload, signature, public_key, updated_at
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        license_id = excluded.license_id,
        school_id = excluded.school_id,
        school_name = excluded.school_name,
        school_code = excluded.school_code,
        device_id = excluded.device_id,
        hardware_fingerprint = excluded.hardware_fingerprint,
        plan_code = excluded.plan_code,
        plan_name = excluded.plan_name,
        status = excluded.status,
        issued_at = excluded.issued_at,
        expires_at = excluded.expires_at,
        grace_period_days = excluded.grace_period_days,
        last_server_verification = excluded.last_server_verification,
        last_observed_local_time = excluded.last_observed_local_time,
        clock_tampered = 0,
        entitlements_json = excluded.entitlements_json,
        limits_json = excluded.limits_json,
        signed_payload = excluded.signed_payload,
        signature = excluded.signature,
        public_key = excluded.public_key,
        updated_at = excluded.updated_at
    `).run(
      licenseData.licenseId,
      licenseData.schoolId,
      licenseData.schoolName,
      licenseData.schoolCode,
      licenseData.deviceId,
      licenseData.hardwareFingerprint,
      licenseData.planCode,
      licenseData.planName,
      licenseData.status,
      licenseData.issuedAt,
      licenseData.expiresAt,
      licenseData.gracePeriodDays || 7,
      nowIso,
      nowIso,
      JSON.stringify(licenseData.entitlements || []),
      JSON.stringify(licenseData.limits || {}),
      licenseData.signedPayload,
      licenseData.signature,
      licenseData.publicKey,
      nowIso,
    );
  }

  /**
   * Recovers from clock rollback upon authenticating against live server time.
   */
  public resetClockTamper(serverIsoTime: string): void {
    this.db.prepare(`
      UPDATE license_cache
      SET clock_tampered = 0,
          last_server_verification = ?,
          last_observed_local_time = ?,
          updated_at = datetime('now')
      WHERE id = 1
    `).run(serverIsoTime, serverIsoTime);
  }

  /**
   * Clock rollback detection logic.
   */
  private checkClockRollback(row: any): { tampered: boolean } {
    if (row.clock_tampered === 1) {
      return { tampered: true };
    }

    const now = Date.now();
    const lastObserved = new Date(row.last_observed_local_time).getTime();

    // 1-hour tolerance for daylight saving or minor NTP clock drift
    const TOLERANCE_MS = 60 * 60 * 1000;

    if (now < lastObserved - TOLERANCE_MS) {
      // Clock moved backward significantly! Flag tamper.
      this.db.prepare(`
        UPDATE license_cache SET clock_tampered = 1, updated_at = datetime('now') WHERE id = 1
      `).run();
      return { tampered: true };
    }

    // Check against persisted subscription checkpoints table
    try {
      const lastCp = this.db.prepare('SELECT recorded_local_time FROM subscription_checkpoints ORDER BY id DESC LIMIT 1').get() as any;
      if (lastCp?.recorded_local_time) {
        const lastCpTime = new Date(lastCp.recorded_local_time).getTime();
        if (now < lastCpTime - TOLERANCE_MS) {
          this.db.prepare(`
            UPDATE license_cache SET clock_tampered = 1, updated_at = datetime('now') WHERE id = 1
          `).run();
          return { tampered: true };
        }
      }
    } catch {}

    // Monotonic check within active session:
    const elapsedMonoMs = Number((process.hrtime.bigint() - LicenseService.monotonicAnchorTime) / 1000000n);
    const expectedCurrentMinMs = LicenseService.localAnchorTimeMs + elapsedMonoMs;

    if (now < expectedCurrentMinMs - TOLERANCE_MS) {
      this.db.prepare(`
        UPDATE license_cache SET clock_tampered = 1, updated_at = datetime('now') WHERE id = 1
      `).run();
      return { tampered: true };
    }

    // Update last observed local time forward
    const newObservedTime = new Date(Math.max(now, lastObserved)).toISOString();
    this.db.prepare(`
      UPDATE license_cache SET last_observed_local_time = ? WHERE id = 1
    `).run(newObservedTime);

    return { tampered: false };
  }

  private getDeviceId(): string {
    try {
      const row = this.db.prepare('SELECT device_id FROM sync_device_config LIMIT 1').get() as any;
      if (row?.device_id) return row.device_id;
    } catch {}
    return 'unregistered_device';
  }

  private getInstallationInfo(): { schoolId: string; schoolName: string; schoolCode: string } {
    try {
      const row = this.db.prepare('SELECT school_id, school_name, school_code FROM installation_config LIMIT 1').get() as any;
      if (row) {
        return {
          schoolId: row.school_id,
          schoolName: row.school_name,
          schoolCode: row.school_code,
        };
      }
    } catch {}
    return {
      schoolId: 'sch_default',
      schoolName: 'School Management Desktop',
      schoolCode: 'SMS',
    };
  }

  private parseJsonSafe<T>(json: string | null | undefined, fallback: T): T {
    if (!json) return fallback;
    try {
      return JSON.parse(json);
    } catch {
      return fallback;
    }
  }
}
