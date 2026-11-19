import Database from 'better-sqlite3';
import { EmployeeRepository, EmployeeRecord, StaffAttendanceRecord } from '../database/repositories/employee.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { recordChange } from '../sync/change-tracker';

export class EmployeeService {
  private employeeRepo: EmployeeRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.employeeRepo = new EmployeeRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
  }

  public listEmployees(session: ValidatedSession, query?: { search?: string; status?: string; department?: string }) {
    RbacService.assertPermission(session, 'staff:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.employeeRepo.listEmployees(schoolId, query);
  }

  public getEmployeeById(session: ValidatedSession, id: string) {
    RbacService.assertPermission(session, 'staff:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.employeeRepo.findById(schoolId, id);
  }

  public createEmployee(session: ValidatedSession, data: Omit<EmployeeRecord, 'schoolId' | 'createdAt'>) {
    RbacService.assertPermission(session, 'staff:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const emp = this.employeeRepo.createEmployee({
      ...data,
      schoolId,
    });

    recordChange('EMPLOYEE', emp.id, 'INSERT', emp, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'STAFF_MEMBER_CREATED',
      module: 'STAFF',
      details: { employeeCode: emp.employeeCode, fullName: emp.fullName, designation: emp.designation },
      performedBy: session.userName || 'Principal / HR',
    });

    return emp;
  }

  // ----------------------------------------------------------------------
  // STAFF DAILY ATTENDANCE
  // ----------------------------------------------------------------------

  public recordStaffAttendance(
    session: ValidatedSession,
    entries: {
      id: string;
      employeeId: string;
      date: string;
      status: 'present' | 'absent' | 'late' | 'leave' | 'half_day';
      checkInTime?: string | null;
      checkOutTime?: string | null;
      remarks?: string | null;
    }[]
  ) {
    RbacService.assertPermission(session, 'staff:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const fullEntries: StaffAttendanceRecord[] = entries.map(e => ({
      ...e,
      schoolId,
    }));

    const result = this.employeeRepo.recordStaffAttendance(fullEntries);

    for (const e of fullEntries) {
      recordChange('STAFF_ATTENDANCE', e.id, 'INSERT', e, this.db);
    }

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'STAFF_ATTENDANCE_RECORDED',
      module: 'STAFF',
      details: { count: result.recordedCount, date: entries[0]?.date },
      performedBy: session.userName || 'HR / Administrator',
    });

    return result;
  }

  public getStaffAttendanceByDate(session: ValidatedSession, date: string) {
    RbacService.assertPermission(session, 'staff:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.employeeRepo.getStaffAttendanceByDate(schoolId, date);
  }

  public getStaffAttendanceSummary(session: ValidatedSession, date: string) {
    RbacService.assertPermission(session, 'staff:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.employeeRepo.getStaffAttendanceSummary(schoolId, date);
  }
}
