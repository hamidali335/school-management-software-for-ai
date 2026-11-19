# School Management Software (SMS) — Desktop Foundation

A commercial, offline-first Windows Desktop Application for schools and academies. Engineered for high performance, local data autonomy, and seamless future background synchronization with the central School OS backend.

---

## 1. Quick Start

### Prerequisites
- Windows 10/11 (x64)
- Node.js (>= 20.x, tested on v24.21.0)
- npm (>= 10.x, tested on 11.19.0)

### Development & Execution Commands

```powershell
# Navigate to project directory
cd D:\SMS\SchoolManagementSoftware

# Compile TypeScript backend, IPC bridge, and Vite renderer
npm run build

# Run automated database engine and invariant tests
npm test

# Verify desktop application launch & IPC registration
npm run verify:launch

# Start the desktop application
npm start

# (Optional) Run Vite renderer in standalone dev server
npm run dev
```

---

## 2. Directory Layout

```
D:\SMS\SchoolManagementSoftware/
├── dist/                             # Compiled production bundles
│   ├── main/                         # Compiled Electron main process & SQLite engine
│   ├── preload/                      # Compiled ContextBridge IPC script
│   ├── renderer/                     # Compiled React + Vite application bundle
│   └── shared/                       # Compiled shared types and constants
├── docs/                             # Architecture & Synchronization Specifications
│   └── LOCAL_DATABASE_AND_SYNC_ARCHITECTURE.md
├── scripts/                          # Execution & verification launchers
│   ├── start-electron.js             # Electron runtime launcher
│   └── verify-launch.js              # Automated launch verification test
├── src/
│   ├── main/                         # Electron Main Process (Privileged)
│   │   ├── database/                 # SQLite engine (better-sqlite3), schemas, migrations, seed
│   │   ├── ipc/                      # Secure IPC channel dispatchers
│   │   ├── sync/                     # Offline sync manager & outbox change tracker
│   │   └── main.ts                   # Window lifecycle & initialization
│   ├── preload/                      # Isolated Context Bridge
│   │   └── preload.ts                # window.desktopAPI exposure
│   ├── renderer/                     # React UI Application (Unprivileged Webview)
│   │   ├── components/               # TopNavBar, ModuleCard, StatusBadges
│   │   ├── views/                    # DashboardView, StudentsView, AttendanceView, etc.
│   │   ├── App.tsx                   # Top-level application shell and routing
│   │   ├── main.tsx                  # React entry point
│   │   └── index.css                 # Tailwind utility styling
│   └── shared/                       # Shared domain contracts
│       ├── types.ts                  # IPC contracts & entity interfaces
│       ├── constants.ts              # Metadata & module definitions
│       └── schemas/                  # Domain validation schemas
├── tests/                            # Automated test suites
│   └── database.test.js              # SQLite engine, schema & constraint tests
├── index.html                        # Application window HTML template
├── package.json                      # Build scripts and dependencies
├── tsconfig.json                     # TypeScript config for Renderer
├── tsconfig.main.json                # TypeScript config for Main & Preload
└── vite.config.ts                    # Vite compilation config
```

---

## 3. Technology Highlights

- **Desktop Shell:** Electron 41 (Context isolation: `true`, Sandbox: `true`, Node integration: `false`)
- **Embedded Database:** `better-sqlite3` 13.0 (Synchronous ACID transactions, WAL mode, foreign key enforcement)
- **Frontend UI Framework:** React 18 + TypeScript + Vite 6
- **Styling:** Tailwind CSS with Lucide Icons
- **Offline Outbox Pattern:** Guarantees zero data loss when operating offline
