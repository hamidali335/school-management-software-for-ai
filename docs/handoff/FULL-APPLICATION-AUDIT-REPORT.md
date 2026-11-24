# Full Application Audit Report
**Workspace:** School Management Software Desktop Application & Cloud Backend  
**Audit Target:**  
- Desktop Application: `D:\school-management-software\SchoolManagementSoftware`  
- Cloud Backend: `D:\school-management-software\school-os-backend`  
**Execution Date:** 2026-11-22  
**Audit Coordinator:** Antigravity Engineering Harness Coordinator  
**Audit Team:** 8 Specialized Agents (Build & Performance, IPC & SQLite, Cloud API & Auth, Sync & Offline, Security & Licensing, Functional Modules, UI Quality, Packaging & Release)  
**Overall Readiness Verdict:** **BLOCKED (DO NOT DEPLOY)**

---

## A. Executive Summary

A comprehensive, multi-agent evidence-based audit was conducted across the entire School Management Software ecosystem, spanning the Windows Electron desktop application and the modular monolith cloud backend. The audit verified compile-time artifacts, automated test suites, performance benchmarks, IPC wiring, SQLite schema migrations, offline-first sync protocols, multi-tenant isolation, cryptography, licensing enforcement, all 19 functional business modules, visual UI rendering at standard school resolutions, and packaging configurations.

### 1. Overall Readiness Verdict: **BLOCKED**
The software is **BLOCKED** from commercial production deployment and customer distribution. While core cryptographic foundations (whole-database SQLCipher page encryption, Windows DPAPI key sealing) and multi-tenant cloud backend isolation are architecturally robust, multiple critical **P0 blockers** prevent viable operation:
1. **Packaged Windows Application Launch Crash:** The distributed release executable (`release/win-unpacked/School Management Software.exe`) crashes immediately on startup with `DEVICE_ISOLATION_VIOLATION` due to MAC address fingerprint mismatch.
2. **Cloud Sync Authorization Bypass:** The cloud backend sync processor pushes events without contextual authorization (`!ctx`), granting universal admin privileges to all offline pushes and completely bypassing teacher 7-day limits, locked register restrictions, and section access checks.
3. **Decoupled License Expiry Lockout:** When subscription expires, the desktop application fails closed with `SUBSCRIPTION_EXPIRED` on read operations, violating core technical constraint Decision 1 (which guarantees read-only browsing, searching, backup, and export).
4. **Institutional Reports View Crash:** Generating institutional reports from the desktop UI fails immediately with an uncaught `TypeError: window.desktopAPI.generateReport is not a function`.
5. **Silent Skipping of Financial Ledger Columns:** Migration 012 checks non-existent table names `fee_payments` and `fee_invoices` (instead of canonical `payments` and `invoices`), silently skipping offline transaction IDs, entry types, provisional flags, and overpayment balances.
6. **Ineffective Demo Data Purge:** The production initialization purge function is a no-op that deletes zero financial or student records due to wrong table names and anti-cascade foreign key triggers, leaving demo data in production client databases.

### 2. Defect Count Summary

| Severity | Count | Primary Impact |
|---|:---:|---|
| **P0 (Blocker)** | **9** | Prevents application launch, bypasses cloud authorization, corrupts financial schema, crashes reporting view, locks expired reads, prevents demo data purge. |
| **P1 (Critical / High)** | **18** | Security leaks (test databases in ASAR), missing webContents navigation guards, token invalidation breaks sync, provisional writes allowed for non-attendance/fee entities, outbox crash on undefined result access, unvalidated notices IPC. |
| **P2 (Medium / Quality)** | **19** | TypeScript compilation errors, UI typos ("Initial sync" permanently shown), dropped month filters, non-teachers in timetable dropdown, IPC error format inconsistencies, table overflow at 1280x720. |
| **P3 (Low / Hygiene)** | **12** | Missing `export type` under `isolatedModules`, unconstrained singleton updates, missing executable metadata properties, non-functional dark mode toggle placeholder. |
| **TOTAL DEFECTS** | **58** | **Full application remediation required prior to customer release.** |

---

## B. Agent Execution Matrix

| Agent | Scope & Domain | Status | Work Completed & Artifacts | Primary Findings / Blockers |
|---|---|:---:|---|---|
| **Agent 1** (Coordinator) | Build, Tests & Performance Baseline | **COMPLETE** | Executed desktop/backend builds, unit test suites, performance benchmarks, replica set sync suites. | 205 desktop tests passed (3.75s), 16 backend sync tests passed (23.07s). Vite chunk size warning (>500 kB). Cold start: 106ms. |
| **Agent 2** | IPC, Preload & SQLite Integrity | **COMPLETE** | Audited 125 Preload methods, 120 IPC handlers, 14 SQLite migrations, 50 tables, 332 SQL queries. Generated full IPC matrix and schema dumps. | 3 P0, 3 P1, 5 P2, 2 P3. Found `generateReport` mismatch, Migration 012 missing columns, `purgeDemoData` no-op, `retry_count` column error. |
| **Agent 3** | Cloud API & Authentication | **COMPLETE** | Audited 353 cloud routes, desktop API clients, JWT lifecycle, token refresh mutex, 401 retry behavior, contract compatibility. | 1 P0, 3 P1, 4 P2, 1 P3. Found `license:activate` sends local token instead of cloud JWT, password change breaks sync tokens, offline mirror envelope mismatch. |
| **Agent 4** | Offline-First & Synchronization | **COMPLETE** | Audited WriteCoordinator, SyncEngine, sequence change feeds, 6-state outbox machine, receipt block manager, conflict resolution. | 1 P0, 5 P1, 4 P2, 2 P3. Found cloud sync authorization bypass (`!ctx`), outbox conflict state overwrite, missing offline receipt reconciliation write-back. |
| **Agent 5** | Security, Licensing & Tenant Isolation | **COMPLETE** | Audited SQLCipher encryption, Windows DPAPI vault, monotonic clock tracking, Ed25519 license verification, 188-route tenant probes. | 3 P0, 3 P1, 4 P2, 2 P3. Found `verifyBackupFile` unlocks global key, `assertCanRead` blocks expired reads, `'cloud_auth_verified'` bypasses signature check. |
| **Agent 6** | 19 Functional Business Modules | **COMPLETE** | Audited all 19 functional modules across UI, IPC, services, repositories, and backend routes. Generated 19-module scorecard. | 2 P0, 8 P1, 10 P2, 7 P3. Found teacher RBAC 403 on timetable/exams, attendance roster overwrite, missing salary structure UI, missing subject master CRUD. |
| **Agent 7** | UI & Visual Quality | **COMPLETE** | Visual inspection and responsive layout verification at 1280x720 and 1366x768. Captured 24 screenshots across core workflows. | 0 P0, 0 P1, 5 P2, 4 P3. Responsive grade A-. Table scroll clipping at 1280x720, long form dialog vertical overflow, low contrast badges, missing loading spinners. |
| **Agent 8** | Packaging & Release Readiness | **COMPLETE** | Inspected Electron packaging configs, ASAR archive contents, setup installer, launch integrity, and binary file signatures. | 1 P0, 2 P1, 3 P2, 3 P3. Packaged app crashes on boot (`DEVICE_ISOLATION_VIOLATION`), test DBs and secrets packed in ASAR (1.4 MB bloat), missing window navigation guards. |

---

## C. Command Execution Matrix

| # | Command Executed | Directory | Exit Code | Result Summary | Execution Time | Notes / Important Warnings |
|:---:|---|---|:---:|---|:---:|---|
| **C1** | `npm run build` | `SchoolManagementSoftware` | **0** | **PASS** (TS Main: 0 errors; Vite: 2108 modules built) | 3.11s | Emitted Vite bundle size warning: `dist/renderer/assets/index-BIVEUTa6.js` is 516.02 kB (>500 kB chunk warning limit). |
| **C2** | `npm test` | `SchoolManagementSoftware` | **0** | **PASS** (16 suites, 205 passed, 0 failed) | 3.75s | Node.js built-in test runner. Confirmed SQLite in-memory, foreign keys, triggers, SQLCipher failure closed, DPAPI mock, monotonic clock. |
| **C3** | `node scripts/profile-performance.js` | `SchoolManagementSoftware` | **0** | **PASS** (All benchmarks passed thresholds) | 1.15s | Key unsealing: 7.16ms; DB init/migrations: 99.19ms; Cold boot: 106.35ms; Scrypt auth: 61.60ms; Student query: 0.163ms; RSS: 51.55 MB; Shutdown: 3.62ms. |
| **C4** | `npm run build` | `school-os-backend` | **0** | **PASS** (TypeScript `tsc -p tsconfig.build.json`) | 4.82s | Clean compilation; zero TypeScript errors. Output emitted to `dist/`. |
| **C5** | `npx vitest run tests/web-route-regression.test.ts` | `school-os-backend` | **0** | **PASS** (1 suite, 6 passed, 0 failed) | 8.35s | Regression testing against live Express routes; confirmed CORS, headers, route mounting. |
| **C6** | `npm run test:sync` | `school-os-backend` | **0** | **PASS** (3 suites, 16 passed, 0 failed) | 23.07s | Ran against real MongoDB replica set (`MongoMemoryReplSet`). 30 concurrent attendance saves of 40 students each (1,200 records): 0 failures, p50 579ms. |
| **C7** | `npx vitest run tests/slice5-licensing-and-compat.replset.test.ts --project replset` | `school-os-backend` | **0** | **PASS** (1 suite, 2 passed, 0 failed) | 9.70s | Tested backend licensing, subscription status transitions, and backward compatibility. |

---

## D. Eight-Domain Scorecard

### Domain 1: Build, Tests and Performance Baseline
- **Verdict:** **PASS WITH WARNINGS**
- **Status:** Desktop and backend builds compile cleanly. 100% of automated unit tests pass (205 desktop, 24 backend replica set tests). Performance profiling easily meets all performance budgets (cold boot 106ms vs 500ms budget; query latency 0.16ms vs 5ms budget; RSS 51.5 MB vs 150 MB budget).
- **Warnings:**
  - Vite emits a chunk size warning (>516 kB for renderer bundle).
  - Vitest backend suites generate minor deprecation notices regarding Mongoose query callbacks.

### Domain 2: IPC, Preload and SQLite Integrity
- **Verdict:** **FAIL (BLOCKER DEFECTS)**
- **Status:** Context bridge security is strictly maintained (`contextIsolation: true`, zero direct node/renderer leakage). All 120 main IPC handlers map to preload bridges. However, critical runtime wiring and migration defects exist:
  - `ReportsView.tsx` calls undefined `generateReport` instead of `getReport`.
  - Migration 012 silently skipped adding required financial ledger columns to `payments` and `invoices`.
  - `InstallationRepository.purgeDemoData()` fails to purge any records on deployment.
  - Sync change-tracker queries reference non-existent `retry_count` column.

### Domain 3: Cloud API and Authentication
- **Verdict:** **FAIL (BLOCKER DEFECTS)**
- **Status:** 353 cloud routes are structurally mapped. Tenant filtering middleware is universally applied. However:
  - Desktop `license:activate` and `license:deactivate` IPC handlers send local SQLite session tokens (`ses_...`) instead of cloud JWTs, causing HTTP 401 failures.
  - Password change in desktop discards cloud TokenPair, permanently desynchronizing local credentials and breaking cloud sync.
  - Offline mirror cache endpoints return bare JSON arrays instead of the documented API envelope `{ success: true, data: [...] }`.

### Domain 4: Offline-First Architecture and Synchronization
- **Verdict:** **FAIL (BLOCKER DEFECTS)**
- **Status:** High concurrency replica-set sequence tracking (`school_sequences` and `SyncChangeLog`) performs reliably. However:
  - Universal authorization bypass on backend push: `processDomainEvent` called without `ctx`, evaluating `isAdminOrManager = true` for all pushes.
  - `WriteCoordinator` catches HTTP 409 and overwrites `conflict` state with `needs_attention`.
  - `fees:collect-offline-safe` IPC handler does not persist payments to SQLite or update invoice balances locally.
  - Offline provisional receipt reconciliation numbers are never written back to desktop SQLite.

### Domain 5: Security, Licensing and Tenant Isolation
- **Verdict:** **FAIL (BLOCKER DEFECTS)**
- **Status:** SQLCipher AES-256 whole-database page encryption, DPAPI key sealing, and multi-tenant isolation (6,580 probes across 188 routes with zero cross-tenant leaks) are exceptional. However:
  - `BackupService.verifyBackupFile()` calls `unlock()` on the global key manager singleton, clearing locks without authorization.
  - `assertCanRead()` throws `SUBSCRIPTION_EXPIRED` on expired licenses, blocking read-only access and violating technical Decision 1.
  - Hardcoded `'cloud_auth_verified'` bypasses Ed25519 signature and device fingerprint verification.
  - Backend payment reversal updates records in-place without linked reversal contra-entries, violating financial ledger immutability.

### Domain 6: Functional Modules (19 Modules)
- **Verdict:** **FAIL (BLOCKER DEFECTS)**
- **Status:** Student, guardian, section, and basic attendance workflows are functional. However:
  - Reports module crashes on launch (`TypeError`).
  - Attendance view lacks historical fetch, resetting rosters to present and overwriting previous absences.
  - Timetable and Exam modules assert incorrect RBAC permission keys (`academics:*` instead of `timetable:*` and `exams:*`), locking teachers out with HTTP 403.
  - Missing salary structure UI in Staff module and missing Subject Master CRUD in Academics.

### Domain 7: UI and Visual Quality
- **Verdict:** **PASS WITH WARNINGS**
- **Status:** Desktop interface is visually polished, modern, and professional (Grade A-). Layouts scale well between 1280x720 and 1366x768. Navigation is responsive with zero layout breakage.
- **Warnings:**
  - Table horizontal overflow clipping on small screens without visual scroll hints.
  - Multi-field modal dialogs vertically overflow viewport on 768p displays without internal scrolling.
  - Muted badge contrast (3.8:1) fails WCAG AA 4.5:1 ratio.
  - Absence of loading skeletons during PDF report rendering.

### Domain 8: Packaging and Release
- **Verdict:** **FAIL (BLOCKER DEFECTS)**
- **Status:** Electron Builder successfully bundles Windows NSIS installers. However:
  - Packaged executable immediately crashes on launch due to MAC address isolation mismatch (`DEVICE_ISOLATION_VIOLATION`).
  - Packaging configuration bundles test databases (`school_local.db`), encryption key files (`.vault/dek.dpapi`), and migration snapshots into `app.asar` (1.4 MB bloat and sensitive data leak).
  - Main window lacks `will-navigate` and `setWindowOpenHandler` security restrictions.

---

## E. Nineteen-Module Functional Scorecard

| # | Module Name | Operational Mode | Implementation Status | Verified Workflows | Validation & Persistence | Known Defects | Verification Tier |
|:---:|---|---|:---:|---|---|---|:---:|
| **1** | **Authentication & Session** | Offline-First (Hybrid) | Partially Functional | Provision initial admin, local password login, Scrypt hash verification, logout, session expiration. | SQLite `users`, `user_sessions`, Scrypt hashing, DPAPI key unsealing. | AUTH-DEFECT-02 (Password change breaks cloud sync token), DEFECT-SEC-03 (Session token in URL log). | **AUTOMATED TEST & RUNTIME VERIFIED** |
| **2** | **Dashboard & Metrics** | Local SQLite | Functional | Student counts, attendance rate, fee collection aggregates, sync status card. | SQLite aggregate queries across `students`, `attendance`, `payments`. | None. | **VISUALLY & RUNTIME VERIFIED** |
| **3** | **Student Management** | Local SQLite / Sync | Functional | Student admission, update profile, search, class filtering, status changes (active, inactive, graduated). | SQLite `students`, `student_guardians`, `student_enrollments`, Zod validation. | DEFECT-03 (Demo data purge fails to delete students due to financial triggers). | **VISUALLY & RUNTIME VERIFIED** |
| **4** | **Academics & Classes** | Local SQLite / Sync | Partially Functional | Class creation, section assignment, academic session activation. | SQLite `classes`, `sections`, `academic_sessions`. | DEF-11 (Missing Subject Master CRUD in UI; subjects entered as free text). | **VISUALLY & RUNTIME VERIFIED** |
| **5** | **Attendance Tracking** | Offline-Safe Mutation | Defective | Daily roster display, batch status marking (present, absent, late, leave). | SQLite `attendance`, outbox queue, unique index `(student_id, date)`. | DEF-15 (Never loads existing attendance for date; overwrites absences on save), DEF-SYNC-01 (Backend push auth bypass). | **AUTOMATED TEST & RUNTIME VERIFIED** |
| **6** | **Fee Billing & Invoices** | Local SQLite / Sync | Functional | Fee structure creation, monthly challan generation, discount assignment. | SQLite `fee_structures`, `invoices`, `fee_concessions`. | DEFECT-02 (Migration 012 skipped `overpaid` columns in `invoices`). | **VISUALLY & RUNTIME VERIFIED** |
| **7** | **Fee Collection & Cashier** | Offline-Safe Mutation | Defective | Receipt issuance, cash/bank payment collection, payment history. | SQLite `payments`, `receipt_blocks`, outbox queue. | DEF-SYNC-04 (`fees:collect-offline-safe` does not save locally), DEF-SYNC-05 (Reconciled receipts not written back), DEFECT-02 (Missing ledger columns). | **AUTOMATED TEST & RUNTIME VERIFIED** |
| **8** | **Timetable & Scheduling** | Local SQLite / Sync | Defective | Timetable grid viewing, period assignment, room conflict checks. | SQLite `timetable_entries`, `timetable_periods`. | DEF-13 (Asserts `academics:*` instead of `timetable:*`, blocking teachers with 403), DEFECT-09 (Non-teachers in dropdown). | **RUNTIME & STATIC VERIFIED** |
| **9** | **Examinations & Grading** | Local SQLite / Sync | Defective | Exam creation, term setup, marks entry, grading scale evaluation. | SQLite `exams`, `exam_papers`, `student_marks`. | DEF-19 (Asserts `academics:*` instead of `exams:*`, blocking teachers with 403), DEFECT-07 (`rank` typing breaks build). | **RUNTIME & STATIC VERIFIED** |
| **10** | **Staff & HR** | Local SQLite / Sync | Partially Functional | Staff directory, employee profile creation, attendance recording. | SQLite `employees`, `staff_attendance`. | DEF-09 (Missing UI to configure employee salary structures). | **VISUALLY & RUNTIME VERIFIED** |
| **11** | **Payroll Management** | Local SQLite | Partially Functional | Payroll run generation, slip calculation, basic allowance/deduction. | SQLite `payroll_runs`, `payroll_slips`. | Blocked by DEF-09 (Cannot generate slips without manual DB salary setup). | **RUNTIME VERIFIED** |
| **12** | **Accounts & Expenses** | Local SQLite / Sync | Functional | Expense voucher creation, category management, cash outflow tracking. | SQLite `expenses`, `account_categories`. | DEFECT-05 (Offline voucher creation returns undefined result in IPC handler). | **VISUALLY & RUNTIME VERIFIED** |
| **13** | **Institutional Reports** | Local SQLite (PDF/CSV) | **BROKEN (CRASHES)** | Roster report, Fee defaulters, Cash flow, Exam gazette, Attendance register. | `pdfmake`, `csv-writer`, SQLite aggregation queries. | DEF-24 / DEFECT-01 (`generateReport` vs `getReport` uncaught TypeError crashes view). | **STATIC & RUNTIME VERIFIED** |
| **14** | **Notice Board** | Online-Only (Slice 4) | Insecure | School-wide announcement drafting, role-based broadcasting. | SQLite `notices_cache`, Cloud API `/api/v1/notices`. | DEFECT-06 (No RBAC check, no license write check, no Zod validation on `notices:create`). | **STATIC VERIFIED** |
| **15** | **Sync Center** | System Service | Defective | Outbox queue monitoring, retry trigger, conflict inspection. | SQLite `sync_outbox`, `sync_history`, `SyncEngine`. | DEF-SYNC-03 (HTTP 409 overwrites conflict with `needs_attention`), DEFECT-04 (`retry_count` column crash). | **AUTOMATED TEST & RUNTIME VERIFIED** |
| **16** | **Backup & Restore** | System Service | Insecure | Local encrypted backup, verification preview, database restoration. | SQLCipher export, AES-256 backup encryption, SHA-256 integrity hash. | DEFECT-SEC-01 (`verifyBackupFile` unlocks global key singleton without auth). | **AUTOMATED TEST & RUNTIME VERIFIED** |
| **17** | **Technician & Deployment** | System Service | Functional | Workstation unlock, backend API URL configuration, diagnostic check. | `DeploymentConfigService`, PBKDF2/Scrypt technician passkey verification. | DEFECT-13 (`technician_lockout` queries omit explicit WHERE clause). | **AUTOMATED TEST & RUNTIME VERIFIED** |
| **18** | **License & Subscription** | Security Service | Defective | Subscription validation, feature entitlements, status polling. | Ed25519 signature verification, `device_licenses`, `license_cache`. | DEFECT-LIC-01 (Blocks read-only access on expiry), DEFECT-LIC-02 (`cloud_auth_verified` bypasses Ed25519), AUTH-DEFECT-01 (401 on activation). | **AUTOMATED TEST & RUNTIME VERIFIED** |
| **19** | **Application Updates** | System Service | Not Verified | Auto-update check, channel switching (stable/beta), installer download. | `electron-updater`, `app_update_config`. | DEF-PKG-005 (Installer does not prompt to close running app), unverified against live update server. | **STATIC VERIFIED / NOT RUNTIME TESTED** |

---

## F. Comprehensive Defect Ledger (Deduped P0–P3)

### Priority P0: Critical Release Blockers

```
DEFECT ID:     DEF-PKG-001 / DEF-01
SEVERITY:      P0 (Blocker)
AUDIT DOMAIN:  Domain 8 (Packaging & Release)
MODULE:        Electron Application Packaging
LOCATION:      release/win-unpacked/School Management Software.exe, src/main/security/device-fingerprint.ts:75-95
PROBLEM:       Packaged desktop application executable crashes immediately on startup.
ROOT CAUSE:    The existing packaged release was compiled before the fuzzy MAC address matching patch in `DeviceFingerprint.matches()` was integrated. When launching the packaged executable, the hardware fingerprint mismatch triggers `DEVICE_ISOLATION_VIOLATION: Database key belongs to another workstation` (Exit code 4294967295).
EVIDENCE:      Executed `scripts/verify-packaged-launch.js` against `release/win-unpacked/School Management Software.exe`. Process exited with fatal error.
ACTUAL:        Application aborts during boot; workstation window never renders.
EXPECTED:      Application unseals key and opens application window.
FIX:           Rebuild the packaged application (`npm run dist`) incorporating the updated `DeviceFingerprint` fuzzy MAC matching implementation.
```

```
DEFECT ID:     DEF-SYNC-01
SEVERITY:      P0 (Blocker)
AUDIT DOMAIN:  Domain 4 (Offline-First & Synchronization)
MODULE:        Cloud Backend Sync Service
LOCATION:      school-os-backend/src/modules/sync/sync.service.ts:325
PROBLEM:       Offline sync pushes bypass all role-based domain authorization checks on the cloud backend.
ROOT CAUSE:    In `pushBatch()`, `syncService` invokes `processDomainEvent(event)` without passing the `ctx` (UserContext) parameter. Inside `processDomainEvent()`, authorization logic evaluates `const isAdminOrManager = !ctx || ctx.roles.includes('admin') || ctx.roles.includes('superadmin');`. Because `ctx` is undefined, `isAdminOrManager` evaluates to `true` for all events, granting universal administrator privileges to every pushed change.
EVIDENCE:      Source code inspection of `sync.service.ts:325`. Tested offline attendance push from non-admin token: bypassed teacher 7-day limit and locked register checks.
ACTUAL:        Any workstation token can push arbitrary mutations without domain permission checks.
EXPECTED:      `pushBatch()` must pass the authenticated `UserContext` to `processDomainEvent` and enforce role restrictions.
FIX:           Pass `ctx` in `pushBatch`: `await this.processDomainEvent(event, ctx);`.
```

```
DEFECT ID:     DEFECT-SEC-01
SEVERITY:      P0 (Blocker)
AUDIT DOMAIN:  Domain 5 (Security, Licensing & Tenant Isolation)
MODULE:        Backup & Restoration Service
LOCATION:      SchoolManagementSoftware/src/main/services/backup.service.ts:168
PROBLEM:       Verifying any backup file unlocks the entire database, bypassing license and clock-tamper locks.
ROOT CAUSE:    `BackupService.verifyBackupFile()` calls `DatabaseKeyManager.getInstance().unlock()`. This mutates the global singleton state and sets `isLocked = false` without verifying administrative authorization, unlocking the workstation even if locked due to clock rollback or expired license.
EVIDENCE:      Static analysis of `backup.service.ts:168` and test harness verification.
ACTUAL:        Invoking backup verification clears system lock state.
EXPECTED:      Backup verification should only verify file header/HMAC without altering global key manager lock status.
FIX:           Remove `DatabaseKeyManager.getInstance().unlock()` from `verifyBackupFile()`. Use isolated key verification.
```

```
DEFECT ID:     DEFECT-LIC-01
SEVERITY:      P0 (Blocker)
AUDIT DOMAIN:  Domain 5 (Security, Licensing & Tenant Isolation)
MODULE:        License & Subscription Service
LOCATION:      SchoolManagementSoftware/src/main/services/license.service.ts:161-167
PROBLEM:       Expired license locks users out of browsing, searching, and exporting their own data.
ROOT CAUSE:    `license.service.ts:assertCanRead()` throws `SUBSCRIPTION_EXPIRED` when `status.state === 'expired'`. This directly violates core technical constraint Decision 1 (which guarantees read-only access for browsing, searching, backup, and export).
EVIDENCE:      Inspection of `assertCanRead()`:
               `if (status.state === 'expired') throw new Error('SUBSCRIPTION_EXPIRED');`
ACTUAL:        Read queries and exports are blocked when subscription expires.
EXPECTED:      `assertCanRead()` must allow read operations when license is expired; only write mutations and cloud sync should be blocked.
FIX:           Update `assertCanRead()` to allow read access when `status.state === 'expired'` or `'grace_period'`, blocking reads only if `status.state === 'revoked'` or `'clock_tampered'`.
```

```
DEFECT ID:     DEFECT-LIC-02
SEVERITY:      P0 (Blocker)
AUDIT DOMAIN:  Domain 5 (Security, Licensing & Tenant Isolation)
MODULE:        License Verification
LOCATION:      SchoolManagementSoftware/src/main/security/license-verifier.ts:30-45
PROBLEM:       Hardcoded test string bypasses cryptographic digital signature verification.
ROOT CAUSE:    The string `'cloud_auth_verified'` in `license-verifier.ts`, `license.service.ts`, and `auth.service.ts` bypasses Ed25519 signature checks and workstation binding, granting wildcard entitlements `['*']`.
EVIDENCE:      Code inspection of `license-verifier.ts:30`:
               `if (token === 'cloud_auth_verified') return { valid: true, features: ['*'] };`
ACTUAL:        Passing `'cloud_auth_verified'` grants full unverified access.
EXPECTED:      All license tokens must be cryptographically verified using institutional Ed25519 public keys.
FIX:           Remove hardcoded bypass string `'cloud_auth_verified'`. Require valid Ed25519 signed license envelopes.
```

```
DEFECT ID:     AUTH-DEFECT-01
SEVERITY:      P0 (Blocker)
AUDIT DOMAIN:  Domain 3 (Cloud API & Authentication)
MODULE:        Desktop IPC License Activation
LOCATION:      SchoolManagementSoftware/src/main/ipc/handlers.ts:1482, 1602
PROBLEM:       Cloud license activation and deactivation fail with HTTP 401 Unauthorized.
ROOT CAUSE:    In `handlers.ts`, `license:activate` and `license:deactivate` construct an HTTP request to the cloud backend and pass `Authorization: Bearer ${token}`. However, the `token` variable passed from the renderer is the local SQLite session token (`ses_...`), not the decrypted cloud JWT access token. The cloud backend rejects the local session token with HTTP 401.
EVIDENCE:      Code inspection of `handlers.ts:1482`. Cloud backend requires valid JWT signed by cloud secret.
ACTUAL:        Cloud activation fails with HTTP 401.
EXPECTED:      Handler retrieves decrypted cloud access token from `sync_device_config` via `CloudTokenManager` and passes it in the `Authorization` header.
FIX:           Retrieve decrypted cloud JWT before making cloud license request:
               `const cloudToken = CloudTokenManager.getAccessToken(db);`
```

```
DEFECT ID:     DEF-24 / DEFECT-01
SEVERITY:      P0 (Blocker)
AUDIT DOMAIN:  Domain 2 (IPC) & Domain 6 (Functional Modules)
MODULE:        Institutional Reports View
LOCATION:      SchoolManagementSoftware/src/renderer/views/ReportsView.tsx:142
PROBLEM:       Institutional Reports tab crashes immediately with TypeError upon generating any report.
ROOT CAUSE:    `ReportsView.tsx:142` calls `window.desktopAPI.generateReport(sessionToken, repId, filters)`. However, `preload.ts:123` and `types.ts:397` expose `getReport: (token, reportType, params) => ipcRenderer.invoke('reports:generate', ...)`. The method `generateReport` does not exist on `window.desktopAPI`.
EVIDENCE:      Static code inspection and TypeScript compiler output:
               `error TS2551: Property 'generateReport' does not exist on type 'DesktopAPI'. Did you mean 'generateReportCard'?`
ACTUAL:        Uncaught `TypeError: window.desktopAPI.generateReport is not a function`.
EXPECTED:      Report dataset is generated and displayed.
FIX:           Change `window.desktopAPI.generateReport` to `window.desktopAPI.getReport` in `ReportsView.tsx:142`, and add `generateReport` as an alias in `preload.ts`.
```

```
DEFECT ID:     DEFECT-02
SEVERITY:      P0 (Blocker)
AUDIT DOMAIN:  Domain 2 (SQLite Integrity) & Domain 4 (Sync)
MODULE:        SQLite Schema Migrations
LOCATION:      SchoolManagementSoftware/src/main/database/migrations/012_receipt_blocks_and_payment_ledger.ts:45-63
PROBLEM:       Financial ledger columns are missing from SQLite payments and invoices tables.
ROOT CAUSE:    Migration 012 checks `tables.includes('fee_payments')` and `tables.includes('fee_invoices')`. However, the canonical tables created in Migration 001 are named `payments` and `invoices`. Both conditions evaluate to `false`, silently skipping table alterations. Columns `transaction_id`, `entry_type`, `original_payment_id`, `provisional_receipt_no`, `official_receipt_no`, `is_provisional`, `sync_status`, `overpaid`, and `overpaid_amount` were never added.
EVIDENCE:      Runtime test on `:memory:` SQLite: `PRAGMA table_info(payments)` confirmed columns are absent.
ACTUAL:        Payments table lacks transaction ID, entry type, and provisional receipt columns; unique index is absent.
EXPECTED:      Columns added to `payments` and `invoices` with unique index `idx_payments_transaction_id`.
FIX:           Update migration to target `payments` and `invoices`:
               `const paymentTable = tables.includes('payments') ? 'payments' : 'fee_payments';`
```

```
DEFECT ID:     DEFECT-03
SEVERITY:      P0 (Blocker)
AUDIT DOMAIN:  Domain 2 (SQLite Integrity) & Domain 6 (Functional Modules)
MODULE:        Installation & Provisioning Repository
LOCATION:      SchoolManagementSoftware/src/main/database/repositories/installation.repository.ts:48-63
PROBLEM:       `purgeDemoData()` fails to delete demo data during production installation.
ROOT CAUSE:    `purgeDemoData()` contains wrong table names (`fee_payments`, `fee_invoices`, `expense_vouchers`, `staff`, etc.) and omits real tables (`payments`, `invoices`, `employees`, `expenses`). Because `payments` and `invoices` are not deleted, foreign key anti-cascade triggers (`trg_protect_student_deletion_with_payments`) block `DELETE FROM students`. The exception is swallowed in a catch block, leaving all demo data intact.
EVIDENCE:      Runtime test via `test-purge-all.js`: After calling `purgeDemoData()`, queries confirmed 4 students, 4 invoices, 2 payments, 4 employees, and 4 marks remained in the database.
ACTUAL:        Zero demo rows are purged from core operational tables.
EXPECTED:      All demo data is completely purged in reverse foreign key order.
FIX:           Rewrite table array in `purgeDemoData()` using actual table names in reverse dependency order:
               `['payments', 'invoices', 'fee_concessions', 'student_marks', 'exam_papers', 'exams', 'student_enrollments', 'student_guardians', 'attendance', 'students', 'timetable_entries', 'expenses', 'staff_attendance', 'staff_salaries', 'employees', 'classes', 'sections', 'academic_sessions', 'sync_outbox', 'audit_logs']`.
```

---

### Priority P1: Critical & High Defects

```
DEFECT ID:     DEF-PKG-002
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 8 (Packaging & Release)
MODULE:        Electron Builder Configuration
LOCATION:      SchoolManagementSoftware/package.json:62-75
PROBLEM:       Embedded test databases, DPAPI key files, and migration snapshots are packaged into `app.asar`.
ROOT CAUSE:    `package.json` specifies `"files": ["dist/**/*"]`. The build directory contained test artifacts: `dist/data/school_local.db` (593 KB), `dist/data/.vault/dek.dpapi` (782 bytes), and `dist/data/backups/pre_migration/*.sqlite` (802 KB). These were packaged into `app.asar`, leaking sensitive test databases and adding 1.4 MB of bloat.
EVIDENCE:      Inspected ASAR archive file tree; verified presence of `dist/data/school_local.db` and `.vault/dek.dpapi`.
ACTUAL:        Production installer bundles local database and DPAPI key blobs.
EXPECTED:      `files` filter excludes `dist/data/**/*`, `**/*.sqlite`, `**/*.db`, and `**/.vault`.
FIX:           Add exclusion rules in `package.json` under `build.files`:
               `"!dist/data/**/*", "!dist/**/*.sqlite", "!dist/**/*.db", "!dist/**/.vault/**/*"`.
```

```
DEFECT ID:     DEF-PKG-003
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 8 (Packaging & Release)
MODULE:        Main Window Security Lifecycle
LOCATION:      SchoolManagementSoftware/src/main/main.ts:80-140
PROBLEM:       Main window webContents lacks navigation and new-window security guards.
ROOT CAUSE:    `mainWindow.webContents` does not attach `will-navigate` or `setWindowOpenHandler` listeners. If an XSS vulnerability occurs or a malformed link is clicked, Electron could navigate to arbitrary remote URLs or open un-sandboxed windows.
EVIDENCE:      Code review of `src/main/main.ts`.
ACTUAL:        No navigation or window-open event handlers configured.
EXPECTED:      `mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))` and `will-navigate` blocks all non-app navigation.
FIX:           Add `mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))` and prevent navigation to external origins in `will-navigate`.
```

```
DEFECT ID:     AUTH-DEFECT-02
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 3 (Cloud API & Authentication)
MODULE:        Desktop Authentication Service
LOCATION:      SchoolManagementSoftware/src/main/services/auth.service.ts:130-145
PROBLEM:       Changing user password permanently breaks cloud synchronization.
ROOT CAUSE:    When `AuthService.changePassword` calls the cloud backend API, the backend updates the password, invalidates previous tokens, and returns a new `TokenPair`. However, the desktop client discards the response body and does not update `sync_device_config`. The old invalid token remains stored, causing all subsequent background sync requests to fail with HTTP 401.
EVIDENCE:      Code inspection of `auth.service.ts:138`:
               `await this.apiClient.changePassword(userId, currentPassword, newPassword, authToken);` (Return value ignored).
ACTUAL:        Cloud sync breaks permanently after password change until user manually logs out and logs in again.
EXPECTED:      `changePassword` captures the returned `TokenPair` and saves it via `CloudTokenManager.saveTokens(db, tokens)`.
FIX:           Capture response from `apiClient.changePassword` and call `CloudTokenManager.saveTokens(db, response.tokens)`.
```

```
DEFECT ID:     DEF-SYNC-02
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 4 (Offline-First & Synchronization)
MODULE:        Write Coordinator
LOCATION:      SchoolManagementSoftware/src/main/sync/write-coordinator.ts:104
PROBLEM:       Arbitrary entity mutations are permitted to execute provisional local writes when offline.
ROOT CAUSE:    `write-coordinator.ts:104` contains:
               `if (isProvisionalAllowed || options.isOnline === false)`
               This allows *any* entity type (students, classes, fee structures, exams) to perform provisional local writes if `isOnline === false`. This violates the documented architectural invariant that provisional local writes are restricted exclusively to `ATTENDANCE` and `PAYMENT`.
EVIDENCE:      Code inspection of `write-coordinator.ts:104`.
ACTUAL:        Offline mode allows unconstrained provisional writes across all entity types.
EXPECTED:      Provisional local writes must strictly require `isProvisionalAllowed === true` (`ATTENDANCE` or `PAYMENT`).
FIX:           Change condition to: `if (isProvisionalAllowed) { localResult = options.executeLocal(false); }`.
```

```
DEFECT ID:     DEF-SYNC-03
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 4 (Offline-First & Synchronization)
MODULE:        Write Coordinator Conflict Handling
LOCATION:      SchoolManagementSoftware/src/main/sync/write-coordinator.ts:217, 235
PROBLEM:       Outbox conflict state is corrupted and immediately overwritten by catch block.
ROOT CAUSE:    When the cloud backend returns `status === 'conflict'`, line 217 sets `state = 'conflict'`. It then throws `new Error('Conflict detected...')`. However, the surrounding `try/catch` block catches this error at line 228 and, because the error message matches `/conflict/i`, overwrites the row with `state = 'needs_attention'`, destroying the `conflict` state in the 6-state machine.
EVIDENCE:      Code review of `write-coordinator.ts:217-242`.
ACTUAL:        Conflicted outbox records are stored as `needs_attention`, bypassing conflict resolution UI workflows.
EXPECTED:      Conflicted mutations retain `state = 'conflict'` and record server version details.
FIX:           Do not throw an error from the `status === 'conflict'` block; return `{ syncStatus: 'conflict' }` directly, or rethrow a specific `ConflictError` that the catch block does not overwrite.
```

```
DEFECT ID:     DEF-SYNC-04
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 4 (Offline-First & Synchronization)
MODULE:        Fees IPC Handlers
LOCATION:      SchoolManagementSoftware/src/main/ipc/handlers.ts:1880-1920
PROBLEM:       `fees:collect-offline-safe` does not persist payments to local SQLite or update invoice balances.
ROOT CAUSE:    In `handlers.ts`, the handler for `fees:collect-offline-safe` obtains an offline receipt number from `ReceiptBlockManager` and calls `writeCoordinator.dispatchMutation(...)`. However, its `executeLocal` callback only logs the mutation without executing `INSERT INTO payments` or `UPDATE invoices SET paid_amount = paid_amount + ?`.
EVIDENCE:      Code inspection of handler `fees:collect-offline-safe`. Tested offline payment: receipt generated, outbox queued, but `payments` table row count unchanged.
ACTUAL:        Offline payments do not appear in student ledgers or cash reports until after cloud sync.
EXPECTED:      Offline payment is inserted into SQLite `payments` immediately and invoice balance updated transactionally.
FIX:           Implement full local database insertion inside `executeLocal` within the `fees:collect-offline-safe` handler.
```

```
DEFECT ID:     DEF-SYNC-05 / CONTRACT-DEFECT-03
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 3 (API Contracts) & Domain 4 (Sync)
MODULE:        Receipt Block Manager & Online Sync Dispatcher
LOCATION:      SchoolManagementSoftware/src/main/sync/online-sync-dispatcher.ts, receipt-block-manager.ts
PROBLEM:       Offline provisional receipts are reconciled on backend, but official receipt numbers are never written back to desktop SQLite.
ROOT CAUSE:    Desktop client lacks implementation to invoke cloud endpoint `POST /api/v1/sync/receipt-blocks/allocate`. When the backend sync service reconciles provisional receipts (`PROV-...`), it assigns official numbers, but the desktop `SyncEngine` does not have a handler to receive and update `payments.official_receipt_no`.
EVIDENCE:      Static analysis of `receipt-block-manager.ts` and `sync-engine.ts`.
ACTUAL:        Desktop retains provisional receipt numbers indefinitely; official receipt numbers remain null.
EXPECTED:      Desktop polls receipt reconciliations and updates `payments.official_receipt_no` and `payments.is_provisional = 0`.
FIX:           Add receipt block allocation client and sync reconciliation listener in `SyncEngine`.
```

```
DEFECT ID:     DEF-SYNC-06
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 4 (Offline-First & Synchronization)
MODULE:        Cloud Backend Sync Service
LOCATION:      school-os-backend/src/modules/sync/sync.service.ts:335
PROBLEM:       Domain authorization rejection (403) causes unhandled 500 server error on cloud push.
ROOT CAUSE:    In `pushBatch()`, domain event processing wraps individual calls in `try/catch`. However, authorization errors (`ForbiddenError` / 403) are not handled as individual event rejections; instead, they bubble up to the Express error handler, failing the entire batch with HTTP 500.
EVIDENCE:      Code inspection of `sync.service.ts:335`.
ACTUAL:        A single unauthorized event crashes the entire batch with 500 Internal Server Error.
EXPECTED:      Unauthorized events return `status: 'rejected', errorMessage: 'Forbidden'` for that event, allowing valid events in the batch to commit.
FIX:           Catch `ForbiddenError` within the event loop in `pushBatch()` and record `status: 'rejected'`.
```

```
DEFECT ID:     DEFECT-TEN-01
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 5 (Security) & Domain 4 (Sync)
MODULE:        Cloud Backend Fee Service
LOCATION:      school-os-backend/src/modules/fees/fees.service.ts:240-275
PROBLEM:       Central backend fee reversal mutates payments in-place, violating financial ledger immutability.
ROOT CAUSE:    In `fees.service.ts:executeReversal()`, the backend updates `payments` in-place (`is_reversed = true, reversal_reason = ...`) and updates invoice balances directly, without inserting a linked reversal contra-entry or recording an event in `SyncChangeLog`.
EVIDENCE:      Code inspection of `executeReversal()` in `school-os-backend`.
ACTUAL:        Payment rows are mutated in-place; reversals are not broadcast to desktop sync feeds.
EXPECTED:      Financial reversals must insert an immutable negative contra-entry and append to `SyncChangeLog`.
FIX:           Refactor `executeReversal()` to create a negative adjustment payment row and log a `PAYMENT_REVERSAL` change event.
```

```
DEFECT ID:     DEFECT-LIC-03
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 5 (Security, Licensing & Tenant Isolation)
MODULE:        Permission Snapshot Service
LOCATION:      SchoolManagementSoftware/src/main/security/permission-snapshot.service.ts:60-80
PROBLEM:       `PermissionSnapshotService.assertWriteAllowed()` is disconnected from mutation execution paths.
ROOT CAUSE:    The permission snapshot sliding expiration check (`assertWriteAllowed()`) is implemented in `PermissionSnapshotService`, but is never invoked by `WriteCoordinator.dispatchMutation` or `handlers.ts`. If an offline user's snapshot expires (>72 hours offline), mutations continue to be queued and executed locally.
EVIDENCE:      Static search for `assertWriteAllowed()` across `src/main/`: found zero callers in handlers or write coordinator.
ACTUAL:        Expired permission snapshots do not block offline writes.
EXPECTED:      `WriteCoordinator.dispatchMutation` calls `permissionSnapshotService.assertWriteAllowed(session.userId)` before queueing writes.
FIX:           Integrate `assertWriteAllowed()` into `WriteCoordinator.dispatchMutation`.
```

```
DEFECT ID:     DEFECT-LIC-04
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 5 (Security, Licensing & Tenant Isolation)
MODULE:        Sync Engine Background Polling
LOCATION:      SchoolManagementSoftware/src/main/sync/sync-engine.ts:90-120
PROBLEM:       Sync engine continues polling and pushing to cloud backend when subscription is expired.
ROOT CAUSE:    `SyncEngine.pollAndSync()` checks network connectivity and token presence, but never checks `LicenseService.canSync()` or license state. An expired or suspended workstation continues hammering the cloud sync endpoint.
EVIDENCE:      Code inspection of `sync-engine.ts:90`.
ACTUAL:        Sync requests continue firing when license is expired.
EXPECTED:      `SyncEngine` checks license status and suspends background polling when expired or revoked.
FIX:           Add `if (!licenseService.canSync()) return;` at the beginning of `SyncEngine.pollAndSync()`.
```

```
DEFECT ID:     DEF-13 / DEF-19
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 6 (Functional Modules)
MODULE:        Timetable & Examination Services
LOCATION:      SchoolManagementSoftware/src/main/services/timetable.service.ts:32, exam.service.ts:45
PROBLEM:       Teachers viewing timetables or entering exam marks receive HTTP 403 Forbidden errors.
ROOT CAUSE:    Both services enforce RBAC permissions using `academics:read` and `academics:write`. However, the RBAC role definitions in `rbac.service.ts` assign teachers `timetable:view`, `timetable:manage`, `exams:view`, and `exams:manage`. Teachers lack the institutional `academics:*` permission, resulting in rejection.
EVIDENCE:      Code inspection of `timetable.service.ts:32` and `exam.service.ts:45`. Tested teacher role session: caught `InsufficientPermissionsError: Required academics:read`.
ACTUAL:        Teachers cannot view assigned schedules or record examination marks.
EXPECTED:      `timetable.service.ts` checks `timetable:*`; `exam.service.ts` checks `exams:*`.
FIX:           Update permission checks in `timetable.service.ts` to `timetable:read` / `timetable:write`, and in `exam.service.ts` to `exams:read` / `exams:write`.
```

```
DEFECT ID:     DEF-15
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 6 (Functional Modules)
MODULE:        Attendance Management View
LOCATION:      SchoolManagementSoftware/src/renderer/views/AttendanceView.tsx:85-110
PROBLEM:       Attendance view never fetches historical attendance, resetting rosters to 'present' and silently overwriting absences on save.
ROOT CAUSE:    When a user selects a date and section in `AttendanceView.tsx`, the view fetches the student enrollment list and initializes all statuses to `'present'`. It never invokes `desktopAPI.getAttendanceForDate()`. If attendance was already recorded with 5 absent students, opening the register defaults them all to 'present'; clicking "Save" overwrites the records.
EVIDENCE:      Code inspection of `AttendanceView.tsx:85-110`. Tested UI workflow: existing absent marks reverted to present upon view reload.
ACTUAL:        Previous attendance records are silently overwritten with 'present'.
EXPECTED:      View fetches existing attendance records for `(date, sectionId)` and populates the status toggles accordingly.
FIX:           Add call to `window.desktopAPI.getAttendance(sessionToken, { sectionId, date })` in `AttendanceView.tsx` `useEffect` and merge into student roster state.
```

```
DEFECT ID:     DEF-09
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 6 (Functional Modules)
MODULE:        Staff & HR / Payroll Management
LOCATION:      SchoolManagementSoftware/src/renderer/views/StaffView.tsx, PayrollView.tsx
PROBLEM:       Missing UI to configure employee salary structures; payroll slips cannot be generated.
ROOT CAUSE:    The database and services support `staff_salaries` (`basic_salary`, `allowances_json`, `deductions_json`), but no UI form exists in `StaffView.tsx` to view or edit an employee's salary structure. When an administrator navigates to `PayrollView.tsx` and clicks "Generate Payroll", the operation skips all employees because `salary_structure` is missing.
EVIDENCE:      UI inspection and code audit of `StaffView.tsx` and `PayrollView.tsx`.
ACTUAL:        Payroll generation generates 0 slips unless records are inserted directly via SQL.
EXPECTED:      Staff profile includes a "Salary & Compensation" tab allowing configuration of basic pay, allowances, and tax deductions.
FIX:           Add Salary Configuration modal/tab to `StaffView.tsx` wiring to `desktopAPI.updateStaffSalary()`.
```

```
DEFECT ID:     DEF-11
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 6 (Functional Modules)
MODULE:        Academics Module
LOCATION:      SchoolManagementSoftware/src/renderer/views/AcademicsView.tsx
PROBLEM:       Missing Subject Master CRUD interface in Academics view.
ROOT CAUSE:    `AcademicsView.tsx` provides interfaces for Classes and Academic Sessions, but completely omits Subject management (`subjects` table). When creating exam papers or timetable entries, subjects must be entered as free text, causing spelling inconsistencies (e.g. "Math", "Mathematics", "Maths") and breaking exam aggregations.
EVIDENCE:      Inspection of `AcademicsView.tsx`.
ACTUAL:        No interface exists to define standard institutional subjects.
EXPECTED:      Academics view provides a "Subjects" tab with CRUD operations (Subject Name, Code, Type: Theory/Practical).
FIX:           Add Subjects management tab and wire to `desktopAPI.getSubjects()`, `createSubject()`, `deleteSubject()`.
```

```
DEFECT ID:     DEFECT-04
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 2 (SQLite Integrity) & Domain 4 (Sync)
MODULE:        Sync Change Tracker
LOCATION:      SchoolManagementSoftware/src/main/sync/change-tracker.ts:264, 315-332
PROBLEM:       Sync outbox fallback queries crash on non-existent column `retry_count`.
ROOT CAUSE:    In `change-tracker.ts`, error fallback paths execute:
               `SELECT retry_count as retryCount FROM sync_outbox`
               and `UPDATE sync_outbox SET retry_count = retry_count + 1`.
               Migration 011 rebuilt `sync_outbox` with column `attempt_count`, not `retry_count`. Additionally, `markEntryConflict` sets `status = 'failed'` instead of setting `state = 'conflict'`.
EVIDENCE:      Static analysis and SQLite schema dump confirm column `retry_count` does not exist.
ACTUAL:        Error handling fallback crashes with `SqliteError: no such column: retry_count`.
EXPECTED:      Queries use `attempt_count` and maintain valid outbox states.
FIX:           Replace `retry_count` with `attempt_count` in `change-tracker.ts:264, 317`. Update `markEntryConflict` to set `state = 'conflict'`.
```

```
DEFECT ID:     DEFECT-05
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 2 (IPC) & Domain 4 (Sync)
MODULE:        Main IPC Mutation Handlers
LOCATION:      SchoolManagementSoftware/src/main/ipc/handlers.ts:447, 693, 767, 792, 842, 904, 993, 1107, 1234
PROBLEM:       Offline non-provisional mutations crash with TypeError when accessing `dispatchRes.result.*`.
ROOT CAUSE:    For non-provisional entities (students, exams, marks, timetable, expenses, settings), `WriteCoordinator.dispatchMutation` queues the outbox row but defers local execution until server ACK when offline. Consequently, `dispatchRes.result` is `undefined`. Handlers directly access properties like `dispatchRes.result.promotedCount` or `dispatchRes.result.success`, triggering an uncaught `TypeError`.
EVIDENCE:      Code inspection of `handlers.ts` across 9 handlers.
ACTUAL:        Handler crashes and notifies user of failure, even though the outbox mutation was durably saved.
EXPECTED:      Handler uses optional chaining (`dispatchRes.result?.success ?? true`) and returns `{ success: true, syncStatus: 'pending' }`.
FIX:           Add optional chaining and default values across all 9 mutation handler result accesses in `handlers.ts`.
```

```
DEFECT ID:     DEFECT-06
SEVERITY:      P1 (High)
AUDIT DOMAIN:  Domain 2 (IPC) & Domain 5 (Security)
MODULE:        Notice & Online Proxy IPC Handlers
LOCATION:      SchoolManagementSoftware/src/main/ipc/handlers.ts:1960-1967, 2015-2032
PROBLEM:       Missing RBAC authorization, license write check, and schema validation on `notices:create` and `online:request`.
ROOT CAUSE:    1. `notices:create` accepts raw input without Zod validation and allows any authenticated user (e.g. students or cashiers) to broadcast school notices. It also bypasses subscription read-only mode (`assertCanWrite` missing).
               2. `online:request` allows the renderer to dispatch arbitrary HTTP methods (`GET`, `POST`, `DELETE`) with arbitrary payloads to arbitrary cloud backend paths without path allowlisting or permission verification.
EVIDENCE:      Code inspection of `handlers.ts:1960-2032`.
ACTUAL:        Low-privileged users can broadcast notices and invoke arbitrary cloud backend endpoints.
EXPECTED:      Strict Zod validation, `notices:manage` permission requirement, write licensing check, and path whitelist in online proxy.
FIX:           Add `CreateNoticeSchema` validation, `RbacService.assertPermission(session, 'notices:manage')`, and restrict `onlineProxy` paths.
```

---

### Priority P2: Medium Severity Defects

```
DEFECT ID:     DEF-07 / DEFECT-07
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 2 (IPC & Types)
MODULE:        Exam Repository & Report Service
LOCATION:      SchoolManagementSoftware/src/main/database/repositories/exam.repository.ts:350-370, report.service.ts:291
PROBLEM:       TypeScript strict compilation fails with TS2339 on `rank` property.
ROOT CAUSE:    `calculated.map(...)` in `exam.repository.ts` does not declare `rank` in the returned object literal, but line 369 mutates `(c as any).rank = index + 1;`. TypeScript infers an anonymous type without `rank`, causing `report.service.ts:291` to fail compilation under strict mode.
EVIDENCE:      `tsc` output: `error TS2339: Property 'rank' does not exist on type...`
FIX:           Declare `rank: 0` in the object literal returned by `calculated.map(...)`.
```

```
DEFECT ID:     DEF-08 / DEFECT-08
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 2 (IPC & Types) & Domain 7 (UI Quality)
MODULE:        Renderer App Header Layout
LOCATION:      SchoolManagementSoftware/src/renderer/components/AppHeader.tsx:216
PROBLEM:       Top navigation sync badge permanently displays "Initial sync" during synchronization.
ROOT CAUSE:    Typo: `AppHeader.tsx:216` checks `syncStatus?.lastSyncAt`, whereas the `SyncStatus` interface defines `lastSyncedAt`. The condition `!syncStatus?.lastSyncAt` is permanently true.
EVIDENCE:      `tsc` output: `error TS2551: Property 'lastSyncAt' does not exist on type 'SyncStatus'. Did you mean 'lastSyncedAt'?`
FIX:           Change `lastSyncAt` to `lastSyncedAt` in `AppHeader.tsx:216`.
```

```
DEFECT ID:     DEF-10 / DEFECT-10
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 2 (IPC) & Domain 6 (Functional Modules)
MODULE:        Fee Management Summary
LOCATION:      SchoolManagementSoftware/src/renderer/views/FeesView.tsx:165, preload.ts:59, handlers.ts:620
PROBLEM:       Month filter dropdown in Fees view does not filter summary metrics cards.
ROOT CAUSE:    `FeesView.tsx:165` calls `desktopAPI.getFeeSummary(sessionToken, selectedMonth)`. However, `preload.ts` and `handlers.ts` omit the second argument, dropping `selectedMonth`. `FeeService.getFeeSummary` always calculates all-time totals.
EVIDENCE:      `tsc` output: `error TS2554: Expected 1 arguments, but got 2.`
FIX:           Update `preload.ts`, `handlers.ts`, and `fee.service.ts` to accept optional `month?: string` and filter metrics.
```

```
DEFECT ID:     DEF-09 / DEFECT-09
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 2 (IPC) & Domain 6 (Functional Modules)
MODULE:        Timetable Teacher Dropdown
LOCATION:      SchoolManagementSoftware/src/renderer/views/TimetableView.tsx:65, employee.repository.ts:50
PROBLEM:       Timetable period assignment dropdown includes non-teaching staff (janitors, drivers, accountants).
ROOT CAUSE:    `TimetableView.tsx` passes `{ isTeaching: true }` to `getStaff()`, but `DesktopAPI.getStaff` in `types.ts` omits the parameter and `employee.repository.ts` ignores it in its query builder.
EVIDENCE:      `tsc` output: `error TS2353: Object literal may only specify known properties...`
FIX:           Add `isTeaching?: boolean` to query type and add `AND is_teaching = ?` to `employee.repository.ts`.
```

```
DEFECT ID:     DEF-11 / DEFECT-11
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 2 (IPC)
MODULE:        IPC Handler Error Handling
LOCATION:      SchoolManagementSoftware/src/main/ipc/handlers.ts:1471, 1596, 1632, 1639, 1650, 1657, 1879, 1915
PROBLEM:       13 mutation handlers return raw promise rejections instead of typed `{ success: false, error }`.
ROOT CAUSE:    Inconsistent exception handling in `handlers.ts`. Handlers omit `try/catch` blocks, allowing service exceptions to bubble across IPC as raw rejections.
EVIDENCE:      Static analysis via `audit-error-handling.js`.
FIX:           Wrap handlers in `try/catch` returning `{ success: false, error: err.message }`.
```

```
DEFECT ID:     AUTH-DEFECT-03 / CONTRACT-DEFECT-02
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 3 (Cloud API & Contracts)
MODULE:        Offline Mirror Cache Endpoints
LOCATION:      school-os-backend/src/modules/sync/sync.controller.ts:140-180
PROBLEM:       Offline mirror endpoints return bare JSON arrays instead of standard envelope.
ROOT CAUSE:    Endpoints `/sync/mirror/classes` and `/sync/mirror/students` return `res.json(records)` instead of `res.json({ success: true, data: records })`.
EVIDENCE:      Contract testing against backend routes.
FIX:           Wrap response in standard envelope `{ success: true, data: records }`.
```

```
DEFECT ID:     CONFIG-DEFECT-04 / 09
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 3 (Cloud API & Configuration)
MODULE:        Desktop Deployment Default Port
LOCATION:      SchoolManagementSoftware/src/main/database/migrations/009_performance_optimization_and_update_state.ts:24, 36
PROBLEM:       Update endpoint defaults to port 5000 while backend runs on port 4000.
ROOT CAUSE:    Migration 009 seeds `update_endpoint` with `http://localhost:5000/api/v1/updates/desktop`, conflicting with backend port 4000.
EVIDENCE:      Source code inspection of migration 009.
FIX:           Change default port in migration 009 to 4000 or derive dynamically from `endpoints.ts`.
```

```
DEFECT ID:     AUTH-DEFECT-06
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 3 (Cloud API & Authentication)
MODULE:        Desktop Cloud Token Manager
LOCATION:      SchoolManagementSoftware/src/main/sync/cloud-token-manager.ts:50-85
PROBLEM:       Parallel 401 errors can trigger race condition in token refresh mutex.
ROOT CAUSE:    `CloudTokenManager.refreshAccessToken()` uses a boolean lock `isRefreshing`. Rapid concurrent 401s may enter before the lock takes effect, firing duplicate refresh requests.
EVIDENCE:      Code review of `cloud-token-manager.ts`.
FIX:           Use a shared Promise queue for active refresh operations.
```

```
DEFECT ID:     DEF-SYNC-07
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 4 (Offline-First & Synchronization)
MODULE:        Cloud Backend Change Feed
LOCATION:      school-os-backend/src/modules/sync/sync.service.ts:180-210
PROBLEM:       Server change feed cursor can skip sequence numbers under high concurrency.
ROOT CAUSE:    Sequence numbers are allocated via `school_sequences` before document commits. If transaction A (seq 10) commits after transaction B (seq 11), a pull requesting `sinceSeq=10` during the window may miss seq 10.
EVIDENCE:      Replica set concurrency stress test analysis.
FIX:           Record commit timestamp or enforce read-committed sequence barriers.
```

```
DEFECT ID:     DEF-SYNC-08
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 4 (Offline-First & Synchronization)
MODULE:        Desktop Sync Engine
LOCATION:      SchoolManagementSoftware/src/main/sync/sync-engine.ts:140-160
PROBLEM:       Missing exponential backoff cap on outbox retry attempts.
ROOT CAUSE:    Retrying outbox rows increments `attempt_count` with linear 5-second backoff, causing excessive disk writes during prolonged offline disconnects.
EVIDENCE:      Code inspection of `write-coordinator.ts:250`.
FIX:           Implement capped exponential backoff: `Math.min(300, 5 * Math.pow(2, attemptCount))`.
```

```
DEFECT ID:     DEFECT-SEC-02
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 5 (Security)
MODULE:        Monotonic Clock Checkpoint
LOCATION:      SchoolManagementSoftware/src/main/security/subscription-clock.ts:75-95
PROBLEM:       Clock checkpoint falls back to wall-clock time on cold boot.
ROOT CAUSE:    On fresh application startup before `process.hrtime.bigint()` establishes a baseline, the clock service reads `new Date().toISOString()`. If the system clock was tampered while the computer was powered off, the tampering is undetected until the next shutdown.
EVIDENCE:      Code inspection of `subscription-clock.ts`.
FIX:           Validate local checkpoint against signed cloud sync timestamp on first connection.
```

```
DEFECT ID:     DEFECT-LIC-05
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 5 (Security & Licensing)
MODULE:        License Activation Service
LOCATION:      SchoolManagementSoftware/src/main/services/license.service.ts:110-135
PROBLEM:       License activation does not validate public key fingerprint before saving.
ROOT CAUSE:    `saveLicenseToken` writes the license token to `device_licenses` without pre-validating that the signing key ID matches the embedded vendor root authority.
EVIDENCE:      Code inspection of `license.service.ts:120`.
FIX:           Add key ID check against embedded trusted authorities before saving.
```

```
DEFECT ID:     DEF-02 (UI)
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 7 (UI Quality)
MODULE:        Fee Register & Student Ledger Views
LOCATION:      SchoolManagementSoftware/src/renderer/views/FeesView.tsx:310, StudentsView.tsx:280
PROBLEM:       Table horizontal scrolling at 1280x720 cuts off the rightmost action column.
ROOT CAUSE:    Data tables lack a visible scrollbar track or horizontal scroll indicator; users on small displays do not notice the "Actions" column is hidden.
EVIDENCE:      Visual inspection and screenshot `qa-evidence/audit_1280_1366/fees_1280x720.png`.
FIX:           Add `overflow-x-auto` wrapper with styled scrollbar and sticky action columns.
```

```
DEFECT ID:     DEF-03 (UI)
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 7 (UI Quality)
MODULE:        Student Admission Modal Dialog
LOCATION:      SchoolManagementSoftware/src/renderer/components/StudentAdmissionModal.tsx:45
PROBLEM:       Modal dialog exceeds viewport height on 1366x768 laptop displays.
ROOT CAUSE:    The modal contains >12 form fields without `max-h-[85vh]` and `overflow-y-auto`. Action buttons ("Submit", "Cancel") are pushed below the visible screen.
EVIDENCE:      Visual inspection and screenshot `qa-evidence/audit_1280_1366/students_modal_1366x768.png`.
FIX:           Add `max-h-[85vh] overflow-y-auto` to modal container body.
```

```
DEFECT ID:     DEF-04 (UI)
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 7 (UI Quality)
MODULE:        Design System Badge Tokens
LOCATION:      SchoolManagementSoftware/src/renderer/index.css:120-135
PROBLEM:       Muted status badges (`draft`, `pending`) fail WCAG AA contrast ratio.
ROOT CAUSE:    Text color `#94A3B8` on background `#F1F5F9` has a contrast ratio of 3.8:1 (minimum requirement is 4.5:1).
EVIDENCE:      Color contrast analyzer verification.
FIX:           Darken badge text token to `#64748B` (contrast ratio 5.1:1).
```

```
DEFECT ID:     DEF-05 (UI)
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 7 (UI Quality)
MODULE:        Institutional Reports View
LOCATION:      SchoolManagementSoftware/src/renderer/views/ReportsView.tsx:210
PROBLEM:       Missing loading skeleton / spinner during long report PDF generation.
ROOT CAUSE:    Large PDF reports (>500 students) take 2-3 seconds to render. The UI provides no visual spinner or progress indicator; clicking "Export PDF" appears unresponsive.
EVIDENCE:      Visual inspection of report generation flow.
FIX:           Display loading spinner and disable export button while report generation promise is pending.
```

```
DEFECT ID:     DEF-06 (UI)
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 7 (UI Quality)
MODULE:        Attendance Matrix Layout
LOCATION:      SchoolManagementSoftware/src/renderer/views/AttendanceView.tsx:180
PROBLEM:       Attendance table headers scroll out of view on large class rosters (>40 students).
ROOT CAUSE:    Table container does not specify `sticky top-0 bg-white` on table header elements.
EVIDENCE:      Visual inspection with 50 seeded students.
FIX:           Apply `sticky top-0 z-10 bg-slate-50` to `<thead>` elements.
```

```
DEFECT ID:     DEF-PKG-004
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 8 (Packaging & Release)
MODULE:        Windows Executable Metadata
LOCATION:      SchoolManagementSoftware/package.json:70-90
PROBLEM:       Packaged Windows `.exe` lacks version and company resource metadata.
ROOT CAUSE:    `package.json` `build.win` configuration omits `fileVersion`, `productVersion`, `companyName`, and `legalTrademarks`.
EVIDENCE:      Properties inspection on `School Management Software.exe`.
FIX:           Add `win: { fileVersion: "1.0.0", legalTrademarks: "TeachAssist", ... }` to `package.json`.
```

```
DEFECT ID:     DEF-PKG-005
SEVERITY:      P2 (Medium)
AUDIT DOMAIN:  Domain 8 (Packaging & Release)
MODULE:        NSIS Windows Installer
LOCATION:      SchoolManagementSoftware/package.json:85-95
PROBLEM:       Installer does not prompt to close running application before upgrading.
ROOT CAUSE:    NSIS configuration lacks `deleteAppDataOnUninstall: false` and `runAfterFinish: true` process lock enforcement.
EVIDENCE:      NSIS script inspection.
FIX:           Configure NSIS `processLock: true` in `package.json`.
```

---

### Priority P3: Low Severity & Hygiene Defects

```
DEFECT ID:     DEFECT-12
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 2 (Build Hygiene)
MODULE:        Online Sync Dispatcher Types
LOCATION:      SchoolManagementSoftware/src/main/sync/online-sync-dispatcher.ts:6
PROBLEM:       Type re-export triggers TS1205 when `isolatedModules` is enabled.
ROOT CAUSE:    `export { DispatchMutationOptions, DispatchMutationResult };` omits `type` keyword.
FIX:           Change to `export type { DispatchMutationOptions, DispatchMutationResult };`.
```

```
DEFECT ID:     DEFECT-13
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 2 (SQL Hygiene)
MODULE:        Deployment Config Service
LOCATION:      SchoolManagementSoftware/src/main/services/deployment-config.ts:270, 272, 290
PROBLEM:       `technician_lockout` update queries omit explicit `WHERE id = 1`.
ROOT CAUSE:    Relying on singleton table constraint without explicit `WHERE` clause.
FIX:           Add `WHERE id = 1` to lines 270, 272, 290.
```

```
DEFECT ID:     DEF-PKG-006
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 8 (Packaging Hygiene)
MODULE:        ASAR Archive Integrity
LOCATION:      SchoolManagementSoftware/package.json:65
PROBLEM:       Missing ASAR integrity hash verification in packaging config.
ROOT CAUSE:    `build.asar` does not specify `validateIntegrity: true`.
FIX:           Add `"asar": true` with integrity verification options.
```

```
DEFECT ID:     DEF-PKG-007
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 8 (Packaging Hygiene)
MODULE:        Repository Hygiene
LOCATION:      SchoolManagementSoftware/scripts/
PROBLEM:       Development and test runner scripts lack `.gitattributes` and `.npmignore` exclusions.
FIX:           Add scripts exclusions to `.npmignore`.
```

```
DEFECT ID:     DEF-07 (UI)
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 7 (UI Quality)
MODULE:        Tooltip Animation Delay
LOCATION:      SchoolManagementSoftware/src/renderer/components/DesktopTitleBar.tsx:30
PROBLEM:       Icon button tooltips have inconsistent hover delays (0ms vs 200ms).
FIX:           Standardize tooltip delay to 150ms across all components.
```

```
DEFECT ID:     DEF-08 (UI)
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 7 (UI Quality)
MODULE:        Settings UI Placeholder
LOCATION:      SchoolManagementSoftware/src/renderer/views/SettingsView.tsx:185
PROBLEM:       "Dark Mode" switch in Settings is a non-functional placeholder.
FIX:           Remove placeholder switch or implement Tailwind dark theme toggle.
```

```
DEFECT ID:     DEF-18
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 6 (Functional Modules)
MODULE:        Expense Voucher Attachment
LOCATION:      SchoolManagementSoftware/src/renderer/views/ExpenseView.tsx:140
PROBLEM:       "Attach Receipt Image" button in Expense voucher modal is non-functional placeholder.
FIX:           Wire file picker to local file attachment repository or remove placeholder.
```

```
DEFECT ID:     DEF-21
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 6 (Functional Modules)
MODULE:        Notice Board View
LOCATION:      SchoolManagementSoftware/src/renderer/views/NoticeView.tsx:90
PROBLEM:       Audience role filter chips lack badge counts.
FIX:           Compute and display active notice count per role.
```

```
DEFECT ID:     DEF-26
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 6 (Functional Modules)
MODULE:        Dashboard View
LOCATION:      SchoolManagementSoftware/src/renderer/views/DashboardView.tsx:45
PROBLEM:       Quick refresh button lacks spinning icon animation during data reload.
FIX:           Add `animate-spin` CSS class while fetching metrics.
```

```
DEFECT ID:     AUTH-DEFECT-08
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 3 (Cloud API Hygiene)
MODULE:        Backend Cookie Path
LOCATION:      school-os-backend/src/modules/auth/auth.controller.ts:85
PROBLEM:       Refresh token cookie path is `/` instead of `/api/v1/auth/refresh`.
FIX:           Restrict cookie path to `/api/v1/auth/refresh`.
```

```
DEFECT ID:     DEF-SYNC-11
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 4 (Sync Hygiene)
MODULE:        Sync Center View
LOCATION:      SchoolManagementSoftware/src/renderer/views/SyncCenterView.tsx:145
PROBLEM:       Outbox payload JSON inspection does not pretty-print nested JSON strings.
FIX:           Format payload with `JSON.stringify(JSON.parse(str), null, 2)`.
```

```
DEFECT ID:     DEF-SYNC-12
SEVERITY:      P3 (Low)
AUDIT DOMAIN:  Domain 4 (Sync Hygiene)
MODULE:        Sync History Storage
LOCATION:      SchoolManagementSoftware/src/main/database/migrations/010_sync_history.ts:15
PROBLEM:       `sync_history` table lacks an automated pruning or log retention limit.
FIX:           Add periodic pruning trigger keeping the last 1,000 entries.
```

---

## G. Security, Cryptography & Licensing Findings

### 1. Cryptographic Integrity & Local Database Encryption
- **SQLCipher Whole-Database Encryption:** **PASS (VERIFIED).** In-memory and disk tests confirmed that `better-sqlite3-multiple-ciphers` uses SQLCipher 256-bit AES encryption. Opening the database without keys fails closed immediately. Raw disk inspection confirmed the absence of the plaintext `SQLite format 3` header.
- **Windows DPAPI Key Sealing:** **PASS (VERIFIED).** The Database Encryption Key (DEK) is sealed using Windows Data Protection API (`dpapi.protect`) and stored at `%APPDATA%\SchoolManagementSoftware\.vault\dek.dpapi`.
- **Workstation Device Fingerprint:** **PASS WITH CAVEAT.** Fingerprinting uses CPU ID, motherboard UUID, and primary MAC address. Fuzzy MAC matching allows for virtual NIC changes, but pre-built packaged binaries compiled before this fix fail closed (`DEF-PKG-001`).

### 2. Multi-Tenant Cloud Isolation
- **Tenant Scope Enforcement:** **PASS (VERIFIED).** 6,580 automated cross-tenant probes executed across 188 backend routes in `cross-tenant-probe.test.ts` yielded **zero cross-tenant data leaks**. Every MongoDB query model strictly enforces `schoolId` filter injection via global plugins.
- **Tenant Isolation Violation in PushBatch:** **FAIL (DEF-SYNC-01).** `pushBatch` in `sync.service.ts` omits the user context (`ctx`), which defaults `isAdminOrManager` to true and bypasses domain role restrictions.

### 3. Subscription & Licensing Invariants
- **License Expiry Policy (Decision 1):** **FAIL (DEFECT-LIC-01).** When a subscription expires, `assertCanRead()` throws `SUBSCRIPTION_EXPIRED`, completely locking users out of viewing, searching, or exporting their data, violating Decision 1.
- **Hardcoded Signature Bypass:** **FAIL (DEFECT-LIC-02).** Hardcoded string `'cloud_auth_verified'` bypasses Ed25519 signature checks.
- **Monotonic Clock Integrity:** **PASS (VERIFIED).** Runtime elapsed time is tracked via `process.hrtime.bigint()`. Shutdown timestamps are saved in `subscription_checkpoints`. Clock rollbacks > 60 seconds immediately trip `CLOCK_TAMPERED` and lock the DEK.
- **Backup Key Manager Mutability:** **FAIL (DEFECT-SEC-01).** `BackupService.verifyBackupFile()` calls `unlock()` on the global singleton key manager, resetting locks without authorization.

---

## H. Performance and Packaging Findings

### 1. Performance Profiling Metrics (Verified Baseline)

| Performance Benchmark | Measured Baseline | Target Threshold | Status |
|---|:---:|:---:|:---:|
| **DPAPI Key Unsealing** | 7.16 ms | < 50 ms | **PASS** |
| **SQLite Migrations & Durability Init** | 99.19 ms | < 250 ms | **PASS** |
| **Total Cold-Start Latency** | **106.35 ms** | < 500 ms | **PASS (EXCELLENT)** |
| **Local Scrypt Password Hash** | 61.60 ms | < 150 ms | **PASS** |
| **Indexed Student Query Latency (p50)** | **0.163 ms** | < 5.0 ms | **PASS (HIGH SPEED)** |
| **Cold Process Memory (RSS)** | **51.55 MB** | < 150 MB | **PASS (LIGHTWEIGHT)** |
| **Clean Database Shutdown & WAL Checkpoint** | 3.62 ms | < 50 ms | **PASS** |
| **Backend Concurrent Push (30 cashiers, 1,200 records)** | 579 ms (p50) | < 2,000 ms | **PASS** |

### 2. Packaging Analysis & ASAR Inspection
- **Package Bloat & Leakage (`DEF-PKG-002`):** `app.asar` contains `dist/data/school_local.db` (593 KB), `dist/data/.vault/dek.dpapi` (782 bytes), and pre-migration snapshots (802 KB). These test files must be excluded via `package.json` `build.files`.
- **Binary Signature & Metadata:** The executable lacks Windows FileVersion and ProductVersion resource strings (`DEF-PKG-004`).
- **WebContents Security (`DEF-PKG-003`):** Missing `will-navigate` and `setWindowOpenHandler` security restrictions in `src/main/main.ts`.

---

## I. Unverified Areas and Limitations

1. **Physical Hardware Receipt Printing:** Real thermal ESC/POS receipt printers (e.g. Epson TM-T88, Xprinter 80mm) could not be physically tested; printing logic was verified via programmatic PDF receipt generation.
2. **Physical Multi-Workstation LAN/WAN Concurrency:** Concurrent cashier synchronization was verified via in-memory replica set transactions (1,200 records in 30 concurrent batches), but physical network latency (packet loss, 3G/4G Pakistani cell towers) was not physically simulated.
3. **Automated Auto-Update Cloud Verification:** `UpdateService` channel switching and differential update application could not be verified against the live cloud update server, as the server update repository is offline.
4. **Multi-Year Clock Drift:** Clock rollback detection (>60s) was verified via test simulations; long-term multi-year RTC battery failure behavior remains untested.

---

## J. Recommended Fix Order & Remediation Roadmap

To bring the application to production-ready status, remediation must proceed in strict priority phases:

### Phase 1: Critical Blockers (P0) — Immediate Fix Required
1. **Rebuild Packaged Distribution:** Run `npm run dist` in `SchoolManagementSoftware` to produce a fresh executable containing the fuzzy MAC address matching fix (`DEF-PKG-001`).
2. **Fix Cloud Push Authorization:** Update `pushBatch` in `school-os-backend/src/modules/sync/sync.service.ts:325` to pass `ctx` into `processDomainEvent` (`DEF-SYNC-01`).
3. **Fix Reports View IPC Call:** Change `window.desktopAPI.generateReport` to `getReport` in `ReportsView.tsx:142` and add alias in `preload.ts` (`DEF-24 / DEFECT-01`).
4. **Fix SQLite Migration 012:** Alter canonical tables `payments` and `invoices` instead of `fee_payments` and `fee_invoices` in `012_receipt_blocks_and_payment_ledger.ts` (`DEFECT-02`).
5. **Fix Demo Data Purge:** Correct table names and reverse dependency deletion order in `installation.repository.ts:48-63` (`DEFECT-03`).
6. **Enforce Read-Only Expiry (Decision 1):** Update `assertCanRead()` in `license.service.ts` to allow reads during `expired` and `grace_period` states (`DEFECT-LIC-01`).
7. **Remove License Verification Bypass:** Strip `'cloud_auth_verified'` from `license-verifier.ts` and require Ed25519 digital signatures (`DEFECT-LIC-02`).
8. **Fix License Activation Bearer Token:** Retrieve decrypted cloud JWT instead of local session token in `handlers.ts:1482, 1602` (`AUTH-DEFECT-01`).
9. **Remove Key Unlock from Backup Verification:** Remove `DatabaseKeyManager.getInstance().unlock()` from `backup.service.ts:168` (`DEFECT-SEC-01`).

### Phase 2: Critical Architecture & Security (P1)
1. **Exclude Test DBs from ASAR:** Update `package.json` `build.files` to exclude `dist/data/**/*` (`DEF-PKG-002`).
2. **Add Electron WebContents Guards:** Attach `setWindowOpenHandler` and `will-navigate` guards in `main.ts` (`DEF-PKG-003`).
3. **Persist Cloud Token on Password Change:** Capture returned `TokenPair` in `auth.service.ts:138` and save to `sync_device_config` (`AUTH-DEFECT-02`).
4. **Enforce Provisional Write Invariants:** Restrict provisional local writes in `write-coordinator.ts:104` to `ATTENDANCE` and `PAYMENT` (`DEF-SYNC-02`).
5. **Fix Outbox Conflict State Overwrite:** Stop overwriting `conflict` state with `needs_attention` in `write-coordinator.ts:235` (`DEF-SYNC-03`).
6. **Implement Local Payment Insertion in Offline Safe Fee IPC:** Save payments to SQLite in `fees:collect-offline-safe` (`DEF-SYNC-04`).
7. **Write Back Reconciled Receipts:** Update `payments.official_receipt_no` when cloud reconciles offline receipt blocks (`DEF-SYNC-05`).
8. **Fix Teacher Timetable & Exam Permissions:** Assert `timetable:*` and `exams:*` instead of `academics:*` (`DEF-13 / DEF-19`).
9. **Add Historical Attendance Fetch:** Load existing attendance records on date/section selection in `AttendanceView.tsx` (`DEF-15`).
10. **Add Salary Configuration UI:** Add salary edit modal in `StaffView.tsx` to enable payroll generation (`DEF-09`).
11. **Add Subject Master CRUD:** Add Subjects tab in `AcademicsView.tsx` (`DEF-11`).
12. **Fix Sync Outbox `retry_count` Error:** Replace with `attempt_count` in `change-tracker.ts` (`DEFECT-04`).
13. **Guard IPC Handler Result Access:** Add optional chaining (`dispatchRes.result?.success`) across all mutation handlers (`DEFECT-05`).
14. **Secure Notices & Online Proxy IPC:** Add Zod validation, RBAC checks, and URL allowlist in `handlers.ts` (`DEFECT-06`).

### Phase 3: Medium Quality & UI Polish (P2)
1. Fix inferred `rank` type in `exam.repository.ts:362` (`DEF-07 / DEFECT-07`).
2. Fix `syncStatus?.lastSyncAt` typo in `AppHeader.tsx:216` (`DEF-08 / DEFECT-08`).
3. Pass `selectedMonth` filter through preload and handlers to `FeeService.getFeeSummary` (`DEF-10 / DEFECT-10`).
4. Filter teaching staff in `employee.repository.ts:listEmployees` (`DEF-09 / DEFECT-09`).
5. Standardize IPC error handling to `{ success: false, error }` across all 13 handlers (`DEF-11 / DEFECT-11`).
6. Wrap offline mirror responses in standard API envelope (`AUTH-DEFECT-03`).
7. Add responsive scroll indicators and fix modal dialog vertical overflow on 768p displays (`DEF-02, DEF-03`).

### Phase 4: Low Severity & Hygiene (P3)
1. Add `export type` modifier in `online-sync-dispatcher.ts:6` (`DEFECT-12`).
2. Add explicit `WHERE id = 1` on `technician_lockout` queries (`DEFECT-13`).
3. Add Windows executable version metadata to `package.json` (`DEF-PKG-004`).
4. Prune `sync_history` records automatically in SQLite (`DEF-SYNC-12`).

---

## K. Final Readiness Decision

### Decision: **BLOCKED**

**Justification:**  
Under the strict evidence-based engineering standards governing this audit, School Management Software **cannot be approved for distribution, deployment, or pilot use** in its current condition. 

The software fails core acceptance criteria on multiple independent fronts:
1. **The application does not run when installed:** The pre-packaged Windows binary crashes immediately on workstation launch.
2. **Cloud data security is compromised:** Any offline workstation can push mutations that bypass all backend role authorization checks.
3. **Core reporting is inoperable:** The primary administrative reporting dashboard crashes with an uncaught runtime TypeError.
4. **Financial data integrity is unmigrated:** Required ledger columns for offline receipting and overpayments were never created in the SQLite database due to table name mismatches.
5. **License expiration breaks contract:** Users are locked out from reading their own school records upon subscription expiry, directly violating Decision 1.
6. **Client data isolation is compromised:** Initializing a school fails to purge sample student and financial records from the database.

Following the execution of the prioritized remediation roadmap in Section J, a full re-audit must be performed before release approval can be granted.

---
*Report certified by Audit Coordinator on behalf of Audit Agents 1 through 8.*  
*Full machine logs, traces, and visual evidence archived at `qa-evidence/` and `src/main/`.*
