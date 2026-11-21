import { contextBridge, ipcRenderer } from 'electron';
import { DesktopAPI } from '../shared/types';

const api: DesktopAPI = {
  // Authentication, Provisioning & Sessions
  getProvisioningStatus: () => ipcRenderer.invoke('auth:get-status'),
  provisionInitialAdmin: (input) => ipcRenderer.invoke('auth:provision-initial-admin', input),
  changePassword: (token, input) => ipcRenderer.invoke('auth:change-password', token, input),
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  logout: (token) => ipcRenderer.invoke('auth:logout', token),
  getCurrentSession: (token) => ipcRenderer.invoke('auth:get-session', token),

  // Diagnostics & Backup
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getDatabaseStatus: (token) => ipcRenderer.invoke('db:get-status', token),
  runIntegrityCheck: (token) => ipcRenderer.invoke('db:integrity-check', token),
  triggerLocalBackup: (token) => ipcRenderer.invoke('db:backup', token),
  createVerifiedBackup: (token, targetDir) => ipcRenderer.invoke('db:create-verified-backup', token, targetDir),

  // Sync Manager
  getSyncStatus: (token) => ipcRenderer.invoke('sync:get-status', token),
  triggerSync: (token) => ipcRenderer.invoke('sync:trigger', token),
  listConflicts: (token, status) => ipcRenderer.invoke('sync:list-conflicts', token, status),
  resolveConflict: (token, input) => ipcRenderer.invoke('sync:resolve-conflict', token, input),
  getSyncHistory: (token, limit) => ipcRenderer.invoke('sync:get-history', token, limit),
  setRemoteBackendUrl: (token, url) => ipcRenderer.invoke('sync:set-backend-url', token, url),

  // Technician & Deployment Settings
  verifyTechnicianAccess: (passkey: string) => ipcRenderer.invoke('technician:verify-access', passkey),
  getDeploymentConfig: (techToken: string) => ipcRenderer.invoke('technician:get-config', techToken),
  setDeploymentConfig: (techToken: string, url: string) => ipcRenderer.invoke('technician:set-backend-url', techToken, url),

  // Domain Queries & Operations (Protected)
  getDashboardMetrics: (token) => ipcRenderer.invoke('metrics:get-dashboard', token),
  
  // Students & Guardians
  getStudents: (token, query) => ipcRenderer.invoke('students:get-list', token, query),
  getStudentProfile: (token, studentId) => ipcRenderer.invoke('students:get-profile', token, studentId),
  admitStudent: (token, data) => ipcRenderer.invoke('students:admit', token, data),
  replaceGuardian: (token, input) => ipcRenderer.invoke('students:replace-guardian', token, input),
  archiveStudent: (token, input) => ipcRenderer.invoke('students:archive', token, input),
  promoteStudent: (token, input) => ipcRenderer.invoke('students:promote', token, input),
  bulkPromoteStudents: (token, input) => ipcRenderer.invoke('students:bulk-promote', token, input),

  // Academics
  getClasses: (token) => ipcRenderer.invoke('classes:get-list', token),
  getAcademicSessions: (token) => ipcRenderer.invoke('sessions:get-list', token),
  createAcademicSession: (token, input) => ipcRenderer.invoke('sessions:create', token, input),
  createClass: (token, input) => ipcRenderer.invoke('classes:create', token, input),

  // Attendance
  getAttendanceSummary: (token, date) => ipcRenderer.invoke('attendance:get-summary', token, date),
  getAttendanceByDateAndClass: (token, date, classId) => ipcRenderer.invoke('attendance:get-by-date-class', token, date, classId),
  recordAttendance: (token, entries) => ipcRenderer.invoke('attendance:record', token, entries),
  correctAttendance: (token, input) => ipcRenderer.invoke('attendance:correct', token, input),
  getStudentAttendanceHistory: (token, studentId, sessionId) => ipcRenderer.invoke('attendance:student-history', token, studentId, sessionId),

  // Fees & Concessions
  getFeeSummary: (token) => ipcRenderer.invoke('fees:get-summary', token),
  getInvoices: (token, month) => ipcRenderer.invoke('fees:get-invoices', token, month),
  getInvoiceDetails: (token, invoiceId) => ipcRenderer.invoke('fees:get-invoice-details', token, invoiceId),
  getDefaulters: (token, minBalance, month) => ipcRenderer.invoke('fees:get-defaulters', token, minBalance, month),
  createInvoice: (token, input) => ipcRenderer.invoke('fees:create-invoice', token, input),
  cancelInvoice: (token, input) => ipcRenderer.invoke('fees:cancel-invoice', token, input),
  collectFee: (token, payment) => ipcRenderer.invoke('fees:collect', token, payment),
  reverseFee: (token, paymentId, reason) => ipcRenderer.invoke('fees:reverse', token, paymentId, reason),
  getFeeStructures: (token, sessionId) => ipcRenderer.invoke('fees:get-structures', token, sessionId),
  listFeeStructures: (token, sessionId) => ipcRenderer.invoke('fees:get-structures', token, sessionId),
  createFeeStructure: (token, input) => ipcRenderer.invoke('fees:create-structure', token, input),
  getConcessions: (token, studentId) => ipcRenderer.invoke('fees:get-concessions', token, studentId),
  listConcessions: (token, studentId) => ipcRenderer.invoke('fees:get-concessions', token, studentId),
  createConcession: (token, input) => ipcRenderer.invoke('fees:create-concession', token, input),
  revokeConcession: (token, concessionId) => ipcRenderer.invoke('fees:revoke-concession', token, concessionId),
  bulkGenerateInvoices: (token, input) => ipcRenderer.invoke('fees:bulk-generate', token, input),

  // Exams & Grading
  getExams: (token, sessionId) => ipcRenderer.invoke('exams:get-list', token, sessionId),
  createExam: (token, input) => ipcRenderer.invoke('exams:create', token, input),
  publishExam: (token, examId) => ipcRenderer.invoke('exams:publish', token, examId),
  getExamPapers: (token, examId, classId) => ipcRenderer.invoke('exams:get-papers', token, examId, classId),
  createExamPaper: (token, input) => ipcRenderer.invoke('exams:create-paper', token, input),
  getMarksForPaper: (token, paperId) => ipcRenderer.invoke('exams:get-marks', token, paperId),
  recordMarks: (token, examId, paperId, marks) => ipcRenderer.invoke('exams:record-marks', token, examId, paperId, marks),
  calculateExamResults: (token, examId, classId) => ipcRenderer.invoke('exams:calculate-results', token, examId, classId),
  generateReportCard: (token, examId, studentId) => ipcRenderer.invoke('exams:report-card', token, examId, studentId),
  getGradingScales: (token) => ipcRenderer.invoke('exams:get-grading-scales', token),
  saveGradingScales: (token, scales) => ipcRenderer.invoke('exams:save-grading-scales', token, scales),

  // Staff & Attendance
  getStaff: (token, query) => ipcRenderer.invoke('staff:get-list', token, query),
  createStaff: (token, input) => ipcRenderer.invoke('staff:create', token, input),
  recordStaffAttendance: (token, entries) => ipcRenderer.invoke('staff:record-attendance', token, entries),
  getStaffAttendance: (token, date) => ipcRenderer.invoke('staff:get-attendance', token, date),
  getStaffAttendanceSummary: (token, date) => ipcRenderer.invoke('staff:get-attendance-summary', token, date),
  createStaffUserAccount: (token, input) => ipcRenderer.invoke('staff:create-user-account', token, input),

  // Timetable
  getTimetable: (token, sessionId, sectionId, dayOfWeek) => ipcRenderer.invoke('timetable:get-list', token, sessionId, sectionId, dayOfWeek),
  createTimetableEntry: (token, input) => ipcRenderer.invoke('timetable:create', token, input),
  validateTimetableEntry: (token, input) => ipcRenderer.invoke('timetable:validate', token, input),
  deleteTimetableEntry: (token, entryId) => ipcRenderer.invoke('timetable:delete', token, entryId),

  // Expenses & Accounts
  getExpenses: (token, query) => ipcRenderer.invoke('expenses:get-list', token, query),
  getExpenseSummary: (token, startDate, endDate) => ipcRenderer.invoke('expenses:get-summary', token, startDate, endDate),
  getVoucherDetails: (token, expenseId) => ipcRenderer.invoke('expenses:get-voucher', token, expenseId),
  createExpense: (token, input) => ipcRenderer.invoke('expenses:create', token, input),

  // Payroll
  saveSalaryStructure: (token, input) => ipcRenderer.invoke('payroll:save-salary-structure', token, input),
  getSalaryStructure: (token, employeeId) => ipcRenderer.invoke('payroll:get-salary-structure', token, employeeId),
  listSalaryStructures: (token) => ipcRenderer.invoke('payroll:list-salary-structures', token),
  generatePayrollRun: (token, input) => ipcRenderer.invoke('payroll:generate-run', token, input),
  listPayrollRuns: (token) => ipcRenderer.invoke('payroll:list-runs', token),
  getPayrollRunDetails: (token, runId) => ipcRenderer.invoke('payroll:get-run-details', token, runId),
  markPayrollSlipPaid: (token, input) => ipcRenderer.invoke('payroll:mark-slip-paid', token, input),

  // Settings
  getSchoolSettings: (token) => ipcRenderer.invoke('settings:get-school', token),
  updateSchoolSettings: (token, input) => ipcRenderer.invoke('settings:update-school', token, input),

  // Reports
  getReport: (token, reportType, params) => ipcRenderer.invoke('reports:generate', token, reportType, params),
  exportPdfReport: (token, reportData) => ipcRenderer.invoke('reports:export-pdf', token, reportData),
  exportExcelReport: (token, reportData) => ipcRenderer.invoke('reports:export-excel', token, reportData),
  getSyncQueue: (token) => ipcRenderer.invoke('sync:get-queue', token),
  getSyncCenterData: (token: string) => ipcRenderer.invoke('sync:get-center-data', token),
  keepServerVersion: (token: string, input: any) => ipcRenderer.invoke('sync:keep-server-version', token, input),
  retryOutboxItem: (token: string, input: any) => ipcRenderer.invoke('sync:retry-outbox-item', token, input),
  getReceiptBlockStatus: (token: string, series?: string) => ipcRenderer.invoke('fees:get-receipt-block-status', token, series),
  issueOfflineReceipt: (token: string, series?: string) => ipcRenderer.invoke('fees:issue-offline-receipt', token, series),
  collectFeeOfflineSafe: (token: string, input: any) => ipcRenderer.invoke('fees:collect-offline-safe', token, input),
  reverseFeeOnlineOnly: (token: string, input: any) => ipcRenderer.invoke('fees:reverse-online-only', token, input),
  getMirrorRecords: (token: string, entityType: string) => ipcRenderer.invoke('sync:get-mirror-records', token, entityType),
  onlineRequest: (token: string, opts: any) => ipcRenderer.invoke('online:request', token, opts),
  listNotices: (token: string) => ipcRenderer.invoke('notices:list', token),
  createNotice: (token: string, input: any) => ipcRenderer.invoke('notices:create', token, input),
  getAuditLogs: (token) => ipcRenderer.invoke('audit:get-logs', token),

  // Licensing & Activation
  getLicenseStatus: (token) => ipcRenderer.invoke('license:get-status', token),
  activateLicense: (token, input) => ipcRenderer.invoke('license:activate', token, input),
  revalidateLicense: (token) => ipcRenderer.invoke('license:revalidate', token),
  deactivateLicense: (token) => ipcRenderer.invoke('license:deactivate', token),
  checkFeatureEntitlement: (token, featureKey) => ipcRenderer.invoke('license:check-feature', token, featureKey),

  // Automated Backups & Restoration
  getBackupDestinations: (token) => ipcRenderer.invoke('backup:get-destinations', token),
  updateBackupDestination: (token, input) => ipcRenderer.invoke('backup:update-destination', token, input),
  createBackup: (token, input) => ipcRenderer.invoke('backup:create', token, input),
  verifyBackupFile: (token, input) => ipcRenderer.invoke('backup:verify-file', token, input),
  restoreBackup: (token, input) => ipcRenderer.invoke('backup:restore', token, input),
  getBackupHistory: (token, limit) => ipcRenderer.invoke('backup:get-history', token, limit),

  // Application Updates & Release Management
  getUpdateStatus: (token) => ipcRenderer.invoke('update:get-status', token),
  checkForUpdates: (token, endpointOverride) => ipcRenderer.invoke('update:check', token, endpointOverride),
  downloadUpdate: (token, urlOverride) => ipcRenderer.invoke('update:download', token, urlOverride),
  installUpdate: (token, options) => ipcRenderer.invoke('update:install', token, options),
  setUpdateChannel: (token, channel) => ipcRenderer.invoke('update:set-channel', token, channel),
  cancelUpdateDownload: (token) => ipcRenderer.invoke('update:cancel-download', token),

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Subscription & Security Events
  onSubscriptionStatusChanged: (callback: (status: any) => void) => {
    const handler = (_: any, status: any) => callback(status);
    ipcRenderer.on('subscription:status-changed', handler);
    return () => {
      ipcRenderer.removeListener('subscription:status-changed', handler);
    };
  },
};

contextBridge.exposeInMainWorld('desktopAPI', api);
