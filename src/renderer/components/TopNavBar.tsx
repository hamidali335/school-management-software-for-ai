import React, { useState } from 'react';
import {
  School,
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  ChevronDown,
  Layers,
  Settings,
  User,
  PlusCircle,
  CalendarCheck2,
  ReceiptText,
  GraduationCap,
  Home,
  CheckCircle2,
  HardDriveDownload,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import { SyncStatus, DatabaseStatus, UserProfile } from '../../shared/types';
import { CORE_MODULES, APP_METADATA } from '../../shared/constants';

interface TopNavBarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  syncStatus: SyncStatus | null;
  dbStatus: DatabaseStatus | null;
  currentUser: UserProfile | null;
  isSyncing: boolean;
  onTriggerSync: () => void;
  onTriggerBackup: () => void;
  onLogout: () => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  currentView,
  onNavigate,
  syncStatus,
  dbStatus,
  currentUser,
  isSyncing,
  onTriggerSync,
  onTriggerBackup,
  onLogout,
}) => {
  const [modulesMenuOpen, setModulesMenuOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);

  const isOnline = syncStatus?.network === 'online';
  const pendingCount = syncStatus?.pendingChangesCount || 0;
  const conflictCount = syncStatus?.unresolvedConflictCount || (syncStatus?.state === 'conflict' ? 1 : 0);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 select-none shadow-xs">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        
        {/* Left: Branding & Contextual Breadcrumb */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => onNavigate('dashboard')}
            className="flex items-center space-x-2 text-slate-800 hover:text-indigo-600 transition-colors focus:outline-none"
            title="Go to Dashboard"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <School className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-bold tracking-tight text-slate-900 leading-tight">
                {APP_METADATA.APP_NAME}
              </h1>
              <p className="text-[11px] text-slate-500 font-medium leading-none truncate max-w-[140px] sm:max-w-[200px] lg:max-w-[280px]">
                {currentUser?.schoolName || 'School Workstation'}
              </p>
            </div>
          </button>

          <div className="h-4 w-px bg-slate-200 mx-2" />

          {/* Breadcrumb Indicator */}
          {currentView === 'dashboard' ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
              <Home className="w-3 h-3 mr-1 text-slate-500" />
              Main Dashboard
            </span>
          ) : (
            <div className="flex items-center space-x-1.5 text-xs">
              <button
                onClick={() => onNavigate('dashboard')}
                className="text-slate-500 hover:text-indigo-600 font-medium"
              >
                Dashboard
              </button>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-indigo-700 capitalize">
                {currentView}
              </span>
            </div>
          )}
        </div>

        {/* Center: Top Navigation Dropdowns (No nested sidebar required) */}
        <nav className="flex items-center space-x-1 relative">
          
          {/* Modules Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setModulesMenuOpen(!modulesMenuOpen);
                setQuickActionOpen(false);
                setToolsMenuOpen(false);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Modules</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {modulesMenuOpen && (
              <div
                className="absolute left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                onMouseLeave={() => setModulesMenuOpen(false)}
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Operational Modules
                </div>
                {CORE_MODULES.map((mod) => (
                  <button
                    key={mod.id}
                    onClick={() => {
                      onNavigate(mod.route);
                      setModulesMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      currentView === mod.route ? 'bg-indigo-50/70 text-indigo-700 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <span>{mod.name}</span>
                    {mod.quickStat && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {mod.quickStat.value}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setQuickActionOpen(!quickActionOpen);
                setModulesMenuOpen(false);
                setToolsMenuOpen(false);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Quick Actions</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {quickActionOpen && (
              <div
                className="absolute left-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                onMouseLeave={() => setQuickActionOpen(false)}
              >
                <button
                  onClick={() => {
                    onNavigate('students');
                    setQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center space-x-2 text-slate-700 hover:bg-slate-50"
                >
                  <GraduationCap className="w-4 h-4 text-indigo-600" />
                  <span>New Student Admission</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate('attendance');
                    setQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center space-x-2 text-slate-700 hover:bg-slate-50"
                >
                  <CalendarCheck2 className="w-4 h-4 text-emerald-600" />
                  <span>Take Today Roll Call</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate('fees');
                    setQuickActionOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center space-x-2 text-slate-700 hover:bg-slate-50"
                >
                  <ReceiptText className="w-4 h-4 text-amber-600" />
                  <span>Collect Tuition Fee</span>
                </button>
              </div>
            )}
          </div>

          {/* Local Database & Tools Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setToolsMenuOpen(!toolsMenuOpen);
                setModulesMenuOpen(false);
                setQuickActionOpen(false);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span>Local Database</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {toolsMenuOpen && (
              <div
                className="absolute left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                onMouseLeave={() => setToolsMenuOpen(false)}
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Embedded SQLite Engine
                </div>
                <div className="px-3 py-1 text-xs text-slate-600">
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-400">Mode:</span>
                    <span className="font-mono text-emerald-600 font-semibold">WAL Mode Active</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-slate-400">Records:</span>
                    <span className="font-mono text-slate-700">
                      {dbStatus ? `${dbStatus.totalStudents} students` : 'Connected'}
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-100 my-1" />
                <button
                  onClick={() => {
                    onTriggerBackup();
                    setToolsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center space-x-2 text-slate-700 hover:bg-slate-50"
                >
                  <HardDriveDownload className="w-3.5 h-3.5 text-slate-500" />
                  <span>Create Instant Local Backup</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate('settings');
                    setToolsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs flex items-center space-x-2 text-slate-700 hover:bg-slate-50"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span>Database & Sync Settings</span>
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Right: Online/Offline Badge, Sync Status & Trigger */}
        <div className="flex items-center space-x-3">
          
          {/* Network State Pill */}
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {isOnline ? (
              <Wifi className="w-3 h-3 text-emerald-600" />
            ) : (
              <WifiOff className="w-3 h-3 text-amber-600" />
            )}
            <span className="text-[11px] font-semibold">
              {isOnline ? 'Online' : 'Offline Mode'}
            </span>
          </div>

          {/* Conflict Alert Pill */}
          {conflictCount > 0 && (
            <button
              onClick={() => onNavigate('settings')}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors animate-pulse"
              title="Unresolved synchronization conflicts detected. Click to review."
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span className="text-[11px]">Conflicts ({conflictCount})</span>
            </button>
          )}

          {/* Sync Trigger Button */}
          <button
            onClick={onTriggerSync}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors disabled:opacity-50"
            title={pendingCount > 0 ? `${pendingCount} changes pending cloud sync` : 'All changes synced'}
          >
            <RefreshCw className={`w-3 h-3 text-slate-600 ${isSyncing ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="text-[11px]">
              {isSyncing ? 'Syncing...' : pendingCount > 0 ? `Sync (${pendingCount})` : 'Synced'}
            </span>
          </button>

          {/* Active Session Pill */}
          <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
            {APP_METADATA.DEFAULT_SESSION_NAME}
          </span>
          {/* User Profile & Logout Button */}
          {currentUser && (
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
              <div className="text-right">
                <p className="text-xs font-bold text-slate-800 leading-tight">{currentUser.name}</p>
                <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">
                  {currentUser.role.replace('_', ' ')}
                </span>
              </div>

              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title="Sign out of local workstation"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};
