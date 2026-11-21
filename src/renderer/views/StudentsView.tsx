import React, { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap,
  ArrowLeft,
  Plus,
  Filter,
  CheckCircle2,
  AlertCircle,
  Archive,
  ArrowRightCircle,
  Eye,
  RefreshCw,
  Phone,
  Calendar,
  UserCheck,
  Shield,
  History,
  Users,
  X,
} from 'lucide-react';
import {
  Button,
  Input,
  Select,
  Modal,
  Badge,
  ConfirmDialog,
  DataTable,
  Column,
  ErrorPanel,
} from '../components/ui';
import { useToast } from '../context/ToastContext';

interface StudentsViewProps {
  onBack: () => void;
  sessionToken?: string | null;
}

export const StudentsView: React.FC<StudentsViewProps> = ({ onBack, sessionToken }) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal-specific isolated errors
  const [admissionError, setAdmissionError] = useState<string | null>(null);
  const [replaceGuardianError, setReplaceGuardianError] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [bulkPromoteError, setBulkPromoteError] = useState<string | null>(null);

  // New Admission Modal state
  const [isAdmissionOpen, setIsAdmissionOpen] = useState(false);
  const [admissionLoading, setAdmissionLoading] = useState(false);
  const [admissionForm, setAdmissionForm] = useState({
    admissionNumber: '',
    fullName: '',
    fatherName: '',
    gender: 'male',
    dateOfBirth: '2012-05-15',
    cnicBform: '35201-1234567-1',
    phone: '0300-1234567',
    address: 'Lahore, Punjab',
    admissionDate: new Date().toISOString().split('T')[0],
    previousSchool: 'City Model School',
    adminNotes: 'Standard admission',
    classId: '',
    sectionId: '',
    sessionId: '',
    rollNumber: '',
    guardianName: '',
    guardianRelation: 'father',
    guardianPhone: '0300-1234567',
    guardianCnic: '35201-1234567-1',
    guardianOccupation: 'Business',
  });

  // Student Full Profile Modal state
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Guardian Replacement Modal state
  const [isReplaceGuardianOpen, setIsReplaceGuardianOpen] = useState(false);
  const [replaceGuardianForm, setReplaceGuardianForm] = useState({
    fullName: '',
    relationship: 'mother',
    phone: '',
    cnic: '',
    occupation: '',
    reason: '',
  });
  const [replaceLoading, setReplaceLoading] = useState(false);

  // Bulk Promotion Modal state
  const [isBulkPromoteOpen, setIsBulkPromoteOpen] = useState(false);
  const [bulkPromoteForm, setBulkPromoteForm] = useState({
    fromClassId: '',
    targetSessionId: '',
    targetClassId: '',
    targetSectionId: '',
    selectedStudentIds: [] as string[],
  });
  const [bulkPromoteLoading, setBulkPromoteLoading] = useState(false);

  // Archive & Promote state
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [promoteForm, setPromoteForm] = useState({
    targetSessionId: '',
    targetClassId: '',
    targetSectionId: '',
    rollNumber: '',
  });

  const loadData = useCallback(async () => {
    if (!window.desktopAPI || !sessionToken) return;
    setLoading(true);
    setError(null);
    try {
      const [stdData, clsData, sessData] = await Promise.all([
        window.desktopAPI.getStudents(sessionToken, {
          search: searchTerm || undefined,
          classId: selectedClass || undefined,
        }),
        window.desktopAPI.getClasses(sessionToken),
        window.desktopAPI.getAcademicSessions(sessionToken),
      ]);
      setStudents(stdData);
      setClasses(clsData);
      setSessions(sessData);

      if (clsData.length > 0 && !admissionForm.classId) {
        const firstClass = clsData[0];
        setAdmissionForm((prev) => ({
          ...prev,
          classId: firstClass.id,
          sectionId: firstClass.sections?.[0]?.id || '',
        }));
      }
      if (sessData.length > 0 && !admissionForm.sessionId) {
        setAdmissionForm((prev) => ({
          ...prev,
          sessionId: sessData[0].id,
        }));
      }
    } catch (err: any) {
      console.error('Failed to load students data:', err);
      setError(err.message || 'Failed to retrieve students from local database');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedClass, sessionToken, admissionForm.classId, admissionForm.sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (admissionForm.classId) {
      const cls = classes.find((c) => c.id === admissionForm.classId);
      if (cls && cls.sections) {
        setSections(cls.sections);
        if (cls.sections.length > 0 && !cls.sections.some((s: any) => s.id === admissionForm.sectionId)) {
          setAdmissionForm((prev) => ({ ...prev, sectionId: cls.sections[0].id }));
        }
      }
    }
  }, [admissionForm.classId, classes, admissionForm.sectionId]);

  const handleOpenAdmission = () => {
    const nextNum = `ADM-${new Date().getFullYear()}-${String(students.length + 1).padStart(3, '0')}`;
    setAdmissionForm((prev) => ({
      ...prev,
      admissionNumber: nextNum,
      fullName: '',
      fatherName: '',
      guardianName: '',
      guardianPhone: '0300-1234567',
      classId: classes[0]?.id || '',
      sectionId: classes[0]?.sections?.[0]?.id || '',
      sessionId: sessions[0]?.id || '',
    }));
    setIsAdmissionOpen(true);
  };

  const handleCreateAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setAdmissionLoading(true);
    setAdmissionError(null);
    try {
      const studentId = `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const res = await window.desktopAPI.admitStudent(sessionToken, {
        id: studentId,
        admissionNumber: admissionForm.admissionNumber,
        fullName: admissionForm.fullName,
        fatherName: admissionForm.fatherName,
        gender: admissionForm.gender as any,
        dateOfBirth: admissionForm.dateOfBirth,
        cnicBform: admissionForm.cnicBform,
        phone: admissionForm.phone,
        address: admissionForm.address,
        admissionDate: admissionForm.admissionDate,
        previousSchool: admissionForm.previousSchool,
        adminNotes: admissionForm.adminNotes,
        sessionId: admissionForm.sessionId || sessions[0]?.id || 'sess_current',
        classId: admissionForm.classId,
        sectionId: admissionForm.sectionId,
        rollNumber: admissionForm.rollNumber || undefined,
        guardian: {
          fullName: admissionForm.guardianName || admissionForm.fatherName,
          relationship: admissionForm.guardianRelation,
          phone: admissionForm.guardianPhone || admissionForm.phone,
          cnic: admissionForm.guardianCnic || undefined,
          occupation: admissionForm.guardianOccupation || 'Business',
        },
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to admit student');
      }

      setIsAdmissionOpen(false);
      setAdmissionError(null);
      await loadData();
      toastSuccess(`Admitted student ${admissionForm.fullName} (${admissionForm.admissionNumber})`, 'Student Admitted');
    } catch (err: any) {
      setAdmissionError(err.message || 'Error creating student record');
    } finally {
      setAdmissionLoading(false);
    }
  };

  const handleViewProfile = async (studentId: string) => {
    if (!window.desktopAPI || !sessionToken) return;
    setProfileLoading(true);
    setIsProfileOpen(true);
    try {
      const data = await window.desktopAPI.getStudentProfile(sessionToken, studentId);
      setProfileData(data);
    } catch (err: any) {
      toastError(err.message || 'Failed to fetch student profile', 'Profile Error');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleReplaceGuardianSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileData?.student?.id || !window.desktopAPI || !sessionToken) return;
    setReplaceLoading(true);
    setReplaceGuardianError(null);
    try {
      const res = await window.desktopAPI.replaceGuardian(sessionToken, {
        studentId: profileData.student.id,
        reason: replaceGuardianForm.reason,
        guardian: {
          fullName: replaceGuardianForm.fullName,
          relationship: replaceGuardianForm.relationship,
          phone: replaceGuardianForm.phone,
          cnic: replaceGuardianForm.cnic || undefined,
          occupation: replaceGuardianForm.occupation || undefined,
        },
      });

      if (!res.success) throw new Error(res.error || 'Failed to replace guardian');

      setIsReplaceGuardianOpen(false);
      setReplaceGuardianError(null);
      await handleViewProfile(profileData.student.id);
      toastSuccess('Guardian record replaced and audited successfully.', 'Guardian Updated');
    } catch (err: any) {
      setReplaceGuardianError(err.message || 'Failed to replace guardian');
    } finally {
      setReplaceLoading(false);
    }
  };

  const handleArchiveStudent = async () => {
    if (!selectedStudent || !window.desktopAPI || !sessionToken) return;
    setActionLoading(true);
    try {
      const res = await window.desktopAPI.archiveStudent(sessionToken, {
        studentId: selectedStudent.id,
        status: 'inactive',
        reason: 'Archived via administrative console',
      });
      if (!res.success) throw new Error(res.error || 'Failed to archive student');
      setIsArchiveConfirmOpen(false);
      setSelectedStudent(null);
      await loadData();
      toastSuccess('Student archived. Historical academic and fee records preserved.', 'Student Archival');
    } catch (err: any) {
      toastError(err.message || 'Failed to archive student', 'Archival Error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromoteStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !window.desktopAPI || !sessionToken) return;
    setActionLoading(true);
    setPromoteError(null);
    try {
      const res = await window.desktopAPI.promoteStudent(sessionToken, {
        studentId: selectedStudent.id,
        targetSessionId: promoteForm.targetSessionId,
        targetClassId: promoteForm.targetClassId,
        targetSectionId: promoteForm.targetSectionId,
        rollNumber: promoteForm.rollNumber || undefined,
      });
      if (!res.success) throw new Error(res.error || 'Failed to promote student');
      setIsPromoteModalOpen(false);
      setPromoteError(null);
      setSelectedStudent(null);
      await loadData();
      toastSuccess('Student promoted to target academic session successfully.', 'Student Promotion');
    } catch (err: any) {
      setPromoteError(err.message || 'Failed to promote student');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkPromoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.desktopAPI || !sessionToken) return;
    setBulkPromoteLoading(true);
    setBulkPromoteError(null);
    try {
      const res = await window.desktopAPI.bulkPromoteStudents(sessionToken, {
        studentIds: bulkPromoteForm.selectedStudentIds,
        targetSessionId: bulkPromoteForm.targetSessionId,
        targetClassId: bulkPromoteForm.targetClassId,
        targetSectionId: bulkPromoteForm.targetSectionId,
      });

      if (!res.success) throw new Error(res.error || 'Bulk promotion failed');

      setIsBulkPromoteOpen(false);
      setBulkPromoteError(null);
      await loadData();
      toastSuccess(`${bulkPromoteForm.selectedStudentIds.length} students promoted to next session.`, 'Bulk Promotion');
    } catch (err: any) {
      setBulkPromoteError(err.message || 'Failed to execute bulk promotion');
    } finally {
      setBulkPromoteLoading(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'admission_number',
      header: 'Adm #',
      width: '120px',
      render: (val) => <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{val}</span>,
    },
    {
      key: 'full_name',
      header: 'Student Name',
      render: (val, row) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{val}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Father: {row.father_name}</div>
        </div>
      ),
    },
    {
      key: 'class_name',
      header: 'Class / Section',
      render: (val, row) => (
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          {val || '—'} {row.section_name ? `(${row.section_name})` : ''}
        </span>
      ),
    },
    {
      key: 'roll_number',
      header: 'Roll #',
      width: '80px',
      render: (val) => <span className="font-mono text-slate-600 dark:text-slate-400">{val || '—'}</span>,
    },
    {
      key: 'guardian_name',
      header: 'Active Guardian',
      render: (val, row) => (
        <div className="text-xs">
          <div className="font-medium text-slate-800 dark:text-slate-200">{val || row.father_name || '—'}</div>
          <div className="text-slate-500 dark:text-slate-400 font-mono">{row.guardian_phone || row.phone || '—'}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (val) => {
        const variant = val === 'active' ? 'success' : 'neutral';
        return <Badge variant={variant} dot>{String(val).toUpperCase()}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleViewProfile(row.id)}
            title="View Full Profile & Guardian"
          >
            <Eye className="w-3.5 h-3.5 mr-1" />
            Profile
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setSelectedStudent(row);
              setPromoteForm({
                targetSessionId: sessions[1]?.id || sessions[0]?.id || '',
                targetClassId: classes[0]?.id || '',
                targetSectionId: classes[0]?.sections?.[0]?.id || '',
                rollNumber: '',
              });
              setIsPromoteModalOpen(true);
            }}
            title="Promote Student"
          >
            <ArrowRightCircle className="w-3.5 h-3.5 mr-1" />
            Promote
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setSelectedStudent(row);
              setIsArchiveConfirmOpen(true);
            }}
            title="Archive Student"
          >
            <Archive className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* View Header */}
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
              <GraduationCap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Student Directory & Admissions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Local admission, strict single active guardian enforcement, promotion & academic profiling
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const eligible = students.filter(s => s.status === 'active');
              setBulkPromoteForm({
                fromClassId: selectedClass || classes[0]?.id || '',
                targetSessionId: sessions[1]?.id || sessions[0]?.id || '',
                targetClassId: classes[0]?.id || '',
                targetSectionId: classes[0]?.sections?.[0]?.id || '',
                selectedStudentIds: eligible.map(s => s.id),
              });
              setIsBulkPromoteOpen(true);
            }}
          >
            <Users className="w-4 h-4 mr-1.5" />
            Bulk Promote
          </Button>
          <Button variant="primary" onClick={handleOpenAdmission}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Admission
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

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <Input
            placeholder="Search by student name or admission #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
          <Select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-44"
          >
            <option value="">All Classes</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => loadData()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <DataTable
          columns={columns}
          data={students}
          loading={loading}
          emptyMessage="No students found matching current criteria"
        />
      </div>

      {/* NEW ADMISSION MODAL WITH GUARDIAN INVARIANT */}
      <Modal
        isOpen={isAdmissionOpen}
        onClose={() => setIsAdmissionOpen(false)}
        title="Official Student Admission"
        subtitle="Registers student enrollment and provisions exactly one active guardian"
        size="2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAdmissionOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateAdmission} loading={admissionLoading}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Complete Admission
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateAdmission} className="space-y-4">
          {admissionError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{admissionError}</span>
              </div>
              <button type="button" onClick={() => setAdmissionError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-xl p-3 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
            <Shield className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            <span>Database Invariant: Auto-assigns roll numbers and binds exactly one verified active guardian.</span>
          </div>

          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-1">Student Personal Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Admission #"
              value={admissionForm.admissionNumber}
              onChange={(e) => setAdmissionForm({ ...admissionForm, admissionNumber: e.target.value })}
              required
            />
            <Input
              label="Student Full Name"
              value={admissionForm.fullName}
              onChange={(e) => setAdmissionForm({ ...admissionForm, fullName: e.target.value })}
              placeholder="e.g. Muhammad Ahmed"
              required
            />
            <Input
              label="Father Name"
              value={admissionForm.fatherName}
              onChange={(e) => setAdmissionForm({ ...admissionForm, fatherName: e.target.value })}
              required
            />
            <Input
              label="B-Form / CNIC"
              value={admissionForm.cnicBform}
              onChange={(e) => setAdmissionForm({ ...admissionForm, cnicBform: e.target.value })}
              placeholder="35201-1234567-1"
            />
            <Input
              label="Date of Birth"
              type="date"
              value={admissionForm.dateOfBirth}
              onChange={(e) => setAdmissionForm({ ...admissionForm, dateOfBirth: e.target.value })}
            />
            <Select
              label="Gender"
              value={admissionForm.gender}
              onChange={(e) => setAdmissionForm({ ...admissionForm, gender: e.target.value })}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </div>

          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-1 pt-2">Class Allocation & Roll Number</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Academic Session"
              value={admissionForm.sessionId}
              onChange={(e) => setAdmissionForm({ ...admissionForm, sessionId: e.target.value })}
              required
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              label="Class Grade"
              value={admissionForm.classId}
              onChange={(e) => setAdmissionForm({ ...admissionForm, classId: e.target.value })}
              required
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="Section"
              value={admissionForm.sectionId}
              onChange={(e) => setAdmissionForm({ ...admissionForm, sectionId: e.target.value })}
              required
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </Select>
          </div>

          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-1 pt-2">Primary Active Guardian</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Guardian Name"
              value={admissionForm.guardianName}
              onChange={(e) => setAdmissionForm({ ...admissionForm, guardianName: e.target.value })}
              placeholder="Leave blank to use Father Name"
            />
            <Select
              label="Relationship"
              value={admissionForm.guardianRelation}
              onChange={(e) => setAdmissionForm({ ...admissionForm, guardianRelation: e.target.value })}
            >
              <option value="father">Father</option>
              <option value="mother">Mother</option>
              <option value="uncle">Uncle</option>
              <option value="grandparent">Grandparent</option>
              <option value="other">Other Legal Guardian</option>
            </Select>
            <Input
              label="Guardian Phone"
              value={admissionForm.guardianPhone}
              onChange={(e) => setAdmissionForm({ ...admissionForm, guardianPhone: e.target.value })}
              required
            />
            <Input
              label="Guardian CNIC"
              value={admissionForm.guardianCnic}
              onChange={(e) => setAdmissionForm({ ...admissionForm, guardianCnic: e.target.value })}
              placeholder="35201-XXXXXXX-X"
            />
          </div>
        </form>
      </Modal>

      {/* STUDENT FULL PROFILE DRAWER / MODAL */}
      <Modal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        title={(profileData?.student?.fullName || profileData?.student?.full_name) ? `${profileData.student.fullName || profileData.student.full_name} — Complete Profile` : 'Student Profile'}
        size="3xl"
        footer={
          <Button variant="secondary" onClick={() => setIsProfileOpen(false)}>
            Close
          </Button>
        }
      >
        {profileLoading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">Loading comprehensive student profile...</div>
        ) : profileData ? (
          <div className="space-y-5">
            {/* Top Bio Header */}
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{profileData.student.fullName || profileData.student.full_name || 'Student'}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Admission #: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{profileData.student.admissionNumber || profileData.student.admission_number || '—'}</span> | Father: {profileData.student.fatherName || profileData.student.father_name || '—'}
                </p>
              </div>
              <Badge variant={profileData.student.status === 'active' ? 'success' : 'neutral'} dot>
                {String(profileData.student.status).toUpperCase()}
              </Badge>
            </div>

            {/* Guardian Information & Replacement */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Active Legal Guardian
                </h4>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setReplaceGuardianForm({
                      fullName: '',
                      relationship: 'mother',
                      phone: profileData.activeGuardian?.phone || '',
                      cnic: '',
                      occupation: '',
                      reason: '',
                    });
                    setIsReplaceGuardianOpen(true);
                  }}
                >
                  Replace Guardian
                </Button>
              </div>

              {profileData.activeGuardian ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <div><span className="text-slate-400 dark:text-slate-500">Name:</span> <strong className="text-slate-800 dark:text-slate-200">{profileData.activeGuardian.fullName || profileData.activeGuardian.full_name}</strong></div>
                  <div><span className="text-slate-400 dark:text-slate-500">Relation:</span> <strong className="text-slate-800 dark:text-slate-200 uppercase">{profileData.activeGuardian.relationship}</strong></div>
                  <div><span className="text-slate-400 dark:text-slate-500">Phone:</span> <strong className="text-slate-800 dark:text-slate-200">{profileData.activeGuardian.phone}</strong></div>
                  <div><span className="text-slate-400 dark:text-slate-500">CNIC:</span> <strong className="text-slate-800 dark:text-slate-200">{profileData.activeGuardian.cnic || '—'}</strong></div>
                  <div><span className="text-slate-400 dark:text-slate-500">Occupation:</span> <strong className="text-slate-800 dark:text-slate-200">{profileData.activeGuardian.occupation || '—'}</strong></div>
                  <div><span className="text-slate-400 dark:text-slate-500">Since:</span> <strong className="text-slate-800 dark:text-slate-200">{(profileData.activeGuardian.createdAt || profileData.activeGuardian.created_at || '').slice(0, 10) || '—'}</strong></div>
                </div>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">No active guardian registered.</p>
              )}

              {/* Guardian History Audit */}
              {profileData.guardianHistory?.length > 1 && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <h5 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1.5 mb-1.5">
                    <History className="w-3.5 h-3.5" /> Guardian Replacement History
                  </h5>
                  <div className="space-y-1">
                    {profileData.guardianHistory.filter((g: any) => g.is_active === 0).map((h: any) => (
                      <div key={h.id} className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg flex items-center justify-between">
                        <div>
                          <strong className="text-slate-800 dark:text-slate-200">{h.full_name}</strong> ({h.relationship}) — Replaced on {h.replaced_at?.split('T')[0] || 'past'}
                        </div>
                        <div className="text-slate-400 italic">"{h.replacement_reason}"</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Financial Ledger & Attendance Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-900">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Financial Standing</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Total Billed:</span>
                    <strong className="text-slate-800 dark:text-slate-200">Rs. {profileData.financialSummary?.totalBilled?.toLocaleString() || 0}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Total Paid:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400">Rs. {profileData.financialSummary?.totalPaid?.toLocaleString() || 0}</strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Outstanding Dues:</span>
                    <strong className="text-rose-700 dark:text-rose-400 font-bold">Rs. {profileData.financialSummary?.outstandingBalance?.toLocaleString() || 0}</strong>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-900">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Attendance Summary</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Recorded Days:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{profileData.attendanceSummary?.totalDays || 0}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Present / Late:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400">{profileData.attendanceSummary?.presentDays || 0} days</strong>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">Attendance Rate:</span>
                    <strong className="text-indigo-700 dark:text-indigo-400 font-bold">{profileData.attendanceSummary?.attendancePercentage || '100%'}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* GUARDIAN REPLACEMENT MODAL */}
      <Modal
        isOpen={isReplaceGuardianOpen}
        onClose={() => setIsReplaceGuardianOpen(false)}
        title="Replace Legal Guardian"
        subtitle="Archives current guardian and creates an immutable audit trail with replacement reason"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsReplaceGuardianOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleReplaceGuardianSubmit} loading={replaceLoading}>
              Confirm Replacement
            </Button>
          </>
        }
      >
        <form onSubmit={handleReplaceGuardianSubmit} className="space-y-3">
          {replaceGuardianError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{replaceGuardianError}</span>
              </div>
              <button type="button" onClick={() => setReplaceGuardianError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Input
            label="New Guardian Full Name"
            value={replaceGuardianForm.fullName}
            onChange={(e) => setReplaceGuardianForm({ ...replaceGuardianForm, fullName: e.target.value })}
            required
          />
          <Select
            label="Relationship"
            value={replaceGuardianForm.relationship}
            onChange={(e) => setReplaceGuardianForm({ ...replaceGuardianForm, relationship: e.target.value })}
          >
            <option value="father">Father</option>
            <option value="mother">Mother</option>
            <option value="uncle">Uncle</option>
            <option value="grandparent">Grandparent</option>
            <option value="legal_guardian">Legal Guardian</option>
          </Select>
          <Input
            label="New Guardian Phone"
            value={replaceGuardianForm.phone}
            onChange={(e) => setReplaceGuardianForm({ ...replaceGuardianForm, phone: e.target.value })}
            required
          />
          <Input
            label="New Guardian CNIC"
            value={replaceGuardianForm.cnic}
            onChange={(e) => setReplaceGuardianForm({ ...replaceGuardianForm, cnic: e.target.value })}
            placeholder="35201-XXXXXXX-X"
          />
          <Input
            label="Mandatory Replacement Reason"
            value={replaceGuardianForm.reason}
            onChange={(e) => setReplaceGuardianForm({ ...replaceGuardianForm, reason: e.target.value })}
            placeholder="e.g. Custody change, parent relocation"
            required
          />
        </form>
      </Modal>

      {/* BULK PROMOTION MODAL */}
      <Modal
        isOpen={isBulkPromoteOpen}
        onClose={() => setIsBulkPromoteOpen(false)}
        title="Session Rollover & Bulk Student Promotion"
        subtitle="Atomically promotes multiple students to the target academic session and class"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsBulkPromoteOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleBulkPromoteSubmit} loading={bulkPromoteLoading}>
              Promote {bulkPromoteForm.selectedStudentIds.length} Students
            </Button>
          </>
        }
      >
        <form onSubmit={handleBulkPromoteSubmit} className="space-y-4">
          {bulkPromoteError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{bulkPromoteError}</span>
              </div>
              <button type="button" onClick={() => setBulkPromoteError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Target Session"
              value={bulkPromoteForm.targetSessionId}
              onChange={(e) => setBulkPromoteForm({ ...bulkPromoteForm, targetSessionId: e.target.value })}
              required
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <Select
              label="Target Class"
              value={bulkPromoteForm.targetClassId}
              onChange={(e) => setBulkPromoteForm({ ...bulkPromoteForm, targetClassId: e.target.value })}
              required
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select
              label="Target Section"
              value={bulkPromoteForm.targetSectionId}
              onChange={(e) => setBulkPromoteForm({ ...bulkPromoteForm, targetSectionId: e.target.value })}
              required
            >
              {(classes.find(c => c.id === bulkPromoteForm.targetClassId)?.sections || sections).map((sec: any) => (
                <option key={sec.id} value={sec.id}>Section {sec.name}</option>
              ))}
            </Select>
          </div>

          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50 dark:bg-slate-800/60 max-h-48 overflow-y-auto space-y-1">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Students to be Promoted ({bulkPromoteForm.selectedStudentIds.length})</p>
            {students.filter(s => s.status === 'active').map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkPromoteForm.selectedStudentIds.includes(s.id)}
                  onChange={(e) => {
                    const ids = e.target.checked
                      ? [...bulkPromoteForm.selectedStudentIds, s.id]
                      : bulkPromoteForm.selectedStudentIds.filter(id => id !== s.id);
                    setBulkPromoteForm({ ...bulkPromoteForm, selectedStudentIds: ids });
                  }}
                  className="rounded text-indigo-600"
                />
                <span className="font-mono text-slate-900 dark:text-white">{s.admission_number}</span> — {s.full_name} ({s.class_name || 'Class'})
              </label>
            ))}
          </div>
        </form>
      </Modal>

      {/* SINGLE PROMOTION MODAL */}
      <Modal
        isOpen={isPromoteModalOpen}
        onClose={() => setIsPromoteModalOpen(false)}
        title={`Promote ${selectedStudent?.full_name || 'Student'}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsPromoteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handlePromoteStudent} loading={actionLoading}>
              Confirm Promotion
            </Button>
          </>
        }
      >
        <form onSubmit={handlePromoteStudent} className="space-y-3">
          {promoteError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{promoteError}</span>
              </div>
              <button type="button" onClick={() => setPromoteError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <Select
            label="Target Session"
            value={promoteForm.targetSessionId}
            onChange={(e) => setPromoteForm({ ...promoteForm, targetSessionId: e.target.value })}
            required
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <Select
            label="Target Class"
            value={promoteForm.targetClassId}
            onChange={(e) => setPromoteForm({ ...promoteForm, targetClassId: e.target.value })}
            required
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select
            label="Target Section"
            value={promoteForm.targetSectionId}
            onChange={(e) => setPromoteForm({ ...promoteForm, targetSectionId: e.target.value })}
            required
          >
            {(classes.find(c => c.id === promoteForm.targetClassId)?.sections || sections).map((s: any) => (
              <option key={s.id} value={s.id}>Section {s.name}</option>
            ))}
          </Select>
        </form>
      </Modal>

      {/* ARCHIVE CONFIRMATION */}
      <ConfirmDialog
        isOpen={Boolean(selectedStudent) && isArchiveConfirmOpen}
        onClose={() => setIsArchiveConfirmOpen(false)}
        onConfirm={handleArchiveStudent}
        title="Archive Student Record"
        message={`Are you sure you want to archive ${selectedStudent?.full_name}? Their historical academic and fee records will remain preserved.`}
        confirmText="Archive Student"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
};
