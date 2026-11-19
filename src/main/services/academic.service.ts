import Database from 'better-sqlite3';
import { AcademicRepository } from '../database/repositories/academic.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { recordChange } from '../sync/change-tracker';

export class AcademicService {
  private academicRepo: AcademicRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.academicRepo = new AcademicRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
  }

  public listSessions(session: ValidatedSession) {
    RbacService.assertPermission(session, 'academics:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.academicRepo.listSessions(schoolId);
  }

  public listClasses(session: ValidatedSession) {
    RbacService.assertPermission(session, 'academics:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.academicRepo.listClasses(schoolId);
  }

  public createClass(
    session: ValidatedSession,
    data: { id: string; name: string; orderIndex: number; sections: string[] }
  ) {
    RbacService.assertPermission(session, 'academics:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const cls = this.academicRepo.createClassWithSections(schoolId, data);

    recordChange('CLASS', cls.id, 'INSERT', cls, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'CLASS_CREATED',
      module: 'ACADEMICS',
      details: { classId: cls.id, name: cls.name, sections: data.sections },
      performedBy: session.userName || 'Administrator',
    });

    return cls;
  }

  public createSession(
    session: ValidatedSession,
    data: { id: string; name: string; startDate: string; endDate: string; isCurrent?: boolean }
  ) {
    RbacService.assertPermission(session, 'academics:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const sess = this.academicRepo.createSession({
      id: data.id,
      schoolId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      isCurrent: data.isCurrent || false,
    });

    recordChange('ACADEMIC_SESSION', sess.id, 'INSERT', sess, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'SESSION_CREATED',
      module: 'ACADEMICS',
      details: { sessionId: sess.id, name: sess.name },
      performedBy: session.userName || 'Administrator',
    });

    return sess;
  }
}
