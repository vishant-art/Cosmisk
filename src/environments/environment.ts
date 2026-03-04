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
  DIRECTOR_GENERATE_CREATIVE: 'director/generate',
  DIRECTOR_PUBLISH: 'director/publish',

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
  UGC_GENERATE_SCRIPT: 'ugc/generate-script',
  UGC_GENERATE_VIDEO: 'ugc/generate-video',

  CAMPAIGNS_LIST: 'campaigns/list',
  CAMPAIGNS_CREATE: 'campaigns/create',
  CAMPAIGNS_UPDATE: 'campaigns/update',
  CAMPAIGNS_LAUNCH: 'campaigns/launch',
  CAMPAIGNS_DETAIL: 'campaigns/detail',

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
};
