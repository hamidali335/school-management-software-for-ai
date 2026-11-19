# School Management Software — Backup and Disaster Recovery Guide

**Document Version:** 1.0.0  
**Scope:** Automated Backups, Multi-Destination Routing, AES-256-GCM Encryption & Safe Restoration  
**Database Engine:** Embedded SQLite with Write-Ahead Logging (`WAL`)

---

## 1. Backup System Overview

The desktop application features an enterprise-grade automated backup engine designed to protect schools from hardware failure, ransomware, and administrative mistakes.

### Core Guarantees
1. **WAL-Consistent Snapshots:** Uses `better-sqlite3`'s Online Backup API (`db.backup(tempPath)`), taking non-blocking consistent snapshots while write transactions remain active.
2. **Authenticated Envelope Encryption (AES-256-GCM):**
   - Header: `[SMSBAK01 (8B)][Salt (32B)][IV (12B)][AuthTag (16B)][Ciphertext]`.
   - Master passphrase key derivation using Scrypt (N=32768, r=8, p=1).
   - Tampered backup files are detected immediately and rejected prior to decryption.
3. **Multi-Destination Redundancy:**
   - **Local Directory:** `%APPDATA%\School Management Software\backups\local\`
   - **Central Cloud:** Authorized School OS backend `/api/v1/backups/school/upload`
   - **External Drive / USB:** Secondary removable storage / NAS (e.g. `E:\SchoolBackups\`)
4. **Automated Backup Rotation:** Rotates oldest backups to preserve disk space while maintaining a configurable retention count (default 10 local backups).

---

## 2. Safe Restoration Invariants

Restoring a database replaces the active school database. To prevent catastrophic data loss or accidental overwrites, the application enforces 5 mandatory safety steps:

```
[User Selects Backup File]
          │
          ▼
1. Decrypt into Temporary Sandbox Memory
          │
          ▼
2. Non-Destructive Inspection (PRAGMA integrity_check, schema version, record counts)
          │
          ▼
3. Explicit User Confirmation Modal (Must check "I understand this replaces active database")
          │
          ▼
4. Automatic Pre-Restore Safety Snapshot of Active DB (Saved as pre_restore_snapshot_*.sqlite)
          │
          ▼
5. Checkpoint WAL and Atomic File Replacement
          │
          ▼
6. Re-Verification & Re-opening of Database Handle
```

---

## 3. Disaster Recovery Scenarios

### Scenario 1: Workstation Hardware Failure (New Machine Restore)
If the school's primary computer suffers hardware failure:
1. Install **School Management Software** on a replacement Windows 10/11 workstation using `School Management Software Setup 1.0.0.exe`.
2. Launch the application to initialize clean database tables.
3. Plug in the external USB drive containing the latest `.enc` backup file (or download it from the Central Cloud backup portal).
4. In the initial setup screen, select **Restore School from Backup**.
5. Select the backup file, provide the master school recovery passphrase (derived from installation secret), and confirm.
6. The system decrypts the backup, validates the schema, and restores all students, attendance, fee invoices, payments, and outbox queues.
7. Revalidate the device license under **Settings > Subscription & Licensing**.

### Scenario 2: Recovering from an Accidental Database Restoration
If an administrator mistakenly restores an outdated backup file:
1. Locate the automatic pre-restore safety snapshot in `%APPDATA%\School Management Software\`:
   `pre_restore_snapshot_<timestamp>.sqlite`
2. This unencrypted snapshot contains the exact state of the database immediately prior to the restore operation.
3. Use **Settings > Automated Backup & Restore > Restore from Backup**, point to the safety snapshot, and restore the active database to its pre-operation state.
