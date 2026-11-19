import React from 'react';
import { ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { UserProfile, SyncStatus } from '../../shared/types';
import { APP_METADATA } from '../../shared/constants';

interface AppFooterProps {
  currentUser: UserProfile | null;
  syncStatus: SyncStatus | null;
  schoolName?: string;
}

export const AppFooter: React.FC<AppFooterProps> = ({
  currentUser,
  syncStatus,
  schoolName,
}) => {
  const isOnline = syncStatus?.network === 'online';

  return (
    <footer className="h-7 w-full bg-white dark:bg-slate-900 border-t border-slate-200/90 dark:border-slate-800 px-4 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between select-none shrink-0 transition-colors">
      {/* Left: Application Identity & School Name */}
      <div className="flex items-center space-x-2.5 truncate">
        <span className="font-semibold text-slate-700 dark:text-slate-300">
          {APP_METADATA.APP_NAME}
        </span>
        <span className="text-slate-300 dark:text-slate-700">•</span>
        <span className="font-mono text-[10px] text-slate-400">
          v{APP_METADATA.VERSION}
        </span>
        {schoolName && (
          <>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="font-medium text-slate-600 dark:text-slate-300 truncate max-w-xs">
              {schoolName}
            </span>
          </>
        )}
      </div>

      {/* Right: Security & Network Status */}
      <div className="flex items-center space-x-3 shrink-0">
        <span className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <span className="hidden sm:inline">Secure Local Storage</span>
        </span>

        <span className="text-slate-300 dark:text-slate-700">•</span>

        <span className="flex items-center space-x-1 font-medium">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isOnline ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span
            className={
              isOnline
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }
          >
            {isOnline ? 'Cloud Synced' : 'Offline Mode'}
          </span>
        </span>

        {currentUser && (
          <>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
            <span className="font-medium text-slate-700 dark:text-slate-300 hidden sm:inline">
              {currentUser.name} ({currentUser.role.replace('_', ' ')})
            </span>
          </>
        )}
      </div>
    </footer>
  );
};
