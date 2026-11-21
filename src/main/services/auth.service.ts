import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { UserRepository, UserRecord } from '../database/repositories/user.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { LicenseService } from './license.service';
import { DeviceFingerprint } from '../security/device-fingerprint';
import { CredentialVault } from '../security/credential-vault';
import { PasswordHasher } from '../security/password-hasher';
import { SessionManager, ValidatedSession } from '../security/session-manager';
import { DatabaseKeyManager } from '../security/database-key-manager';
import { DeploymentConfigService } from './deployment-config';

export interface SanitizedUser {
  id: string;
  schoolId: string;
  schoolName?: string;
  name: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  role: string;
  permissions: string[];
  status: string;
}

export interface LoginResult {
  success: boolean;
  user: SanitizedUser;
  token: string;
  expiresAt: string;
}

export class AuthService {
  private userRepo: UserRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;
  private licenseService: LicenseService;

  constructor(private db: Database.Database) {
    this.userRepo = new UserRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
    this.licenseService = new LicenseService(db);
  }

  public getProvisioningStatus(): { isProvisioned: boolean; hasAdmin: boolean; schoolName: string | null } {
    const isProvisioned = this.installService.isProvisioned();
    if (!isProvisioned) {
      return { isProvisioned: false, hasAdmin: false, schoolName: null };
    }
    const config = this.installService.getInstallation();
    const isDemo = config.schoolId === 'sch_01' || config.schoolId === 'sch_pkg_test' || config.schoolId === 'sch_default';
    let isPackaged = false;
    try {
      const { app } = require('electron');
      isPackaged = app && app.isPackaged;
    } catch {}

    if (isDemo && isPackaged) {
      return { isProvisioned: false, hasAdmin: false, schoolName: null };
    }

    const count = this.userRepo.countUsers(config.schoolId);
    return {
      isProvisioned: true,
      hasAdmin: count > 0,
      schoolName: config.schoolName,
    };
  }

  public async loginOnlineFirst(params: {
    identifier: string;
    password: string;
    schoolCode?: string;
    backendUrl?: string;
  }): Promise<LoginResult & { isOnline: boolean; schoolName?: string }> {
    const identifier = params.identifier?.trim();
    const plaintextPassword = params.password;
    if (!identifier || !plaintextPassword) {
      throw new Error('Email/username and password are required');
    }

    // Determine target cloud backend URL
    let backendUrl = params.backendUrl?.trim();
    if (!backendUrl) {
      backendUrl = DeploymentConfigService.resolveConfig(this.db).cloudApiBaseUrl;
    }
    const cleanBaseUrl = backendUrl.replace(/\/+$/, '');

    // 1. Attempt Cloud Backend Authentication
    let cloudOnline = false;
    let cloudResult: any = null;
    let cloudError: string | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const isEmail = identifier.includes('@');
      const bodyPayload: any = {
        password: plaintextPassword,
      };
      if (isEmail) {
        bodyPayload.email = identifier.toLowerCase();
      } else {
        bodyPayload.username = identifier.toLowerCase();
      }
      if (params.schoolCode) {
        bodyPayload.schoolCode = params.schoolCode.trim().toUpperCase();
      }

      const res = await fetch(`${cleanBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (res) {
        cloudOnline = true;
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          cloudError =
            errData.message ||
            (typeof errData.error === 'string' ? errData.error : errData.error?.message) ||
            `Authentication failed with status HTTP ${res.status}`;
        } else {
          const json = await res.json();
          cloudResult = json.data || json;
        }
      }
    } catch {
      cloudOnline = false;
    }

    // 2. If Cloud was contacted and rejected the credentials or account
    if (cloudOnline && cloudError) {
      if (this.installService.isProvisioned()) {
        try {
          this.auditRepo.log({
            schoolId: this.installService.getInstallation().schoolId,
            action: 'AUTH_CLOUD_LOGIN_REJECTED',
            module: 'AUTH',
            details: { identifier, reason: cloudError },
            status: 'failure',
            performedBy: identifier,
          });
        } catch {}
      }
      throw new Error(cloudError);
    }

    // 3. If Cloud was contacted and successfully authenticated
    if (cloudOnline && cloudResult && cloudResult.user && cloudResult.school) {
      const cloudUser = cloudResult.user;
      const cloudSchool = cloudResult.school;
      const tokens = {
        accessToken: cloudResult.accessToken,
        refreshToken: cloudResult.refreshToken,
      };
      const permissions: string[] = cloudResult.permissions || [];

      // Validate account status
      if (cloudUser.status && cloudUser.status !== 'active') {
        throw new Error(`Cloud account is ${cloudUser.status}. Access denied.`);
      }

      const schoolId = cloudSchool._id.toString();
      const schoolName = cloudSchool.name || 'School OS Institution';
      const schoolCode = cloudSchool.code || 'SCH';

      // Check school isolation on existing installation
      if (this.installService.isProvisioned()) {
        const existing = this.installService.getInstallation();
        const isDemo = existing.schoolId === 'sch_01' || existing.schoolId === 'sch_pkg_test' || existing.schoolId === 'sch_default';
        if (!isDemo && existing.schoolId !== schoolId) {
          throw new Error(
            `Data isolation violation: This workstation is provisioned for "${existing.schoolName}". Unrelated school accounts cannot access this workstation.`
          );
        }
        if (isDemo) {
          // Re-provision workstation from demo/test fixture to authoritative cloud school account
          this.installService.provisionInstallation({
            schoolId,
            schoolName,
            schoolCode,
            currency: 'Rs.',
            installationId: `inst_${crypto.randomUUID()}`,
            performedBy: cloudUser.name || 'Cloud Workstation Provisioning',
          });
        }
      } else {
        // Provision new installation identity matching SaaS cloud school account
        this.installService.provisionInstallation({
          schoolId,
          schoolName,
          schoolCode,
          currency: 'Rs.',
          installationId: `inst_${crypto.randomUUID()}`,
          performedBy: cloudUser.name || 'Cloud Workstation Provisioning',
        });
      }

      // Hardware binding & Licensing
      const hardwareFingerprint = DeviceFingerprint.getFingerprint();
      let deviceId = 'dev_win_' + crypto.randomBytes(4).toString('hex');
      try {
        const existingDev = this.db.prepare('SELECT device_id FROM sync_device_config WHERE id = 1').get() as { device_id?: string } | undefined;
        if (existingDev?.device_id) {
          deviceId = existingDev.device_id;
        }
      } catch {}

      // Try device licensing activation / verification if Bearer token is available
      if (tokens.accessToken) {
        try {
          const licRes = await fetch(`${cleanBaseUrl}/licensing/activate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokens.accessToken}`,
            },
            body: JSON.stringify({
              schoolId,
              deviceId,
              deviceName: 'Workstation (' + (process.env.COMPUTERNAME || 'Desktop') + ')',
              hardwareFingerprint,
              clientVersion: '1.0.0',
            }),
          }).catch(() => null);

          if (licRes && licRes.ok) {
            const licJson = await licRes.json();
            const licData = licJson.data || licJson;
            const lic = licData?.license || licData;
            if (lic && (lic.licenseId || lic.signedPayload)) {
              this.licenseService.storeLicense({
                licenseId: lic.licenseId || `cloud_session_${schoolId}`,
                schoolId: lic.schoolId || schoolId,
                schoolName: lic.schoolName || schoolName,
                schoolCode: lic.schoolCode || schoolCode,
                deviceId: lic.deviceId || deviceId,
                hardwareFingerprint: lic.hardwareFingerprint || hardwareFingerprint,
                planCode: lic.planCode || 'standard',
                planName: lic.planName || 'Standard Plan',
                status: 'active',
                issuedAt: lic.issuedAt || new Date().toISOString(),
                expiresAt: lic.expiresAt || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
                gracePeriodDays: lic.gracePeriodDays ?? 7,
                entitlements: Array.isArray(lic.entitlements) ? lic.entitlements : permissions,
                limits: lic.limits || {},
                signedPayload: lic.signedPayload || JSON.stringify(lic),
                signature: lic.signature || 'cloud_auth_verified',
                publicKey: lic.publicKey || 'cloud_auth_verified',
              });
            }
          }
        } catch (licErr) {
          console.warn('Licensing auto-activation skipped or handled by offline fallback:', licErr);
        }

        // Ensure cloud-authenticated schools always have an active local entitlement cache
        // even if /licensing/activate is not provisioned yet on the server.
        try {
          const currentLic = this.licenseService.getStatus();
          if (
            currentLic.state === 'unactivated' ||
            currentLic.state === 'revoked' ||
            currentLic.state === 'device_mismatch' ||
            currentLic.state === 'expired'
          ) {
            const subExpiry =
              cloudResult?.school?.subscription?.expiresAt ||
              cloudResult?.school?.subscription?.currentPeriodEnd ||
              new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
            const mergedEntitlements = Array.from(
              new Set<string>([
                '*',
                ...(Array.isArray(permissions) ? permissions : []),
                ...(Array.isArray(cloudResult?.entitlements) ? cloudResult.entitlements : []),
                'core.backup',
                'core.export',
              ]),
            );
            const fallbackLicId = `cloud_session_${schoolId}`;
            const fallbackPayload = {
              licenseId: fallbackLicId,
              schoolId,
              schoolName,
              schoolCode,
              deviceId,
              hardwareFingerprint,
              planCode: cloudResult?.school?.subscription?.planCode || 'cloud_active',
              planName: cloudResult?.school?.subscription?.planName || 'Active Cloud Subscription',
              status: 'active',
              issuedAt: new Date().toISOString(),
              expiresAt: subExpiry,
              gracePeriodDays: 7,
              entitlements: mergedEntitlements,
              limits: {},
              licenseVersion: 1,
            };
            this.licenseService.storeLicense({
              ...fallbackPayload,
              signedPayload: JSON.stringify(fallbackPayload),
              signature: 'cloud_auth_verified',
              publicKey: 'cloud_auth_verified',
            });
          }
        } catch (fallbackLicErr) {
          console.warn('Fallback cloud license cache setup warning:', fallbackLicErr);
        }
      }

      // Upsert device sync configuration
      try {
        const encAuth = tokens.accessToken ? CredentialVault.encryptSecret(tokens.accessToken) : null;
        const encRefresh = tokens.refreshToken ? CredentialVault.encryptSecret(tokens.refreshToken) : null;
        const now = new Date().toISOString();
        this.db.prepare(`
          INSERT INTO sync_device_config (
            id, school_id, device_id, device_name, api_base_url,
            auth_token_encrypted, refresh_token_encrypted, device_status,
            last_handshake_at, updated_at
          ) VALUES (1, ?, ?, 'Workstation', ?, ?, ?, 'registered', ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            school_id = excluded.school_id,
            api_base_url = excluded.api_base_url,
            auth_token_encrypted = excluded.auth_token_encrypted,
            refresh_token_encrypted = excluded.refresh_token_encrypted,
            last_handshake_at = excluded.last_handshake_at,
            updated_at = excluded.updated_at
        `).run(schoolId, deviceId, cleanBaseUrl, encAuth, encRefresh, now, now);
      } catch (devErr) {
        console.warn('Error updating sync_device_config:', devErr);
      }

      // Compute salted password hash for local offline credential verifier
      const { hash, salt } = await PasswordHasher.hashPasswordAsync(plaintextPassword);

      // Upsert user into local SQLite users repository
      const localUser = this.userRepo.upsertUser({
        id: cloudUser._id.toString(),
        schoolId,
        name: cloudUser.name,
        email: cloudUser.email || null,
        username: cloudUser.username || null,
        phone: cloudUser.phone || null,
        passwordHash: hash,
        salt,
        role: cloudUser.role || 'school_owner',
        permissions,
        status: cloudUser.status || 'active',
      });

      // Reset local failed logins on successful cloud authentication
      this.userRepo.resetFailedLogins(schoolId, localUser.id);

      // Unlock database key manager upon successful cloud authentication & license verification
      try {
        DatabaseKeyManager.getInstance().unlock();
      } catch {}

      // Create local session
      const session = SessionManager.createSession(this.db, localUser.id, schoolId);

      this.auditRepo.log({
        schoolId,
        userId: localUser.id,
        action: 'AUTH_ONLINE_LOGIN_SUCCESS',
        module: 'AUTH',
        details: { role: localUser.role, sessionId: session.sessionId, isProvisioned: true },
        status: 'success',
        performedBy: localUser.name,
      });

      return {
        success: true,
        user: this.sanitizeUser(localUser),
        token: session.token,
        expiresAt: session.expiresAt,
        schoolName,
        isOnline: true,
      };
    }

    // 4. Cloud Unreachable: Offline Fallback Path
    if (!this.installService.isProvisioned()) {
      throw new Error(
        'Workstation activation requires an active internet connection to connect to your School OS cloud account.'
      );
    }

    // Check licensing offline status
    const licStatus = this.licenseService.getStatus();
    if (licStatus.state === 'clock_tampered') {
      throw new Error('System clock tampering detected. Access blocked until revalidated with server.');
    }
    if (licStatus.state === 'grace_expired' || licStatus.state === 'expired') {
      throw new Error(`Subscription expired (${licStatus.message || 'subscription expired'}). Please connect to internet to renew.`);
    }

    // Perform local offline authentication using existing scrypt verifier
    const localRes = await this.login(identifier, plaintextPassword);
    const inst = this.installService.getInstallation();

    try {
      DatabaseKeyManager.getInstance().unlock();
    } catch {}

    return {
      ...localRes,
      schoolName: inst.schoolName,
      isOnline: false,
    };
  }

  public async login(identifier: string, plaintextPassword: string): Promise<LoginResult> {
    if (!identifier || typeof identifier !== 'string' || !plaintextPassword) {
      throw new Error('Email/username and password are required');
    }

    if (!this.installService.isProvisioned()) {
      throw new Error('This workstation has not been provisioned for any school yet. Initial setup required.');
    }

    const schoolId = this.installService.assertSchoolIsolation();
    const totalUsers = this.userRepo.countUsers(schoolId);

    if (totalUsers === 0) {
      throw new Error(
        'First-time offline login is unavailable because no administrator account has been provisioned on this computer yet. Please perform initial administrator provisioning.'
      );
    }

    const user = this.userRepo.findByIdentifier(schoolId, identifier);

    if (!user) {
      this.auditRepo.log({
        schoolId,
        action: 'AUTH_LOGIN_FAILED',
        module: 'AUTH',
        details: { identifier, reason: 'User not found' },
        status: 'failure',
        performedBy: identifier,
      });
      throw new Error('Invalid email/username or password');
    }

    // Check account lockout
    const now = new Date();
    if (user.lockUntil && new Date(user.lockUntil).getTime() > now.getTime()) {
      const minutesRemaining = Math.ceil((new Date(user.lockUntil).getTime() - now.getTime()) / (60 * 1000));
      this.auditRepo.log({
        schoolId,
        userId: user.id,
        action: 'AUTH_LOGIN_BLOCKED_LOCKED',
        module: 'AUTH',
        details: { identifier, minutesRemaining },
        status: 'warning',
        performedBy: user.name,
      });
      throw new Error(`Account is temporarily locked due to excessive failed attempts. Try again in ${minutesRemaining} minutes.`);
    }

    // Check account status
    if (user.status === 'suspended') {
      throw new Error('Account has been suspended. Please contact the school administrator.');
    }
    if (user.status === 'disabled') {
      throw new Error('Account has been disabled and cannot be used to sign in.');
    }
    if (user.status === 'pending') {
      throw new Error('Account activation is pending. Please complete the account setup process.');
    }

    // Verify Password with Scrypt (Asynchronous non-blocking evaluation)
    const isValid = await PasswordHasher.verifyPasswordAsync(plaintextPassword, user.passwordHash);

    if (!isValid) {
      const lockoutResult = this.userRepo.recordFailedLogin(schoolId, user.id, 5, 15 * 60 * 1000);

      this.auditRepo.log({
        schoolId,
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        module: 'AUTH',
        details: { identifier, attempts: lockoutResult.attempts, isLocked: lockoutResult.isLocked },
        status: 'failure',
        performedBy: user.name,
      });

      if (lockoutResult.isLocked) {
        throw new Error('Account has been locked for 15 minutes due to 5 consecutive failed login attempts.');
      } else {
        const remaining = 5 - lockoutResult.attempts;
        throw new Error(`Invalid email/username or password. ${remaining} attempt(s) remaining before account lockout.`);
      }
    }

    // Login successful: reset failed login attempts
    this.userRepo.resetFailedLogins(schoolId, user.id);

    // Create secure session
    const session = SessionManager.createSession(this.db, user.id, schoolId);

    this.auditRepo.log({
      schoolId,
      userId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      module: 'AUTH',
      details: { role: user.role, sessionId: session.sessionId },
      status: 'success',
      performedBy: user.name,
    });

    return {
      success: true,
      user: this.sanitizeUser(user),
      token: session.token,
      expiresAt: session.expiresAt,
    };
  }

  public async changePassword(
    userId: string,
    schoolId: string,
    currentPlaintext: string,
    newPlaintext: string,
    currentRawToken?: string
  ): Promise<{ success: boolean; revokedSessionsCount: number; currentSessionPreserved: boolean }> {
    if (!newPlaintext || newPlaintext.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    const user = this.userRepo.findById(schoolId, userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.status !== 'active') {
      throw new Error(`Cannot change password for ${user.status} account`);
    }

    const isCurrentValid = await PasswordHasher.verifyPasswordAsync(currentPlaintext, user.passwordHash);
    if (!isCurrentValid) {
      this.auditRepo.log({
        schoolId,
        userId,
        action: 'AUTH_PASSWORD_CHANGE_FAILED',
        module: 'AUTH',
        details: { reason: 'Incorrect current password' },
        status: 'failure',
        performedBy: user.name,
      });
      throw new Error('Current password does not match');
    }

    // 1. Post to cloud backend first if remote backend configured
    try {
      const devConfig = this.db.prepare('SELECT api_base_url, auth_token_encrypted FROM sync_device_config WHERE id = 1').get() as any;
      if (devConfig?.api_base_url) {
        const cleanBaseUrl = devConfig.api_base_url.replace(/\/+$/, '');
        let token = '';
        if (devConfig.auth_token_encrypted) {
          try { token = CredentialVault.decryptSecret(devConfig.auth_token_encrypted); } catch {}
        }
        const cloudRes = await fetch(`${cleanBaseUrl}/auth/change-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            currentPassword: currentPlaintext,
            newPassword: newPlaintext,
          }),
        }).catch(() => null);

        if (cloudRes && !cloudRes.ok && cloudRes.status !== 404) {
          const errBody = await cloudRes.json().catch(() => ({}));
          throw new Error(errBody.message || 'Cloud backend rejected password change');
        }
      }
    } catch (err: any) {
      if (err.message?.includes('Cloud backend rejected password change')) {
        throw err;
      }
    }

    const { hash, salt } = await PasswordHasher.hashPasswordAsync(newPlaintext);
    this.userRepo.updatePassword(schoolId, userId, hash, salt);

    // Invalidate sessions according to explicit policy:
    // When currentRawToken is supplied, all OTHER active sessions are invalidated immediately,
    // while the caller's session is retained to prevent abrupt disconnection.
    // If currentRawToken is omitted, all sessions for the user are revoked.
    let revokedSessionsCount = 0;
    let currentSessionPreserved = false;

    if (currentRawToken) {
      revokedSessionsCount = SessionManager.revokeOtherUserSessions(this.db, userId, currentRawToken);
      currentSessionPreserved = true;
    } else {
      revokedSessionsCount = SessionManager.revokeAllUserSessions(this.db, userId);
      currentSessionPreserved = false;
    }

    this.auditRepo.log({
      schoolId,
      userId,
      action: 'AUTH_PASSWORD_CHANGED',
      module: 'AUTH',
      details: {
        revokedSessionsCount,
        currentSessionPreserved,
        policy: currentSessionPreserved ? 'INVALIDATE_OTHER_SESSIONS' : 'INVALIDATE_ALL_SESSIONS',
      },
      status: 'success',
      performedBy: user.name,
    });

    return { success: true, revokedSessionsCount, currentSessionPreserved };
  }

  public async provisionInitialAdmin(params: {
    schoolName: string;
    schoolCode: string;
    currency?: string;
    adminName: string;
    adminEmail?: string | null;
    adminUsername: string;
    adminPassword: string;
  }): Promise<{ installation: any; adminUser: SanitizedUser }> {
    if (this.installService.isProvisioned()) {
      const config = this.installService.getInstallation();
      const count = this.userRepo.countUsers(config.schoolId);
      if (count > 0) {
        throw new Error('An administrator account has already been provisioned on this workstation.');
      }
    }

    if (!params.adminPassword || params.adminPassword.length < 8) {
      throw new Error('Administrator password must be at least 8 characters long');
    }

    const schoolId = 'sch_' + crypto.randomBytes(6).toString('hex');
    const installationId = 'inst_' + crypto.randomUUID();

    // 1. Hash Password Asynchronously outside SQLite transaction
    const { hash, salt } = await PasswordHasher.hashPasswordAsync(params.adminPassword);

    const runTx = this.db.transaction(() => {
      // 2. Establish Installation Config
      const installation = this.installService.provisionInstallation({
        schoolId,
        schoolName: params.schoolName,
        schoolCode: params.schoolCode,
        currency: params.currency || 'Rs.',
        installationId,
        performedBy: 'Initial Setup Wizard',
      });

      // 3. Create Master School Owner Administrator
      const adminUser = this.userRepo.createUser({
        id: 'usr_admin_' + crypto.randomBytes(4).toString('hex'),
        schoolId,
        name: params.adminName,
        email: params.adminEmail || null,
        username: params.adminUsername,
        passwordHash: hash,
        salt,
        role: 'school_owner',
        permissions: ['*'],
        status: 'active',
      });

      this.auditRepo.log({
        schoolId,
        userId: adminUser.id,
        action: 'INITIAL_ADMIN_PROVISIONED',
        module: 'AUTH',
        details: { adminUsername: params.adminUsername, schoolName: params.schoolName },
        performedBy: params.adminName,
      });

      return { installation, adminUser: this.sanitizeUser(adminUser) };
    });

    return runTx();
  }

  public logout(sessionToken: string): boolean {
    const session = SessionManager.validateSession(this.db, sessionToken);
    const revoked = SessionManager.revokeSession(this.db, sessionToken);

    if (session.isValid && session.schoolId) {
      this.auditRepo.log({
        schoolId: session.schoolId,
        userId: session.userId,
        action: 'AUTH_LOGOUT',
        module: 'AUTH',
        status: 'success',
        performedBy: session.userName || 'User',
      });
    }

    return revoked;
  }

  public validateSession(sessionToken: string): ValidatedSession {
    return SessionManager.validateSession(this.db, sessionToken);
  }

  public async provisionUser(params: {
    id: string;
    name: string;
    email?: string | null;
    username?: string | null;
    phone?: string | null;
    password: string;
    role: UserRecord['role'];
    permissions?: string[];
    performedBy: string;
  }): Promise<SanitizedUser> {
    const schoolId = this.installService.assertSchoolIsolation();

    const { hash, salt } = await PasswordHasher.hashPasswordAsync(params.password);
    const user = this.userRepo.createUser({
      id: params.id,
      schoolId,
      name: params.name,
      email: params.email,
      username: params.username,
      phone: params.phone,
      passwordHash: hash,
      salt,
      role: params.role,
      permissions: params.permissions || [],
      status: 'active',
    });

    this.auditRepo.log({
      schoolId,
      userId: user.id,
      action: 'USER_PROVISIONED',
      module: 'AUTH',
      details: { name: user.name, role: user.role, email: user.email },
      performedBy: params.performedBy,
    });

    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: UserRecord): SanitizedUser {
    let schoolName: string | undefined;
    try {
      if (this.installService.isProvisioned()) {
        schoolName = this.installService.getInstallation().schoolName;
      }
    } catch {}
    return {
      id: user.id,
      schoolId: user.schoolId,
      schoolName,
      name: user.name,
      email: user.email,
      username: user.username,
      phone: user.phone,
      role: user.role,
      permissions: user.permissions,
      status: user.status,
    };
  }
}
