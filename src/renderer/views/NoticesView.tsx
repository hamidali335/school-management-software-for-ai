import React, { useEffect, useState, useCallback } from 'react';
import { Bell, Plus, ArrowLeft, RefreshCw, X, Megaphone } from 'lucide-react';

interface NoticesViewProps {
  sessionToken: string;
  onBack: () => void;
}

export const NoticesView: React.FC<NoticesViewProps> = ({ sessionToken, onBack }) => {
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [roles, setRoles] = useState<string[]>(['teacher', 'parent']);
  const [submitting, setSubmitting] = useState(false);

  const loadNotices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.desktopAPI.listNotices(sessionToken);
      setNotices(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load notices.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    loadNotices();
  }, [loadNotices]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await window.desktopAPI.createNotice(sessionToken, { title: title.trim(), body: body.trim(), roles });
      if (!res.ok) {
        setError(res.error || 'Could not publish notice.');
      } else {
        setTitle('');
        setBody('');
        setShowCreate(false);
        await loadNotices();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to publish notice.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBack}
            className="h-10 px-3 rounded-lg border border-[#E5E7EB] dark:border-[#2A2F3D] bg-white dark:bg-[#181B24] text-sm font-medium flex items-center space-x-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#111827] dark:text-[#F3F4F6]">Notices & Announcements</h1>
            <p className="text-xs text-[#6B7280]">School-wide notices (read offline from cache, publish online).</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={loadNotices}
            className="h-10 px-3 rounded-lg border border-[#E5E7EB] dark:border-[#2A2F3D] bg-white dark:bg-[#181B24] text-sm font-medium flex items-center space-x-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="h-10 px-4 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-sm font-semibold flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Notice</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-[#FFF1F2] border border-rose-200 text-[#BE123C] text-sm flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((k) => (
            <div key={k} className="h-24 rounded-[14px] bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
          ))}
        </div>
      ) : notices.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] space-y-2">
          <Megaphone className="w-8 h-8 text-[#6366F1] mx-auto" />
          <p className="text-sm font-semibold">No notices yet</p>
          <p className="text-xs text-[#6B7280]">Create a notice while online to broadcast announcements to staff and parents.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((n, idx) => (
            <div
              key={n._id || n.id || idx}
              className="p-5 bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] shadow-sm space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Bell className="w-4 h-4 text-[#6366F1]" />
                  <h3 className="text-base font-semibold text-[#111827] dark:text-[#F3F4F6]">{n.title}</h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#ECFDF5] text-[#047857] capitalize">
                  {n.status || 'published'}
                </span>
              </div>
              <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB]">{n.body}</p>
              <p className="text-xs text-[#6B7280]">{n.publishedAt || n.createdAt || ''}</p>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] w-full max-w-[480px] p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">New Notice (Online-Only)</h3>
              <button type="button" onClick={() => setShowCreate(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#4B5563] dark:text-slate-300">Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E5E7EB] dark:border-[#2A2F3D] bg-white dark:bg-[#1F2330] text-sm"
                placeholder="e.g., Winter Timings Update"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#4B5563] dark:text-slate-300">Message</label>
              <textarea
                required
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full p-3 rounded-lg border border-[#E5E7EB] dark:border-[#2A2F3D] bg-white dark:bg-[#1F2330] text-sm"
                placeholder="Write announcement details..."
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={() => setShowCreate(false)} className="h-10 px-4 rounded-lg border text-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-10 px-4 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? 'Publishing...' : 'Publish Notice'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
