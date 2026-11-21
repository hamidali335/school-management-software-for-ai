import React, { useState } from 'react';
import {
  Users,
  CalendarCheck2,
  Receipt,
  GraduationCap,
  TrendingUp,
  CheckCircle2,
  Calendar,
  Bell,
  ArrowUpRight,
} from 'lucide-react';
import { DashboardMetrics } from '../../shared/types';
import { APP_METADATA } from '../../shared/constants';

interface DashboardViewProps {
  metrics: DashboardMetrics | null;
  onNavigate: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ metrics, onNavigate }) => {
  const [range, setRange] = useState<'week' | 'month' | 'year'>('week');

  const present = metrics?.todayPresentCount ?? 0;
  const absent = metrics?.todayAbsentCount ?? 0;
  const late = metrics?.todayLateCount ?? 0;
  const totalMarked = present + absent + late;
  const attendancePct = metrics?.todayAttendancePercent ?? 0;
  const collected = metrics?.monthlyCollectedAmount ?? 0;
  const outstanding = metrics?.outstandingBalance ?? 0;
  const totalFees = collected + outstanding;
  const collectedPct = totalFees > 0 ? Math.round((collected / totalFees) * 100) : 0;

  return (
    <div className="space-y-6 pb-10 font-sans max-w-[1680px] mx-auto tabular-nums">
      {/* 1. Four KPI Cards (Section 10.7) */}
      <section aria-label="Key Performance Indicators" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] p-5 shadow-sm">
          <div className="flex items-center justify-between text-[#6B7280] text-xs font-semibold">
            <span>Students</span>
            <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950/60 flex items-center justify-center text-[#6366F1]">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-[28px] leading-[36px] font-bold text-[#111827] dark:text-[#F3F4F6]">
              {metrics ? metrics.activeStudents.toLocaleString() : '—'}
            </span>
            <span className="text-xs text-[#047857] font-semibold flex items-center">
              <TrendingUp className="w-3 h-3 mr-0.5" /> Active
            </span>
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">
            {metrics?.classesCount ? `${metrics.classesCount} active classes` : 'Live local/cloud directory'}
          </p>
        </div>

        <div className="bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] p-5 shadow-sm">
          <div className="flex items-center justify-between text-[#6B7280] text-xs font-semibold">
            <span>Staff</span>
            <div className="w-9 h-9 rounded-xl bg-[#F0F9FF] dark:bg-sky-950/60 flex items-center justify-center text-[#0EA5E9]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-[28px] leading-[36px] font-bold text-[#111827] dark:text-[#F3F4F6]">
              {metrics ? metrics.totalFaculty.toLocaleString() : '—'}
            </span>
            <span className="text-xs text-[#047857] font-semibold flex items-center">
              <CheckCircle2 className="w-3 h-3 mr-0.5" /> On roster
            </span>
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">Teaching & administrative staff</p>
        </div>

        <div className="bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] p-5 shadow-sm">
          <div className="flex items-center justify-between text-[#6B7280] text-xs font-semibold">
            <span>Today&apos;s Attendance</span>
            <div className="w-9 h-9 rounded-xl bg-[#ECFDF5] dark:bg-emerald-950/60 flex items-center justify-center text-[#10B981]">
              <CalendarCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-[28px] leading-[36px] font-bold text-[#111827] dark:text-[#F3F4F6]">
              {metrics ? `${attendancePct}%` : '—'}
            </span>
            <span className="text-xs text-[#6B7280]">({present} present)</span>
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">{absent} absent · {late} late</p>
        </div>

        <div className="bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] p-5 shadow-sm">
          <div className="flex items-center justify-between text-[#6B7280] text-xs font-semibold">
            <span>Fees Collected</span>
            <div className="w-9 h-9 rounded-xl bg-[#FFFBEB] dark:bg-amber-950/60 flex items-center justify-center text-[#F59E0B]">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-[28px] leading-[36px] font-bold text-[#111827] dark:text-[#F3F4F6]">
              {metrics ? `${APP_METADATA.CURRENCY_SYMBOL} ${collected.toLocaleString()}` : '—'}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#6B7280]">
            Outstanding: {APP_METADATA.CURRENCY_SYMBOL} {outstanding.toLocaleString()}
          </p>
        </div>
      </section>

      {/* 2. Charts Row: 8 + 4 Column Arrangement (Section 10.9) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Attendance Area Chart (8 cols) */}
        <div className="lg:col-span-8 bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#111827] dark:text-[#F3F4F6]">Attendance Overview</h2>
              <p className="text-xs text-[#6B7280]">Live attendance rate from recorded registers</p>
            </div>
            <div className="inline-flex rounded-lg border border-[#E5E7EB] dark:border-[#2A2F3D] p-0.5 text-xs">
              {(['week', 'month', 'year'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-md font-medium capitalize transition ${
                    range === r ? 'bg-[#6366F1] text-white' : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {totalMarked === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-[#6B7280] border border-dashed border-[#E5E7EB] dark:border-[#2A2F3D] rounded-xl">
              No attendance records marked yet for the selected {range}.
            </div>
          ) : (
            <svg viewBox="0 0 400 130" className="w-full h-44" role="img" aria-label="Attendance area chart">
              <defs>
                <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path
                d={`M 0 120 L 0 ${120 - attendancePct} L 400 ${120 - attendancePct} L 400 120 Z`}
                fill="url(#attFill)"
              />
              <line x1="0" y1={120 - attendancePct} x2="400" y2={120 - attendancePct} stroke="#6366F1" strokeWidth="2.5" />
              <text x="12" y="20" fontSize="11" fill="#6B7280">
                Current Rate ({range}): {attendancePct}% ({present}/{totalMarked})
              </text>
            </svg>
          )}
        </div>

        {/* Students Distribution Donut (4 cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#111827] dark:text-[#F3F4F6]">Students by Class</h2>
            <p className="text-xs text-[#6B7280]">Active enrollment breakdown</p>
          </div>
          <div className="my-4 flex items-center justify-center">
            <svg viewBox="0 0 120 120" className="w-32 h-32" role="img" aria-label="Students donut chart">
              <circle cx="60" cy="60" r="44" fill="none" stroke="#EEF2FF" strokeWidth="14" />
              <circle
                cx="60"
                cy="60"
                r="44"
                fill="none"
                stroke="#6366F1"
                strokeWidth="14"
                strokeDasharray={`${metrics?.activeStudents ? 276 : 0} 276`}
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="58" textAnchor="middle" fontSize="16" fontWeight="700" fill="currentColor">
                {metrics?.activeStudents ?? 0}
              </text>
              <text x="60" y="74" textAnchor="middle" fontSize="9" fill="#6B7280">
                {metrics?.classesCount ?? 0} classes
              </text>
            </svg>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('students')}
            className="text-xs font-semibold text-[#6366F1] hover:text-[#4F46E5] flex items-center justify-center space-x-1"
          >
            <span>Open Students Directory</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* 3. Fee Collection Bar + Calendar + Recent Admissions + Notices */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Fee Collection Summary</h2>
            <button type="button" onClick={() => onNavigate('fees')} className="text-xs font-semibold text-[#6366F1]">
              Open Fees
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-[#6B7280]">Collected vs Outstanding</span>
              <span className="font-semibold">{collectedPct}% collected</span>
            </div>
            <div className="h-3 w-full rounded-full bg-[#EEF2FF] dark:bg-[#1F2330] overflow-hidden">
              <div className="h-full bg-[#10B981] rounded-full transition-all" style={{ width: `${collectedPct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-[#6B7280]">
              <span>Collected: {APP_METADATA.CURRENCY_SYMBOL} {collected.toLocaleString()}</span>
              <span>Due: {APP_METADATA.CURRENCY_SYMBOL} {outstanding.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] p-5 shadow-sm space-y-2">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-[#6366F1]" />
            <h2 className="text-base font-semibold">Calendar</h2>
          </div>
          <p className="text-xs text-[#6B7280]">{new Date().toDateString()}</p>
          <p className="text-xs text-[#4B5563] dark:text-slate-300 pt-2">
            Academic Session: <span className="font-semibold">{APP_METADATA.DEFAULT_SESSION_NAME}</span>
          </p>
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-[#181B24] border border-[#E5E7EB] dark:border-[#2A2F3D] rounded-[14px] p-5 shadow-sm flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-[#F59E0B]" />
              <h2 className="text-base font-semibold">Notices</h2>
            </div>
            <p className="text-xs text-[#6B7280]">View or broadcast official school announcements.</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('notices')}
            className="mt-3 h-9 px-3 rounded-lg bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#4F46E5] dark:text-indigo-300 text-xs font-semibold"
          >
            Open Notices
          </button>
        </div>
      </section>
    </div>
  );
};
