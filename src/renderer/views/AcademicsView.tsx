import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  ArrowLeft,
  Plus,
  Calendar,
  Layers,
  RefreshCw,
  AlertCircle,
  Users,
  CheckCircle2,
  X,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Input,
  Select,
  Modal,
  Badge,
  Tabs,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui';
import { APP_METADATA } from '../../shared/constants';
import { useToast } from '../context/ToastContext';

interface AcademicsViewProps {
  onBack: () => void;
  sessionToken?: string | null;
}

export const AcademicsView: React.FC<AcademicsViewProps> = ({ onBack, sessionToken }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [classes, setClasses] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'classes' | 'subjects' | 'sessions'>('classes');
  const [subjects, setSubjects] = useState<any[]>([]);
  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '', type: 'core' as 'core' | 'elective' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal error states
  const [classError, setClassError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Add Class Modal State
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [classLoading, setClassLoading] = useState(false);
  const [classForm, setClassForm] = useState({
    id: '',
    name: '',
    orderIndex: 1,
    sections: 'Section A, Section B',
  });

  // Add Session Modal State
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    id: '',
    name: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
  });

  const loadData = useCallback(async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setLoading(true);
    setError(null);
    try {
      const [clsList, sessList] = await Promise.all([
        window.desktopAPI.getClasses(sessionToken),
        window.desktopAPI.getAcademicSessions(sessionToken),
      ]);
      setClasses(clsList);
      setSessions(sessList);
    } catch (err: any) {
      console.error('Failed to load academics data:', err);
      setError(err.message || 'Failed to retrieve academic structure');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAddClass = () => {
    const nextOrder = classes.length + 1;
    setClassForm({
      id: `cls_${Date.now()}`,
      name: `Class ${nextOrder}`,
      orderIndex: nextOrder,
      sections: 'Section A, Section B',
    });
    setClassError(null);
    setIsAddClassOpen(true);
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setClassLoading(true);
    setClassError(null);
    try {
      const sectionsArray = classForm.sections
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const res = await window.desktopAPI.createClass(sessionToken, {
        id: classForm.id,
        name: classForm.name,
        orderIndex: Number(classForm.orderIndex),
        sections: sectionsArray.length > 0 ? sectionsArray : ['Section A'],
      });

      if (!res.success) throw new Error(res.error || 'Failed to create class');
      setIsAddClassOpen(false);
      setClassError(null);
      await loadData();
      toastSuccess(`Academic Grade "${classForm.name}" created successfully.`, 'Class Created');
    } catch (err: any) {
      setClassError(err.message || 'Error creating academic grade');
    } finally {
      setClassLoading(false);
    }
  };

  const handleOpenAddSession = () => {
    const nextYear = new Date().getFullYear() + 1;
    setSessionForm({
      id: `sess_${Date.now()}`,
      name: `Session ${nextYear}-${nextYear + 1}`,
      startDate: `${nextYear}-04-01`,
      endDate: `${nextYear + 1}-03-31`,
      isCurrent: false,
    });
    setSessionError(null);
    setIsAddSessionOpen(true);
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setSessionLoading(true);
    setSessionError(null);
    try {
      const res = await window.desktopAPI.createAcademicSession(sessionToken, {
        id: sessionForm.id,
        name: sessionForm.name,
        startDate: sessionForm.startDate,
        endDate: sessionForm.endDate,
        isCurrent: sessionForm.isCurrent,
      });

      if (!res.success) throw new Error(res.error || 'Failed to create academic session');
      setIsAddSessionOpen(false);
      setSessionError(null);
      await loadData();
      toastSuccess(`Academic Session "${sessionForm.name}" created.`, 'Session Created');
    } catch (err: any) {
      setSessionError(err.message || 'Error creating academic session');
    } finally {
      setSessionLoading(false);
    }
  };

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
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Academic Sessions & Grade Infrastructure</h2>
              <Badge variant="primary" size="sm">
                {sessions[0]?.name || APP_METADATA.DEFAULT_SESSION_NAME}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configure class hierarchies, allocated sections, subjects, and session rollovers
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={loadData}
            isLoading={loading}
          >
            Refresh
          </Button>
          {activeTab === 'classes' ? (
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={handleOpenAddClass}
            >
              Add Class Grade
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={handleOpenAddSession}
            >
              Add Session
            </Button>
          )}
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

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <Tabs
          tabs={[
            { id: 'classes', label: 'Class Grades & Sections', icon: <Layers className="w-3.5 h-3.5" />, badge: classes.length },
            { id: 'subjects', label: 'Subjects Master', icon: <BookOpen className="w-3.5 h-3.5" />, badge: subjects.length },
            { id: 'sessions', label: 'Academic Sessions Calendar', icon: <Calendar className="w-3.5 h-3.5" />, badge: sessions.length },
          ]}
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
        />
        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Academic Records</span>
      </div>

      {/* Tab 1: Classes Grid */}
      {activeTab === 'classes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => (
            <div key={cls.id} className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                    Order Index #{cls.orderIndex}
                  </span>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">{cls.name}</h3>
                </div>
                <Badge variant="primary" size="sm">
                  {cls.studentCount || 0} Students
                </Badge>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 block mb-1.5 font-medium">Sections:</span>
                <div className="flex flex-wrap gap-1.5">
                  {cls.sections && cls.sections.length > 0 ? (
                    cls.sections.map((sec: any) => (
                      <span
                        key={sec.id}
                        className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700"
                      >
                        {sec.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500 italic">No sections created</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Sessions List */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Standardized institutional subjects used across Exams, Report Cards, and Timetable.
            </p>
            <Button variant="primary" size="sm" onClick={() => { setSubjectForm({ name: '', code: '', type: 'core' }); setIsAddSubjectOpen(true); }}>
              <Plus className="w-4 h-4" />
              Add Subject
            </Button>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            {subjects.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No subjects configured yet. Click <strong>Add Subject</strong> to create your subject master list (e.g., Mathematics, English, Computer).
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Subject Name</th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {subjects.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{sub.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">{sub.code}</td>
                      <td className="py-3 px-4">
                        <Badge variant={sub.type === 'core' ? 'primary' : 'neutral'}>{sub.type === 'core' ? 'Core' : 'Elective'}</Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (!sessionToken || !window.desktopAPI?.deleteSubject) return;
                            await window.desktopAPI.deleteSubject(sessionToken, sub.id);
                            await loadData();
                          }}
                          title="Remove Subject"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="space-y-3">
          {sessions.map((sess) => (
            <div
              key={sess.id}
              className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">{sess.name}</h3>
                    {sess.isCurrent ? (
                      <Badge variant="success" size="sm">Current Active Session</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    {sess.startDate} through {sess.endDate}
                  </p>
                </div>
              </div>

              <div className="text-right text-xs text-slate-400 dark:text-slate-500 font-mono">
                ID: {sess.id}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Class Modal */}
      <Modal
        isOpen={isAddClassOpen}
        onClose={() => setIsAddClassOpen(false)}
        title="Create New Academic Grade"
        size="md"
        footer={
          <div className="flex items-center justify-end space-x-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddClassOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateClass} isLoading={classLoading}>
              Save Class Grade
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateClass} className="space-y-3.5">
          {classError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{classError}</span>
              </div>
              <button type="button" onClick={() => setClassError(null)} className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Input
            label="Class / Grade Name"
            required
            value={classForm.name}
            onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
            placeholder="e.g. Grade 11 - Science"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Unique Class ID"
              required
              value={classForm.id}
              onChange={(e) => setClassForm({ ...classForm, id: e.target.value })}
            />
            <Input
              label="Display Order Index"
              type="number"
              required
              value={String(classForm.orderIndex)}
              onChange={(e) => setClassForm({ ...classForm, orderIndex: Number(e.target.value) })}
            />
          </div>
          <Input
            label="Sections (Comma-Separated)"
            required
            value={classForm.sections}
            onChange={(e) => setClassForm({ ...classForm, sections: e.target.value })}
            placeholder="Section A, Section B, Section C"
            helperText="Sections will be automatically generated and linked with restrict deletion protection."
          />
        </form>
      </Modal>

      {/* Add Session Modal */}
      <Modal
        isOpen={isAddSessionOpen}
        onClose={() => setIsAddSessionOpen(false)}
        title="Add Academic Calendar Session"
        size="md"
        footer={
          <div className="flex items-center justify-end space-x-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddSessionOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateSession} isLoading={sessionLoading}>
              Create Session
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateSession} className="space-y-3.5">
          {sessionError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{sessionError}</span>
              </div>
              <button type="button" onClick={() => setSessionError(null)} className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Input
            label="Session Name"
            required
            value={sessionForm.name}
            onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
            placeholder="e.g. Academic Session 2027-2028"
          />
          <Input
            label="Session ID"
            required
            value={sessionForm.id}
            onChange={(e) => setSessionForm({ ...sessionForm, id: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Start Date"
              type="date"
              required
              value={sessionForm.startDate}
              onChange={(e) => setSessionForm({ ...sessionForm, startDate: e.target.value })}
            />
            <Input
              label="End Date"
              type="date"
              required
              value={sessionForm.endDate}
              onChange={(e) => setSessionForm({ ...sessionForm, endDate: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isAddSubjectOpen}
        onClose={() => setIsAddSubjectOpen(false)}
        title="Add New Subject"
        subtitle="Define a standardized subject for exams and timetables"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsAddSubjectOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={subjectLoading}
              onClick={async () => {
                if (!sessionToken || !window.desktopAPI?.createSubject || !subjectForm.name.trim() || !subjectForm.code.trim()) return;
                setSubjectLoading(true);
                try {
                  const res = await window.desktopAPI.createSubject(sessionToken, subjectForm);
                  if (res.success) {
                    setIsAddSubjectOpen(false);
                    await loadData();
                  }
                } finally {
                  setSubjectLoading(false);
                }
              }}
            >
              Save Subject
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Subject Name"
            required
            placeholder="e.g. Mathematics"
            value={subjectForm.name}
            onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Subject Code"
              required
              placeholder="e.g. MATH"
              value={subjectForm.code}
              onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value.toUpperCase() })}
            />
            <Select
              label="Subject Type"
              required
              value={subjectForm.type}
              onChange={(e) => setSubjectForm({ ...subjectForm, type: e.target.value as 'core' | 'elective' })}
            >
              <option value="core">Core</option>
              <option value="elective">Elective</option>
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
};
