import { z } from 'zod';

export const CollectPaymentInputSchema = z.object({
  id: z.string().min(1),
  invoiceId: z.string().min(1),
  receiptNumber: z.string().min(1),
  amount: z.number().positive('Payment amount must be greater than zero'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'cheque']).default('cash'),
});

export type CollectPaymentInput = z.infer<typeof CollectPaymentInputSchema>;

export const ReversePaymentInputSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().min(5, 'Reversal reason must be at least 5 characters'),
});

export type ReversePaymentInput = z.infer<typeof ReversePaymentInputSchema>;

export const CancelInvoiceInputSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
  reason: z.string().min(3, 'Cancellation reason is required'),
});

export type CancelInvoiceInput = z.infer<typeof CancelInvoiceInputSchema>;

export const CreateInvoiceInputSchema = z.object({
  id: z.string().min(1),
  challanNumber: z.string().min(1, 'Challan number is required'),
  studentId: z.string().min(1, 'Student ID is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
  month: z.string().min(1, 'Month is required'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD'),
  amount: z.number().positive('Invoice amount must be positive'),
  previousDues: z.number().nonnegative().optional().default(0),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInputSchema>;

export const CreateFeeStructureSchema = z.object({
  sessionId: z.string().min(1, 'Session is required'),
  classId: z.string().min(1, 'Class is required'),
  name: z.string().min(2, 'Structure name is required'),
  tuitionFee: z.number().nonnegative('Tuition fee must be non-negative'),
  examFee: z.number().nonnegative().optional().default(0),
  miscFee: z.number().nonnegative().optional().default(0),
  dueDay: z.number().int().min(1).max(31).optional().default(10),
});

export type CreateFeeStructureInput = z.infer<typeof CreateFeeStructureSchema>;

export const CreateConcessionSchema = z.object({
  studentId: z.string().min(1, 'Student is required'),
  sessionId: z.string().min(1, 'Session is required'),
  concessionType: z.enum(['percentage', 'fixed_amount']),
  value: z.number().positive('Discount value must be greater than zero'),
  reason: z.string().min(3, 'Reason is required'),
});

export type CreateConcessionInput = z.infer<typeof CreateConcessionSchema>;

export const BulkGenerateInvoicesSchema = z.object({
  sessionId: z.string().min(1, 'Session is required'),
  classId: z.string().min(1, 'Class is required'),
  month: z.string().min(1, 'Billing month is required'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD'),
});

export type BulkGenerateInvoicesInput = z.infer<typeof BulkGenerateInvoicesSchema>;
