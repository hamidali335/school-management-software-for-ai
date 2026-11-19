import React, { useState, useEffect, useCallback } from 'react';
import {
  Award,
  ArrowLeft,
  Plus,
  Calendar,
  FileText,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  BookOpen,
  Printer,
  Sparkles,
  TrendingUp,
  Settings,
  X,
} from 'lucide-react';
import {
  Button,
  Input,
  Select,
  Modal,
  Badge,
  DataTable,
  Column,
  ErrorPanel,
} from '../components/ui';
import { useToast } from '../context/ToastContext';

interface ExamsViewProps {
  onBack: () => void;
  sessionToken?: string | null;
}

export const ExamsView: React.FC<ExamsViewProps> = ({ onBack, sessionToken }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [exams, setExams] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState<any | null>(null);
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal-isolated errors
  const [examError, setExamError] = useState<string | null>(null);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [marksError, setMarksError] = useState<string | null>(null);

  // Result Calculation & Gazette State
  const [gazetteClassId, setGazetteClassId] = useState<string>('');
  const [gazetteData, setGazetteData] = useState<any | null>(null);
  const [isGazetteOpen, setIsGazetteOpen] = useState(false);
  const [gazetteLoading, setGazetteLoading] = useState(false);

  // Printable Report Card State
  const [reportCardData, setReportCardData] = useState<any | null>(null);
  const [isReportCardOpen, setIsReportCardOpen] = useState(false);
  const [reportCardLoading, setReportCardLoading] = useState(false);

  // Grading Scales Configuration Modal State
  const [isGradingModalOpen, setIsGradingModalOpen] = useState(false);
  const [gradingScales, setGradingScales] = useState<any[]>([]);
  const [gradingLoading, setGradingLoading] = useState(false);

  // Create Exam Modal
  const [isCreateExamOpen, setIsCreateExamOpen] = useState(false);
  const [createExamLoading, setCreateExamLoading] = useState(false);
  const [examForm, setExamForm] = useState({
    name: 'Mid Term Examination 2026',
    sessionId: '',
    term: 'mid_term',
    startDate: '2026-06-10',
    endDate: '2026-06-25',
    status: 'scheduled',
  });

  // Create Paper Modal
  const [isCreatePaperOpen, setIsCreatePaperOpen] = useState(false);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperForm, setPaperForm] = useState({
    classId: '',
    subjectName: 'Mathematics',
    maxMarks: 100,
    passMarks: 40,
    examDate: '2026-06-12',
  });

  // Record Marks Modal
  const [selectedPaperForMarks, setSelectedPaperForMarks] = useState<any | null>(null);
  const [marksStudents, setMarksStudents] = useState<any[]>([]);
  const [marksState, setMarksState] = useState<{ [studentId: string]: { obtained: number; isAbsent: boolean; remarks: string } }>({});
  const [recordMarksLoading, setRecordMarksLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setLoading(true);
    setError(null);
    try {
      const [exList, sessList, clsList] = await Promise.all([
        window.desktopAPI.getExams(sessionToken),
        window.desktopAPI.getAcademicSessions(sessionToken),
        window.desktopAPI.getClasses(sessionToken),
      ]);
      setExams(exList);
      setSessions(sessList);
      setClasses(clsList);

      if (exList.length > 0 && !selectedExam) {
        setSelectedExam(exList[0]);
      }
      if (sessList.length > 0 && !examForm.sessionId) {
        setExamForm((prev) => ({ ...prev, sessionId: sessList[0].id }));
      }
      if (clsList.length > 0 && !paperForm.classId) {
        setPaperForm((prev) => ({ ...prev, classId: clsList[0].id }));
        setGazetteClassId(clsList[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load exams:', err);
      setError(err.message || 'Failed to load examinations');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, selectedExam, examForm.sessionId, paperForm.classId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load papers when exam selected
  const loadPapers = useCallback(async () => {
    if (!selectedExam || !window.desktopAPI || !sessionToken) return;
    try {
      const paperList = await window.desktopAPI.getExamPapers(sessionToken, selectedExam.id);
      setPapers(paperList);
    } catch (err) {
      console.error('Failed to load papers:', err);
    }
  }, [selectedExam, sessionToken]);

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  // Create Exam
  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setCreateExamLoading(true);
    setExamError(null);
    try {
      const id = `exam_${Date.now()}`;
      const res = await window.desktopAPI.createExam(sessionToken, {
        id,
        name: examForm.name,
        sessionId: examForm.sessionId,
        term: examForm.term as any,
        startDate: examForm.startDate,
        endDate: examForm.endDate,
        status: examForm.status as any,
      });

      if (!res.success) throw new Error(res.error || 'Failed to create exam');

      setIsCreateExamOpen(false);
      setExamError(null);
      await loadData();
      toastSuccess(`Scheduled examination "${examForm.name}".`, 'Exam Created');
    } catch (err: any) {
      setExamError(err.message || 'Failed to create exam');
    } finally {
      setCreateExamLoading(false);
    }
  };

  // Publish Exam
  const handlePublishExam = async (examId: string) => {
    if (!window.desktopAPI || !sessionToken) return;
    try {
      const res = await window.desktopAPI.publishExam(sessionToken, examId);
      if (!res.success) throw new Error(res.error || 'Failed to publish exam');
      await loadData();
      toastSuccess('Examination marks published to official transcripts.', 'Exam Published');
    } catch (err: any) {
      toastError(err.message || 'Failed to publish exam', 'Publish Error');
    }
  };

  // Create Paper
  const handleCreatePaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam || !window.desktopAPI || !sessionToken) return;
    setPaperLoading(true);
    setPaperError(null);
    try {
      const id = `pap_${Date.now()}`;
      const res = await window.desktopAPI.createExamPaper(sessionToken, {
        id,
        examId: selectedExam.id,
        classId: paperForm.classId,
        subjectName: paperForm.subjectName,
        maxMarks: Number(paperForm.maxMarks),
        passMarks: Number(paperForm.passMarks),
        examDate: paperForm.examDate,
      });

      if (!res.success) throw new Error(res.error || 'Failed to create paper');

      setIsCreatePaperOpen(false);
      setPaperError(null);
      await loadPapers();
      toastSuccess(`Paper "${paperForm.subjectName}" scheduled for ${selectedExam.name}.`, 'Paper Scheduled');
    } catch (err: any) {
      setPaperError(err.message || 'Failed to create exam paper');
    } finally {
      setPaperLoading(false);
    }
  };

  // Open Marks Recording Modal
  const handleOpenMarks = async (paper: any) => {
    if (!window.desktopAPI || !sessionToken) return;
    setSelectedPaperForMarks(paper);
    setMarksError(null);
    try {
      const [allStudents, existingMarks] = await Promise.all([
        window.desktopAPI.getStudents(sessionToken, { classId: paper.classId }),
        window.desktopAPI.getMarksForPaper(sessionToken, paper.id),
      ]);
      setMarksStudents(allStudents);

      const state: any = {};
      allStudents.forEach((s) => {
        const found = existingMarks.find((m: any) => m.studentId === s.id);
        state[s.id] = {
          obtained: found ? (found.obtainedMarks ?? 0) : 0,
          isAbsent: found ? Boolean(found.isAbsent) : false,
          remarks: found?.remarks || '',
        };
      });
      setMarksState(state);
    } catch (err) {
      console.error('Failed to load marks entry:', err);
    }
  };

  // Record Marks Submit
  const handleRecordMarksSubmit = async () => {
    if (!selectedPaperForMarks || !selectedExam || !window.desktopAPI || !sessionToken) return;
    setRecordMarksLoading(true);
    setMarksError(null);
    try {
      const marksPayload = Object.keys(marksState).map((studentId) => ({
        studentId,
        obtainedMarks: marksState[studentId].isAbsent ? null : Number(marksState[studentId].obtained),
        isAbsent: marksState[studentId].isAbsent,
        remarks: marksState[studentId].remarks || undefined,
      }));

      const res = await window.desktopAPI.recordMarks(sessionToken, selectedExam.id, selectedPaperForMarks.id, marksPayload);
      if (!res.success) throw new Error(res.error || 'Failed to save marks');

      setSelectedPaperForMarks(null);
      setMarksError(null);
      toastSuccess(`Marks recorded for ${marksPayload.length} students.`, 'Marks Saved');
    } catch (err: any) {
      setMarksError(err.message || 'Failed to record marks');
    } finally {
      setRecordMarksLoading(false);
    }
  };

  // Calculate Results & View Gazette
  const handleCalculateGazette = async () => {
    if (!selectedExam || !gazetteClassId || !window.desktopAPI || !sessionToken) return;
    setGazetteLoading(true);
    setIsGazetteOpen(true);
    try {
      const res = await window.desktopAPI.calculateExamResults(sessionToken, selectedExam.id, gazetteClassId);
      setGazetteData(res);
      toastSuccess('Examination gazette calculated with GPA and rankings.', 'Gazette Ready');
    } catch (err: any) {
      toastError(err.message || 'Failed to compute class results', 'Gazette Error');
    } finally {
      setGazetteLoading(false);
    }
  };

  // Generate Report Card
  const handleViewReportCard = async (studentId: string) => {
    if (!selectedExam || !window.desktopAPI || !sessionToken) return;
    setReportCardLoading(true);
    setIsReportCardOpen(true);
    try {
      const data = await window.desktopAPI.generateReportCard(sessionToken, selectedExam.id, studentId);
      setReportCardData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate report card');
    } finally {
      setReportCardLoading(false);
    }
  };

  // Load Grading Scales
  const handleOpenGradingScales = async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setGradingLoading(true);
    setIsGradingModalOpen(true);
    try {
      const scales = await window.desktopAPI.getGradingScales(sessionToken);
      setGradingScales(scales);
    } catch (err: any) {
      setError(err.message || 'Failed to load grading scales');
    } finally {
      setGradingLoading(false);
    }
  };

  const paperColumns: Column<any>[] = [
    { key: 'subjectName', header: 'Subject Name' },
    { key: 'className', header: 'Class' },
    { key: 'maxMarks', header: 'Max Marks', align: 'right' },
    { key: 'passMarks', header: 'Pass Marks', align: 'right' },
    { key: 'examDate', header: 'Date', render: (val) => <span>{val || 'TBD'}</span> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (_, row) => (
        <Button size="sm" variant="primary" onClick={() => handleOpenMarks(row)}>
          Enter Marks
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Examinations, Marks & Report Cards
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Subject paper scheduling, roll-number marks entry, automated ranking calculation & printable transcripts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleOpenGradingScales}>
            <Settings className="w-4 h-4 mr-1.5" />
            Grading Scales
          </Button>
          <Button variant="primary" onClick={() => setIsCreateExamOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Examination
          </Button>
        </div>
      </div>

      {error && (
        <ErrorPanel
          message={error}
          onDismiss={() => setError(null)}
          onRetry={loadData}
        />
      )}

      {/* Exam Selection & Actions Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3 flex-1 min-w-[300px]">
          <span className="text-xs font-bold uppercase text-slate-400 dark:text-slate-500">Exam:</span>
          <Select
            value={selectedExam?.id || ''}
            onChange={(e) => {
              const ex = exams.find((x) => x.id === e.target.value);
              setSelectedExam(ex || null);
            }}
            className="w-72"
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name} ({ex.term})
              </option>
            ))}
          </Select>

          {selectedExam && (
            <Badge variant={selectedExam.status === 'published' ? 'success' : 'warning'} dot>
              {String(selectedExam.status).toUpperCase()}
            </Badge>
          )}
        </div>

        {selectedExam && (
          <div className="flex items-center gap-2">
            <Select
              value={gazetteClassId}
              onChange={(e) => setGazetteClassId(e.target.value)}
              className="w-40"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>

            <Button variant="secondary" onClick={handleCalculateGazette}>
              <TrendingUp className="w-4 h-4 mr-1.5" />
              Calculate Gazette
            </Button>

            {selectedExam.status !== 'published' && (
              <Button variant="primary" onClick={() => handlePublishExam(selectedExam.id)}>
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Publish Results
              </Button>
            )}

            <Button variant="ghost" onClick={() => setIsCreatePaperOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Paper
            </Button>
          </div>
        )}
      </div>

      {/* Papers Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Scheduled Exam Papers ({papers.length})</h3>
        </div>
        <DataTable
          columns={paperColumns}
          data={papers}
          loading={loading}
          emptyMessage="No exam papers scheduled for this examination"
        />
      </div>

      {/* OFFICIAL GAZETTE MODAL (RANKINGS & SUMMARY) */}
      <Modal
        isOpen={isGazetteOpen}
        onClose={() => setIsGazetteOpen(false)}
        title={`Official Examination Gazette — ${selectedExam?.name || 'Exam'}`}
        subtitle="Aggregated class marks, percentages, letter grades, and top student rankings"
        size="4xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsGazetteOpen(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Gazette
            </Button>
          </>
        }
      >
        {gazetteLoading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">Calculating student marks and class positions...</div>
        ) : gazetteData ? (
          <div className="space-y-4">
            {/* Statistics Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">
              <div>Total Enrolled: <strong className="text-slate-900 dark:text-white">{gazetteData.totalStudents}</strong></div>
              <div>Passed: <strong className="text-emerald-700 dark:text-emerald-400">{gazetteData.summary?.totalPassed}</strong></div>
              <div>Failed: <strong className="text-rose-700 dark:text-rose-400">{gazetteData.summary?.totalFailed}</strong></div>
              <div>Pass Percentage: <strong className="text-indigo-700 dark:text-indigo-400">{gazetteData.summary?.passPercentage}%</strong></div>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 sticky top-0">
                  <tr>
                    <th className="p-2.5">Rank</th>
                    <th className="p-2.5">Roll #</th>
                    <th className="p-2.5">Adm #</th>
                    <th className="p-2.5">Student Name</th>
                    <th className="p-2.5 text-right">Obtained</th>
                    <th className="p-2.5 text-right">Max</th>
                    <th className="p-2.5 text-right">Percentage</th>
                    <th className="p-2.5">Grade</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {gazetteData.results?.map((r: any) => (
                    <tr key={r.studentId} className={r.rank <= 3 ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}>
                      <td className="p-2.5 font-bold">
                        {r.rank === 1 ? '🥇 1st' : r.rank === 2 ? '🥈 2nd' : r.rank === 3 ? '🥉 3rd' : `${r.rank}th`}
                      </td>
                      <td className="p-2.5 font-mono">{r.rollNumber || '—'}</td>
                      <td className="p-2.5 font-mono">{r.admissionNumber}</td>
                      <td className="p-2.5 font-semibold text-slate-800 dark:text-slate-200">{r.studentName}</td>
                      <td className="p-2.5 font-mono text-right font-bold">{r.totalObtainedMarks}</td>
                      <td className="p-2.5 font-mono text-right text-slate-500 dark:text-slate-400">{r.totalMaxMarks}</td>
                      <td className="p-2.5 font-mono text-right font-semibold">{r.overallPercentage}%</td>
                      <td className="p-2.5 font-bold text-indigo-700 dark:text-indigo-400">{r.overallGrade}</td>
                      <td className="p-2.5">
                        <Badge variant={r.status === 'PASS' ? 'success' : 'danger'}>{r.status}</Badge>
                      </td>
                      <td className="p-2.5 text-right">
                        <Button size="sm" variant="ghost" onClick={() => handleViewReportCard(r.studentId)}>
                          Report Card
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* PRINTABLE STUDENT REPORT CARD MODAL */}
      <Modal
        isOpen={isReportCardOpen}
        onClose={() => setIsReportCardOpen(false)}
        title="Official Student Report Card & Transcript"
        size="2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsReportCardOpen(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Report Card
            </Button>
          </>
        }
      >
        {reportCardData && (
          <div className="space-y-4 p-4 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200">
            {/* Header */}
            <div className="text-center border-b border-slate-200 dark:border-slate-800 pb-3 space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase">
                {reportCardData.schoolSettings?.motto ? 'School OS Academy' : 'Comprehensive School System'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400">{reportCardData.exam?.name} — Academic Transcript</p>
            </div>

            {/* Student Info Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
              <div>Student Name: <strong className="text-slate-800 dark:text-slate-200">{reportCardData.student.fullName}</strong></div>
              <div>Admission #: <strong className="font-mono text-slate-800 dark:text-slate-200">{reportCardData.student.admissionNumber}</strong></div>
              <div>Father Name: <strong className="text-slate-800 dark:text-slate-200">{reportCardData.student.fatherName}</strong></div>
              <div>Class: <strong className="text-slate-800 dark:text-slate-200">{reportCardData.student.className} ({reportCardData.student.sectionName})</strong></div>
              <div>Roll Number: <strong className="font-mono text-slate-800 dark:text-slate-200">{reportCardData.student.rollNumber || '—'}</strong></div>
              <div>Class Rank: <strong className="text-indigo-700 dark:text-indigo-400 font-bold">Position #{reportCardData.result.rank}</strong></div>
            </div>

            {/* Subject Marks Table */}
            <table className="w-full text-xs text-left border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2">Subject</th>
                  <th className="p-2 text-right">Max Marks</th>
                  <th className="p-2 text-right">Pass Marks</th>
                  <th className="p-2 text-right">Obtained</th>
                  <th className="p-2 text-center">Grade</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportCardData.result.subjects?.map((sub: any) => (
                  <tr key={sub.paperId}>
                    <td className="p-2 font-medium text-slate-800 dark:text-slate-200">{sub.subjectName}</td>
                    <td className="p-2 font-mono text-right">{sub.maxMarks}</td>
                    <td className="p-2 font-mono text-right text-slate-500 dark:text-slate-400">{sub.passMarks}</td>
                    <td className="p-2 font-mono text-right font-bold">
                      {sub.isAbsent ? <span className="text-rose-600 dark:text-rose-400">ABSENT</span> : sub.obtainedMarks}
                    </td>
                    <td className="p-2 text-center font-bold text-indigo-700 dark:text-indigo-400">{sub.grade}</td>
                    <td className="p-2">
                      <Badge variant={sub.passed ? 'success' : 'danger'}>{sub.passed ? 'PASS' : 'FAIL'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-bold border-t border-slate-200 dark:border-slate-700">
                <tr>
                  <td className="p-2">TOTAL</td>
                  <td className="p-2 font-mono text-right">{reportCardData.result.totalMaxMarks}</td>
                  <td></td>
                  <td className="p-2 font-mono text-right text-indigo-700 dark:text-indigo-400">{reportCardData.result.totalObtainedMarks}</td>
                  <td className="p-2 text-center text-indigo-700 dark:text-indigo-400">{reportCardData.result.overallGrade}</td>
                  <td className="p-2">
                    <Badge variant={reportCardData.result.status === 'PASS' ? 'success' : 'danger'}>
                      {reportCardData.result.status}
                    </Badge>
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Final Outcome Banner */}
            <div className="flex justify-between items-center p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs">
              <div>
                Overall Percentage: <strong className="text-indigo-900 dark:text-indigo-200">{reportCardData.result.overallPercentage}%</strong>
              </div>
              <div>
                Cumulative Grade: <strong className="text-indigo-900 dark:text-indigo-200">{reportCardData.result.overallGrade} (GPA: {reportCardData.result.gpa})</strong>
              </div>
              <div>
                Result: <strong className={reportCardData.result.status === 'PASS' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{reportCardData.result.status}</strong>
              </div>
            </div>

            <div className="pt-8 flex justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-dashed border-slate-300 dark:border-slate-700">
              <div>Teacher Signature: __________________</div>
              <div>Principal Signature & Seal: __________________</div>
            </div>
          </div>
        )}
      </Modal>

      {/* MARKS ENTRY MODAL */}
      <Modal
        isOpen={Boolean(selectedPaperForMarks)}
        onClose={() => setSelectedPaperForMarks(null)}
        title={`Marks Entry — ${selectedPaperForMarks?.subjectName}`}
        subtitle={`Max Marks: ${selectedPaperForMarks?.maxMarks} | Pass Marks: ${selectedPaperForMarks?.passMarks}`}
        size="2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedPaperForMarks(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRecordMarksSubmit} loading={recordMarksLoading}>
              Save Marks
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {marksError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{marksError}</span>
              </div>
              <button type="button" onClick={() => setMarksError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {marksStudents.map((st) => (
              <div key={st.id} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl gap-3 text-xs">
                <div className="min-w-[180px]">
                  <div className="font-semibold text-slate-900 dark:text-white">{st.full_name}</div>
                  <div className="text-slate-500 dark:text-slate-400">Adm: {st.admission_number} | Roll: {st.roll_number || '—'}</div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={marksState[st.id]?.isAbsent || false}
                      onChange={(e) => {
                        setMarksState({
                          ...marksState,
                          [st.id]: {
                            ...marksState[st.id],
                            isAbsent: e.target.checked,
                            obtained: e.target.checked ? 0 : marksState[st.id]?.obtained || 0,
                          },
                        });
                      }}
                      className="rounded text-rose-600"
                    />
                    <span>Absent</span>
                  </label>

                  <Input
                    type="number"
                    disabled={marksState[st.id]?.isAbsent}
                    max={selectedPaperForMarks?.maxMarks}
                    min={0}
                    value={marksState[st.id]?.obtained || 0}
                    onChange={(e) => {
                      setMarksState({
                        ...marksState,
                        [st.id]: {
                          ...marksState[st.id],
                          obtained: Number(e.target.value),
                        },
                      });
                    }}
                    className="w-20"
                  />
                  <span className="text-slate-400">/ {selectedPaperForMarks?.maxMarks}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* CREATE EXAM MODAL */}
      <Modal
        isOpen={isCreateExamOpen}
        onClose={() => setIsCreateExamOpen(false)}
        title="Schedule New Examination"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCreateExamOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateExam} loading={createExamLoading}>
              Create Exam
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateExam} className="space-y-3">
          {examError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{examError}</span>
              </div>
              <button type="button" onClick={() => setExamError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Input
            label="Exam Title"
            value={examForm.name}
            onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
            required
          />
          <Select
            label="Term"
            value={examForm.term}
            onChange={(e) => setExamForm({ ...examForm, term: e.target.value })}
          >
            <option value="first_term">First Term</option>
            <option value="mid_term">Mid Term</option>
            <option value="final_term">Final Term</option>
            <option value="monthly_test">Monthly Test</option>
            <option value="other">Other</option>
          </Select>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Start Date"
              type="date"
              value={examForm.startDate}
              onChange={(e) => setExamForm({ ...examForm, startDate: e.target.value })}
              required
            />
            <Input
              label="End Date"
              type="date"
              value={examForm.endDate}
              onChange={(e) => setExamForm({ ...examForm, endDate: e.target.value })}
              required
            />
          </div>
        </form>
      </Modal>

      {/* CREATE PAPER MODAL */}
      <Modal
        isOpen={isCreatePaperOpen}
        onClose={() => setIsCreatePaperOpen(false)}
        title="Add Subject Exam Paper"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCreatePaperOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreatePaper} loading={paperLoading}>
              Schedule Paper
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreatePaper} className="space-y-3">
          {paperError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{paperError}</span>
              </div>
              <button type="button" onClick={() => setPaperError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Select
            label="Class"
            value={paperForm.classId}
            onChange={(e) => setPaperForm({ ...paperForm, classId: e.target.value })}
            required
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input
            label="Subject Name"
            value={paperForm.subjectName}
            onChange={(e) => setPaperForm({ ...paperForm, subjectName: e.target.value })}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Max Marks"
              type="number"
              value={paperForm.maxMarks}
              onChange={(e) => setPaperForm({ ...paperForm, maxMarks: Number(e.target.value) })}
              required
            />
            <Input
              label="Pass Marks"
              type="number"
              value={paperForm.passMarks}
              onChange={(e) => setPaperForm({ ...paperForm, passMarks: Number(e.target.value) })}
              required
            />
          </div>
          <Input
            label="Exam Date"
            type="date"
            value={paperForm.examDate}
            onChange={(e) => setPaperForm({ ...paperForm, examDate: e.target.value })}
          />
        </form>
      </Modal>

      {/* GRADING SCALES MODAL */}
      <Modal
        isOpen={isGradingModalOpen}
        onClose={() => setIsGradingModalOpen(false)}
        title="Institutional Grading Standards & GPA"
        size="md"
        footer={
          <Button variant="secondary" onClick={() => setIsGradingModalOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-2">
          {gradingScales.map((g) => (
            <div key={g.grade} className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-indigo-700 dark:text-indigo-400 w-8">{g.grade}</span>
                <span className="text-slate-600 dark:text-slate-300">{g.description}</span>
              </div>
              <div className="font-mono text-slate-800 dark:text-slate-200">
                {g.minPercentage}% – {g.maxPercentage}% (GPA: {g.gpa})
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};
