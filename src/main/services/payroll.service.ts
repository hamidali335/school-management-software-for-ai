import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { PayrollRepository, SalaryStructureRecord } from '../database/repositories/payroll.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { recordChange } from '../sync/change-tracker';

export class PayrollService {
  private payrollRepo: PayrollRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.payrollRepo = new PayrollRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
  }

  public saveSalaryStructure(
    session: ValidatedSession,
    data: {
      employeeId: string;
      basicSalary: number;
      allowancesJson?: string;
      deductionsJson?: string;
    }
  ) {
    RbacService.assertPermission(session, 'expenses:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const id = `sal_${crypto.randomBytes(6).toString('hex')}`;
    const record: SalaryStructureRecord = {
      id,
      schoolId,
      employeeId: data.employeeId,
      basicSalary: data.basicSalary,
      allowancesJson: data.allowancesJson || '[]',
      deductionsJson: data.deductionsJson || '[]',
    };

    const res = this.payrollRepo.saveSalaryStructure(record);
    recordChange('STAFF_SALARY', id, 'INSERT', record, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'SALARY_STRUCTURE_SAVED',
      module: 'PAYROLL',
      details: { employeeId: data.employeeId, basicSalary: data.basicSalary },
      performedBy: session.userName || 'Accountant / HR',
    });

    return res;
  }

  public getSalaryStructure(session: ValidatedSession, employeeId: string) {
    RbacService.assertPermission(session, 'expenses:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.payrollRepo.getSalaryStructure(schoolId, employeeId);
  }

  public listSalaryStructures(session: ValidatedSession) {
    RbacService.assertPermission(session, 'expenses:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.payrollRepo.listSalaryStructures(schoolId);
  }

  public generatePayrollRun(
    session: ValidatedSession,
    data: {
      month: string;
      year: number;
    }
  ) {
    RbacService.assertPermission(session, 'expenses:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const result = this.payrollRepo.generatePayrollRun(
      schoolId,
      data.month,
      data.year,
      session.userName || 'Principal'
    );

    recordChange('PAYROLL_RUN', result.run.id, 'INSERT', result.run, this.db);

    const details = this.payrollRepo.getPayrollRunDetails(schoolId, result.run.id);
    if (details?.slips) {
      for (const slip of details.slips as any[]) {
        recordChange('PAYROLL_SLIP', slip.id, 'INSERT', slip, this.db);
      }
    }

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'PAYROLL_RUN_GENERATED',
      module: 'PAYROLL',
      details: { month: data.month, year: data.year, slips: result.slipCount, total: result.totalDisbursed },
      performedBy: session.userName || 'Accountant / Principal',
    });

    return result;
  }

  public listPayrollRuns(session: ValidatedSession) {
    RbacService.assertPermission(session, 'expenses:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.payrollRepo.listPayrollRuns(schoolId);
  }

  public getPayrollRunDetails(session: ValidatedSession, runId: string) {
    RbacService.assertPermission(session, 'expenses:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.payrollRepo.getPayrollRunDetails(schoolId, runId);
  }

  public markSlipPaid(
    session: ValidatedSession,
    slipId: string,
    paymentMethod: string = 'bank_transfer',
    paymentReference?: string
  ) {
    RbacService.assertPermission(session, 'expenses:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const success = this.payrollRepo.markSlipPaid(schoolId, slipId, paymentMethod, paymentReference);

    if (success) {
      recordChange('PAYROLL_SLIP', slipId, 'UPDATE', { id: slipId, paymentStatus: 'paid' }, this.db);
      this.auditRepo.log({
        schoolId,
        userId: session.userId,
        action: 'PAYROLL_SLIP_PAID',
        module: 'PAYROLL',
        details: { slipId, paymentMethod, paymentReference },
        performedBy: session.userName || 'Accountant',
      });
    }

    return { success };
  }
}
