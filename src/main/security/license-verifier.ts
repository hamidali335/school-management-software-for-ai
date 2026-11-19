import crypto from 'node:crypto';

export interface SignedLicensePayload {
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
  licenseVersion: number;
}

export interface VerificationResult {
  isValid: boolean;
  error?: string;
  payload?: SignedLicensePayload;
}

export class LicenseVerifier {
  /**
   * Verifies an Ed25519 digital signature of the canonical license payload.
   */
  public static verifySignature(
    signedPayloadJson: string,
    signatureBase64: string,
    publicKeyPem: string,
  ): boolean {
    try {
      const publicKey = crypto.createPublicKey(publicKeyPem);
      const signatureBuffer = Buffer.from(signatureBase64, 'base64');
      const payloadBuffer = Buffer.from(signedPayloadJson, 'utf8');

      return crypto.verify(null, payloadBuffer, publicKey, signatureBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Validates structural invariants, signature, and binding of the license.
   */
  public static validateLicense(
    signedPayloadJson: string,
    signatureBase64: string,
    publicKeyPem: string,
    expectedSchoolId: string,
    expectedDeviceId: string,
    expectedFingerprint: string,
  ): VerificationResult {
    // 1. Verify digital signature
    if (!this.verifySignature(signedPayloadJson, signatureBase64, publicKeyPem)) {
      return { isValid: false, error: 'SIGNATURE_FORGERY_OR_TAMPERED' };
    }

    // 2. Parse payload
    let payload: SignedLicensePayload;
    try {
      payload = JSON.parse(signedPayloadJson);
    } catch {
      return { isValid: false, error: 'MALFORMED_LICENSE_PAYLOAD' };
    }

    // 3. Verify school tenant binding
    if (payload.schoolId !== expectedSchoolId) {
      return { isValid: false, error: 'TENANT_MISMATCH' };
    }

    // 4. Verify device binding
    if (payload.deviceId !== expectedDeviceId) {
      return { isValid: false, error: 'DEVICE_ID_MISMATCH' };
    }

    // 5. Verify hardware fingerprint
    if (payload.hardwareFingerprint !== expectedFingerprint) {
      return { isValid: false, error: 'DEVICE_FINGERPRINT_MISMATCH' };
    }

    // 6. Verify required fields
    if (!payload.licenseId || !payload.expiresAt || !Array.isArray(payload.entitlements)) {
      return { isValid: false, error: 'INVALID_LICENSE_SCHEMA' };
    }

    return { isValid: true, payload };
  }
}
