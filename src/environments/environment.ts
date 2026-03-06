export const environment = {
  production: false,
  N8N_BASE_URL: '/api',  // proxied to n8n-jeet.duckdns.org:5678/webhook
  META_APP_ID: '675224542133938',

  AUTH_LOGIN: 'auth/login',
  AUTH_SIGNUP: 'auth/signup',
  AUTH_META_OAUTH: 'auth/meta-oauth',
  AUTH_META_OAUTH_EXCHANGE: 'auth/meta-oauth/exchange',
  AUTH_META_STATUS: 'auth/meta-status',
  AUTH_META_DISCONNECT: 'auth/meta-disconnect',
  AUTH_REFRESH: 'auth/refresh',

  ONBOARD_CONNECT_META: 'onboarding/connect',
  ONBOARD_SCAN: 'onboarding/scan',
  ONBOARD_SET_GOALS: 'onboarding/goals',
  ONBOARD_COMPETITORS: 'onboarding/competitors',

  DASHBOARD_KPI: 'dashboard/kpis',
  DASHBOARD_CHART: 'dashboard/chart',
  DASHBOARD_INSIGHTS: 'dashboard/insights',
  DASHBOARD_TOP_CREATIVES: 'dashboard/top-creatives',

  CREATIVES_LIST: 'creatives/list',
  CREATIVES_DETAIL: 'creatives/detail',
  CREATIVES_DNA_ANALYZE: 'creatives/analyze',
  CREATIVES_RECOMMENDATIONS: 'creatives/recommendations',

  DIRECTOR_GENERATE_BRIEF: 'director/generate-brief',
  DIRECTOR_PUBLISH: 'director/auto-publish',

  UGC_PROJECTS: 'ugc/projects',
  UGC_PROJECT_DETAIL: 'ugc/project-detail',
  UGC_CONCEPTS: 'ugc/concepts',
  UGC_SCRIPTS: 'ugc/scripts',
  UGC_ONBOARD: 'ugc-onboarding',
  UGC_RESEARCH: 'ugc-phase1',
  UGC_APPROVE: 'ugc-concept-approval',
  UGC_WRITE_SCRIPTS: 'ugc-phase3',
  UGC_DELIVER: 'ugc-delivery',
  UGC_REVISE: 'ugc-script-revision',
  UGC_AVATARS: 'ugc/avatars',

  CAMPAIGNS_LIST: 'campaigns/list',
  CAMPAIGNS_CREATE: 'campaigns/create',
  CAMPAIGNS_UPDATE: 'campaigns/update',
  CAMPAIGNS_LAUNCH: 'campaigns/launch',
  CAMPAIGNS_DETAIL: 'campaigns/detail',
  CAMPAIGNS_SUGGEST: 'campaigns/suggest',

  BRAIN_PATTERNS: 'brain/patterns',
  BRAIN_COMPARE: 'brain/compare',

  AI_CHAT: 'ai/chat',

  REPORTS_GENERATE: 'reports/generate',
  REPORTS_LIST: 'reports/list',

  BRANDS_LIST: 'brands/list',
  BRANDS_SWITCH: 'brands/switch',

  AD_ACCOUNTS_LIST: 'ad-accounts/list',
  AD_ACCOUNT_KPIS: 'ad-accounts/kpis',
  AD_ACCOUNT_TOP_ADS: 'ad-accounts/top-ads',
  AD_ACCOUNT_VIDEO_SOURCE: 'ad-accounts/video-source',
  ANALYTICS_FULL: 'analytics/full',

  ASSETS_LIST: 'assets/list',
  ASSETS_FOLDERS: 'assets/folders',

  AUTOMATIONS_LIST: 'automations/list',
  AUTOMATIONS_CREATE: 'automations/create',
  AUTOMATIONS_UPDATE: 'automations/update',
  AUTOMATIONS_DELETE: 'automations/delete',
  AUTOMATIONS_ACTIVITY: 'automations/activity',

  SETTINGS_PROFILE: 'settings/profile',
  SETTINGS_TEAM: 'settings/team',
  SETTINGS_BILLING: 'settings/billing',

  MEDIA_GENERATE_IMAGE: 'media/generate-image',
  MEDIA_GENERATE_VIDEO: 'media/generate-video',
  MEDIA_VIDEO_STATUS: 'media/video-status',

  BILLING_PLANS: 'billing/plans',
  BILLING_STATUS: 'billing/status',
  BILLING_CREATE_CHECKOUT: 'billing/create-checkout',
  BILLING_CREATE_PORTAL: 'billing/create-portal',

  AUTOPILOT_ALERTS: 'autopilot/alerts',
  AUTOPILOT_UNREAD_COUNT: 'autopilot/unread-count',
  AUTOPILOT_MARK_READ: 'autopilot/mark-read',
  AUTOPILOT_RUN: 'autopilot/run',

  COMPETITOR_SPY_SEARCH: 'competitor-spy/search',
  COMPETITOR_SPY_ANALYZE: 'competitor-spy/analyze',

  GOOGLE_ADS_OAUTH_URL: 'google-ads/oauth-url',
  GOOGLE_ADS_OAUTH_EXCHANGE: 'google-ads/oauth/exchange',
  GOOGLE_ADS_STATUS: 'google-ads/status',
  GOOGLE_ADS_ACCOUNTS: 'google-ads/accounts',
  GOOGLE_ADS_KPIS: 'google-ads/kpis',
  GOOGLE_ADS_CAMPAIGNS: 'google-ads/campaigns',
  GOOGLE_ADS_ANALYZE: 'google-ads/analyze',
  GOOGLE_ADS_DISCONNECT: 'google-ads/disconnect',

  TIKTOK_ADS_OAUTH_URL: 'tiktok-ads/oauth-url',
  TIKTOK_ADS_OAUTH_EXCHANGE: 'tiktok-ads/oauth/exchange',
  TIKTOK_ADS_STATUS: 'tiktok-ads/status',
  TIKTOK_ADS_KPIS: 'tiktok-ads/kpis',
  TIKTOK_ADS_CAMPAIGNS: 'tiktok-ads/campaigns',
  TIKTOK_ADS_ANALYZE: 'tiktok-ads/analyze',
  TIKTOK_ADS_DISCONNECT: 'tiktok-ads/disconnect',

  DIRECTOR_AUTO_PUBLISH: 'director/auto-publish',
  DIRECTOR_UPDATE_STATUS: 'director/update-status',

  REPORTS_GENERATE_WEEKLY: 'reports/generate-weekly',

  // Creative Engine
  ENGINE_ANALYZE: 'creative-engine/analyze',
  ENGINE_PLAN: 'creative-engine/plan',
  ENGINE_SPRINTS: 'creative-engine/sprints',
  ENGINE_SPRINT: 'creative-engine/sprint',
  ENGINE_ASSET: 'creative-engine/asset',
  ENGINE_JOB: 'creative-engine/job',
  ENGINE_COSTS: 'creative-engine/costs',
  ENGINE_USAGE: 'creative-engine/usage',
  ENGINE_TEMPLATES: 'creative-engine/templates',
  ENGINE_ANALYTICS: 'creative-engine/analytics',

  SCORE_ANALYZE: 'score/analyze',
  SCORE_BATCH: 'score/batch',
  CONTENT_GENERATE: 'content/generate',
  CONTENT_WEEKLY_STATS: 'content/weekly-stats',
  CONTENT_SAVE: 'content/save',
  CONTENT_SAVE_BATCH: 'content/save-batch',
  CONTENT_BANK: 'content/bank',
  CONTENT_TRIGGER_WEEKLY: 'content/trigger-weekly',
};
