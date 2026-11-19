import Database from 'better-sqlite3';

export interface ExpenseRecord {
  id: string;
  schoolId: string;
  category: 'salaries' | 'rent' | 'utilities' | 'maintenance' | 'stationery' | 'transport_fuel' | 'events' | 'marketing' | 'it_software' | 'taxes' | 'procurement' | 'other';
  amount: number;
  expenseDate: string;
  vendor?: string | null;
  description: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'cheque' | 'online' | 'card';
  reference?: string | null;
  createdBy: string;
  createdAt?: string;
}

export class ExpenseRepository {
  constructor(private db: Database.Database) {}

  public createExpense(expense: ExpenseRecord): ExpenseRecord {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO expenses (
        id, school_id, category, amount, expense_date, vendor, description, payment_method, reference, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      expense.id,
      expense.schoolId,
      expense.category,
      expense.amount,
      expense.expenseDate,
      expense.vendor || null,
      expense.description,
      expense.paymentMethod || 'cash',
      expense.reference || null,
      expense.createdBy,
      now
    );
    return { ...expense, createdAt: now };
  }

  public listExpenses(
    schoolId: string,
    query?: { category?: string; startDate?: string; endDate?: string; limit?: number }
  ): ExpenseRecord[] {
    let sql = `
      SELECT id, school_id as schoolId, category, amount, expense_date as expenseDate,
             vendor, description, payment_method as paymentMethod, reference,
             created_by as createdBy, created_at as createdAt
      FROM expenses
      WHERE school_id = ?
    `;
    const params: any[] = [schoolId];

    if (query?.category) {
      sql += ' AND category = ?';
      params.push(query.category);
    }
    if (query?.startDate) {
      sql += ' AND expense_date >= ?';
      params.push(query.startDate);
    }
    if (query?.endDate) {
      sql += ' AND expense_date <= ?';
      params.push(query.endDate);
    }

    sql += ' ORDER BY expense_date DESC, created_at DESC LIMIT ?';
    params.push(query?.limit || 100);

    return this.db.prepare(sql).all(...params) as ExpenseRecord[];
  }

  public getVoucherDetails(schoolId: string, expenseId: string) {
    const expense = this.db.prepare(`
      SELECT * FROM expenses WHERE school_id = ? AND id = ?
    `).get(schoolId, expenseId) as any;

    if (!expense) return null;

    const settings = this.db.prepare(`
      SELECT * FROM school_settings WHERE school_id = ?
    `).get(schoolId) as any;

    return {
      ...expense,
      settings,
    };
  }

  public getSummary(schoolId: string, startDate?: string, endDate?: string) {
    let sql = `
      SELECT 
        COALESCE(SUM(amount), 0) as totalExpense,
        COUNT(*) as totalVouchers
      FROM expenses
      WHERE school_id = ?
    `;
    const params: any[] = [schoolId];
    if (startDate) {
      sql += ' AND expense_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND expense_date <= ?';
      params.push(endDate);
    }

    const overall = this.db.prepare(sql).get(...params) as { totalExpense: number; totalVouchers: number };

    // Breakdown by category
    let catSql = `
      SELECT category, SUM(amount) as amount, COUNT(*) as count
      FROM expenses
      WHERE school_id = ?
    `;
    const catParams: any[] = [schoolId];
    if (startDate) {
      catSql += ' AND expense_date >= ?';
      catParams.push(startDate);
    }
    if (endDate) {
      catSql += ' AND expense_date <= ?';
      catParams.push(endDate);
    }
    catSql += ' GROUP BY category ORDER BY amount DESC';
    const categories = this.db.prepare(catSql).all(...catParams);

    return {
      totalExpense: overall.totalExpense,
      totalVouchers: overall.totalVouchers,
      categories,
    };
  }
}
