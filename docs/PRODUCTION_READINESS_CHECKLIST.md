# School Management Software — Production Readiness Checklist

**Project:** School Management Software (Windows Desktop Client)  
**Version:** 1.0.0  
**Target Platform:** Windows 10 & 11 (64-bit)  
**Assessment Date:** November 14, 2026

---

## 1. Readiness Summary Matrix

| Category | Verification Item | Status | Production Requirement |
| :--- | :--- | :---: | :--- |
| **Packaging & Distribution** | NSIS Windows Installer Built | **VERIFIED** | `School Management Software Setup 1.0.0.exe` generated in `release/` (112.28 MB). |
| **Packaging & Distribution** | Standalone Execution | **VERIFIED** | Operates without Node.js, npm, or Python on target machine. |
| **Packaging & Distribution** | Non-Destructive Uninstall | **VERIFIED** | `deleteAppDataOnUninstall: false` preserves `%APPDATA%` databases and backups. |
| **Packaging & Distribution** | Start Menu & Desktop Shortcuts | **VERIFIED** | Generated with official graduation emblem icon. |
| **Security & Integrity** | Code Signing Certificate | **PENDING (PROD)** | Unsigned in development. Requires EV Authenticode certificate for commercial distribution. |
| **Security & Integrity** | Database-at-Rest Encryption | **ASSESSED** | Backups are AES-256-GCM encrypted. Active database protected by Windows NTFS ACLs & DPAPI. SQLCipher assessed. |
| **Security & Integrity** | Password Security | **VERIFIED** | Scrypt async hashing, constant-time verification, 5-attempt lockout, 4h timeout. |
| **Security & Integrity** | Financial Ledger Immutability | **VERIFIED** | Hardened triggers block row deletions. Linked reversal contra-entries enforced. |
| **Licensing & Protection** | Hardware-Bound Activation | **VERIFIED** | Deterministic SHA-256 Windows hardware fingerprinting (`fp_win_<digest>`). |
| **Licensing & Protection** | Offline Grace Period | **VERIFIED** | Configurable grace days survive restarts; backward clock rollback tamper guards active. |
| **Automated Updates** | Manifest Verification & Channels| **VERIFIED** | Semver progression check, stable vs beta segregation, minimum supported version gating. |
| **Automated Updates** | Integrity Check | **VERIFIED** | SHA-512 cryptographic verification rejects corrupted or tampered payloads. |
| **Automated Updates** | Safety Pre-Update Backup | **VERIFIED** | WAL flush and automated safety backup snapshot created before installer spawn. |
| **Backups & Disaster Recovery**| Multi-Destination Engine | **VERIFIED** | Local, Central Cloud, External Drive / USB destinations functional. |
| **Backups & Disaster Recovery**| Encrypted WAL Backups | **VERIFIED** | `SMSBAK01` header, Scrypt key derivation, AES-256-GCM authenticated encryption. |
| **Backups & Disaster Recovery**| Non-Destructive Sandbox Verify | **VERIFIED** | `PRAGMA integrity_check` and record count inspection before swap. |
| **Cloud Synchronization** | Local-First Sync Engine | **VERIFIED** | Dependency-aware ordering, loopback prevention, conflict resolution staging. |
| **Quality & Performance** | Automated Test Regression | **VERIFIED** | **123 / 123 tests passing (100%)** across 13 test suites. |
| **Quality & Performance** | Production TypeScript & Vite | **VERIFIED** | Clean compilation with 0 errors. |
| **Quality & Performance** | Electron Headless Launch | **VERIFIED** | Clean window initialization and exit code 0. |

---

## 2. Outstanding Production Prerequisites

Before publishing the installer to external schools or cloud hosting, the following commercial steps must be performed by the deployment team:

1. **Obtain an Authenticode Code Signing Certificate:**
   - Procure an Extended Validation (EV) Code Signing Certificate from an authorized CA (DigiCert, Sectigo).
   - Configure CI/CD release pipeline with `CSC_LINK` and `CSC_KEY_PASSWORD` to sign the built `.exe` installer.
   - This prevents Windows SmartScreen warnings on first run.

2. **Configure Production Cloud Backup Object Storage:**
   - Replace the backend's local filesystem storage adapter (`LocalFileSystemBackupStorage`) with the Amazon S3 / Google Cloud Storage adapter using the provided `ICloudBackupStorage` interface.

3. **Deploy Production Update Hosting:**
   - Host the release manifests and installer executables on a high-availability CDN or S3 bucket matching the URL configured in `app_update_config`.

4. **Database-at-Rest Roadmap (SQLCipher):**
   - When precompiled native SQLCipher wheels matching Electron 41 / Node 22 ABI become standardized, execute the documented migration runbook to transition from NTFS ACL protection to page-level AES-256 encryption.
