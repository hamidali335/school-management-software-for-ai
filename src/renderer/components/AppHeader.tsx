import React, { useState } from 'react';
import {
  ArrowLeft,
  Search,
  Wifi,
  WifiOff,
  RefreshCw,
  Bell,
  PlusCircle,
  GraduationCap,
  CalendarCheck2,
  ReceiptText,
  AlertTriangle,
  ChevronDown,
  X,
} from 'lucide-react';
import { SyncStatus, UserProfile } from '../../shared/types';
import { APP_METADATA } from '../../shared/constants';

interface AppHeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
  syncStatus: SyncStatus | null;
  currentUser: UserProfile | null;
  isSyncing: boolean;
  onTriggerSync: () => void;
  onSearch?: (term: string) => void;
}

const VIEW_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Executive Dashboard', subtitle: 'Institutional KPIs, operational modules and summary' },
  students: { title: 'Students & Admissions', subtitle: 'Enrollment records, student profiles and session journeys' },
  attendance: { title: 'Daily Attendance', subtitle: 'Roll call records, daily tracking and section statistics' },
  fees: { title: 'Fees & Invoicing', subtitle: 'Tuition challans, collections, structures and concessions' },
  academics: { title: 'Sessions & Classes', subtitle: 'Academic sessions, grade levels and section allocations' },
  examinations: { title: 'Examinations & Marks', subtitle: 'Exam terms, paper scheduling, mark entries and gazettes' },
  staff: { title: 'Faculty & Staff', subtitle: 'Teacher profiles, designations, attendance and payroll' },
  timetable: { title: 'Timetable & Scheduling', subtitle: 'Weekly period allocations, teacher schedules and rooms' },
  accounts: { title: 'Accounts & Expenses', subtitle: 'Cash flow balance, fee revenue and institutional vouchers' },
  reports: { title: 'Reports & Export', subtitle: 'Official institutional registers, PDF exports and gazettes' },
  settings: { title: 'System & Settings', subtitle: 'Institution profile, licensing, backups and sync' },
  'sync-center': { title: 'Sync Center', subtitle: 'Pending offline queue, attention items, and conflicts' },
  notices: { title: 'Notices & Announcements', subtitle: 'Institutional notices and announcements' },
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentView,
  onNavigate,
  syncStatus,
  currentUser,
  isSyncing,
  onTriggerSync,
}) => {
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isOnline = syncStatus?.network === 'online';
  const pendingCount = syncStatus?.pendingChangesCount || 0;
  const conflictCount = syncStatus?.unresolvedConflictCount || (syncStatus?.state === 'conflict' ? 1 : 0);

  const viewMeta = VIEW_TITLES[currentView] || { title: currentView, subtitle: '' };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const q = searchQuery.toLowerCase();
    if (q.includes('stud') || q.includes('admi')) onNavigate('students');
    else if (q.includes('fee') || q.includes('chal') || q.includes('pay')) onNavigate('fees');
    else if (q.includes('att') || q.includes('roll')) onNavigate('attendance');
    else if (q.includes('exam') || q.includes('mark') || q.includes('grad')) onNavigate('examinations');
    else if (q.includes('staff') || q.includes('teach') || q.includes('payr')) onNavigate('staff');
    else if (q.includes('time') || q.includes('sched') || q.includes('perio')) onNavigate('timetable');
    else if (q.includes('acc') || q.includes('exp') || q.includes('vouch')) onNavigate('accounts');
    else if (q.includes('rep') || q.includes('gaz') || q.includes('rost')) onNavigate('reports');
    else if (q.includes('set') || q.includes('back') || q.includes('lic')) onNavigate('settings');
    else onNavigate('students');
    setSearchQuery('');
  };

  return (
    <header className="h-16 w-full bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 px-5 flex items-center justify-between select-none z-20 shrink-0 transition-colors">
      {/* Left: Breadcrumbs & Page Title */}
      <div className="flex items-center space-x-3 min-w-0">

        </div>

      {/* Center: Global Search Bar */}
      <div className="hidden md:flex items-center max-w-2xl w-full mx-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search students, fees, staff, exams... (Enter to jump)"
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </form>
      </div>

      {/* Right: Quick Actions, Network Badge, Sync Trigger, Notifications */}
      <div className="flex items-center space-x-2.5 shrink-0">
        {/* Quick Actions Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setQuickActionOpen(!quickActionOpen);
              setNotifOpen(false);
            }}
            className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 transition"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Actions</span>
            <ChevronDown className="w-3 h-3 text-indigo-400" />
          </button>

          {quickActionOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setQuickActionOpen(false)} />
              <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in duration-150">
                <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Quick Operations
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('students');
                    setQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center space-x-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>New Student Admission</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('attendance');
                    setQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center space-x-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  <CalendarCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Mark Today's Attendance</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('fees');
                    setQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center space-x-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  <ReceiptText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Collect Tuition Fee</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Academic Session Pill */}
        <span className="hidden xl:inline-flex items-center px-2.5 py-1 rounded-full text-[13px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
          {APP_METADATA.DEFAULT_SESSION_NAME}
        </span>

        {/* Network Connectivity Pill */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-sm font-semibold border ${
            isOnline
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
          }`}
          title={isOnline ? 'Online: Cloud server is reachable' : 'Offline: Local database operation active'}
        >
          {isOnline ? (
            <Wifi className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <WifiOff className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          )}
          <span className="text-[13px] hidden sm:inline">
            {isOnline ? 'Cloud Online' : 'Offline Mode'}
          </span>
        </div>

        {/* Sync Status Indicator -> Opens Sync Center (Section 6.11) */}
        <button
          type="button"
          onClick={() => onNavigate('sync-center')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
            conflictCount > 0
              ? 'bg-[#FFF1F2] text-[#BE123C] border-rose-200'
              : syncStatus?.state === 'error'
                ? 'bg-[#FFF1F2] text-[#BE123C] border-rose-200'
                : !isOnline
                  ? 'bg-[#FFFBEB] text-[#B45309] border-amber-200'
                  : pendingCount > 0
                    ? 'bg-[#EEF2FF] text-[#4F46E5] border-indigo-200'
                    : 'bg-[#ECFDF5] text-[#047857] border-emerald-200'
          }`}
          title="Open Sync Center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="text-[13px]">
            {isSyncing && !syncStatus?.lastSyncAt
              ? 'Initial sync'
              : conflictCount > 0
                ? 'Conflict'
                : syncStatus?.state === 'error'
                  ? 'Failed'
                  : !isOnline
                    ? 'Offline'
                    : pendingCount > 0
                      ? `Pending (${pendingCount})`
                      : 'Synced'}
          </span>
        </button>

        {/* Notification Bell */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen(!notifOpen);
              setQuickActionOpen(false);
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition relative"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {conflictCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 mt-1.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 z-50 animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">System Status</h4>
                  <span className="text-xs text-slate-400">Institutional Feed</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg flex items-start space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        Workstation Active
                      </p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        Encrypted database ready for all school operations.
                      </p>
                    </div>
                  </div>

                  {conflictCount > 0 && (
                    <div
                      onClick={() => {
                        setNotifOpen(false);
                        onNavigate('settings');
                      }}
                      className="p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 rounded-lg flex items-start space-x-2 cursor-pointer hover:bg-rose-100"
                    >
                      <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-rose-800 dark:text-rose-300">
                          Synchronization Notice
                        </p>
                        <p className="text-[13px] text-rose-700 dark:text-rose-400">
                          {conflictCount} conflict awaiting resolution in Settings.
                        </p>
                      </div>
                    </div>
                  )}

                  {pendingCount > 0 && (
                    <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 rounded-lg flex items-start space-x-2">
                      <RefreshCw className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-amber-800 dark:text-amber-300">
                          Pending Changes
                        </p>
                        <p className="text-[13px] text-amber-700 dark:text-amber-400">
                          {pendingCount} operation(s) waiting to sync with central server.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
