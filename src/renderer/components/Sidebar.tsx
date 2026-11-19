import React, { useState } from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  CalendarCheck2,
  ReceiptText,
  BookOpen,
  Award,
  Users,
  Clock,
  Wallet,
  FileSpreadsheet,
  Settings,
  Sun,
  Moon,
  LogOut,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';
import { Logo } from './Logo';
import { useTheme } from '../context/ThemeContext';
import { UserProfile } from '../../shared/types';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  currentUser,
  onLogout,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'students', label: 'Students & Admissions', icon: <GraduationCap className="w-5 h-5" /> },
    { id: 'attendance', label: 'Daily Attendance', icon: <CalendarCheck2 className="w-5 h-5" /> },
    { id: 'fees', label: 'Fees & Invoicing', icon: <ReceiptText className="w-5 h-5" /> },
    { id: 'academics', label: 'Sessions & Classes', icon: <BookOpen className="w-5 h-5" /> },
    { id: 'examinations', label: 'Exams & Marks', icon: <Award className="w-5 h-5" /> },
    { id: 'staff', label: 'Faculty & Staff', icon: <Users className="w-5 h-5" /> },
    { id: 'timetable', label: 'Timetable & Scheduling', icon: <Clock className="w-5 h-5" /> },
    { id: 'accounts', label: 'Accounts & Expenses', icon: <Wallet className="w-5 h-5" /> },
    { id: 'reports', label: 'Reports & Export', icon: <FileSpreadsheet className="w-5 h-5" /> },
  ];

  const getInitials = (name?: string) => {
    if (!name) return 'AD';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <aside
      className="w-[72px] h-full bg-white dark:bg-slate-900 border-r border-slate-200/90 dark:border-slate-800 flex flex-col justify-between items-center py-3 select-none z-30 shrink-0 transition-colors"
      aria-label="Application Navigation"
    >
      {/* 1. Top Logo */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="focus:outline-none transition-transform hover:scale-105"
          title="Return to Dashboard"
        >
          <Logo size="sm" />
        </button>
        <div className="w-8 h-px bg-slate-200 dark:bg-slate-800 my-2.5" />
      </div>

      {/* 2. Middle Scrollable Module Icons */}
      <nav className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center space-y-1.5 px-2.5 py-1">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <div key={item.id} className="relative group">
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150 relative ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'
                }`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
              >
                {item.icon}

                {/* Active Indicator Bar on the left */}
                {isActive && (
                  <span className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full bg-indigo-600" />
                )}
              </button>

              {/* Tooltip on Hover */}
              <div className="pointer-events-none absolute left-14 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                {item.label}
              </div>
            </div>
          );
        })}
      </nav>

      {/* 3. Bottom Controls (Theme, Settings, Help, Profile) */}
      <div className="flex flex-col items-center space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 w-full px-2.5">
        {/* Theme Toggle */}
        <div className="relative group">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>
          <div className="pointer-events-none absolute left-14 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-900 text-white text-xs font-medium rounded-md shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </div>
        </div>

        {/* Settings */}
        <div className="relative group">
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
              currentView === 'settings'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'
            }`}
            title="System & Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <div className="pointer-events-none absolute left-14 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-900 text-white text-xs font-medium rounded-md shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
            System & Settings
          </div>
        </div>

        {/* User Profile Avatar with Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center hover:ring-2 hover:ring-indigo-500 transition"
            title={currentUser?.name || 'User Profile'}
            aria-label="User Profile"
          >
            {getInitials(currentUser?.name)}
          </button>

          {profileOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setProfileOpen(false)}
              />
              <div className="absolute left-14 bottom-0 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 z-50 animate-in fade-in duration-150">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {currentUser?.name || 'Administrator'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">
                    {currentUser?.role?.replace('_', ' ') || 'Staff'}
                  </p>
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 truncate mt-0.5 font-medium">
                    {currentUser?.schoolName || 'School Workstation'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('settings');
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center space-x-2 transition"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span>Preferences</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg flex items-center space-x-2 transition mt-1 font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
