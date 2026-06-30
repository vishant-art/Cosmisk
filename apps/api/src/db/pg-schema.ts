/**
 * Postgres / Drizzle schema — the canonical runtime schema, originally ported
 * from the legacy SQLite DDL plus the 10 locked AI tables.
 *
 * Porting rules applied:
 *  - TEXT  -> text()   (JSON-bearing TEXT columns stay text(); the app does
 *             JSON.parse on them, so they MUST NOT become jsonb here. Only the
 *             10 locked AI tables use jsonb, since they have no legacy readers.)
 *  - INTEGER -> integer(); 0/1 "boolean" flags stay integer() to preserve the
 *             app's `=== 1` / truthiness checks.
 *  - INTEGER PRIMARY KEY AUTOINCREMENT -> serial().primaryKey()
 *  - REAL  -> real()
 *  - Timestamp columns (created_at/updated_at and the *_at / *_seen / date
 *             family) -> timestamp({ mode: 'string', withTimezone: true }) so
 *             Drizzle returns ISO strings to Node (per M1 constraint), with
 *             .defaultNow() where the DDL had DEFAULT (datetime('now')).
 *  - Index names are table-prefixed to guarantee Postgres-wide uniqueness
 *             (the SQLite DDL reused names like idx_recommendations_client
 *             across tables, which collides under Postgres).
 */
import {
  pgTable,
  text,
  integer,
  real,
  numeric,
  serial,
  uuid,
  jsonb,
  timestamp,
  primaryKey,
  unique,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ====================================================================== */
/*  CORE / SAAS                                                            */
/* ====================================================================== */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  plan: text('plan').notNull().default('free'),
  onboardingComplete: integer('onboarding_complete').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  // ensureColumn() additions:
  brandName: text('brand_name'),
  websiteUrl: text('website_url'),
  goals: text('goals'),
  competitors: text('competitors'),
  activeBrand: text('active_brand'),
  phone: text('phone'),
  notificationPreferences: text('notification_preferences').default('{}'),
  timezone: text('timezone').default('IST'),
  language: text('language').default('en'),
  currency: text('currency').default('INR'),
  dateFormat: text('date_format').default('DD/MM/YYYY'),
});

export const metaTokens = pgTable('meta_tokens', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  metaUserId: text('meta_user_id'),
  metaUserName: text('meta_user_name'),
  expiresAt: timestamp('expires_at', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const googleTokens = pgTable('google_tokens', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
  customerIds: text('customer_ids'),
  expiresAt: timestamp('expires_at', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type').notNull().default('performance'),
  accountId: text('account_id'),
  datePreset: text('date_preset'),
  status: text('status').notNull().default('pending'),
  data: text('data'),
  generatedAt: timestamp('generated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id'),
  name: text('name').notNull(),
  objective: text('objective'),
  budget: text('budget'),
  scheduleStart: timestamp('schedule_start', { mode: 'string', withTimezone: true }),
  scheduleEnd: timestamp('schedule_end', { mode: 'string', withTimezone: true }),
  audience: text('audience'),
  placements: text('placements'),
  creativeIds: text('creative_ids'),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const ugcProjects = pgTable('ugc_projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  brandName: text('brand_name'),
  status: text('status').notNull().default('draft'),
  brief: text('brief'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const ugcConcepts = pgTable('ugc_concepts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => ugcProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('pending'),
  feedback: text('feedback'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const ugcScripts = pgTable('ugc_scripts', {
  id: text('id').primaryKey(),
  conceptId: text('concept_id').notNull().references(() => ugcConcepts.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => ugcProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content'),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: text('plan').notNull().default('free'),
  status: text('status').notNull().default('active'),
  currentPeriodStart: timestamp('current_period_start', { mode: 'string', withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { mode: 'string', withTimezone: true }),
  cancelAtPeriodEnd: integer('cancel_at_period_end').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  // ensureColumn() additions:
  gateway: text('gateway').default('stripe'),
  razorpaySubscriptionId: text('razorpay_subscription_id'),
  razorpayCustomerId: text('razorpay_customer_id'),
  trialEndsAt: timestamp('trial_ends_at', { mode: 'string', withTimezone: true }),
});

export const userUsage = pgTable('user_usage', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  chatCount: integer('chat_count').notNull().default(0),
  imageCount: integer('image_count').notNull().default(0),
  videoCount: integer('video_count').notNull().default(0),
  creativeCount: integer('creative_count').notNull().default(0),
}, (t) => ({
  userPeriodUnq: unique('user_usage_user_period_unq').on(t.userId, t.period),
}));

export const autopilotAlerts = pgTable('autopilot_alerts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  severity: text('severity').notNull().default('info'),
  read: integer('read').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const automations = pgTable('automations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id'),
  name: text('name').notNull(),
  triggerType: text('trigger_type').notNull(),
  triggerValue: text('trigger_value'),
  actionType: text('action_type').notNull(),
  actionValue: text('action_value'),
  isActive: integer('is_active').notNull().default(1),
  lastTriggered: timestamp('last_triggered', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const creativeSprints = pgTable('creative_sprints', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id'),
  name: text('name').notNull(),
  status: text('status').notNull().default('analyzing'),
  plan: text('plan'),
  learnSnapshot: text('learn_snapshot'),
  totalCreatives: integer('total_creatives').default(0),
  completedCreatives: integer('completed_creatives').default(0),
  failedCreatives: integer('failed_creatives').default(0),
  estimatedCostCents: integer('estimated_cost_cents').default(0),
  actualCostCents: integer('actual_cost_cents').default(0),
  currency: text('currency').default('USD'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const creativeJobs = pgTable('creative_jobs', {
  id: text('id').primaryKey(),
  sprintId: text('sprint_id').notNull().references(() => creativeSprints.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  format: text('format').notNull(),
  status: text('status').default('pending'),
  priority: integer('priority').default(0),
  script: text('script'),
  apiProvider: text('api_provider'),
  apiJobId: text('api_job_id'),
  outputUrl: text('output_url'),
  outputThumbnail: text('output_thumbnail'),
  predictedScore: real('predicted_score'),
  dnaTags: text('dna_tags'),
  costCents: integer('cost_cents').default(0),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
  startedAt: timestamp('started_at', { mode: 'string', withTimezone: true }),
  completedAt: timestamp('completed_at', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
}, (t) => ({
  sprintIdx: index('creative_jobs_sprint_idx').on(t.sprintId),
  statusIdx: index('creative_jobs_status_idx').on(t.status, t.priority.desc()),
}));

export const creativeAssets = pgTable('creative_assets', {
  id: text('id').primaryKey(),
  jobId: text('job_id').references(() => creativeJobs.id),
  sprintId: text('sprint_id'),
  userId: text('user_id').notNull(),
  accountId: text('account_id'),
  format: text('format').notNull(),
  name: text('name').notNull(),
  assetUrl: text('asset_url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  metaAdId: text('meta_ad_id'),
  metaCampaignId: text('meta_campaign_id'),
  dnaTags: text('dna_tags'),
  predictedScore: real('predicted_score'),
  actualMetrics: text('actual_metrics'),
  metricsFetchedAt: timestamp('metrics_fetched_at', { mode: 'string', withTimezone: true }),
  status: text('status').default('draft'),
  publishedAt: timestamp('published_at', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const costLedger = pgTable('cost_ledger', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  sprintId: text('sprint_id'),
  jobId: text('job_id'),
  apiProvider: text('api_provider').notNull(),
  operation: text('operation').notNull(),
  costCents: integer('cost_cents').notNull(),
  metadata: text('metadata'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const contentBank = pgTable('content_bank', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  contentType: text('content_type').notNull().default('post'),
  title: text('title'),
  body: text('body').notNull(),
  hashtags: text('hashtags'),
  mediaNotes: text('media_notes'),
  status: text('status').notNull().default('draft'),
  scheduledFor: timestamp('scheduled_for', { mode: 'string', withTimezone: true }),
  postedAt: timestamp('posted_at', { mode: 'string', withTimezone: true }),
  source: text('source').default('ai'),
  generationContext: text('generation_context'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).defaultNow(),
}, (t) => ({
  userIdx: index('content_bank_user_idx').on(t.userId, t.status),
  platformIdx: index('content_bank_platform_idx').on(t.userId, t.platform),
}));

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  source: text('source').notNull().default('hero'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  referrer: text('referrer'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
}, (t) => ({
  emailIdx: index('leads_email_idx').on(t.email),
}));

// Landing-page waitlist capture. Ported from the runtime CREATE TABLE that
// formerly lived in index.ts (DB-2 M2.6): pain_points/interested_features hold
// JSON.stringify'd arrays, so they stay text() per the porting rules.
export const waitlistLeads = pgTable('waitlist_leads', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  company: text('company'),
  role: text('role'),
  adSpend: text('ad_spend'),
  teamSize: text('team_size'),
  painPoints: text('pain_points'),
  interestedFeatures: text('interested_features'),
  source: text('source').default('waitlist'),
  referrer: text('referrer'),
  signedUpAt: timestamp('signed_up_at', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const dnaCache = pgTable('dna_cache', {
  adId: text('ad_id').primaryKey(),
  accountId: text('account_id').notNull(),
  adName: text('ad_name'),
  hook: text('hook').notNull().default('[]'),
  visual: text('visual').notNull().default('[]'),
  audio: text('audio').notNull().default('[]'),
  reasoning: text('reasoning'),
  analyzedAt: timestamp('analyzed_at', { mode: 'string', withTimezone: true }).defaultNow(),
  visualAnalysis: text('visual_analysis').default('{}'),
}, (t) => ({
  accountIdx: index('dna_cache_account_idx').on(t.accountId),
}));

export const agentRuns = pgTable('agent_runs', {
  id: text('id').primaryKey(),
  agentType: text('agent_type').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('running'),
  startedAt: timestamp('started_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { mode: 'string', withTimezone: true }),
  summary: text('summary'),
  rawContext: text('raw_context'),
}, (t) => ({
  userIdx: index('agent_runs_user_idx').on(t.userId, t.agentType),
}));

export const agentDecisions = pgTable('agent_decisions', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id'),
  type: text('type').notNull(),
  targetId: text('target_id'),
  targetName: text('target_name'),
  reasoning: text('reasoning').notNull(),
  confidence: text('confidence').notNull().default('moderate'),
  urgency: text('urgency').notNull().default('medium'),
  suggestedAction: text('suggested_action').notNull(),
  estimatedImpact: text('estimated_impact'),
  status: text('status').notNull().default('pending'),
  approvedAt: timestamp('approved_at', { mode: 'string', withTimezone: true }),
  executedAt: timestamp('executed_at', { mode: 'string', withTimezone: true }),
  outcomeCheckedAt: timestamp('outcome_checked_at', { mode: 'string', withTimezone: true }),
  outcome: text('outcome'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  runIdx: index('agent_decisions_run_idx').on(t.runId),
  userIdx: index('agent_decisions_user_idx').on(t.userId, t.status),
}));

export const agentCoreMemory = pgTable('agent_core_memory', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  agentType: text('agent_type').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique('agent_core_memory_unq').on(t.userId, t.agentType, t.key),
}));

export const agentEpisodes = pgTable('agent_episodes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  agentType: text('agent_type').notNull(),
  event: text('event').notNull(),
  context: text('context'),
  outcome: text('outcome'),
  entities: text('entities'),
  relevanceScore: real('relevance_score').notNull().default(1.0),
  reinforcementCount: integer('reinforcement_count').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('agent_episodes_user_idx').on(t.userId, t.agentType),
}));

export const agentEntities = pgTable('agent_entities', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityName: text('entity_name').notNull(),
  attributes: text('attributes'),
  mentionCount: integer('mention_count').notNull().default(1),
  firstSeen: timestamp('first_seen', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq: unique('agent_entities_unq').on(t.userId, t.entityType, t.entityName),
  userIdx: index('agent_entities_user_idx').on(t.userId, t.entityType),
}));

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'string', withTimezone: true }).notNull(),
  used: integer('used').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  hashIdx: index('password_reset_tokens_hash_idx').on(t.tokenHash),
}));

export const swipeFile = pgTable('swipe_file', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  brand: text('brand').notNull().default(''),
  thumbnail: text('thumbnail'),
  hookDna: text('hook_dna').notNull().default('[]'),
  visualDna: text('visual_dna').notNull().default('[]'),
  audioDna: text('audio_dna').notNull().default('[]'),
  notes: text('notes'),
  sourceUrl: text('source_url'),
  sourceAdId: text('source_ad_id'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('swipe_file_user_idx').on(t.userId),
}));

export const teamMembers = pgTable('team_members', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  memberUserId: text('member_user_id').references(() => users.id, { onDelete: 'set null' }),
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').notNull().default('viewer'),
  status: text('status').notNull().default('pending'),
  invitedAt: timestamp('invited_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { mode: 'string', withTimezone: true }),
  revokedAt: timestamp('revoked_at', { mode: 'string', withTimezone: true }),
}, (t) => ({
  ownerEmailUnq: uniqueIndex('team_members_owner_email_idx').on(t.ownerUserId, t.email),
  memberIdx: index('team_members_member_idx').on(t.memberUserId),
}));

export const teamInvitations = pgTable('team_invitations', {
  id: text('id').primaryKey(),
  teamMemberId: text('team_member_id').notNull().references(() => teamMembers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'string', withTimezone: true }).notNull(),
  used: integer('used').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tokenIdx: index('team_invitations_token_idx').on(t.tokenHash),
}));

export const tiktokTokens = pgTable('tiktok_tokens', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  advertiserId: text('advertiser_id'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const shopifyTokens = pgTable('shopify_tokens', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  shopDomain: text('shop_domain').notNull(),
  shopName: text('shop_name'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const urlAnalysisCache = pgTable('url_analysis_cache', {
  url: text('url').primaryKey(),
  resultJson: text('result_json').notNull(),
  analyzedAt: timestamp('analyzed_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const studioGenerations = pgTable('studio_generations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  briefJson: text('brief_json').notNull(),
  formats: text('formats').notNull(),
  metaAccountId: text('meta_account_id'),
  status: text('status').notNull().default('generating'),
  // Creative Studio (M4) — populated when generation runs through the ai-layer pipeline.
  aiJobId: text('ai_job_id'),                          // durable link to the ai-layer job
  stage: text('stage'),                                // latest milestone ("Brand kit decided")
  progressJson: text('progress_json').default('[]'),   // all milestones (text JSON)
  brandKitJson: text('brand_kit_json'),                // AI brand kit (palette/tone/logo)
  winnersJson: text('winners_json'),                   // pulled Meta winning-creative refs
  costCents: integer('cost_cents').default(0),         // rolled-up run cost (display only)
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const studioOutputs = pgTable('studio_outputs', {
  id: text('id').primaryKey(),
  generationId: text('generation_id').notNull().references(() => studioGenerations.id),
  format: text('format').notNull(),
  status: text('status').notNull().default('pending'),
  outputJson: text('output_json'),
  costCents: integer('cost_cents').default(0),
  errorMessage: text('error_message'),
  assetUrl: text('asset_url'),                         // first-class proxied URL (publish path)
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  scoreJson: text('score_json'),
}, (t) => ({
  genIdx: index('studio_outputs_gen_idx').on(t.generationId),
}));

export const scorePredictions = pgTable('score_predictions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  studioOutputId: text('studio_output_id'),
  format: text('format').notNull(),
  dnaTags: text('dna_tags'),
  predictedScore: real('predicted_score').notNull(),
  predictedRoasMid: real('predicted_roas_mid'),
  scoreBreakdown: text('score_breakdown').notNull(),
  confidence: text('confidence').notNull(),
  actualRoas: real('actual_roas'),
  actualCtr: real('actual_ctr'),
  accuracyError: real('accuracy_error'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
  resolvedAt: timestamp('resolved_at', { mode: 'string', withTimezone: true }),
}, (t) => ({
  userIdx: index('score_predictions_user_idx').on(t.userId),
  unresolvedIdx: index('score_predictions_unresolved_idx').on(t.resolvedAt).where(sql`resolved_at IS NULL`),
}));

export const activityLog = pgTable('activity_log', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  category: text('category').notNull().default('general'),
  details: text('details'),
  ip: text('ip'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('activity_log_user_idx').on(t.userId, t.createdAt.desc()),
}));

export const creativeBriefs = pgTable('creative_briefs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  productName: text('product_name').notNull(),
  productId: text('product_id'),
  format: text('format').notNull(),
  length: text('length'),
  hookSuggestion: text('hook_suggestion').notNull(),
  ctaSuggestion: text('cta_suggestion'),
  reasoning: text('reasoning').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('creative_briefs_user_idx').on(t.userId),
  accountIdx: index('creative_briefs_account_idx').on(t.accountId),
}));

/* ====================================================================== */
/*  THE BRIDGE SERVICE — Client profiles & agent stores                    */
/* ====================================================================== */

export const serviceClients = pgTable('service_clients', {
  id: text('id').primaryKey(),
  brandName: text('brand_name').notNull(),
  category: text('category'),
  revenueLevel: text('revenue_level'),
  pricePointMin: integer('price_point_min'),
  pricePointMax: integer('price_point_max'),
  metaAdAccountId: text('meta_ad_account_id'),
  shopifyStore: text('shopify_store'),
  slackChannel: text('slack_channel'),
  whatsappNumber: text('whatsapp_number'),
  alertThreshold: integer('alert_threshold').default(1000),
  serviceTier: text('service_tier').default('done_for_you'),
  contractStart: timestamp('contract_start', { mode: 'string', withTimezone: true }),
  contractEnd: timestamp('contract_end', { mode: 'string', withTimezone: true }),
  monthlyFee: integer('monthly_fee'),
  status: text('status').default('active'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index('service_clients_status_idx').on(t.status),
}));

export const competitorIntelStore = pgTable('competitor_intel_store', {
  clientId: text('client_id').primaryKey().references(() => serviceClients.id, { onDelete: 'cascade' }),
  referencesShown: text('references_shown').default('[]'),
  outcomes: text('outcomes').default('{}'),
  clientCreativeStyle: text('client_creative_style'),
  searchQueriesUsed: text('search_queries_used').default('[]'),
  lastScrapeAt: timestamp('last_scrape_at', { mode: 'string', withTimezone: true }),
  lastReportAt: timestamp('last_report_at', { mode: 'string', withTimezone: true }),
  totalReferencesGiven: integer('total_references_given').default(0),
  successfulAdoptions: integer('successful_adoptions').default(0),
});

export const oosAgentStore = pgTable('oos_agent_store', {
  clientId: text('client_id').primaryKey().references(() => serviceClients.id, { onDelete: 'cascade' }),
  productCatalogHash: text('product_catalog_hash'),
  lastCheckAt: timestamp('last_check_at', { mode: 'string', withTimezone: true }),
  knownOosProducts: text('known_oos_products').default('[]'),
  cumulativeWaste: real('cumulative_waste').default(0),
  alertsSent: integer('alerts_sent').default(0),
  lastAlertAt: timestamp('last_alert_at', { mode: 'string', withTimezone: true }),
});

export const discountAgentStore = pgTable('discount_agent_store', {
  clientId: text('client_id').primaryKey().references(() => serviceClients.id, { onDelete: 'cascade' }),
  activeCodes: text('active_codes').default('[]'),
  leakedCodes: text('leaked_codes').default('[]'),
  couponSitesChecked: text('coupon_sites_checked').default('[]'),
  marginImpactTotal: real('margin_impact_total').default(0),
  lastScanAt: timestamp('last_scan_at', { mode: 'string', withTimezone: true }),
  alertsSent: integer('alerts_sent').default(0),
});

export const creativeAgentStore = pgTable('creative_agent_store', {
  clientId: text('client_id').primaryKey().references(() => serviceClients.id, { onDelete: 'cascade' }),
  winningHooks: text('winning_hooks').default('[]'),
  fatiguedCreatives: text('fatigued_creatives').default('[]'),
  formatPerformance: text('format_performance').default('{}'),
  hookPerformance: text('hook_performance').default('{}'),
  lastAnalysisAt: timestamp('last_analysis_at', { mode: 'string', withTimezone: true }),
  creativeCountAnalyzed: integer('creative_count_analyzed').default(0),
});

export const agentRecommendations = pgTable('agent_recommendations', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => serviceClients.id, { onDelete: 'cascade' }),
  agentType: text('agent_type').notNull(),
  recommendationType: text('recommendation_type').notNull(),
  recommendationData: text('recommendation_data').notNull(),
  deliveredVia: text('delivered_via'),
  deliveredAt: timestamp('delivered_at', { mode: 'string', withTimezone: true }),
  outcomeStatus: text('outcome_status').default('pending'),
  outcomeData: text('outcome_data'),
  outcomeRecordedAt: timestamp('outcome_recorded_at', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index('agent_recommendations_client_idx').on(t.clientId),
  agentIdx: index('agent_recommendations_agent_idx').on(t.agentType),
  pendingIdx: index('agent_recommendations_pending_idx').on(t.outcomeStatus).where(sql`outcome_status = 'pending'`),
}));

export const clientReports = pgTable('client_reports', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => serviceClients.id, { onDelete: 'cascade' }),
  reportType: text('report_type').notNull(),
  reportData: text('report_data').notNull(),
  htmlPath: text('html_path'),
  deliveredVia: text('delivered_via'),
  deliveredAt: timestamp('delivered_at', { mode: 'string', withTimezone: true }),
  openedAt: timestamp('opened_at', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index('client_reports_client_idx').on(t.clientId),
}));

/* ====================================================================== */
/*  INTELLIGENCE INFRASTRUCTURE                                            */
/* ====================================================================== */

export const intelligencePredictions = pgTable('intelligence_predictions', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  prediction: text('prediction').notNull(),
  predictedOutcome: text('predicted_outcome').notNull(),
  predictedValue: real('predicted_value'),
  confidence: real('confidence').notNull(),
  timeframe: text('timeframe').notNull(),
  evidenceUsed: text('evidence_used').default('[]'),
  insightType: text('insight_type').notNull(),
  verificationDate: timestamp('verification_date', { mode: 'string', withTimezone: true }),
  actualOutcome: text('actual_outcome'),
  actualValue: real('actual_value'),
  wasAccurate: integer('was_accurate'),
  accuracyScore: real('accuracy_score'),
  actionTaken: text('action_taken'),
}, (t) => ({
  clientIdx: index('intelligence_predictions_client_idx').on(t.clientId),
  unverifiedIdx: index('intelligence_predictions_unverified_idx').on(t.verificationDate).where(sql`verification_date IS NULL`),
}));

export const intelligenceRecommendations = pgTable('intelligence_recommendations', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  type: text('type').notNull(),
  headline: text('headline').notNull(),
  recommendation: text('recommendation').notNull(),
  confidence: real('confidence').notNull(),
  urgency: text('urgency').notNull(),
  wasViewed: integer('was_viewed').default(0),
  viewedAt: timestamp('viewed_at', { mode: 'string', withTimezone: true }),
  wasActedUpon: integer('was_acted_upon').default(0),
  actedUponAt: timestamp('acted_upon_at', { mode: 'string', withTimezone: true }),
  actionTaken: text('action_taken'),
  outcomeTracked: integer('outcome_tracked').default(0),
  outcomePositive: integer('outcome_positive'),
  outcomeNotes: text('outcome_notes'),
  operatorRating: integer('operator_rating'),
  operatorFeedback: text('operator_feedback'),
  markedAsObvious: integer('marked_as_obvious').default(0),
  markedAsUseless: integer('marked_as_useless').default(0),
  markedAsNonObvious: integer('marked_as_non_obvious').default(0),
  validatedAt: timestamp('validated_at', { mode: 'string', withTimezone: true }),
  validationScore: real('validation_score'),
}, (t) => ({
  clientIdx: index('intelligence_recommendations_client_idx').on(t.clientId),
  unviewedIdx: index('intelligence_recommendations_unviewed_idx').on(t.wasViewed).where(sql`was_viewed = 0`),
}));

export const operatorFeedback = pgTable('operator_feedback', {
  id: text('id').primaryKey(),
  recommendationId: text('recommendation_id').notNull(),
  clientId: text('client_id').notNull(),
  operatorId: text('operator_id').notNull(),
  submittedAt: timestamp('submitted_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  rating: integer('rating').notNull(),
  ratingDimensions: text('rating_dimensions'),
  feedbackType: text('feedback_type').notNull(),
  freeformFeedback: text('freeform_feedback'),
  operatorCorrection: text('operator_correction'),
  operatorAlternative: text('operator_alternative'),
  disagreedWith: text('disagreed_with'),
  disagreementReason: text('disagreement_reason'),
  shouldHaveKnown: integer('should_have_known').default(0),
  alreadyDidThis: integer('already_did_this').default(0),
  willTryThis: integer('will_try_this').default(0),
}, (t) => ({
  clientIdx: index('operator_feedback_client_idx').on(t.clientId),
  recommendationIdx: index('operator_feedback_recommendation_idx').on(t.recommendationId),
}));

export const operatorBehavior = pgTable('operator_behavior', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  operatorId: text('operator_id').notNull(),
  timestamp: timestamp('timestamp', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  eventType: text('event_type').notNull(),
  context: text('context').notNull(),
  itemId: text('item_id'),
  itemType: text('item_type'),
  action: text('action'),
  duration: integer('duration'),
  metadata: text('metadata'),
}, (t) => ({
  operatorIdx: index('operator_behavior_operator_idx').on(t.clientId, t.operatorId),
  typeIdx: index('operator_behavior_type_idx').on(t.eventType),
}));

export const operatorProfiles = pgTable('operator_profiles', {
  operatorId: text('operator_id').notNull(),
  clientId: text('client_id').notNull(),
  lastUpdated: timestamp('last_updated', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  preferredTimes: text('preferred_times').default('[]'),
  avgSessionDuration: real('avg_session_duration').default(0),
  sessionsPerWeek: real('sessions_per_week').default(0),
  preferredInsightTypes: text('preferred_insight_types').default('[]'),
  ignoredInsightTypes: text('ignored_insight_types').default('[]'),
  preferredDetailLevel: text('preferred_detail_level').default('summary'),
  urgencyThreshold: text('urgency_threshold').default('all'),
  avgDecisionTime: real('avg_decision_time').default(0),
  actionRate: real('action_rate').default(0),
  feedbackRate: real('feedback_rate').default(0),
  learningVelocity: text('learning_velocity').default('moderate'),
  trustLevel: text('trust_level').default('growing'),
  shouldSimplify: integer('should_simplify').default(0),
  wantsMoreDetail: integer('wants_more_detail').default(0),
  prefersVisual: integer('prefers_visual').default(0),
  needsUrgency: integer('needs_urgency').default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.operatorId, t.clientId] }),
}));

export const intelligenceMetrics = pgTable('intelligence_metrics', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  period: text('period').notNull(),
  generatedAt: timestamp('generated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  recommendationUsefulness: real('recommendation_usefulness').default(0),
  strategicAccuracy: real('strategic_accuracy').default(0),
  operatorTrust: real('operator_trust').default(0),
  wowFactorScore: real('wow_factor_score').default(0),
  insightUniqueness: real('insight_uniqueness').default(0),
  predictionUsefulness: real('prediction_usefulness').default(0),
  executionLeverage: real('execution_leverage').default(0),
  decisionQualityImprovement: real('decision_quality_improvement').default(0),
  insightAdoptionRate: real('insight_adoption_rate').default(0),
  recommendationFollowThrough: real('recommendation_follow_through').default(0),
  decisionSpeedImprovement: real('decision_speed_improvement').default(0),
  creativeHitRateImprovement: real('creative_hit_rate_improvement').default(0),
  overallScore: real('overall_score').default(0),
  trend: text('trend').default('stable'),
  riskFlags: text('risk_flags').default('[]'),
}, (t) => ({
  clientIdx: index('intelligence_metrics_client_idx').on(t.clientId, t.period),
}));

export const competitorSnapshots = pgTable('competitor_snapshots', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  competitorName: text('competitor_name').notNull(),
  competitorId: text('competitor_id'),
  capturedAt: timestamp('captured_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  activeAds: integer('active_ads').default(0),
  estimatedSpend: real('estimated_spend'),
  topFormats: text('top_formats').default('[]'),
  topAngles: text('top_angles').default('[]'),
  offers: text('offers').default('[]'),
  newCreatives: integer('new_creatives').default(0),
  killedCreatives: integer('killed_creatives').default(0),
}, (t) => ({
  clientIdx: index('competitor_snapshots_client_idx').on(t.clientId, t.competitorName),
}));

export const competitorMovements = pgTable('competitor_movements', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  detectedAt: timestamp('detected_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  competitorName: text('competitor_name').notNull(),
  competitorId: text('competitor_id'),
  movementType: text('movement_type').notNull(),
  description: text('description').notNull(),
  significance: text('significance').notNull(),
  evidence: text('evidence').default('[]'),
  implications: text('implications').default('[]'),
  suggestedResponse: text('suggested_response'),
  responseUrgency: text('response_urgency').default('monitor'),
  firstMoverWindow: text('first_mover_window'),
  acknowledged: integer('acknowledged').default(0),
  responseAction: text('response_action'),
}, (t) => ({
  clientIdx: index('competitor_movements_client_idx').on(t.clientId),
  unackIdx: index('competitor_movements_unack_idx').on(t.acknowledged).where(sql`acknowledged = 0`),
}));

/* ====================================================================== */
/*  CREATIVE INTELLIGENCE                                                  */
/* ====================================================================== */

export const creativeQualityScores = pgTable('creative_quality_scores', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  creativeId: text('creative_id').notNull(),
  scoredAt: timestamp('scored_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  sophisticationScore: real('sophistication_score').default(0),
  typographyScore: real('typography_score').default(0),
  emotionalImpactScore: real('emotional_impact_score').default(0),
  brandConsistencyScore: real('brand_consistency_score').default(0),
  aiArtifactScore: real('ai_artifact_score').default(0),
  layoutIntelligenceScore: real('layout_intelligence_score').default(0),
  competitorBenchmarkScore: real('competitor_benchmark_score').default(0),
  overallQualityScore: real('overall_quality_score').default(0),
  autoRejected: integer('auto_rejected').default(0),
  rejectionReasons: text('rejection_reasons').default('[]'),
  benchmarkCreativeIds: text('benchmark_creative_ids').default('[]'),
  humanOverride: integer('human_override').default(0),
  humanScore: real('human_score'),
}, (t) => ({
  clientIdx: index('creative_quality_scores_client_idx').on(t.clientId),
  creativeIdx: index('creative_quality_scores_creative_idx').on(t.creativeId),
}));

export const creativeEvolution = pgTable('creative_evolution', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  recordedAt: timestamp('recorded_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  dimension: text('dimension').notNull(),
  previousState: text('previous_state'),
  newState: text('new_state'),
  triggerSignals: text('trigger_signals').default('[]'),
  confidence: real('confidence').default(0),
  applied: integer('applied').default(0),
  outcome: text('outcome'),
}, (t) => ({
  clientIdx: index('creative_evolution_client_idx').on(t.clientId, t.dimension),
}));

export const creativeIntelligenceContext = pgTable('creative_intelligence_context', {
  clientId: text('client_id').primaryKey(),
  lastUpdated: timestamp('last_updated', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  fatigueSignals: text('fatigue_signals').default('{}'),
  ltvSignals: text('ltv_signals').default('{}'),
  cohortSignals: text('cohort_signals').default('{}'),
  competitorSignals: text('competitor_signals').default('{}'),
  audienceSignals: text('audience_signals').default('{}'),
  retentionSignals: text('retention_signals').default('{}'),
  emotionalSignals: text('emotional_signals').default('{}'),
  pricingSignals: text('pricing_signals').default('{}'),
  productSignals: text('product_signals').default('{}'),
  performanceSignals: text('performance_signals').default('{}'),
  synthesisOutput: text('synthesis_output').default('{}'),
  nextCreativeRecommendation: text('next_creative_recommendation'),
});

export const creativeCategoryKnowledge = pgTable('creative_category_knowledge', {
  category: text('category').primaryKey(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  aestheticPatterns: text('aesthetic_patterns').default('[]'),
  typographyPatterns: text('typography_patterns').default('[]'),
  hookPatterns: text('hook_patterns').default('[]'),
  emotionalTriggers: text('emotional_triggers').default('[]'),
  pricingPsychology: text('pricing_psychology').default('{}'),
  trustStructures: text('trust_structures').default('[]'),
  visualHierarchy: text('visual_hierarchy').default('[]'),
  benchmarkBrands: text('benchmark_brands').default('[]'),
  antiPatterns: text('anti_patterns').default('[]'),
});

/* ====================================================================== */
/*  COMMENT MINING                                                         */
/* ====================================================================== */

export const commentMiningReports = pgTable('comment_mining_reports', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  report: text('report').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index('comment_mining_reports_client_idx').on(t.clientId, t.createdAt.desc()),
}));

export const classifiedComments = pgTable('classified_comments', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  source: text('source').notNull(),
  sourceId: text('source_id').notNull(),
  text: text('text').notNull(),
  category: text('category').notNull(),
  emotionalTriggers: text('emotional_triggers').default('[]'),
  keyPhrases: text('key_phrases').default('[]'),
  intensity: text('intensity').default('low'),
  creativeRelevance: integer('creative_relevance').default(0),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index('classified_comments_client_idx').on(t.clientId, t.category),
}));

/* ====================================================================== */
/*  CLOSED-LOOP OPERATING SYSTEM                                           */
/* ====================================================================== */

export const recommendations = pgTable('recommendations', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  agentId: text('agent_id').notNull(),
  type: text('type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  entityName: text('entity_name').notNull(),
  action: text('action').notNull(),
  reasoning: text('reasoning').notNull(),
  evidence: text('evidence').default('[]'),
  confidence: integer('confidence').notNull().default(50),
  predictedOutcome: text('predicted_outcome').notNull(),
  predictedMetric: text('predicted_metric').notNull(),
  predictedValue: real('predicted_value').notNull(),
  predictedDirection: text('predicted_direction').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  executedAt: timestamp('executed_at', { mode: 'string', withTimezone: true }),
  validatedAt: timestamp('validated_at', { mode: 'string', withTimezone: true }),
  actualOutcome: text('actual_outcome'),
  actualValue: real('actual_value'),
  predictionAccurate: integer('prediction_accurate'),
  accuracyScore: integer('accuracy_score'),
}, (t) => ({
  clientIdx: index('recommendations_client_idx').on(t.clientId, t.status),
  entityIdx: index('recommendations_entity_idx').on(t.entityId, t.status),
  pendingIdx: index('recommendations_pending_idx').on(t.status).where(sql`status = 'pending'`),
  validationIdx: index('recommendations_validation_idx').on(t.status, t.executedAt).where(sql`status = 'executed'`),
}));

export const predictionAccuracy = pgTable('prediction_accuracy', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  agentId: text('agent_id').notNull(),
  recommendationType: text('recommendation_type').notNull(),
  entityType: text('entity_type').notNull(),
  predictedValue: real('predicted_value').notNull(),
  actualValue: real('actual_value').notNull(),
  accuracyScore: integer('accuracy_score').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  agentIdx: index('prediction_accuracy_agent_idx').on(t.clientId, t.agentId),
  typeIdx: index('prediction_accuracy_type_idx').on(t.recommendationType),
}));

export const entityStateSnapshots = pgTable('entity_state_snapshots', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  stateJson: text('state_json').notNull(),
  capturedAt: timestamp('captured_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  snapshotIdx: index('entity_state_snapshots_idx').on(t.clientId, t.entityId),
}));

/* ====================================================================== */
/*  10 LOCKED AI TABLES (ported verbatim from the M1 blueprint)            */
/*  See dev_reports/26_05/hidden_ai_tables_schema.md                       */
/* ====================================================================== */

// A0: conformed to the app's write contract (ad-watchdog.ts:695 runtime DDL +
// INSERT at :781). The app supplies its own TEXT id and a nullable client_id
// with no FK; spend is REAL. The earlier uuid/numeric/notNull+FK shape rejected
// those writes. Modernising back to uuid/array is a separate M2 ticket.
export const creativeAnalysis = pgTable('creative_analysis', {
  id: text('id').primaryKey(),
  clientId: text('client_id'),
  adId: text('ad_id'),
  adName: text('ad_name'),
  creativeType: text('creative_type'),
  hookText: text('hook_text'),
  hookPattern: text('hook_pattern'),
  ctr: real('ctr'),
  spend: real('spend'),
  impressions: integer('impressions'),
  imageUrl: text('image_url'),
  videoId: text('video_id'),
  analyzedAt: timestamp('analyzed_at', { mode: 'string', withTimezone: true }).defaultNow(),
}, (t) => ({
  clientIdx: index('creative_analysis_client_idx').on(t.clientId),
}));

export const decisionTraces = pgTable('decision_traces', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  decisionId: text('decision_id'),
  steps: jsonb('steps'),
  evidence: jsonb('evidence'),
  alternatives: jsonb('alternatives'),
  finalAction: text('final_action'),
  finalTarget: text('final_target'),
  finalConfidence: real('final_confidence'),
  finalReasoning: text('final_reasoning'),
  totalDuration: integer('total_duration'),
  dataSources: jsonb('data_sources'),
  synthesisDepth: integer('synthesis_depth'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const evaluationMetrics = pgTable('evaluation_metrics', {
  date: timestamp('date', { mode: 'string' }).notNull(),
  clientId: text('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  decisionsGenerated: integer('decisions_generated'),
  decisionsPassed: integer('decisions_passed'),
  decisionsFiltered: integer('decisions_filtered'),
  avgConfidence: real('avg_confidence'),
  contradictionsDetected: integer('contradictions_detected'),
  humanReviewsCreated: integer('human_reviews_created'),
  humanReviewsResolved: integer('human_reviews_resolved'),
  humanReviewsPending: integer('human_reviews_pending'),
  predictionsGenerated: integer('predictions_generated'),
  predictionsVerified: integer('predictions_verified'),
  predictionsCorrect: integer('predictions_correct'),
  predictionAccuracyRate: real('prediction_accuracy_rate'),
  filterRate: real('filter_rate'),
  evidenceQualityAvg: real('evidence_quality_avg'),
  synthesisDepthAvg: real('synthesis_depth_avg'),
  avgDecisionTime: real('avg_decision_time'),
}, (t) => ({
  pk: primaryKey({ columns: [t.date, t.clientId] }),
}));

// A0: conformed to the app's write contract (pattern-transfer.ts:52 runtime DDL +
// INSERT at :132). The app supplies its own TEXT id and source_clients as a JSON
// STRING (not a Postgres text[]); confidence is REAL. The earlier uuid/array shape
// rejected those writes. Indexes mirror the runtime DDL.
export const globalPatterns = pgTable('global_patterns', {
  id: text('id').primaryKey(),
  pattern: text('pattern').notNull(),
  category: text('category').notNull(),
  confidence: real('confidence').notNull(),
  sourceClientCount: integer('source_client_count').notNull().default(1),
  sourceClients: text('source_clients').notNull(), // JSON string (app JSON.parses it)
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).defaultNow(),
}, (t) => ({
  unq: unique('global_patterns_pattern_category_unq').on(t.pattern, t.category),
  categoryIdx: index('global_patterns_category_idx').on(t.category),
  confidenceIdx: index('global_patterns_confidence_idx').on(t.confidence.desc()),
}));

export const humanReviews = pgTable('human_reviews', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type'),
  title: text('title'),
  description: text('description'),
  severity: text('severity'),
  relatedEntityId: text('related_entity_id'),
  relatedEntityType: text('related_entity_type'),
  status: text('status').default('pending'),
  resolution: text('resolution'),
  reviewedBy: text('reviewed_by').default('system'),
  reviewedAt: timestamp('reviewed_at', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const patternStore = pgTable('pattern_store', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type'),
  content: text('content'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const predictions = pgTable('predictions', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type'),
  predictionText: text('prediction_text'),
  confidence: real('confidence'),
  timeframe: text('timeframe'),
  expectedMetric: text('expected_metric'),
  expectedDirection: text('expected_direction'),
  expectedMinChange: real('expected_min_change'),
  expiresAt: timestamp('expires_at', { mode: 'string', withTimezone: true }),
  status: text('status').default('pending'),
  verifiedAt: timestamp('verified_at', { mode: 'string', withTimezone: true }),
  actualValue: real('actual_value'),
  actualChange: real('actual_change'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

// Externally populated orphans (READ ONLY)
export const creativeReturns = pgTable('creative_returns', {
  clientId: text('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  creativeId: text('creative_id').notNull(),
  creativeName: text('creative_name'),
  returnRate: real('return_rate'),
  refundAmount: real('refund_amount'),
  orderCount: integer('order_count'),
}, (t) => ({ unq: unique('creative_returns_unq').on(t.clientId, t.creativeId) }));

export const dailyMetrics = pgTable('daily_metrics', {
  clientId: text('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  metricName: text('metric_name').notNull(),
  value: real('value').notNull(),
  date: timestamp('date', { mode: 'string' }).notNull(),
}, (t) => ({ unq: unique('daily_metrics_unq').on(t.clientId, t.metricName, t.date) }));

export const ltvByCreative = pgTable('ltv_by_creative', {
  clientId: text('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  creativeId: text('creative_id').notNull(),
  creativeName: text('creative_name'),
  hookType: text('hook_type'),
  avgLtv: real('avg_ltv'),
  repeatRate: real('repeat_rate'),
  customerCount: integer('customer_count'),
}, (t) => ({ unq: unique('ltv_by_creative_unq').on(t.clientId, t.creativeId) }));

/* ====================================================================== */
/*  ORPHAN / RUNTIME-CREATED TABLES — ported for Phase 1 (additive parity) */
/*                                                                         */
/*  These 9 tables were created by runtime `CREATE TABLE IF NOT EXISTS`    */
/*  (services) and seed scripts, NOT in schema.ts — so they were absent    */
/*  from the migration-managed schema and the app would 500 on first read  */
/*  under Postgres. Ported AS-IS (no behavioural change). The runtime DDL  */
/*  paths were on SQLite; removed in M2 (DB-2). verified-real merges        */
/*  (brands→service_clients, strategic_*→predictions/recommendations/...)  */
/*  are deferred to M2 consolidation. agent_execution_log is intentionally  */
/*  NOT ported (write-only, zero readers — dropped in M2).                  */
/*  Date-range bounds on `audits` stay text() (preformatted strings) to    */
/*  avoid timezone coercion. frequency CHECK is enforced in app code.       */
/* ====================================================================== */

export const brands = pgTable('brands', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  category: text('category').notNull().default('other'),
  stage: text('stage').notNull().default('scaling'),
  metaAdAccountId: text('meta_ad_account_id'),
  pixelId: text('pixel_id'),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const brandContext = pgTable('brand_context', {
  brandId: text('brand_id').primaryKey().references(() => brands.id, { onDelete: 'cascade' }),
  pricePoint: text('price_point'),
  targetAudience: text('target_audience'),
  winningPatterns: text('winning_patterns').default('[]'), // JSON string
  failedApproaches: text('failed_approaches').default('[]'), // JSON string
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const audits = pgTable('audits', {
  id: text('id').primaryKey(),
  brandId: text('brand_id').notNull(), // no FK in source DDL
  brandName: text('brand_name').notNull(),
  dateRangeStart: text('date_range_start').notNull(),
  dateRangeEnd: text('date_range_end').notNull(),
  healthScore: integer('health_score'),
  wastedSpend: real('wasted_spend'),
  bestCpa: real('best_cpa'),
  worstCpa: real('worst_cpa'),
  topFindings: text('top_findings'),
  topPriority: text('top_priority'),
  confidenceLevel: text('confidence_level'),
  fullOutput: text('full_output'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const scheduledAudits = pgTable('scheduled_audits', {
  id: text('id').primaryKey(),
  brandId: text('brand_id').notNull().references(() => brands.id),
  brandName: text('brand_name').notNull(),
  frequency: text('frequency').notNull(),
  cronExpression: text('cron_expression').notNull(),
  datePreset: text('date_preset').notNull().default('last_30d'),
  enabled: integer('enabled').notNull().default(1),
  lastRunAt: timestamp('last_run_at', { mode: 'string', withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { mode: 'string', withTimezone: true }),
  runCount: integer('run_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).notNull().defaultNow(),
});

export const clientContexts = pgTable('client_contexts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  contextJson: text('context_json').notNull(), // JSON string
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const strategicReports = pgTable('strategic_reports', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  reportType: text('report_type').notNull(),
  generatedAt: timestamp('generated_at', { mode: 'string', withTimezone: true }).notNull(),
  weekNumber: integer('week_number'),
  year: integer('year'),
  dataJson: text('data_json').notNull(), // JSON string
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const strategicRecommendations = pgTable('strategic_recommendations', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  reportId: text('report_id'),
  recommendation: text('recommendation').notNull(),
  category: text('category'),
  priority: text('priority'),
  status: text('status').default('pending'),
  dataJson: text('data_json').notNull(), // JSON string
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const strategicRunningContext = pgTable('strategic_running_context', {
  clientId: text('client_id').primaryKey(),
  contextJson: text('context_json').notNull(), // JSON string
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).defaultNow(),
});

export const strategicPredictions = pgTable('strategic_predictions', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  reportId: text('report_id'),
  prediction: text('prediction').notNull(),
  status: text('status').default('pending'),
  dataJson: text('data_json').notNull(), // JSON string
  verifyAfter: timestamp('verify_after', { mode: 'string', withTimezone: true }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow(),
});
