import { z } from 'zod';

export const CreateEmployeeSchema = z.object({
  id: z.string().min(1, 'Employee ID is required'),
  employeeCode: z.string().min(2, 'Employee code is required').max(30),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  designation: z.string().min(2, 'Designation is required').max(100),
  department: z.string().optional().default('Academics'),
  isTeaching: z.boolean().optional().default(true),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email('Invalid email address').optional().nullable().or(z.literal('')),
  qualification: z.string().max(100).optional().nullable(),
  status: z.enum(['active', 'on_leave', 'resigned', 'terminated']).default('active'),
  joinedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Joined date must be YYYY-MM-DD').optional().nullable(),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;

export const StaffAttendanceEntrySchema = z.object({
  id: z.string().min(1),
  employeeId: z.string().min(1, 'Employee ID is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  status: z.enum(['present', 'absent', 'late', 'leave', 'half_day']),
  checkInTime: z.string().optional().nullable(),
  checkOutTime: z.string().optional().nullable(),
  remarks: z.string().max(200).optional().nullable(),
});

export const RecordStaffAttendanceSchema = z.object({
  entries: z.array(StaffAttendanceEntrySchema).min(1, 'At least one staff attendance entry required'),
});

export type RecordStaffAttendanceInput = z.infer<typeof RecordStaffAttendanceSchema>;

export const CreateStaffUserAccountSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['teacher', 'accountant', 'staff', 'principal', 'school_admin']),
  fullName: z.string().optional(),
});

export type CreateStaffUserAccountInput = z.infer<typeof CreateStaffUserAccountSchema>;
