import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  UserRoundCog,
  Pencil,
  Ban,
  AlertCircle,
  WifiOff,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';

interface SubstitutesViewProps {
  sessionToken: string;
  onBack: () => void;
}

const CAPS = [
  { value: 'attendance', label: 'Take attendance' },
  { value: 'homework', label: 'Set and grade homework' },
  { value: 'marks', label: 'Enter exam marks' },
] as const;

const STATE_LABELS: Record<string, string> = {
  current: 'Covering now',
  upcoming: 'Upcoming',
  expired: 'Ended',
  cancelled: 'Cancelled',
};

function refName(ref: any): string {
  if (!ref) return '—';
  if (typeof ref === 'string') return ref;
  if (ref.firstName || ref.lastName) return `${ref.firstName || ''} ${ref.lastName || ''}`.trim();
  return ref.fullName || ref.name || '—';
}

function refId(ref: any): string {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return ref._id || ref.id || '';
}

export const SubstitutesView: React.FC<SubstitutesViewProps> = ({ sessionToken, onBack }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [stateFilter, setStateFilter] = useState<string>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create / Edit modal state (empty by default like Web Portal)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    originalTeacherId: '',
    substituteTeacherId: '',
    sectionId: '',
    subjectId: '',
    startDate: '',
    endDate: '',
    periods: '',
    reason: '',
    capabilities: ['attendance'] as string[],
  });

  // Cancel cover dialog
  const [cancelling, setCancelling] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const loadLookups = useCallback(async () => {
    if (!window.desktopAPI) return;
    try {
      const [empRes, secRes, subRes] = await Promise.all([
        window.desktopAPI.onlineRequest(sessionToken, { method: 'GET', path: '/employees?limit=200' }).catch(() => null),
        window.desktopAPI.onlineRequest(sessionToken, { method: 'GET', path: '/academics/sections?limit=200' }).catch(() => null),
        window.desktopAPI.onlineRequest(sessionToken, { method: 'GET', path: '/academics/subjects?limit=200' }).catch(() => null),
      ]);
      const unwrap = (r: any) =>
        !r?.ok ? [] : Array.isArray(r.data) ? r.data : Array.isArray(r.data?.items) ? r.data.items : Array.isArray(r.data?.data) ? r.data.data : [];
      setTeachers(unwrap(empRes));
      setSections(unwrap(secRes));
      setSubjects(unwrap(subRes));
    } catch {}
  }, [sessionToken]);

  const loadList = useCallback(async () => {
    if (!window.desktopAPI) return;
    setLoading(true);
    setError(null);
    try {
      const qs = stateFilter ? `?limit=100&state=${encodeURIComponent(stateFilter)}` : '?limit=100';
      const res = await window.desktopAPI.onlineRequest(sessionToken, { method: 'GET', path: `/substitutes${qs}` });
      if (!res.ok) {
        setError(res.error || 'Could not load substitute teacher assignments.');
        setRows([]);
      } else {
        const d = res.data;
        const list = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.data) ? d.data : [];
        setRows(list);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to connect to central backend.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, stateFilter]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      originalTeacherId: '',
      substituteTeacherId: '',
      sectionId: '',
      subjectId: '',
      startDate: '',
      endDate: '',
      periods: '',
      reason: '',
      capabilities: ['attendance'],
    });
    setDialogOpen(true);
  };

  const openEdit = (row: any) => {
    setEditingId(row._id || row.id);
    setForm({
      originalTeacherId: refId(row.originalTeacherId),
      substituteTeacherId: refId(row.substituteTeacherId),
      sectionId: refId(row.sectionId),
      subjectId: refId(row.subjectId),
      startDate: String(row.startDate || '').slice(0, 10),
      endDate: String(row.endDate || '').slice(0, 10),
      periods: row.periods || '',
      reason: row.reason || '',
      capabilities: Array.isArray(row.capabilities) && row.capabilities.length > 0 ? row.capabilities : ['attendance'],
    });
    setDialogOpen(true);
  };

  const toggleCap = (cap: string) => {
    setForm((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter((c) => c !== cap)
        : [...prev.capabilities, cap],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.originalTeacherId || !form.substituteTeacherId || !form.sectionId || !form.startDate || !form.endDate) {
      setError('Please select original teacher, substitute teacher, section, and start/end dates.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        originalTeacherId: form.originalTeacherId,
        substituteTeacherId: form.substituteTeacherId,
        sectionId: form.sectionId,
        startDate: form.startDate,
        endDate: form.endDate,
        capabilities: form.capabilities.length > 0 ? form.capabilities : ['attendance'],
      };
      if (form.subjectId) payload.subjectId = form.subjectId;
      if (form.periods.trim()) payload.periods = form.periods.trim();
      if (form.reason.trim()) payload.reason = form.reason.trim();

      const res = await window.desktopAPI.onlineRequest(sessionToken, {
        method: editingId ? 'PATCH' : 'POST',
        path: editingId ? `/substitutes/${editingId}` : '/substitutes',
        body: payload,
      });
      if (!res.ok) {
        setError(res.error || 'Failed to save substitute assignment.');
      } else {
        setDialogOpen(false);
        await loadList();
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to save substitute assignment.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelCover = async () => {
    if (!cancelling) return;
    setCancelBusy(true);
    setError(null);
    try {
      const id = cancelling._id || cancelling.id;
      const res = await window.desktopAPI.onlineRequest(sessionToken, {
        method: 'POST',
        path: `/substitutes/${id}/cancel`,
        body: { reason: cancelReason.trim() || undefined },
      });
      if (!res.ok) {
        setError(res.error || 'Failed to cancel cover.');
      } else {
        setCancelling(null);
        setCancelReason('');
        await loadList();
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to cancel cover.');
    } finally {
      setCancelBusy(false);
    }
  };

  const isOfflineErr = error && /unable to reach|offline|connect/i.test(error);

  return (
    <div className="space-y-6 pb-8">
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263147] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-3.5">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-xl border border-[#E2E8F0] dark:border-[#263147] hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#16213E] dark:text-white">Substitute Teachers</h1>
            <p className="text-sm text-[#5B6780] dark:text-slate-400 mt-0.5">
              When a teacher is absent, let another teacher cover their class for specific dates.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={openCreate}
            className="h-10 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold flex items-center space-x-2 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Substitute</span>
          </button>
          <button
            type="button"
            onClick={loadList}
            className="h-10 px-4 rounded-xl border border-[#E2E8F0] dark:border-[#263147] bg-white dark:bg-slate-800 hover:bg-slate-50 text-sm font-semibold flex items-center space-x-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className={`p-4 rounded-xl border text-sm flex items-center space-x-2.5 ${isOfflineErr ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-[#FFF1F2] border-rose-200 text-[#BE123C]'}`}>
          {isOfflineErr ? <WifiOff className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263147] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] dark:border-[#263147] flex flex-wrap items-center justify-between gap-3 bg-[#F8FAFC] dark:bg-slate-800/40">
          <div className="flex items-center space-x-2.5">
            <label className="text-xs font-semibold text-slate-500">Show</label>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200"
            >
              <option value="">All covers</option>
              <option value="active">Current and upcoming</option>
              <option value="current">Covering now</option>
              <option value="upcoming">Upcoming</option>
              <option value="expired">Ended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <span className="text-xs font-semibold text-slate-500 tabular-nums">{rows.length} covers</span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading substitute assignments...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <UserRoundCog className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200">No substitute covers</p>
            <p className="text-sm text-slate-500">
              When a teacher is on leave, assign a substitute here. Their access ends automatically after the last day.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left tabular-nums">
              <thead className="h-12 bg-[#F8FAFC] dark:bg-slate-800/60 border-b border-[#E2E8F0] dark:border-[#263147]">
                <tr>
                  <th className="px-5 uppercase">Cover</th>
                  <th className="px-5 uppercase">Dates</th>
                  <th className="px-5 uppercase">May</th>
                  <th className="px-5 uppercase">Status</th>
                  <th className="px-5 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#263147]">
                {rows.map((c) => {
                  const stateKey = c.state || (c.status === 'cancelled' ? 'cancelled' : 'current');
                  const start = String(c.startDate || '').slice(0, 10);
                  const end = String(c.endDate || '').slice(0, 10);
                  const canModify = c.status !== 'cancelled' && stateKey !== 'expired';
                  return (
                    <tr key={c._id || c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {refName(c.substituteTeacherId)} <span className="font-normal text-slate-500">for</span> {refName(c.originalTeacherId)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {refName(c.sectionId)} · {c.subjectId ? refName(c.subjectId) : 'All their subjects'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm text-slate-800 dark:text-slate-200">{start === end ? start : `${start} – ${end}`}</p>
                        {c.periods && <p className="text-xs text-slate-500">{c.periods}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300">
                        {(c.capabilities || []).map((cap: string) => CAPS.find((k) => k.value === cap)?.label || cap).join(', ') || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          stateKey === 'current' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          stateKey === 'upcoming' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {STATE_LABELS[stateKey] || stateKey}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {canModify ? (
                          <div className="inline-flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Edit cover"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setCancelling(c); setCancelReason(''); }}
                              className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              title="Cancel cover"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign / Edit Modal */}
      <Modal isOpen={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? 'Edit Substitute Cover' : 'Assign Substitute Teacher'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-semibold">Absent Teacher *</label>
              <select
                required
                value={form.originalTeacherId}
                onChange={(e) => setForm({ ...form, originalTeacherId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="">Select teacher...</option>
                {teachers.map((t) => (
                  <option key={t._id || t.id} value={t._id || t.id}>{refName(t)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-semibold">Substitute Teacher *</label>
              <select
                required
                value={form.substituteTeacherId}
                onChange={(e) => setForm({ ...form, substituteTeacherId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="">Select substitute...</option>
                {teachers.filter((t) => (t._id || t.id) !== form.originalTeacherId).map((t) => (
                  <option key={t._id || t.id} value={t._id || t.id}>{refName(t)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-semibold">Section *</label>
              <select
                required
                value={form.sectionId}
                onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="">Select section...</option>
                {sections.map((s) => (
                  <option key={s._id || s.id} value={s._id || s.id}>
                    {s.classId?.name ? `${s.classId.name} — ${s.name}` : s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-semibold">Subject (Optional)</label>
              <select
                value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="">All their subjects</option>
                {subjects.map((s) => (
                  <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-semibold">Start Date *</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-semibold">End Date *</label>
              <input
                type="date"
                required
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold">Permissions during cover</label>
            <div className="flex flex-wrap gap-3">
              {CAPS.map((cap) => (
                <label key={cap.value} className="inline-flex items-center space-x-2 text-sm font-normal cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.capabilities.includes(cap.value)}
                    onChange={() => toggleCap(cap.value)}
                    className="rounded border-slate-300"
                  />
                  <span>{cap.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-semibold">Periods (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Periods 1–4"
                value={form.periods}
                onChange={(e) => setForm({ ...form, periods: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-semibold">Reason (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Medical leave"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2.5 pt-2">
            <button type="button" onClick={() => setDialogOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Update Cover' : 'Assign Substitute'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel Cover Confirmation Modal */}
      <Modal isOpen={Boolean(cancelling)} onClose={() => setCancelling(null)} title="Cancel this cover?">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The substitute immediately loses access to this class. Work they already recorded stays saved under their name.
          </p>
          <div className="space-y-1">
            <label className="block text-sm font-semibold">Reason (Optional)</label>
            <input
              type="text"
              placeholder="Reason for cancelling"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
          <div className="flex justify-end space-x-2.5">
            <button type="button" onClick={() => setCancelling(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold">
              Keep Cover
            </button>
            <button
              type="button"
              disabled={cancelBusy}
              onClick={handleCancelCover}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {cancelBusy ? 'Cancelling...' : 'Cancel Cover'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
