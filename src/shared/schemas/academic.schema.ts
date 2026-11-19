import { z } from 'zod';

export const CreateClassSchema = z.object({
  id: z.string().min(1, 'Class ID is required'),
  name: z.string().min(2, 'Class name must be at least 2 characters').max(100),
  orderIndex: z.number().int().nonnegative('Order index cannot be negative'),
  sections: z.array(z.string().min(1, 'Section name cannot be empty')).min(1, 'At least one section is required'),
});

export const CreateSessionSchema = z.object({
  id: z.string().min(1, 'Session ID is required'),
  name: z.string().min(2, 'Session name is required').max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
  isCurrent: z.boolean().default(false),
});

export type CreateClassInput = z.infer<typeof CreateClassSchema>;
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
