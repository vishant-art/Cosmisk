import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of, Observable, delay } from 'rxjs';

/**
 * LOCAL FRONTEND WALKTHROUGH MOCK — preview scaffolding.
 *
 * Active ONLY when localStorage.cosmisk_mock === '1' (set by the preview enter.html).
 * Never active in a real deployment (which never sets the flag). It short-circuits the
 * Creative Studio HTTP calls with timed sample responses so the whole flow — grounded
 * status → generate → streaming progress → results → plan → quote → render → QA → publish
 * → harvest — can be clicked through with no backend. Remove before merge.
 *
 * The one thing it can't fake: the rendered video bytes. `<video src>` is a native fetch,
 * not an HttpClient call, so it can't be intercepted — the QA banner shows, the player box
 * stays empty.
 */

const START: Record<string, number> = {};   // generationId -> first-seen ms
let renderAt = 0;                            // when a video render was kicked off (single-flow demo)

const swatch = (a: string, b: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="500" fill="url(#g)"/></svg>`)}`;

const ACCOUNT = {
  id: 'act_921159353090591', account_id: '921159353090591', name: 'Pratap Sons',
  business_name: 'Pratap Sons', status: 'active', currency: 'INR', credential_group: 'system',
};

const PROGRESS = [
  'Applying 3 learned finding(s) from past ads',
  'Applying 5 structural pattern(s) from 12 winners vs 5 losers',
  'Pulled 4 winning creative(s) from Meta',
  'Sourced the product from Shopify: Banarasi Silk Saree',
  'Designing the brand kit',
  'Brand kit decided',
  "Tore down the winning ad's structure",
  'Planned 4 ad concept(s)',
  'Ad 1/4 generated — "The saree she\'ll be asked about all night"',
  'Ad 2/4 rejected by quality gate',
  'Ad 3/4 generated — "Woven in Banaras. Worn where it matters"',
  'Static ads done',
];
const LINE_MS = 900;
const OUTPUT = {
  id: 'o1', generation_id: 'mock', format: 'static', status: 'completed',
  output: [
    { image_url: swatch('#7C3AED', '#DB2777'), aspect_ratio: '4:5', headline: "The saree she'll be asked about all night" },
    { image_url: swatch('#B45309', '#DC2626'), aspect_ratio: '1:1', headline: 'Woven in Banaras. Worn where it matters' },
    { image_url: swatch('#0F766E', '#4F46E5'), aspect_ratio: '9:16', headline: 'Handloom heritage, everyday drape' },
  ],
  output_json: '', score_json: null, cost_cents: 62, error_message: null,
  created_at: '2026-07-22T14:22:00Z', updated_at: '2026-07-22T14:24:00Z',
};
const REJECTED = ['Loud festive collage — failed legibility', 'Flat-lay with no model'];

const PLAN = {
  job_id: 'mockjob', shots: 3, duration_s: 24, grounded: true,
  script: { hook: 'You noticed the drape first, didn\'t you?', demo: 'Real Banarasi zari — feel the weight.', cta: 'Shop the festive edit.' },
  storyboard: {
    shots: [
      { title: 'Hook — she turns, the pallu catches the light', duration_s: 8 },
      { title: 'Demo — close on the zari weave and fall', duration_s: 8 },
      { title: 'CTA — worn to the party, shop the edit', duration_s: 8 },
    ],
  },
  quote: { clips: 3, estimated_usd: 3.67, balance_usd: 12.4, affordable: true, guard_enabled: true, shortfall_usd: 0 },
};

const QA_CHECKS = [
  { name: 'brand_safety', passed: true },
  { name: 'legibility', passed: true },
  { name: 'logo_absent', passed: true },
  { name: 'caption_audio', passed: false, detail: 'drift @48px (known false-positive, filtered)' },
  { name: 'cut_alignment', passed: false },
];
// A valid but empty (0-sample) WAV so the <audio> control appears when a voice is previewed.
const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function reply(body: unknown, ms = 300): Observable<HttpResponse<unknown>> {
  return of(new HttpResponse({ status: 200, body })).pipe(delay(ms));
}

function genState(id: string) {
  if (!START[id]) START[id] = Date.now();
  const elapsed = Date.now() - START[id];
  const shown = Math.min(PROGRESS.length, Math.floor(elapsed / LINE_MS) + 1);
  const done = elapsed > PROGRESS.length * LINE_MS + 1200;
  const base = {
    id, user_id: 'demo', brief: null, formats: ['static'], meta_account_id: ACCOUNT.id,
    ai_job_id: 'mockjob', created_at: new Date(START[id]).toISOString(),
  };
  if (!done) {
    return { success: true, generation: { ...base, status: 'generating', stage: PROGRESS[shown - 1], progress: PROGRESS.slice(0, shown) } };
  }
  return { success: true, generation: { ...base, status: 'completed', stage: 'Static ads done', cost_cents: 62, progress: PROGRESS, outputs: [OUTPUT] } };
}

function jobState() {
  const job: any = { status: 'complete', rejected: REJECTED, cost_usd: 0.62 };
  if (renderAt) {
    const rel = Date.now() - renderAt;
    if (rel < 6000) return { success: true, job: { ...job, status: 'rendering' } };
    job.video = { url: '/creative/assets/mockjob/final.mp4' };
    job.qa_passed = true;
    job.qa = { checks: QA_CHECKS };
  }
  return { success: true, job };
}

export const creativeStudioMockInterceptor: HttpInterceptorFn = (req, next) => {
  if (localStorage.getItem('cosmisk_mock') !== '1') return next(req);
  const u = req.url;

  if (u.includes('/auth/meta-status')) return reply({ connected: true, status: 'connected', accountCount: 1, metaUserName: 'Pratap Sons', expiresAt: '2027-01-01' });
  if (u.includes('/ad-accounts/list')) return reply({ accounts: [ACCOUNT] });

  if (u.includes('/creative-studio/generate') && req.method === 'POST') {
    const id = 'mock-' + Date.now();
    START[id] = Date.now();
    return reply({ success: true, generation_id: id }, 400);
  }
  if (u.includes('/creative-studio/generations')) {
    return reply({ success: true, generations: [{ id: 'mock-prev', user_id: 'demo', brief: null, formats: ['static'], meta_account_id: ACCOUNT.id, status: 'completed', created_at: '2026-07-21T10:00:00Z' }] });
  }
  const gen = u.match(/\/creative-studio\/generation\/([^/?]+)/);
  if (gen) return reply(genState(gen[1]));
  if (u.includes('/creative-studio/prior/')) return reply({ success: true, prior: { brief: 'Proven: warm-toned festive statics with a single model on-camera outperform flat-lays ~2.3× on ROAS. Gold/maroon palette + visible zari detail recur in every top-quartile winner.' } });
  if (u.includes('/creative-studio/graph/')) return reply({ success: true, graph: { brief: 'Correlation, not proven cause: model-present + gold palette + close-up texture shot correlate with top-quartile ROAS across 12 winners vs 5 losers.' } });
  if (u.includes('/creative-studio/video/plan')) return reply({ success: true, plan: PLAN }, 1400);
  if (u.includes('/creative-studio/video/generate')) { renderAt = Date.now(); return reply({ success: true, status: 'queued', clips: 3 }, 900); }
  if (u.match(/\/creative-studio\/video\/job\//)) return reply(jobState());
  if (u.includes('/creative-studio/voice/preview')) return reply({ success: true, url: WAV }, 700);
  if (u.includes('/creative-studio/variants/')) return reply({ success: true, status: 'published' }, 500);
  if (u.includes('/creative-studio/learn')) return reply({ success: true, result: { brief: '2 arms updated · 1 UNDECIDED' } }, 1200);

  return next(req);
};
