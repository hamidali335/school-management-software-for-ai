# School Management Software — Database Migration and Recovery Specification

**Document Version:** 1.0.0  
**Database Engine:** Embedded SQLite 3 (better-sqlite3 v13)  
**Journal Mode:** Write-Ahead Logging (`WAL`)  
**Fsync Level:** `synchronous = FULL` (2)  
**Foreign Keys:** `foreign_keys = ON` (1)

---

## 1. Migration Architecture & Schema Versions

All schema changes in the desktop application are strictly forward-only and executed within atomic SQLite transactions. Each migration script defines:
- A monotonic integer `version`.
- A human-readable `name`.
- An `up(db: Database)` function executed within `db.transaction()`.
- Checksum tracking in `schema_migrations`.

### Schema Migration Registry (Migrations 001 – 009)
| Version | Migration Identifier | Scope & Invariants Introduced |
| :---: | :--- | :--- |
| **001** | `001_core_schema` | Core entities: `installation_config`, `classes`, `sections`, `academic_sessions`, `students`, `student_enrollments`, `attendance`, `fee_structures`, `invoices`, `payments`, `employees`. Enforces foreign key constraints. |
| **002** | `002_auth_schema` | Local user authentication: `users`, `user_sessions`, Scrypt password hashing, 5-attempt brute-force lockout, 4-hour inactivity timeout. |
| **003** | `003_audit_sync_schema` | Security audit trail (`audit_logs`) and local-first change tracking queue (`sync_outbox`). |
| **004** | `004_financial_protection` | Financial immutability: custom SQLite triggers blocking `DELETE` and row-level `UPDATE` on payments with history; linked reversal contra-entries. |
| **005** | `005_academic_and_financial_extensions` | Examinations, papers, marks, grading scales, timetable period allocations, and expense vouchers. |
| **006** | `006_comprehensive_business_workflows` | Single active guardian invariant (`guardians`, `student_guardians`), fee concessions, staff attendance, salary structures, payroll slips. |
| **007** | `007_sync_engine_and_conflicts` | Outbox ordering, sequence counters, conflict staging (`sync_conflicts`), and sync history logs. |
| **008** | `008_licensing_and_automated_backups` | Signed Ed25519 license cache (`license_cache`), monotonic clock rollback guards, backup configs, and multi-destination backup history. |
| **009** | `009_performance_optimization_and_update_state` | High-frequency query indexes on student rosters, overdue invoices, and sync queue; auto-update client state (`app_update_config`). |

---

## 2. Automated Pre-Migration Safety Snapshots

Before any forward migration is applied to an existing database, the `migration-runner` executes a non-blocking synchronous database snapshot:

```typescript
// migration-runner.ts
if (applied.size > 0 && options?.backupDir) {
  db.pragma('wal_checkpoint(TRUNCATE)');
  const filename = `pre_migration_v${pending[0].version}_${Date.now()}.sqlite`;
  preMigrationBackupPath = path.join(options.backupDir, filename);
  const serialized = db.serialize();
  fs.writeFileSync(preMigrationBackupPath, serialized);
}
```

### Safety Guarantees
1. **Zero-Byte Loss:** The snapshot is taken after truncating the WAL, guaranteeing a 100% consistent page snapshot.
2. **Atomic Rollback:** If any SQL statement inside a migration fails, SQLite rolls back the entire transaction. The existing schema version in `schema_migrations` remains untouched.
3. **Disaster Recovery:** If an unexpected power loss occurs midway through an operating system write, the administrator can restore the pre-migration snapshot directly from `%APPDATA%\School Management Software\backups\pre_migration\`.

---

## 3. Crash Recovery & WAL Durability Invariants

The application relies on SQLite's ACID-compliant Write-Ahead Log (`WAL`) with `synchronous = FULL`:

### Behavior Under Abrupt Termination
1. **Uncheckpointed Transactions:** Transactions committed to the `-wal` file before an unexpected power failure or forced process kill remain fully durable.
2. **Reopening Recovery:** When the application restarts, SQLite automatically inspects the `-wal` file and replays all committed frames into the primary database file before opening reader connections.
3. **Integrity Check:** On every boot, the connection initialization runs `PRAGMA integrity_check;`. If any page corruption is detected, boot is halted and recovery prompts are shown.

---

## 4. Disaster Recovery Runbook

### Scenario A: Damaged Active Database File
If an antivirus tool or disk sector error corrupts `school_local.db`:
1. Close School Management Software.
2. Navigate to `%APPDATA%\School Management Software\`.
3. Rename damaged `school_local.db` to `school_local_corrupted.db.bak`.
4. Locate the most recent automated encrypted backup in `%APPDATA%\School Management Software\backups\local\`.
5. Launch the application. Because `school_local.db` is missing, the application enters provisioning/recovery mode.
6. Use **Settings > Automated Backup & Restore > Restore from Backup**, select the encrypted `.enc` file, enter the school master passphrase, and confirm restoration.
7. The database integrity check validates all tables, re-establishes foreign keys, and restores complete financial and student records.

### Scenario B: Failed Upgrade Reversal
If an upgrade was applied inadvertently and requires reverting to a previous software version:
1. Uninstall the newer build.
2. Install the previous build.
3. If schema migrations were applied that are incompatible with older software binaries, restore the automated pre-migration snapshot saved in `%APPDATA%\School Management Software\backups\pre_migration\`.
4. Launch the previous software build.
