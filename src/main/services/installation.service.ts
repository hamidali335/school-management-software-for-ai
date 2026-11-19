import Database from 'better-sqlite3';
import { InstallationRepository, InstallationConfig } from '../database/repositories/installation.repository';
import { AuditRepository } from '../database/repositories/audit.repository';

export class InstallationService {
  private repo: InstallationRepository;
  private auditRepo: AuditRepository;

  constructor(private db: Database.Database) {
    this.repo = new InstallationRepository(db);
    this.auditRepo = new AuditRepository(db);
  }

  public getInstallation(): InstallationConfig {
    const config = this.repo.getConfig();
    if (!config) {
      throw new Error('School installation is not provisioned on this device');
    }
    return config;
  }

  public isProvisioned(): boolean {
    return this.repo.isProvisioned();
  }

  /**
   * Strictly validates that any supplied schoolId matches the authoritative local schoolId.
   * Rejects any attempt to query or insert data belonging to another institution.
   */
  public assertSchoolIsolation(claimedSchoolId?: string): string {
    const installation = this.getInstallation();
    if (claimedSchoolId && claimedSchoolId !== installation.schoolId) {
      throw new Error(`Data isolation violation: Claimed schoolId "${claimedSchoolId}" does not match local installation "${installation.schoolId}"`);
    }
    return installation.schoolId;
  }

  public provisionInstallation(params: {
    schoolId: string;
    schoolName: string;
    schoolCode: string;
    currency?: string;
    installationId: string;
    performedBy: string;
  }): InstallationConfig {
    if (this.repo.isProvisioned()) {
      const existing = this.repo.getConfig()!;
      const isDemo = existing.schoolId === 'sch_01' || existing.schoolId === 'sch_pkg_test' || existing.schoolId === 'sch_default';
      if (!isDemo && existing.schoolId !== params.schoolId) {
        throw new Error(`Cannot reprovision installation to schoolId "${params.schoolId}". Device is already bound to "${existing.schoolId}" (${existing.schoolName}).`);
      }
    }

    // Always purge any stale demo fixtures before establishing authoritative cloud school identity
    this.repo.purgeDemoData();

    const config = this.repo.setConfig({
      schoolId: params.schoolId,
      schoolName: params.schoolName,
      schoolCode: params.schoolCode,
      currency: params.currency || 'Rs.',
      installationId: params.installationId,
    });

    this.auditRepo.log({
      schoolId: config.schoolId,
      action: 'INSTALLATION_PROVISIONED',
      module: 'INSTALLATION',
      details: { schoolName: config.schoolName, schoolCode: config.schoolCode },
      performedBy: params.performedBy,
    });

    return config;
  }
}
