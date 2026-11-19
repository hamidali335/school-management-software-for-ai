import Database from 'better-sqlite3';
import { ExpenseRepository, ExpenseRecord } from '../database/repositories/expense.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { recordChange } from '../sync/change-tracker';

export class ExpenseService {
  private expenseRepo: ExpenseRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.expenseRepo = new ExpenseRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
  }

  public listExpenses(
    session: ValidatedSession,
    query?: { category?: string; startDate?: string; endDate?: string; limit?: number }
  ) {
    RbacService.assertPermission(session, 'fees:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.expenseRepo.listExpenses(schoolId, query);
  }

  public getVoucherDetails(session: ValidatedSession, expenseId: string) {
    RbacService.assertPermission(session, 'fees:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.expenseRepo.getVoucherDetails(schoolId, expenseId);
  }

  public recordExpense(
    session: ValidatedSession,
    data: Omit<ExpenseRecord, 'schoolId' | 'createdBy' | 'createdAt'>
  ) {
    RbacService.assertPermission(session, 'fees:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const expense = this.expenseRepo.createExpense({
      ...data,
      schoolId,
      createdBy: session.userName || 'Accountant',
    });

    recordChange('EXPENSE', expense.id, 'INSERT', expense, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'EXPENSE_RECORDED',
      module: 'ACCOUNTS',
      details: { expenseId: expense.id, category: expense.category, amount: expense.amount },
      performedBy: session.userName || 'Accountant',
    });

    return expense;
  }

  public getSummary(session: ValidatedSession, startDate?: string, endDate?: string) {
    RbacService.assertPermission(session, 'fees:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.expenseRepo.getSummary(schoolId, startDate, endDate);
  }
}
