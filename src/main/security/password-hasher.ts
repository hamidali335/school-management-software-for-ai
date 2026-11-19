import crypto from 'node:crypto';

export interface HashResult {
  hash: string;
  salt: string;
}

const SCRYPT_PARAMS = {
  N: 32768,  // CPU/memory cost parameter (2^15)
  r: 8,      // Block size parameter
  p: 1,      // Parallelization parameter
  keyLen: 64 // Output key length in bytes
};

function scryptAsync(
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export class PasswordHasher {
  /**
   * Hashes a plaintext password asynchronously using Scrypt on the libuv thread pool.
   * Prevents blocking the Electron main thread event loop.
   */
  public static async hashPasswordAsync(password: string): Promise<HashResult> {
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const salt = crypto.randomBytes(32).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, SCRYPT_PARAMS.keyLen, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      maxmem: 64 * 1024 * 1024,
    })) as Buffer;

    const hashStr = `scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${salt}$${derivedKey.toString('hex')}`;
    return {
      hash: hashStr,
      salt,
    };
  }

  /**
   * Synchronous Scrypt hash for backwards compatibility and test suites.
   */
  public static hashPassword(password: string): HashResult {
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    const salt = crypto.randomBytes(32).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keyLen, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      maxmem: 64 * 1024 * 1024,
    });

    const hashStr = `scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${salt}$${derivedKey.toString('hex')}`;
    return {
      hash: hashStr,
      salt,
    };
  }

  /**
   * Verifies a password against a stored Scrypt hash asynchronously in constant time.
   */
  public static async verifyPasswordAsync(password: string, storedHash: string): Promise<boolean> {
    if (!password || !storedHash) return false;

    try {
      const parts = storedHash.split('$');
      if (parts.length !== 4 || parts[0] !== 'scrypt') {
        return false;
      }

      const paramPairs = parts[1].split(',').reduce((acc, pair) => {
        const [k, v] = pair.split('=');
        acc[k] = parseInt(v, 10);
        return acc;
      }, {} as Record<string, number>);

      const salt = parts[2];
      const expectedKeyHex = parts[3];
      const expectedKey = Buffer.from(expectedKeyHex, 'hex');

      const derivedKey = (await scryptAsync(password, salt, expectedKey.length, {
        N: paramPairs.N || SCRYPT_PARAMS.N,
        r: paramPairs.r || SCRYPT_PARAMS.r,
        p: paramPairs.p || SCRYPT_PARAMS.p,
        maxmem: 64 * 1024 * 1024,
      })) as Buffer;

      if (derivedKey.length !== expectedKey.length) {
        return false;
      }

      return crypto.timingSafeEqual(derivedKey, expectedKey);
    } catch {
      return false;
    }
  }

  /**
   * Synchronous verification in constant time.
   */
  public static verifyPassword(password: string, storedHash: string): boolean {
    if (!password || !storedHash) return false;

    try {
      const parts = storedHash.split('$');
      if (parts.length !== 4 || parts[0] !== 'scrypt') {
        return false;
      }

      const paramPairs = parts[1].split(',').reduce((acc, pair) => {
        const [k, v] = pair.split('=');
        acc[k] = parseInt(v, 10);
        return acc;
      }, {} as Record<string, number>);

      const salt = parts[2];
      const expectedKeyHex = parts[3];
      const expectedKey = Buffer.from(expectedKeyHex, 'hex');

      const derivedKey = crypto.scryptSync(password, salt, expectedKey.length, {
        N: paramPairs.N || SCRYPT_PARAMS.N,
        r: paramPairs.r || SCRYPT_PARAMS.r,
        p: paramPairs.p || SCRYPT_PARAMS.p,
        maxmem: 64 * 1024 * 1024,
      });

      if (derivedKey.length !== expectedKey.length) {
        return false;
      }

      return crypto.timingSafeEqual(derivedKey, expectedKey);
    } catch {
      return false;
    }
  }
}
