/* ------------------------------------------------------------------ */
/*  Helpers: DNA profile building + tag inference                      */
/* ------------------------------------------------------------------ */

import { CREATIVE_PATTERNS } from '../creative-patterns.js';
import type { CreativeScoreInput, WinningDna } from './types.js';

export function buildWinningDnaProfile(
  dnaCacheRows: Array<{ hook: string; visual: string; audio: string }>,
  assetsWithMetrics: Array<{ dna_tags: string | null; actual_metrics: string | null }>,
): WinningDna {
  const hooks = new Map<string, number>();
  const visuals = new Map<string, number>();
  const audio = new Map<string, number>();

  // Weight DNA tags by ROAS of tracked assets
  for (const asset of assetsWithMetrics) {
    if (!asset.dna_tags) continue;
    try {
      const tags = JSON.parse(asset.dna_tags);
      const metrics = asset.actual_metrics ? JSON.parse(asset.actual_metrics) : {};
      const weight = metrics.roas ? Math.min(metrics.roas, 10) : 1; // cap weight at 10x

      for (const h of (tags.hook || [])) {
        hooks.set(h, (hooks.get(h) || 0) + weight);
      }
      for (const v of (tags.visual || [])) {
        visuals.set(v, (visuals.get(v) || 0) + weight);
      }
      for (const a of (tags.audio || [])) {
        audio.set(a, (audio.get(a) || 0) + weight);
      }
    } catch { /* skip malformed */ }
  }

  // Also include DNA cache entries (lower weight — no ROAS data)
  for (const row of dnaCacheRows) {
    try {
      for (const h of JSON.parse(row.hook)) hooks.set(h, (hooks.get(h) || 0) + 0.5);
      for (const v of JSON.parse(row.visual)) visuals.set(v, (visuals.get(v) || 0) + 0.5);
      for (const a of JSON.parse(row.audio)) audio.set(a, (audio.get(a) || 0) + 0.5);
    } catch { /* skip */ }
  }

  return { hooks, visuals, audio };
}

/* ------------------------------------------------------------------ */
/*  Infer DNA tags from script text                                    */
/* ------------------------------------------------------------------ */

export function inferDnaTags(
  scriptText?: string,
  hookType?: string,
): CreativeScoreInput['dnaTags'] {
  const tags: CreativeScoreInput['dnaTags'] = {
    hook: [], visual: [], audio: [], editing: [],
    text_overlay: [], color_mood: [], cta: [],
  };

  if (!scriptText && !hookType) return tags;

  const text = (scriptText || '').toLowerCase();

  // Infer hooks
  if (hookType) {
    tags.hook = [hookType];
  } else {
    // Simple keyword matching against CREATIVE_PATTERNS.hook
    for (const pattern of CREATIVE_PATTERNS.hook) {
      const keywords = pattern.toLowerCase().split(/[\s/]+/);
      if (keywords.some(kw => kw.length > 3 && text.includes(kw))) {
        tags.hook!.push(pattern);
      }
    }
    if (tags.hook!.length === 0) tags.hook = ['Direct Interrogation']; // default
  }

  // Infer visual style from script directions
  if (text.includes('ugc') || text.includes('handheld') || text.includes('selfie')) {
    tags.visual!.push('UGC Handheld');
  }
  if (text.includes('talking head') || text.includes('face to camera')) {
    tags.visual!.push('Talking Head');
  }
  if (text.includes('product') && (text.includes('close') || text.includes('shot'))) {
    tags.visual!.push('Product Close-up');
  }
  if (text.includes('lifestyle') || text.includes('b-roll')) {
    tags.visual!.push('Lifestyle B-roll');
  }

  // Infer CTA style
  if (text.includes('shop now') || text.includes('buy now')) {
    tags.cta!.push('Shop Now Overlay');
  }
  if (text.includes('link') || text.includes('bio')) {
    tags.cta!.push('Link in Bio');
  }
  if (text.includes('limited') || text.includes('hurry') || text.includes('last chance')) {
    tags.cta!.push('Urgency Timer/Countdown');
  }

  return tags;
}
