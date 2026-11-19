# School Management Software — Release and Code Signing Guide

**Document Version:** 1.0.0  
**Target OS:** Windows 10 & 11 (x64)  
**Signing Standard:** Microsoft Authenticode (X.509 Code Signing Certificate)

---

## 1. Code Signing Architecture & Workflow

In production distribution, Windows enforces strict application reputation and integrity checks through **Microsoft Defender SmartScreen** and **Windows Defender Application Control (WDAC)**.

Unsigned applications trigger a prominent warning:  
*"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

To eliminate this friction and verify software authenticity, all production releases must be cryptographically signed using a valid Windows Authenticode certificate.

---

## 2. Environment Configuration & Secret Isolation

In strict accordance with project security boundaries:
- **Private keys, `.pfx` files, and certificates must NEVER be committed to Git repositories.**
- Packaging scripts load signing credentials strictly through environment variables or secure hardware security modules (HSM / Azure Trusted Signing).

### Environment Variables for Electron-Builder
When packaging production release builds on the authorized CI/CD release agent:

```powershell
# Windows Authenticode PKCS#12 (.pfx) Certificate Configuration
$env:CSC_LINK = "C:\SecureCerts\school_management_systems_ev.pfx" # Local path or base64 string
$env:CSC_KEY_PASSWORD = "StrongSecurePasswordHere"                # Certificate encryption passphrase
$env:WIN_CSC_LINK = $env:CSC_LINK
$env:WIN_CSC_KEY_PASSWORD = $env:CSC_KEY_PASSWORD

# Build and Sign NSIS Installer
cd D:\SMS\SchoolManagementSoftware
npm run dist
```

### Supported Certificate Types
1. **Extended Validation (EV) Code Signing Certificate:**
   - Issued by authorized Certificate Authorities (DigiCert, Sectigo, GlobalSign).
   - Stored on FIPS 140-2 Level 2 hardware tokens (USB tokens or Cloud HSMs like Azure Key Vault).
   - Grants **immediate SmartScreen reputation**, preventing all security warning prompts from the very first download.
2. **Standard Code Signing Certificate:**
   - Validates organizational identity.
   - SmartScreen reputation builds organically as cumulative downloads increase across Windows endpoints.

---

## 3. Development vs Production Build Verification

During local development and Phase 7 testing:
- **Signing Status:** `Unsigned Development Build (Code signing skipped)`.
- **Honest Reporting:** The generated installer `School Management Software Setup 1.0.0.exe` is a fully functional, genuine NSIS package, but is unsigned. Windows AppLocker or SmartScreen in strict test environments will correctly report the lack of digital signature.
- **Production Prerequisite:** Prior to distributing the installer to customer schools via USB or website download, run `electron-builder` with an EV code-signing certificate to generate the signed production release candidate.

---

## 4. Verifying Digital Signatures on Built Artifacts

Once signed, verify the executable's signature using Microsoft `signtool.exe` or PowerShell:

```powershell
# Inspect Authenticode Signature in PowerShell
Get-AuthenticodeSignature 'D:\SMS\SchoolManagementSoftware\release\School Management Software Setup 1.0.0.exe'

# Expected Valid Output:
# SignerCertificate: [Thumbprint] CN=School Management Systems Inc.
# Status: Valid
# StatusMessage: Signature verified.
```

---

## 5. Certificate Lifecycle & Annual Renewal

1. **Validity Period:** Standard code signing certificates are valid for 1 to 3 years.
2. **Timestamping (RFC 3161):** Packaging configurations must always include an authoritative timestamp server (e.g. `http://timestamp.digicert.com`). This ensures that after the certificate expires, previously built and signed installers remain permanently valid and trusted on target workstations.
3. **Renewal Workflow:** Re-key the certificate 30 days prior to expiration and update the CI/CD secure key vault.
