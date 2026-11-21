import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, RefreshCw, AlertCircle, Inbox, Globe } from 'lucide-react';

export interface OnlineModuleConfig {
  id: string;
  title: string;
  subtitle: string;
  endpoint: string;
  columns: Array<{ key: string; label: string; render?: (row: any) => string }>;
}

export const ONLINE_MODULES: Record<string, OnlineModuleConfig> = {
  admissions: {
    id: 'admissions',
    title: 'Admissions & Inquiries',
    subtitle: 'Track prospective student inquiries, follow-ups, and conversions',
    endpoint: '/admissions/inquiries?limit=100',
    columns: [
      { key: 'inquiryNo', label: 'Inquiry #' },
      { key: 'studentName', label: 'Student' },
      { key: 'parentName', label: 'Parent / Guardian' },
      { key: 'phone', label: 'Phone' },
      { key: 'stage', label: 'Stage' },
    ],
  },
  parents: {
    id: 'parents',
    title: 'Parents & Guardians',
    subtitle: 'Family directory and linked student guardian accounts',
    endpoint: '/parents?limit=100',
    columns: [
      { key: 'name', label: 'Guardian Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'occupation', label: 'Occupation' },
    ],
  },
  approvals: {
    id: 'approvals',
    title: 'Approvals Queue',
    subtitle: 'Pending administrative approvals for fee waivers, reversals, and expenses',
    endpoint: '/approvals?limit=100',
    columns: [
      { key: 'type', label: 'Request Type' },
      { key: 'status', label: 'Status' },
      { key: 'reason', label: 'Reason' },
      { key: 'createdAt', label: 'Requested', render: (r) => String(r.createdAt || '').slice(0, 10) },
    ],
  },
  leave: {
    id: 'leave',
    title: 'Leave Requests',
    subtitle: 'Student and staff leave applications and approval status',
    endpoint: '/leave-requests?limit=100',
    columns: [
      { key: 'studentName', label: 'Applicant', render: (r) => r.studentId?.firstName ? `${r.studentId.firstName} ${r.studentId.lastName || ''}`.trim() : (r.applicantName || '—') },
      { key: 'fromDate', label: 'From', render: (r) => String(r.fromDate || '').slice(0, 10) },
      { key: 'toDate', label: 'To', render: (r) => String(r.toDate || '').slice(0, 10) },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status' },
    ],
  },
  homework: {
    id: 'homework',
    title: 'Homework & Assignments',
    subtitle: 'Class homework assignments and due dates across sections',
    endpoint: '/homework?limit=100',
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'subject', label: 'Subject', render: (r) => r.subjectId?.name || '—' },
      { key: 'dueDate', label: 'Due Date', render: (r) => String(r.dueDate || '').slice(0, 10) },
      { key: 'status', label: 'Status', render: (r) => r.status || 'active' },
    ],
  },
  certificates: {
    id: 'certificates',
    title: 'Certificates & Templates',
    subtitle: 'School leaving, character, and bonafide certificate templates',
    endpoint: '/certificate-templates',
    columns: [
      { key: 'name', label: 'Template Name' },
      { key: 'type', label: 'Category' },
      { key: 'updatedAt', label: 'Updated', render: (r) => String(r.updatedAt || '').slice(0, 10) },
    ],
  },
};

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

  const load = useCallback(async () => {
    if (!cfg) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.desktopAPI.onlineRequest(sessionToken, { method: 'GET', path: cfg.endpoint });
      if (!res.ok) {
        setError(res.error || 'Could not load records from cloud backend.');
        setRows([]);
      } else {
        const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
        setRows(list);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to connect to cloud backend.');
    } finally {
      setLoading(false);
    }
  }, [cfg, sessionToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (!cfg) return null;

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
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EFF6FF] text-[#2563EB]">
                <Globe className="w-3.5 h-3.5" />
                <span>Online</span>
              </span>
            </div>
            <p className="text-sm text-[#5B6780] dark:text-slate-400 mt-0.5">{cfg.subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="h-10 px-4 rounded-xl border border-[#E2E8F0] dark:border-[#263147] bg-white dark:bg-slate-800 hover:bg-slate-50 text-sm font-semibold flex items-center space-x-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#FFF1F2] border border-rose-200 text-[#BE123C] text-sm flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263147] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading {cfg.title.toLowerCase()}...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200">No records found</p>
            <p className="text-sm text-slate-500">Records from your cloud backend will appear here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left tabular-nums">
              <thead className="h-12 bg-[#F8FAFC] dark:bg-slate-800/60 border-b border-[#E2E8F0] dark:border-[#263147]">
                <tr>
                  {cfg.columns.map((c) => (
                    <th key={c.key} className="px-5 uppercase">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#263147]">
                {rows.map((row, idx) => (
                  <tr key={row._id || row.id || idx} className="h-14 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {cfg.columns.map((c) => (
                      <td key={c.key} className="px-5 py-3 text-slate-700 dark:text-slate-200">
                        {c.render ? c.render(row) : (row[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
