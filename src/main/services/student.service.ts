import Database from 'better-sqlite3';
import { StudentRepository, StudentRecord } from '../database/repositories/student.repository';
import { GuardianRepository } from '../database/repositories/guardian.repository';
import { AuditRepository } from '../database/repositories/audit.repository';
import { InstallationService } from './installation.service';
import { RbacService } from './rbac.service';
import { ValidatedSession } from '../security/session-manager';
import { recordChange } from '../sync/change-tracker';

export class StudentService {
  private studentRepo: StudentRepository;
  private guardianRepo: GuardianRepository;
  private auditRepo: AuditRepository;
  private installService: InstallationService;

  constructor(private db: Database.Database) {
    this.studentRepo = new StudentRepository(db);
    this.guardianRepo = new GuardianRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.installService = new InstallationService(db);
  }

  public listStudents(session: ValidatedSession, query?: { search?: string; classId?: string; sectionId?: string; status?: string; gender?: string; sessionId?: string; limit?: number; offset?: number }) {
    RbacService.assertPermission(session, 'students:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    return this.studentRepo.listStudents(schoolId, query);
  }

  public getStudentProfile(session: ValidatedSession, studentId: string) {
    RbacService.assertPermission(session, 'students:read');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    const profile = this.studentRepo.getStudentProfile(schoolId, studentId);
    if (!profile) {
      throw new Error(`Student ${studentId} not found in this institution`);
    }
    return profile;
  }

  public admitStudent(
    session: ValidatedSession,
    data: {
      id: string;
      admissionNumber: string;
      fullName: string;
      fatherName: string;
      gender?: 'male' | 'female' | 'other';
      dateOfBirth?: string;
      cnicBform?: string;
      phone?: string;
      address?: string;
      admissionDate?: string;
      previousSchool?: string;
      adminNotes?: string;
      sessionId: string;
      classId: string;
      sectionId: string;
      rollNumber?: string;
      guardian?: {
        fullName: string;
        relationship: string;
        cnic?: string;
        phone: string;
        email?: string;
        occupation?: string;
        address?: string;
      };
    }
  ) {
    RbacService.assertPermission(session, 'students:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const runTx = this.db.transaction(() => {
      // 1. Calculate next roll number if not manually provided
      const roll = data.rollNumber || this.studentRepo.getNextRollNumber(schoolId, data.sessionId, data.classId, data.sectionId);

      // 2. Create permanent student identity
      const student = this.studentRepo.createStudent({
        id: data.id,
        schoolId,
        admissionNumber: data.admissionNumber,
        fullName: data.fullName,
        fatherName: data.fatherName,
        gender: data.gender || null,
        dateOfBirth: data.dateOfBirth || null,
        cnicBform: data.cnicBform || null,
        phone: data.phone || null,
        address: data.address || null,
        admissionDate: data.admissionDate || new Date().toISOString().split('T')[0],
        previousSchool: data.previousSchool || null,
        adminNotes: data.adminNotes || null,
        status: 'active',
      });

      // 3. Create session-specific enrollment
      const enrollment = this.studentRepo.enrollStudent({
        id: `enr_${data.id}_${data.sessionId}`,
        schoolId,
        studentId: data.id,
        sessionId: data.sessionId,
        classId: data.classId,
        sectionId: data.sectionId,
        rollNumber: roll,
        status: 'enrolled',
      });

      // 4. Create active guardian record
      const gdnData = data.guardian || {
        fullName: data.fatherName,
        relationship: 'father',
        cnic: data.cnicBform,
        phone: data.phone || '0300-0000000',
        email: null,
        occupation: 'Employed / Business',
        address: data.address,
      };

      const guardian = this.guardianRepo.createGuardian({
        id: `gdn_${data.id}_${Date.now()}`,
        schoolId,
        studentId: data.id,
        fullName: gdnData.fullName,
        relationship: gdnData.relationship || 'father',
        cnic: gdnData.cnic || null,
        phone: gdnData.phone,
        email: gdnData.email || null,
        occupation: gdnData.occupation || null,
        address: gdnData.address || null,
      });

      // 5. Track mutations in sync outbox
      recordChange('STUDENT', student.id, 'INSERT', student, this.db);
      recordChange('STUDENT_ENROLLMENT', enrollment.id, 'INSERT', enrollment, this.db);
      recordChange('STUDENT_GUARDIAN', guardian.id, 'INSERT', guardian, this.db);

      // 6. Log audit entry
      this.auditRepo.log({
        schoolId,
        userId: session.userId,
        action: 'STUDENT_ADMISSION',
        module: 'STUDENTS',
        details: { admissionNumber: student.admissionNumber, fullName: student.fullName, rollNumber: roll },
        performedBy: session.userName || 'Administrator',
      });

      return {
        ...student,
        student,
        enrollment,
        guardian,
      };
    });

    return runTx();
  }

  public replaceGuardian(
    session: ValidatedSession,
    studentId: string,
    guardianData: {
      fullName: string;
      relationship: string;
      cnic?: string;
      phone: string;
      email?: string;
      occupation?: string;
      address?: string;
    },
    reason: string
  ) {
    RbacService.assertPermission(session, 'students:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const runTx = this.db.transaction(() => {
      const newGuardianId = `gdn_${studentId}_${Date.now()}`;
      const res = this.guardianRepo.replaceGuardian(
        schoolId,
        studentId,
        {
          id: newGuardianId,
          schoolId,
          studentId,
          fullName: guardianData.fullName,
          relationship: guardianData.relationship,
          cnic: guardianData.cnic || null,
          phone: guardianData.phone,
          email: guardianData.email || null,
          occupation: guardianData.occupation || null,
          address: guardianData.address || null,
        },
        reason
      );

      recordChange('STUDENT_GUARDIAN', res.newGuardian.id, 'INSERT', res.newGuardian, this.db);
      if (res.previousGuardian) {
        recordChange('STUDENT_GUARDIAN', res.previousGuardian.id, 'UPDATE', {
          id: res.previousGuardian.id,
          isActive: false,
          replacedAt: new Date().toISOString(),
          replacementReason: reason,
        }, this.db);
      }

      this.auditRepo.log({
        schoolId,
        userId: session.userId,
        action: 'STUDENT_GUARDIAN_REPLACED',
        module: 'STUDENTS',
        details: {
          studentId,
          previousGuardianName: res.previousGuardian?.fullName,
          newGuardianName: res.newGuardian.fullName,
          reason,
        },
        performedBy: session.userName || 'Administrator',
      });

      return {
        ...res.newGuardian,
        ...res,
      };
    });

    return runTx();
  }

  public bulkPromoteStudents(
    session: ValidatedSession,
    promotions: {
      studentId: string;
      targetSessionId: string;
      targetClassId: string;
      targetSectionId: string;
      rollNumber?: string;
    }[]
  ) {
    RbacService.assertPermission(session, 'students:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const res = this.studentRepo.bulkPromote(schoolId, promotions);

    for (const p of promotions) {
      recordChange('STUDENT_ENROLLMENT', `enr_p_${p.studentId}_${p.targetSessionId}`, 'INSERT', {
        studentId: p.studentId,
        sessionId: p.targetSessionId,
        classId: p.targetClassId,
        sectionId: p.targetSectionId,
      }, this.db);
    }

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'STUDENTS_BULK_PROMOTED',
      module: 'STUDENTS',
      details: { count: promotions.length, targetSessionId: promotions[0]?.targetSessionId },
      performedBy: session.userName || 'Administrator',
    });

    return res;
  }

  public archiveStudent(
    session: ValidatedSession,
    studentId: string,
    status: 'inactive' | 'graduated' | 'withdrawn',
    reason?: string
  ) {
    RbacService.assertPermission(session, 'students:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const runTx = this.db.transaction(() => {
      const student = this.studentRepo.updateStatus(schoolId, studentId, status);

      // Update current enrollment status to match if applicable
      this.db.prepare(`
        UPDATE student_enrollments
        SET status = ?
        WHERE school_id = ? AND student_id = ? AND status = 'enrolled'
      `).run(status === 'graduated' ? 'graduated' : 'withdrawn', schoolId, studentId);

      recordChange('STUDENT', student.id, 'UPDATE', {
        id: student.id,
        schoolId,
        status,
        archivedAt: new Date().toISOString(),
        reason,
      }, this.db);

      this.auditRepo.log({
        schoolId,
        userId: session.userId,
        action: 'STUDENT_ARCHIVED',
        module: 'STUDENTS',
        details: { studentId, status, reason },
        performedBy: session.userName || 'Administrator',
      });

      return student;
    });

    return runTx();
  }

  public promoteStudent(
    session: ValidatedSession,
    data: {
      studentId: string;
      targetSessionId: string;
      targetClassId: string;
      targetSectionId: string;
      rollNumber?: string;
    }
  ) {
    RbacService.assertPermission(session, 'students:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    const runTx = this.db.transaction(() => {
      // 1. Mark previous active enrollments as promoted
      this.db.prepare(`
        UPDATE student_enrollments
        SET status = 'promoted'
        WHERE school_id = ? AND student_id = ? AND status = 'enrolled'
      `).run(schoolId, data.studentId);

      // 2. Create new enrollment for target session
      const newEnrollmentId = `enr_prom_${data.studentId}_${data.targetSessionId}`;
      const enrollment = this.studentRepo.enrollStudent({
        id: newEnrollmentId,
        schoolId,
        studentId: data.studentId,
        sessionId: data.targetSessionId,
        classId: data.targetClassId,
        sectionId: data.targetSectionId,
        rollNumber: data.rollNumber || null,
        status: 'enrolled',
      });

      recordChange('STUDENT_ENROLLMENT', enrollment.id, 'INSERT', enrollment, this.db);

      this.auditRepo.log({
        schoolId,
        userId: session.userId,
        action: 'STUDENT_PROMOTED',
        module: 'STUDENTS',
        details: { studentId: data.studentId, targetSessionId: data.targetSessionId, targetClassId: data.targetClassId },
        performedBy: session.userName || 'Administrator',
      });

      return enrollment;
    });

    return runTx();
  }

  public deleteStudent(session: ValidatedSession, studentId: string) {
    RbacService.assertPermission(session, 'students:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);

    // Protected: trigger trg_prevent_student_deletion_with_financials will reject if invoices exist
    this.studentRepo.deleteStudent(schoolId, studentId);

    recordChange('STUDENT', studentId, 'DELETE', { id: studentId, schoolId }, this.db);

    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'STUDENT_DELETED',
      module: 'STUDENTS',
      details: { studentId },
      performedBy: session.userName || 'Administrator',
    });

    return { success: true };
  }

  public updateStudent(
    session: ValidatedSession,
    studentId: string,
    patch: {
      fullName?: string;
      fatherName?: string;
      gender?: string;
      dateOfBirth?: string | null;
      cnicBform?: string | null;
      phone?: string | null;
      address?: string | null;
      previousSchool?: string | null;
      adminNotes?: string | null;
      status?: string;
    }
  ) {
    RbacService.assertPermission(session, 'students:manage');
    const schoolId = this.installService.assertSchoolIsolation(session.schoolId);
    const updated = this.studentRepo.updateStudent(schoolId, studentId, patch);
    if (!updated) throw new Error('Student not found');
    recordChange('STUDENT', studentId, 'UPDATE', { id: studentId, ...patch }, this.db);
    this.auditRepo.log({
      schoolId,
      userId: session.userId,
      action: 'STUDENT_UPDATED',
      module: 'STUDENTS',
      details: { studentId, fields: Object.keys(patch) },
      performedBy: session.userName || 'Administrator',
    });
    return updated;
  }
}
