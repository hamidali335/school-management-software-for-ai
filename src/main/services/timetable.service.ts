import Database from 'better-sqlite3';
import { TimetableRepository, TimetableEntryRecord } from '../database/repositories/timetable.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { recordChange } from '../sync/change-tracker';

export class TimetableService {
  private timetableRepo: TimetableRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.timetableRepo = new TimetableRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
  }

  public listBySection(session: ValidatedSession, sessionId: string, sectionId: string, dayOfWeek?: number) {
    RbacService.assertPermission(session, 'timetable:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.timetableRepo.listEntriesBySection(schoolId, sessionId, sectionId, dayOfWeek);
  }

  public validateEntry(session: ValidatedSession, data: Omit<TimetableEntryRecord, 'schoolId' | 'createdAt'>) {
    RbacService.assertPermission(session, 'timetable:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    try {
      this.timetableRepo.checkConflict(schoolId, data);
      return { valid: true, error: null };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  public createEntry(session: ValidatedSession, data: Omit<TimetableEntryRecord, 'schoolId' | 'createdAt'>) {
    RbacService.assertPermission(session, 'timetable:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const entry = this.timetableRepo.createEntry({
      ...data,
      schoolId,
    });

    recordChange('TIMETABLE', entry.id, 'INSERT', entry, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'TIMETABLE_ENTRY_CREATED',
      module: 'TIMETABLE',
      details: { entryId: entry.id, subject: entry.subjectName, period: entry.periodName },
      performedBy: session.userName || 'Timetable Manager',
    });

    return entry;
  }

  public deleteEntry(session: ValidatedSession, entryId: string) {
    RbacService.assertPermission(session, 'timetable:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const success = this.timetableRepo.deleteEntry(schoolId, entryId);
    if (success) {
      recordChange('TIMETABLE', entryId, 'DELETE', { id: entryId, schoolId }, this.db);
      this.auditRepo.log({
        schoolId,
        userId: session.userId,
        action: 'TIMETABLE_ENTRY_DELETED',
        module: 'TIMETABLE',
        details: { entryId },
        performedBy: session.userName || 'Timetable Manager',
      });
    }

    return { success };
  }
}
