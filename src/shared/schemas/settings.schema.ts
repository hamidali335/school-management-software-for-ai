import { z } from 'zod';

export const UpdateSchoolSettingsSchema = z.object({
  contactEmail: z.string().email('Invalid email address').optional().nullable().or(z.literal('')),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  motto: z.string().optional().nullable(),
  challanInstructions: z.string().optional().nullable(),
  gradingSystem: z.string().optional().nullable(),
});

export type UpdateSchoolSettingsInput = z.infer<typeof UpdateSchoolSettingsSchema>;
