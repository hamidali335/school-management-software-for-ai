import { z } from 'zod';

export const CreateExamSchema = z.object({
  id: z.string().min(1, 'Exam ID is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
  name: z.string().min(2, 'Exam name must be at least 2 characters').max(100),
  term: z.enum(['first_term', 'mid_term', 'final_term', 'monthly_test', 'other']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
  status: z.enum(['draft', 'scheduled', 'marks_entry', 'published']).default('draft'),
});

export const CreateExamPaperSchema = z.object({
  id: z.string().min(1, 'Paper ID is required'),
  examId: z.string().min(1, 'Exam ID is required'),
  classId: z.string().min(1, 'Class ID is required'),
  subjectName: z.string().min(2, 'Subject name must be at least 2 characters').max(100),
  maxMarks: z.number().positive('Max marks must be greater than zero'),
  passMarks: z.number().nonnegative('Pass marks cannot be negative'),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Exam date must be YYYY-MM-DD').optional().nullable(),
  startTime: z.string().max(20).optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
});

export const RecordMarksSchema = z.object({
  examId: z.string().min(1, 'Exam ID is required'),
  paperId: z.string().min(1, 'Paper ID is required'),
  marks: z.array(
    z.object({
      studentId: z.string().min(1, 'Student ID is required'),
      obtainedMarks: z.number().nonnegative('Obtained marks cannot be negative').optional().nullable(),
      isAbsent: z.boolean().default(false),
      remarks: z.string().max(200).optional().nullable(),
    })
  ).min(1, 'At least one student mark entry is required'),
});

export const SaveGradingScalesSchema = z.object({
  scales: z.array(
    z.object({
      id: z.string().optional(),
      grade: z.string().min(1, 'Grade symbol is required'),
      minPercentage: z.number().min(0).max(100),
      maxPercentage: z.number().min(0).max(100),
      gpa: z.number().min(0).max(4.0).optional().default(0),
      description: z.string().optional(),
      orderIndex: z.number().int().optional().default(0),
    })
  ).min(1, 'At least one grading scale required'),
});

export type CreateExamInput = z.infer<typeof CreateExamSchema>;
export type CreateExamPaperInput = z.infer<typeof CreateExamPaperSchema>;
export type RecordMarksInput = z.infer<typeof RecordMarksSchema>;
export type SaveGradingScalesInput = z.infer<typeof SaveGradingScalesSchema>;
