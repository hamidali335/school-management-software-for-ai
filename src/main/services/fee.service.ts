import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { FeeRepository, PaymentRecord, FeeStructureRecord, FeeConcessionRecord } from '../database/repositories/fee.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { recordChange } from '../sync/change-tracker';

export class FeeService {
  private feeRepo: FeeRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.feeRepo = new FeeRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
  }

  // ----------------------------------------------------------------------
  // FEE STRUCTURES
  // ----------------------------------------------------------------------

  public createFeeStructure(
    session: ValidatedSession,
    data: {
      sessionId: string;
      classId: string;
      name: string;
      tuitionFee: number;
      examFee?: number;
      miscFee?: number;
      dueDay?: number;
    }
  ) {
    RbacService.assertPermission(session, 'fees:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const id = `fs_${crypto.randomBytes(6).toString('hex')}`;
    const record: FeeStructureRecord = {
      id,
      schoolId,
      sessionId: data.sessionId,
      classId: data.classId,
      name: data.name,
      tuitionFee: data.tuitionFee,
      examFee: data.examFee || 0,
      miscFee: data.miscFee || 0,
      dueDay: data.dueDay || 10,
    };

    const res = this.feeRepo.createFeeStructure(record);
    recordChange('FEE_STRUCTURE', id, 'INSERT', record, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'FEE_STRUCTURE_CREATED',
      module: 'FEES',
      details: { id, name: data.name, classId: data.classId, tuitionFee: data.tuitionFee },
      performedBy: session.userName || 'Accountant',
    });

    return res;
  }

  public listFeeStructures(session: ValidatedSession, sessionId?: string) {
    RbacService.assertPermission(session, 'fees:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.feeRepo.listFeeStructures(schoolId, sessionId);
  }

  // ----------------------------------------------------------------------
  // FEE CONCESSIONS
  // ----------------------------------------------------------------------

  public createConcession(
    session: ValidatedSession,
    data: {
      studentId: string;
      sessionId: string;
      concessionType: 'percentage' | 'fixed_amount';
      value: number;
      reason: string;
    }
  ) {
    RbacService.assertPermission(session, 'fees:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const id = `conc_${crypto.randomBytes(6).toString('hex')}`;
    const record: FeeConcessionRecord = {
      id,
      schoolId,
      studentId: data.studentId,
      sessionId: data.sessionId,
      concessionType: data.concessionType,
      value: data.value,
      reason: data.reason,
      approvedBy: session.userName || 'Principal',
      status: 'active',
    };

    const res = this.feeRepo.createConcession(record);
    recordChange('FEE_CONCESSION', id, 'INSERT', record, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'FEE_CONCESSION_GRANTED',
      module: 'FEES',
      details: { id, studentId: data.studentId, type: data.concessionType, value: data.value, reason: data.reason },
      performedBy: session.userName || 'Principal',
    });

    return res;
  }

  public listConcessions(session: ValidatedSession, studentId?: string) {
    RbacService.assertPermission(session, 'fees:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.feeRepo.listConcessions(schoolId, studentId);
  }

  public revokeConcession(session: ValidatedSession, concessionId: string) {
    RbacService.assertPermission(session, 'fees:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const success = this.feeRepo.revokeConcession(schoolId, concessionId);
    recordChange('FEE_CONCESSION', concessionId, 'UPDATE', { id: concessionId, status: 'revoked' }, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'FEE_CONCESSION_REVOKED',
      module: 'FEES',
      details: { concessionId },
      performedBy: session.userName || 'Principal',
    });

    return { success };
  }

  // ----------------------------------------------------------------------
  // BULK INVOICE GENERATION
  // ----------------------------------------------------------------------

  public bulkGenerateInvoices(
    session: ValidatedSession,
    data: {
      sessionId: string;
      classId: string;
      month: string;
      dueDate: string;
    }
  ) {
    RbacService.assertPermission(session, 'fees:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const result = this.feeRepo.bulkGenerateInvoices(
      schoolId,
      data.sessionId,
      data.classId,
      data.month,
      data.dueDate
    );

    // Record outbox entries for newly generated invoices
    for (const invId of result.invoiceIds) {
      recordChange('INVOICE', invId, 'INSERT', {
        id: invId,
        schoolId,
        sessionId: data.sessionId,
        classId: data.classId,
        month: data.month,
        dueDate: data.dueDate,
      }, this.db);
    }

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'BULK_INVOICES_GENERATED',
      module: 'FEES',
      details: {
        classId: data.classId,
        month: data.month,
        generatedCount: result.generatedCount,
        skippedCount: result.skippedCount,
      },
      performedBy: session.userName || 'Accountant',
    });

    return result;
  }

  // ----------------------------------------------------------------------
  // PAYMENTS & REVERSALS
  // ----------------------------------------------------------------------

  public collectFeePayment(
    session: ValidatedSession,
    payment: {
      id: string;
      invoiceId: string;
      receiptNumber: string;
      amount: number;
      paymentDate: string;
      paymentMethod: 'cash' | 'bank_transfer' | 'easypaisa' | 'jazzcash' | 'cheque';
    }
  ) {
    RbacService.assertPermission(session, 'fees:collect');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const result = this.feeRepo.recordPayment({
      ...payment,
      schoolId,
      collector: session.userName || 'Fee Officer',
    });

    recordChange('PAYMENT', payment.id, 'INSERT', {
      ...payment,
      schoolId,
      collector: session.userName,
    }, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'FEE_PAYMENT_COLLECTED',
      module: 'FEES',
      details: { receiptNumber: payment.receiptNumber, amount: payment.amount, invoiceId: payment.invoiceId },
      performedBy: session.userName || 'Fee Officer',
    });

    return result;
  }

  public reverseFeePayment(session: ValidatedSession, paymentId: string, reason: string) {
    RbacService.assertPermission(session, 'fees:reverse');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const result = this.feeRepo.reversePayment(schoolId, paymentId, reason);

    // Record immutable contra-entry in sync outbox (original payment remains untouched)
    recordChange('PAYMENT', result.reversalPaymentId, 'INSERT', {
      id: result.reversalPaymentId,
      reversalForPaymentId: paymentId,
      receiptNumber: result.reversalReceiptNumber,
      schoolId,
      reversalReason: reason,
    }, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'FEE_PAYMENT_REVERSED',
      module: 'FEES',
      details: {
        originalPaymentId: paymentId,
        reversalPaymentId: result.reversalPaymentId,
        reversalReceiptNumber: result.reversalReceiptNumber,
        reason,
        restoredBalance: result.restoredBalance,
      },
      performedBy: session.userName || 'Accountant',
    });

    return result;
  }

  public listInvoices(session: ValidatedSession, month?: string) {
    RbacService.assertPermission(session, 'fees:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.feeRepo.listInvoices(schoolId, month);
  }

  public getInvoiceDetails(session: ValidatedSession, invoiceId: string) {
    RbacService.assertPermission(session, 'fees:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.feeRepo.getInvoiceDetails(schoolId, invoiceId);
  }

  public getFeeSummary(session: ValidatedSession) {
    RbacService.assertPermission(session, 'fees:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.feeRepo.getSummary(schoolId);
  }

  public getDefaulters(session: ValidatedSession, minBalance?: number, month?: string) {
    RbacService.assertPermission(session, 'fees:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.feeRepo.getDefaulters(schoolId, minBalance, month);
  }

  public cancelInvoice(session: ValidatedSession, invoiceId: string, reason: string) {
    RbacService.assertPermission(session, 'fees:reverse');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const res = this.feeRepo.cancelInvoice(schoolId, invoiceId, reason);

    recordChange('INVOICE', invoiceId, 'UPDATE', {
      id: invoiceId,
      status: 'cancelled',
      schoolId,
      cancellationReason: reason,
    }, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'INVOICE_CANCELLED',
      module: 'FEES',
      details: { invoiceId, reason },
      performedBy: session.userName || 'Accountant',
    });

    return res;
  }

  public deleteInvoice(session: ValidatedSession, invoiceId: string) {
    RbacService.assertPermission(session, 'fees:reverse');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    this.feeRepo.deleteInvoice(schoolId, invoiceId);

    recordChange('INVOICE', invoiceId, 'DELETE', {
      id: invoiceId,
      schoolId,
    }, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'INVOICE_DELETED',
      module: 'FEES',
      details: { invoiceId },
      performedBy: session.userName || 'Administrator',
    });

    return { success: true };
  }
}
