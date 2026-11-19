let safeStorage: any;
try {
  safeStorage = require('electron').safeStorage;
} catch {}
import crypto from 'node:crypto';
import os from 'node:os';

export class CredentialVault {
  private static fallbackSecret = crypto.createHash('sha256').update(os.hostname() + '_sms_desktop_vault').digest();

  public static isDpapiAvailable(): boolean {
    try {
      return typeof safeStorage !== 'undefined' && safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  public static encryptSecret(plaintext: string): string {
    if (this.isDpapiAvailable()) {
      const encryptedBuffer = safeStorage.encryptString(plaintext);
      return 'dpapi:' + encryptedBuffer.toString('hex');
    }

    // Secure fallback with AES-256-GCM for headless test environments
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.fallbackSecret, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `aes-gcm:${iv.toString('hex')}:${authTag}:${ciphertext}`;
  }

  public static decryptSecret(ciphertext: string): string {
    if (ciphertext.startsWith('dpapi:')) {
      if (!this.isDpapiAvailable()) {
        throw new Error('DPAPI encryption provider is unavailable on this environment');
      }
      const rawHex = ciphertext.substring(6);
      const buffer = Buffer.from(rawHex, 'hex');
      return safeStorage.decryptString(buffer);
    }

    if (ciphertext.startsWith('aes-gcm:')) {
      const parts = ciphertext.split(':');
      const iv = Buffer.from(parts[1], 'hex');
      const authTag = Buffer.from(parts[2], 'hex');
      const data = parts[3];

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.fallbackSecret, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    throw new Error('Unknown secret encryption envelope');
  }
}
