export type SyncState = 'synced' | 'pending' | 'syncing' | 'uploading' | 'downloading' | 'conflict' | 'offline' | 'error';
export type NetworkState = 'online' | 'offline';

export interface AppInfo {
  name: string;
  version: string;
  environment: 'development' | 'production';
  platform: string;
  arch: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  userDataPath: string;
  dbPath: string;
}

export interface DatabaseStatus {
  connected: boolean;
  engine: 'better-sqlite3';
  path: string;
  sizeBytes: number;
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  totalInvoices: number;
  lastBackupAt: string | null;
  walEnabled: boolean;
  foreignKeysEnabled: boolean;
  synchronousMode: string;
}

export interface SyncStatus {
  state: SyncState;
  network: NetworkState;
  lastSyncedAt: string | null;
  pendingChangesCount: number;
  failedChangesCount?: number;
  unresolvedConflictCount?: number;
  centralBackendUrl: string;
  schoolId: string;
  lastErrorMessage?: string | null;
}

export interface ConflictItem {
  id: string;
  schoolId: string;
  entityType: string;
  entityId: string;
  localVersion: number;
  remoteVersion: number;
  localPayload: any;
  remotePayload: any;
  conflictingFields: string[];
  conflictReason: string;
  status: 'unresolved' | 'resolved' | 'ignored';
  resolutionStrategy: 'local_wins' | 'remote_wins' | 'merged' | 'manual' | null;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SyncHistoryEntry {
  id: string;
  schoolId: string;
  runId: string;
  direction: 'upload' | 'download' | 'bidirectional';
  status: 'success' | 'partial' | 'failed' | 'conflict';
  uploadedCount: number;
  downloadedCount: number;
  conflictCount: number;
  errorMessage?: string | null;
  startedAt: string;
  completedAt: string;
}

export interface RestorePreview {
  verified: boolean;
  integrityStatus: string;
  schemaVersion: number;
  migrationCount: number;
  recordCounts: {
    students: number;
    invoices: number;
    payments: number;
    attendance: number;
    outboxEvents: number;
  };
  backupTimestamp: string;
  fileSizeBytes: number;
}

export type LicenseState =
  | 'active'
  | 'offline_grace'
  | 'renewal_required'
  | 'grace_ending_soon'
  | 'grace_expired'
  | 'expired'
  | 'revoked'
  | 'device_mismatch'
  | 'clock_tampered'
  | 'unactivated';

export interface LicenseStatusInfo {
  state: LicenseState;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  deviceId: string;
  planCode: string;
  planName: string;
  issuedAt: string | null;
  expiresAt: string | null;
  gracePeriodDays: number;
  graceDaysRemaining: number;
  lastServerVerification: string | null;
  entitlements: string[];
  limits: Record<string, any>;
  canRead: boolean;
  canWrite: boolean;
  message?: string;
}

export interface BackupDestinationConfig {
  destinationType: 'local' | 'cloud' | 'external';
  isEnabled: boolean;
  destinationPath: string;
  retentionCount: number;
  lastBackupAt: string | null;
  lastBackupStatus: string;
  lastError: string | null;
  healthStatus: 'healthy' | 'warning' | 'error' | 'disabled';
}

export interface BackupHistoryEntry {
  backupId: string;
  destinationType: 'local' | 'cloud' | 'external';
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  checksumSha256: string;
  isEncrypted: boolean;
  encryptionAlgorithm: string;
  status: 'completed' | 'failed' | 'verified' | 'restored';
  triggerType: 'manual' | 'scheduled' | 'pre_migration' | 'maintenance';
  verifiedAt: string | null;
  restoredAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  schoolId: string;
  schoolName?: string;
  name: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  role: 'school_owner' | 'principal' | 'school_admin' | 'accountant' | 'teacher' | 'staff';
  permissions: string[];
  status: string;
}

export interface AuthSessionState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;
  expiresAt: string | null;
}

export interface DashboardMetrics {
  totalStudents: number;
  activeStudents: number;
  totalFaculty: number;
  classesCount: number;
  todayAttendancePercent: number;
  todayPresentCount: number;
  todayAbsentCount: number;
  todayLateCount: number;
  todayLeaveCount: number;
  monthlyBilledAmount: number;
  monthlyCollectedAmount: number;
  outstandingBalance: number;
  currentAcademicSession: string;
  recentActivities: {
    id: string;
    action: string;
    module: string;
    timestamp: string;
    status: 'success' | 'warning' | 'info';
  }[];
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  category: 'core' | 'academic' | 'finance' | 'admin';
  badge?: string;
  quickStat?: {
    label: string;
    value: string | number;
  };
}

export interface ProvisioningStatus {
  isProvisioned: boolean;
  hasAdmin: boolean;
  schoolName?: string;
  schoolId?: string;
}

export interface InitialAdminInput {
  schoolName?: string;
  name: string;
  username: string;
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export type UpdateChannel = 'stable' | 'beta';
export type UpdateState = 
  | 'idle'
  | 'checking'
  | 'update_available'
  | 'update_not_available'
  | 'downloading'
  | 'download_interrupted'
  | 'ready_to_install'
  | 'installing'
  | 'error';

export interface UpdateDownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
}

export interface WindowsUpdatePayload {
  url: string;
  sha512: string;
  sizeBytes: number;
  installerType: 'nsis';
  minWindowsBuild?: number;
}

export interface UpdateManifest {
  version: string;
  releaseDate: string;
  minSupportedVersion: string;
  mandatory: boolean;
  channel: UpdateChannel;
  windows: WindowsUpdatePayload;
  releaseNotes: string;
  databaseMigrationRequired: boolean;
  targetSchemaVersion: number;
}

export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string;
  channel: UpdateChannel;
  updateEndpoint: string;
  lastCheckedAt: string | null;
  availableUpdate: UpdateManifest | null;
  downloadProgress: UpdateDownloadProgress | null;
  pendingInstallerPath: string | null;
  lastError: string | null;
}

export interface DesktopAPI {
  // Authentication, Provisioning & Session
  getProvisioningStatus: () => Promise<ProvisioningStatus>;
  provisionInitialAdmin: (input: InitialAdminInput) => Promise<{ success: boolean; adminUser?: any; error?: string }>;
  changePassword: (token: string, input: ChangePasswordInput) => Promise<{ success: boolean; error?: string }>;
  login: (credentials: { identifier: string; password: string; schoolCode?: string; backendUrl?: string }) => Promise<{ success: boolean; user?: UserProfile; token?: string; schoolName?: string; isOnline?: boolean; error?: string }>;
  logout: (token: string) => Promise<{ success: boolean }>;
  getCurrentSession: (token: string) => Promise<{ isValid: boolean; user?: UserProfile; reason?: string }>;

  // App & Database Diagnostics
  getAppInfo: () => Promise<AppInfo>;
  getDatabaseStatus: (token: string) => Promise<DatabaseStatus>;
  runIntegrityCheck: (token?: string) => Promise<{ ok: boolean; result: string }>;
  triggerLocalBackup: (token?: string) => Promise<{ success: boolean; backupPath: string }>;
  createVerifiedBackup: (token: string, targetDir?: string) => Promise<{ success: boolean; data?: any; error?: string }>;

  // Sync Manager
  getSyncStatus: (token: string) => Promise<SyncStatus>;
  triggerSync: (token?: string) => Promise<{ success: boolean; syncedCount: number; error?: string }>;
  listConflicts: (token: string, status?: 'unresolved' | 'resolved') => Promise<ConflictItem[]>;
  resolveConflict: (token: string, input: { conflictId: string; strategy: 'local_wins' | 'remote_wins' | 'merged'; notes?: string; customPayload?: any }) => Promise<{ success: boolean; error?: string }>;
  getSyncHistory: (token: string, limit?: number) => Promise<SyncHistoryEntry[]>;
  setRemoteBackendUrl: (token: string, url: string) => Promise<{ success: boolean; error?: string }>;

  // Technician & Deployment Configuration
  verifyTechnicianAccess: (passkey: string) => Promise<{ success: boolean; token?: string; error?: string }>;
  getDeploymentConfig: (techToken: string) => Promise<{ success: boolean; config?: { cloudApiBaseUrl: string; source: string; isProductionDefault: boolean }; error?: string }>;
  setDeploymentConfig: (techToken: string, url: string) => Promise<{ success: boolean; config?: { cloudApiBaseUrl: string; source: string; isProductionDefault: boolean }; error?: string }>;

  // Domain Queries & Operations (Protected by Session & RBAC)
  getDashboardMetrics: (token?: string) => Promise<DashboardMetrics>;
  
  // Students & Guardians
  getStudents: (token: string, query?: { search?: string; classId?: string; limit?: number }) => Promise<any[]>;
  getStudentProfile: (token: string, studentId: string) => Promise<any>;
  admitStudent: (token: string, data: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  replaceGuardian: (token: string, input: { studentId: string; guardian: any; reason: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
  archiveStudent: (token: string, input: { studentId: string; status: 'inactive' | 'graduated' | 'withdrawn'; reason?: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
  promoteStudent: (token: string, input: { studentId: string; targetSessionId: string; targetClassId: string; targetSectionId: string; rollNumber?: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
  bulkPromoteStudents: (token: string, input: { studentIds: string[]; targetSessionId: string; targetClassId: string; targetSectionId: string }) => Promise<{ success: boolean; promotedCount?: number; error?: string }>;

  // Academics
  getClasses: (token?: string) => Promise<any[]>;
  getAcademicSessions: (token: string) => Promise<any[]>;
  createAcademicSession: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  createClass: (token: string, input: { id: string; name: string; orderIndex: number; sections: string[] }) => Promise<{ success: boolean; data?: any; error?: string }>;

  // Attendance
  getAttendanceSummary: (token: string, date?: string) => Promise<any>;
  getAttendanceByDateAndClass: (token: string, date: string, classId?: string) => Promise<any[]>;
  recordAttendance: (token: string, entries: any[]) => Promise<{ success: boolean; recordedCount?: number; error?: string }>;
  correctAttendance: (token: string, input: { attendanceId: string; newStatus: 'present' | 'absent' | 'late' | 'leave'; reason: string }) => Promise<{ success: boolean; error?: string }>;
  getStudentAttendanceHistory: (token: string, studentId: string, sessionId?: string) => Promise<any[]>;

  // Fees & Concessions
  getFeeSummary: (token: string) => Promise<any>;
  getInvoices: (token: string, month?: string) => Promise<any[]>;
  getInvoiceDetails: (token: string, invoiceId: string) => Promise<any>;
  getDefaulters: (token: string, minBalance?: number, month?: string) => Promise<any[]>;
  createInvoice: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  cancelInvoice: (token: string, input: { invoiceId: string; reason: string }) => Promise<{ success: boolean; error?: string }>;
  collectFee: (token: string, payment: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  reverseFee: (token: string, paymentId: string, reason: string) => Promise<{ success: boolean; restoredBalance?: number; error?: string }>;
  getFeeStructures: (token: string, sessionId?: string) => Promise<any[]>;
  createFeeStructure: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  getConcessions: (token: string, studentId?: string) => Promise<any[]>;
  createConcession: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  revokeConcession: (token: string, concessionId: string) => Promise<{ success: boolean; error?: string }>;
  bulkGenerateInvoices: (token: string, input: { sessionId: string; classId: string; month: string; dueDate: string }) => Promise<{ success: boolean; generatedCount?: number; skippedCount?: number; error?: string }>;

  // Exams & Grading
  getExams: (token: string, sessionId?: string) => Promise<any[]>;
  createExam: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  publishExam: (token: string, examId: string) => Promise<{ success: boolean; error?: string }>;
  getExamPapers: (token: string, examId: string, classId?: string) => Promise<any[]>;
  createExamPaper: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  getMarksForPaper: (token: string, paperId: string) => Promise<any[]>;
  recordMarks: (token: string, examId: string, paperId: string, marks: any[]) => Promise<{ success: boolean; recordedCount?: number; error?: string }>;
  calculateExamResults: (token: string, examId: string, classId: string) => Promise<any>;
  generateReportCard: (token: string, examId: string, studentId: string) => Promise<any>;
  getGradingScales: (token: string) => Promise<any[]>;
  saveGradingScales: (token: string, scales: any[]) => Promise<{ success: boolean; data?: any; error?: string }>;

  // Staff & Staff Attendance
  getStaff: (token: string, query?: { search?: string; status?: string; department?: string }) => Promise<any[]>;
  createStaff: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  recordStaffAttendance: (token: string, entries: any[]) => Promise<{ success: boolean; recordedCount?: number; error?: string }>;
  getStaffAttendance: (token: string, date: string) => Promise<any[]>;
  getStaffAttendanceSummary: (token: string, date: string) => Promise<any>;
  createStaffUserAccount: (token: string, input: { employeeId: string; username: string; email: string; password: string; role: string; fullName?: string }) => Promise<{ success: boolean; error?: string }>;

  // Timetable
  getTimetable: (token: string, sessionId: string, sectionId: string, dayOfWeek?: number) => Promise<any[]>;
  createTimetableEntry: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  validateTimetableEntry: (token: string, input: any) => Promise<{ valid: boolean; error?: string | null }>;
  deleteTimetableEntry: (token: string, entryId: string) => Promise<{ success: boolean; error?: string }>;

  // Expenses & Accounts
  getExpenses: (token: string, query?: any) => Promise<any[]>;
  getExpenseSummary: (token: string, startDate?: string, endDate?: string) => Promise<any>;
  getVoucherDetails: (token: string, expenseId: string) => Promise<any>;
  createExpense: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;

  // Payroll
  saveSalaryStructure: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  getSalaryStructure: (token: string, employeeId: string) => Promise<any>;
  listSalaryStructures: (token: string) => Promise<any[]>;
  generatePayrollRun: (token: string, input: { month: string; year: number }) => Promise<{ success: boolean; data?: any; error?: string }>;
  listPayrollRuns: (token: string) => Promise<any[]>;
  getPayrollRunDetails: (token: string, runId: string) => Promise<any>;
  markPayrollSlipPaid: (token: string, input: { slipId: string; paymentMethod?: string; paymentReference?: string }) => Promise<{ success: boolean; error?: string }>;

  // Settings
  getSchoolSettings: (token: string) => Promise<any>;
  updateSchoolSettings: (token: string, input: any) => Promise<{ success: boolean; data?: any; error?: string }>;

  // Reports
  getReport: (token: string, reportType: string, params?: any) => Promise<any>;
  exportPdfReport?: (token: string, reportData: any) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  exportExcelReport?: (token: string, reportData: any) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  getSyncQueue: (token: string) => Promise<any[]>;
  getAuditLogs: (token: string) => Promise<any[]>;

  // Licensing & Activation
  getLicenseStatus: (token: string) => Promise<LicenseStatusInfo>;
  activateLicense: (token: string, input?: { deviceName?: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
  revalidateLicense: (token: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  deactivateLicense: (token: string) => Promise<{ success: boolean; error?: string }>;
  checkFeatureEntitlement: (token: string, featureKey: string) => Promise<{ enabled: boolean }>;

  // Automated Backups & Restoration
  getBackupDestinations: (token: string) => Promise<BackupDestinationConfig[]>;
  updateBackupDestination: (token: string, input: { destinationType: string; isEnabled?: boolean; destinationPath?: string; retentionCount?: number }) => Promise<{ success: boolean; error?: string }>;
  createBackup: (token: string, input: { destinationType: string; triggerType?: string; passphrase?: string }) => Promise<{ success: boolean; data?: BackupHistoryEntry; error?: string }>;
  verifyBackupFile: (token: string, input: { filePath: string; passphrase?: string }) => Promise<{ success: boolean; data?: RestorePreview; error?: string }>;
  restoreBackup: (token: string, input: { filePath: string; confirm: boolean; passphrase?: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
  getBackupHistory: (token: string, limit?: number) => Promise<BackupHistoryEntry[]>;

  // Application Updates & Release Management
  getUpdateStatus: (token: string) => Promise<UpdateStatus>;
  checkForUpdates: (token: string, endpointOverride?: string) => Promise<{ success: boolean; data?: UpdateManifest | null; error?: string }>;
  downloadUpdate: (token: string, urlOverride?: string) => Promise<{ success: boolean; data?: { installerPath: string }; error?: string }>;
  installUpdate: (token: string, options?: { silent?: boolean }) => Promise<{ success: boolean; data?: any; error?: string }>;
  setUpdateChannel: (token: string, channel: UpdateChannel) => Promise<{ success: boolean; error?: string }>;
  cancelUpdateDownload: (token: string) => Promise<{ success: boolean; error?: string }>;

  // Window Controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;

  // Subscription & Security Events
  onSubscriptionStatusChanged?: (callback: (status: LicenseStatusInfo) => void) => () => void;
}

declare global {
  interface Window {
    desktopAPI: DesktopAPI;
  }
}
