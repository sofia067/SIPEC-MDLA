import { z } from 'zod';

export const publicApplicationSchema = z.object({
  requestId: z.uuid(),
  fullName: z.string().trim().min(3).max(160),
  documentNumber: z.string().trim().min(6).max(24),
  email: z.union([z.literal(''), z.email().max(254)]).default(''),
  phone: z.string().trim().max(40).default(''),
  privacyConsent: z.literal('true'),
  privacyNoticeVersion: z.string().trim().min(1).max(80),
});
