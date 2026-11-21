import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  ArrowLeft,
  Printer,
  RefreshCw,
  AlertCircle,
  Users,
  DollarSign,
  CalendarCheck2,
  TrendingUp,
  Award,
  FileDown,
  X,
  Filter,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { Button, Select, Input, Badge } from '../components/ui';
import { useToast } from '../context/ToastContext';

interface ReportsViewProps {
  onBack: () => void;
  sessionToken?: string | null;
}

const REPORT_TYPES = [
  {
    id: 'student_roster',
    title: 'Student Enrollment Roster',
    desc: 'Complete directory with admission #, father name, contact, B-Form, and class allocations.',
    icon: Users,
    category: 'Admissions',
  },
  {
    id: 'fee_defaulters',
    title: 'Fee Defaulter Report',
    desc: 'Outstanding fee challans grouped by class, student, and balance due.',
    icon: DollarSign,
    category: 'Finance',
  },
  {
    id: 'net_operating_cash',
    title: 'Net Operating Cash Flow',
    desc: 'Realized collected fee revenue minus actual institutional expenses.',
    icon: TrendingUp,
    category: 'Finance',
  },
  {
    id: 'exam_gazette',
    title: 'Examination Gazette & Rankings',
    desc: 'Class-wise student rankings, obtained marks, percentages, and GPA grades.',
    icon: Award,
    category: 'Academics',
  },
  {
    id: 'attendance_register',
    title: 'Attendance Register Summary',
    desc: 'Student-wise attendance metrics: present days, absents, late arrivals, and rates.',
    icon: CalendarCheck2,
    category: 'Academics',
  },
  {
    id: 'staff_roster',
    title: 'Faculty & Staff Roster',
    desc: 'Designations, employee codes, joined dates, contact numbers, and qualifications.',
    icon: FileSpreadsheet,
    category: 'Personnel',
  },
];

const CATEGORIES = ['All', 'Admissions', 'Finance', 'Academics', 'Personnel'];

export const ReportsView: React.FC<ReportsViewProps> = ({ onBack, sessionToken }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedReportId, setSelectedReportId] = useState<string>('student_roster');
  const [reportData, setReportData] = useState<any | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  const todayStr = new Date().toISOString().split('T')[0];
  const monthStartStr = `${todayStr.substring(0, 7)}-01`;
  const [startDate, setStartDate] = useState<string>(monthStartStr);
  const [endDate, setEndDate] = useState<string>(todayStr);

  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  useEffect(() => {
    async function initData() {
      if (!window.desktopAPI || !sessionToken) return;
      try {
        const [clsList, exList, sessList] = await Promise.all([
          window.desktopAPI.getClasses(sessionToken).catch(() => []),
          window.desktopAPI.getExams(sessionToken).catch(() => []),
          window.desktopAPI.getAcademicSessions(sessionToken).catch(() => []),
        ]);
        setClasses(clsList);
        setExams(exList);
        setSessions(sessList);
        if (clsList.length > 0 && !selectedClassId) setSelectedClassId(clsList[0].id);
        if (exList.length > 0 && !selectedExamId) setSelectedExamId(exList[0].id);
        if (sessList.length > 0 && !selectedSessionId) setSelectedSessionId(sessList[0].id);
      } catch (err) {
        console.error('Failed to load report filter options:', err);
      }
    }
    initData();
  }, [sessionToken]);

  const generateReport = useCallback(async (repId: string) => {
    if (!window.desktopAPI || !sessionToken) return;
    setSelectedReportId(repId);
    setLoading(true);
    setError(null);
    try {
      const filters: any = {};
      if (repId === 'student_roster') {
        if (selectedClassId) filters.classId = selectedClassId;
      } else if (repId === 'fee_defaulters') {
        if (selectedMonth) filters.month = selectedMonth;
      } else if (repId === 'net_operating_cash') {
        filters.startDate = startDate;
        filters.endDate = endDate;
      } else if (repId === 'exam_gazette') {
        if (selectedExamId) filters.examId = selectedExamId;
        if (selectedClassId) filters.classId = selectedClassId;
      } else if (repId === 'attendance_register') {
        if (selectedClassId) filters.classId = selectedClassId;
        filters.startDate = startDate;
        filters.endDate = endDate;
      }
      const data = await window.desktopAPI.generateReport(sessionToken, repId, filters);
      setReportData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate institutional report.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, selectedClassId, selectedExamId, selectedMonth, startDate, endDate]);

  useEffect(() => {
    if (sessionToken) {
      generateReport(selectedReportId);
    }
  }, [sessionToken]);

  const handleExportPDF = async () => {
    if (!reportData || !reportData.rows || reportData.rows.length === 0) {
      toastInfo('No report data available to export.');
      return;
    }
    setExportingPdf(true);
    try {
      if (window.desktopAPI?.exportPdfReport) {
        const res = await window.desktopAPI.exportPdfReport(sessionToken || '', reportData);
        if (res.success && res.filePath) {
          toastSuccess(`PDF report saved to:\n${res.filePath}`, 'PDF Export Complete');
        } else if (!res.canceled) {
          toastError(res.error || 'Failed to generate PDF document.', 'Export Error');
        }
      } else {
        window.print();
      }
    } catch (err: any) {
      toastError(err?.message || 'Error occurred during PDF generation.', 'Export Error');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (!reportData || !reportData.rows || reportData.rows.length === 0) {
      toastInfo('No report data available to export.');
      return;
    }
    setExportingExcel(true);
    try {
      if (window.desktopAPI?.exportExcelReport) {
        const res = await window.desktopAPI.exportExcelReport(sessionToken || '', reportData);
        if (res.success && res.filePath) {
          toastSuccess(`Excel-compatible spreadsheet saved to:\n${res.filePath}`, 'Export Complete');
        } else if (!res.canceled) {
          toastError(res.error || 'Failed to generate CSV export file.', 'Export Error');
        }
      } else {
        const bom = '\uFEFF';
        const headers = reportData.columns.map((c: any) => `"${c.header}"`).join(',');
        const rows = reportData.rows.map((row: any) =>
          reportData.columns
            .map((c: any) => {
              const val = row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]) : '';
              return `"${val.replace(/"/g, '""')}"`;
            })
            .join(',')
        );
        const blob = new Blob([bom + [headers, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${selectedReportId}_${todayStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toastSuccess('CSV file downloaded.', 'CSV Export');
      }
    } catch (err: any) {
      toastError(err?.message || 'Error occurred during Excel export.', 'Export Error');
    } finally {
      setExportingExcel(false);
    }
  };

  const visibleReports =
    selectedCategory === 'All'
      ? REPORT_TYPES
      : REPORT_TYPES.filter((r) => r.category === selectedCategory);

  const activeMeta = REPORT_TYPES.find((r) => r.id === selectedReportId) || REPORT_TYPES[0];

  return (
    <div className="space-y-6 pb-8 font-sans">
      {/* Top Workspace Header */}
      <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263147] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-xl border border-[#E2E8F0] dark:border-[#263147] hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-[#16213E] dark:text-white">
                Reports & Document Export
              </h1>
              <Badge variant="primary">Verified Local Data</Badge>
            </div>
            <p className="text-sm text-[#5B6780] dark:text-slate-400 mt-0.5">
              Select a report template on the left, apply filters, and export to PDF, Excel, or Print.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => generateReport(selectedReportId)}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            disabled={!reportData || !reportData.rows?.length}
          >
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportExcel}
            isLoading={exportingExcel}
            disabled={!reportData || !reportData.rows?.length}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Export Excel / CSV
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={handleExportPDF}
            isLoading={exportingPdf}
            disabled={!reportData || !reportData.rows?.length}
          >
            <FileDown className="w-4 h-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#FFF1F2] dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between gap-3 text-sm text-[#BE123C] dark:text-rose-300">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="p-1 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Split-Pane Executive Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Catalog Column */}
        <div className="lg:col-span-4 space-y-4">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263147] rounded-xl p-2 shadow-sm">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-[#1B2A59] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Vertical Report Selector List */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263147] rounded-2xl divide-y divide-[#E2E8F0] dark:divide-[#263147] overflow-hidden shadow-sm">
            {visibleReports.map((rep) => {
              const Icon = rep.icon;
              const isSelected = selectedReportId === rep.id;
              return (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => generateReport(rep.id)}
                  className={`w-full text-left p-4 flex items-start gap-3.5 transition-colors ${
                    isSelected
                      ? 'bg-[#1B2A59]/5 dark:bg-blue-950/30 border-l-4 border-l-[#1B2A59] dark:border-l-blue-400'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected
                        ? 'bg-[#1B2A59] text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-[#16213E] dark:text-white truncate">
                        {rep.title}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 ${
                          isSelected ? 'text-[#1B2A59] dark:text-blue-400' : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    </div>
                    <p className="text-xs text-[#5B6780] dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {rep.desc}
                    </p>
                    <span className="inline-block mt-2 text-[11px] font-semibold uppercase tracking-wide text-[#2563EB] dark:text-blue-400">
                      {rep.category}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Live Preview & Filter Workspace */}
        <div className="lg:col-span-8 space-y-5 min-w-0">
          {/* Parameters & Filter Bar */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263147] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] dark:border-[#263147] pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#16213E] dark:text-white">
                <Filter className="w-4 h-4 text-[#2563EB]" />
                <span>{activeMeta.title} — Parameters</span>
              </div>
              {reportData?.generatedAt && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Updated {new Date(reportData.generatedAt).toLocaleTimeString()}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {(selectedReportId === 'student_roster' ||
                selectedReportId === 'attendance_register' ||
                selectedReportId === 'exam_gazette') && (
                <div className="w-52">
                  <Select
                    label="Grade / Class"
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                  >
                    {selectedReportId !== 'exam_gazette' && <option value="">All Grade Levels</option>}
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
              )}

              {selectedReportId === 'exam_gazette' && (
                <div className="w-56">
                  <Select
                    label="Examination Term"
                    value={selectedExamId}
                    onChange={(e) => setSelectedExamId(e.target.value)}
                  >
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>{ex.name}</option>
                    ))}
                  </Select>
                </div>
              )}

              {selectedReportId === 'fee_defaulters' && (
                <div className="w-52">
                  <Select
                    label="Challan Month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  >
                    <option value="">All Months</option>
                    <option value="November 2026">November 2026</option>
                    <option value="October 2026">October 2026</option>
                    <option value="September 2026">September 2026</option>
                    <option value="August 2026">August 2026</option>
                  </Select>
                </div>
              )}

              {(selectedReportId === 'attendance_register' || selectedReportId === 'net_operating_cash') && (
                <>
                  <div className="w-40">
                    <Input
                      label="From Date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="w-40">
                    <Input
                      label="To Date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </>
              )}

              <Button
                size="md"
                variant="primary"
                onClick={() => generateReport(selectedReportId)}
                isLoading={loading}
              >
                Generate Report
              </Button>
            </div>

            {/* Summary KPI Strip */}
            {reportData?.summary && Object.keys(reportData.summary).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                {Object.entries(reportData.summary).map(([key, val]) => (
                  <div
                    key={key}
                    className="rounded-xl bg-[#F4F6FB] dark:bg-slate-800/70 border border-[#E2E8F0] dark:border-[#263147] px-3.5 py-2.5"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6780] dark:text-slate-400">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </div>
                    <div className="text-base font-bold text-[#16213E] dark:text-white mt-0.5 tabular-nums">
                      {typeof val === 'number' && /amount|billed|collected|balance|revenue|expense|surplus/i.test(key)
                        ? `Rs. ${val.toLocaleString()}`
                        : String(val)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Report Data Table */}
          {reportData && (
            <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263147] rounded-2xl shadow-sm overflow-hidden print-container">
              <div className="px-5 py-4 border-b border-[#E2E8F0] dark:border-[#263147] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-[#16213E] dark:text-white">
                    {reportData.title}
                  </h2>
                  <p className="text-xs text-[#5B6780] dark:text-slate-400 mt-0.5">
                    {reportData.subtitle}
                  </p>
                </div>
                <Badge variant="neutral">
                  {reportData.rows?.length || 0} {reportData.rows?.length === 1 ? 'record' : 'records'}
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm tabular-nums">
                  <thead>
                    <tr className="bg-[#F8FAFC] dark:bg-slate-800/60 border-b border-[#E2E8F0] dark:border-[#263147] text-slate-600 dark:text-slate-300 font-semibold uppercase text-xs tracking-wider">
                      {reportData.columns.map((col: any) => (
                        <th
                          key={col.key}
                          className={`py-3 px-4 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#263147]">
                    {loading ? (
                      <tr>
                        <td colSpan={reportData.columns.length} className="py-12 text-center text-slate-500">
                          <div className="inline-flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-[#2563EB]" />
                            <span>Loading report records...</span>
                          </div>
                        </td>
                      </tr>
                    ) : reportData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={reportData.columns.length} className="py-12 text-center text-slate-500">
                          No matching records found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      reportData.rows.map((row: any, idx: number) => (
                        <tr
                          key={idx}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {reportData.columns.map((col: any) => (
                            <td
                              key={col.key}
                              className={`py-3 px-4 text-slate-800 dark:text-slate-200 ${
                                col.align === 'right' ? 'text-right font-mono font-medium' : ''
                              }`}
                            >
                              {row[col.key] !== undefined && row[col.key] !== null ? String(row[col.key]) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
