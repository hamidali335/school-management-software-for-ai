import Database from 'better-sqlite3';
import { AttendanceRepository, AttendanceEntry } from '../database/repositories/attendance.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { recordChange } from '../sync/change-tracker';

export class AttendanceService {
  private attendanceRepo: AttendanceRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.attendanceRepo = new AttendanceRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
  }

  public recordDailyAttendance(
    session: ValidatedSession,
    entries: {
      id: string;
      studentId: string;
      sessionId: string;
      classId: string;
      sectionId: string;
      date: string;
      status: 'present' | 'absent' | 'late' | 'leave';
      remarks?: string | null;
    }[]
  ): { recordedCount: number } {
    RbacService.assertPermission(session, 'attendance:mark');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const runTx = this.db.transaction(() => {
      for (const entry of entries) {
        // Class eligibility verification: student must be actively enrolled
        const isEnrolled = this.attendanceRepo.isStudentEnrolled(
          schoolId,
          entry.studentId,
          entry.sessionId,
          entry.classId
        );

        if (!isEnrolled) {
          throw new Error(
            `Attendance Error: Student ${entry.studentId} is not actively enrolled in Class ${entry.classId}.`
          );
        }

        this.attendanceRepo.recordAttendance({
          ...entry,
          schoolId,
        });

        recordChange('ATTENDANCE', entry.id, 'INSERT', {
          ...entry,
          schoolId,
        }, this.db);
      }

      this.auditRepo.log({
        schoolId,
        userId: session.userId,
        action: 'ATTENDANCE_ROLLCALL_RECORDED',
        module: 'ATTENDANCE',
        details: { count: entries.length, date: entries[0]?.date },
        performedBy: session.userName || 'Staff',
      });

      return { recordedCount: entries.length };
    });

    return runTx();
  }

  public correctAttendance(
    session: ValidatedSession,
    attendanceId: string,
    newStatus: 'present' | 'absent' | 'late' | 'leave',
    reason: string
  ) {
    RbacService.assertPermission(session, 'attendance:mark');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const result = this.attendanceRepo.correctAttendance(schoolId, attendanceId, newStatus, reason);

    recordChange('ATTENDANCE', attendanceId, 'UPDATE', {
      id: attendanceId,
      status: newStatus,
      correctionReason: reason,
    }, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'ATTENDANCE_CORRECTED',
      module: 'ATTENDANCE',
      details: { attendanceId, oldStatus: result.oldStatus, newStatus, reason },
      performedBy: session.userName || 'Staff / Principal',
    });

    return result;
  }

  public getStudentAttendanceHistory(session: ValidatedSession, studentId: string, sessionId?: string) {
    RbacService.assertPermission(session, 'attendance:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.attendanceRepo.getStudentAttendanceHistory(schoolId, studentId, sessionId);
  }

  public getAttendanceSummary(session: ValidatedSession, date: string) {
    RbacService.assertPermission(session, 'attendance:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.attendanceRepo.getSummary(schoolId, date);
  }

  public getAttendanceByDateAndClass(session: ValidatedSession, date: string, classId?: string) {
    RbacService.assertPermission(session, 'attendance:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.attendanceRepo.getByDateAndClass(schoolId, date, classId);
  }
}
