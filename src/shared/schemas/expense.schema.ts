import { z } from 'zod';

export const CreateExpenseSchema = z.object({
  id: z.string().min(1, 'Expense ID is required'),
  category: z.enum([
    'salaries',
    'rent',
    'utilities',
    'maintenance',
    'stationery',
    'transport_fuel',
    'events',
    'marketing',
    'it_software',
    'taxes',
    'procurement',
    'other',
  ]),
  amount: z.number().positive('Amount must be greater than zero'),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expense date must be YYYY-MM-DD'),
  vendor: z.string().max(100).optional().nullable(),
  description: z.string().min(2, 'Description must be at least 2 characters').max(300),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'cheque', 'online', 'card']).default('cash'),
  reference: z.string().max(100).optional().nullable(),
});

export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;
