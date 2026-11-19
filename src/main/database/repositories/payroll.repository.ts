import Database from 'better-sqlite3';
import crypto from 'node:crypto';

export interface SalaryStructureRecord {
  id: string;
  schoolId: string;
  employeeId: string;
  basicSalary: number;
  allowancesJson: string; // e.g. [{"title":"Medical","amount":2000}]
  deductionsJson: string; // e.g. [{"title":"Tax","amount":500}]
  createdAt?: string;
  updatedAt?: string;
}

export interface PayrollRunRecord {
  id: string;
  schoolId: string;
  month: string;
  year: number;
  totalDisbursed: number;
  status: 'draft' | 'approved' | 'paid';
  approvedBy?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  createdAt?: string;
}

export interface PayrollSlipRecord {
  id: string;
  schoolId: string;
  payrollRunId: string;
  employeeId: string;
  basicSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  netSalary: number;
  paymentStatus: 'unpaid' | 'paid';
  paymentMethod?: string;
  paymentReference?: string | null;
  paidAt?: string | null;
  createdAt?: string;
}

export class PayrollRepository {
  constructor(private db: Database.Database) {}

  // ----------------------------------------------------------------------
  // SALARY STRUCTURES
  // ----------------------------------------------------------------------

  public saveSalaryStructure(record: SalaryStructureRecord): SalaryStructureRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO staff_salaries (id, school_id, employee_id, basic_salary, allowances_json, deductions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id) DO UPDATE SET
        basic_salary = excluded.basic_salary,
        allowances_json = excluded.allowances_json,
        deductions_json = excluded.deductions_json,
        updated_at = excluded.updated_at
    `).run(
      record.id,
      record.schoolId,
      record.employeeId,
      record.basicSalary,
      record.allowancesJson || '[]',
      record.deductionsJson || '[]',
      now,
      now
    );
    return { ...record, updatedAt: now };
  }

  public getSalaryStructure(schoolId: string, employeeId: string): SalaryStructureRecord | null {
    const row = this.db.prepare(`
      SELECT id, school_id as schoolId, employee_id as employeeId, basic_salary as basicSalary,
             allowances_json as allowancesJson, deductions_json as deductionsJson,
             created_at as createdAt, updated_at as updatedAt
      FROM staff_salaries
      WHERE school_id = ? AND employee_id = ?
    `).get(schoolId, employeeId) as SalaryStructureRecord | undefined;
    return row || null;
  }

  public listSalaryStructures(schoolId: string): any[] {
    return this.db.prepare(`
      SELECT s.id, s.school_id as schoolId, s.employee_id as employeeId, s.basic_salary as basicSalary,
             s.allowances_json as allowancesJson, s.deductions_json as deductionsJson,
             e.full_name as employeeName, e.employee_code as employeeCode, e.designation, e.department
      FROM staff_salaries s
      JOIN employees e ON s.employee_id = e.id AND s.school_id = e.school_id
      WHERE s.school_id = ?
      ORDER BY e.employee_code ASC
    `).all(schoolId);
  }

  // ----------------------------------------------------------------------
  // MONTHLY PAYROLL RUNS
  // ----------------------------------------------------------------------

  public generatePayrollRun(
    schoolId: string,
    month: string,
    year: number,
    approvedBy?: string
  ): { run: PayrollRunRecord; slipCount: number; totalDisbursed: number } {
    const runTx = this.db.transaction(() => {
      // Check if run already exists
      const existing = this.db.prepare(`
        SELECT id FROM payroll_runs WHERE school_id = ? AND month = ? AND year = ?
      `).get(schoolId, month, year) as any;

      if (existing) {
        throw new Error(`Payroll run for ${month} ${year} already exists.`);
      }

      // Fetch all active employees that have configured salary structures
      const activeSalaries = this.db.prepare(`
        SELECT s.employee_id, s.basic_salary, s.allowances_json, s.deductions_json
        FROM staff_salaries s
        JOIN employees e ON s.employee_id = e.id AND s.school_id = e.school_id
        WHERE s.school_id = ? AND e.status = 'active'
      `).all(schoolId) as any[];

      if (activeSalaries.length === 0) {
        throw new Error('No active staff members with configured salary structures found.');
      }

      const runId = `prun_${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      let totalDisbursed = 0;
      const slipsToInsert: Array<{
        id: string;
        schoolId: string;
        runId: string;
        employeeId: string;
        basicSalary: number;
        allowances: number;
        deductions: number;
        netSalary: number;
        createdAt: string;
      }> = [];

      for (const sal of activeSalaries) {
        let allowances = 0;
        let deductions = 0;

        try {
          const allList = JSON.parse(sal.allowances_json || '[]');
          allowances = allList.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
        } catch {}

        try {
          const dedList = JSON.parse(sal.deductions_json || '[]');
          deductions = dedList.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
        } catch {}

        const netSalary = Math.max(0, sal.basic_salary + allowances - deductions);
        totalDisbursed += netSalary;

        const slipId = `slip_${crypto.randomBytes(6).toString('hex')}`;
        slipsToInsert.push({
          id: slipId,
          schoolId,
          runId,
          employeeId: sal.employee_id,
          basicSalary: sal.basic_salary,
          allowances,
          deductions,
          netSalary,
          createdAt: now,
        });
      }

      // Insert payroll run record first to satisfy foreign key constraint on payroll_slips
      this.db.prepare(`
        INSERT INTO payroll_runs (
          id, school_id, month, year, total_disbursed, status, approved_by, approved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      `).run(
        runId,
        schoolId,
        month,
        year,
        totalDisbursed,
        approvedBy || null,
        approvedBy ? now : null,
        now
      );

      const insertSlipStmt = this.db.prepare(`
        INSERT INTO payroll_slips (
          id, school_id, payroll_run_id, employee_id, basic_salary, total_allowances, total_deductions,
          net_salary, payment_status, payment_method, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'bank_transfer', ?)
      `);

      for (const slip of slipsToInsert) {
        insertSlipStmt.run(
          slip.id,
          slip.schoolId,
          slip.runId,
          slip.employeeId,
          slip.basicSalary,
          slip.allowances,
          slip.deductions,
          slip.netSalary,
          slip.createdAt
        );
      }

      const run: PayrollRunRecord = {
        id: runId,
        schoolId,
        month,
        year,
        totalDisbursed,
        status: 'draft',
        approvedBy: approvedBy || null,
        approvedAt: approvedBy ? now : null,
        createdAt: now,
      };

      return { run, slipCount: activeSalaries.length, totalDisbursed };
    });

    return runTx();
  }

  public listPayrollRuns(schoolId: string): PayrollRunRecord[] {
    return this.db.prepare(`
      SELECT id, school_id as schoolId, month, year, total_disbursed as totalDisbursed,
             status, approved_by as approvedBy, approved_at as approvedAt, paid_at as paidAt,
             created_at as createdAt
      FROM payroll_runs
      WHERE school_id = ?
      ORDER BY year DESC, month DESC
    `).all(schoolId) as PayrollRunRecord[];
  }

  public getPayrollRunDetails(schoolId: string, runId: string) {
    const run = this.db.prepare(`
      SELECT id, school_id as schoolId, month, year, total_disbursed as totalDisbursed,
             status, approved_by as approvedBy, approved_at as approvedAt, paid_at as paidAt,
             created_at as createdAt
      FROM payroll_runs
      WHERE school_id = ? AND id = ?
    `).get(schoolId, runId) as PayrollRunRecord | undefined;

    if (!run) return null;

    const slips = this.db.prepare(`
      SELECT ps.id, ps.school_id as schoolId, ps.payroll_run_id as payrollRunId, ps.employee_id as employeeId,
             ps.basic_salary as basicSalary, ps.total_allowances as totalAllowances, ps.total_deductions as totalDeductions,
             ps.net_salary as netSalary, ps.payment_status as paymentStatus, ps.payment_method as paymentMethod,
             ps.payment_reference as paymentReference, ps.paid_at as paidAt, ps.created_at as createdAt,
             e.full_name as employeeName, e.employee_code as employeeCode, e.designation, e.department
      FROM payroll_slips ps
      JOIN employees e ON ps.employee_id = e.id AND ps.school_id = e.school_id
      WHERE ps.school_id = ? AND ps.payroll_run_id = ?
      ORDER BY e.employee_code ASC
    `).all(schoolId, runId);

    return {
      run,
      slips,
    };
  }

  public markSlipPaid(schoolId: string, slipId: string, paymentMethod: string = 'bank_transfer', paymentReference?: string): boolean {
    const now = new Date().toISOString();
    const res = this.db.prepare(`
      UPDATE payroll_slips
      SET payment_status = 'paid', payment_method = ?, payment_reference = ?, paid_at = ?
      WHERE school_id = ? AND id = ?
    `).run(paymentMethod, paymentReference || null, now, schoolId, slipId);

    return res.changes > 0;
  }
}
