# School Management Software — Disaster Recovery & Backup Restoration Runbook

**Runbook Target:** School IT Administrators, Technical Support Specialists  
**Procedure Type:** Emergency Disaster Recovery, Hardware Replacement, Database Restoration  

---

## 1. Scenario A: Restoring on the Same Workstation (Corrupted Active State)

Use this procedure when an operator made accidental deletions or a disk glitch corrupted the active database.

### Prerequisites:
- Valid backup file located in `backups/local/` or downloaded from Central Cloud.
- Administrator password.

### Step-by-Step Procedure:
1. Launch School Management Software and sign in as Administrator.
2. Navigate to **System Settings** $\rightarrow$ **Automated Backup & Restore** tab.
3. Click **Restore from Backup File...**.
4. Enter the full path of the `.enc.bak` file.
5. Enter the master recovery passphrase (or leave blank if the default installation secret is used).
6. Click **Verify & Inspect Backup Sandbox**.
7. Carefully review the sandbox preview:
   - Ensure the integrity status is **"ok"**.
   - Verify that student counts, invoice counts, and payment counts match expected records.
8. Check the confirmation box: *"I explicitly confirm replacing the active database with this validated backup"*.
9. Click **Confirm & Replace Active Database**.
10. The system automatically creates a pre-restore safety snapshot (e.g., `pre_restore_snapshot_<timestamp>.sqlite`), replaces the active database, and checkpoints WAL mode.

---

## 2. Scenario B: Restoring on a Brand New Replacement Computer

Use this procedure when the original computer suffered hardware death, theft, or complete Windows reinstallation.

### Step-by-Step Procedure:
1. Install a fresh copy of School Management Software on the replacement machine.
2. Complete the initial school setup with your official **School Code** and **School ID**.
3. Obtain your latest encrypted backup file:
   - Option 1: From your external USB archive (`D:/SMS/ExternalBackups/`).
   - Option 2: Download from Central Cloud via web portal or desktop cloud sync.
4. Open the application, go to **Settings** $\rightarrow$ **Automated Backup & Restore** $\rightarrow$ **Restore from Backup File...**.
5. Provide the backup file path and enter your school master recovery passphrase.
6. Verify and inspect the sandbox report.
7. Click **Confirm & Replace Active Database**.
8. After restoration completes, navigate to **Subscription & Licensing** tab and click **Activate Workstation** to bind the new machine to your school seat.

---

## 3. Scenario C: Sync Continuity & Anti-Duplicate Replay Protection

When a restored database contains pending or historical sync outbox events:
- **No Duplicate Payments:** Every financial mutation in `sync_outbox` is stamped with a deterministic SHA-256 `idempotency_key`. The central backend's `SyncIdempotency` collection recognizes previously processed events and acknowledges them without creating duplicate invoices, receipts, or ledger entries.
- **Sync Cursors:** The restored database retains its high-water-mark tokens in `sync_cursors`, resuming incremental download smoothly from the server change log without redownloading all historic records.
