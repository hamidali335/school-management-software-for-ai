import React, { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ShieldAlert,
  ArrowLeft,
  RotateCcw,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import { UserProfile } from '../../shared/types';

export interface SyncCenterItem {
  id: string;
  operationId?: string;
  conflictId?: string;
  entityType: string;
  entityId: string;
  recordLabel: string;
  userName: string;
  timestamp: string;
  plainError: string;
  localVersion: number;
  serverVersion: number | null;
  localPayload: any;
  serverPayload?: any;
  state: 'pending' | 'processing' | 'retrying' | 'needs_attention' | 'conflict';
}

export interface SyncCenterData {
  pending: SyncCenterItem[];
  needsAttention: SyncCenterItem[];
  conflicts: SyncCenterItem[];
}

interface SyncCenterViewProps {
  sessionToken: string;
  currentUser: UserProfile | null;
  onBack: () => void;
  onTriggerSync: () => Promise<void> | void;
}

const FINANCIAL_ENTITY_TYPES = new Set(['PAYMENT', 'INVOICE', 'FEE_PAYMENT', 'FEE_INVOICE']);
const FINANCIAL_ROLES = new Set(['school_owner', 'principal', 'school_admin', 'accountant']);

export const SyncCenterView: React.FC<SyncCenterViewProps> = ({
  sessionToken,
  currentUser,
  onBack,
  onTriggerSync,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'needs_attention' | 'conflicts'>('pending');
  const [data, setData] = useState<SyncCenterData>({ pending: [], needsAttention: [], conflicts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<SyncCenterItem | null>(null);
  const [editPayloadText, setEditPayloadText] = useState('');

  const canResolveFinancial = FINANCIAL_ROLES.has(currentUser?.role || '');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = window.desktopAPI as any;
      if (api?.getSyncCenterData) {
        const res = await api.getSyncCenterData(sessionToken);
        setData({
          pending: res?.pending || [],
          needsAttention: res?.needsAttention || [],
          conflicts: res?.conflicts || [],
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load synchronization items.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleKeepServer = async (item: SyncCenterItem) => {
    setActionBusyId(item.id);
    setError(null);
    try {
      const api = window.desktopAPI as any;
      const res = await api.keepServerVersion(sessionToken, {
        conflictId: item.conflictId || item.id,
        operationId: item.operationId,
        entityType: item.entityType,
      });
      if (res && res.success === false) {
        setError(res.error || 'Could not apply server version.');
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to keep server version.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleReapply = async (item: SyncCenterItem, customPayload?: any) => {
    setActionBusyId(item.id);
    setError(null);
    try {
      const api = window.desktopAPI as any;
      const res = await api.retryOutboxItem(sessionToken, {
        operationId: item.operationId || item.id,
        conflictId: item.conflictId,
        entityType: item.entityType,
        customPayload,
      });
      if (res && res.success === false) {
        setError(res.error || 'Could not resubmit item.');
      } else {
        setEditingItem(null);
        await onTriggerSync();
      }
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to resubmit item.');
    } finally {
      setActionBusyId(null);
    }
  };

  const openEditModal = (item: SyncCenterItem) => {
    setEditingItem(item);
    setEditPayloadText(JSON.stringify(item.localPayload || {}, null, 2));
  };

  const submitEdited = async () => {
    if (!editingItem) return;
    try {
      const parsed = JSON.parse(editPayloadText);
      await handleReapply(editingItem, parsed);
    } catch {
      setError('Edited payload must be valid JSON.');
    }
  };

  const rows: SyncCenterItem[] =
    activeTab === 'pending'
      ? data.pending
      : activeTab === 'needs_attention'
        ? data.needsAttention
        : data.conflicts;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBack}
            className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center space-x-1.5 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sync Center</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Monitor pending offline changes, failed operations, and version conflicts.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await onTriggerSync();
            await loadData();
          }}
          className="h-10 px-4 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-sm font-semibold flex items-center space-x-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Sync Now</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-[#FFF1F2] dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[#BE123C] dark:text-rose-300 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3 Required Tabs: Pending, Needs attention, Conflicts */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`h-10 px-4 rounded-lg text-sm font-semibold flex items-center space-x-2 transition ${
            activeTab === 'pending'
              ? 'bg-[#EEF2FF] dark:bg-indigo-950 text-[#4F46E5] dark:text-indigo-300'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Pending ({data.pending.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('needs_attention')}
          className={`h-10 px-4 rounded-lg text-sm font-semibold flex items-center space-x-2 transition ${
            activeTab === 'needs_attention'
              ? 'bg-[#FFFBEB] dark:bg-amber-950 text-[#B45309] dark:text-amber-300'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Needs attention ({data.needsAttention.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('conflicts')}
          className={`h-10 px-4 rounded-lg text-sm font-semibold flex items-center space-x-2 transition ${
            activeTab === 'conflicts'
              ? 'bg-[#FFF1F2] dark:bg-rose-950 text-[#BE123C] dark:text-rose-300'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Conflicts ({data.conflicts.length})</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading synchronization queue...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-[#10B981] mx-auto" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No items in this tab</p>
            <p className="text-xs text-slate-500">Everything here is up to date.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="h-11 bg-[#F9FAFB] dark:bg-[#1F2330] border-b border-[#E5E7EB] dark:border-[#2A2F3D] text-xs font-semibold text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-4">Record</th>
                  <th className="px-4">User</th>
                  <th className="px-4">Date / Time</th>
                  <th className="px-4">Plain-Language Error</th>
                  <th className="px-4">Local Ver.</th>
                  <th className="px-4">Server Ver.</th>
                  <th className="px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] dark:divide-[#2A2F3D]">
                {rows.map((item) => {
                  const isFinancial = FINANCIAL_ENTITY_TYPES.has(item.entityType.toUpperCase());
                  const blockedByRole = isFinancial && !canResolveFinancial;
                  const busy = actionBusyId === item.id;

                  return (
                    <tr key={item.id} className="h-14 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2">
                        <div className="font-semibold text-slate-900 dark:text-white">{item.recordLabel}</div>
                        <div className="text-xs text-slate-500">{item.entityType} · {item.entityId}</div>
                      </td>
                      <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{item.userName}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{item.timestamp}</td>
                      <td className="px-4 py-2 text-xs text-slate-700 dark:text-slate-300 max-w-xs">{item.plainError}</td>
                      <td className="px-4 py-2 font-mono text-xs">v{item.localVersion}</td>
                      <td className="px-4 py-2 font-mono text-xs">{item.serverVersion != null ? `v${item.serverVersion}` : '—'}</td>
                      <td className="px-4 py-2 text-right">
                        {blockedByRole ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FFFBEB] text-[#B45309]">
                            Admin / Accountant required
                          </span>
                        ) : (
                          <div className="inline-flex items-center space-x-1.5">
                            {activeTab !== 'pending' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleKeepServer(item)}
                                className="h-8 px-2.5 rounded-md border border-slate-300 dark:border-slate-600 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Keep server version</span>
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleReapply(item)}
                              className="h-8 px-2.5 rounded-md bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-medium flex items-center space-x-1"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Re-apply my change</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => openEditModal(item)}
                              className="h-8 px-2.5 rounded-md border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center space-x-1"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit and resubmit</span>
                            </button>
                          </div>
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

      {/* Edit & Resubmit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#181B24] rounded-[14px] border border-[#E5E7EB] dark:border-[#2A2F3D] w-full max-w-[640px] p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Edit and Resubmit — {editingItem.recordLabel}
              </h3>
              <button type="button" onClick={() => setEditingItem(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            {editingItem.serverPayload && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs">
                <div className="font-semibold text-slate-600 dark:text-slate-400 mb-1">Server version (read-only):</div>
                <pre className="overflow-x-auto text-[11px]">{JSON.stringify(editingItem.serverPayload, null, 2)}</pre>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Local payload to resubmit (JSON)
              </label>
              <textarea
                value={editPayloadText}
                onChange={(e) => setEditPayloadText(e.target.value)}
                rows={8}
                className="w-full font-mono text-xs p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEdited}
                className="h-10 px-4 rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] text-white text-sm font-semibold"
              >
                Save & Resubmit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
