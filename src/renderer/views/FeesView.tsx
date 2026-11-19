import React, { useState, useEffect, useCallback } from 'react';
import {
  ReceiptText,
  ArrowLeft,
  DollarSign,
  Plus,
  RefreshCw,
  AlertCircle,
  CreditCard,
  Ban,
  RotateCcw,
  Search,
  CheckCircle2,
  Printer,
  ShieldAlert,
  Percent,
  Layers,
  Phone,
  X,
} from 'lucide-react';
import {
  Button,
  Input,
  Select,
  Modal,
  Badge,
  ConfirmDialog,
  DataTable,
  Column,
  ErrorPanel,
} from '../components/ui';
import { useToast } from '../context/ToastContext';

interface FeesViewProps {
  onBack: () => void;
  sessionToken?: string | null;
}

export const FeesView: React.FC<FeesViewProps> = ({ onBack, sessionToken }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<'invoices' | 'structures' | 'concessions' | 'defaulters'>('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [concessions, setConcessions] = useState<any[]>([]);
  const [defaulters, setDefaulters] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ billed: number; collected: number; outstanding: number }>({
    billed: 0,
    collected: 0,
    outstanding: 0,
  });
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal-isolated error states
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [concessionError, setConcessionError] = useState<string | null>(null);
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('November 2026');

  // Single Invoice Creation
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    studentId: '',
    sessionId: '',
    challanNumber: '',
    month: 'November 2026',
    dueDate: '2026-11-25',
    amount: 6500,
    previousDues: 0,
  });

  // Bulk Invoice Generation Modal State
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    sessionId: '',
    classId: '',
    month: 'November 2026',
    dueDate: '2026-11-25',
  });
  const [bulkResult, setBulkResult] = useState<{ generatedCount: number; skippedCount: number } | null>(null);

  // Fee Structure Modal State
  const [isStructureOpen, setIsStructureOpen] = useState(false);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureForm, setStructureForm] = useState({
    sessionId: '',
    classId: '',
    name: 'General Academic Fee',
    tuitionFee: 6500,
    examFee: 500,
    miscFee: 200,
    dueDay: 10,
  });

  // Concession Modal State
  const [isConcessionOpen, setIsConcessionOpen] = useState(false);
  const [concessionLoading, setConcessionLoading] = useState(false);
  const [concessionForm, setConcessionForm] = useState({
    studentId: '',
    sessionId: '',
    concessionType: 'percentage' as 'percentage' | 'fixed_amount',
    value: 20,
    reason: 'Merit scholarship',
  });

  // Payment Collection Modal State
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    receiptNumber: '',
    amount: 0,
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
  });

  // Printable Challan View State
  const [selectedChallanId, setSelectedChallanId] = useState<string | null>(null);
  const [challanDetails, setChallanDetails] = useState<any | null>(null);
  const [isChallanOpen, setIsChallanOpen] = useState(false);

  // Payment Reversal Modal State
  const [selectedPaymentForReversal, setSelectedPaymentForReversal] = useState<any | null>(null);
  const [reversalReason, setReversalReason] = useState('Administrative reversal');
  const [reversalLoading, setReversalLoading] = useState(false);

  // Invoice Cancellation Confirm
  const [invoiceToCancel, setInvoiceToCancel] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('Cancelled by administrator');
  const [cancelLoading, setCancelLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setLoading(true);
    setError(null);
    try {
      const [invList, structList, concList, defs, sum, stdList, clsList, sessList] = await Promise.all([
        window.desktopAPI.getInvoices(sessionToken, selectedMonth || undefined),
        window.desktopAPI.listFeeStructures(sessionToken),
        window.desktopAPI.listConcessions(sessionToken),
        window.desktopAPI.getDefaulters(sessionToken, 1, selectedMonth || undefined),
        window.desktopAPI.getFeeSummary(sessionToken, selectedMonth || undefined),
        window.desktopAPI.getStudents(sessionToken),
        window.desktopAPI.getClasses(sessionToken),
        window.desktopAPI.getAcademicSessions(sessionToken),
      ]);

      setInvoices(invList);
      setStructures(structList);
      setConcessions(concList);
      setDefaulters(defs);
      setSummary(sum);
      setStudents(stdList);
      setClasses(clsList);
      setSessions(sessList);

      if (sessList.length > 0) {
        if (!bulkForm.sessionId) setBulkForm((prev) => ({ ...prev, sessionId: sessList[0].id }));
        if (!structureForm.sessionId) setStructureForm((prev) => ({ ...prev, sessionId: sessList[0].id }));
        if (!concessionForm.sessionId) setConcessionForm((prev) => ({ ...prev, sessionId: sessList[0].id }));
        if (!createForm.sessionId) setCreateForm((prev) => ({ ...prev, sessionId: sessList[0].id }));
      }
      if (clsList.length > 0) {
        if (!bulkForm.classId) setBulkForm((prev) => ({ ...prev, classId: clsList[0].id }));
        if (!structureForm.classId) setStructureForm((prev) => ({ ...prev, classId: clsList[0].id }));
      }
      if (stdList.length > 0 && !createForm.studentId) {
        setCreateForm((prev) => ({
          ...prev,
          studentId: stdList[0].id,
          challanNumber: `CHL-${Date.now().toString().slice(-6)}`,
        }));
      }
    } catch (err: any) {
      console.error('Failed to load fees data:', err);
      setError(err.message || 'Failed to load financial records');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Single Invoice Submit
  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      const challanNo = createForm.challanNumber || `CHL-${Date.now().toString().slice(-6)}`;
      const res = await window.desktopAPI.createInvoice(sessionToken, {
        studentId: createForm.studentId,
        sessionId: createForm.sessionId,
        challanNumber: challanNo,
        month: createForm.month,
        dueDate: createForm.dueDate,
        amount: Number(createForm.amount),
        previousDues: Number(createForm.previousDues) || 0,
      });

      if (!res.success) throw new Error(res.error || 'Failed to create invoice');

      setIsCreateOpen(false);
      setCreateError(null);
      await loadData();
      toastSuccess(`Invoice #${challanNo} issued successfully.`, 'Invoice Created');
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create fee invoice');
    } finally {
      setCreateLoading(false);
    }
  };

  // Bulk Generation Submit
  const handleBulkGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setBulkLoading(true);
    setBulkResult(null);
    setBulkError(null);
    try {
      const res = await window.desktopAPI.bulkGenerateInvoices(sessionToken, {
        sessionId: bulkForm.sessionId,
        classId: bulkForm.classId,
        month: bulkForm.month,
        dueDate: bulkForm.dueDate,
      });

      if (!res.success) throw new Error(res.error || 'Bulk generation failed');

      setBulkResult({
        generatedCount: res.generatedCount || 0,
        skippedCount: res.skippedCount || 0,
      });
      await loadData();
      toastSuccess(`Generated ${res.generatedCount || 0} fee challans successfully.`, 'Bulk Generation');
    } catch (err: any) {
      setBulkError(err.message || 'Failed to generate bulk monthly invoices');
    } finally {
      setBulkLoading(false);
    }
  };

  // Fee Structure Creation
  const handleCreateStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setStructureLoading(true);
    setStructureError(null);
    try {
      const res = await window.desktopAPI.createFeeStructure(sessionToken, {
        sessionId: structureForm.sessionId,
        classId: structureForm.classId,
        name: structureForm.name,
        tuitionFee: Number(structureForm.tuitionFee),
        examFee: Number(structureForm.examFee),
        miscFee: Number(structureForm.miscFee),
        dueDay: Number(structureForm.dueDay),
      });

      if (!res.success) throw new Error(res.error || 'Failed to create fee structure');

      setIsStructureOpen(false);
      setStructureError(null);
      await loadData();
      toastSuccess('Fee structure created successfully.', 'Fee Structure');
    } catch (err: any) {
      setStructureError(err.message || 'Failed to create fee structure');
    } finally {
      setStructureLoading(false);
    }
  };

  // Concession Creation
  const handleCreateConcession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setConcessionLoading(true);
    setConcessionError(null);
    try {
      const res = await window.desktopAPI.createConcession(sessionToken, {
        studentId: concessionForm.studentId,
        sessionId: concessionForm.sessionId,
        concessionType: concessionForm.concessionType,
        value: Number(concessionForm.value),
        reason: concessionForm.reason,
      });

      if (!res.success) throw new Error(res.error || 'Failed to grant concession');

      setIsConcessionOpen(false);
      setConcessionError(null);
      await loadData();
      toastSuccess('Fee concession applied to student account.', 'Concession Granted');
    } catch (err: any) {
      setConcessionError(err.message || 'Failed to grant concession');
    } finally {
      setConcessionLoading(false);
    }
  };

  // Revoke Concession
  const handleRevokeConcession = async (concessionId: string) => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const res = await window.desktopAPI.revokeConcession(sessionToken, concessionId);
      if (!res.success) throw new Error(res.error || 'Failed to revoke concession');
      await loadData();
      toastSuccess('Concession revoked successfully.', 'Concession Update');
    } catch (err: any) {
      toastError(err.message || 'Failed to revoke concession', 'Concession Error');
    }
  };

  // View Printable Challan Details
  const handleViewChallan = async (invoiceId: string) => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const details = await window.desktopAPI.getInvoiceDetails(sessionToken, invoiceId);
      setChallanDetails(details);
      setIsChallanOpen(true);
    } catch (err: any) {
      toastError(err.message || 'Failed to load challan details', 'Challan Notice');
    }
  };

  // Collect Payment
  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForPayment || !window.desktopAPI || !sessionToken) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const res = await window.desktopAPI.collectFee(sessionToken, {
        id: paymentId,
        invoiceId: selectedInvoiceForPayment.id,
        receiptNumber: paymentForm.receiptNumber,
        amount: Number(paymentForm.amount),
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod as any,
      });

      if (!res.success) throw new Error(res.error || 'Payment failed');

      toastSuccess(
        `Collected payment of Rs. ${Number(paymentForm.amount).toLocaleString()} (Receipt: ${paymentForm.receiptNumber})`,
        'Payment Collected'
      );
      setSelectedInvoiceForPayment(null);
      setPaymentError(null);
      await loadData();
    } catch (err: any) {
      setPaymentError(err.message || 'Failed to record fee payment');
    } finally {
      setPaymentLoading(false);
    }
  };

  // Reverse Payment
  const handleReversePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaymentForReversal || !window.desktopAPI || !sessionToken) return;
    setReversalLoading(true);
    setReversalError(null);
    try {
      const res = await window.desktopAPI.reverseFee(sessionToken, selectedPaymentForReversal.id, reversalReason);
      if (!res.success) throw new Error(res.error || 'Reversal failed');

      toastSuccess('Linked contra-entry reversal created. Transaction audited.', 'Payment Reversed');
      setSelectedPaymentForReversal(null);
      setReversalError(null);
      await loadData();
      if (isChallanOpen && challanDetails?.id) {
        await handleViewChallan(challanDetails.id);
      }
    } catch (err: any) {
      setReversalError(err.message || 'Failed to reverse fee payment');
    } finally {
      setReversalLoading(false);
    }
  };

  // Cancel Invoice
  const handleCancelInvoice = async () => {
    if (!invoiceToCancel || !window.desktopAPI || !sessionToken) return;
    setCancelLoading(true);
    try {
      const res = await window.desktopAPI.cancelInvoice(sessionToken, {
        invoiceId: invoiceToCancel.id,
        reason: cancelReason,
      });

      if (!res.success) throw new Error(res.error || 'Cancellation failed');

      toastSuccess(`Challan #${invoiceToCancel.challan_number} marked as cancelled.`, 'Challan Voided');
      setInvoiceToCancel(null);
      await loadData();
    } catch (err: any) {
      toastError(err.message || 'Failed to cancel invoice', 'Cancellation Error');
    } finally {
      setCancelLoading(false);
    }
  };

  const invoiceColumns: Column<any>[] = [
    {
      key: 'challan_number',
      header: 'Challan #',
      width: '130px',
      render: (val, row) => (
        <button
          onClick={() => handleViewChallan(row.id)}
          className="font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
        >
          {val}
        </button>
      ),
    },
    {
      key: 'student_name',
      header: 'Student',
      render: (val, row) => (
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-200">{val}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Adm #: {row.admission_number} | Class: {row.class_name || '—'}</div>
        </div>
      ),
    },
    {
      key: 'month',
      header: 'Month',
      render: (val) => <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">{val}</span>,
    },
    {
      key: 'amount',
      header: 'Billed',
      align: 'right',
      render: (val) => <span className="font-mono text-slate-800 dark:text-slate-200">Rs. {Number(val).toLocaleString()}</span>,
    },
    {
      key: 'paid_amount',
      header: 'Paid',
      align: 'right',
      render: (val) => (
        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
          Rs. {Number(val).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance Due',
      align: 'right',
      render: (val) => (
        <span className={`font-mono font-bold ${val > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
          Rs. {Number(val).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (val) => {
        const variant = val === 'paid' ? 'success' : val === 'partially_paid' ? 'warning' : val === 'cancelled' ? 'neutral' : 'danger';
        return <Badge variant={variant} dot>{String(val).toUpperCase().replace('_', ' ')}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => handleViewChallan(row.id)} title="Print 3-Part Challan">
            <Printer className="w-3.5 h-3.5 mr-1" />
            Print
          </Button>
          {row.status !== 'paid' && row.status !== 'cancelled' && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setSelectedInvoiceForPayment(row);
                setPaymentForm({
                  receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
                  amount: row.balance,
                  paymentDate: new Date().toISOString().split('T')[0],
                  paymentMethod: 'cash',
                });
              }}
              title="Collect Payment"
            >
              <CreditCard className="w-3.5 h-3.5 mr-1" />
              Collect
            </Button>
          )}
          {row.paid_amount === 0 && row.status !== 'cancelled' && (
            <Button size="sm" variant="danger" onClick={() => setInvoiceToCancel(row)} title="Cancel Invoice">
              <Ban className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Fee Management & Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Idempotent bulk challan generation, immutable payment ledger, contra-reversals & defaulters tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setIsBulkOpen(true)}>
            <Layers className="w-4 h-4 mr-1.5" />
            Bulk Generate Invoices
          </Button>
          <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Single Invoice
          </Button>
        </div>
      </div>

      {error && (
        <ErrorPanel
          message={error}
          onDismiss={() => setError(null)}
          onRetry={loadData}
        />
      )}

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Total Billed</span>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
            Rs. {summary.billed.toLocaleString()}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">Total Realized Collected</span>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 font-mono">
            Rs. {summary.collected.toLocaleString()}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase text-rose-500 dark:text-rose-400">Total Outstanding Balance</span>
          <div className="text-2xl font-bold text-rose-700 dark:text-rose-400 mt-1 font-mono">
            Rs. {summary.outstanding.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 transition-colors ${activeTab === 'invoices' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Invoices & Challans ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab('structures')}
          className={`pb-3 transition-colors ${activeTab === 'structures' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Fee Structures ({structures.length})
        </button>
        <button
          onClick={() => setActiveTab('concessions')}
          className={`pb-3 transition-colors ${activeTab === 'concessions' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Concessions & Scholarships ({concessions.length})
        </button>
        <button
          onClick={() => setActiveTab('defaulters')}
          className={`pb-3 transition-colors ${activeTab === 'defaulters' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Defaulters Register ({defaulters.length})
        </button>
      </div>

      {/* TAB CONTENT: INVOICES */}
      {activeTab === 'invoices' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <DataTable
            columns={invoiceColumns}
            data={invoices}
            loading={loading}
            emptyMessage="No fee invoices found"
          />
        </div>
      )}

      {/* TAB CONTENT: FEE STRUCTURES */}
      {activeTab === 'structures' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Class Fee Schedules</span>
            <Button size="sm" variant="primary" onClick={() => setIsStructureOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Configure Class Fee
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {structures.map((s) => (
              <div key={s.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-slate-900 dark:text-white">{s.className} — {s.name}</h4>
                  <Badge variant="indigo">Due Day: {s.dueDay}th</Badge>
                </div>
                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between"><span>Tuition Fee:</span> <strong className="text-slate-800 dark:text-slate-200">Rs. {s.tuitionFee?.toLocaleString()}</strong></div>
                  <div className="flex justify-between"><span>Exam Fee:</span> <strong className="text-slate-800 dark:text-slate-200">Rs. {s.examFee?.toLocaleString() || 0}</strong></div>
                  <div className="flex justify-between"><span>Misc Fee:</span> <strong className="text-slate-800 dark:text-slate-200">Rs. {s.miscFee?.toLocaleString() || 0}</strong></div>
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 font-semibold text-slate-900 dark:text-white">
                    <span>Total Monthly:</span> <strong>Rs. {(s.tuitionFee + (s.examFee || 0) + (s.miscFee || 0)).toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: CONCESSIONS */}
      {activeTab === 'concessions' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Active Scholarships & Fee Discounts</span>
            <Button size="sm" variant="primary" onClick={() => setIsConcessionOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Grant Concession
            </Button>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Adm #</th>
                  <th className="p-3">Discount Type</th>
                  <th className="p-3">Value</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {concessions.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{c.studentName}</td>
                    <td className="p-3 font-mono">{c.admissionNumber}</td>
                    <td className="p-3 uppercase">{c.concessionType}</td>
                    <td className="p-3 font-bold text-indigo-700 dark:text-indigo-400">
                      {c.concessionType === 'percentage' ? `${c.value}%` : `Rs. ${c.value.toLocaleString()}`}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{c.reason}</td>
                    <td className="p-3">
                      <Badge variant={c.status === 'active' ? 'success' : 'neutral'} dot>{c.status}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      {c.status === 'active' && (
                        <Button size="sm" variant="danger" onClick={() => handleRevokeConcession(c.id)}>
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: DEFAULTERS */}
      {activeTab === 'defaulters' && (
        <div className="space-y-4">
          <div className="bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-4 rounded-xl flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">Total Defaulters: {defaulters.length} students</h4>
              <p className="text-xs text-rose-700 dark:text-rose-400">Students with outstanding unpaid fee balances across academic months</p>
            </div>
            <Badge variant="danger">Overdue Ledger</Badge>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Class</th>
                  <th className="p-3">Challan #</th>
                  <th className="p-3">Month</th>
                  <th className="p-3">Balance Due</th>
                  <th className="p-3">Guardian</th>
                  <th className="p-3">Guardian Contact</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {defaulters.map((d) => (
                  <tr key={d.invoiceId}>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{d.studentName}</td>
                    <td className="p-3">{d.className} ({d.sectionName})</td>
                    <td className="p-3 font-mono">{d.challanNumber}</td>
                    <td className="p-3">{d.month}</td>
                    <td className="p-3 font-mono font-bold text-rose-700 dark:text-rose-400">Rs. {d.balance.toLocaleString()}</td>
                    <td className="p-3">{d.guardianName || '—'}</td>
                    <td className="p-3 font-mono text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" /> {d.guardianPhone || d.studentPhone || '—'}
                    </td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleViewChallan(d.invoiceId)}>
                        View Challan
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SINGLE INVOICE CREATION MODAL */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Issue Single Fee Invoice"
        subtitle="Generate a single academic fee challan for an individual student"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateInvoice} loading={createLoading}>
              Issue Challan
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateInvoice} className="space-y-3">
          {createError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{createError}</span>
              </div>
              <button type="button" onClick={() => setCreateError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Select
            label="Student"
            value={createForm.studentId}
            onChange={(e) => setCreateForm({ ...createForm, studentId: e.target.value })}
            required
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.admission_number} — {s.full_name} ({s.class_name || 'Class'})
              </option>
            ))}
          </Select>
          <Select
            label="Academic Session"
            value={createForm.sessionId}
            onChange={(e) => setCreateForm({ ...createForm, sessionId: e.target.value })}
            required
          >
            {sessions.map((sess) => (
              <option key={sess.id} value={sess.id}>
                {sess.name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Challan Number"
              value={createForm.challanNumber}
              onChange={(e) => setCreateForm({ ...createForm, challanNumber: e.target.value })}
              placeholder="e.g. CHL-001234"
              required
            />
            <Input
              label="Billing Month"
              value={createForm.month}
              onChange={(e) => setCreateForm({ ...createForm, month: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Amount (Rs.)"
              type="number"
              value={createForm.amount}
              onChange={(e) => setCreateForm({ ...createForm, amount: Number(e.target.value) })}
              required
            />
            <Input
              label="Previous Dues (Rs.)"
              type="number"
              value={createForm.previousDues}
              onChange={(e) => setCreateForm({ ...createForm, previousDues: Number(e.target.value) })}
            />
          </div>
          <Input
            label="Due Date"
            type="date"
            value={createForm.dueDate}
            onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
            required
          />
        </form>
      </Modal>

      {/* BULK INVOICE GENERATION MODAL */}
      <Modal
        isOpen={isBulkOpen}
        onClose={() => { setIsBulkOpen(false); setBulkResult(null); }}
        title="Generate Monthly Class Fee Challans"
        subtitle="Idempotent generation: Automatically skips already-billed students and applies scholarship concessions"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setIsBulkOpen(false); setBulkResult(null); }}>
              Close
            </Button>
            <Button variant="primary" onClick={handleBulkGenerateSubmit} loading={bulkLoading}>
              Generate Challans
            </Button>
          </>
        }
      >
        <form onSubmit={handleBulkGenerateSubmit} className="space-y-4">
          {bulkError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{bulkError}</span>
              </div>
              <button type="button" onClick={() => setBulkError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {bulkResult && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs">
              <strong>Success!</strong> Generated {bulkResult.generatedCount} new challans. {bulkResult.skippedCount} students were already billed for this month.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Academic Session"
              value={bulkForm.sessionId}
              onChange={(e) => setBulkForm({ ...bulkForm, sessionId: e.target.value })}
              required
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <Select
              label="Class Grade"
              value={bulkForm.classId}
              onChange={(e) => setBulkForm({ ...bulkForm, classId: e.target.value })}
              required
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input
              label="Billing Month"
              value={bulkForm.month}
              onChange={(e) => setBulkForm({ ...bulkForm, month: e.target.value })}
              placeholder="e.g. December 2026"
              required
            />
            <Input
              label="Due Date"
              type="date"
              value={bulkForm.dueDate}
              onChange={(e) => setBulkForm({ ...bulkForm, dueDate: e.target.value })}
              required
            />
          </div>
        </form>
      </Modal>

      {/* CONFIGURE CLASS FEE STRUCTURE MODAL */}
      <Modal
        isOpen={isStructureOpen}
        onClose={() => setIsStructureOpen(false)}
        title="Configure Class Fee Structure"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsStructureOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateStructure} loading={structureLoading}>
              Save Structure
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateStructure} className="space-y-3">
          {structureError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{structureError}</span>
              </div>
              <button type="button" onClick={() => setStructureError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Select
            label="Class Grade"
            value={structureForm.classId}
            onChange={(e) => setStructureForm({ ...structureForm, classId: e.target.value })}
            required
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input
            label="Structure Name"
            value={structureForm.name}
            onChange={(e) => setStructureForm({ ...structureForm, name: e.target.value })}
            required
          />
          <Input
            label="Tuition Fee (Rs.)"
            type="number"
            value={structureForm.tuitionFee}
            onChange={(e) => setStructureForm({ ...structureForm, tuitionFee: Number(e.target.value) })}
            required
          />
          <Input
            label="Exam Fee (Rs.)"
            type="number"
            value={structureForm.examFee}
            onChange={(e) => setStructureForm({ ...structureForm, examFee: Number(e.target.value) })}
          />
          <Input
            label="Misc / Activity Fee (Rs.)"
            type="number"
            value={structureForm.miscFee}
            onChange={(e) => setStructureForm({ ...structureForm, miscFee: Number(e.target.value) })}
          />
          <Input
            label="Due Day of Month"
            type="number"
            value={structureForm.dueDay}
            onChange={(e) => setStructureForm({ ...structureForm, dueDay: Number(e.target.value) })}
          />
        </form>
      </Modal>

      {/* GRANT CONCESSION MODAL */}
      <Modal
        isOpen={isConcessionOpen}
        onClose={() => setIsConcessionOpen(false)}
        title="Grant Scholarship / Fee Concession"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsConcessionOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateConcession} loading={concessionLoading}>
              Grant Concession
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateConcession} className="space-y-3">
          {concessionError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{concessionError}</span>
              </div>
              <button type="button" onClick={() => setConcessionError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Select
            label="Select Student"
            value={concessionForm.studentId}
            onChange={(e) => setConcessionForm({ ...concessionForm, studentId: e.target.value })}
            required
          >
            <option value="">Select student...</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.admission_number} — {s.full_name}</option>
            ))}
          </Select>
          <Select
            label="Concession Type"
            value={concessionForm.concessionType}
            onChange={(e) => setConcessionForm({ ...concessionForm, concessionType: e.target.value as any })}
          >
            <option value="percentage">Percentage Discount (%)</option>
            <option value="fixed_amount">Fixed Amount Discount (Rs.)</option>
          </Select>
          <Input
            label="Discount Value"
            type="number"
            value={concessionForm.value}
            onChange={(e) => setConcessionForm({ ...concessionForm, value: Number(e.target.value) })}
            required
          />
          <Input
            label="Approval Reason"
            value={concessionForm.reason}
            onChange={(e) => setConcessionForm({ ...concessionForm, reason: e.target.value })}
            placeholder="e.g. Merit scholarship, Kinship discount"
            required
          />
        </form>
      </Modal>

      {/* COLLECT PAYMENT MODAL (STRICT OVERPAYMENT REJECTION) */}
      <Modal
        isOpen={Boolean(selectedInvoiceForPayment)}
        onClose={() => setSelectedInvoiceForPayment(null)}
        title="Fee Payment Collection"
        subtitle={`Challan #${selectedInvoiceForPayment?.challan_number} — Outstanding Balance: Rs. ${selectedInvoiceForPayment?.balance?.toLocaleString()}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedInvoiceForPayment(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCollectPayment} loading={paymentLoading}>
              Record Immutable Payment
            </Button>
          </>
        }
      >
        <form onSubmit={handleCollectPayment} className="space-y-3">
          {paymentError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{paymentError}</span>
              </div>
              <button type="button" onClick={() => setPaymentError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3 text-xs text-amber-900 dark:text-amber-300">
            <strong>Financial Ledger Invariant:</strong> Maximum payment cannot exceed outstanding balance (Rs. {selectedInvoiceForPayment?.balance}). Overpayments are strictly rejected.
          </div>
          <Input
            label="Receipt Number"
            value={paymentForm.receiptNumber}
            onChange={(e) => setPaymentForm({ ...paymentForm, receiptNumber: e.target.value })}
            required
          />
          <Input
            label="Amount (Rs.)"
            type="number"
            max={selectedInvoiceForPayment?.balance}
            value={paymentForm.amount}
            onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
            required
          />
          <Select
            label="Payment Method"
            value={paymentForm.paymentMethod}
            onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
          >
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="easypaisa">EasyPaisa</option>
            <option value="jazzcash">JazzCash</option>
            <option value="cheque">Cheque</option>
          </Select>
          <Input
            label="Payment Date"
            type="date"
            value={paymentForm.paymentDate}
            onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
            required
          />
        </form>
      </Modal>

      {/* PRINTABLE 3-PART CHALLAN MODAL */}
      <Modal
        isOpen={isChallanOpen}
        onClose={() => setIsChallanOpen(false)}
        title="Printable Institutional Fee Challan"
        size="3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsChallanOpen(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Challan Copies
            </Button>
          </>
        }
      >
        {challanDetails && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-slate-300 dark:border-slate-700 p-4 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200">
              {['BANK COPY', 'SCHOOL COPY', 'STUDENT COPY'].map((copyTitle, idx) => (
                <div key={idx} className="border-r border-slate-200 dark:border-slate-800 last:border-r-0 pr-3 last:pr-0 space-y-2">
                  <div className="text-center border-b border-slate-200 dark:border-slate-800 pb-1">
                    <h5 className="font-bold text-slate-900 dark:text-white">{challanDetails.settings?.motto ? 'School OS' : 'Campus Academy'}</h5>
                    <Badge variant="indigo" size="sm">{copyTitle}</Badge>
                  </div>
                  <div className="space-y-1">
                    <div>Challan #: <strong className="font-mono text-slate-900 dark:text-white">{challanDetails.challan_number}</strong></div>
                    <div>Student: <strong className="text-slate-900 dark:text-white">{challanDetails.student_name}</strong></div>
                    <div>Adm #: <span className="font-mono">{challanDetails.admission_number}</span></div>
                    <div>Class: {challanDetails.class_name} ({challanDetails.section_name})</div>
                    <div>Month: <strong>{challanDetails.month}</strong></div>
                    <div>Due Date: {challanDetails.due_date}</div>
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-1 space-y-0.5">
                    <div className="flex justify-between"><span>Current Fee:</span> <strong>Rs. {challanDetails.amount?.toLocaleString()}</strong></div>
                    {challanDetails.previous_dues > 0 && (
                      <div className="flex justify-between text-rose-600 dark:text-rose-400"><span>Past Dues:</span> <strong>Rs. {challanDetails.previous_dues?.toLocaleString()}</strong></div>
                    )}
                    <div className="flex justify-between font-bold border-t border-slate-200 dark:border-slate-800 pt-0.5 text-slate-900 dark:text-white">
                      <span>Total Balance:</span> <strong>Rs. {challanDetails.balance?.toLocaleString()}</strong>
                    </div>
                  </div>
                  <div className="pt-6 border-t border-dashed border-slate-200 dark:border-slate-800 text-[10px] text-center text-slate-400">
                    Bank Officer Signature & Stamp
                  </div>
                </div>
              ))}
            </div>

            {/* Payment History & Contra-Reversals */}
            {challanDetails.payments?.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50 dark:bg-slate-800/60">
                <h5 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-2">Immutable Payment History</h5>
                <div className="space-y-1 text-xs">
                  {challanDetails.payments.map((p: any) => (
                    <div key={p.id} className="flex justify-between items-center bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="text-slate-700 dark:text-slate-300">
                        Receipt: <strong className="font-mono text-slate-900 dark:text-white">{p.receipt_number}</strong> | Date: {p.payment_date} | Method: {p.payment_method}
                        {p.is_reversed === 1 && <span className="ml-2 text-rose-600 dark:text-rose-400 font-bold">(CONTRA-ENTRY REVERSAL: {p.reversal_reason})</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <strong className={p.amount < 0 ? 'text-rose-600 dark:text-rose-400 font-mono' : 'text-emerald-700 dark:text-emerald-400 font-mono'}>
                          Rs. {p.amount.toLocaleString()}
                        </strong>
                        {p.amount > 0 && !challanDetails.payments.some((r: any) => r.reversal_for_payment_id === p.id) && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setSelectedPaymentForReversal(p);
                              setReversalReason('Administrative reversal');
                            }}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" /> Reversal
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* REVERSE PAYMENT MODAL */}
      <Modal
        isOpen={Boolean(selectedPaymentForReversal)}
        onClose={() => setSelectedPaymentForReversal(null)}
        title="Execute Payment Reversal"
        subtitle={`Inserting linked contra-entry for Receipt #${selectedPaymentForReversal?.receipt_number}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedPaymentForReversal(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReversePayment} loading={reversalLoading}>
              Confirm Negative Contra-Entry
            </Button>
          </>
        }
      >
        <form onSubmit={handleReversePayment} className="space-y-3">
          {reversalError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{reversalError}</span>
              </div>
              <button type="button" onClick={() => setReversalError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-200">
            <strong>Audit Invariant:</strong> The original payment is never modified or deleted. A negative contra-entry (-Rs. {selectedPaymentForReversal?.amount}) will be recorded.
          </div>
          <Input
            label="Mandatory Reversal Reason"
            value={reversalReason}
            onChange={(e) => setReversalReason(e.target.value)}
            placeholder="e.g. Returned cheque, wrong student account credited"
            required
          />
        </form>
      </Modal>

      {/* CANCEL INVOICE CONFIRMATION */}
      <ConfirmDialog
        isOpen={Boolean(invoiceToCancel)}
        onClose={() => setInvoiceToCancel(null)}
        onConfirm={handleCancelInvoice}
        title="Cancel Unpaid Fee Invoice"
        message={`Are you sure you want to cancel challan #${invoiceToCancel?.challan_number}? This cannot be undone.`}
        confirmText="Confirm Cancellation"
        variant="danger"
        loading={cancelLoading}
      />
    </div>
  );
};
