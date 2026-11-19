import React from 'react';
import {
  Users,
  CalendarCheck2,
  Receipt,
  GraduationCap,
  TrendingUp,
  Activity,
  CheckCircle2,
  Clock,
  BookOpen,
  Wallet,
  ShieldCheck,
  ChevronRight,
  School,
  AlertCircle,
} from 'lucide-react';
import { ModuleCard } from '../components/ModuleCard';
import { DashboardMetrics, ModuleDefinition } from '../../shared/types';
import { CORE_MODULES, APP_METADATA } from '../../shared/constants';

interface DashboardViewProps {
  metrics: DashboardMetrics | null;
  onNavigate: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ metrics, onNavigate }) => {
  // Group modules into balanced sections
  const academicModules: ModuleDefinition[] = CORE_MODULES.filter((m) =>
    ['students', 'attendance', 'academics', 'examinations', 'timetable'].includes(m.id)
  );

  const financialModules: ModuleDefinition[] = CORE_MODULES.filter((m) =>
    ['fees', 'accounts'].includes(m.id)
  );

  const adminModules: ModuleDefinition[] = CORE_MODULES.filter((m) =>
    ['staff', 'reports', 'settings'].includes(m.id)
  );

  return (
    <div className="space-y-7 pb-10 font-sans">
      
      {/* ─── 1. KEY EXECUTIVE METRICS BANNER ─── */}
      <section aria-label="Key Performance Indicators">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Metric 1: Students */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
              <span>Active Students</span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <GraduationCap className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {metrics ? metrics.activeStudents : '—'}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
                <TrendingUp className="w-3 h-3 mr-0.5" /> Enrolled
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {metrics?.classesCount ? `Across ${metrics.classesCount} active grade levels` : 'Registered school directory'}
            </p>
          </div>

          {/* Metric 2: Today's Attendance */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
              <span>Today's Attendance</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CalendarCheck2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {metrics ? `${metrics.todayAttendancePercent}%` : '—'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                ({metrics ? metrics.todayPresentCount : 0} Present)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {metrics ? `${metrics.todayAbsentCount} absent, ${metrics.todayLateCount} late` : 'Roll call in progress'}
            </p>
          </div>

          {/* Metric 3: Fee Collections */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
              <span>Monthly Fee Recovery</span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {metrics
                  ? `${APP_METADATA.CURRENCY_SYMBOL} ${metrics.monthlyCollectedAmount.toLocaleString()}`
                  : '—'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {metrics
                ? `Due: ${APP_METADATA.CURRENCY_SYMBOL} ${metrics.outstandingBalance.toLocaleString()}`
                : 'Tuition challans ledger'}
            </p>
          </div>

          {/* Metric 4: Faculty & Staff */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
              <span>Faculty & Staff</span>
              <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-100 dark:border-sky-900/40 flex items-center justify-center text-sky-600 dark:text-sky-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {metrics ? metrics.totalFaculty : '—'}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
                <CheckCircle2 className="w-3 h-3 mr-0.5" /> Active
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Teaching & administrative staff
            </p>
          </div>

        </div>
      </section>

      {/* ─── 2. ACADEMIC & STUDENT OPERATIONS ─── */}
      <section aria-labelledby="section-academics">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
            <h2 id="section-academics" className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Academic & Student Operations
            </h2>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
            {academicModules.length} Modules
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 sm:gap-4">
          {academicModules.map((mod) => (
            <ModuleCard
              key={mod.id}
              module={mod}
              onClick={() => onNavigate(mod.route)}
              accentColor="indigo"
            />
          ))}
        </div>
      </section>

      {/* ─── 3. FINANCIAL MANAGEMENT ─── */}
      <section aria-labelledby="section-finance">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <h2 id="section-finance" className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Financial Management
            </h2>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
            {financialModules.length} Modules
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
          {financialModules.map((mod) => (
            <ModuleCard
              key={mod.id}
              module={mod}
              onClick={() => onNavigate(mod.route)}
              accentColor="amber"
            />
          ))}
        </div>
      </section>

      {/* ─── 4. INSTITUTIONAL ADMINISTRATION ─── */}
      <section aria-labelledby="section-admin">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
            <h2 id="section-admin" className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Institutional Administration
            </h2>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
            {adminModules.length} Modules
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
          {adminModules.map((mod) => (
            <ModuleCard
              key={mod.id}
              module={mod}
              onClick={() => onNavigate(mod.route)}
              accentColor="slate"
            />
          ))}
        </div>
      </section>

      {/* ─── 5. RECENT INSTITUTIONAL OPERATIONS AUDIT FEED ─── */}
      <section aria-label="Recent Operational Activity">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Institutional Operations</h3>
            </div>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Durable local ledger</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {metrics?.recentActivities && metrics.recentActivities.length > 0 ? (
              metrics.recentActivities.map((act) => (
                <div key={act.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{act.action}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase">
                      {act.module}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-slate-400 dark:text-slate-500 text-[11px]">
                    <span>{act.performedBy}</span>
                    <span className="flex items-center space-x-1 font-mono">
                      <Clock className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                      <span>{act.timestamp}</span>
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                No recent transactions recorded in this session.
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  );
};
