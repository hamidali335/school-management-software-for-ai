import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  ArrowLeft,
  Plus,
  TrendingDown,
  TrendingUp,
  Receipt,
  RefreshCw,
  AlertCircle,
  FileText,
  DollarSign,
  X,
} from 'lucide-react';
import { Button, Input, Select, Modal, Badge, DataTable, Column } from '../components/ui';
import { APP_METADATA } from '../../shared/constants';
import { useToast } from '../context/ToastContext';

interface AccountsViewProps {
  onBack: () => void;
  sessionToken?: string | null;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ onBack, sessionToken }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expenseSummary, setExpenseSummary] = useState({ totalExpense: 0, byCategory: {} as Record<string, number> });
  const [feeSummary, setFeeSummary] = useState({ billed: 0, collected: 0, outstanding: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Add Expense Voucher Modal
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    category: 'utilities',
    description: '',
    amount: 15000,
    expenseDate: new Date().toISOString().split('T')[0],
    vendor: '',
    paymentMethod: 'cash',
    reference: '',
  });

  const loadData = useCallback(async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setLoading(true);
    setError(null);
    try {
      const [expList, expSum, fees] = await Promise.all([
        window.desktopAPI.getExpenses(sessionToken, {
          search: searchTerm || undefined,
          category: categoryFilter || undefined,
        }),
        window.desktopAPI.getExpenseSummary(sessionToken),
        window.desktopAPI.getFeeSummary(sessionToken),
      ]);
      setExpenses(expList);
      setExpenseSummary(expSum);
      setFeeSummary(fees);
    } catch (err: any) {
      console.error('Failed to load accounts data:', err);
      setError(err.message || 'Failed to retrieve accounts ledger');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, categoryFilter, sessionToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setExpenseLoading(true);
    setExpenseError(null);
    try {
      const res = await window.desktopAPI.createExpense(sessionToken, {
        id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        voucherNumber: `VCH-${new Date().getFullYear()}-${String(expenses.length + 1).padStart(4, '0')}`,
        category: expenseForm.category,
        description: expenseForm.description,
        amount: Number(expenseForm.amount),
        expenseDate: expenseForm.expenseDate,
        vendor: expenseForm.vendor || null,
        paymentMethod: expenseForm.paymentMethod,
        reference: expenseForm.reference || null,
      });

      if (!res.success) throw new Error(res.error || 'Failed to record expense voucher');
      setIsExpenseOpen(false);
      setExpenseError(null);
      await loadData();
      toastSuccess(`Expense voucher for ${APP_METADATA.CURRENCY_SYMBOL} ${Number(expenseForm.amount).toLocaleString()} posted to ledger.`, 'Voucher Recorded');
    } catch (err: any) {
      setExpenseError(err.message || 'Error recording expense');
    } finally {
      setExpenseLoading(false);
    }
  };

  const netBalance = feeSummary.collected - expenseSummary.totalExpense;

  const filteredExpenses = expenses.filter((e) => {
    if (categoryFilter && e.category !== categoryFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        e.description?.toLowerCase().includes(q) ||
        e.vendor?.toLowerCase().includes(q) ||
        e.voucherNumber?.toLowerCase().includes(q) ||
        e.reference?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const columns: Column<any>[] = [
    {
      key: 'voucherNumber',
      header: 'Voucher #',
      width: '140px',
      render: (_val, e) => (
        <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">
          {e.voucherNumber || e.voucher_number || `VCH-${e.id.slice(-4)}`}
        </span>
      ),
    },
    {
      key: 'expenseDate',
      header: 'Date',
      width: '120px',
      render: (_val, e) => (
        <span className="font-mono text-slate-500 dark:text-slate-400 text-xs">
          {e.expenseDate || e.expense_date}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description & Payee',
      render: (_val, e) => (
        <div>
          <span className="font-bold text-slate-900 dark:text-white block">{e.description}</span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Payee: {e.vendor || 'Counter Cash'} {e.reference ? `• Ref: ${e.reference}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (_val, e) => (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase border border-slate-200/60 dark:border-slate-700">
          {e.category?.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      render: (_val, e) => (
        <span className="font-mono text-slate-500 dark:text-slate-400 text-[11px] capitalize">
          {e.paymentMethod || e.payment_method || 'cash'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Expenditure',
      align: 'right',
      render: (_val, e) => (
        <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-xs">
          - {APP_METADATA.CURRENCY_SYMBOL} {e.amount.toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5 pb-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">School Accounts & Financial Ledger</h2>
              <Badge variant={netBalance >= 0 ? 'success' : 'danger'} size="sm">
                {netBalance >= 0 ? 'Surplus Reserve' : 'Deficit Reserve'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cash flow tracking, petty expenses, fee income reconciliation, and balance vouchers
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={loadData}
            isLoading={loading}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              setExpenseForm({
                category: 'utilities',
                description: '',
                amount: 15000,
                expenseDate: new Date().toISOString().split('T')[0],
                vendor: '',
                paymentMethod: 'cash',
                reference: '',
              });
              setExpenseError(null);
              setIsExpenseOpen(true);
            }}
          >
            Record Expense Voucher
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300 animate-in fade-in duration-150">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-0.5"
            title="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Finance Ledger Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Fee Revenue Realized</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 font-mono">
            {APP_METADATA.CURRENCY_SYMBOL} {feeSummary.collected.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Billed Volume: {APP_METADATA.CURRENCY_SYMBOL} {feeSummary.billed.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Total Institutional Expenditures</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-2 font-mono">
            {APP_METADATA.CURRENCY_SYMBOL} {expenseSummary.totalExpense.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{expenses.length} Expense Vouchers</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Net Operating Cash Balance</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-2xl font-extrabold mt-2 font-mono ${netBalance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
            {APP_METADATA.CURRENCY_SYMBOL} {netBalance.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Local Cash & Bank Reserve</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3 flex-1 min-w-[280px]">
          <div className="w-72">
            <Input
              placeholder="Search voucher description, payee, or reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="w-56">
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: '', label: 'All Expenditure Categories' },
                { value: 'utilities', label: 'Utilities (Electricity/Water)' },
                { value: 'salaries', label: 'Staff Salaries' },
                { value: 'stationery', label: 'Printing & Stationery' },
                { value: 'procurement', label: 'Lab & Campus Procurement' },
                { value: 'maintenance', label: 'Repairs & Maintenance' },
                { value: 'rent', label: 'Campus Rent' },
                { value: 'events', label: 'Academic & Sports Events' },
                { value: 'other', label: 'Other Sundry Expenses' },
              ]}
            />
          </div>
        </div>

        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
          Double-Entry Petty Cash Ledger
        </span>
      </div>

      {/* Expenses Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredExpenses}
          keyExtractor={(item) => item.id}
          isLoading={loading}
          emptyMessage="No expense vouchers recorded"
        />
      </div>

      {/* Record Expense Modal */}
      <Modal
        isOpen={isExpenseOpen}
        onClose={() => setIsExpenseOpen(false)}
        title="Record Institutional Expense Voucher"
        size="md"
        footer={
          <div className="flex items-center justify-end space-x-2">
            <Button variant="outline" size="sm" onClick={() => setIsExpenseOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleRecordExpense} isLoading={expenseLoading}>
              Post Expense Voucher
            </Button>
          </div>
        }
      >
        <form onSubmit={handleRecordExpense} className="space-y-3.5">
          {expenseError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{expenseError}</span>
              </div>
              <button type="button" onClick={() => setExpenseError(null)} className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Input
            label="Voucher Title / Description"
            required
            value={expenseForm.description}
            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            placeholder="e.g. LESCO Electricity Bill for Administration Block"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Expense Category"
              value={expenseForm.category}
              onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              options={[
                { value: 'utilities', label: 'Utilities' },
                { value: 'salaries', label: 'Salaries & Advances' },
                { value: 'stationery', label: 'Stationery & Printing' },
                { value: 'procurement', label: 'Equipment Procurement' },
                { value: 'maintenance', label: 'Campus Maintenance' },
                { value: 'rent', label: 'Building Rent' },
                { value: 'events', label: 'School Events' },
                { value: 'other', label: 'Other Sundry' },
              ]}
            />
            <Input
              label={`Amount (${APP_METADATA.CURRENCY_SYMBOL})`}
              type="number"
              required
              value={String(expenseForm.amount)}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Vendor / Payee Name"
              value={expenseForm.vendor}
              onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
              placeholder="e.g. LESCO / Supplier"
            />
            <Input
              label="Expense Date"
              type="date"
              required
              value={expenseForm.expenseDate}
              onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Payment Method"
              value={expenseForm.paymentMethod}
              onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
              options={[
                { value: 'cash', label: 'Cash from Petty Safe' },
                { value: 'bank_transfer', label: 'Bank Direct Transfer' },
                { value: 'cheque', label: 'Crossed Cheque' },
                { value: 'online', label: 'Online / Card' },
              ]}
            />
            <Input
              label="Invoice / Check Reference #"
              value={expenseForm.reference}
              onChange={(e) => setExpenseForm({ ...expenseForm, reference: e.target.value })}
              placeholder="e.g. CHQ-99201"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
