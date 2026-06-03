/**
 * Ad-Engine — template renderer (stub).
 *
 * Real implementation will composite product photos with Sharp + premium
 * layout SVGs. For now this is a typed pass-through so validator.ts can
 * import `renderAd` without crashing the build.
 *
 * Input shape mirrors the validator.ts call site, which passes
 *   { product, format, brandName, outputDir }
 * (NOT { brief, template }) — see validator.ts:495-500.
 */

import { logger } from '../../utils/logger.js';
import type { AdFormat, ProductBrief, RenderOutput, TemplateType } from './types.js';

export interface RenderAdInput {
  product: ProductBrief & { template?: TemplateType };
  template?: TemplateType;            // also accepted at top level
  format: AdFormat;
  brandName?: string;
  outputDir?: string;
  copy?: { hook?: string; cta?: string };
}

export async function renderAd(input: RenderAdInput): Promise<RenderOutput> {
  const template = input.template ?? input.product.template ?? 'product-center';
  logger.warn(
    { template, format: input.format, productId: input.product.productId, outputDir: input.outputDir },
    '[ad-engine/templates] renderAd stub invoked — no image produced',
  );

  return {
    filePath: '',
    imagePath: '',
    format: input.format,
    template,
    prompt: `[stub] ${template} for "${input.product.title}"`,
    modelUsed: 'stub',
  };
}
