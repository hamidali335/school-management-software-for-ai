import { z } from 'zod';

export const CreateTimetableEntrySchema = z.object({
  id: z.string().min(1, 'Entry ID is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
  classId: z.string().min(1, 'Class ID is required'),
  sectionId: z.string().min(1, 'Section ID is required'),
  dayOfWeek: z.number().int().min(1).max(7),
  periodName: z.string().min(1, 'Period name is required').max(50),
  startTime: z.string().min(1, 'Start time is required').max(20),
  endTime: z.string().min(1, 'End time is required').max(20),
  subjectName: z.string().min(2, 'Subject name is required').max(100),
  teacherId: z.string().optional().nullable(),
  roomNumber: z.string().max(50).optional().nullable(),
});

export type CreateTimetableEntryInput = z.infer<typeof CreateTimetableEntrySchema>;
