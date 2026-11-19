import React from 'react';
import {
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
  ArrowRight,
  LucideIcon,
} from 'lucide-react';
import { ModuleDefinition } from '../../shared/types';

interface ModuleCardProps {
  module: ModuleDefinition;
  onClick: () => void;
  accentColor?: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
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
};

export const ModuleCard: React.FC<ModuleCardProps> = ({ module, onClick, accentColor = 'indigo' }) => {
  const IconComponent = ICON_MAP[module.icon] || BookOpen;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="group relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-indigo-500/60 dark:hover:border-indigo-500/60 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all duration-200 motion-reduce:transition-none hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 cursor-pointer flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
    >
      <div>
        {/* Top Row: Icon container + Quick Stat Badge */}
        <div className="flex items-start justify-between mb-3.5">
          <div className="w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/80 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/60 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:border-indigo-100/80 transition-colors">
            <IconComponent className="w-5 h-5 stroke-[1.85]" />
          </div>

          <div className="flex items-center space-x-1.5">
            {module.badge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800/60">
                {module.badge}
              </span>
            )}
            {module.quickStat && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <span className="text-slate-400 mr-1 text-[10px]">{module.quickStat.label}:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">{module.quickStat.value}</span>
              </span>
            )}
          </div>
        </div>

        {/* Module Title Below Icon */}
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug">
          {module.name}
        </h3>

        {/* Module Purpose Description */}
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
          {module.description}
        </p>
      </div>

      {/* Card Footer: Action Indicator */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
        <span>Open Module</span>
        <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  );
};
