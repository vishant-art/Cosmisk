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
/*  Media generation schemas                                           */
/* ------------------------------------------------------------------ */

export const imageGenerateSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000),
  style: z.string().max(100).optional(),
  aspect_ratio: z.string().max(20).optional(),
  reference_image_url: z.string().url().optional(),
});

export const videoGenerateSchema = z.object({
  script: z.string().min(1, 'Script is required').max(5000),
  duration: z.coerce.number().int().min(5).max(120).optional(),
  aspect_ratio: z.string().max(20).optional(),
  avatar: z.string().max(200).optional(),
});

/* ------------------------------------------------------------------ */
/*  Campaign schemas                                                   */
/* ------------------------------------------------------------------ */

export const campaignCreateSchema = z.object({
  campaign_name: z.string().min(1).max(200),
  account_id: z.string().min(1),
  objective: z.string().optional(),
  daily_budget: z.coerce.number().min(0).optional(),
  lifetime_budget: z.coerce.number().min(0).optional(),
  targeting: z.record(z.string(), z.unknown()).optional(),
});

export const campaignLocalCreateSchema = z.object({
  account_id: z.string().optional(),
  name: z.string().min(1).max(200).default('Untitled Campaign'),
  objective: z.string().optional(),
  budget: z.string().optional(),
  schedule_start: z.string().optional(),
  schedule_end: z.string().optional(),
  audience: z.record(z.string(), z.unknown()).optional(),
  placements: z.string().optional(),
  creative_ids: z.array(z.string()).optional(),
  status: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/*  Agent query schemas                                                */
/* ------------------------------------------------------------------ */

export const agentRunsQuerySchema = z.object({
  agent_type: z.enum(['watchdog', 'briefing', 'report', 'content', 'sales']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const agentDecisionsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'executed', 'rejected', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/* ------------------------------------------------------------------ */
/*  Common query schemas                                               */
/* ------------------------------------------------------------------ */

export const datePresetQuerySchema = z.object({
  account_id: z.string().optional(),
  credential_group: z.string().optional(),
  date_preset: z.enum(['today', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month']).default('last_7d'),
});

/* ------------------------------------------------------------------ */
/*  Autopilot schemas                                                  */
/* ------------------------------------------------------------------ */

export const autopilotAlertsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  unread_only: z.enum(['true', 'false']).default('false'),
});

export const autopilotMarkReadSchema = z.object({
  alert_ids: z.array(z.string()).optional(),
  mark_all: z.boolean().optional(),
});

/* ------------------------------------------------------------------ */
/*  Report schemas                                                     */
/* ------------------------------------------------------------------ */

export const reportGenerateSchema = z.object({
  name: z.string().max(500).optional(),
  type: z.enum(['performance', 'creative', 'audience', 'full', 'weekly-strategy']).default('performance'),
  date_range: z.enum(['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month']).default('last_7d'),
  brand: z.string().max(200).optional(),
  sections: z.array(z.string()).optional(),
  include_branding: z.boolean().optional(),
  include_ai_summary: z.boolean().optional(),
  account_id: z.string().min(1, 'account_id is required'),
  credential_group: z.string().optional(),
});

export const reportWeeklySchema = z.object({
  account_id: z.string().min(1, 'account_id is required'),
});

/* ------------------------------------------------------------------ */
/*  UGC schemas                                                        */
/* ------------------------------------------------------------------ */

export const ugcCreateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  brand_name: z.string().max(200).optional(),
  brief: z.string().max(10000).optional(),
  account_id: z.string().optional(),
  credential_group: z.string().optional(),
  currency: z.string().max(10).optional(),
  num_concepts: z.coerce.number().int().min(1).max(20).optional(),
});

export const ugcConceptActionSchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  action: z.enum(['approve', 'reject', 'revise']).optional(),
  concept_ids: z.array(z.string()).optional(),
  notes: z.string().max(5000).optional(),
});

export const ugcScriptUpdateSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
  content: z.string().max(50000).optional(),
});

/* ------------------------------------------------------------------ */
/*  Director Lab schemas                                               */
/* ------------------------------------------------------------------ */

export const directorBriefSchema = z.object({
  base_creative: z.string().max(10000).optional(),
  patterns: z.array(z.string()).optional(),
  format: z.string().max(100).optional(),
  target_audience: z.string().max(1000).optional(),
  product_focus: z.string().max(1000).optional(),
  tones: z.array(z.string()).optional(),
  account_id: z.string().optional(),
  credential_group: z.string().optional(),
});

const directorCreativeSchema = z.object({
  title: z.string().max(500).optional(),
  body: z.string().max(5000).optional(),
  link_url: z.string().url().optional(),
  image_url: z.string().url().optional(),
  call_to_action_type: z.string().optional(),
});

export const directorLaunchSchema = z.object({
  account_id: z.string().min(1),
  campaign_name: z.string().min(1).max(200),
  objective: z.string().optional(),
  daily_budget: z.coerce.number().min(0).optional(),
  targeting: z.record(z.string(), z.unknown()).optional(),
  creative: directorCreativeSchema.optional(),
  creatives: z.array(directorCreativeSchema).max(50).optional(),
  page_id: z.string().optional(),
  status: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/*  Score schemas                                                      */
/* ------------------------------------------------------------------ */

export const creativeScoreSchema = z.object({
  url: z.string().optional(),
  description: z.string().max(5000).optional(),
  format: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  platform: z.string().max(50).optional(),
});

export const batchScoreSchema = z.object({
  creatives: z.array(z.object({
    url: z.string().optional(),
    description: z.string().max(5000).optional(),
    format: z.string().max(100).optional(),
  })).min(1).max(50),
});

/* ------------------------------------------------------------------ */
/*  Account/dashboard query schemas                                    */
/* ------------------------------------------------------------------ */

export const accountQuerySchema = z.object({
  account_id: z.string().optional(),
  credential_group: z.string().optional(),
  date_preset: z.enum(['today', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month']).default('last_7d'),
});

export const accountIdQuerySchema = z.object({
  account_id: z.string().optional(),
  credential_group: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/*  AI Chat schema                                                     */
/* ------------------------------------------------------------------ */

export const aiChatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000),
  account_id: z.string().optional(),
  credential_group: z.string().optional(),
  date_preset: z.string().optional(),
  currency: z.string().max(10).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'ai']),
    content: z.string(),
  })).optional(),
});

/* ------------------------------------------------------------------ */
/*  OAuth code schema                                                  */
/* ------------------------------------------------------------------ */

export const oauthCodeSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
});

/* ------------------------------------------------------------------ */
/*  Competitor Spy schemas                                             */
/* ------------------------------------------------------------------ */

export const competitorSearchSchema = z.object({
  query: z.string().min(1).max(500),
  country: z.string().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/* ------------------------------------------------------------------ */
/*  Content update schema                                              */
/* ------------------------------------------------------------------ */

export const contentUpdateSchema = z.object({
  status: z.enum(['draft', 'scheduled', 'posted', 'archived']).optional(),
  body: z.string().max(10000).optional(),
  title: z.string().max(500).optional(),
  hashtags: z.string().max(2000).optional(),
  media_notes: z.string().max(2000).optional(),
  scheduled_for: z.string().optional(),
  posted_at: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/*  Google/TikTok Ads query schemas                                    */
/* ------------------------------------------------------------------ */

export const googleAdsQuerySchema = z.object({
  customer_id: z.string().optional(),
  date_preset: z.enum(['last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month']).default('last_7d'),
});

export const tiktokAdsQuerySchema = z.object({
  date_preset: z.enum(['last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month']).default('last_7d'),
});

/* ------------------------------------------------------------------ */
/*  Assets query schema                                                */
/* ------------------------------------------------------------------ */

export const assetsQuerySchema = z.object({
  account_id: z.string().optional(),
  date_preset: z.enum(['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month']).default('last_30d'),
});

/* ------------------------------------------------------------------ */
/*  Reusable ID schemas                                                */
/* ------------------------------------------------------------------ */

export const projectIdBodySchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
});

export const projectIdQuerySchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
});

export const campaignIdBodySchema = z.object({
  campaign_id: z.string().min(1, 'campaign_id is required'),
});

export const campaignIdQuerySchema = z.object({
  campaign_id: z.string().min(1, 'campaign_id is required'),
});

/* ------------------------------------------------------------------ */
/*  Campaign update schema                                             */
/* ------------------------------------------------------------------ */

export const campaignUpdateBodySchema = z.object({
  campaign_id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  objective: z.string().optional(),
  budget: z.string().optional(),
  schedule_start: z.string().optional(),
  schedule_end: z.string().optional(),
  audience: z.record(z.string(), z.unknown()).optional(),
  placements: z.string().optional(),
  creative_ids: z.array(z.string()).optional(),
  status: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/*  Director update-status schema                                      */
/* ------------------------------------------------------------------ */

export const directorUpdateStatusSchema = z.object({
  campaign_id: z.string().min(1),
  status: z.enum(['ACTIVE', 'PAUSED']),
});

/* ------------------------------------------------------------------ */
/*  Content generate/batch schemas                                     */
/* ------------------------------------------------------------------ */

export const contentGenerateRequestSchema = z.object({
  platforms: z.array(z.string()).optional(),
  topic: z.string().max(2000).optional(),
  tone: z.enum(['technical', 'casual', 'motivational', 'data-driven']).optional(),
  transcript: z.string().max(10000).optional(),
});

export const contentSaveBatchSchema = z.object({
  items: z.array(z.object({
    platform: z.string().min(1),
    content_type: z.string().optional(),
    title: z.string().max(500).optional(),
    body: z.string().min(1).max(10000),
    hashtags: z.array(z.string()).optional(),
    media_notes: z.string().max(2000).optional(),
  })).min(1).max(50),
});

/* ------------------------------------------------------------------ */
/*  Competitor analyze schema                                          */
/* ------------------------------------------------------------------ */

export const competitorAnalyzeSchema = z.object({
  query: z.string().min(1).max(500),
  country: z.string().max(10).optional(),
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
