import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Inbox,
  Globe,
  Search,
  Plus,
  Check,
  X,
  WifiOff,
  Users,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';

export interface OnlineModuleField {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'date' | 'textarea' | 'select';
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
}

export interface OnlineModuleConfig {
  id: string;
  title: string;
  subtitle: string;
  endpoint: string;
  columns: Array<{ key: string; label: string; render?: (row: any) => string }>;
  createEndpoint?: string;
  createLabel?: string;
  createFields?: OnlineModuleField[];
  decisionEndpoint?: (id: string) => string;
  profileEndpoint?: (id: string) => string;
}

export const ONLINE_MODULES: Record<string, OnlineModuleConfig> = {
  parents: {
    id: 'parents',
    title: 'Parents & Guardians',
    subtitle: 'Family directory and linked student guardian accounts (click any row to view children & profile)',
    endpoint: '/parents?limit=200',
    createEndpoint: '/parents',
    createLabel: 'Add Parent',
    profileEndpoint: (id) => `/parents/${id}`,
    createFields: [
      { name: 'name', label: 'Full Name', required: true, placeholder: 'Enter guardian full name' },
      { name: 'phone', label: 'Phone Number', required: true, placeholder: 'e.g. 0300-1234567' },
      { name: 'email', label: 'Email Address', type: 'email', placeholder: 'Optional email' },
      { name: 'cnic', label: 'CNIC', placeholder: 'e.g. 35201-1234567-1' },
      { name: 'occupation', label: 'Occupation', placeholder: 'Optional occupation' },
      { name: 'address', label: 'Address', placeholder: 'Home address' },
    ],
    columns: [
      { key: 'name', label: 'Guardian Name', render: (r) => r.name || r.fullName || '—' },
      { key: 'phone', label: 'Phone', render: (r) => r.phone || r.mobile || '—' },
      { key: 'email', label: 'Email', render: (r) => r.email || '—' },
      { key: 'children', label: 'Linked Children', render: (r) => Array.isArray(r.children) ? `${r.children.length} student(s)` : (r.studentsCount != null ? `${r.studentsCount} student(s)` : 'Click to view') },
    ],
  },
  approvals: {
    id: 'approvals',
    title: 'Approvals Queue',
    subtitle: 'Pending administrative approvals for fee waivers, reversals, and expenses',
    endpoint: '/approvals?limit=100',
    decisionEndpoint: (id) => `/approvals/${id}/decision`,
    columns: [
      { key: 'type', label: 'Request Type', render: (r) => String(r.type || r.kind || '—').replace(/_/g, ' ') },
      { key: 'status', label: 'Status', render: (r) => r.status || 'pending' },
      { key: 'reason', label: 'Reason', render: (r) => r.reason || r.note || '—' },
      { key: 'createdAt', label: 'Requested', render: (r) => String(r.createdAt || '').slice(0, 10) || '—' },
    ],
  },
  leave: {
    id: 'leave',
    title: 'Leave Requests',
    subtitle: 'Student and staff leave applications and approval status',
    endpoint: '/leave-requests?limit=100',
    decisionEndpoint: (id) => `/leave-requests/${id}/decision`,
    columns: [
      {
        key: 'studentName',
        label: 'Applicant',
        render: (r) =>
          r.studentId?.firstName
            ? `${r.studentId.firstName} ${r.studentId.lastName || ''}`.trim()
            : r.employeeId?.firstName
            ? `${r.employeeId.firstName} ${r.employeeId.lastName || ''}`.trim()
            : r.applicantName || '—',
      },
      { key: 'fromDate', label: 'From', render: (r) => String(r.fromDate || '').slice(0, 10) || '—' },
      { key: 'toDate', label: 'To', render: (r) => String(r.toDate || '').slice(0, 10) || '—' },
      { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
      { key: 'status', label: 'Status', render: (r) => r.status || 'pending' },
    ],
  },
  homework: {
    id: 'homework',
    title: 'Homework & Assignments',
    subtitle: 'Publish, review, and track class homework assignments across sections',
    endpoint: '/homework?limit=100',
    createEndpoint: '/homework',
    createLabel: 'Publish Homework',
    createFields: [
      { name: 'title', label: 'Assignment Title', required: true, placeholder: 'e.g. Chapter 4 Exercises' },
      { name: 'description', label: 'Instructions', type: 'textarea', required: true, placeholder: 'Describe homework tasks and page numbers' },
      { name: 'dueDate', label: 'Due Date', type: 'date', required: true },
    ],
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'subject', label: 'Subject', render: (r) => r.subjectId?.name || '—' },
      { key: 'section', label: 'Class / Section', render: (r) => r.sectionId?.name || '—' },
      { key: 'dueDate', label: 'Due Date', render: (r) => String(r.dueDate || '').slice(0, 10) || '—' },
      { key: 'status', label: 'Status', render: (r) => r.status || 'active' },
    ],
  },
  certificates: {
    id: 'certificates',
    title: 'Certificates & Templates',
    subtitle: 'Manage school leaving, character, and bonafide certificate templates',
    endpoint: '/certificate-templates',
    createEndpoint: '/certificate-templates',
    createLabel: 'New Template',
    createFields: [
      { name: 'name', label: 'Template Name', required: true, placeholder: 'e.g. Character Certificate' },
      {
        name: 'type',
        label: 'Category',
        type: 'select',
        required: true,
        options: [
          { value: 'bonafide', label: 'Bonafide Certificate' },
          { value: 'character', label: 'Character Certificate' },
          { value: 'leaving', label: 'School Leaving Certificate' },
          { value: 'custom', label: 'Custom Certificate' },
        ],
      },
      { name: 'body', label: 'Certificate Body Text', type: 'textarea', required: true, placeholder: 'This is to certify that {{studentName}}...' },
    ],
    columns: [
      { key: 'name', label: 'Template Name', render: (r) => r.name || r.title || '—' },
      { key: 'type', label: 'Category', render: (r) => String(r.type || r.category || r.kind || 'Standard').replace(/_/g, ' ') },
      { key: 'updatedAt', label: 'Updated', render: (r) => String(r.updatedAt || r.createdAt || '').slice(0, 10) || '—' },
    ],
  },
  subscription: {
    id: 'subscription',
    title: 'Subscription & Plan',
    subtitle: 'Active school plan entitlements, billing cycle, and license status',
    endpoint: '/subscription',
    columns: [
      { key: 'planName', label: 'Plan', render: (r) => r.plan?.name || r.planName || r.tier || 'Standard' },
      { key: 'status', label: 'Status', render: (r) => r.status || 'active' },
      { key: 'currentPeriodEnd', label: 'Valid Until', render: (r) => String(r.currentPeriodEnd || r.expiresAt || '').slice(0, 10) || '—' },
      { key: 'studentLimit', label: 'Student Limit', render: (r) => String(r.limits?.students ?? r.plan?.limits?.students ?? r.studentLimit ?? 'Unlimited') },
    ],
  },
};

function unwrapApiList(d: any): any[] {
  if (!d) return [];
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.templates)) return d.templates;
  if (Array.isArray(d.certificates)) return d.certificates;
  if (Array.isArray(d.data)) return d.data;
  if (Array.isArray(d.results)) return d.results;
  // Single object (e.g., /subscription) — only wrap if it has meaningful keys
  if (typeof d === 'object') {
    const keys = Object.keys(d).filter((k) => !['meta', 'pagination', 'total', 'page', 'limit'].includes(k));
    if (keys.length === 0) return [];
    // If all keys are empty arrays, return []
    const onlyEmptyArrays = keys.every((k) => Array.isArray(d[k]) && d[k].length === 0);
    if (onlyEmptyArrays) return [];
    return [d];
  }
  return [];
}

function renderStatusBadge(val: string) {
  const lower = val.toLowerCase();
  if (['approved', 'active', 'completed', 'converted', 'paid', 'published'].includes(lower)) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 capitalize">
        {val}
      </span>
    );
  }
  if (['rejected', 'cancelled', 'expired', 'failed', 'lost'].includes(lower)) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60 capitalize">
        {val}
      </span>
    );
  }
  if (['pending', 'paused', 'new', 'contacted', 'in_progress'].includes(lower)) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 capitalize">
        {val.replace(/_/g, ' ')}
      </span>
    );
  }
  return <span className="capitalize">{val}</span>;
}

interface OnlineModuleViewProps {
  moduleId: string;
  sessionToken: string;
  onBack: () => void;
}

export const OnlineModuleView: React.FC<OnlineModuleViewProps> = ({ moduleId, sessionToken, onBack }) => {
  const cfg = ONLINE_MODULES[moduleId];
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // Parent / Row Profile Drawer Modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileDetail, setProfileDetail] = useState<any | null>(null);

  const load = useCallback(async () => {
    if (!cfg) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.desktopAPI.onlineRequest(sessionToken, { method: 'GET', path: cfg.endpoint });
      if (!res.ok) {
        setError(res.error || 'Could not load records from central backend.');
        setRows([]);
      } else {
        setRows(unwrapApiList(res.data));
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to connect to central backend.');
    } finally {
      setLoading(false);
    }
  }, [cfg, sessionToken]);

  useEffect(() => {
    setSearch('');
    setCreateOpen(false);
    setFormValues({});
    setProfileOpen(false);
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((row) =>
      cfg.columns.some((col) => {
        const text = col.render ? col.render(row) : String(row[col.key] ?? '');
        return text.toLowerCase().includes(q);
      })
    );
  }, [rows, search, cfg]);

  const openProfile = async (row: any) => {
    if (!cfg?.profileEndpoint) return;
    const id = row._id || row.id;
    if (!id) return;
    setProfileOpen(true);
    setProfileDetail(row);
    setProfileLoading(true);
    try {
      const res = await window.desktopAPI.onlineRequest(sessionToken, {
        method: 'GET',
        path: cfg.profileEndpoint(id),
      });
      if (res.ok && res.data) {
        setProfileDetail(res.data);
      }
    } catch {}
    finally {
      setProfileLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfg?.createEndpoint) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await window.desktopAPI.onlineRequest(sessionToken, {
        method: 'POST',
        path: cfg.createEndpoint,
        body: formValues,
      });
      if (!res.ok) {
        setError(res.error || 'Failed to save record on central backend.');
      } else {
        setCreateOpen(false);
        setFormValues({});
        await load();
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to reach central backend.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (row: any, decision: 'approved' | 'rejected') => {
    if (!cfg?.decisionEndpoint) return;
    const id = row._id || row.id;
    if (!id) return;
    setActionBusyId(id);
    setError(null);
    try {
      const res = await window.desktopAPI.onlineRequest(sessionToken, {
        method: 'POST',
        path: cfg.decisionEndpoint(id),
        body: { decision },
      });
      if (!res.ok) {
        setError(res.error || `Failed to mark item as ${decision}.`);
      } else {
        await load();
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to submit decision.');
    } finally {
      setActionBusyId(null);
    }
  };

  if (!cfg) return null;

  const isOfflineError = error && /unable to reach|offline|timed out|connect/i.test(error);

  return (
    <div className="space-y-6 pb-8">
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263147] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-3.5">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-xl border border-[#E2E8F0] dark:border-[#263147] hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-xl font-bold text-[#16213E] dark:text-white">{cfg.title}</h1>
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EFF6FF] dark:bg-blue-950/60 text-[#2563EB] dark:text-blue-300">
                <Globe className="w-3.5 h-3.5" />
                <span>Server-First</span>
              </span>
            </div>
            <p className="text-sm text-[#5B6780] dark:text-slate-400 mt-0.5">{cfg.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2.5">
          {cfg.createEndpoint && cfg.createFields && (
            <button
              type="button"
              onClick={() => { setFormValues({}); setCreateOpen(true); }}
              className="h-10 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold flex items-center space-x-2 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>{cfg.createLabel || 'Create New'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={load}
            className="h-10 px-4 rounded-xl border border-[#E2E8F0] dark:border-[#263147] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-semibold flex items-center space-x-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center space-x-2.5 ${
            isOfflineError
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              : 'bg-[#FFF1F2] dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-[#BE123C] dark:text-rose-300'
          }`}
        >
          {isOfflineError ? <WifiOff className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263147] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] dark:border-[#263147] flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFC] dark:bg-slate-800/40">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Filter ${cfg.title.toLowerCase()}...`}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
            {filteredRows.length} {filteredRows.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading {cfg.title.toLowerCase()}...</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200">No records found</p>
            <p className="text-sm text-slate-500">
              {search ? 'Try clearing your search filter.' : 'Records from your central backend will appear here automatically.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left tabular-nums">
              <thead className="h-12 bg-[#F8FAFC] dark:bg-slate-800/60 border-b border-[#E2E8F0] dark:border-[#263147]">
                <tr>
                  {cfg.columns.map((c) => (
                    <th key={c.key} className="px-5 uppercase">
                      {c.label}
                    </th>
                  ))}
                  {cfg.decisionEndpoint && <th className="px-5 uppercase text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#263147]">
                {filteredRows.map((row, idx) => {
                  const id = row._id || row.id || String(idx);
                  const isPending = String(row.status || '').toLowerCase() === 'pending';
                  return (
                    <tr
                      key={id}
                      onClick={() => cfg.profileEndpoint && openProfile(row)}
                      className={`h-14 transition-colors ${cfg.profileEndpoint ? 'cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-800/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                    >
                      {cfg.columns.map((c) => {
                        const rawVal = c.render ? c.render(row) : String(row[c.key] ?? '—');
                        const isStatusCol = c.key === 'status' || c.key === 'stage' || c.key === 'enabled';
                        return (
                          <td key={c.key} className="px-5 py-3 text-slate-700 dark:text-slate-200">
                            {isStatusCol ? renderStatusBadge(rawVal) : rawVal}
                          </td>
                        );
                      })}
                      {cfg.decisionEndpoint && (
                        <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {isPending ? (
                            <div className="inline-flex items-center space-x-1.5">
                              <button
                                type="button"
                                disabled={actionBusyId === id}
                                onClick={() => handleDecision(row, 'approved')}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionBusyId === id}
                                onClick={() => handleDecision(row, 'rejected')}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 transition"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Record Modal (empty fields by default) */}
      {cfg.createFields && (
        <Modal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          title={cfg.createLabel || `New ${cfg.title}`}
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {cfg.createFields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {field.label}
                  {field.required && <span className="text-rose-500 ml-0.5">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={formValues[field.name] || ''}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                  />
                ) : field.type === 'select' ? (
                  <select
                    required={field.required}
                    value={formValues[field.name] || ''}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                  >
                    <option value="">Select...</option>
                    {(field.options || []).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type || 'text'}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={formValues[field.name] || ''}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end space-x-2.5 pt-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold disabled:opacity-50">
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Parent Profile & Linked Children Modal */}
      <Modal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={profileDetail?.name || profileDetail?.fullName || 'Parent Profile'}
      >
        {profileLoading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading parent profile...</div>
        ) : profileDetail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
              <div><span className="text-xs text-slate-500 block">Phone</span><span className="font-semibold">{profileDetail.phone || '—'}</span></div>
              <div><span className="text-xs text-slate-500 block">Email</span><span className="font-semibold">{profileDetail.email || '—'}</span></div>
              <div><span className="text-xs text-slate-500 block">CNIC</span><span className="font-semibold">{profileDetail.cnic || '—'}</span></div>
              <div><span className="text-xs text-slate-500 block">Occupation</span><span className="font-semibold">{profileDetail.occupation || '—'}</span></div>
              <div className="col-span-2"><span className="text-xs text-slate-500 block">Address</span><span className="font-semibold">{profileDetail.address || '—'}</span></div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center space-x-2 mb-2">
                <Users className="w-4 h-4 text-[#2563EB]" />
                <span>Linked Children</span>
              </h3>
              {Array.isArray(profileDetail.children || profileDetail.students) && (profileDetail.children || profileDetail.students).length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  {(profileDetail.children || profileDetail.students).map((child: any, idx: number) => (
                    <div key={child._id || child.id || idx} className="px-4 py-2.5 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {child.firstName ? `${child.firstName} ${child.lastName || ''}`.trim() : child.fullName || child.name || 'Student'}
                        </p>
                        <p className="text-xs text-slate-500">{child.admissionNo || child.admissionNumber || '—'}</p>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {child.className || child.classId?.name || child.status || 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No linked students found for this guardian.</p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
