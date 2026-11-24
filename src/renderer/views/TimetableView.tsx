import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  ArrowLeft,
  Plus,
  Trash2,
  Calendar,
  Layers,
  RefreshCw,
  AlertCircle,
  X,
} from 'lucide-react';
import { Button, Input, Select, Modal, Badge, Tabs } from '../components/ui';
import { useToast } from '../context/ToastContext';

interface TimetableViewProps {
  onBack: () => void;
  sessionToken?: string | null;
}

const DAYS = [
  { id: '1', label: 'Monday' },
  { id: '2', label: 'Tuesday' },
  { id: '3', label: 'Wednesday' },
  { id: '4', label: 'Thursday' },
  { id: '5', label: 'Friday' },
  { id: '6', label: 'Saturday' },
];

export const TimetableView: React.FC<TimetableViewProps> = ({ onBack, sessionToken }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('1');

  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assign Period Modal
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [periodForm, setPeriodForm] = useState({
    periodName: '1st Period',
    subjectName: 'English',
    startTime: '08:00',
    endTime: '08:45',
    teacherId: '',
    roomNumber: 'Room 101',
  });

  // Load classes, teachers, sessions
  useEffect(() => {
    async function initOptions() {
      if (!window.desktopAPI || !sessionToken) return;
      try {
        const [clsList, staffList, sessList] = await Promise.all([
          window.desktopAPI.getClasses(sessionToken),
          window.desktopAPI.getStaff(sessionToken),
          window.desktopAPI.getAcademicSessions(sessionToken),
        ]);
        setClasses(clsList);
        setTeachers(staffList);
        setSessions(sessList);

        if (clsList.length > 0) {
          setSelectedClassId(clsList[0].id);
          if (clsList[0].sections && clsList[0].sections.length > 0) {
            setSections(clsList[0].sections);
            setSelectedSectionId(clsList[0].sections[0].id);
          }
        }
      } catch (err: any) {
        console.error('Failed to load timetable options:', err);
      }
    }
    initOptions();
  }, [sessionToken]);

  // When class changes, update sections
  useEffect(() => {
    if (selectedClassId) {
      const cls = classes.find((c) => c.id === selectedClassId);
      if (cls && cls.sections) {
        setSections(cls.sections);
        if (cls.sections.length > 0) {
          setSelectedSectionId(cls.sections[0].id);
        } else {
          setSelectedSectionId('');
        }
      }
    }
  }, [selectedClassId, classes]);

  // Load timetable entries
  const loadTimetableEntries = useCallback(async () => {
    if (!window.desktopAPI || !sessionToken || !selectedSectionId) return;
    setLoading(true);
    setError(null);
    try {
      const sessId = sessions[0]?.id || 'sess_current';
      const dayNum = parseInt(selectedDay, 10);
      const list = await window.desktopAPI.getTimetable(sessionToken, sessId, selectedSectionId, dayNum);
      setEntries(list);
    } catch (err: any) {
      console.error('Failed to load timetable:', err);
      setError(err.message || 'Error loading timetable entries');
    } finally {
      setLoading(false);
    }
  }, [selectedSectionId, selectedDay, sessions, sessionToken]);

  useEffect(() => {
    if (selectedSectionId) {
      loadTimetableEntries();
    }
  }, [selectedSectionId, selectedDay, loadTimetableEntries]);

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken || !selectedSectionId) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      const sessId = sessions[0]?.id || 'sess_current';
      const dayNum = parseInt(selectedDay, 10);
      const teacher = teachers.find((t) => t.id === periodForm.teacherId);

      const res = await window.desktopAPI.createTimetableEntry(sessionToken, {
        id: `tt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sessionId: sessId,
        classId: selectedClassId,
        sectionId: selectedSectionId,
        dayOfWeek: dayNum,
        periodName: periodForm.periodName,
        subjectName: periodForm.subjectName,
        startTime: periodForm.startTime,
        endTime: periodForm.endTime,
        teacherId: periodForm.teacherId || null,
        teacherName: teacher ? (teacher.fullName || teacher.full_name) : null,
        roomNumber: periodForm.roomNumber || null,
      });

      if (!res.success) throw new Error(res.error || 'Failed to assign timetable slot');
      setIsAssignOpen(false);
      setAssignError(null);
      await loadTimetableEntries();
      toastSuccess(`Assigned period "${periodForm.periodName}" (${periodForm.subjectName}) to schedule.`, 'Period Scheduled');
    } catch (err: any) {
      setAssignError(err.message || 'Error assigning timetable period');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const res = await window.desktopAPI.deleteTimetableEntry(sessionToken, id);
      if (!res.success) throw new Error(res.error || 'Failed to remove period');
      await loadTimetableEntries();
      toastSuccess('Period slot removed from schedule.', 'Period Removed');
    } catch (err: any) {
      toastError(err.message || 'Error removing timetable entry', 'Timetable Error');
    }
  };

  const currentClass = classes.find((c) => c.id === selectedClassId);
  const currentSection = sections.find((s) => s.id === selectedSectionId);

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
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Class Timetable & Period Slots</h2>
              <Badge variant="primary" size="sm">
                {currentClass ? currentClass.name : 'Select Grade'} — {currentSection?.name || 'Section'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Weekly master schedule, period duration, teacher allocations, and lab clash prevention
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={loadTimetableEntries}
            isLoading={loading}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setIsAssignOpen(true)}
            disabled={!selectedSectionId}
          >
            Assign Period
          </Button>
        </div>
      </div>

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
            title="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Class & Section Selector Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-56">
            <Select
              label="Select Grade"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>

          <div className="w-52">
            <Select
              label="Allocated Section"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              options={sections.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Session: {sessions[0]?.name || '2026-2027'}
        </div>
      </div>

      {/* Day of Week Tabs */}
      <Tabs
        tabs={DAYS}
        activeTab={selectedDay}
        onChange={(d) => setSelectedDay(d)}
      />

      {/* Timetable Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase text-[10px] tracking-wider select-none">
                <th className="py-3 px-4 w-32">Slot</th>
                <th className="py-3 px-4 w-44">Timing</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Assigned Teacher</th>
                <th className="py-3 px-4">Room / Facility</th>
                <th className="py-3 px-4 text-right w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 dark:text-slate-500">
                    Loading timetable slots from local database...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 dark:text-slate-500">
                    No periods scheduled for this section on this day.
                  </td>
                </tr>
              ) : (
                entries.map((p) => {
                  const isBreak = p.periodName?.toLowerCase().includes('break') || p.periodName?.toLowerCase().includes('recess');
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/50 transition-colors ${
                        isBreak ? 'bg-amber-50/40 dark:bg-amber-950/20 font-medium' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-bold text-indigo-700 dark:text-indigo-400">{p.periodName}</td>
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                        {p.startTime} - {p.endTime}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{p.subjectName}</td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{p.teacherName || '—'}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">{p.roomNumber || '—'}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(p.id)}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded transition-colors"
                          title="Delete Period"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Period Modal */}
      <Modal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        title={`Assign Period Slot (${DAYS.find((d) => d.id === selectedDay)?.label})`}
        size="md"
        footer={
          <div className="flex items-center justify-end space-x-2">
            <Button variant="outline" size="sm" onClick={() => setIsAssignOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreatePeriod} isLoading={assignLoading}>
              Save Period Slot
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreatePeriod} className="space-y-3.5">
          {assignError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{assignError}</span>
              </div>
              <button type="button" onClick={() => setAssignError(null)} className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Period Slot Name"
              required
              value={periodForm.periodName}
              onChange={(e) => setPeriodForm({ ...periodForm, periodName: e.target.value })}
              placeholder="e.g. 1st Period"
            />
            <Input
              label="Subject Name"
              required
              value={periodForm.subjectName}
              onChange={(e) => setPeriodForm({ ...periodForm, subjectName: e.target.value })}
              placeholder="e.g. Mathematics"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Start Time"
              required
              value={periodForm.startTime}
              onChange={(e) => setPeriodForm({ ...periodForm, startTime: e.target.value })}
              placeholder="08:00 AM"
            />
            <Input
              label="End Time"
              required
              value={periodForm.endTime}
              onChange={(e) => setPeriodForm({ ...periodForm, endTime: e.target.value })}
              placeholder="08:45 AM"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Assigned Teacher"
              value={periodForm.teacherId}
              onChange={(e) => setPeriodForm({ ...periodForm, teacherId: e.target.value })}
              options={[
                { value: '', label: 'Select Teacher (Optional)' },
                ...teachers.map((t) => ({ value: t.id, label: `${t.fullName || t.full_name} (${t.designation})` })),
              ]}
            />
            <Input
              label="Classroom / Facility"
              value={periodForm.roomNumber}
              onChange={(e) => setPeriodForm({ ...periodForm, roomNumber: e.target.value })}
              placeholder="e.g. Room 1001, Lab"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
