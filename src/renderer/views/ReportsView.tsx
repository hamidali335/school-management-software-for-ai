import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  ArrowLeft,
  Download,
  FileText,
  Printer,
  RefreshCw,
  AlertCircle,
  Users,
  DollarSign,
  CalendarCheck2,
  CheckCircle2,
  TrendingUp,
  Award,
  Calendar,
  FileDown,
  X,
} from 'lucide-react';
import {
  Button,
  Select,
  Input,
  Badge,
} from '../components/ui';
import { useToast } from '../context/ToastContext';

interface ReportsViewProps {
  onBack: () => void;
  sessionToken?: string | null;
}

const REPORT_TYPES = [
  {
    id: 'student_roster',
    title: 'Official Student Enrollment Roster',
    desc: 'Complete directory with admission #, father name, contact, B-Form, and class allocations.',
    icon: <Users className="w-5 h-5" />,
    format: 'PDF / Excel / CSV',
    badge: 'Admissions',
  },
  {
    id: 'fee_defaulters',
    title: 'Monthly Tuition Fee Defaulter Report',
    desc: 'Detailed list of outstanding fee challans grouped by class, student, and balance due.',
    icon: <DollarSign className="w-5 h-5" />,
    format: 'PDF / Excel / CSV',
    badge: 'Finance',
  },
  {
    id: 'net_operating_cash',
    title: 'Net Operating Cash Flow Statement',
    desc: 'Realized collected revenue minus actual incurred institutional expenses.',
    icon: <TrendingUp className="w-5 h-5" />,
    format: 'PDF / Excel / CSV',
    badge: 'Finance',
  },
  {
    id: 'exam_gazette',
    title: 'Official Examination Gazette & Rankings',
    desc: 'Class-wise student rankings, obtained marks, overall percentages, and GPA grades.',
    icon: <Award className="w-5 h-5" />,
    format: 'PDF / Excel / CSV',
    badge: 'Academics',
  },
  {
    id: 'attendance_register',
    title: 'Monthly Attendance Register Summary',
    desc: 'Student-wise attendance metrics: present days, absents, late arrivals, and percentages.',
    icon: <CalendarCheck2 className="w-5 h-5" />,
    format: 'PDF / Excel / CSV',
    badge: 'Academic',
  },
  {
    id: 'staff_roster',
    title: 'Faculty & Administrative Staff Roster',
    desc: 'Designation report, employee codes, joined dates, contact numbers, and qualifications.',
    icon: <FileSpreadsheet className="w-5 h-5" />,
    format: 'PDF / Excel / CSV',
    badge: 'Personnel',
  },
];

export const ReportsView: React.FC<ReportsViewProps> = ({ onBack, sessionToken }) => {
  const [selectedReportId, setSelectedReportId] = useState<string>('student_roster');
  const [reportData, setReportData] = useState<any | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('November 2026');

  const todayStr = new Date().toISOString().split('T')[0];
  const monthStartStr = `${todayStr.substring(0, 7)}-01`;
  const [startDate, setStartDate] = useState<string>(monthStartStr);
  const [endDate, setEndDate] = useState<string>(todayStr);

  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  // Load classes, exams, sessions initially
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
        if (clsList.length > 0 && !selectedClassId) {
          setSelectedClassId(clsList[0].id);
        }
        if (exList.length > 0 && !selectedExamId) {
          setSelectedExamId(exList[0].id);
        }
        if (sessList.length > 0 && !selectedSessionId) {
          setSelectedSessionId(sessList[0].id);
        }
      } catch (err) {
        console.error('Failed to load initial criteria for reports:', err);
      }
    }
    initData();
  }, [sessionToken]);

  const generateReport = useCallback(
    async (reportId: string) => {
      if (!window.desktopAPI || !sessionToken) return;
      setLoading(true);
      setError(null);
      try {
        const params: any = {};
        if (selectedClassId) params.classId = selectedClassId;
        if (selectedExamId) params.examId = selectedExamId;
        if (selectedSessionId) params.sessionId = selectedSessionId;
        if (selectedMonth) params.month = selectedMonth;
        params.startDate = startDate;
        params.endDate = endDate;

        const res = await window.desktopAPI.getReport(sessionToken, reportId, params);
        setReportData(res);
        setSelectedReportId(reportId);
      } catch (err: any) {
        console.error('Failed to generate report:', err);
        setError(err.message || 'Failed to retrieve report data from local database.');
      } finally {
        setLoading(false);
      }
    },
    [sessionToken, selectedClassId, selectedExamId, selectedSessionId, selectedMonth, startDate, endDate]
  );

  useEffect(() => {
    generateReport(selectedReportId);
  }, [generateReport, selectedReportId]);

  // Export to native PDF via Electron printToPDF
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
          toastSuccess(`PDF report saved successfully to:\n${res.filePath}`, 'Export Complete');
        } else if (res.canceled) {
          // User cancelled save dialog
        } else {
          toastError(res.error || 'Failed to generate PDF document.', 'Export Error');
        }
      } else {
        window.print();
      }
    } catch (err: any) {
      console.error('PDF export failed:', err);
      toastError(err?.message || 'Error occurred during PDF generation.', 'Export Error');
    } finally {
      setExportingPdf(false);
    }
  };

  // Export to Excel-ready CSV with UTF-8 BOM
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
          toastSuccess(`Excel-compatible CSV spreadsheet saved to:\n${res.filePath}`, 'Export Complete');
        } else if (res.canceled) {
          // User cancelled save dialog
        } else {
          toastError(res.error || 'Failed to generate CSV export file.', 'Export Error');
        }
      } else {
        handleExportCSV();
      }
    } catch (err: any) {
      console.error('Excel export failed:', err);
      toastError(err?.message || 'Error occurred during Excel export.', 'Export Error');
    } finally {
      setExportingExcel(false);
    }
  };

  // Fallback CSV browser download
  const handleExportCSV = () => {
    if (!reportData || !reportData.rows || reportData.rows.length === 0) return;

    const bom = '\uFEFF';
    const headers = reportData.columns.map((c: any) => `"${c.header}"`).join(',');
    const rows = reportData.rows.map((row: any) => {
      return reportData.columns
        .map((c: any) => {
          const val = row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]) : '';
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(',');
    });

    const csvContent = bom + [headers, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedReportId}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toastSuccess('CSV file generated and downloaded.', 'CSV Export');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5 pb-8 font-sans">
      {/* ─── Top Header & Primary Export Actions ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Institutional Reports & Document Export
              </h2>
              <Badge variant="primary">Verified Data</Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Generate official rosters, gazettes, cash flow statements, and attendance records
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
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handlePrint}
            disabled={!reportData || !reportData.rows?.length}
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportExcel}
            isLoading={exportingExcel}
            disabled={!reportData || !reportData.rows?.length}
            title="Export data as UTF-8 CSV formatted for Microsoft Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            Export CSV (Excel)
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleExportPDF}
            isLoading={exportingPdf}
            disabled={!reportData || !reportData.rows?.length}
          >
            <FileDown className="w-3.5 h-3.5 mr-1.5" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Dismissible Error Banner */}
      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between space-x-2 text-xs text-rose-700 dark:text-rose-300 animate-in fade-in duration-150">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Available Report Templates Grid ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {REPORT_TYPES.map((rep) => {
          const isSelected = selectedReportId === rep.id;
          return (
            <div
              key={rep.id}
              onClick={() => generateReport(rep.id)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500/80 shadow-xs ring-1 ring-indigo-500/30'
                  : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {rep.icon}
                </div>
                <Badge variant={isSelected ? 'primary' : 'neutral'} size="sm">
                  {rep.badge}
                </Badge>
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white text-xs line-clamp-1">{rep.title}</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                {rep.desc}
              </p>
              <div className="mt-2 text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
                Formats: {rep.format}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Filter & Parameters Toolbar for Active Report ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Class Filter */}
          {(selectedReportId === 'student_roster' ||
            selectedReportId === 'attendance_register' ||
            selectedReportId === 'exam_gazette') && (
            <div className="w-52">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Grade / Class
              </label>
              <Select
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

          {/* Exam Filter */}
          {selectedReportId === 'exam_gazette' && (
            <div className="w-56">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Examination Term
              </label>
              <Select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </Select>
            </div>
          )}

          {/* Month Selector for Defaulters */}
          {selectedReportId === 'fee_defaulters' && (
            <div className="w-48">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Challan Month
              </label>
              <Select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                <option value="November 2026">November 2026</option>
                <option value="October 2026">October 2026</option>
                <option value="September 2026">September 2026</option>
                <option value="August 2026">August 2026</option>
                <option value="">All Months</option>
              </Select>
            </div>
          )}

          {/* Date Range for Attendance & Cash Flow */}
          {(selectedReportId === 'attendance_register' || selectedReportId === 'net_operating_cash') && (
            <>
              <div className="w-36">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  From Date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="w-36">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  To Date
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="self-end pb-0.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => generateReport(selectedReportId)}
            >
              Apply Filter
            </Button>
          </div>
        </div>

        {/* Summary Statistics Badges */}
        {reportData?.summary && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {Object.entries(reportData.summary).map(([key, val]) => (
              <span
                key={key}
                className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <strong className="text-slate-500 dark:text-slate-400">
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                </strong>{' '}
                {typeof val === 'number' && key.toLowerCase().includes('amount')
                  ? `Rs. ${val.toLocaleString()}`
                  : String(val)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ─── Report Preview Data Table ─── */}
      {reportData && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden print-container">
          {/* Table Header Banner */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                {reportData.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {reportData.subtitle}
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
              Generated: {new Date(reportData.generatedAt).toLocaleString()}
            </span>
          </div>

          {/* Table Viewport */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold uppercase text-[10px] tracking-wider select-none">
                  {reportData.columns.map((col: any) => (
                    <th
                      key={col.key}
                      className={`py-3 px-4 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={reportData.columns.length} className="py-12 text-center text-slate-400">
                      <div className="flex items-center justify-center space-x-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                        <span>Querying local SQLite database records...</span>
                      </div>
                    </td>
                  </tr>
                ) : reportData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={reportData.columns.length} className="py-12 text-center text-slate-400">
                      No matching records found for the selected criteria.
                    </td>
                  </tr>
                ) : (
                  reportData.rows.map((row: any, idx: number) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {reportData.columns.map((col: any) => (
                        <td
                          key={col.key}
                          className={`py-2.5 px-4 text-slate-800 dark:text-slate-200 ${
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
  );
};
