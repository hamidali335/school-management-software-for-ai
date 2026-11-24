import os from 'node:os';
import { ipcMain, app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import crypto from 'node:crypto';
import { PasswordHasher } from '../security/password-hasher';
import { getDatabase, getDatabaseStatus, getDashboardMetrics, createLocalBackup, getDatabasePath, runIntegrityCheck } from '../database/connection';
import { syncManagerInstance } from '../sync/sync-manager';
import { AuthService } from '../services/auth.service';
import { StudentService } from '../services/student.service';
import { AttendanceService } from '../services/attendance.service';
import { FeeService } from '../services/fee.service';
import { InstallationService } from '../services/installation.service';
import { RbacService } from '../services/rbac.service';
import { AuditRepository } from '../database/repositories/audit.repository';
import { ExamService } from '../services/exam.service';
import { TimetableService } from '../services/timetable.service';
import { ExpenseService } from '../services/expense.service';
import { EmployeeService } from '../services/employee.service';
import { AcademicService } from '../services/academic.service';
import { ReportService } from '../services/report.service';
import { PayrollService } from '../services/payroll.service';
import { SettingsService } from '../services/settings.service';
import { LicenseService } from '../services/license.service';
import { BackupService } from '../services/backup.service';
import { UpdateService, UpdateChannel } from '../services/update.service';
import { DeviceFingerprint } from '../security/device-fingerprint';
import { OnlineSyncDispatcher } from '../sync/online-sync-dispatcher';
import { SubscriptionEnforcer } from '../services/subscription-enforcer';
import { DatabaseKeyManager } from '../security/database-key-manager';
import { CredentialVault } from '../security/credential-vault';
import { CloudTokenManager } from '../security/cloud-token-manager';
import { SessionManager } from '../security/session-manager';
import { DeploymentConfigService } from '../services/deployment-config';
import { ReceiptBlockManager } from '../sync/receipt-block-manager';
import { WriteCoordinator } from '../sync/write-coordinator';
import { OnlineModuleProxyService } from '../services/online-module-proxy.service';

import {
  LoginInputSchema,
  InitialAdminProvisioningSchema,
  ChangePasswordInputSchema,
} from '../../shared/schemas/auth.schema';
import {
  AdmitStudentInputSchema,
  StudentListQuerySchema,
  ArchiveStudentInputSchema,
  PromoteStudentInputSchema,
  ReplaceGuardianInputSchema,
  BulkPromoteStudentsInputSchema,
} from '../../shared/schemas/student.schema';
import { RecordAttendanceInputSchema, CorrectAttendanceInputSchema } from '../../shared/schemas/attendance.schema';
import {
  CollectPaymentInputSchema,
  ReversePaymentInputSchema,
  CreateInvoiceInputSchema,
  CancelInvoiceInputSchema,
  CreateFeeStructureSchema,
  CreateConcessionSchema,
  BulkGenerateInvoicesSchema,
} from '../../shared/schemas/fee.schema';
import { CreateClassSchema, CreateSessionSchema } from '../../shared/schemas/academic.schema';
import { CreateExamSchema, CreateExamPaperSchema, RecordMarksSchema, SaveGradingScalesSchema } from '../../shared/schemas/exam.schema';
import { CreateTimetableEntrySchema } from '../../shared/schemas/timetable.schema';
import { CreateExpenseSchema } from '../../shared/schemas/expense.schema';
import { CreateEmployeeSchema, RecordStaffAttendanceSchema, CreateStaffUserAccountSchema } from '../../shared/schemas/employee.schema';
import { SaveSalaryStructureSchema, GeneratePayrollRunSchema, MarkPayrollSlipPaidSchema } from '../../shared/schemas/payroll.schema';
import { UpdateSchoolSettingsSchema } from '../../shared/schemas/settings.schema';
import { ResolveConflictInputSchema, SetRemoteBackendUrlSchema } from '../../shared/schemas/sync.schema';
import { AppInfo } from '../../shared/types';

export function registerIpcHandlers(): void {
  const db = getDatabase();
  const authService = new AuthService(db);
  const studentService = new StudentService(db);
  const attendanceService = new AttendanceService(db);
  const feeService = new FeeService(db);
  const installService = new InstallationService(db);
  const auditRepo = new AuditRepository(db);
  const examService = new ExamService(db);
  const timetableService = new TimetableService(db);
  const expenseService = new ExpenseService(db);
  const employeeService = new EmployeeService(db);
  const academicService = new AcademicService(db);
  const reportService = new ReportService(db);
  const payrollService = new PayrollService(db);
  const settingsService = new SettingsService(db);
  const licenseService = new LicenseService(db);
  const backupService = new BackupService(db, getDatabasePath());
  const updateService = new UpdateService(
    db,
    getDatabasePath(),
    backupService,
    (typeof app !== 'undefined' && app.getVersion) ? app.getVersion() : '1.0.0'
  );
  const onlineDispatcher = new OnlineSyncDispatcher(db);

  // Helper to validate session or throw
  function requireSession(token: string) {
    if (!token || typeof token !== 'string') {
      throw new Error('Authentication required: Missing session token');
    }
    const session = authService.validateSession(token);
    if (!session.isValid) {
      throw new Error(session.reason || 'Authentication required: Invalid or expired session');
    }
    return session;
  }

  // --- 1. App & Platform Info ---
  ipcMain.handle('app:get-info', async (): Promise<AppInfo> => {
    return {
      name: 'School Management Software',
      version: '1.0.0',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron || '41.2.1',
      nodeVersion: process.versions.node || '24.21.0',
      chromeVersion: process.versions.chrome || '134.0.0.0',
      userDataPath: app.getPath('userData'),
      dbPath: getDatabasePath(),
    };
  });

  // --- 2. Database Diagnostics & Integrity (Protected) ---
  ipcMain.handle('db:get-status', async (_, token: string) => {
    requireSession(token);
    return getDatabaseStatus();
  });

  ipcMain.handle('db:integrity-check', async (_, token: string) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'school:settings');
    return runIntegrityCheck();
  });

  ipcMain.handle('db:backup', async (_, token: string) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'database:backup');
    return createLocalBackup();
  });

  ipcMain.handle('db:create-verified-backup', async (_, token: string, targetDir?: string) => {
    const session = requireSession(token);
    try {
      const data = await settingsService.createVerifiedBackup(session, targetDir);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 3. Authentication & Sessions ---
  ipcMain.handle('auth:get-status', async () => {
    return authService.getProvisioningStatus();
  });

  ipcMain.handle('auth:provision-initial-admin', async (_, input) => {
    const parse = InitialAdminProvisioningSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid provisioning input' };
    }
    try {
      const result = await authService.provisionInitialAdmin(parse.data);
      return { success: true, adminUser: result.adminUser };
    } catch (err: any) {
      return { success: false, error: err.message || 'Initial administrator provisioning failed' };
    }
  });

  ipcMain.handle('auth:login', async (_, input) => {
    const parse = LoginInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid input credentials' };
    }
    try {
      const result = await authService.loginOnlineFirst(parse.data);
      return {
        success: true,
        user: result.user,
        token: result.token,
        schoolName: result.schoolName,
        isOnline: result.isOnline,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  });

  ipcMain.handle('auth:change-password', async (_, token: string, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('auth:manage');
    const parse = ChangePasswordInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid password change input' };
    }
    try {
      const result = await authService.changePassword(
        session.userId!,
        session.schoolId!,
        parse.data.currentPassword,
        parse.data.newPassword,
        token
      );
      return result;
    } catch (err: any) {
      return { success: false, error: err.message || 'Password change failed' };
    }
  });

  ipcMain.handle('auth:logout', async (_, token) => {
    const success = authService.logout(token);
    return { success };
  });

  ipcMain.handle('auth:get-session', async (_, token) => {
    const session = authService.validateSession(token);
    if (!session.isValid) {
      return { isValid: false, reason: session.reason };
    }
    return {
      isValid: true,
      user: {
        id: session.userId,
        schoolId: session.schoolId!,
        name: session.userName,
        email: session.userEmail,
        role: session.role,
        permissions: session.permissions,
        status: session.userStatus,
      },
    };
  });

  // --- 4. Synchronization ---
  ipcMain.handle('sync:get-status', async (_, token: string) => {
    requireSession(token);
    return syncManagerInstance.getStatus();
  });

  ipcMain.handle('sync:trigger', async (_, token: string) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'sync:trigger');
    return syncManagerInstance.triggerSync();
  });

  ipcMain.handle('sync:get-queue', async (_, token: string) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'school:settings');
    return db.prepare('SELECT * FROM sync_outbox WHERE school_id = ? ORDER BY id DESC LIMIT 50').all(session.schoolId);
  });

  ipcMain.handle('sync:list-conflicts', async (_, token: string, status?: 'unresolved' | 'resolved') => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'school:settings');
    return syncManagerInstance.listConflicts(status);
  });

  ipcMain.handle('sync:resolve-conflict', async (_, token: string, input: any) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'school:settings');
    const parse = ResolveConflictInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid conflict resolution data' };
    }
    try {
      syncManagerInstance.resolveConflict(
        parse.data.conflictId,
        parse.data.strategy,
        session.userName || 'Administrator',
        parse.data.notes,
        parse.data.customPayload
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sync:get-history', async (_, token: string, limit?: number) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'school:settings');
    return syncManagerInstance.getSyncHistory(limit || 20);
  });

  ipcMain.handle('sync:set-backend-url', async (_, token: string, url: string) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('school:settings');
    RbacService.assertPermission(session, 'school:settings');
    const parse = SetRemoteBackendUrlSchema.safeParse({ url });
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid backend URL' };
    }
    try {
      DeploymentConfigService.setRuntimeUrl(db, parse.data.url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- Technician & Deployment Configuration (Secure Admin/Engineer Access) ---
  ipcMain.handle('technician:verify-access', async (_, passkey: string) => {
    return DeploymentConfigService.verifyTechnicianKey(passkey, db);
  });

  ipcMain.handle('technician:get-config', async (_, techToken: string) => {
    return DeploymentConfigService.getDeploymentConfig(techToken, db);
  });

  ipcMain.handle('technician:set-backend-url', async (_, techToken: string, url: string) => {
    return DeploymentConfigService.setDeploymentConfig(techToken, url, db);
  });

  // --- 5. Dashboard Metrics (Protected) ---
  ipcMain.handle('metrics:get-dashboard', async (_, token: string) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'dashboard:read');
    return getDashboardMetrics();
  });

  // --- 6. Students & Admissions ---
  ipcMain.handle('students:get-list', async (_, token: string, query?: any) => {
    const session = requireSession(token);
    const parse = StudentListQuerySchema.safeParse(query);
    const sanitizedQuery = parse.success ? parse.data : undefined;
    return studentService.listStudents(session, sanitizedQuery);
  });

  ipcMain.handle('students:update', async (_, token: string, studentId: string, patch: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('students:manage');
    try {
      const updated = studentService.updateStudent(session, studentId, patch);
      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update student' };
    }
  });

  ipcMain.handle('academics:list-subjects', async (_, token: string) => {
    const session = requireSession(token);
    return academicService.listSubjects(session);
  });

  ipcMain.handle('academics:create-subject', async (_, token: string, input: { id?: string; name: string; code: string; type?: 'core' | 'elective' }) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('academics:manage');
    try {
      const id = input.id || `sub_${crypto.randomUUID().slice(0, 12)}`;
      const created = academicService.createSubject(session, { id, name: input.name, code: input.code, type: input.type });
      return { success: true, data: created };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to create subject' };
    }
  });

  ipcMain.handle('academics:delete-subject', async (_, token: string, subjectId: string) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('academics:manage');
    try {
      return academicService.deleteSubject(session, subjectId);
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to delete subject' };
    }
  });

  ipcMain.handle('students:get-profile', async (_, token: string, studentId: string) => {
    const session = requireSession(token);
    return studentService.getStudentProfile(session, studentId);
  });

  ipcMain.handle('students:admit', async (_, token, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('students:create');
    const parse = AdmitStudentInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid admission data' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'STUDENT',
        entityId: parse.data.id,
        operation: 'INSERT',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => studentService.admitStudent(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('students:replace-guardian', async (_, token, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('students:edit');
    const parse = ReplaceGuardianInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid guardian replacement data' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'STUDENT_GUARDIAN',
        entityId: parse.data.studentId,
        operation: 'UPDATE',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => studentService.replaceGuardian(session, parse.data.studentId, parse.data.guardian, parse.data.reason),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('students:archive', async (_, token, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('students:delete');
    const parse = ArchiveStudentInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid archival data' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'STUDENT',
        entityId: parse.data.studentId,
        operation: 'UPDATE',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => studentService.archiveStudent(session, parse.data.studentId, parse.data.status, parse.data.reason),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('students:promote', async (_, token, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('students:edit');
    const parse = PromoteStudentInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid promotion data' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'STUDENT_PROMOTION',
        entityId: parse.data.studentId,
        operation: 'UPDATE',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => studentService.promoteStudent(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('students:bulk-promote', async (_, token, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('students:edit');
    const parse = BulkPromoteStudentsInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid bulk promotion data' };
    }
    try {
      const promotions = parse.data.studentIds.map(studentId => ({
        studentId,
        targetSessionId: parse.data.targetSessionId,
        targetClassId: parse.data.targetClassId,
        targetSectionId: parse.data.targetSectionId,
      }));
      const bulkId = `bp_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'STUDENT_BULK_PROMOTION',
        entityId: bulkId,
        operation: 'UPDATE',
        payload: { bulkId, promotions },
        schoolId: session.schoolId!,
        executeLocal: () => studentService.bulkPromoteStudents(session, promotions),
      });
      return { success: true, promotedCount: dispatchRes.result?.promotedCount ?? 0, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 7. Academics: Classes & Sessions ---
  ipcMain.handle('classes:get-list', async (_, token: string) => {
    const session = requireSession(token);
    return academicService.listClasses(session);
  });

  ipcMain.handle('sessions:get-list', async (_, token: string) => {
    const session = requireSession(token);
    return academicService.listSessions(session);
  });

  ipcMain.handle('sessions:create', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('academics:manage');
    const parse = CreateSessionSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid session data' };
    }
    try {
      const sessionId = `ses_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'ACADEMIC_SESSION',
        entityId: sessionId,
        operation: 'INSERT',
        payload: { ...parse.data, id: sessionId },
        schoolId: session.schoolId!,
        executeLocal: () => academicService.createSession(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('classes:create', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('academics:manage');
    const parse = CreateClassSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid class data' };
    }
    try {
      const classId = `cls_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'CLASS',
        entityId: classId,
        operation: 'INSERT',
        payload: { ...parse.data, id: classId },
        schoolId: session.schoolId!,
        executeLocal: () => academicService.createClass(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 8. Attendance ---
  ipcMain.handle('attendance:get-summary', async (_, token: string, date?: string) => {
    const session = requireSession(token);
    const parseDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional().safeParse(date);
    const targetDate = (parseDate.success && parseDate.data) ? parseDate.data : new Date().toISOString().split('T')[0];
    return attendanceService.getAttendanceSummary(session, targetDate);
  });

  ipcMain.handle('attendance:get-by-date-class', async (_, token: string, date: string, classId?: string) => {
    const session = requireSession(token);
    return attendanceService.getAttendanceByDateAndClass(session, date, classId);
  });

  ipcMain.handle('attendance:record', async (_, token, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('attendance:mark');
    const parse = RecordAttendanceInputSchema.safeParse({ entries: input });
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid attendance payload' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'ATTENDANCE',
        entityId: `att_batch_${Date.now()}`,
        operation: 'INSERT',
        payload: { entries: parse.data.entries },
        schoolId: session.schoolId!,
        executeLocal: () => attendanceService.recordDailyAttendance(session, parse.data.entries),
      });
      return { success: true, recordedCount: (dispatchRes.result as any).recordedCount, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('attendance:correct', async (_, token, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('attendance:mark');
    const parse = CorrectAttendanceInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid attendance correction request' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'ATTENDANCE_CORRECTION',
        entityId: parse.data.attendanceId,
        operation: 'UPDATE',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => attendanceService.correctAttendance(
          session,
          parse.data.attendanceId,
          parse.data.newStatus,
          parse.data.reason
        ),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('attendance:student-history', async (_, token: string, studentId: string, sessionId?: string) => {
    const session = requireSession(token);
    return attendanceService.getStudentAttendanceHistory(session, studentId, sessionId);
  });

  // --- 9. Fees, Invoicing & Concessions ---
  ipcMain.handle('fees:get-summary', async (_, token, month?: string) => {
    const session = requireSession(token);
    return feeService.getFeeSummary(session, month);
  });

  ipcMain.handle('fees:get-invoices', async (_, token: string, month?: string) => {
    const session = requireSession(token);
    const parseMonth = z.string().max(50).optional().safeParse(month);
    const targetMonth = (parseMonth.success && parseMonth.data) ? parseMonth.data : undefined;
    return feeService.listInvoices(session, targetMonth);
  });

  ipcMain.handle('fees:get-invoice-details', async (_, token: string, invoiceId: string) => {
    const session = requireSession(token);
    return feeService.getInvoiceDetails(session, invoiceId);
  });

  ipcMain.handle('fees:get-defaulters', async (_, token: string, minBalance?: number, month?: string) => {
    const session = requireSession(token);
    return feeService.getDefaulters(session, minBalance, month);
  });

  ipcMain.handle('fees:create-invoice', async (_, token, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('fees:manage');
    const parse = CreateInvoiceInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid invoice data' };
    }
    try {
      const feeRepo = new (await import('../database/repositories/fee.repository')).FeeRepository(db);
      const challanNo = parse.data.challanNumber || `CHL-${Date.now().toString().slice(-6)}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'INVOICE',
        entityId: challanNo,
        operation: 'INSERT',
        payload: { ...parse.data, challanNumber: challanNo },
        schoolId: session.schoolId!,
        executeLocal: () => {
          return feeRepo.createInvoice({
            ...parse.data,
            challanNumber: challanNo,
            schoolId: session.schoolId!,
            paidAmount: 0,
            balance: parse.data.amount + (parse.data.previousDues || 0),
            status: 'unpaid',
          });
        },
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fees:cancel-invoice', async (_, token, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('fees:manage');
    const parse = CancelInvoiceInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid cancellation data' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'INVOICE',
        entityId: parse.data.invoiceId,
        operation: 'UPDATE',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => feeService.cancelInvoice(session, parse.data.invoiceId, parse.data.reason),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fees:collect', async (_, token, input) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('fees:collect');
    const parse = CollectPaymentInputSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid fee payment payload' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'PAYMENT',
        entityId: parse.data.receiptNumber || `REC-${Date.now().toString().slice(-6)}`,
        operation: 'INSERT',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => feeService.collectFeePayment(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fees:reverse', async (_, token, paymentId, reason) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('fees:reverse');
    const parse = ReversePaymentInputSchema.safeParse({ paymentId, reason });
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid reversal request' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'PAYMENT_REVERSAL',
        entityId: parse.data.paymentId,
        operation: 'UPDATE',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => feeService.reverseFeePayment(session, parse.data.paymentId, parse.data.reason),
      });
      return { success: true, restoredBalance: dispatchRes.result?.restoredBalance ?? 0, reversalPaymentId: dispatchRes.result?.reversalPaymentId ?? null, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fees:get-structures', async (_, token: string, sessionId?: string) => {
    const session = requireSession(token);
    return feeService.listFeeStructures(session, sessionId);
  });

  ipcMain.handle('fees:create-structure', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('fees:manage');
    const parse = CreateFeeStructureSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid fee structure data' };
    }
    try {
      const fsId = `fs_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'FEE_STRUCTURE',
        entityId: fsId,
        operation: 'INSERT',
        payload: { ...parse.data, id: fsId },
        schoolId: session.schoolId!,
        executeLocal: () => feeService.createFeeStructure(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fees:get-concessions', async (_, token: string, studentId?: string) => {
    const session = requireSession(token);
    return feeService.listConcessions(session, studentId);
  });

  ipcMain.handle('fees:create-concession', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('fees:manage');
    const parse = CreateConcessionSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid concession data' };
    }
    try {
      const concId = `conc_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'FEE_CONCESSION',
        entityId: concId,
        operation: 'INSERT',
        payload: { ...parse.data, id: concId },
        schoolId: session.schoolId!,
        executeLocal: () => feeService.createConcession(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fees:revoke-concession', async (_, token: string, concessionId: string) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('fees:manage');
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'FEE_CONCESSION',
        entityId: concessionId,
        operation: 'UPDATE',
        payload: { concessionId, status: 'revoked' },
        schoolId: session.schoolId!,
        executeLocal: () => feeService.revokeConcession(session, concessionId),
      });
      return { success: dispatchRes.result?.success ?? true, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('fees:bulk-generate', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('fees:manage');
    const parse = BulkGenerateInvoicesSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid invoice generation request' };
    }
    try {
      const bulkId = `bg_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'INVOICE_BULK_GENERATION',
        entityId: bulkId,
        operation: 'INSERT',
        payload: { ...parse.data, bulkId },
        schoolId: session.schoolId!,
        executeLocal: () => feeService.bulkGenerateInvoices(session, parse.data),
      });
      return {
        success: true,
        generatedCount: dispatchRes.result?.generatedCount ?? 0,
        skippedCount: dispatchRes.result?.skippedCount ?? 0,
        syncStatus: dispatchRes.syncStatus,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 10. Examinations, Grading & Gazette ---
  ipcMain.handle('exams:get-list', async (_, token: string, sessionId?: string) => {
    const session = requireSession(token);
    return examService.listExams(session, sessionId);
  });

  ipcMain.handle('exams:create', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('exams:manage');
    const parse = CreateExamSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid exam data' };
    }
    try {
      const examId = `ex_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'EXAM',
        entityId: examId,
        operation: 'INSERT',
        payload: { ...parse.data, id: examId },
        schoolId: session.schoolId!,
        executeLocal: () => examService.createExam(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('exams:publish', async (_, token: string, examId: string) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('exams:manage');
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'EXAM',
        entityId: examId,
        operation: 'UPDATE',
        payload: { examId, isPublished: true },
        schoolId: session.schoolId!,
        executeLocal: () => examService.publishExam(session, examId),
      });
      return { success: dispatchRes.result?.success ?? true, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('exams:get-papers', async (_, token: string, examId: string, classId?: string) => {
    const session = requireSession(token);
    return examService.listExamPapers(session, examId, classId);
  });

  ipcMain.handle('exams:create-paper', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('exams:manage');
    const parse = CreateExamPaperSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid paper data' };
    }
    try {
      const paperId = `paper_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'EXAM_PAPER',
        entityId: paperId,
        operation: 'INSERT',
        payload: { ...parse.data, id: paperId },
        schoolId: session.schoolId!,
        executeLocal: () => examService.createExamPaper(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('exams:get-marks', async (_, token: string, paperId: string) => {
    const session = requireSession(token);
    return examService.getMarksForPaper(session, paperId);
  });

  ipcMain.handle('exams:record-marks', async (_, token: string, examId: string, paperId: string, marks: any[]) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('exams:manage');
    const parse = RecordMarksSchema.safeParse({ examId, paperId, marks });
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid marks payload' };
    }
    try {
      const formattedMarks = parse.data.marks.map((m) => ({
        studentId: m.studentId,
        obtainedMarks: m.obtainedMarks ?? null,
        isAbsent: m.isAbsent,
        remarks: m.remarks ?? undefined,
      }));
      const marksEventId = `marks_${paperId}_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'EXAM_MARKS',
        entityId: marksEventId,
        operation: 'INSERT',
        payload: { examId: parse.data.examId, paperId: parse.data.paperId, marks: formattedMarks },
        schoolId: session.schoolId!,
        executeLocal: () => examService.recordMarks(session, parse.data.examId, parse.data.paperId, formattedMarks),
      });
      return { success: true, recordedCount: dispatchRes.result?.recordedCount ?? 0, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('exams:calculate-results', async (_, token: string, examId: string, classId: string) => {
    const session = requireSession(token);
    return examService.calculateExamResults(session, examId, classId);
  });

  ipcMain.handle('exams:report-card', async (_, token: string, examId: string, studentId: string) => {
    const session = requireSession(token);
    return examService.generateReportCard(session, examId, studentId);
  });

  ipcMain.handle('exams:get-grading-scales', async (_, token: string) => {
    const session = requireSession(token);
    return examService.getGradingScales(session);
  });

  ipcMain.handle('exams:save-grading-scales', async (_, token: string, scales: any[]) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('exams:manage');
    const parse = SaveGradingScalesSchema.safeParse({ scales });
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid grading scale data' };
    }
    try {
      const scaleId = `gs_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'GRADING_SCALE',
        entityId: scaleId,
        operation: 'UPDATE',
        payload: { scaleId, scales: parse.data.scales },
        schoolId: session.schoolId!,
        executeLocal: () => examService.saveGradingScales(session, parse.data.scales as any),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 11. Faculty & Staff & Staff Attendance ---
  ipcMain.handle('staff:get-list', async (_, token: string, query?: any) => {
    const session = requireSession(token);
    return employeeService.listEmployees(session, query);
  });

  ipcMain.handle('staff:create', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('staff:manage');
    const parse = CreateEmployeeSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid staff data' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'EMPLOYEE',
        entityId: parse.data.id,
        operation: 'INSERT',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => employeeService.createEmployee(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('staff:record-attendance', async (_, token: string, entries: any[]) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('staff:manage');
    const parse = RecordStaffAttendanceSchema.safeParse({ entries });
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid staff attendance data' };
    }
    try {
      const attId = `staff_att_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'STAFF_ATTENDANCE',
        entityId: attId,
        operation: 'INSERT',
        payload: { attId, entries: parse.data.entries },
        schoolId: session.schoolId!,
        executeLocal: () => employeeService.recordStaffAttendance(session, parse.data.entries),
      });
      return { success: true, recordedCount: dispatchRes.result?.recordedCount ?? 0, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('staff:get-attendance', async (_, token: string, date: string) => {
    const session = requireSession(token);
    return employeeService.getStaffAttendanceByDate(session, date);
  });

  ipcMain.handle('staff:get-attendance-summary', async (_, token: string, date: string) => {
    const session = requireSession(token);
    return employeeService.getStaffAttendanceSummary(session, date);
  });

  ipcMain.handle('staff:create-user-account', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('staff:manage');
    RbacService.assertPermission(session, 'school:settings');
    const parse = CreateStaffUserAccountSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid user provisioning data' };
    }
    try {
      const userRepo = new (await import('../database/repositories/user.repository')).UserRepository(db);
      const hashResult = await PasswordHasher.hashPasswordAsync(parse.data.password);
      const userId = `usr_${crypto.randomBytes(6).toString('hex')}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'STAFF_USER_ACCOUNT',
        entityId: userId,
        operation: 'INSERT',
        payload: {
          id: userId,
          schoolId: session.schoolId!,
          username: parse.data.username,
          email: parse.data.email,
          name: parse.data.fullName || parse.data.username,
          role: parse.data.role,
          employeeId: parse.data.employeeId,
        },
        schoolId: session.schoolId!,
        executeLocal: () => {
          const user = userRepo.createUser({
            id: userId,
            schoolId: session.schoolId!,
            username: parse.data.username,
            email: parse.data.email,
            name: parse.data.fullName || parse.data.username,
            passwordHash: hashResult.hash,
            salt: hashResult.salt,
            role: parse.data.role as any,
            permissions: [],
          });
          db.prepare('UPDATE users SET employee_id = ? WHERE school_id = ? AND id = ?').run(
            parse.data.employeeId,
            session.schoolId,
            userId
          );
          return { id: user.id, username: user.username, role: user.role };
        },
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 12. Timetable ---
  ipcMain.handle('timetable:get-list', async (_, token: string, sessionId: string, sectionId: string, dayOfWeek?: number) => {
    const session = requireSession(token);
    return timetableService.listBySection(session, sessionId, sectionId, dayOfWeek);
  });

  ipcMain.handle('timetable:validate', async (_, token: string, input: any) => {
    const session = requireSession(token);
    return timetableService.validateEntry(session, input);
  });

  ipcMain.handle('timetable:create', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('timetable:manage');
    const parse = CreateTimetableEntrySchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid timetable data' };
    }
    try {
      const entryId = `tt_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'TIMETABLE_ENTRY',
        entityId: entryId,
        operation: 'INSERT',
        payload: { ...parse.data, id: entryId },
        schoolId: session.schoolId!,
        executeLocal: () => timetableService.createEntry(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('timetable:delete', async (_, token: string, entryId: string) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('timetable:manage');
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'TIMETABLE_ENTRY',
        entityId: entryId,
        operation: 'DELETE',
        payload: { entryId },
        schoolId: session.schoolId!,
        executeLocal: () => timetableService.deleteEntry(session, entryId),
      });
      return { success: dispatchRes.result?.success ?? true, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 13. Accounts, Expenses & Vouchers ---
  ipcMain.handle('expenses:get-list', async (_, token: string, query?: any) => {
    const session = requireSession(token);
    return expenseService.listExpenses(session, query);
  });

  ipcMain.handle('expenses:get-summary', async (_, token: string, startDate?: string, endDate?: string) => {
    const session = requireSession(token);
    return expenseService.getSummary(session, startDate, endDate);
  });

  ipcMain.handle('expenses:get-voucher', async (_, token: string, expenseId: string) => {
    const session = requireSession(token);
    return expenseService.getVoucherDetails(session, expenseId);
  });

  ipcMain.handle('expenses:create', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('expenses:manage');
    const parse = CreateExpenseSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid expense data' };
    }
    try {
      const expId = `exp_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'EXPENSE',
        entityId: expId,
        operation: 'INSERT',
        payload: { ...parse.data, id: expId },
        schoolId: session.schoolId!,
        executeLocal: () => expenseService.recordExpense(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 14. Payroll ---
  ipcMain.handle('payroll:save-salary-structure', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('payroll:manage');
    const parse = SaveSalaryStructureSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid salary structure data' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'SALARY_STRUCTURE',
        entityId: parse.data.employeeId,
        operation: 'UPDATE',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => payrollService.saveSalaryStructure(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('payroll:get-salary-structure', async (_, token: string, employeeId: string) => {
    const session = requireSession(token);
    return payrollService.getSalaryStructure(session, employeeId);
  });

  ipcMain.handle('payroll:list-salary-structures', async (_, token: string) => {
    const session = requireSession(token);
    return payrollService.listSalaryStructures(session);
  });

  ipcMain.handle('payroll:generate-run', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('payroll:manage');
    const parse = GeneratePayrollRunSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid payroll run request' };
    }
    try {
      const runId = `run_${Date.now()}`;
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'PAYROLL_RUN',
        entityId: runId,
        operation: 'INSERT',
        payload: { ...parse.data, id: runId },
        schoolId: session.schoolId!,
        executeLocal: () => payrollService.generatePayrollRun(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('payroll:list-runs', async (_, token: string) => {
    const session = requireSession(token);
    return payrollService.listPayrollRuns(session);
  });

  ipcMain.handle('payroll:get-run-details', async (_, token: string, runId: string) => {
    const session = requireSession(token);
    return payrollService.getPayrollRunDetails(session, runId);
  });

  ipcMain.handle('payroll:mark-slip-paid', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('payroll:manage');
    const parse = MarkPayrollSlipPaidSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid slip payment payload' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'PAYROLL_PAYMENT',
        entityId: parse.data.slipId,
        operation: 'UPDATE',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => payrollService.markSlipPaid(session, parse.data.slipId, parse.data.paymentMethod, parse.data.paymentReference),
      });
      return { success: dispatchRes.result?.success ?? true, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 15. Settings ---
  ipcMain.handle('settings:get-school', async (_, token: string) => {
    const session = requireSession(token);
    return settingsService.getSchoolSettings(session);
  });

  ipcMain.handle('settings:update-school', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('school:settings');
    const parse = UpdateSchoolSettingsSchema.safeParse(input);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid settings data' };
    }
    try {
      const dispatchRes = await onlineDispatcher.dispatchMutation({
        entityType: 'SCHOOL_SETTINGS',
        entityId: session.schoolId!,
        operation: 'UPDATE',
        payload: parse.data,
        schoolId: session.schoolId!,
        executeLocal: () => settingsService.updateSchoolSettings(session, parse.data),
      });
      return { success: true, data: dispatchRes.result, syncStatus: dispatchRes.syncStatus };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 16. Reports & Exports ---
  ipcMain.handle('reports:generate', async (_, token: string, reportType: string, params?: any) => {
    const session = requireSession(token);
    switch (reportType) {
      case 'student_roster':
        return reportService.getStudentRoster(session, params?.classId);
      case 'fee_defaulters':
        return reportService.getFeeDefaulters(session, params?.month);
      case 'attendance_register':
        return reportService.getAttendanceRegister(
          session,
          params?.startDate || new Date().toISOString().split('T')[0],
          params?.endDate || new Date().toISOString().split('T')[0],
          params?.classId
        );
      case 'staff_roster':
        return reportService.getStaffRoster(session);
      case 'net_operating_cash':
        return reportService.getNetOperatingCashReport(
          session,
          params?.startDate || new Date().toISOString().split('T')[0].substring(0, 7) + '-01',
          params?.endDate || new Date().toISOString().split('T')[0]
        );
      case 'exam_gazette':
        return reportService.getExamGazetteReport(session, params?.examId, params?.classId);
      default:
        throw new Error(`Report type "${reportType}" is not supported`);
    }
  });

  ipcMain.handle('reports:export-pdf', async (event, token: string, reportData: any) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'reports:read');
    const win = getValidSenderWindow(event);
    const defaultName = `${(reportData.title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    let targetPath = '';
    try {
      const saveRes = await dialog.showSaveDialog(win, {
        title: 'Export Official Report as PDF',
        defaultPath: path.join(app.getPath('documents') || app.getPath('downloads'), defaultName),
        filters: [{ name: 'PDF Document (*.pdf)', extensions: ['pdf'] }],
      });
      if (saveRes.canceled || !saveRes.filePath) {
        return { canceled: true, success: false };
      }
      targetPath = saveRes.filePath;
    } catch {
      targetPath = path.join(app.getPath('downloads'), defaultName);
    }

    const columns = reportData.columns || [];
    const rows = reportData.rows || [];
    const summary = reportData.summary || {};
    const title = reportData.title || 'Institutional Report';
    const subtitle = reportData.subtitle || '';
    const generatedAt = reportData.generatedAt ? new Date(reportData.generatedAt).toLocaleString() : new Date().toLocaleString();

    const summaryHtml = Object.entries(summary)
      .map(([k, v]) => `<span><strong>${k.replace(/([A-Z])/g, ' $1').toUpperCase()}:</strong> ${String(v)}</span>`)
      .join(' &bull; ');

    const tableHeaders = columns
      .map((c: any) => `<th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-align: ${c.align === 'right' ? 'right' : 'left'}; font-size: 11px; text-transform: uppercase; color: #475569;">${c.header}</th>`)
      .join('');

    const tableRows = rows
      .map((r: any, idx: number) => {
        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const cells = columns
          .map((c: any) => {
            const val = r[c.key] !== undefined && r[c.key] !== null ? String(r[c.key]) : '—';
            return `<td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: ${c.align === 'right' ? 'right' : 'left'}; font-size: 11px; color: #1e293b; font-family: ${c.align === 'right' ? 'monospace' : 'inherit'};">${val}</td>`;
          })
          .join('');
        return `<tr style="background-color: ${bg};">${cells}</tr>`;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm 15mm; }
          body { font-family: Arial, -apple-system, sans-serif; color: #0f172a; margin: 0; padding: 15px; }
          .header { border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
          .title { font-size: 18px; font-weight: bold; color: #1e1b4b; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 3px; }
          .meta { font-size: 10px; color: #94a3b8; text-align: right; }
          .summary-box { background: #f1f5f9; padding: 8px 12px; border-radius: 6px; font-size: 11px; margin-bottom: 14px; color: #334155; }
          table { width: 100%; border-collapse: collapse; margin-top: 5px; page-break-inside: auto; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          .footer { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${title}</div>
            <div class="subtitle">${subtitle}</div>
          </div>
          <div class="meta">
            <div><strong>School Management Software</strong></div>
            <div>Generated: ${generatedAt}</div>
          </div>
        </div>
        ${summaryHtml ? `<div class="summary-box">${summaryHtml}</div>` : ''}
        <table>
          <thead><tr>${tableHeaders}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="footer">
          <span>Official Institutional Document &bull; Verified Local Relational Ledger</span>
          <span>School Management Software Official Record</span>
        </div>
      </body>
      </html>
    `;

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const tempHtmlPath = path.join(os.tmpdir(), `sms-report-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    try {
      fs.writeFileSync(tempHtmlPath, html, 'utf8');
      await printWin.loadFile(tempHtmlPath);
      const pdfBuffer = await printWin.webContents.printToPDF({
        pageSize: 'A4',
        landscape: columns.length > 5,
        printBackground: true,
        margins: {
          marginType: 'printableArea',
        },
      });
      fs.writeFileSync(targetPath, pdfBuffer);
      return { success: true, filePath: targetPath };
    } catch (pdfErr: any) {
      return { success: false, error: 'Failed to export PDF document. Please try filtering by class or saving to a writable folder.' };
    } finally {
      printWin.close();
      try { if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath); } catch {}
    }
  });

  ipcMain.handle('reports:export-excel', async (event, token: string, reportData: any) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'reports:read');
    const win = getValidSenderWindow(event);
    const defaultName = `${(reportData.title || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;

    let targetPath = '';
    try {
      const saveRes = await dialog.showSaveDialog(win, {
        title: 'Export Official Report as Excel-Ready CSV',
        defaultPath: path.join(app.getPath('documents') || app.getPath('downloads'), defaultName),
        filters: [
          { name: 'Excel CSV (*.csv)', extensions: ['csv'] },
          { name: 'All Files (*.*)', extensions: ['*'] },
        ],
      });
      if (saveRes.canceled || !saveRes.filePath) {
        return { canceled: true, success: false };
      }
      targetPath = saveRes.filePath;
    } catch {
      targetPath = path.join(app.getPath('downloads'), defaultName);
    }

    const columns = reportData.columns || [];
    const rows = reportData.rows || [];
    const bom = '\uFEFF';
    const headerRow = columns.map((c: any) => `"${String(c.header).replace(/"/g, '""')}"`).join(',');
    const dataRows = rows.map((r: any) =>
      columns
        .map((c: any) => {
          const val = r[c.key] !== undefined && r[c.key] !== null ? String(r[c.key]) : '';
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(',')
    );

    const fullContent = bom + [headerRow, ...dataRows].join('\r\n');
    fs.writeFileSync(targetPath, fullContent, 'utf8');
    return { success: true, filePath: targetPath };
  });

  // --- 17. Audit Logs ---
  ipcMain.handle('audit:get-logs', async (_, token) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'school:settings');
    return auditRepo.getRecent(session.schoolId!, 50);
  });

  // --- 18. Licensing & Device Activation ---
  ipcMain.handle('license:get-status', async (_, token) => {
    requireSession(token);
    return licenseService.getStatus();
  });

  ipcMain.handle('license:activate', async (_, token, input) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'school:settings');
    const backendUrl = syncManagerInstance.getRemoteBackendUrl();
    const deviceId = (syncManagerInstance as any).syncEngine?.getDeviceConfig()?.deviceId;
    if (!deviceId) {
      return { success: false, error: 'Workstation must be registered to acquire a device ID before activation.' };
    }
    const hardwareFingerprint = DeviceFingerprint.getFingerprint();
    const deviceName = input?.deviceName || 'Workstation-Primary';

    let cloudJwt = CloudTokenManager.getAccessToken(db);
    if (!cloudJwt) cloudJwt = await CloudTokenManager.refreshAccessToken(db);
    if (!cloudJwt) {
      return { success: false, error: 'Cloud access token unavailable. Please sign in online first.' };
    }
    const response = await fetch(`${backendUrl}/licensing/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cloudJwt}`,
      },
      body: JSON.stringify({
        deviceId,
        hardwareFingerprint,
        deviceName,
        platform: 'windows_desktop',
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.data) {
      throw new Error(json.error?.message || json.message || 'License activation failed on server');
    }

    licenseService.storeLicense(json.data);
    return { success: true, data: json.data };
  });

  ipcMain.handle('license:revalidate', async (_, token) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'school:settings');
    const current = licenseService.getStatus();
    const backendUrl = syncManagerInstance.getRemoteBackendUrl();
    const deviceId = current.deviceId || 'desktop_ws';
    const hardwareFingerprint = DeviceFingerprint.getFingerprint();

    // Use the real cloud JWT stored in sync_device_config (never the local SQLite session token!)
    let cloudJwt = '';
    try {
      const dev = db
        .prepare('SELECT auth_token_encrypted FROM sync_device_config WHERE id = 1')
        .get() as { auth_token_encrypted?: string } | undefined;
      if (dev?.auth_token_encrypted) {
        cloudJwt = CredentialVault.decryptSecret(dev.auth_token_encrypted);
      }
    } catch {}

    if (!cloudJwt) {
      throw new Error('Please sign out and sign in online to refresh your cloud access token.');
    }

    // Try /licensing/verify first, fallback to /auth/me to confirm active cloud subscription
    let response = await fetch(`${backendUrl}/licensing/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cloudJwt}`,
      },
      body: JSON.stringify({
        licenseId: (current as any).licenseId || 'lic_active',
        deviceId,
        hardwareFingerprint,
      }),
    }).catch(() => null);

    let json: any = response ? await response.json().catch(() => null) : null;
    if (!response || !response.ok || !json?.data) {
      let meRes = await fetch(`${backendUrl}/auth/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cloudJwt}` },
      });
      if (meRes.status === 401) {
        const refreshed = await CloudTokenManager.refreshAccessToken(db);
        if (refreshed) {
          cloudJwt = refreshed;
          meRes = await fetch(`${backendUrl}/auth/me`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${cloudJwt}` },
          });
        }
      }
      const meJson: any = await meRes.json().catch(() => null);
      if (!meRes.ok || !meJson?.data) {
        throw new Error(meJson?.error?.message || 'Cloud session expired. Please sign out and sign in again.');
      }
      const subExpiry =
        meJson.data.school?.subscription?.expiresAt ||
        meJson.data.school?.subscription?.currentPeriodEnd ||
        new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      licenseService.storeLicense({
        licenseId: `cloud_session_${session.schoolId}`,
        schoolId: session.schoolId!,
        schoolName: meJson.data.school?.name || current.schoolName || 'School',
        schoolCode: meJson.data.school?.code || current.schoolCode || 'SCH',
        deviceId,
        hardwareFingerprint,
        planCode: meJson.data.school?.subscription?.planCode || 'cloud_active',
        planName: meJson.data.school?.subscription?.planName || 'Active Cloud Subscription',
        status: 'active',
        issuedAt: new Date().toISOString(),
        expiresAt: subExpiry,
        gracePeriodDays: 7,
        entitlements: ['*', 'core.backup', 'core.export'],
        limits: {},
        signedPayload: JSON.stringify({ schoolId: session.schoolId, deviceId }),
        signature: 'cloud_auth_verified',
        publicKey: 'cloud_auth_verified',
      });
      db.prepare("UPDATE license_cache SET clock_tampered = 0, last_server_verification = ?, last_observed_local_time = ? WHERE id = 1").run(
        new Date().toISOString(),
        new Date().toISOString(),
      );
      return { success: true, status: licenseService.getStatus() };
    }

    licenseService.storeLicense(json.data);
    return { success: true, data: json.data };
  });

  ipcMain.handle('license:deactivate', async (_, token) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'school:settings');
    const current = licenseService.getStatus();
    const backendUrl = syncManagerInstance.getRemoteBackendUrl();

    let cloudJwt = CloudTokenManager.getAccessToken(db);
    if (!cloudJwt) cloudJwt = await CloudTokenManager.refreshAccessToken(db);
    if (!cloudJwt) {
      throw new Error('Cloud access token unavailable. Please sign in online first.');
    }
    const response = await fetch(`${backendUrl}/licensing/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cloudJwt}`,
      },
      body: JSON.stringify({ deviceId: current.deviceId }),
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error?.message || 'Deactivation failed on server');
    }

    db.prepare('DELETE FROM license_cache').run();
    return { success: true };
  });

  ipcMain.handle('license:check-feature', async (_, token, featureKey) => {
    requireSession(token);
    const enabled = licenseService.isFeatureEnabled(featureKey);
    return { enabled };
  });

  // --- 19. Automated Multi-Destination Backups & Restoration ---
  ipcMain.handle('backup:get-destinations', async (_, token) => {
    requireSession(token);
    return backupService.getDestinationConfigs();
  });

  ipcMain.handle('backup:update-destination', async (_, token, input) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'system:manage');
    backupService.updateDestinationConfig(input);
    return { success: true };
  });

  ipcMain.handle('backup:create', async (_, token, input) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'system:manage');
    const entry = await backupService.createBackup({
      destinationType: input.destinationType,
      triggerType: input.triggerType,
      encryptionPassphrase: input.passphrase,
    });
    return { success: true, data: entry };
  });

  ipcMain.handle('backup:verify-file', async (_, token, input) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'system:manage');
    const preview = backupService.verifyBackupFile(input.filePath, input.passphrase);
    return { success: true, data: preview };
  });

  ipcMain.handle('backup:restore', async (_, token, input) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'system:manage');
    const result = await backupService.restoreBackup({
      backupFilePath: input.filePath,
      confirm: input.confirm,
      passphrase: input.passphrase,
    });
    return { success: true, data: result };
  });

  ipcMain.handle('backup:get-history', async (_, token, limit) => {
    requireSession(token);
    return backupService.listHistory(limit || 20);
  });

  // --- 20. Application Updates & Release Management ---
  ipcMain.handle('update:get-status', async (_, token) => {
    requireSession(token);
    return updateService.getStatus();
  });

  ipcMain.handle('update:check', async (_, token, endpointOverride?: string) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'system:manage');
    const update = await updateService.checkForUpdates(endpointOverride);
    return { success: true, data: update };
  });

  ipcMain.handle('update:download', async (_, token, urlOverride?: string) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'system:manage');
    const installerPath = await updateService.downloadUpdate(urlOverride);
    return { success: true, data: { installerPath } };
  });

  ipcMain.handle('update:install', async (_, token, options?: { silent?: boolean }) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'system:manage');
    const result = await updateService.prepareAndInstall(options);
    return { success: true, data: result };
  });

  ipcMain.handle('update:set-channel', async (_, token, channel: UpdateChannel) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'system:manage');
    updateService.setChannel(channel);
    return { success: true };
  });

  ipcMain.handle('update:cancel-download', async (_, token) => {
    const session = requireSession(token);
    RbacService.assertPermission(session, 'system:manage');
    updateService.cancelDownload();
    return { success: true };
  });

  // Helper to validate that IPC invoke events originate from a valid, non-destroyed application window
  function getValidSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      throw new Error('Access denied: Invalid or destroyed originating BrowserWindow');
    }
    return win;
  }

  // --- 18. Window Controls ---
  ipcMain.handle('window:minimize', async (event) => {
    const win = getValidSenderWindow(event);
    win.minimize();
  });

  ipcMain.handle('window:maximize', async (event) => {
    const win = getValidSenderWindow(event);
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle('window:close', async (event) => {
    const win = getValidSenderWindow(event);
    win.close();
  });

  // --- Slice 1 & 2: Sync Center & Offline Receipt/Payment Handlers ---
  const FINANCIAL_ENTITIES = new Set(['PAYMENT', 'INVOICE', 'FEE_PAYMENT', 'FEE_INVOICE']);
  const FINANCIAL_ROLES = new Set(['school_owner', 'principal', 'school_admin', 'accountant']);

  ipcMain.handle('sync:get-center-data', async (_, token: string) => {
    const session = requireSession(token);
    const outboxRows = db
      .prepare(`
        SELECT * FROM sync_outbox
        WHERE state IN ('pending', 'processing', 'retrying', 'needs_attention', 'conflict')
        ORDER BY created_at DESC
        LIMIT 200
      `)
      .all() as any[];

    const conflictRows = db
      .prepare(`
        SELECT * FROM sync_conflicts
        WHERE status = 'unresolved'
        ORDER BY created_at DESC
        LIMIT 200
      `)
      .all() as any[];

    const pending: any[] = [];
    const needsAttention: any[] = [];
    const conflicts: any[] = [];

    for (const r of outboxRows) {
      let payload: any = {};
      try { payload = JSON.parse(r.payload || '{}'); } catch {}
      const item = {
        id: r.operation_id || r.event_id || String(r.id),
        operationId: r.operation_id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        recordLabel: `${r.entity_type} #${r.entity_id}`,
        userName: session.userName || 'Staff',
        timestamp: r.created_at || '',
        plainError: r.last_error || (r.state === 'pending' ? 'Waiting for cloud synchronization' : 'Retrying synchronization'),
        localVersion: r.local_version || r.base_version || 1,
        serverVersion: null,
        localPayload: payload,
        state: r.state,
      };
      if (r.state === 'needs_attention') needsAttention.push(item);
      else if (r.state === 'conflict') conflicts.push(item);
      else pending.push(item);
    }

    for (const c of conflictRows) {
      let localPayload: any = {};
      let serverPayload: any = {};
      try { localPayload = JSON.parse(c.local_payload_json || c.local_payload || '{}'); } catch {}
      try { serverPayload = JSON.parse(c.remote_payload_json || c.remote_payload || '{}'); } catch {}
      conflicts.push({
        id: String(c.id),
        conflictId: String(c.id),
        entityType: c.entity_type,
        entityId: c.entity_id,
        recordLabel: `${c.entity_type} #${c.entity_id}`,
        userName: session.userName || 'Staff',
        timestamp: c.created_at || '',
        plainError: c.conflict_reason || 'Record modified on server and locally',
        localVersion: c.local_version || localPayload?.version || 1,
        serverVersion: c.remote_version || serverPayload?.version || null,
        localPayload,
        serverPayload,
        state: 'conflict',
      });
    }

    return { pending, needsAttention, conflicts };
  });

  ipcMain.handle('sync:keep-server-version', async (_, token: string, input: { conflictId?: string; operationId?: string; entityType: string }) => {
    const session = requireSession(token);
    if (FINANCIAL_ENTITIES.has((input.entityType || '').toUpperCase()) && !FINANCIAL_ROLES.has(session.role || '')) {
      return { success: false, error: 'Financial conflicts require an administrator or accountant.' };
    }
    if (input.conflictId) {
      try {
        syncManagerInstance.resolveConflict(input.conflictId, 'remote_wins', session.userName || 'Administrator', 'Kept server version via Sync Center');
      } catch {}
    }
    if (input.operationId) {
      db.prepare("UPDATE sync_outbox SET state = 'synced', last_error = NULL WHERE operation_id = ?").run(input.operationId);
    }
    return { success: true };
  });

  ipcMain.handle('sync:retry-outbox-item', async (_, token: string, input: { operationId?: string; conflictId?: string; entityType: string; customPayload?: any }) => {
    const session = requireSession(token);
    if (FINANCIAL_ENTITIES.has((input.entityType || '').toUpperCase()) && !FINANCIAL_ROLES.has(session.role || '')) {
      return { success: false, error: 'Financial conflicts require an administrator or accountant.' };
    }
    if (input.conflictId) {
      try {
        syncManagerInstance.resolveConflict(
          input.conflictId,
          input.customPayload ? 'merged' : 'local_wins',
          session.userName || 'Administrator',
          'Re-applied via Sync Center',
          input.customPayload,
        );
      } catch {}
    }
    if (input.operationId) {
      if (input.customPayload) {
        db.prepare("UPDATE sync_outbox SET payload_json = ?, state = 'retrying', status = 'retrying', attempt_count = 0, last_error = NULL WHERE operation_id = ?").run(
          JSON.stringify(input.customPayload),
          input.operationId,
        );
      } else {
        db.prepare("UPDATE sync_outbox SET state = 'retrying', status = 'retrying', attempt_count = 0, last_error = NULL WHERE operation_id = ?").run(
          input.operationId,
        );
      }
    }
    return { success: true };
  });

  ipcMain.handle('fees:get-receipt-block-status', async (_, token: string, series = 'default') => {
    const session = requireSession(token);
    const dev = db.prepare('SELECT device_id FROM sync_device_config WHERE id = 1').get() as { device_id?: string } | undefined;
    const rbm = new ReceiptBlockManager(db);
    return rbm.getStatus(session.schoolId!, dev?.device_id || 'WS01', series);
  });

  ipcMain.handle('fees:issue-offline-receipt', async (_, token: string, series = 'default') => {
    const session = requireSession(token);
    const dev = db.prepare('SELECT device_id FROM sync_device_config WHERE id = 1').get() as { device_id?: string } | undefined;
    const rbm = new ReceiptBlockManager(db);
    return rbm.issueNextReceiptNumber(session.schoolId!, dev?.device_id || 'WS01', series);
  });

  ipcMain.handle('fees:collect-offline-safe', async (_, token: string, input: any) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('fees:collect');
    const dev = db.prepare('SELECT device_id FROM sync_device_config WHERE id = 1').get() as { device_id?: string } | undefined;
    const rbm = new ReceiptBlockManager(db);
    const issued = rbm.issueNextReceiptNumber(session.schoolId!, dev?.device_id || 'WS01', input.series || 'default');
    const transactionId = input.transactionId || `txn_${crypto.randomUUID()}`;
    const coordinator = new WriteCoordinator(db);
    const dispatchRes = await coordinator.dispatchMutation({
      entityType: 'PAYMENT',
      entityId: transactionId,
      operation: 'INSERT',
      schoolId: session.schoolId!,
      payload: {
        ...input,
        transactionId,
        receiptNo: issued.receiptNo,
        isProvisional: issued.isProvisional,
        entryType: 'payment',
      },
      executeLocal: () => {
        if (input.invoiceId && Number(input.amount) > 0) {
          try {
            feeService.collectFeePayment(session, {
              id: transactionId,
              invoiceId: input.invoiceId,
              amount: Number(input.amount),
              paymentMethod: input.paymentMethod || 'cash',
              paymentDate: input.paymentDate || new Date().toISOString().slice(0, 10),
              receiptNumber: issued.receiptNo,
              notes: input.notes || (issued.isProvisional ? 'Offline provisional receipt' : undefined),
            } as any);
          } catch {}
        }
        return {
          transactionId,
          receiptNo: issued.receiptNo,
          isProvisional: issued.isProvisional,
          remainingInBlocks: issued.remainingInBlocks,
          needsRefill: issued.needsRefill,
        };
      },
    });
    return {
      success: true,
      ...dispatchRes.result,
      syncStatus: dispatchRes.syncStatus,
      operationId: dispatchRes.operationId,
    };
  });

  ipcMain.handle('fees:reverse-online-only', async (_, token: string, input: { paymentId: string; invoiceId: string; amount: number; reason: string }) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('fees:reverse');
    const status = syncManagerInstance.getStatus();
    if (status.network !== 'online') {
      return { success: false, error: 'Payment reversals are online-only. Please reconnect to the internet and try again.' };
    }
    const transactionId = `txn_rev_${crypto.randomUUID()}`;
    const coordinator = new WriteCoordinator(db);
    const res = await coordinator.dispatchMutation({
      entityType: 'PAYMENT',
      entityId: transactionId,
      operation: 'INSERT',
      schoolId: session.schoolId!,
      isOnline: true,
      payload: {
        transactionId,
        invoiceId: input.invoiceId,
        originalPaymentId: input.paymentId,
        entryType: 'reversal',
        amount: input.amount,
        reversalReason: input.reason,
      },
      executeLocal: () => ({ transactionId }),
    });
    return { success: true, transactionId, syncStatus: res.syncStatus };
  });


  // --- Slice 3 & 4: Offline Mirror Queries, Notices & Online-Only Cloud Proxy ---
  const onlineProxy = new OnlineModuleProxyService(db);

  ipcMain.handle('sync:get-mirror-records', async (_, token: string, entityType: string) => {
    const session = requireSession(token);
    if (session.role === 'teacher' && ['FEE_STRUCTURE', 'INVOICE', 'PAYMENT'].includes(entityType.toUpperCase())) {
      return [];
    }
    const rows = db
      .prepare('SELECT entity_id, payload_json, seq, updated_at FROM offline_mirror_cache WHERE school_id = ? AND entity_type = ? ORDER BY entity_id ASC')
      .all(session.schoolId!, entityType.toUpperCase()) as Array<{ entity_id: string; payload_json: string; seq: number; updated_at: string }>;
    return rows.map((r) => {
      try { return JSON.parse(r.payload_json); } catch { return { id: r.entity_id }; }
    });
  });

  const ALLOWED_ONLINE_PREFIXES = [
    '/admissions', '/parents', '/approvals', '/leave-requests',
    '/homework', '/certificate', '/communications',
    '/substitutes', '/subscription', '/students', '/employees',
    '/payroll', '/academics', '/classes', '/sections', '/subjects',
    '/fees', '/accounts', '/exams', '/timetable', '/school', '/settings',
    '/attendance', '/notices', '/dashboard',
  ];
  ipcMain.handle('online:request', async (_, token: string, opts: { method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; path: string; body?: any }) => {
    requireSession(token);
    const cleanPath = String(opts?.path || '');
    if (!ALLOWED_ONLINE_PREFIXES.some((prefix) => cleanPath.startsWith(prefix))) {
      return { ok: false, status: 403, error: 'Endpoint is not permitted through online module proxy.' };
    }
    if (opts.method !== 'GET') {
      licenseService.assertCanWrite('online:manage');
    }
    const status = syncManagerInstance.getStatus();
    return onlineProxy.request({
      ...opts,
      isOnline: status.network === 'online',
    });
  });

  ipcMain.handle('notices:list', async (_, token: string) => {
    const session = requireSession(token);
    const status = syncManagerInstance.getStatus();
    if (status.network === 'online') {
      const remote = await onlineProxy.request({ method: 'GET', path: '/communications/announcements', isOnline: true });
      if (remote.ok && Array.isArray(remote.data)) {
        const tx = db.transaction(() => {
          for (const n of remote.data) {
            db.prepare(`
              INSERT INTO notices_cache (id, school_id, title, body, audience_roles, status, published_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                body = excluded.body,
                status = excluded.status,
                published_at = excluded.published_at
            `).run(
              String(n._id || n.id),
              session.schoolId!,
              n.title || '',
              n.body || '',
              JSON.stringify(n.audience?.roles || []),
              n.status || 'published',
              n.publishedAt || null,
              n.createdAt || new Date().toISOString(),
            );
          }
        });
        tx();
        return remote.data;
      }
    }
    const cached = db
      .prepare('SELECT * FROM notices_cache WHERE school_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(session.schoolId!) as any[];
    return cached.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      audience: { roles: JSON.parse(r.audience_roles || '[]') },
      status: r.status,
      publishedAt: r.published_at,
      createdAt: r.created_at,
    }));
  });

  ipcMain.handle('notices:create', async (_, token: string, input: { title: string; body: string; roles: string[] }) => {
    const session = requireSession(token);
    licenseService.assertCanWrite('notices:manage');
    if (!['super_admin', 'school_owner', 'principal', 'admin'].includes(session.role || '')) {
      return { ok: false, status: 403, error: 'Only school administrators can publish notices.' };
    }
    if (!input?.title?.trim() || !input?.body?.trim()) {
      return { ok: false, status: 400, error: 'Notice title and message body are required.' };
    }
    const status = syncManagerInstance.getStatus();
    if (status.network !== 'online') {
      return { ok: false, status: 0, error: 'Publishing notices is online-only. Please reconnect to the internet.' };
    }
    return onlineProxy.request({
      method: 'POST',
      path: '/communications/announcements',
      isOnline: true,
      body: {
        title: input.title,
        body: input.body,
        audience: { roles: input.roles.length ? input.roles : ['teacher', 'parent'] },
        channels: ['in_app'],
      },
    });
  });

}
