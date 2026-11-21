import React, { useState } from 'react';
import {
  LayoutDashboard,
  BadgeCheck,
  GraduationCap,
  UsersRound,
  UserPlus,
  Users,
  School,
  CalendarClock,
  ClipboardCheck,
  CalendarOff,
  NotebookPen,
  BookOpenCheck,
  Wallet,
  Landmark,
  Megaphone,
  ScrollText,
  FileBarChart,
  Settings,
  Sun,
  Moon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
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

interface NavGroup {
  label: string;
  items: Array<{ id: string; label: string; icon: React.ReactNode }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'approvals', label: 'Approvals', icon: <BadgeCheck className="w-[18px] h-[18px] shrink-0" /> },
    ],
  },
  {
    label: 'People',
    items: [
      { id: 'students', label: 'Students', icon: <GraduationCap className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'parents', label: 'Parents', icon: <UsersRound className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'admissions', label: 'Admissions', icon: <UserPlus className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'staff', label: 'Staff & Payroll', icon: <Users className="w-[18px] h-[18px] shrink-0" /> },
    ],
  },
  {
    label: 'Academics',
    items: [
      { id: 'academics', label: 'Classes & Subjects', icon: <School className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'timetable', label: 'Timetable', icon: <CalendarClock className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'attendance', label: 'Attendance', icon: <ClipboardCheck className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'leave', label: 'Leave Requests', icon: <CalendarOff className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'homework', label: 'Homework', icon: <NotebookPen className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'examinations', label: 'Exams & Results', icon: <BookOpenCheck className="w-[18px] h-[18px] shrink-0" /> },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'fees', label: 'Fees & Challans', icon: <Wallet className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'accounts', label: 'Accounts', icon: <Landmark className="w-[18px] h-[18px] shrink-0" /> },
    ],
  },
  {
    label: 'Engagement & Reports',
    items: [
      { id: 'notices', label: 'Notices', icon: <Megaphone className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'certificates', label: 'Certificates', icon: <ScrollText className="w-[18px] h-[18px] shrink-0" /> },
      { id: 'reports', label: 'Reports & Export', icon: <FileBarChart className="w-[18px] h-[18px] shrink-0" /> },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  currentUser,
  onLogout,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('sms_sidebar_expanded');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [profileOpen, setProfileOpen] = useState(false);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    try {
      localStorage.setItem('sms_sidebar_expanded', String(next));
    } catch {}
  };

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
      className={`${
        expanded ? 'w-[248px]' : 'w-[74px]'
      } h-full bg-white dark:bg-[#111827] border-r border-[#E2E8F0] dark:border-[#263147] flex flex-col justify-between py-3 select-none z-30 shrink-0 transition-all duration-200`}
      aria-label="Application Navigation"
    >
      {/* Top Brand & Expand/Collapse Toggle */}
      <div className={`px-3 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center ${expanded ? 'justify-between' : 'flex-col space-y-2'}`}>
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center space-x-2.5 focus:outline-none min-w-0"
          title="Return to Dashboard"
        >
          <Logo size="sm" />
          {expanded && (
            <span className="text-[16px] font-bold tracking-tight text-[#1B2A59] dark:text-white truncate">
              School OS
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={toggleExpanded}
          className="p-2 rounded-lg text-slate-500 hover:text-[#1B2A59] hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition"
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {expanded ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
      </div>

      {/* Grouped Navigation matching Web Portal */}
      <nav className="flex-1 w-full overflow-y-auto overflow-x-hidden px-2.5 py-2.5 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            {expanded && (
              <div className="px-3 pt-1 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  title={!expanded ? item.label : undefined}
                  className={`w-full h-10 rounded-xl flex items-center ${
                    expanded ? 'px-3 space-x-3 justify-start' : 'justify-center'
                  } transition-all duration-150 ${
                    isActive
                      ? 'bg-[#1B2A59] dark:bg-[#2563EB] text-white font-semibold shadow-sm'
                      : 'text-[#334155] dark:text-slate-300 hover:text-[#1B2A59] dark:hover:text-white hover:bg-[#EFF6FF] dark:hover:bg-slate-800/70 font-medium'
                  }`}
                >
                  {item.icon}
                  {expanded && <span className="text-[14px] truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom Controls */}
      <div className="px-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1 relative">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className={`w-full h-10 rounded-xl flex items-center ${
            expanded ? 'px-3 space-x-3 justify-start' : 'justify-center'
          } text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition`}
        >
          {theme === 'dark' ? <Sun className="w-[18px] h-[18px] shrink-0 text-amber-400" /> : <Moon className="w-[18px] h-[18px] shrink-0" />}
          {expanded && <span className="text-[14px] font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          title="Settings"
          className={`w-full h-10 rounded-xl flex items-center ${
            expanded ? 'px-3 space-x-3 justify-start' : 'justify-center'
          } transition ${
            currentView === 'settings'
              ? 'bg-[#1B2A59] dark:bg-[#2563EB] text-white font-semibold shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
          }`}
        >
          <Settings className="w-[18px] h-[18px] shrink-0" />
          {expanded && <span className="text-[14px]">Settings</span>}
        </button>

        <div className="pt-1">
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className={`w-full p-2 rounded-xl flex items-center ${
              expanded ? 'space-x-2.5 justify-start' : 'justify-center'
            } hover:bg-slate-100 dark:hover:bg-slate-800 transition`}
          >
            <div className="w-9 h-9 rounded-full bg-[#EFF6FF] dark:bg-blue-950 text-[#1B2A59] dark:text-blue-300 font-bold text-sm flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
              {getInitials(currentUser?.name)}
            </div>
            {expanded && (
              <div className="text-left min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">
                  {currentUser?.name || 'Administrator'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate capitalize">
                  {(currentUser?.role || 'admin').replace(/_/g, ' ')}
                </p>
              </div>
            )}
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
              <div className="absolute bottom-14 left-3 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-2 z-50">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center space-x-2"
                >
                  <LogOut className="w-4 h-4" />
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
