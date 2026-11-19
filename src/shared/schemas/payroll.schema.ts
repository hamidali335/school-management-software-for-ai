import { z } from 'zod';

export const SaveSalaryStructureSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  basicSalary: z.number().nonnegative('Basic salary must be non-negative'),
  allowancesJson: z.string().optional().default('[]'),
  deductionsJson: z.string().optional().default('[]'),
});

export type SaveSalaryStructureInput = z.infer<typeof SaveSalaryStructureSchema>;

export const GeneratePayrollRunSchema = z.object({
  month: z.string().min(1, 'Month is required'),
  year: z.number().int().min(2020).max(2050),
});

export type GeneratePayrollRunInput = z.infer<typeof GeneratePayrollRunSchema>;

export const MarkPayrollSlipPaidSchema = z.object({
  slipId: z.string().min(1, 'Slip ID is required'),
  paymentMethod: z.string().optional().default('bank_transfer'),
  paymentReference: z.string().optional(),
});

export type MarkPayrollSlipPaidInput = z.infer<typeof MarkPayrollSlipPaidSchema>;
