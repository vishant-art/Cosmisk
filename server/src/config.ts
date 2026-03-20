import 'dotenv/config';

const env = process.env;

export const config = {
  port: parseInt(env['PORT'] || '3000', 10),
  jwtSecret: env['JWT_SECRET'] || 'dev-secret-change-me',
  metaAppId: env['META_APP_ID'] || '675224542133938',
  metaAppSecret: env['META_APP_SECRET'] || '',
  tokenEncryptionKey: env['TOKEN_ENCRYPTION_KEY'] || 'dev-encryption-key-change-me-now!',
  databasePath: env['DATABASE_PATH'] || './data/cosmisk.db',
  databaseUrl: env['DATABASE_URL'] || '', // PostgreSQL connection string (production)
  nodeEnv: env['NODE_ENV'] || 'development',
  graphApiVersion: 'v22.0',
  graphApiBase: 'https://graph.facebook.com/v22.0',
  anthropicApiKey: env['ANTHROPIC_API_KEY'] || '',
  geminiApiKey: env['GEMINI_API_KEY'] || '',
  nanoBananaApiKey: env['NANO_BANANA_API_KEY'] || '',
  n8nVideoWebhook: env['N8N_VIDEO_WEBHOOK'] || '',
  stripeSecretKey: env['STRIPE_SECRET_KEY'] || '',
  stripeWebhookSecret: env['STRIPE_WEBHOOK_SECRET'] || '',
  stripePriceSoloMonthly: env['STRIPE_PRICE_SOLO_MONTHLY'] || '',
  stripePriceSoloAnnual: env['STRIPE_PRICE_SOLO_ANNUAL'] || '',
  stripePriceGrowthMonthly: env['STRIPE_PRICE_GROWTH_MONTHLY'] || '',
  stripePriceGrowthAnnual: env['STRIPE_PRICE_GROWTH_ANNUAL'] || '',
  stripePriceAgencyMonthly: env['STRIPE_PRICE_AGENCY_MONTHLY'] || '',
  stripePriceAgencyAnnual: env['STRIPE_PRICE_AGENCY_ANNUAL'] || '',
  razorpayKeyId: env['RAZORPAY_KEY_ID'] || '',
  razorpayKeySecret: env['RAZORPAY_KEY_SECRET'] || '',
  razorpayWebhookSecret: env['RAZORPAY_WEBHOOK_SECRET'] || '',
  razorpayPlanSoloMonthly: env['RAZORPAY_PLAN_SOLO_MONTHLY'] || '',
  razorpayPlanSoloAnnual: env['RAZORPAY_PLAN_SOLO_ANNUAL'] || '',
  razorpayPlanGrowthMonthly: env['RAZORPAY_PLAN_GROWTH_MONTHLY'] || '',
  razorpayPlanGrowthAnnual: env['RAZORPAY_PLAN_GROWTH_ANNUAL'] || '',
  razorpayPlanAgencyMonthly: env['RAZORPAY_PLAN_AGENCY_MONTHLY'] || '',
  razorpayPlanAgencyAnnual: env['RAZORPAY_PLAN_AGENCY_ANNUAL'] || '',
  appUrl: env['APP_URL'] || 'http://localhost:4200',
  googleAdsClientId: env['GOOGLE_ADS_CLIENT_ID'] || '',
  googleAdsClientSecret: env['GOOGLE_ADS_CLIENT_SECRET'] || '',
  googleAdsDeveloperToken: env['GOOGLE_ADS_DEVELOPER_TOKEN'] || '',
  googleAdsRedirectUri: env['GOOGLE_ADS_REDIRECT_URI'] || '',
  tiktokAppId: env['TIKTOK_APP_ID'] || '',
  tiktokAppSecret: env['TIKTOK_APP_SECRET'] || '',
  fluxApiKey: env['FLUX_API_KEY'] || '',
  heygenApiKey: env['HEYGEN_API_KEY'] || '',
  klingApiKey: env['KLING_API_KEY'] || '',
  creatifyApiKey: env['CREATIFY_API_KEY'] || '',
  elevenLabsApiKey: env['ELEVENLABS_API_KEY'] || '',
  slackWebhookUrl: env['SLACK_WEBHOOK_URL'] || '',
  resendApiKey: env['RESEND_API_KEY'] || '',
  slackAppToken: env['SLACK_APP_TOKEN'] || '',
  slackSigningSecret: env['SLACK_SIGNING_SECRET'] || '',
  n8nBriefingWebhook: env['N8N_BRIEFING_WEBHOOK'] || '',
  alertEmailFrom: env['ALERT_EMAIL_FROM'] || 'alerts@cosmisk.ai',
  corsOrigins: [
    'http://localhost:4200',
    'https://cosmisk.ai',
    'https://www.cosmisk.ai',
    'https://app.cosmisk.ai',
    'https://cosmisk.vercel.app',
    'https://cosmisk.com',
    'https://www.cosmisk.com',
    env['FRONTEND_URL'] || '',
  ].filter(Boolean) as string[],
} as const;

// Refuse to start in production with default secrets
if (config.nodeEnv === 'production') {
  const defaults: [string, string][] = [
    ['jwtSecret', 'dev-secret-change-me'],
    ['tokenEncryptionKey', 'dev-encryption-key-change-me-now!'],
  ];
  for (const [key, defaultVal] of defaults) {
    if ((config as any)[key] === defaultVal) {
      console.error(`FATAL: ${key} is set to the default value. Set a secure value in production.`);
      process.exit(1);
    }
  }
}
