import { z } from 'zod';

export const ResolveConflictInputSchema = z.object({
  conflictId: z.string().min(1, 'Conflict ID is required'),
  strategy: z.enum(['local_wins', 'remote_wins', 'merged']),
  notes: z.string().optional(),
  customPayload: z.record(z.string(), z.any()).optional(),
});

export const SetRemoteBackendUrlSchema = z.object({
  url: z.string().url('Must be a valid HTTP/HTTPS URL'),
});

export const DeviceRegistrationSchema = z.object({
  deviceName: z.string().min(2, 'Device name must be at least 2 characters'),
  authToken: z.string().optional(),
});
