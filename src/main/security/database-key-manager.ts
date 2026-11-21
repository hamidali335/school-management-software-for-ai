import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CredentialVault } from './credential-vault';
import { DeviceFingerprint } from './device-fingerprint';

export type KeyLockReason = 'SUBSCRIPTION_EXPIRED' | 'CLOCK_TAMPERED' | 'MANUAL_LOCK' | 'UNAUTHENTICATED' | 'LICENSE_REVOKED' | 'DEVICE_MISMATCH';

export class DatabaseKeyManager {
  private static instance: DatabaseKeyManager | null = null;
  private keyBuffer: Buffer | null = null;
  private isLocked: boolean = false;
  private lockReason: KeyLockReason | null = null;
  private keyFilePath: string;

  private constructor(vaultDir: string) {
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }
    this.keyFilePath = path.join(vaultDir, 'dek.dpapi');
    this.initializeKey();
  }

  public static getInstance(vaultDir?: string): DatabaseKeyManager {
    if (!DatabaseKeyManager.instance) {
      let defaultDir: string;
      if (vaultDir) {
        defaultDir = vaultDir;
      } else {
        const legacyDir = path.resolve(process.env.APPDATA || '.', 'SchoolManagementSoftware', '.vault');
        const legacyKeyFile = path.join(legacyDir, 'dek.dpapi');

        try {
          const { app } = require('electron');
          const appUserDataVault = app && typeof app.getPath === 'function' ? path.join(app.getPath('userData'), '.vault') : null;

          if (appUserDataVault) {
            defaultDir = appUserDataVault;
          } else if (fs.existsSync(legacyKeyFile)) {
            defaultDir = legacyDir;
          } else {
            defaultDir = legacyDir;
          }
        } catch {
          defaultDir = legacyDir;
        }
      }
      DatabaseKeyManager.instance = new DatabaseKeyManager(defaultDir);
    }
    return DatabaseKeyManager.instance;
  }

  public static resetInstanceForTesting(): void {
    if (DatabaseKeyManager.instance) {
      DatabaseKeyManager.instance = null;
    }
  }

  /**
   * Initializes or loads the DPAPI-protected database encryption key.
   * If key does not exist, a new cryptographically secure 256-bit random key is generated.
   */
  private initializeKey(): void {
    if (fs.existsSync(this.keyFilePath)) {
      try {
        const encryptedEnvelope = fs.readFileSync(this.keyFilePath, 'utf8');
        const rawHex = CredentialVault.decryptSecret(encryptedEnvelope);
        
        // Machine isolation verify: ensure fingerprint matches this workstation
        const [keyHex, fingerprint] = rawHex.split('::');
        const currentFingerprint = DeviceFingerprint.getFingerprint();
        
        if (fingerprint && !DeviceFingerprint.matches(fingerprint)) {
          throw new Error('DEVICE_ISOLATION_VIOLATION: Database key belongs to another workstation.');
        }

        // Auto-heal / re-seal: if stored fingerprint was a legacy variation, upgrade envelope with canonical fingerprint
        if (fingerprint && fingerprint !== currentFingerprint && DeviceFingerprint.matches(fingerprint)) {
          try {
            const upgradedPayload = `${keyHex}::${currentFingerprint}`;
            const upgradedEnvelope = CredentialVault.encryptSecret(upgradedPayload);
            fs.writeFileSync(this.keyFilePath, upgradedEnvelope, { encoding: 'utf8', mode: 0o600 });
          } catch {}
        }

        this.keyBuffer = Buffer.from(keyHex, 'hex');
        this.isLocked = false;
        this.lockReason = null;
        return;
      } catch (err: any) {
        if (err.message?.includes('DEVICE_ISOLATION_VIOLATION')) {
          this.lock('UNAUTHENTICATED');
          throw err;
        }
        // If file exists but corrupt or unreadable on this machine (e.g. copied to another machine)
        this.lock('UNAUTHENTICATED');
        throw new Error('DATABASE_KEY_DECRYPTION_FAILED: Cannot unseal database key on this workstation.');
      }
    }

    // Generate fresh 256-bit AES master key bound to device fingerprint
    const rawKey = crypto.randomBytes(32);
    const currentFingerprint = DeviceFingerprint.getFingerprint();
    const payload = `${rawKey.toString('hex')}::${currentFingerprint}`;
    const encryptedEnvelope = CredentialVault.encryptSecret(payload);

    fs.writeFileSync(this.keyFilePath, encryptedEnvelope, { encoding: 'utf8', mode: 0o600 });
    this.keyBuffer = rawKey;
    this.isLocked = false;
    this.lockReason = null;
  }

  /**
   * Retrieves active key buffer for cryptographic operations.
   * Fails closed if subscription is expired or key is locked.
   */
  public getKey(): Buffer {
    if (this.isLocked || !this.keyBuffer) {
      throw new Error(`SUBSCRIPTION_EXPIRED_KEY_LOCKED: Access to local database encryption key is locked (${this.lockReason || 'subscription expired'}).`);
    }
    return this.keyBuffer;
  }

  /**
   * Returns the 256-bit database encryption key in hex format for SQLCipher.
   */
  public getEncryptionKeyHex(): string {
    return this.getKey().toString('hex');
  }

  /**
   * Returns the SQL literal for key pragma, e.g. x'0123...cdef'.
   */
  public getEncryptionKeySql(): string {
    return `x'${this.getEncryptionKeyHex()}'`;
  }

  /**
   * Recovers/re-binds the database encryption key to a new hardware fingerprint
   * following an authorized cloud platform administrator reactivation.
   */
  public reactivateHardwareBinding(
    newFingerprint: string,
    authorizedCloudToken: string,
    schoolId: string
  ): void {
    if (!fs.existsSync(this.keyFilePath)) {
      throw new Error('NO_DATABASE_KEY_FOUND: No existing database key found to reactivate.');
    }
    if (!authorizedCloudToken || typeof authorizedCloudToken !== 'string') {
      throw new Error('INVALID_AUTHORIZATION: Cloud administrator authorization token is required.');
    }

    // Unseal existing key using CredentialVault (DPAPI)
    const encryptedEnvelope = fs.readFileSync(this.keyFilePath, 'utf8');
    const rawHex = CredentialVault.decryptSecret(encryptedEnvelope);
    const [keyHex] = rawHex.split('::');

    if (!keyHex || keyHex.length !== 64) {
      throw new Error('CORRUPTED_KEY_PAYLOAD: Existing key payload is corrupted.');
    }

    // Seal key with new hardware fingerprint
    const payload = `${keyHex}::${newFingerprint}`;
    const newEnvelope = CredentialVault.encryptSecret(payload);
    fs.writeFileSync(this.keyFilePath, newEnvelope, { encoding: 'utf8', mode: 0o600 });

    this.keyBuffer = Buffer.from(keyHex, 'hex');
    this.isLocked = false;
    this.lockReason = null;
  }

  /**
   * Locks access to the database encryption key, wiping memory buffers.
   * Triggered immediately upon subscription expiry or clock tampering detection.
   */
  public lock(reason: KeyLockReason): void {
    this.isLocked = true;
    this.lockReason = reason;
    if (this.keyBuffer) {
      this.keyBuffer.fill(0); // Secure memory wipe
      this.keyBuffer = null;
    }
  }

  /**
   * Unlocks the database encryption key when a valid, non-expired subscription entitlement is verified.
   */
  public unlock(): void {
    if (fs.existsSync(this.keyFilePath)) {
      const encryptedEnvelope = fs.readFileSync(this.keyFilePath, 'utf8');
      const rawHex = CredentialVault.decryptSecret(encryptedEnvelope);
      // Machine isolation verify: ensure fingerprint matches this workstation
      const [keyHex, fingerprint] = rawHex.split('::');
      const currentFingerprint = DeviceFingerprint.getFingerprint();
      
      if (fingerprint && !DeviceFingerprint.matches(fingerprint)) {
        throw new Error('DEVICE_ISOLATION_VIOLATION: Database key belongs to another workstation.');
      }

      // Auto-heal / re-seal: if stored fingerprint was a legacy variation, upgrade envelope with canonical fingerprint
      if (fingerprint && fingerprint !== currentFingerprint && DeviceFingerprint.matches(fingerprint)) {
        try {
          const upgradedPayload = `${keyHex}::${currentFingerprint}`;
          const upgradedEnvelope = CredentialVault.encryptSecret(upgradedPayload);
          fs.writeFileSync(this.keyFilePath, upgradedEnvelope, { encoding: 'utf8', mode: 0o600 });
        } catch {}
      }

      this.keyBuffer = Buffer.from(keyHex, 'hex');
      this.isLocked = false;
      this.lockReason = null;
    } else {
      this.initializeKey();
    }
  }

  public getStatus(): { isLocked: boolean; reason: KeyLockReason | null } {
    return {
      isLocked: this.isLocked,
      reason: this.lockReason,
    };
  }

  /**
   * Authenticated Reversible Field Encryption (AES-256-GCM)
   */
  public encryptField(plaintext: string): string {
    const key = this.getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `enc:v1:${iv.toString('hex')}:${authTag}:${ciphertext}`;
  }

  /**
   * Authenticated Reversible Field Decryption (AES-256-GCM)
   */
  public decryptField(envelope: string): string {
    if (!envelope || !envelope.startsWith('enc:v1:')) {
      return envelope; // Plaintext legacy or unencrypted
    }
    const key = this.getKey();
    const parts = envelope.split(':');
    if (parts.length !== 5) {
      throw new Error('MALFORMED_ENCRYPTED_FIELD');
    }
    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const ciphertext = parts[4];

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
