import Database from 'better-sqlite3';
import { SettingsRepository, SchoolSettingsRecord } from '../database/repositories/settings.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { recordChange } from '../sync/change-tracker';

export class SettingsService {
  private settingsRepo: SettingsRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.settingsRepo = new SettingsRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
  }

  public getSchoolSettings(session: ValidatedSession) {
    RbacService.assertPermission(session, 'system:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.settingsRepo.getSchoolSettings(schoolId);
  }

  public updateSchoolSettings(session: ValidatedSession, data: Partial<SchoolSettingsRecord>) {
    RbacService.assertPermission(session, 'system:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const updated = this.settingsRepo.updateSchoolSettings(schoolId, data);

    recordChange('SCHOOL_SETTINGS', schoolId, 'UPDATE', updated, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'SCHOOL_SETTINGS_UPDATED',
      module: 'SETTINGS',
      details: { ...data },
      performedBy: session.userName || 'Administrator',
    });

    return updated;
  }

  public verifyDatabaseIntegrity(session: ValidatedSession) {
    RbacService.assertPermission(session, 'system:manage');
    return this.settingsRepo.verifyDatabaseIntegrity();
  }

  public async createVerifiedBackup(session: ValidatedSession, targetDir?: string) {
    RbacService.assertPermission(session, 'system:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const result = await this.settingsRepo.createVerifiedBackup(targetDir);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'DATABASE_BACKUP_CREATED_AND_VERIFIED',
      module: 'SETTINGS',
      details: { path: result.backupPath, sizeBytes: result.fileSizeBytes, status: result.integrityStatus },
      performedBy: session.userName || 'Administrator',
    });

    return result;
  }
}
