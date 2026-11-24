import Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface InvoiceRecord {
  id: string;
  schoolId: string;
  challanNumber: string;
  studentId: string;
  sessionId: string;
  month: string;
  dueDate: string;
  amount: number;
  previousDues: number;
  paidAmount: number;
  balance: number;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  discountAmount?: number;
  concessionId?: string | null;
}

export interface PaymentRecord {
  id: string;
  schoolId: string;
  invoiceId: string;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'easypaisa' | 'jazzcash' | 'cheque';
  collector: string | null;
}

export interface FeeStructureRecord {
  id: string;
  schoolId: string;
  sessionId: string;
  classId: string;
  name: string;
  tuitionFee: number;
  examFee: number;
  miscFee: number;
  dueDay: number;
}

export interface FeeConcessionRecord {
  id: string;
  schoolId: string;
  studentId: string;
  sessionId: string;
  concessionType: 'percentage' | 'fixed_amount';
  value: number;
  reason: string;
  approvedBy: string;
  status: 'active' | 'revoked';
  createdAt?: string;
}

export class FeeRepository {
  constructor(private db: Database.Database) {}

  // ----------------------------------------------------------------------
  // FEE STRUCTURES
  // ----------------------------------------------------------------------

  public createFeeStructure(fs: FeeStructureRecord): FeeStructureRecord {
    this.db.prepare(`
      INSERT INTO fee_structures (id, school_id, session_id, class_id, name, tuition_fee, exam_fee, misc_fee, due_day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fs.id,
      fs.schoolId,
      fs.sessionId,
      fs.classId,
      fs.name,
      fs.tuitionFee,
      fs.examFee || 0,
      fs.miscFee || 0,
      fs.dueDay || 10
    );
    return fs;
  }

  public listFeeStructures(schoolId: string, sessionId?: string): (FeeStructureRecord & { className: string; sessionName: string })[] {
    let sql = `
      SELECT fs.id, fs.school_id as schoolId, fs.session_id as sessionId, fs.class_id as classId,
             fs.name, fs.tuition_fee as tuitionFee, fs.exam_fee as examFee, fs.misc_fee as miscFee,
             fs.due_day as dueDay, c.name as className, s.name as sessionName
      FROM fee_structures fs
      JOIN classes c ON fs.class_id = c.id
      JOIN academic_sessions s ON fs.session_id = s.id
      WHERE fs.school_id = ?
    `;
    const params: any[] = [schoolId];
    if (sessionId) {
      sql += ' AND fs.session_id = ?';
      params.push(sessionId);
    }
    sql += ' ORDER BY c.order_index ASC, fs.name ASC';
    return this.db.prepare(sql).all(...params) as (FeeStructureRecord & { className: string; sessionName: string })[];
  }

  public getFeeStructureForClass(schoolId: string, sessionId: string, classId: string): FeeStructureRecord | null {
    const row = this.db.prepare(`
      SELECT id, school_id as schoolId, session_id as sessionId, class_id as classId,
             name, tuition_fee as tuitionFee, exam_fee as examFee, misc_fee as miscFee, due_day as dueDay
      FROM fee_structures
      WHERE school_id = ? AND session_id = ? AND class_id = ?
      ORDER BY rowid DESC LIMIT 1
    `).get(schoolId, sessionId, classId) as FeeStructureRecord | undefined;
    return row || null;
  }

  // ----------------------------------------------------------------------
  // FEE CONCESSIONS
  // ----------------------------------------------------------------------

  public createConcession(con: FeeConcessionRecord): FeeConcessionRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO fee_concessions (id, school_id, student_id, session_id, concession_type, value, reason, approved_by, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      con.id,
      con.schoolId,
      con.studentId,
      con.sessionId,
      con.concessionType,
      con.value,
      con.reason,
      con.approvedBy,
      con.status || 'active',
      now
    );
    return { ...con, createdAt: now };
  }

  public listConcessions(schoolId: string, studentId?: string): (FeeConcessionRecord & { studentName: string; admissionNumber: string })[] {
    let sql = `
      SELECT fc.id, fc.school_id as schoolId, fc.student_id as studentId, fc.session_id as sessionId,
             fc.concession_type as concessionType, fc.value, fc.reason, fc.approved_by as approvedBy,
             fc.status, fc.created_at as createdAt,
             s.full_name as studentName, s.admission_number as admissionNumber
      FROM fee_concessions fc
      JOIN students s ON fc.student_id = s.id
      WHERE fc.school_id = ?
    `;
    const params: any[] = [schoolId];
    if (studentId) {
      sql += ' AND fc.student_id = ?';
      params.push(studentId);
    }
    sql += ' ORDER BY fc.created_at DESC';
    return this.db.prepare(sql).all(...params) as any[];
  }

  public revokeConcession(schoolId: string, concessionId: string): boolean {
    const res = this.db.prepare(`
      UPDATE fee_concessions SET status = 'revoked' WHERE school_id = ? AND id = ?
    `).run(schoolId, concessionId);
    return res.changes > 0;
  }

  // ----------------------------------------------------------------------
  // BULK INVOICE GENERATION (IDEMPOTENT)
  // ----------------------------------------------------------------------

  public bulkGenerateInvoices(
    schoolId: string,
    sessionId: string,
    classId: string,
    month: string,
    dueDate: string
  ): { generatedCount: number; skippedCount: number; totalProcessed: number; invoiceIds: string[] } {
    const runTx = this.db.transaction(() => {
      // 1. Get active enrollments for this class
      const enrollments = this.db.prepare(`
        SELECT e.student_id, s.admission_number, s.full_name
        FROM student_enrollments e
        JOIN students s ON e.student_id = s.id AND e.school_id = s.school_id
        WHERE e.school_id = ? AND e.session_id = ? AND e.class_id = ? AND e.status IN ('enrolled', 'active')
        ORDER BY CAST(e.roll_number AS INTEGER) ASC, s.admission_number ASC
      `).all(schoolId, sessionId, classId) as { student_id: string; admission_number: string; full_name: string }[];

      // 2. Fetch fee structure for class
      const feeStructure = this.getFeeStructureForClass(schoolId, sessionId, classId);
      const baseFee = feeStructure
        ? (feeStructure.tuitionFee + feeStructure.examFee + feeStructure.miscFee)
        : 2500; // default base fee if none configured

      let generatedCount = 0;
      let skippedCount = 0;
      const invoiceIds: string[] = [];
      const now = new Date().toISOString();

      const checkExistingStmt = this.db.prepare(`
        SELECT id FROM invoices
        WHERE school_id = ? AND student_id = ? AND month = ? AND (is_cancelled IS NULL OR is_cancelled = 0)
      `);

      const getPreviousDuesStmt = this.db.prepare(`
        SELECT COALESCE(SUM(balance), 0) as dues
        FROM invoices
        WHERE school_id = ? AND student_id = ? AND month < ? AND (is_cancelled IS NULL OR is_cancelled = 0) AND balance > 0
      `);

      const getActiveConcessionStmt = this.db.prepare(`
        SELECT id, concession_type, value
        FROM fee_concessions
        WHERE school_id = ? AND student_id = ? AND session_id = ? AND status = 'active'
        ORDER BY created_at DESC LIMIT 1
      `);

      const insertInvoiceStmt = this.db.prepare(`
        INSERT INTO invoices (
          id, school_id, challan_number, student_id, session_id, month, due_date,
          amount, previous_dues, paid_amount, balance, status, discount_amount, concession_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'unpaid', ?, ?, ?, ?)
      `);

      for (const enr of enrollments) {
        // Idempotency: skip if already billed for this month
        const existing = checkExistingStmt.get(schoolId, enr.student_id, month);
        if (existing) {
          skippedCount++;
          continue;
        }

        // Apply discount if student has active concession
        const concession = getActiveConcessionStmt.get(schoolId, enr.student_id, sessionId) as any;
        let discount = 0;
        let concessionId: string | null = null;
        if (concession) {
          concessionId = concession.id;
          if (concession.concession_type === 'percentage') {
            discount = Math.round((baseFee * concession.value) / 100);
          } else {
            discount = Math.min(baseFee, concession.value);
          }
        }

        const netCurrentAmount = Math.max(0, baseFee - discount);
        const prev = getPreviousDuesStmt.get(schoolId, enr.student_id, month) as { dues: number };
        const previousDues = prev ? prev.dues : 0;
        const totalAmount = netCurrentAmount + previousDues;

        const invId = `inv_${crypto.randomBytes(8).toString('hex')}`;
        const cleanMonth = month.replace(/[^0-9a-zA-Z]/g, '');
        const challanNumber = `CHL-${cleanMonth}-${enr.admission_number}`;

        insertInvoiceStmt.run(
          invId,
          schoolId,
          challanNumber,
          enr.student_id,
          sessionId,
          month,
          dueDate,
          netCurrentAmount,
          previousDues,
          totalAmount,
          discount,
          concessionId,
          now,
          now
        );

        invoiceIds.push(invId);
        generatedCount++;
      }

      return {
        generatedCount,
        skippedCount,
        totalProcessed: enrollments.length,
        invoiceIds,
      };
    });

    return runTx();
  }

  // ----------------------------------------------------------------------
  // INVOICES & PAYMENTS
  // ----------------------------------------------------------------------

  public createInvoice(inv: InvoiceRecord): InvoiceRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO invoices (
        id, school_id, challan_number, student_id, session_id, month, due_date,
        amount, previous_dues, paid_amount, balance, status, discount_amount, concession_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      inv.id,
      inv.schoolId,
      inv.challanNumber,
      inv.studentId,
      inv.sessionId,
      inv.month,
      inv.dueDate,
      inv.amount,
      inv.previousDues || 0,
      inv.paidAmount || 0,
      inv.balance,
      inv.status || 'unpaid',
      inv.discountAmount || 0,
      inv.concessionId || null,
      now,
      now
    );

    return inv;
  }

  public recordPayment(payment: PaymentRecord): { success: boolean; newBalance: number; newStatus: string } {
    const runTx = this.db.transaction(() => {
      // 1. Fetch current invoice with lock/consistency check
      const invoice = this.db.prepare(`
        SELECT id, amount, previous_dues, paid_amount, balance, status
        FROM invoices
        WHERE school_id = ? AND id = ?
      `).get(payment.schoolId, payment.invoiceId) as any;

      if (!invoice) {
        throw new Error(`Invoice ${payment.invoiceId} not found in this school`);
      }

      if (payment.amount <= 0) {
        throw new Error('Payment amount must be greater than zero');
      }

      // STRICT OVERPAYMENT REJECTION
      if (payment.amount > invoice.balance) {
        throw new Error(`Payment amount (${payment.amount}) exceeds outstanding balance (${invoice.balance})`);
      }

      // 2. Insert immutable payment receipt
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO payments (
          id, school_id, invoice_id, receipt_number, amount, payment_date,
          payment_method, collector, is_reversed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        payment.id,
        payment.schoolId,
        payment.invoiceId,
        payment.receiptNumber,
        payment.amount,
        payment.paymentDate,
        payment.paymentMethod || 'cash',
        payment.collector || null,
        now
      );

      // 3. Atomically update invoice totals
      const newPaid = invoice.paid_amount + payment.amount;
      const newBalance = invoice.balance - payment.amount;
      const newStatus = newBalance === 0 ? 'paid' : 'partially_paid';

      this.db.prepare(`
        UPDATE invoices
        SET paid_amount = ?, balance = ?, status = ?, updated_at = ?
        WHERE school_id = ? AND id = ?
      `).run(newPaid, newBalance, newStatus, now, payment.schoolId, payment.invoiceId);

      return { success: true, newBalance, newStatus };
    });

    return runTx();
  }

  public reversePayment(
    schoolId: string,
    paymentId: string,
    reason: string
  ): { success: boolean; restoredBalance: number; reversalPaymentId: string; reversalReceiptNumber: string } {
    const runTx = this.db.transaction(() => {
      const payment = this.db.prepare(`
        SELECT id, school_id, invoice_id, receipt_number, amount, payment_date, payment_method, collector, reversal_for_payment_id
        FROM payments
        WHERE school_id = ? AND id = ?
      `).get(schoolId, paymentId) as any;

      if (!payment) {
        throw new Error('Payment receipt not found');
      }

      // Check if a reversal transaction is itself being targeted
      if (payment.reversal_for_payment_id) {
        throw new Error('Cannot reverse a reversal transaction');
      }

      // Check if a linked reversal entry already exists for this payment (strictly immutable reversal check)
      const existingReversal = this.db.prepare(`
        SELECT id FROM payments
        WHERE school_id = ? AND reversal_for_payment_id = ?
      `).get(schoolId, paymentId);

      if (existingReversal) {
        throw new Error('Payment has already been reversed');
      }

      const invoice = this.db.prepare(`
        SELECT id, paid_amount, balance
        FROM invoices
        WHERE school_id = ? AND id = ?
      `).get(schoolId, payment.invoice_id) as any;

      const now = new Date().toISOString();

      // STRICT IMMUTABILITY: The original payment row is NEVER modified.
      // We insert a separate, linked negative contra-entry referencing reversal_for_payment_id.
      const reversalId = 'rev_' + crypto.randomBytes(8).toString('hex');
      const reversalReceipt = `REV-${payment.receipt_number}`;
      this.db.prepare(`
        INSERT INTO payments (
          id, school_id, invoice_id, receipt_number, amount, payment_date,
          payment_method, collector, is_reversed, reversal_reason, reversed_at,
          reversal_for_payment_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      `).run(
        reversalId,
        schoolId,
        payment.invoice_id,
        reversalReceipt,
        -payment.amount,
        now.split('T')[0],
        payment.payment_method,
        payment.collector,
        reason,
        now,
        paymentId,
        now
      );

      // Restore invoice balance atomically
      const newPaid = Math.max(0, invoice.paid_amount - payment.amount);
      const newBalance = invoice.balance + payment.amount;
      const newStatus = newPaid === 0 ? 'unpaid' : 'partially_paid';

      this.db.prepare(`
        UPDATE invoices
        SET paid_amount = ?, balance = ?, status = ?, updated_at = ?
        WHERE school_id = ? AND id = ?
      `).run(newPaid, newBalance, newStatus, now, schoolId, payment.invoice_id);

      return {
        success: true,
        restoredBalance: newBalance,
        reversalPaymentId: reversalId,
        reversalReceiptNumber: reversalReceipt,
      };
    });

    return runTx();
  }

  public isPaymentReversed(schoolId: string, paymentId: string): boolean {
    const row = this.db.prepare(`
      SELECT id FROM payments
      WHERE school_id = ? AND reversal_for_payment_id = ?
    `).get(schoolId, paymentId);
    return !!row;
  }

  public listInvoices(schoolId: string, month?: string) {
    let sql = `
      SELECT 
        i.id, i.school_id, i.challan_number, i.month, i.due_date, i.amount,
        i.previous_dues, i.paid_amount, i.balance, i.discount_amount,
        CASE WHEN i.is_cancelled = 1 THEN 'cancelled' ELSE i.status END as status,
        i.is_cancelled as isCancelled, i.cancelled_at as cancelledAt, i.cancellation_reason as cancellationReason,
        COALESCE(s.full_name, 'Student #' || substr(i.student_id, -6)) as student_name, COALESCE(s.admission_number, '—') as admission_number, c.name as class_name
      FROM invoices i
      LEFT JOIN students s ON i.student_id = s.id AND i.school_id = s.school_id
      LEFT JOIN student_enrollments e ON s.id = e.student_id AND i.session_id = e.session_id
      LEFT JOIN classes c ON e.class_id = c.id
      WHERE i.school_id = ?
    `;
    const params: any[] = [schoolId];

    if (month) {
      sql += ` AND i.month = ?`;
      params.push(month);
    }

    sql += ` ORDER BY i.challan_number DESC`;
    return this.db.prepare(sql).all(...params);
  }

  public getInvoiceDetails(schoolId: string, invoiceId: string) {
    const invoice = this.db.prepare(`
      SELECT i.*, COALESCE(s.full_name, 'Student #' || substr(i.student_id, -6)) as student_name, COALESCE(s.admission_number, '—') as admission_number, s.father_name, s.phone as student_phone,
             c.name as class_name, sec.name as section_name, ses.name as session_name
      FROM invoices i
      LEFT JOIN students s ON i.student_id = s.id AND i.school_id = s.school_id
      LEFT JOIN student_enrollments e ON s.id = e.student_id AND i.session_id = e.session_id
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN sections sec ON e.section_id = sec.id
      LEFT JOIN academic_sessions ses ON i.session_id = ses.id
      WHERE i.school_id = ? AND i.id = ?
    `).get(schoolId, invoiceId) as any;

    if (!invoice) return null;

    // Fetch active guardian
    const guardian = this.db.prepare(`
      SELECT * FROM student_guardians WHERE school_id = ? AND student_id = ? AND is_active = 1 LIMIT 1
    `).get(schoolId, invoice.student_id) as any;

    // Fetch payments
    const payments = this.db.prepare(`
      SELECT id, receipt_number, amount, payment_date, payment_method, collector, is_reversed,
             reversal_reason, reversal_for_payment_id, created_at
      FROM payments
      WHERE school_id = ? AND invoice_id = ?
      ORDER BY created_at ASC
    `).all(schoolId, invoiceId) as any[];

    // Fetch school settings
    const settings = this.db.prepare(`
      SELECT * FROM school_settings WHERE school_id = ?
    `).get(schoolId) as any;

    // Compute previous unpaid dues from the student's other open invoices (matches teachassist.site challan breakdown)
    const otherUnpaid = this.db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(balance), 0) as total
      FROM invoices
      WHERE school_id = ? AND student_id = ? AND id != ?
        AND balance > 0 AND (is_cancelled IS NULL OR is_cancelled = 0)
    `).get(schoolId, invoice.student_id, invoiceId) as { count: number; total: number } | undefined;

    const otherUnpaidCount = Number(otherUnpaid?.count || 0);
    const computedPreviousDues = Number(otherUnpaid?.total || invoice.previous_dues || 0);
    const totalPayableOnChallan = Number(invoice.balance || 0) + computedPreviousDues;

    return {
      ...invoice,
      otherUnpaidCount,
      computedPreviousDues,
      totalPayableOnChallan,
      guardian,
      payments,
      settings,
    };
  }

  public getDefaulters(schoolId: string, minBalance: number = 1, month?: string) {
    let sql = `
      SELECT i.id as invoiceId, i.challan_number as challanNumber, i.month, i.due_date as dueDate,
             i.amount, i.paid_amount as paidAmount, i.balance, i.status,
             COALESCE(s.id, i.student_id) as studentId, COALESCE(s.full_name, 'Student #' || substr(i.student_id, -6)) as studentName, COALESCE(s.admission_number, '—') as admissionNumber,
             s.phone as studentPhone, c.name as className, sec.name as sectionName,
             g.full_name as guardianName, g.phone as guardianPhone
      FROM invoices i
      LEFT JOIN students s ON i.student_id = s.id AND i.school_id = s.school_id
      LEFT JOIN student_enrollments e ON s.id = e.student_id AND i.session_id = e.session_id
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN sections sec ON e.section_id = sec.id
      LEFT JOIN student_guardians g ON s.id = g.student_id AND g.is_active = 1
      WHERE i.school_id = ? AND i.balance >= ? AND (i.is_cancelled IS NULL OR i.is_cancelled = 0)
    `;
    const params: any[] = [schoolId, minBalance];
    if (month) {
      sql += ' AND i.month = ?';
      params.push(month);
    }
    sql += ' ORDER BY i.balance DESC, s.admission_number ASC';

    return this.db.prepare(sql).all(...params);
  }

  public getSummary(schoolId: string, month?: string) {
    let sql = `
      SELECT 
        COALESCE(SUM(amount), 0) as billed,
        COALESCE(SUM(paid_amount), 0) as collected,
        COALESCE(SUM(balance), 0) as outstanding
      FROM invoices
      WHERE school_id = ? AND (is_cancelled IS NULL OR is_cancelled = 0)
    `;
    const params: any[] = [schoolId];
    if (month) {
      sql += ' AND month = ?';
      params.push(month);
    }
    const row = this.db.prepare(sql).get(...params) as { billed: number; collected: number; outstanding: number };

    return row;
  }

  public hasPayments(schoolId: string, invoiceId: string): boolean {
    const row = this.db.prepare(
      'SELECT COUNT(*) as c FROM payments WHERE school_id = ? AND invoice_id = ?'
    ).get(schoolId, invoiceId) as { c: number };
    return row.c > 0;
  }

  public cancelInvoice(schoolId: string, invoiceId: string, reason: string): { success: boolean } {
    if (this.hasPayments(schoolId, invoiceId)) {
      throw new Error('Cannot cancel invoice with payment history. Payments are immutable.');
    }

    const now = new Date().toISOString();
    const res = this.db.prepare(`
      UPDATE invoices
      SET is_cancelled = 1, cancelled_at = ?, cancellation_reason = ?, updated_at = ?
      WHERE school_id = ? AND id = ?
    `).run(now, reason, now, schoolId, invoiceId);

    if (res.changes === 0) {
      throw new Error('Invoice not found or already cancelled');
    }

    return { success: true };
  }

  public deleteInvoice(schoolId: string, invoiceId: string): void {
    if (this.hasPayments(schoolId, invoiceId)) {
      throw new Error('Cannot delete fee invoice: associated payment history exists');
    }

    // Attempt deletion (protected by trigger trg_prevent_invoice_deletion_with_payments & foreign keys)
    this.db.prepare('DELETE FROM invoices WHERE school_id = ? AND id = ?').run(schoolId, invoiceId);
  }
}
