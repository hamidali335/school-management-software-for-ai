import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarCheck2,
  ArrowLeft,
  Calendar,
  Check,
  X,
  Clock,
  Save,
  CheckCheck,
  RefreshCw,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { Button, Select, Badge, ErrorPanel } from '../components/ui';
import { useToast } from '../context/ToastContext';

interface AttendanceViewProps {
  onBack: () => void;
  sessionToken?: string | null;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({ onBack, sessionToken }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<any[]>([]);
  const [records, setRecords] = useState<{ [studentId: string]: { status: 'present' | 'absent' | 'late' | 'leave'; remarks: string } }>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load classes initially
  useEffect(() => {
    async function initClasses() {
      if (!window.desktopAPI || !sessionToken) return;
      try {
        const clsList = await window.desktopAPI.getClasses(sessionToken);
        setClasses(clsList);
        if (clsList.length > 0) {
          setSelectedClassId(clsList[0].id);
        }
      } catch (err) {
        console.error('Failed to load classes for attendance:', err);
      }
    }
    initClasses();
  }, [sessionToken]);

  // Load students when selectedClassId changes
  const loadClassStudents = useCallback(async () => {
    if (!window.desktopAPI || !sessionToken || !selectedClassId) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const stdList = await window.desktopAPI.getStudents(sessionToken, {
        classId: selectedClassId,
      });
      setStudents(stdList);

      // Initialize all students to 'present' by default
      const initialMap: { [studentId: string]: { status: 'present' | 'absent' | 'late' | 'leave'; remarks: string } } = {};
      for (const std of stdList) {
        initialMap[std.id] = { status: 'present', remarks: '' };
      }
      setRecords(initialMap);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to load class students' });
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, sessionToken]);

  useEffect(() => {
    if (selectedClassId) {
      loadClassStudents();
    }
  }, [selectedClassId, loadClassStudents]);

  const handleStatusChange = (studentId: string, status: 'present' | 'absent' | 'late' | 'leave') => {
    setRecords((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
      },
    }));
  };

  const handleRemarksChange = (studentId: string, remarks: string) => {
    setRecords((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks,
      },
    }));
  };

  const markAll = (status: 'present' | 'absent') => {
    setRecords((prev) => {
      const updated = { ...prev };
      for (const std of students) {
        updated[std.id] = {
          ...updated[std.id],
          status,
        };
      }
      return updated;
    });
  };

  const handleSaveAttendance = async () => {
    if (!window.desktopAPI || !sessionToken || students.length === 0) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const entries = students.map((std) => {
        const rec = records[std.id] || { status: 'present', remarks: '' };
        return {
          id: `att_${std.id}_${selectedDate}`,
          studentId: std.id,
          sessionId: std.session_id || 'sess_current',
          classId: std.class_id || selectedClassId,
          sectionId: std.section_id || std.sections?.[0]?.id || 'sec_1',
          date: selectedDate,
          status: rec.status,
          remarks: rec.remarks || null,
        };
      });

      const res = await window.desktopAPI.recordAttendance(sessionToken, entries);
      if (!res.success) {
        throw new Error(res.error || 'Failed to record attendance');
      }

      const msg = `Successfully saved attendance for ${res.recordedCount || entries.length} students on ${selectedDate}!`;
      setStatusMessage({
        type: 'success',
        text: msg,
      });
      toastSuccess(msg, 'Attendance Recorded');
    } catch (err: any) {
      const errText = err.message || 'Error recording attendance';
      setStatusMessage({ type: 'error', text: errText });
      toastError(errText, 'Attendance Error');
    } finally {
      setSaving(false);
    }
  };

  const totalCount = students.length;
  const presentCount = students.filter((s) => records[s.id]?.status === 'present').length;
  const absentCount = students.filter((s) => records[s.id]?.status === 'absent').length;
  const lateCount = students.filter((s) => records[s.id]?.status === 'late').length;
  const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100;

  return (
    <div className="space-y-5 pb-8 font-sans">
      {/* Header */}
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
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Daily Attendance Roll-Call</h2>
              <Badge variant="success" size="sm">Active Session</Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Record daily student attendance with instant local database uniqueness constraint
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            icon={<CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
            onClick={() => markAll('present')}
          >
            Mark All Present
          </Button>

          <Button
            size="sm"
            variant="primary"
            icon={<Save className="w-3.5 h-3.5" />}
            onClick={handleSaveAttendance}
            isLoading={saving}
            disabled={students.length === 0}
          >
            Save Attendance
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl flex items-center justify-between text-xs border animate-in fade-in duration-150 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Control Bar & Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Roll Call Date</p>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-slate-100 border-none bg-transparent focus:outline-none cursor-pointer"
            />
          </div>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div className="w-full">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Academic Grade</p>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="mt-0.5 w-full text-xs font-semibold text-slate-800 dark:text-slate-100 border-none bg-transparent focus:outline-none cursor-pointer"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id} className="dark:bg-slate-900 dark:text-slate-100">
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Attendance Rate</p>
            <p className="text-base font-bold text-slate-900 dark:text-white">{attendanceRate}%</p>
          </div>
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {presentCount} / {totalCount}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Breakdown</p>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{presentCount} P</span> •{' '}
              <span className="text-rose-600 dark:text-rose-400 font-bold">{absentCount} A</span> •{' '}
              <span className="text-amber-600 dark:text-amber-400 font-bold">{lateCount} L</span>
            </p>
          </div>
        </div>
      </div>

      {/* Attendance Sheet Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase text-[10px] tracking-wider select-none">
                <th className="py-3 px-4 w-28">Roll #</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Father Name</th>
                <th className="py-3 px-4 text-center w-72">Attendance Status</th>
                <th className="py-3 px-4">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    Loading class roster from local database...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    No students currently enrolled in this grade.
                  </td>
                </tr>
              ) : (
                students.map((std) => {
                  const currentStatus = records[std.id]?.status || 'present';
                  return (
                    <tr key={std.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                        {std.roll_number || std.admission_number}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {std.full_name}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {std.father_name}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleStatusChange(std.id, 'present')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                              currentStatus === 'present'
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300'
                            }`}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(std.id, 'absent')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                              currentStatus === 'absent'
                                ? 'bg-rose-600 text-white shadow-2xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-700 dark:hover:text-rose-300'
                            }`}
                          >
                            Absent
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(std.id, 'late')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                              currentStatus === 'late'
                                ? 'bg-amber-500 text-white shadow-2xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 hover:text-amber-700 dark:hover:text-amber-300'
                            }`}
                          >
                            Late
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={records[std.id]?.remarks || ''}
                          onChange={(e) => handleRemarksChange(std.id, e.target.value)}
                          placeholder="Optional note..."
                          className="w-full text-xs px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
