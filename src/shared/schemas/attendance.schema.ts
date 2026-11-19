import { z } from 'zod';

export const AttendanceEntrySchema = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
  sessionId: z.string().min(1),
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  status: z.enum(['present', 'absent', 'late', 'leave']),
  remarks: z.string().optional().nullable(),
});

export const RecordAttendanceInputSchema = z.object({
  entries: z.array(AttendanceEntrySchema).min(1, 'At least one attendance record required'),
});

export type RecordAttendanceInput = z.infer<typeof RecordAttendanceInputSchema>;

export const CorrectAttendanceInputSchema = z.object({
  attendanceId: z.string().min(1, 'Attendance ID is required'),
  newStatus: z.enum(['present', 'absent', 'late', 'leave']),
  reason: z.string().min(3, 'Correction reason is required'),
});

export type CorrectAttendanceInput = z.infer<typeof CorrectAttendanceInputSchema>;
