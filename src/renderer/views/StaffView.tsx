import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  ArrowLeft,
  Plus,
  Phone,
  Mail,
  Award,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Calendar,
  Key,
  DollarSign,
  Briefcase,
  Clock,
  Printer,
  X,
} from 'lucide-react';
import {
  Button,
  Input,
  Select,
  Modal,
  Badge,
  DataTable,
  Column,
  ErrorPanel,
} from '../components/ui';
import { useToast } from '../context/ToastContext';

interface StaffViewProps {
  onBack: () => void;
  sessionToken?: string | null;
}

export const StaffView: React.FC<StaffViewProps> = ({ onBack, sessionToken }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<'directory' | 'attendance' | 'payroll'>('directory');
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal error states
  const [addStaffError, setAddStaffError] = useState<string | null>(null);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Daily Staff Attendance State
  const [attendanceDate, setAttendanceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [staffAttendanceState, setStaffAttendanceState] = useState<{ [employeeId: string]: { status: 'present' | 'absent' | 'late' | 'leave' | 'half_day'; remarks: string } }>({});
  const [staffAttSummary, setStaffAttSummary] = useState<any | null>(null);
  const [attSaving, setAttSaving] = useState(false);

  // Payroll State
  const [payrollRuns, setPayrollRuns] = useState<any[]>([]);
  const [salaryStructures, setSalaryStructures] = useState<any[]>([]);
  const [salaryEmployee, setSalaryEmployee] = useState<any | null>(null);
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryError, setSalaryError] = useState<string | null>(null);
  const [salaryForm, setSalaryForm] = useState({ basicSalary: '', allowances: '0', deductions: '0' });
  const [isGeneratePayrollOpen, setIsGeneratePayrollOpen] = useState(false);
  const [generatePayrollLoading, setGeneratePayrollLoading] = useState(false);
  const [payrollMonth, setPayrollMonth] = useState('November');
  const [payrollYear, setPayrollYear] = useState(2026);
  const [selectedRunDetails, setSelectedRunDetails] = useState<any | null>(null);
  const [isRunDetailsOpen, setIsRunDetailsOpen] = useState(false);

  // User Account Provisioning State
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [accountEmployee, setAccountEmployee] = useState<any | null>(null);
  const [accountForm, setAccountForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'teacher',
  });
  const [accountLoading, setAccountLoading] = useState(false);

  // Add Staff Modal State
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [staffForm, setStaffForm] = useState({
    employeeCode: '',
    fullName: '',
    designation: '',
    department: '',
    isTeaching: true,
    phone: '',
    email: '',
    qualification: '',
    status: 'active',
    joinedDate: new Date().toISOString().split('T')[0],
  });

  const loadData = useCallback(async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setLoading(true);
    setError(null);
    try {
      const [staffList, runs, structures, attList, attSum] = await Promise.all([
        window.desktopAPI.getStaff(sessionToken, {
          search: searchTerm || undefined,
          status: statusFilter || undefined,
        }),
        window.desktopAPI.listPayrollRuns(sessionToken),
        window.desktopAPI.listSalaryStructures(sessionToken),
        window.desktopAPI.getStaffAttendance(sessionToken, attendanceDate),
        window.desktopAPI.getStaffAttendanceSummary(sessionToken, attendanceDate),
      ]);
      setStaff(staffList);
      setPayrollRuns(runs);
      setSalaryStructures(structures);
      setStaffAttSummary(attSum);

      // Populate staff attendance state
      const stateMap: any = {};
      staffList.forEach((emp: any) => {
        const found = attList.find((a: any) => a.employee_id === emp.id);
        stateMap[emp.id] = {
          status: found ? found.status : 'present',
          remarks: found?.remarks || '',
        };
      });
      setStaffAttendanceState(stateMap);
    } catch (err: any) {
      console.error('Failed to load staff:', err);
      setError(err.message || 'Failed to retrieve staff directory');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, searchTerm, statusFilter, attendanceDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Save Staff Attendance
  const handleSaveStaffAttendance = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setAttSaving(true);
    try {
      const entries = Object.keys(staffAttendanceState).map((empId) => ({
        id: `satt_${empId}_${attendanceDate}`,
        employeeId: empId,
        date: attendanceDate,
        status: staffAttendanceState[empId].status,
        remarks: staffAttendanceState[empId].remarks || undefined,
      }));

      const res = await window.desktopAPI.recordStaffAttendance(sessionToken, entries);
      if (!res.success) throw new Error(res.error || 'Failed to save staff attendance');

      await loadData();
      toastSuccess(`Staff attendance saved for ${entries.length} employees on ${attendanceDate}.`, 'Attendance Saved');
    } catch (err: any) {
      toastError(err.message || 'Failed to record staff attendance', 'Attendance Error');
    } finally {
      setAttSaving(false);
    }
  };

  // Generate Monthly Payroll
  const handleGeneratePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setGeneratePayrollLoading(true);
    setPayrollError(null);
    try {
      const res = await window.desktopAPI.generatePayrollRun(sessionToken, {
        month: payrollMonth,
        year: Number(payrollYear),
      });

      if (!res.success) throw new Error(res.error || 'Payroll run generation failed');

      setIsGeneratePayrollOpen(false);
      setPayrollError(null);
      await loadData();
      toastSuccess(`Payroll run generated for ${payrollMonth} ${payrollYear}.`, 'Payroll Generated');
    } catch (err: any) {
      setPayrollError(err.message || 'Failed to generate payroll run');
    } finally {
      setGeneratePayrollLoading(false);
    }
  };

  // View Payroll Details
  const handleViewPayrollDetails = async (runId: string) => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const details = await window.desktopAPI.getPayrollRunDetails(sessionToken, runId);
      setSelectedRunDetails(details);
      setIsRunDetailsOpen(true);
    } catch (err: any) {
      toastError(err.message || 'Failed to load payroll run details', 'Payroll Notice');
    }
  };

  // Mark Slip Paid
  const handleMarkSlipPaid = async (slipId: string) => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const res = await window.desktopAPI.markPayrollSlipPaid(sessionToken, {
        slipId,
        paymentMethod: 'bank_transfer',
        paymentReference: `REF-${Date.now().toString().slice(-6)}`,
      });

      if (!res.success) throw new Error(res.error || 'Failed to mark slip paid');

      toastSuccess('Salary slip marked as paid. Bank reference logged.', 'Salary Disbursed');
      if (selectedRunDetails?.run?.id) {
        await handleViewPayrollDetails(selectedRunDetails.run.id);
      }
    } catch (err: any) {
      toastError(err.message || 'Failed to mark slip paid', 'Payment Error');
    }
  };

  // Save Salary Structure
  const handleSaveSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryEmployee || !window.desktopAPI || !sessionToken) return;
    setSalaryLoading(true);
    setSalaryError(null);
    try {
      const basic = Number(salaryForm.basicSalary || 0);
      const allow = Number(salaryForm.allowances || 0);
      const ded = Number(salaryForm.deductions || 0);
      const res = await window.desktopAPI.saveSalaryStructure(sessionToken, {
        employeeId: salaryEmployee.id,
        basicSalary: basic,
        allowancesJson: JSON.stringify(allow > 0 ? [{ label: 'Standard Allowance', amount: allow }] : []),
        deductionsJson: JSON.stringify(ded > 0 ? [{ label: 'Standard Deduction', amount: ded }] : []),
      });
      if (!res.success) throw new Error(res.error || 'Failed to save salary structure');
      setIsSalaryModalOpen(false);
      setSalaryEmployee(null);
      await loadData();
      toastSuccess(`Salary structure saved for ${salaryEmployee.fullName}.`, 'Salary Updated');
    } catch (err: any) {
      setSalaryError(err?.message || 'Failed to save salary structure');
    } finally {
      setSalaryLoading(false);
    }
  };

  // Create Staff
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setAddLoading(true);
    setAddStaffError(null);
    try {
      const empId = `emp_${Date.now()}`;
      const res = await window.desktopAPI.createStaff(sessionToken, {
        id: empId,
        employeeCode: staffForm.employeeCode,
        fullName: staffForm.fullName,
        designation: staffForm.designation,
        department: staffForm.department,
        isTeaching: staffForm.isTeaching,
        phone: staffForm.phone || null,
        email: staffForm.email || null,
        qualification: staffForm.qualification || null,
        status: staffForm.status as any,
        joinedDate: staffForm.joinedDate,
      });

      if (!res.success) throw new Error(res.error || 'Failed to create staff');

      setIsAddStaffOpen(false);
      setAddStaffError(null);
      await loadData();
      toastSuccess(`Faculty member "${staffForm.fullName}" registered.`, 'Staff Registered');
    } catch (err: any) {
      setAddStaffError(err.message || 'Failed to create staff member');
    } finally {
      setAddLoading(false);
    }
  };

  // Create Staff User Account
  const handleCreateUserAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountEmployee || !window.desktopAPI || !sessionToken) return;
    setAccountLoading(true);
    setAccountError(null);
    try {
      const res = await window.desktopAPI.createStaffUserAccount(sessionToken, {
        employeeId: accountEmployee.id,
        username: accountForm.username,
        email: accountForm.email,
        password: accountForm.password,
        role: accountForm.role,
        fullName: accountEmployee.fullName,
      });

      if (!res.success) throw new Error(res.error || 'Failed to create user account');

      setIsCreateAccountOpen(false);
      setAccountEmployee(null);
      setAccountError(null);
      toastSuccess(`Workstation login account "${accountForm.username}" provisioned.`, 'Account Provisioned');
    } catch (err: any) {
      setAccountError(err.message || 'Failed to provision staff account');
    } finally {
      setAccountLoading(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'employeeCode',
      header: 'Code',
      width: '100px',
      render: (val) => <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{val}</span>,
    },
    {
      key: 'fullName',
      header: 'Staff Member',
      render: (val, row) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{val}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{row.designation} — <span className="text-indigo-600 dark:text-indigo-400">{row.department || 'Academics'}</span></div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (val) => <span className="text-xs font-mono text-slate-700 dark:text-slate-300">{val || '—'}</span>,
    },
    {
      key: 'qualification',
      header: 'Qualification',
      render: (val) => <span className="text-xs text-slate-600 dark:text-slate-400">{val || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (val) => {
        const variant = val === 'active' ? 'success' : 'neutral';
        return <Badge variant={variant} dot>{String(val).toUpperCase()}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (_, row) => {
        const existingSal = salaryStructures.find((st) => st.employeeId === row.id || st.employee_id === row.id);
        return (
          <div className="inline-flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSalaryEmployee(row);
                const basic = existingSal?.basicSalary ?? existingSal?.basic_salary ?? 35000;
                let allowSum = 0;
                let dedSum = 0;
                try {
                  const arr = JSON.parse(existingSal?.allowancesJson || existingSal?.allowances_json || '[]');
                  allowSum = Array.isArray(arr) ? arr.reduce((a: number, x: any) => a + Number(x.amount || 0), 0) : 0;
                } catch {}
                try {
                  const arr = JSON.parse(existingSal?.deductionsJson || existingSal?.deductions_json || '[]');
                  dedSum = Array.isArray(arr) ? arr.reduce((a: number, x: any) => a + Number(x.amount || 0), 0) : 0;
                } catch {}
                setSalaryForm({ basicSalary: String(basic), allowances: String(allowSum), deductions: String(dedSum) });
                setSalaryError(null);
                setIsSalaryModalOpen(true);
              }}
              title="Configure Monthly Salary Structure"
            >
              <DollarSign className="w-3.5 h-3.5" />
              Salary
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAccountEmployee(row);
                setAccountForm({
                  username: row.fullName.toLowerCase().replace(/[^a-z0-9]/g, '') + row.employeeCode.toLowerCase().replace(/[^a-z0-9]/g, ''),
                  email: row.email || `${row.employeeCode.toLowerCase()}@schoolos.local`,
                  password: 'Staff@Password123',
                  role: row.isTeaching ? 'teacher' : 'accountant',
                });
                setIsCreateAccountOpen(true);
              }}
              title="Provision Staff User Account"
            >
              <Key className="w-3.5 h-3.5" />
              Create Login
            </Button>
          </div>
        );
      },
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
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Faculty, Staff & Payroll Management
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Faculty directory, independent staff attendance, user account provisioning & monthly payroll disbursements
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'payroll' ? (
            <Button variant="primary" onClick={() => setIsGeneratePayrollOpen(true)}>
              <DollarSign className="w-4 h-4 mr-1.5" />
              Generate Monthly Payroll
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                const nextCode = `EMP-${String(staff.length + 1).padStart(3, '0')}`;
                setStaffForm({
                  employeeCode: nextCode,
                  fullName: '',
                  designation: '',
                  department: '',
                  isTeaching: true,
                  phone: '',
                  email: '',
                  qualification: '',
                  status: 'active',
                  joinedDate: new Date().toISOString().split('T')[0],
                });
                setIsAddStaffOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Staff Member
            </Button>
          )}
        </div>
      </div>

      {error && (
        <ErrorPanel
          message={error}
          onDismiss={() => setError(null)}
          onRetry={loadData}
        />
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('directory')}
          className={`pb-3 transition-colors ${activeTab === 'directory' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Staff Directory ({staff.length})
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-3 transition-colors ${activeTab === 'attendance' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Staff Daily Attendance
        </button>
        <button
          onClick={() => setActiveTab('payroll')}
          className={`pb-3 transition-colors ${activeTab === 'payroll' ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        >
          Payroll & Salaries ({payrollRuns.length})
        </button>
      </div>

      {/* TAB CONTENT: DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <DataTable
            columns={columns}
            data={staff}
            loading={loading}
            emptyMessage="No staff members registered"
          />
        </div>
      )}

      {/* TAB CONTENT: ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Attendance Date:</span>
              <Input
                type="date"
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
                className="w-44"
              />
            </div>
            {staffAttSummary && (
              <div className="flex flex-wrap gap-4 text-xs font-semibold">
                <span className="text-emerald-700 dark:text-emerald-400">Present: {staffAttSummary.present}</span>
                <span className="text-rose-700 dark:text-rose-400">Absent: {staffAttSummary.absent}</span>
                <span className="text-amber-700 dark:text-amber-400">Late: {staffAttSummary.late}</span>
                <span className="text-sky-700 dark:text-sky-400">Leave: {staffAttSummary.leave}</span>
                <span className="text-indigo-700 dark:text-indigo-400">Rate: {staffAttSummary.percentage}%</span>
              </div>
            )}
            <Button variant="primary" onClick={handleSaveStaffAttendance} loading={attSaving}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Save Roll-Call
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Staff Code</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Roll-Call Status</th>
                  <th className="p-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {staff.map((emp) => (
                  <tr key={emp.id}>
                    <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">{emp.employeeCode}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{emp.fullName}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{emp.designation}</td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">{emp.department || 'Academics'}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {(['present', 'absent', 'late', 'leave', 'half_day'] as const).map((st) => (
                          <label key={st} className="flex items-center gap-1 cursor-pointer text-slate-700 dark:text-slate-300">
                            <input
                              type="radio"
                              name={`att_${emp.id}`}
                              checked={staffAttendanceState[emp.id]?.status === st}
                              onChange={() => {
                                setStaffAttendanceState({
                                  ...staffAttendanceState,
                                  [emp.id]: {
                                    ...staffAttendanceState[emp.id],
                                    status: st,
                                  },
                                });
                              }}
                              className="text-indigo-600"
                            />
                            <span className="capitalize">{st.replace('_', ' ')}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <Input
                        value={staffAttendanceState[emp.id]?.remarks || ''}
                        onChange={(e) => {
                          setStaffAttendanceState({
                            ...staffAttendanceState,
                            [emp.id]: {
                              ...staffAttendanceState[emp.id],
                              remarks: e.target.value,
                            },
                          });
                        }}
                        placeholder="Optional remarks"
                        className="w-48"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: PAYROLL */}
      {activeTab === 'payroll' && (
        <div className="space-y-6">
          {/* Staff Salary Structures Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Staff Salary Structures</h3>
                <p className="text-xs text-slate-500">Configure monthly basic salary, allowances, and deductions for each employee</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{staff.length} staff</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4 text-right">Basic Salary</th>
                    <th className="py-3 px-4 text-right">Allowances</th>
                    <th className="py-3 px-4 text-right">Deductions</th>
                    <th className="py-3 px-4 text-right">Net Salary</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {staff.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-slate-400">No staff members found.</td></tr>
                  ) : staff.map((emp) => {
                    const st = salaryStructures.find((x) => x.employeeId === emp.id || x.employee_id === emp.id);
                    const basic = Number(st?.basicSalary ?? st?.basic_salary ?? 0);
                    const allow = Number(st?.allowances ?? 0);
                    const ded = Number(st?.deductions ?? 0);
                    const net = basic + allow - ded;
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{emp.fullName || emp.full_name}</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{emp.designation || '—'}</td>
                        <td className="py-3 px-4 text-right font-mono">Rs. {basic.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-600">Rs. {allow.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono text-rose-600">Rs. {ded.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">Rs. {net.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSalaryEmployee(emp);
                              setSalaryForm({
                                basicSalary: basic ? String(basic) : '',
                                allowances: String(allow),
                                deductions: String(ded),
                              });
                              setSalaryError(null);
                              setIsSalaryModalOpen(true);
                            }}
                          >
                            {st ? 'Edit Salary' : 'Set Salary'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly Payroll Runs */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Monthly Payroll Runs ({payrollRuns.length})</h3>
            {payrollRuns.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 text-center text-xs text-slate-500">
                No payroll runs generated yet. Set staff salaries above and click &ldquo;Generate Monthly Payroll&rdquo;.
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {payrollRuns.map((r) => (
              <div key={r.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">{r.month} {r.year} Payroll Run</h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Approved by: {r.approvedBy || 'Principal'}</span>
                  </div>
                  <Badge variant={r.status === 'paid' ? 'success' : 'indigo'} dot>{r.status}</Badge>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-2 mt-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400">Total Disbursed:</span>
                  <strong className="text-base font-mono text-slate-900 dark:text-white">Rs. {r.totalDisbursed?.toLocaleString()}</strong>
                </div>
                <div className="mt-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => handleViewPayrollDetails(r.id)}>
                    View Payslips
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GENERATE PAYROLL MODAL */}
      <Modal
        isOpen={isGeneratePayrollOpen}
        onClose={() => setIsGeneratePayrollOpen(false)}
        title="Execute Monthly Payroll Run"
        subtitle="Calculates gross salaries, allowances, deductions and generates individual staff payslips"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsGeneratePayrollOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleGeneratePayroll} loading={generatePayrollLoading}>
              Generate Payroll Run
            </Button>
          </>
        }
      >
        <form onSubmit={handleGeneratePayroll} className="space-y-3">
          {payrollError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{payrollError}</span>
              </div>
              <button type="button" onClick={() => setPayrollError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Select
            label="Payroll Month"
            value={payrollMonth}
            onChange={(e) => setPayrollMonth(e.target.value)}
          >
            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <Input
            label="Year"
            type="number"
            value={payrollYear}
            onChange={(e) => setPayrollYear(Number(e.target.value))}
            required
          />
        </form>
      </Modal>

      {/* VIEW PAYSLIPS MODAL */}
      <Modal
        isOpen={isRunDetailsOpen}
        onClose={() => setIsRunDetailsOpen(false)}
        title={`${selectedRunDetails?.run?.month} ${selectedRunDetails?.run?.year} — Staff Payslips`}
        size="4xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsRunDetailsOpen(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Payroll Register
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <table className="w-full text-xs text-left border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Staff Name</th>
                <th className="p-2.5">Code</th>
                <th className="p-2.5">Designation</th>
                <th className="p-2.5 text-right">Basic Salary</th>
                <th className="p-2.5 text-right">Allowances</th>
                <th className="p-2.5 text-right">Deductions</th>
                <th className="p-2.5 text-right">Net Salary</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {selectedRunDetails?.slips?.map((s: any) => (
                <tr key={s.id}>
                  <td className="p-2.5 font-semibold text-slate-900 dark:text-white">{s.employeeName}</td>
                  <td className="p-2.5 font-mono text-slate-800 dark:text-slate-200">{s.employeeCode}</td>
                  <td className="p-2.5 text-slate-600 dark:text-slate-400">{s.designation}</td>
                  <td className="p-2.5 font-mono text-right text-slate-800 dark:text-slate-200">Rs. {s.basicSalary?.toLocaleString()}</td>
                  <td className="p-2.5 font-mono text-right text-emerald-700 dark:text-emerald-400">+Rs. {s.totalAllowances?.toLocaleString()}</td>
                  <td className="p-2.5 font-mono text-right text-rose-700 dark:text-rose-400">-Rs. {s.totalDeductions?.toLocaleString()}</td>
                  <td className="p-2.5 font-mono text-right font-bold text-slate-900 dark:text-white">Rs. {s.netSalary?.toLocaleString()}</td>
                  <td className="p-2.5">
                    <Badge variant={s.paymentStatus === 'paid' ? 'success' : 'neutral'} dot>{s.paymentStatus}</Badge>
                  </td>
                  <td className="p-2.5 text-right">
                    {s.paymentStatus !== 'paid' && (
                      <Button size="sm" variant="primary" onClick={() => handleMarkSlipPaid(s.id)}>
                        Mark Paid
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* CREATE STAFF MODAL */}
      <Modal
        isOpen={isAddStaffOpen}
        onClose={() => setIsAddStaffOpen(false)}
        title="Add Staff Member"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddStaffOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateStaff} loading={addLoading}>
              Add Employee
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateStaff} className="space-y-3">
          {addStaffError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{addStaffError}</span>
              </div>
              <button type="button" onClick={() => setAddStaffError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Input
            label="Employee Code"
            value={staffForm.employeeCode}
            onChange={(e) => setStaffForm({ ...staffForm, employeeCode: e.target.value })}
            required
          />
          <Input
            label="Full Name"
            value={staffForm.fullName}
            onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })}
            required
          />
          <Input
            label="Designation"
            value={staffForm.designation}
            onChange={(e) => setStaffForm({ ...staffForm, designation: e.target.value })}
            required
          />
          <Select
            label="Department"
            value={staffForm.department}
            onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}
          >
            <option value="Academics">Academics</option>
            <option value="Administration">Administration</option>
            <option value="Finance">Finance</option>
            <option value="Support">Support Staff</option>
          </Select>
          <Input
            label="Phone"
            value={staffForm.phone}
            onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
          />
          <Input
            label="Qualification"
            value={staffForm.qualification}
            onChange={(e) => setStaffForm({ ...staffForm, qualification: e.target.value })}
          />
        </form>
      </Modal>

      {/* CREATE STAFF USER ACCOUNT MODAL */}
      <Modal
        isOpen={isCreateAccountOpen}
        onClose={() => setIsCreateAccountOpen(false)}
        title={`Provision Login Account — ${accountEmployee?.fullName}`}
        subtitle="Creates secure Scrypt user credentials and binds RBAC role"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCreateAccountOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateUserAccount} loading={accountLoading}>
              Create Login Credentials
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateUserAccount} className="space-y-3">
          {accountError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{accountError}</span>
              </div>
              <button type="button" onClick={() => setAccountError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Input
            label="Username"
            value={accountForm.username}
            onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
            required
          />
          <Input
            label="Email Address"
            type="email"
            value={accountForm.email}
            onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
            required
          />
          <Input
            label="Initial Password"
            value={accountForm.password}
            onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
            required
          />
          <Select
            label="System RBAC Role"
            value={accountForm.role}
            onChange={(e) => setAccountForm({ ...accountForm, role: e.target.value })}
          >
            <option value="teacher">Teacher (Academics & Attendance)</option>
            <option value="accountant">Accountant (Fees & Accounts)</option>
            <option value="principal">Principal (Full Operations)</option>
            <option value="school_admin">School Admin (System Settings)</option>
          </Select>
        </form>
      </Modal>

      {/* Configure Salary Structure Modal */}
      <Modal
        isOpen={isSalaryModalOpen}
        onClose={() => setIsSalaryModalOpen(false)}
        title={salaryEmployee ? `Salary Structure — ${salaryEmployee.fullName}` : 'Configure Salary Structure'}
        subtitle="Set monthly basic pay, allowances, and deductions for payroll runs"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsSalaryModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveSalary} isLoading={salaryLoading}>Save Salary</Button>
          </>
        }
      >
        <form onSubmit={handleSaveSalary} className="space-y-4">
          {salaryError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{salaryError}</div>
          )}
          <Input
            label="Basic Monthly Salary (Rs.)"
            type="number"
            min="0"
            required
            value={salaryForm.basicSalary}
            onChange={(e) => setSalaryForm({ ...salaryForm, basicSalary: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Total Allowances (Rs.)"
              type="number"
              min="0"
              value={salaryForm.allowances}
              onChange={(e) => setSalaryForm({ ...salaryForm, allowances: e.target.value })}
            />
            <Input
              label="Total Deductions (Rs.)"
              type="number"
              min="0"
              value={salaryForm.deductions}
              onChange={(e) => setSalaryForm({ ...salaryForm, deductions: e.target.value })}
            />
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Estimated Net Pay:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              Rs. {Math.max(0, Number(salaryForm.basicSalary || 0) + Number(salaryForm.allowances || 0) - Number(salaryForm.deductions || 0)).toLocaleString()}
            </span>
          </div>
        </form>
      </Modal>
    </div>
  );
};
