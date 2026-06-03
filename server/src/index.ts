// IPv4-first DNS for all DB consumers — must precede any pg connection. See db/net-config.ts.
import './db/net-config.js';
import * as Sentry from '@sentry/node';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyBaseLogger } from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { closePgPool } from './db/pg.js';
import { getDbAdapter } from './db/adapter.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { adAccountRoutes } from './routes/ad-accounts.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { analyticsRoutes } from './routes/analytics.js';
import { brainRoutes } from './routes/brain.js';
import { directorRoutes } from './routes/director.js';
import { aiRoutes } from './routes/ai.js';
import { reportRoutes } from './routes/reports.js';
import { ugcRoutes } from './routes/ugc.js';
import { ugcWorkflowRoutes } from './routes/ugc-workflows.js';
import { brandRoutes } from './routes/brands.js';
import { assetRoutes } from './routes/assets.js';
import { automationRoutes } from './routes/automations.js';
import { campaignRoutes } from './routes/campaigns.js';
import { mediaGenRoutes } from './routes/media-gen.js';
import { billingRoutes } from './routes/billing.js';
import { autopilotRoutes } from './routes/autopilot.js';
import { competitorSpyRoutes } from './routes/competitor-spy.js';
import { googleAdsRoutes } from './routes/google-ads.js';
import { tiktokAdsRoutes } from './routes/tiktok-ads.js';
import { creativeEngineRoutes } from './routes/creative-engine.js';
import { contentRoutes } from './routes/content.js';
import { scoreRoutes } from './routes/score.js';
import { agentRoutes } from './routes/agent.js';
import { swipeFileRoutes } from './routes/swipe-file.js';
import { teamRoutes } from './routes/team.js';
import { creativeStudioRoutes } from './routes/creative-studio.js';
import { auditRoutes } from './routes/audits.js';
import { scheduleRoutes } from './routes/schedules.js';
import { adCommandRoutes } from './routes/ad-command.js';
import { shopifyRoutes } from './routes/shopify.js';
import { healthScoreRoutes } from './routes/health-score.js';
import { creativeScanRoutes } from './routes/creative-scan.js';
import { quickWinsRoutes } from './routes/quick-wins.js';
import { staticAdsRoutes } from './routes/static-ads.js';
import intelligenceRoutes from './routes/intelligence.js';
import { initializeScheduler } from './services/audit-scheduler.js';
import { usageLimiterPlugin } from './plugins/usage-limiter.js';
import { logger } from './utils/logger.js';
import { DailyCapExceededError, UpstreamRateLimitedError } from './services/llm-gateway.js';
import { correlationStore } from './utils/request-context.js';
import { registerPublicRoutes } from './boot/public-routes.js';
import { registerMetaCreativeRoutes } from './boot/meta-creative-routes.js';
import { registerAccountRoutes } from './boot/account-routes.js';

if (process.env['SENTRY_DSN']) {
  Sentry.init({
    dsn: process.env['SENTRY_DSN'],
    environment: config.nodeEnv,
    tracesSampleRate: 0,
  });
}

const app = Fastify({
  genReqId: () => randomUUID(),
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    ...(config.nodeEnv === 'production' ? {} : {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
  },
});

await app.register(cors, {
  origin: config.corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// Security headers
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: [
        "'self'",
        "https://api.anthropic.com",
        "https://graph.facebook.com",
        "https://graph.instagram.com",
        "https://api.razorpay.com",
        "https://api.stripe.com",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      frameSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'sameorigin',
  },
  noSniff: true,
  xssFilter: true,
});

// Rate limiting — 100 req/min per IP on AI and media endpoints
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  allowList: ['127.0.0.1'],
});

await app.register(authPlugin);
await app.register(usageLimiterPlugin);

// Global error handler — structured error responses for all routes
app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
  // LLM-gateway: per-user daily cap exceeded
  if (error instanceof DailyCapExceededError) {
    const resetsAt = new Date();
    resetsAt.setUTCHours(24, 0, 0, 0); // next midnight UTC
    return reply.status(429).send({
      success: false,
      error: 'daily_llm_cap',
      current_cents: error.cap.spent,
      cap_cents: error.cap.limit,
      remaining_cents: error.cap.remaining,
      resets_at: resetsAt.toISOString(),
    });
  }
  // LLM-gateway: upstream Anthropic rate-limit after SDK retries exhausted
  if (error instanceof UpstreamRateLimitedError) {
    reply.header('Retry-After', String(error.retryAfterSeconds));
    return reply.status(429).send({
      success: false,
      error: 'upstream_rate_limited',
      retry_after_seconds: error.retryAfterSeconds,
    });
  }

  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    logger.error({ err: error, url: request.url, method: request.method }, 'Internal server error');
    Sentry.captureException(error);
  }
  reply.status(statusCode).send({
    success: false,
    error: statusCode >= 500 ? 'Internal server error' : error.message,
    ...(config.nodeEnv !== 'production' && statusCode >= 500 ? { stack: error.stack } : {}),
  });
});

// Establish per-request correlation context (ALS) and bind inbound x-request-id.
app.addHook('onRequest', (request, _reply, done) => {
  const inbound = request.headers['x-request-id'];
  const parentRequestId = Array.isArray(inbound) ? inbound[0] : inbound;
  correlationStore.enterWith({ correlationId: request.id, parentRequestId });
  if (parentRequestId) {
    // Fastify types `request.log` as readonly; rebinding the child logger requires
    // a precise writable view rather than `any` (keeps the FastifyBaseLogger type).
    (request as { log: FastifyBaseLogger }).log = request.log.child({ parentRequestId });
  }
  done();
});

registerPublicRoutes(app);

// Register routes
await app.register(authRoutes, { prefix: '/auth' });
await app.register(adAccountRoutes, { prefix: '/ad-accounts' });
await app.register(dashboardRoutes, { prefix: '/dashboard' });
await app.register(analyticsRoutes, { prefix: '/analytics' });
await app.register(brainRoutes, { prefix: '/brain' });
await app.register(directorRoutes, { prefix: '/director' });
await app.register(aiRoutes, { prefix: '/ai' });
await app.register(reportRoutes, { prefix: '/reports' });
await app.register(ugcRoutes, { prefix: '/ugc' });
await app.register(ugcWorkflowRoutes);  // root-level UGC workflow routes
await app.register(brandRoutes, { prefix: '/brands' });
await app.register(assetRoutes, { prefix: '/assets' });
await app.register(automationRoutes, { prefix: '/automations' });
await app.register(campaignRoutes, { prefix: '/campaigns' });
await app.register(mediaGenRoutes, { prefix: '/media' });
await app.register(billingRoutes, { prefix: '/billing' });
await app.register(autopilotRoutes, { prefix: '/autopilot' });
await app.register(competitorSpyRoutes, { prefix: '/competitor-spy' });
await app.register(googleAdsRoutes, { prefix: '/google-ads' });
await app.register(tiktokAdsRoutes, { prefix: '/tiktok-ads' });
await app.register(creativeEngineRoutes, { prefix: '/creative-engine' });
await app.register(contentRoutes, { prefix: '/content' });
await app.register(scoreRoutes, { prefix: '/score' });
await app.register(agentRoutes, { prefix: '/agent' });
await app.register(swipeFileRoutes, { prefix: '/swipe-file' });
await app.register(teamRoutes, { prefix: '/team' });
await app.register(creativeStudioRoutes, { prefix: '/creative-studio' });
await app.register(auditRoutes, { prefix: '/audits' });
await app.register(scheduleRoutes, { prefix: '/schedules' });
await app.register(adCommandRoutes, { prefix: '/ad-command' });
await app.register(shopifyRoutes, { prefix: '/shopify' });
await app.register(healthScoreRoutes, { prefix: '/health-score' });
await app.register(creativeScanRoutes, { prefix: '/creative-scan' });
await app.register(quickWinsRoutes, { prefix: '/quick-wins' });
await app.register(staticAdsRoutes, { prefix: '/static-ads' });
await app.register(intelligenceRoutes);

// Initialize audit scheduler
try {
  await initializeScheduler();
} catch (error) {
  app.log.warn({ err: error }, 'Failed to initialize audit scheduler');
}

// Serve generated audio files from data/audio/
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname_index = dirname(fileURLToPath(import.meta.url));
const audioDir = join(__dirname_index, '../data/audio');
if (!existsSync(audioDir)) mkdirSync(audioDir, { recursive: true });
await app.register(fastifyStatic, {
  root: audioDir,
  prefix: '/audio/',
});

// Serve Angular frontend in production (when built into ../public)
const frontendDir = join(__dirname_index, '../public');
if (config.nodeEnv === 'production' && existsSync(frontendDir)) {
  await app.register(fastifyStatic, {
    root: frontendDir,
    prefix: '/',
    decorateReply: false,
    wildcard: false,
  });

  // SPA fallback: serve index.html for unmatched routes (Angular routing)
  app.setNotFoundHandler(async (_request, reply) => {
    return reply.sendFile('index.html', frontendDir);
  });

  logger.info({ path: frontendDir }, 'Serving frontend static files');
}

registerMetaCreativeRoutes(app);
registerAccountRoutes(app);

// Request timing hook
app.addHook('onResponse', (request, reply, done) => {
  const duration = reply.elapsedTime;
  if (duration > 2000) {
    request.log.warn({ url: request.url, method: request.method, duration: `${Math.round(duration)}ms` }, 'Slow request');
  }
  done();
});

// Frontend is served by Vercel — no static file serving needed here

// Initialize DB on startup
getDbAdapter();

const shutdown = async () => {
  await closePgPool();
  await app.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(`Cosmisk server running on port ${config.port}`);

  // Recover any sprints interrupted by previous server restart
  const { recoverInterruptedSprints } = await import('./services/job-queue.js');
  await recoverInterruptedSprints();
} catch (err: unknown) {
  logger.error(err);
  process.exit(1);
}
