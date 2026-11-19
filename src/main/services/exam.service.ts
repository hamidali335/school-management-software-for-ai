import Database from 'better-sqlite3';
import { ExamRepository, ExamRecord, ExamPaperRecord, GradingScaleRecord } from '../database/repositories/exam.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { recordChange } from '../sync/change-tracker';

export class ExamService {
  private examRepo: ExamRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.examRepo = new ExamRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
  }

  public listExams(session: ValidatedSession, sessionId?: string) {
    RbacService.assertPermission(session, 'academics:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.examRepo.listExams(schoolId, sessionId);
  }

  public createExam(session: ValidatedSession, data: Omit<ExamRecord, 'schoolId' | 'createdAt' | 'updatedAt'>) {
    RbacService.assertPermission(session, 'academics:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const exam = this.examRepo.createExam({
      ...data,
      schoolId,
    });

    recordChange('EXAM', exam.id, 'INSERT', exam, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'EXAM_CREATED',
      module: 'EXAMS',
      details: { examId: exam.id, name: exam.name, term: exam.term },
      performedBy: session.userName || 'Academic Coordinator',
    });

    return exam;
  }

  public publishExam(session: ValidatedSession, examId: string) {
    RbacService.assertPermission(session, 'academics:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const result = this.examRepo.publishExam(schoolId, examId);
    recordChange('EXAM', examId, 'UPDATE', { id: examId, status: 'published' }, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'EXAM_PUBLISHED',
      module: 'EXAMS',
      details: { examId },
      performedBy: session.userName || 'Principal',
    });

    return result;
  }

  public listExamPapers(session: ValidatedSession, examId: string, classId?: string) {
    RbacService.assertPermission(session, 'academics:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.examRepo.listExamPapers(schoolId, examId, classId);
  }

  public createExamPaper(session: ValidatedSession, data: Omit<ExamPaperRecord, 'schoolId' | 'createdAt'>) {
    RbacService.assertPermission(session, 'academics:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const paper = this.examRepo.createExamPaper({
      ...data,
      schoolId,
    });

    recordChange('EXAM_PAPER', paper.id, 'INSERT', paper, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'EXAM_PAPER_CREATED',
      module: 'EXAMS',
      details: { paperId: paper.id, examId: paper.examId, subject: paper.subjectName },
      performedBy: session.userName || 'Academic Coordinator',
    });

    return paper;
  }

  public recordMarks(
    session: ValidatedSession,
    examId: string,
    paperId: string,
    marks: { studentId: string; obtainedMarks: number | null; isAbsent: boolean; remarks?: string }[]
  ) {
    RbacService.assertPermission(session, 'academics:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const result = this.examRepo.recordStudentMarks(schoolId, examId, paperId, marks);

    for (const m of marks) {
      recordChange('STUDENT_MARKS', `${examId}_${paperId}_${m.studentId}`, 'INSERT', {
        schoolId,
        examId,
        paperId,
        studentId: m.studentId,
        obtainedMarks: m.obtainedMarks,
        isAbsent: m.isAbsent,
        remarks: m.remarks,
      }, this.db);
    }

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'MARKS_RECORDED',
      module: 'EXAMS',
      details: { examId, paperId, count: result.recordedCount },
      performedBy: session.userName || 'Teacher / Examiner',
    });

    return result;
  }

  public getMarksForPaper(session: ValidatedSession, paperId: string) {
    RbacService.assertPermission(session, 'academics:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.examRepo.getMarksForPaper(schoolId, paperId);
  }

  public calculateExamResults(session: ValidatedSession, examId: string, classId: string) {
    RbacService.assertPermission(session, 'academics:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.examRepo.calculateExamResults(schoolId, examId, classId);
  }

  public generateReportCard(session: ValidatedSession, examId: string, studentId: string) {
    RbacService.assertPermission(session, 'academics:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.examRepo.generateReportCard(schoolId, examId, studentId);
  }

  public getGradingScales(session: ValidatedSession) {
    RbacService.assertPermission(session, 'academics:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.examRepo.getGradingScales(schoolId);
  }

  public saveGradingScales(session: ValidatedSession, scales: GradingScaleRecord[]) {
    RbacService.assertPermission(session, 'academics:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const result = this.examRepo.saveGradingScales(schoolId, scales);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'GRADING_SCALES_UPDATED',
      module: 'EXAMS',
      details: { count: scales.length },
      performedBy: session.userName || 'Administrator',
    });

    return result;
  }
}
