# School Management Software — Device Activation & Offline License Enforcement

**Document Version:** 1.0.0 (Phase 6 Approved)  
**Target Platform:** Windows 10 / Windows 11 (Desktop Client)  
**Security Focus:** Device Fingerprint Binding, Offline Grace Period Engine, Clock Rollback Protection  

---

## 1. Hardware Fingerprinting & Binding

### 1.1. Deterministic Multi-Component Fingerprint
The desktop application combines stable system and installation characteristics to bind activation without violating user privacy:
- Platform OS architecture (`process.platform`, `process.arch`).
- Machine Hostname & Processor Model.
- Total Physical RAM (rounded).
- Active Network Adapter MAC signature (filtered to exclude virtual and local loopback adapters).
- School Installation ID (`installation_config.installation_id`).

### 1.2. Privacy & Anti-Tampering Guarantee
- **No Raw Identifiers:** Hardware serial numbers, motherboard IDs, and MAC addresses are **never logged, displayed in the UI, or transmitted over the wire**.
- **One-Way Digest:** A SHA-256 hash is computed and prefixed with `fp_win_`.
- **Hardware Upgrade Tolerance:** Minor hardware changes (e.g. adding RAM) trigger a controlled reactivation flow through `POST /api/v1/licensing/replace` rather than silent lockout.

---

## 2. Offline License Lifecycle & States

The application enforces 10 distinct, mutually exclusive license states:

| License State | Operational Behavior | Description |
| :--- | :--- | :--- |
| **`active`** | Full Read & Write | Cryptographically verified, subscription active, verified within 24 hours. |
| **`offline_grace`** | Full Read & Write | Working offline; within `gracePeriodDays` since last server handshake. |
| **`renewal_required`**| Full Read & Write | Subscription expiration approaching within 7 days. |
| **`grace_ending_soon`**| Full Read & Write | Offline grace period has less than 48 hours remaining. UI displays warning. |
| **`grace_expired`** | **Restricted Read-Only** | Offline grace period exceeded. Writes suspended until online handshake. |
| **`expired`** | **Restricted Read-Only** | Commercial subscription expired. Data readable; exports & backups enabled. |
| **`revoked`** | **Restricted Read-Only** | Device seat revoked by administrator or replaced. |
| **`device_mismatch`** | **Restricted Read-Only** | License transferred to an unauthorized machine. |
| **`clock_tampered`** | **Restricted Read-Only** | Backward clock jump detected (>1 hour). Writes suspended. |
| **`unactivated`** | **Restricted Read-Only** | Clean install awaiting initial school activation. |

---

## 3. Clock Rollback & Tamper Protection

### 3.1. Monotonic and Persistent Tracking
Trivial system clock manipulation (setting system clock backward to prolong grace periods or expired subscriptions) is detected through two independent mechanisms:
1. **Persistent Local Time Ledger:**
   - Every read and write transaction updates `last_observed_local_time` in SQLite.
   - If current system time is earlier than `last_observed_local_time - 1 hour` (allowing a 1-hour margin for daylight savings or minor NTP clock drift), the system immediately sets `clock_tampered = 1`.
2. **Session Monotonic Time:**
   - During runtime, the engine samples `process.hrtime.bigint()`.
   - Backward system time jumps relative to monotonic elapsed time trigger the tamper flag.

### 3.2. Legitimate Recovery Path
If an administrator accidentally changed system time or replaced a dead CMOS battery:
1. Connect the computer to the internet.
2. Click **Revalidate with Server** in the settings UI.
3. The server responds with an authoritative ISO 8601 timestamp signed by the central cloud.
4. The client resets `clock_tampered = 0` and aligns `last_observed_local_time` to authoritative server time.

### 3.3. Documented Limitations
> [!WARNING]
> A client application running with full Windows Administrator privileges cannot provide absolute protection against determined low-level binary tampering, memory inspection, or kernel-level filesystem mocking. The security guarantees provided protect against ordinary commercial evasion, unauthorized copying, and clock modification.
