import { z } from 'zod';

export const AdmitStudentInputSchema = z.object({
  id: z.string().min(1),
  admissionNumber: z.string().min(1, 'Admission number is required').trim(),
  fullName: z.string().min(2, 'Student name must be at least 2 characters').trim(),
  fatherName: z.string().min(2, 'Father name must be at least 2 characters').trim(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: z.string().optional(),
  cnicBform: z.string().regex(/^\d{5}-\d{7}-\d{1}$/, 'CNIC/B-Form must match XXXXX-XXXXXXX-X format').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  admissionDate: z.string().optional(),
  previousSchool: z.string().optional(),
  adminNotes: z.string().optional(),
  sessionId: z.string().min(1, 'Academic session is required'),
  classId: z.string().min(1, 'Class grade is required'),
  sectionId: z.string().min(1, 'Section is required'),
  rollNumber: z.string().optional(),
  guardian: z.object({
    fullName: z.string().min(2, 'Guardian name is required').trim(),
    relationship: z.string().min(1, 'Relationship is required'),
    phone: z.string().min(5, 'Valid contact number is required'),
    cnic: z.string().optional().or(z.literal('')),
    email: z.string().email().optional().or(z.literal('')),
    occupation: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
});

export type AdmitStudentInput = z.infer<typeof AdmitStudentInputSchema>;

export const ReplaceGuardianInputSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  reason: z.string().min(3, 'Replacement reason is required'),
  guardian: z.object({
    fullName: z.string().min(2, 'Guardian name is required').trim(),
    relationship: z.string().min(1, 'Relationship is required'),
    phone: z.string().min(5, 'Valid contact number is required'),
    cnic: z.string().optional().or(z.literal('')),
    email: z.string().email().optional().or(z.literal('')),
    occupation: z.string().optional(),
    address: z.string().optional(),
  }),
});

export type ReplaceGuardianInput = z.infer<typeof ReplaceGuardianInputSchema>;

export const StudentListQuerySchema = z.object({
  search: z.string().max(100).optional(),
  classId: z.string().max(50).optional(),
  sessionId: z.string().max(50).optional(),
  limit: z.number().int().min(1).max(200).optional(),
}).optional();

export type StudentListQuery = z.infer<typeof StudentListQuerySchema>;

export const ArchiveStudentInputSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  status: z.enum(['inactive', 'graduated', 'withdrawn']),
  reason: z.string().max(200).optional(),
});

export type ArchiveStudentInput = z.infer<typeof ArchiveStudentInputSchema>;

export const PromoteStudentInputSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  targetSessionId: z.string().min(1, 'Target session is required'),
  targetClassId: z.string().min(1, 'Target class is required'),
  targetSectionId: z.string().min(1, 'Target section is required'),
  rollNumber: z.string().max(20).optional(),
});

export type PromoteStudentInput = z.infer<typeof PromoteStudentInputSchema>;

export const BulkPromoteStudentsInputSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1, 'At least one student must be selected for promotion'),
  targetSessionId: z.string().min(1, 'Target session is required'),
  targetClassId: z.string().min(1, 'Target class is required'),
  targetSectionId: z.string().min(1, 'Target section is required'),
});

export type BulkPromoteStudentsInput = z.infer<typeof BulkPromoteStudentsInputSchema>;
