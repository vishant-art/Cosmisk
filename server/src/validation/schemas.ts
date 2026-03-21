/**
 * Zod validation schemas for all API routes.
 * Centralizes input validation with consistent error handling.
 */

import { z } from 'zod';
import type { FastifyReply } from 'fastify';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID format');
const email = z.string().email('Invalid email address').transform(v => v.toLowerCase());
const paginationLimit = z.coerce.number().int().min(1).max(100).default(50);
const paginationOffset = z.coerce.number().int().min(0).default(0);

/* ------------------------------------------------------------------ */
/*  Auth schemas                                                       */
/* ------------------------------------------------------------------ */

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/* ------------------------------------------------------------------ */
/*  Team schemas                                                       */
/* ------------------------------------------------------------------ */

export const teamInviteSchema = z.object({
  email: email,
  role: z.enum(['admin', 'media_buyer', 'designer', 'viewer']).default('viewer'),
  name: z.string().max(200).optional(),
});

export const teamRoleSchema = z.object({
  role: z.enum(['admin', 'media_buyer', 'designer', 'viewer']),
});

export const teamAcceptSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
});

export const idParamSchema = z.object({
  id: uuid,
});

/* ------------------------------------------------------------------ */
/*  Content Bank schemas                                               */
/* ------------------------------------------------------------------ */

export const contentBankQuerySchema = z.object({
  platform: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'posted', 'archived']).optional(),
  limit: paginationLimit,
  offset: paginationOffset,
});

export const contentGenerateSchema = z.object({
  platform: z.string().min(1).default('instagram'),
  content_type: z.string().min(1).default('post'),
  tone: z.string().optional(),
  topic: z.string().optional(),
  count: z.coerce.number().int().min(1).max(10).default(3),
});

export const contentSaveSchema = z.object({
  platform: z.string().min(1),
  content_type: z.string().min(1),
  title: z.string().max(500).optional(),
  body: z.string().max(10000),
  hashtags: z.array(z.string()).max(50).optional(),
  media_notes: z.string().max(2000).optional(),
  source: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/*  Automation schemas                                                 */
/* ------------------------------------------------------------------ */

export const automationCreateSchema = z.object({
  account_id: z.string().min(1),
  name: z.string().min(1).max(200),
  trigger_type: z.enum(['cpa_above', 'roas_below', 'spend_above', 'ctr_below', 'budget_exhausted']),
  trigger_value: z.string().optional(),
  action_type: z.enum(['pause', 'reduce_budget', 'increase_budget', 'notify', 'new_creative']),
  action_value: z.string().optional(),
});

export const automationUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  trigger_type: z.enum(['cpa_above', 'roas_below', 'spend_above', 'ctr_below', 'budget_exhausted']).optional(),
  trigger_value: z.string().optional(),
  action_type: z.enum(['pause', 'reduce_budget', 'increase_budget', 'notify', 'new_creative']).optional(),
  action_value: z.string().optional(),
  is_active: z.boolean().optional(),
});

/* ------------------------------------------------------------------ */
/*  Billing schemas                                                    */
/* ------------------------------------------------------------------ */

export const checkoutSchema = z.object({
  plan: z.enum(['solo', 'growth', 'agency']),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
  gateway: z.enum(['stripe', 'razorpay']).default('razorpay'),
});

export const verifyPaymentSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  plan: z.enum(['solo', 'growth', 'agency']),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
});

/* ------------------------------------------------------------------ */
/*  Swipe File schemas                                                 */
/* ------------------------------------------------------------------ */

export const swipeFileSaveSchema = z.object({
  brand: z.string().max(200).default(''),
  thumbnail: z.string().url().optional().nullable(),
  hookDna: z.array(z.string()).max(20).default([]),
  visualDna: z.array(z.string()).max(20).default([]),
  audioDna: z.array(z.string()).max(20).default([]),
  notes: z.string().max(5000).optional(),
  sourceAdId: z.string().optional(),
  sourceUrl: z.string().url().optional(),
});

/* ------------------------------------------------------------------ */
/*  Settings schemas                                                   */
/* ------------------------------------------------------------------ */

export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).optional(),
  brand_name: z.string().max(200).optional(),
  website_url: z.string().url().optional().or(z.literal('')),
  goals: z.array(z.string()).max(20).optional(),
  competitors: z.array(z.string()).max(20).optional(),
});

/* ------------------------------------------------------------------ */
/*  Validation helper                                                  */
/* ------------------------------------------------------------------ */

/**
 * Validates request data against a Zod schema.
 * Returns parsed data on success, or sends 400 error and returns null.
 */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
  reply: FastifyReply,
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.issues[0];
    reply.status(400).send({
      success: false,
      error: firstError?.message || 'Validation failed',
      details: result.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
    return null;
  }
  return result.data;
}
