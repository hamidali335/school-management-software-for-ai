# School Management Software — Windows Installation Guide

**Document Version:** 1.0.0  
**Target Platform:** Windows 10 & Windows 11 (64-bit, x64)  
**Distribution Artifact:** `School Management Software Setup 1.0.0.exe`  
**Installer Engine:** NSIS (Nullsoft Scriptable Install System) v3 via electron-builder

---

## 1. System Requirements

### 1.1. Minimum Hardware Requirements
| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Processor** | Intel Core i3 (6th Gen) / AMD Ryzen 3 or equivalent | Intel Core i5 (8th Gen+) / AMD Ryzen 5 |
| **Architecture** | 64-bit (x64) | 64-bit (x64) |
| **RAM** | 4 GB | 8 GB or higher |
| **Storage** | 1 GB free SSD/HDD space for application binaries | 10 GB free space for SQLite data and automated encrypted backups |
| **Display** | 1280 x 720 resolution | 1920 x 1080 (Full HD) |

### 1.2. Operating System Compatibility
- **Windows 11:** Build 22000 or higher (all editions: Home, Pro, Enterprise, Education).
- **Windows 10:** Version 1909 (Build 18363) or higher.
- **Runtimes:** Fully self-contained. **No external Node.js, npm, Python, or Visual C++ redistributable installation is required on target workstations.** All native dependencies (`better-sqlite3`, SQLite3, V8 engine) are bundled within the distribution package.

---

## 2. Installation Architecture & Directory Isolation

To ensure school records, financial transactions, and licensing data are never deleted during application updates or standard uninstallation, the application enforces a strict separation between **Program Binaries** and **User Data**:

```
C:\
├── Program Files\School Management Software\     <-- [INSTALLATION DIRECTORY]
│   ├── School Management Software.exe           <-- Main application launcher
│   ├── Uninstall School Management Software.exe <-- Uninstaller binary
│   ├── chrome_100_percent.pak, resources.pak    <-- Chromium resources
│   └── resources\
│       ├── app.asar                             <-- Packaged application bundle
│       └── app.asar.unpacked\                   <-- Unpacked native C++ modules
│           └── node_modules\better-sqlite3\     <-- Precompiled native SQLite engine
│
└── Users\<Username>\AppData\Roaming\School Management Software\  <-- [PERSISTENT USER DATA]
    ├── school_local.db                          <-- Active SQLite database
    ├── school_local.db-wal                      <-- Active WAL journal
    ├── school_local.db-shm                      <-- Shared memory index
    ├── backups\                                 <-- Automated Encrypted Backups
    │   ├── local\                               <-- AES-256-GCM encrypted local backup files
    │   └── pre_migration\                       <-- Pre-migration disaster recovery snapshots
    └── updates\                                 <-- Staged auto-update packages
```

> [!IMPORTANT]
> The installation directory (`Program Files`) contains only stateless executables. The uninstaller is explicitly configured with `deleteAppDataOnUninstall: false`. Even if an administrator uninstalls the software from Windows Add/Remove Programs, the database (`school_local.db`), encryption keys, and backup history in `%APPDATA%` remain intact.

---

## 3. Fresh Installation Procedure

### 3.1. Standard Interactive Installation
1. Locate the installer executable: `School Management Software Setup 1.0.0.exe`.
2. Double-click the installer to launch the setup wizard.
3. If prompted by Windows User Account Control (UAC), click **Yes** to allow installation.
4. **Choose Install Location:** The setup wizard defaults to `C:\Program Files\School Management Software` (or per-user AppData if run without elevation). Click **Browse...** to select a custom drive or directory if required.
5. **Shortcuts:** The installer automatically provisions:
   - A Start Menu shortcut under `School Management Software`.
   - A Desktop shortcut with the application's institutional shield and gold graduation cap icon.
6. Click **Install**. The wizard extracts files and registers Windows Add/Remove Programs metadata.
7. Upon completion, check **Run School Management Software** and click **Finish**.

### 3.2. Unattended / Silent Deployment (Enterprise Administrator)
For automated mass deployment across school computer labs, system administrators can execute the installer silently via command prompt or PowerShell:

```powershell
# Silent installation to default Program Files directory
.\School Management Software Setup 1.0.0.exe /S

# Silent installation to a custom target drive/folder
.\School Management Software Setup 1.0.0.exe /S /D=D:\Programs\SchoolManagementSoftware
```

*Note: In NSIS syntax, the `/D=` parameter must be the last argument and must not contain surrounding quotation marks.*

---

## 4. First-Time Launch & School Provisioning

Upon initial launch on a fresh workstation:
1. **Database Auto-Initialization:** The application checks `%APPDATA%\School Management Software\school_local.db`. If absent, it creates the database file, enables Write-Ahead Logging (`WAL`), turns on foreign keys (`foreign_keys = ON`), sets `synchronous = FULL`, and executes forward migrations 001 through 009.
2. **Initial Administrator Provisioning:** If no administrator account exists, the application presents the setup screen. The school administrator specifies:
   - School Name and Identification Code.
   - Initial Administrator Full Name, Email, and Master Password.
3. **Offline Operation:** The system is operational immediately without requiring an internet connection.
4. **Subscription Activation:** When internet access is available, navigate to **Settings > Subscription & Licensing** and click **Activate Workstation License** to bind the device to the central School OS platform.

---

## 5. Uninstallation Procedure

1. Open **Windows Settings > Apps > Installed apps** (or `appwiz.cpl` in Control Panel).
2. Locate **School Management Software** and click **Uninstall**.
3. The NSIS uninstaller removes all program binaries, shortcuts, and registry uninstall keys.
4. **Preserved Data:** The user database (`school_local.db`), AES-256-GCM backups, licensing tokens, and sync outbox are preserved in `%APPDATA%\School Management Software`.
5. Reinstalling the application or upgrading to a newer release immediately reconnects to the existing database without data loss.
