/**
 * Thin HTTP client for the Creative Studio generation pipeline in apps/ai-layer
 * (the M4 Generative Engine). Mirrors services/ai-layer-client.ts: feature-gated by
 * config.aiLayerUrl, authenticated with X-API-Key, and the user's Meta token passed
 * per-request as X-Meta-Token (only needed when conditioning on a real account).
 *
 * Generation is async on the Python side: startCreativeGen() returns a job_id; the
 * caller polls getCreativeJob(). Finished assets live on the ai-layer; fetchCreativeAsset()
 * streams their bytes so the browser only ever talks to apps/api.
 */
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { AiLayerError } from './ai-layer-client.js';

export interface CreativeGenRequest {
  brief?: Record<string, unknown>;
  accountId?: string;
  formats?: string[];      // aspect ratios for the static ads, e.g. ['1:1','4:5','9:16']
  images?: number;         // number of concepts
  withVideo?: boolean;
  voiceover?: boolean;
  ground?: boolean;
  noLogo?: boolean;
  direction?: string;      // art-direction guide; casts one person across ads + video
}

export interface CreativeGenAsset {
  concept: string | null;
  fmt: string;
  url: string;             // ai-layer-relative, e.g. /creative/assets/<job>/<file>
  thumb_url?: string | null; // ~512px JPEG for the grid; absent -> UI falls back to url
  copy: { headline?: string; subhead?: string; cta_label?: string } | null;
}

export interface CreativeGenJob {
  job_id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  stage: string;           // latest milestone, e.g. "Brand kit decided", "Ad 2/3 generated"
  progress: string[];      // all milestones so far
  run_id: string | null;
  assets: CreativeGenAsset[];
  video: { url: string; poster_url?: string | null } | null;
  qa?: { verdict: string; checks?: unknown[]; retry_hint?: string } | null;
  brand_kit: Record<string, unknown> | null;
  winners: { url: string }[];
  cost_usd: number;
  /**
   * Ads the QA gate failed. Was `string[]` (concept titles only) — now carries the render
   * and the specific reason, because Creative Studio shows failed output flagged rather
   * than withholding it while the gate is still being tuned. See
   * dev_reports/2026-08-09-qa-visibility-decision-and-open-defects.md
   */
  rejected: CreativeGenRejected[];
  error: string | null;
}

export interface CreativeGenRejected {
  concept: string;
  url: string;
  /** One line, specific — e.g. "contrast: headline 2.9:1, needs 4.5:1". */
  reason: string;
  failed_checks: { name: string; detail: string }[];
}

export function creativeGenEnabled(): boolean {
  return Boolean(config.aiLayerUrl);
}

function base(): string {
  return config.aiLayerUrl.replace(/\/+$/, '');
}

const START_TIMEOUT_MS = 15_000;   // returns a job_id immediately
const POLL_TIMEOUT_MS = 20_000;
const ASSET_TIMEOUT_MS = 60_000;

type AiFetchOpts = { body?: unknown; metaToken?: string; timeoutMs?: number };

/** Shared ai-layer call: enabled-guard, X-API-Key (+ optional Meta token), JSON in/out,
 *  uniform `${label} failed: <body>` error. `timeoutMs` omitted = no timeout (long LLM
 *  planning). The richer start/poll paths below keep their own network-catch + {detail}. */
async function aiFetch<T>(method: string, path: string, label: string, opts: AiFetchOpts = {}): Promise<T> {
  if (!creativeGenEnabled()) throw new AiLayerError('creative-gen not configured (AI_LAYER_URL)', 503);
  const headers: Record<string, string> = { 'X-API-Key': config.aiLayerApiKey };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.metaToken) headers['X-Meta-Token'] = opts.metaToken;
  const res = await fetch(`${base()}${path}`, {
    method, headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
  });
  if (!res.ok) throw new AiLayerError(`${label} failed: ${await res.text()}`, res.status);
  return res.json() as Promise<T>;
}

/** POST /creative/generate -> { job_id }. */
export async function startCreativeGen(
  req: CreativeGenRequest,
  metaToken?: string,
): Promise<string> {
  if (!creativeGenEnabled()) throw new AiLayerError('creative-gen not configured (AI_LAYER_URL)', 503);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': config.aiLayerApiKey,
  };
  if (metaToken) headers['X-Meta-Token'] = metaToken;

  const body = {
    brief: req.brief ?? null,
    account_id: req.accountId ?? null,
    formats: req.formats ?? ['1:1', '4:5', '9:16'],
    images: req.images ?? 2,
    with_video: req.withVideo ?? false,
    voiceover: req.voiceover ?? false,
    ground: req.ground ?? true,   // ai-layer default; grounds on Meta winners, degrades loudly to UNGROUNDED without creds
    no_logo: req.noLogo ?? false,
    direction: req.direction ?? null,
  };

  let res: Response;
  try {
    res = await fetch(`${base()}/creative/generate`, {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(START_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err }, '[creative-gen] start request failed');
    throw new AiLayerError('creative-gen start failed', 502);
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new AiLayerError(e?.detail || `creative-gen error ${res.status}`, res.status);
  }
  const data = (await res.json().catch(() => ({}))) as { job_id?: string };
  if (!data.job_id) throw new AiLayerError('creative-gen returned no job_id', 502);
  return data.job_id;
}

/** GET /creative/jobs/{jobId} -> the job (status + results). */
export async function getCreativeJob(jobId: string): Promise<CreativeGenJob> {
  let res: Response;
  try {
    res = await fetch(`${base()}/creative/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { 'X-API-Key': config.aiLayerApiKey },
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err }, '[creative-gen] poll request failed');
    throw new AiLayerError('creative-gen poll failed', 502);
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new AiLayerError(e?.detail || `creative-gen error ${res.status}`, res.status);
  }
  return (await res.json()) as CreativeGenJob;
}

/** GET /creative/assets/{jobId}/{path} -> the raw Response, to stream bytes through the
 *  proxy. `path` may contain a subdir (e.g. winners/winner_06.png) — slashes are kept. */
export async function fetchCreativeAsset(jobId: string, path: string): Promise<Response> {
  const safe = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const url = `${base()}/creative/assets/${encodeURIComponent(jobId)}/${safe}`;
  return fetch(url, {
    method: 'GET',
    headers: { 'X-API-Key': config.aiLayerApiKey },
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
  });
}

/** GET /creative/asset-url/{jobId}/{path} -> presigned R2 URL, or null when storage is
 *  off (404) so the caller byte-proxies the ai-layer's local copy instead. */
export async function fetchCreativeAssetUrl(jobId: string, path: string): Promise<string | null> {
  const safe = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const url = `${base()}/creative/asset-url/${encodeURIComponent(jobId)}/${safe}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-API-Key': config.aiLayerApiKey },
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
  });
  if (res.status === 404) return null;               // storage off -> fall back to byte-proxy
  if (!res.ok) throw new AiLayerError(`asset-url ${res.status}`, res.status);
  const body = (await res.json()) as { url: string };
  return body.url;
}

// ─── Storyboard UGC-video track: quote (free) then paid render ──────────────

export interface CreatorKit {
  name?: string;
  age_range?: string;
  gender?: string;
  appearance?: string;
  wardrobe?: string;
  setting?: string;
  energy?: string;
  voice_id?: string;
}

export interface VideoPlanOpts { seconds?: number; direction?: string; n_shots?: number; creator?: CreatorKit; }
export interface VideoGenOpts {
  voiceover?: boolean; captions?: boolean; sfx?: boolean;
  direction?: string; creator?: CreatorKit; pin_face?: boolean; hero_with_creator?: boolean;
}
export interface VideoQuote {
  clips: number; estimated_usd: number; balance_usd: number | null;
  affordable: boolean; guard_enabled: boolean; shortfall_usd: number;
}
export interface VideoPlan {
  job_id: string; shots: number; duration_s: number; grounded: boolean;
  storyboard: unknown; quote: VideoQuote;
}

/** POST /creative/video/plan — $0, LLM only. 409 if the run has no brand kit. No timeout: LLM planning. */
export function videoPlan(jobId: string, opts: VideoPlanOpts, metaToken?: string): Promise<VideoPlan> {
  return aiFetch('POST', '/creative/video/plan', 'video/plan', {
    metaToken,
    body: { job_id: jobId, seconds: opts.seconds, direction: opts.direction, n_shots: opts.n_shots, creator: opts.creator },
  });
}

/** POST /creative/video/generate — PAID. 409 without a storyboard, 402 if balance can't cover. No timeout: render kickoff. */
export function videoGenerate(jobId: string, opts: VideoGenOpts, metaToken?: string): Promise<{ job_id: string; status: string; clips: number }> {
  return aiFetch('POST', '/creative/video/generate', 'video/generate', {
    metaToken,
    body: {
      job_id: jobId,
      voiceover: opts.voiceover ?? true, captions: opts.captions ?? true, sfx: opts.sfx ?? true,
      direction: opts.direction, creator: opts.creator,
      pin_face: opts.pin_face ?? false, hero_with_creator: opts.hero_with_creator ?? false,
    },
  });
}

// ─── The closed loop: publish → learn → prior/graph ─────────────────────────

/** POST /creative/variants/{id}/published — stamp which Meta ad a variant became. */
export function markPublished(variantId: string, metaAdId: string): Promise<{ status: string }> {
  return aiFetch('POST', `/creative/variants/${encodeURIComponent(variantId)}/published`, 'published', {
    body: { meta_ad_id: metaAdId }, timeoutMs: POLL_TIMEOUT_MS,
  });
}

/** POST /creative/learn — harvest realized performance, rebuild the prior. */
export function learn(accountId: string, metaToken?: string): Promise<Record<string, unknown>> {
  return aiFetch('POST', '/creative/learn', 'learn', {
    body: { account_id: accountId }, metaToken, timeoutMs: ASSET_TIMEOUT_MS,
  });
}

/** GET /creative/prior|graph/{acct} — what this account has proven / structural correlations. */
export function getPrior(accountId: string): Promise<Record<string, unknown>> {
  return aiFetch('GET', `/creative/prior/${encodeURIComponent(accountId)}`, 'prior', { timeoutMs: POLL_TIMEOUT_MS });
}
export function getGraph(accountId: string): Promise<Record<string, unknown>> {
  return aiFetch('GET', `/creative/graph/${encodeURIComponent(accountId)}`, 'graph', { timeoutMs: POLL_TIMEOUT_MS });
}

/** POST /creative/voice/preview — a short TTS sample; returns the fal audio URL. */
export function voicePreview(voiceId?: string, text?: string): Promise<{ url: string }> {
  return aiFetch('POST', '/creative/voice/preview', 'voice preview', {
    body: { voice_id: voiceId, text }, timeoutMs: ASSET_TIMEOUT_MS,
  });
}
