// Stub — full implementation deferred to M2 (see dev_reports/ON_HOLD.md item 13).
// agent-orchestrator dynamically imports this module; without the export the
// import call rejects at runtime. Returns an empty result so the orchestrator's
// success path completes without generating anything.

import { logger } from '../utils/logger.js';

export interface StaticAdConfig {
  clientId: string;
  products: string[];
  formats: ('1080x1080' | '1080x1920' | '1200x628')[];
  variantsPerFormat: number;
  style?: string;
  [key: string]: unknown;
}

export interface StaticAdResult {
  generated: Array<Record<string, unknown>>;
}

export async function generateStaticAds(config: StaticAdConfig): Promise<StaticAdResult> {
  logger.info({ clientId: config.clientId, formats: config.formats }, '[static-ad-generator] stub invoked; no creatives generated');
  return { generated: [] };
}
