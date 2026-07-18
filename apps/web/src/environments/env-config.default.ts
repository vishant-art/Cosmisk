// Committed defaults for build-time frontend config (see
// docs/superpowers/specs/2026-07-10-split-deploy-config-externalization-design.md §3.1).
// scripts/apply-env.mjs reads these and writes the gitignored env-config.ts,
// overriding API_BASE_URL / META_OAUTH_ENABLED from env vars when set.
export const API_BASE_URL = 'https://api.cosmisk.com';
export const META_APP_ID = '2018025028900369';
export const META_OAUTH_ENABLED = true;
