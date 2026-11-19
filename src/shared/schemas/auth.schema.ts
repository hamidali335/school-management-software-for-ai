import { z } from 'zod';

export const PasswordComplexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

export const LoginInputSchema = z.object({
  identifier: z.string().min(3, 'Username or email must be at least 3 characters').trim(),
  password: z.string().min(1, 'Password is required'),
  schoolCode: z.string().optional(),
  backendUrl: z.string().optional(),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const InitialAdminProvisioningSchema = z.object({
  schoolName: z.string().min(3, 'School Name must be at least 3 characters').trim(),
  schoolCode: z.string().min(2, 'School Code must be at least 2 characters').trim(),
  currency: z.string().default('Rs.'),
  adminName: z.string().min(2, 'Administrator Name must be at least 2 characters').trim(),
  adminEmail: z.string().email('Invalid email address').optional().nullable(),
  adminUsername: z.string().min(3, 'Administrator Username must be at least 3 characters').trim(),
  adminPassword: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(
      PasswordComplexityRegex,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

export type InitialAdminProvisioningInput = z.infer<typeof InitialAdminProvisioningSchema>;

export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(6, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters long')
    .regex(
      PasswordComplexityRegex,
      'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

export const ProvisionSchoolInputSchema = z.object({
  schoolId: z.string().min(3, 'School ID must be at least 3 characters').trim(),
  schoolName: z.string().min(3, 'School Name must be at least 3 characters').trim(),
  schoolCode: z.string().min(2, 'School Code must be at least 2 characters').trim(),
  currency: z.string().default('Rs.'),
  installationId: z.string().min(8),
});

export type ProvisionSchoolInput = z.infer<typeof ProvisionSchoolInputSchema>;

export const ProvisionUserInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2, 'Name must be at least 2 characters').trim(),
  email: z.string().email('Invalid email address').optional().nullable(),
  username: z.string().min(3, 'Username must be at least 3 characters').optional().nullable(),
  phone: z.string().optional().nullable(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['school_owner', 'principal', 'school_admin', 'accountant', 'teacher', 'staff']),
  permissions: z.array(z.string()).default([]),
});

export type ProvisionUserInput = z.infer<typeof ProvisionUserInputSchema>;
