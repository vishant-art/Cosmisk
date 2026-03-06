import Anthropic from '@anthropic-ai/sdk';
import { round, fmt, setCurrency } from './format-helpers.js';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AnalyzedAd {
  id: string;
  name: string;
  spend: number;
  roas: number;
  ctr: number;
  cpa: number;
  impressions: number;
  conversions: number;
  format: string;
  thumbnail_url: string;
  days_active: number;
}

interface AccountSnapshot {
  topAds: AnalyzedAd[];
  benchmarks: { avgRoas: number; avgCtr: number; avgCpa: number; avgSpend: number; totalSpend: number };
  formatBreakdown: Record<string, { count: number; avgRoas: number; totalSpend: number }>;
  fatigueSignals: string[];
}

interface PlanItem {
  format: string;
  count: number;
  rationale: string;
  estimated_cost_cents: number;
  source_ads: { name: string; roas: number }[];
}

interface SprintPlan {
  items: PlanItem[];
  totalCreatives: number;
  totalEstimatedCents: number;
}

/* ------------------------------------------------------------------ */
/*  Cost estimates per format (in cents)                                */
/* ------------------------------------------------------------------ */
const COST_PER_UNIT: Record<string, number> = {
  ugc_talking_head: 99,     // HeyGen credit
  podcast_clip: 99,         // HeyGen credit
  testimonial_mashup: 99,   // HeyGen credit
  skit: 50,                 // Kling ~$0.50/clip
  before_after: 50,         // Kling
  product_demo: 75,         // Creatify
  static_ad: 4,             // Flux $0.04/image
  carousel: 20,             // Flux 5 images
  remake_winner: 30,        // varies
  localization: 80,         // ElevenLabs + HeyGen
};

/* ------------------------------------------------------------------ */
/*  Generate sprint plan via Claude                                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Competitor context builder                                         */
/* ------------------------------------------------------------------ */

function buildCompetitorSection(ctx?: CompetitorContext): string {
  if (!ctx || !ctx.ads || ctx.ads.length === 0) return '';

  const lines = ctx.ads.slice(0, 10).map((ad, i) => {
    const daysRunning = ad.running_since
      ? Math.max(1, Math.floor((Date.now() - new Date(ad.running_since).getTime()) / 86400000))
      : 0;
    const longevity = daysRunning > 30 ? '(likely profitable — running 30+ days)' :
                      daysRunning > 14 ? '(promising — running 14+ days)' : '';
    return `  ${i + 1}. [${ad.page_name}] "${ad.headline || 'No headline'}" — ${ad.body?.slice(0, 100) || 'No copy'} | Running ${daysRunning}d ${longevity} ${ad.est_spend ? `| Spend: ${ad.est_spend}` : ''}`;
  });

  return `
COMPETITOR INTELLIGENCE (from "${ctx.query}" — Meta Ad Library):
${lines.join('\n')}

Use these competitor patterns to:
- Identify messaging angles they're doubling down on (long-running ads = profitable)
- Find gaps they're NOT covering that this brand could own
- Counter-position — if they all lead with price, lead with quality/trust
- Adapt successful hook patterns from their longest-running ads`;
}

interface CompetitorContext {
  query: string;
  ads: {
    page_name: string;
    body: string | null;
    headline: string | null;
    running_since: string;
    est_spend: string | null;
    platforms: string[];
  }[];
}

export async function generateSprintPlan(
  snapshot: AccountSnapshot,
  preferences: {
    budget_cents?: number;
    currency?: string;
    target_formats?: string[];
    total_creatives?: number;
    competitor_context?: CompetitorContext;
  },
): Promise<SprintPlan> {
  const currency = preferences.currency || 'USD';
  setCurrency(currency);

  const topAds = snapshot.topAds || [];
  const benchmarks = snapshot.benchmarks;
  const maxBudgetCents = preferences.budget_cents || 50000; // default $500
  const targetCount = preferences.total_creatives || 30;

  // Build data context for Claude
  const topPerformersText = topAds.slice(0, 10).map((ad, i) =>
    `${i + 1}. "${ad.name}" — ${ad.roas}x ROAS, ${fmt(ad.spend)} spend, ${ad.ctr}% CTR, ${ad.conversions} conv, ${ad.format}, ${ad.days_active}d active`
  ).join('\n');

  const formatText = Object.entries(snapshot.formatBreakdown)
    .map(([f, d]) => `${f}: ${d.count} ads, ${d.avgRoas}x avg ROAS, ${fmt(d.totalSpend)} spend`)
    .join('\n');

  const fatigueText = snapshot.fatigueSignals.length > 0
    ? snapshot.fatigueSignals.join('\n')
    : 'No major fatigue signals detected.';

  const systemPrompt = `You are a performance creative strategist at Cosmisk. You create data-backed sprint plans.

You have access to an advertiser's Meta Ads performance data. Your job is to create a creative sprint plan — a batch of ad creatives to generate and test.

RULES:
- Think like a strategist. Analyze what's working and WHY, then recommend formats that exploit those patterns.
- Every recommendation must reference specific ad names and metrics from the data.
- DO NOT follow a rigid split. Instead, look at the data and decide what this specific brand needs:
  - If UGC-style is crushing it, go heavy on UGC variations
  - If static ads have the best ROAS, make more static ads
  - If there's no video data, test video formats to fill the gap
  - If a single ad carries 80% of revenue, create 10+ variations of it
- Consider budget constraints — total estimated cost must stay under the budget
- Assess data confidence — if top performers have low spend or few conversions, note it
- You can recommend ANY format, not just the presets below. If the data suggests "green screen reaction" or "founder interview" or "customer unboxing" would work, recommend it.

COMMON FORMATS (with cost per unit — but you can invent new ones):
- ugc_talking_head ($0.99): AI avatar delivers hook + pitch
- podcast_clip ($0.99): Two avatars discussing product
- skit ($0.50): Mini-narrative problem→solution
- product_demo ($0.75): Product URL → demo video
- testimonial_mashup ($0.99): Multiple avatars giving reviews
- before_after ($0.50): Split-screen transformation
- static_ad ($0.04): AI-generated image with copy
- carousel ($0.20): Multi-image sequence
- remake_winner ($0.30): Variations of top ad
- localization ($0.80): Translate winning creative
- green_screen_reaction ($0.99): Creator reacts to product
- interview ($0.99): Q&A with founder/expert
- unboxing ($0.50): First impressions unboxing reveal
- listicle ($0.04): Top N reasons/benefits (static or video)
- meme_ad ($0.04): Trending meme format adapted for brand
- Or any other format you think fits this brand's data

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown:
{
  "items": [
    {
      "format": "format_name_snake_case",
      "count": N,
      "rationale": "Why this format for THIS brand, referencing specific ads/metrics",
      "source_ads": [{"name": "ad name", "roas": X.X}],
      "estimated_cost_per_unit_cents": 99
    }
  ]
}`;

  const userMessage = `Create a sprint plan for this advertiser.

ACCOUNT BENCHMARKS:
- Total Spend: ${fmt(benchmarks.totalSpend)}
- Avg ROAS: ${benchmarks.avgRoas}x
- Avg CTR: ${benchmarks.avgCtr}%
- Avg CPA: ${fmt(benchmarks.avgCpa)}
- Total active ads: ${topAds.length}

TOP PERFORMERS:
${topPerformersText || 'No performance data available.'}

FORMAT BREAKDOWN:
${formatText || 'No format data available.'}

FATIGUE SIGNALS:
${fatigueText}

CONSTRAINTS:
- Budget: ${fmt(maxBudgetCents / 100)} (${maxBudgetCents} cents)
- Target: ~${targetCount} creatives
- Currency: ${currency}
${preferences.target_formats?.length ? `- Preferred formats: ${preferences.target_formats.join(', ')}` : ''}
${buildCompetitorSection(preferences.competitor_context)}`;

  try {
    // Opus for strategic planning — worth the 5x cost for better format selection
    // Scripts stay on Sonnet (generateScript) since they're execution, not strategy
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      temperature: 0.5,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((b: any) => b.type === 'text');
    const text = textBlock ? (textBlock as any).text : '';

    // Parse JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const items: PlanItem[] = (parsed.items || []).map((item: any) => {
        const count = Math.max(1, Math.min(item.count || 1, 50));
        const unitCost = item.estimated_cost_per_unit_cents || COST_PER_UNIT[item.format] || 30;
        return {
          format: item.format,
          count,
          rationale: item.rationale || '',
          estimated_cost_cents: count * unitCost,
          source_ads: item.source_ads || [],
        };
      });

      const totalCreatives = items.reduce((s, i) => s + i.count, 0);
      const totalEstimatedCents = items.reduce((s, i) => s + i.estimated_cost_cents, 0);

      return { items, totalCreatives, totalEstimatedCents };
    }
  } catch (err) {
    console.error('Sprint plan Claude error:', err);
  }

  // Fallback: generate a basic plan from data without Claude
  return generateFallbackPlan(snapshot, targetCount, maxBudgetCents);
}

/* ------------------------------------------------------------------ */
/*  Fallback plan (no Claude / Claude fails)                           */
/* ------------------------------------------------------------------ */

function generateFallbackPlan(
  snapshot: AccountSnapshot,
  targetCount: number,
  maxBudgetCents: number,
): SprintPlan {
  const topAds = snapshot.topAds || [];
  const items: PlanItem[] = [];

  // 40% remake winners
  const remakeCount = Math.min(Math.ceil(targetCount * 0.4), topAds.length * 3, 15);
  if (topAds.length > 0) {
    items.push({
      format: 'remake_winner',
      count: remakeCount,
      rationale: `Remake top ${Math.min(remakeCount, topAds.length)} performers with new hooks. Based on "${topAds[0].name}" (${topAds[0].roas}x ROAS, ${topAds[0].conversions} conversions).`,
      estimated_cost_cents: remakeCount * COST_PER_UNIT['remake_winner'],
      source_ads: topAds.slice(0, 5).map(a => ({ name: a.name, roas: a.roas })),
    });
  }

  // 30% UGC
  const ugcCount = Math.ceil(targetCount * 0.15);
  items.push({
    format: 'ugc_talking_head',
    count: ugcCount,
    rationale: `${ugcCount} UGC talking head videos. Direct response format with highest engagement.`,
    estimated_cost_cents: ugcCount * COST_PER_UNIT['ugc_talking_head'],
    source_ads: topAds.slice(0, 2).map(a => ({ name: a.name, roas: a.roas })),
  });

  const podcastCount = Math.ceil(targetCount * 0.15);
  items.push({
    format: 'podcast_clip',
    count: podcastCount,
    rationale: `${podcastCount} podcast-style clips for trust-building and authority.`,
    estimated_cost_cents: podcastCount * COST_PER_UNIT['podcast_clip'],
    source_ads: [],
  });

  // 20% static/carousel (cheap, fast testing)
  const staticCount = Math.ceil(targetCount * 0.15);
  items.push({
    format: 'static_ad',
    count: staticCount,
    rationale: `${staticCount} static ads for rapid A/B testing at minimal cost ($0.04 each).`,
    estimated_cost_cents: staticCount * COST_PER_UNIT['static_ad'],
    source_ads: [],
  });

  const carouselCount = Math.ceil(targetCount * 0.05);
  items.push({
    format: 'carousel',
    count: carouselCount,
    rationale: `${carouselCount} carousel ads for storytelling and product showcase.`,
    estimated_cost_cents: carouselCount * COST_PER_UNIT['carousel'],
    source_ads: [],
  });

  // 10% experimental
  items.push({
    format: 'skit',
    count: Math.ceil(targetCount * 0.1),
    rationale: `Experimental skit/story format. Problem→solution narrative.`,
    estimated_cost_cents: Math.ceil(targetCount * 0.1) * COST_PER_UNIT['skit'],
    source_ads: [],
  });

  const totalCreatives = items.reduce((s, i) => s + i.count, 0);
  const totalEstimatedCents = items.reduce((s, i) => s + i.estimated_cost_cents, 0);

  return { items, totalCreatives, totalEstimatedCents };
}

/* ------------------------------------------------------------------ */
/*  Generate scripts for each job                                      */
/* ------------------------------------------------------------------ */

interface ScriptParams {
  format: string;
  snapshot: AccountSnapshot;
  sourceAd?: AnalyzedAd;
  productName?: string;
  targetAudience?: string;
  brandName?: string;
  currency?: string;
}

export async function generateScript(params: ScriptParams): Promise<{
  script: any;
  dna_tags: { hook: string[]; visual: string[]; audio: string[] };
  predicted_score: number;
}> {
  const {
    format, snapshot, sourceAd,
    productName = 'the product',
    targetAudience = 'the target audience',
    brandName = 'the brand',
    currency = 'INR',
  } = params;

  setCurrency(currency);
  const topAd = sourceAd || snapshot.topAds[0];

  const systemPrompt = `You are a creative director generating ad scripts. Write specific, production-ready scripts.

RULES:
- Every script must be specific to the product/brand, not generic
- Reference actual performance data when available
- Include timing cues (0:00-0:03, etc.)
- Include visual directions in [brackets]
- Include dialogue in "quotes"
- Tag the script with DNA: hook type, visual style, audio style

OUTPUT FORMAT — respond with ONLY valid JSON:
{
  "title": "Script title",
  "sections": [
    {
      "label": "HOOK",
      "timing": "0:00-0:03",
      "visual": "Visual direction",
      "dialogue": "Spoken text or null",
      "text_overlay": "On-screen text or null"
    }
  ],
  "duration_seconds": 30,
  "dna_tags": {
    "hook": ["hook type from: Shock Statement, Price Anchor, Authority, Personal Story, Curiosity, Social Proof, Urgency, Education, Transformation, Direct Interrogation"],
    "visual": ["visual type from: UGC Style, Product Focus, Text-Heavy, Lifestyle, Before/After, Minimal, Split Screen"],
    "audio": ["audio type from: Hindi VO, English VO, Music-Only, Upbeat, Emotional, ASMR, Sound Effects"]
  },
  "predicted_score": 65
}`;

  const formatInstructions = getFormatInstructions(format);

  const userMessage = `Generate a ${formatInstructions.label} script.

FORMAT: ${format}
PRODUCT: ${productName}
BRAND: ${brandName}
TARGET AUDIENCE: ${targetAudience}
${topAd ? `TOP PERFORMER REFERENCE: "${topAd.name}" — ${topAd.roas}x ROAS, ${fmt(topAd.spend)} spend, ${topAd.ctr}% CTR` : ''}
ACCOUNT AVG ROAS: ${snapshot.benchmarks.avgRoas}x
ACCOUNT AVG CTR: ${snapshot.benchmarks.avgCtr}%

FORMAT REQUIREMENTS:
${formatInstructions.requirements}

Generate a script that would outperform the account average. Predict a performance score (0-100) based on how well it matches winning patterns.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find((b: any) => b.type === 'text');
    const text = textBlock ? (textBlock as any).text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        script: {
          title: parsed.title || `${format} Script`,
          sections: parsed.sections || [],
          duration_seconds: parsed.duration_seconds || 30,
          format,
          source_ad: topAd ? { name: topAd.name, roas: topAd.roas } : null,
        },
        dna_tags: parsed.dna_tags || { hook: [], visual: [], audio: [] },
        predicted_score: Math.min(100, Math.max(0, parsed.predicted_score || 50)),
      };
    }
  } catch (err) {
    console.error('Script generation Claude error:', err);
  }

  // Fallback script
  return generateFallbackScript(format, productName, targetAudience, topAd);
}

/* ------------------------------------------------------------------ */
/*  Batch script generation                                            */
/* ------------------------------------------------------------------ */

export async function generateScriptsForJobs(
  jobs: { id: string; format: string }[],
  snapshot: AccountSnapshot,
  preferences: { productName?: string; targetAudience?: string; brandName?: string; currency?: string },
): Promise<Map<string, { script: any; dna_tags: any; predicted_score: number }>> {
  const results = new Map<string, { script: any; dna_tags: any; predicted_score: number }>();

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    const promises = batch.map(async (job) => {
      // Pick a source ad relevant to this job's format
      const sourceAd = snapshot.topAds.find(a => {
        if (job.format === 'static_ad' || job.format === 'carousel') return a.format === 'image';
        return a.format === 'video';
      }) || snapshot.topAds[0];

      const result = await generateScript({
        format: job.format,
        snapshot,
        sourceAd,
        productName: preferences.productName,
        targetAudience: preferences.targetAudience,
        brandName: preferences.brandName,
        currency: preferences.currency,
      });
      results.set(job.id, result);
    });
    await Promise.all(promises);
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Format instructions                                                */
/* ------------------------------------------------------------------ */

function getFormatInstructions(format: string): { label: string; requirements: string } {
  const map: Record<string, { label: string; requirements: string }> = {
    ugc_talking_head: {
      label: 'UGC Talking Head',
      requirements: `- Single person talking to camera (AI avatar will deliver this)
- 30 seconds max
- Structure: HOOK (0-3s) → PROBLEM (3-8s) → SOLUTION (8-18s) → PROOF (18-25s) → CTA (25-30s)
- Conversational tone, like talking to a friend
- Include specific dialogue for the avatar to speak
- First 3 seconds must stop the scroll`,
    },
    podcast_clip: {
      label: 'Podcast Clip',
      requirements: `- Two people in conversation (two AI avatars)
- 30-45 seconds
- Structure: Host asks question → Guest shares experience → Key insight → CTA
- Natural, podcast-style dialogue (not salesy)
- Include dialogue for BOTH speakers labeled as HOST and GUEST
- Educational/trust-building tone`,
    },
    skit: {
      label: 'Skit / Story',
      requirements: `- Mini-narrative with character(s)
- 15-30 seconds
- Structure: SETUP (problem scene) → CONFLICT (frustration) → RESOLUTION (product saves the day)
- Visual storytelling — describe each scene
- Minimal dialogue, more visual
- Satisfying before/after transformation`,
    },
    product_demo: {
      label: 'Product Demo',
      requirements: `- Product demonstration video
- 15-30 seconds
- Structure: HOOK (product beauty shot) → FEATURES (3 key features, 3-5s each) → RESULT → CTA
- Focus on the product in use
- Include text overlays for each feature
- Clean, professional visual style`,
    },
    testimonial_mashup: {
      label: 'Testimonial Mashup',
      requirements: `- 3-4 different people giving short testimonials
- 30-45 seconds
- Structure: Person 1 (hook/problem) → Person 2 (discovery) → Person 3 (results) → Person 4 (recommendation) → CTA
- Each person speaks for 5-8 seconds
- Include dialogue for each speaker (SPEAKER_1, SPEAKER_2, etc.)
- Authentic, varied perspectives`,
    },
    before_after: {
      label: 'Before / After',
      requirements: `- Split-screen or sequential before→after transformation
- 15-20 seconds
- Structure: BEFORE (3-5s, show the problem) → TRANSITION (2-3s, product reveal) → AFTER (5-8s, show the result) → CTA
- Dramatic visual contrast
- Minimal text, let the visuals speak
- Include text overlay for key stats`,
    },
    static_ad: {
      label: 'Static Ad',
      requirements: `- Single image with copy
- Include: headline (max 8 words), body text (max 20 words), CTA text
- Visual direction for the AI image generator (describe the scene, colors, composition)
- Text placement instructions (top/center/bottom)
- Must work at 1080x1080 (square) and 1080x1920 (story)`,
    },
    carousel: {
      label: 'Carousel Ad',
      requirements: `- 5 slides/frames in sequence
- Each slide: image direction + headline + short body
- Structure: Slide 1 (hook/attention) → Slides 2-4 (story/features/proof) → Slide 5 (CTA)
- Consistent visual style across all slides
- Each slide must make sense on its own but tell a story together
- Include swipe motivation (curiosity gap between slides)`,
    },
    remake_winner: {
      label: 'Remake Winner',
      requirements: `- Variation of the top performing ad
- Same core angle/message but fresh execution
- 3 variations to suggest: different hook, different visual style, different CTA
- Keep what works (the winning angle), change what can be improved
- Include notes on what to keep vs what to change
- Same duration as the original`,
    },
    localization: {
      label: 'Localization',
      requirements: `- Translation/adaptation of winning creative for new market
- Include the original script and the localized version
- Adapt cultural references, not just translate
- Note pronunciation guides for key product terms
- Suggest voice tone adjustments for the target market
- Support Hindi, Tamil, Telugu, English, and regional variations`,
    },
  };

  if (map[format]) return map[format];

  // For custom/unknown formats, generate a reasonable instruction set
  const label = format.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return {
    label,
    requirements: `- ${label} ad creative
- 15-30 seconds if video, single image if static
- Structure: HOOK (attention grabber) → BODY (value proposition) → CTA (clear next step)
- Include visual directions and dialogue/copy
- Make it specific to the product and audience, not generic`,
  };
}

/* ------------------------------------------------------------------ */
/*  Fallback script (no Claude)                                        */
/* ------------------------------------------------------------------ */

function generateFallbackScript(
  format: string,
  productName: string,
  targetAudience: string,
  topAd?: AnalyzedAd,
): { script: any; dna_tags: { hook: string[]; visual: string[]; audio: string[] }; predicted_score: number } {
  const isVideo = !['static_ad', 'carousel'].includes(format);

  if (format === 'static_ad') {
    return {
      script: {
        title: `Static Ad — ${productName}`,
        format: 'static_ad',
        headline: `Discover ${productName}`,
        body_text: `The solution ${targetAudience} has been looking for.`,
        cta_text: 'Shop Now',
        visual_direction: `Clean product shot of ${productName} on a minimal background. Warm lighting, aspirational feel. Text overlay at top.`,
        source_ad: topAd ? { name: topAd.name, roas: topAd.roas } : null,
      },
      dna_tags: { hook: ['Product Focus'], visual: ['Minimal'], audio: ['Silent'] },
      predicted_score: 45,
    };
  }

  if (format === 'carousel') {
    return {
      script: {
        title: `Carousel — ${productName}`,
        format: 'carousel',
        slides: [
          { headline: `Still using the old way?`, body: `There's a better solution.`, visual: `Eye-catching problem visual` },
          { headline: `Meet ${productName}`, body: `Built for ${targetAudience}.`, visual: `Product hero shot` },
          { headline: `Feature 1`, body: `Key benefit description.`, visual: `Feature in action` },
          { headline: `Real Results`, body: `Customer testimonial or stat.`, visual: `Social proof visual` },
          { headline: `Try It Today`, body: `Limited time offer.`, visual: `CTA card with product` },
        ],
        source_ad: topAd ? { name: topAd.name, roas: topAd.roas } : null,
      },
      dna_tags: { hook: ['Curiosity'], visual: ['Product Focus'], audio: ['Silent'] },
      predicted_score: 40,
    };
  }

  // Default video script
  return {
    script: {
      title: `${getFormatInstructions(format).label} — ${productName}`,
      format,
      sections: [
        { label: 'HOOK', timing: '0:00-0:03', visual: `Attention-grabbing opening`, dialogue: `"Wait — have you tried ${productName} yet?"`, text_overlay: null },
        { label: 'PROBLEM', timing: '0:03-0:08', visual: `Show the pain point`, dialogue: `"If you're ${targetAudience}, you know the struggle."`, text_overlay: null },
        { label: 'SOLUTION', timing: '0:08-0:18', visual: `Product in use`, dialogue: `"${productName} changes everything. Here's how."`, text_overlay: `Key benefit` },
        { label: 'PROOF', timing: '0:18-0:25', visual: `Social proof / results`, dialogue: `"Thousands already made the switch."`, text_overlay: `Star rating or stat` },
        { label: 'CTA', timing: '0:25-0:30', visual: `End card with product`, dialogue: `"Link below. Try it now."`, text_overlay: `Shop Now` },
      ],
      duration_seconds: 30,
      source_ad: topAd ? { name: topAd.name, roas: topAd.roas } : null,
    },
    dna_tags: {
      hook: ['Direct Interrogation'],
      visual: ['UGC Style'],
      audio: ['English VO'],
    },
    predicted_score: 45,
  };
}
