import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { safeFetch, safeJson } from '../utils/safe-fetch.js';
import { CREATIVE_PATTERNS, type VideoDNA } from './creative-patterns.js';
import type { MetaApiService } from './meta-api.js';
import { logger } from '../utils/logger.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Legacy interface kept for backward compat (image-only analysis) */
export interface VisualAnalysis {
  visual_format: string;
  dominant_colors: string[];
  text_placement: string;
  lighting_style: string;
  composition: string;
  key_elements: string[];
  performance_insight: string;
}

export interface AdForAnalysis {
  id: string;
  name: string;
  spend: number;
  roas: number;
  ctr: number;
  thumbnail_url: string;
  video_id: string | null;
}

/* ------------------------------------------------------------------ */
/*  Selection: minimum spend + ROAS-weighted ranking                   */
/* ------------------------------------------------------------------ */

const MIN_SPEND_THRESHOLD = 50;

export function selectAdsForAnalysis(ads: AdForAnalysis[], limit = 5): AdForAnalysis[] {
  return ads
    .filter(a => (a.thumbnail_url || a.video_id) && a.spend >= MIN_SPEND_THRESHOLD)
    .map(a => ({ ad: a, score: a.roas * Math.log(a.spend + 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(a => a.ad);
}

/* ------------------------------------------------------------------ */
/*  Cache helpers                                                      */
/* ------------------------------------------------------------------ */

function getCachedAnalyses(adIds: string[]): Map<string, VideoDNA> {
  const db = getDb();
  const result = new Map<string, VideoDNA>();
  for (const id of adIds) {
    const row = db.prepare('SELECT visual_analysis FROM dna_cache WHERE ad_id = ?').get(id) as { visual_analysis?: string } | undefined;
    if (row?.visual_analysis) {
      try {
        const parsed = JSON.parse(row.visual_analysis);
        // Accept both legacy VisualAnalysis and new VideoDNA
        if (parsed && (parsed.hook_patterns || parsed.visual_format)) {
          result.set(id, parsed);
        }
      } catch { /* skip invalid cache */ }
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Fetch video source URL via Meta Graph API (3-fallback pattern)     */
/* ------------------------------------------------------------------ */

async function fetchVideoSource(
  meta: MetaApiService,
  videoId: string,
  accountId: string,
): Promise<string | null> {
  // Approach 1: Direct video node with source field
  try {
    const data = await meta.get<any>(`/${videoId}`, { fields: 'source' });
    if (data.source) return data.source;
  } catch { /* try next */ }

  // Approach 2: Get via ad account's advideos
  try {
    const data = await meta.get<any>(`/${accountId}/advideos`, {
      filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: [videoId] }]),
      fields: 'source,permalink_url',
    });
    const video = data.data?.[0];
    if (video?.source) return video.source;
  } catch { /* try next */ }

  // Approach 3: Get embed URL
  try {
    const data = await meta.get<any>(`/${videoId}`, { fields: 'permalink_url,embed_html' });
    if (data.embed_html) {
      const srcMatch = data.embed_html.match(/src="([^"]+)"/);
      if (srcMatch) return srcMatch[1];
    }
    if (data.permalink_url) {
      return `https://www.facebook.com${data.permalink_url}`;
    }
  } catch { /* all approaches failed */ }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Download video bytes                                               */
/* ------------------------------------------------------------------ */

async function downloadVideo(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const response = await safeFetch(url, {
      service: 'Video download',
      timeoutMs: 120_000,
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const mimeType = contentType.split(';')[0].trim();
    const buffer = Buffer.from(await response.arrayBuffer());

    // Skip if > 100MB (Gemini File API limit is 2GB but be conservative)
    if (buffer.length > 100 * 1024 * 1024) return null;

    return { buffer, mimeType };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Gemini File API upload (resumable protocol)                        */
/* ------------------------------------------------------------------ */

const GEMINI_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';

async function uploadToGeminiFileApi(
  videoBuffer: Buffer,
  mimeType: string,
): Promise<{ fileUri: string } | null> {
  if (!config.geminiApiKey) return null;

  try {
    // Step 1: Initiate resumable upload
    const initResponse = await safeFetch(`${GEMINI_UPLOAD_URL}?key=${config.geminiApiKey}`, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(videoBuffer.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: { display_name: `ad-video-${Date.now()}` },
      }),
      service: 'Gemini File API init',
      timeoutMs: 30_000,
    });

    if (!initResponse.ok) {
      logger.error(`Gemini File API init error: HTTP ${initResponse.status}`);
      return null;
    }

    const uploadUrl = initResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      logger.error('Gemini File API: No upload URL in response headers');
      return null;
    }

    // Step 2: Upload the bytes
    const uploadResponse = await safeFetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(videoBuffer.length),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: videoBuffer,
      service: 'Gemini File API upload',
      timeoutMs: 120_000,
    });

    if (!uploadResponse.ok) {
      logger.error(`Gemini File API upload error: HTTP ${uploadResponse.status}`);
      return null;
    }

    const data = await safeJson<any>(uploadResponse);
    const fileUri = data?.file?.uri;
    if (!fileUri) {
      logger.error('Gemini File API: No file URI in response');
      return null;
    }

    // Step 3: Poll until file is ACTIVE (processing can take a moment)
    const fileApiBase = 'https://generativelanguage.googleapis.com/v1beta';
    const fileName = data.file.name;
    for (let i = 0; i < 30; i++) {
      const statusResp = await safeFetch(
        `${fileApiBase}/${fileName}?key=${config.geminiApiKey}`,
        { service: 'Gemini File status', timeoutMs: 10_000 },
      );
      if (statusResp.ok) {
        const status = await safeJson<any>(statusResp);
        if (status?.state === 'ACTIVE') return { fileUri };
        if (status?.state === 'FAILED') {
          logger.error('Gemini File API: File processing failed');
          return null;
        }
      }
      // Wait 2s before next poll
      await new Promise(r => setTimeout(r, 2000));
    }

    logger.error('Gemini File API: File processing timed out');
    return null;
  } catch (err: unknown) {
    logger.error({ err }, 'Gemini File API upload failed');
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Gemini video analysis → VideoDNA                                   */
/* ------------------------------------------------------------------ */

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

async function analyzeVideoWithGemini(
  fileUri: string,
  ad: AdForAnalysis,
): Promise<VideoDNA | null> {
  if (!config.geminiApiKey) return null;

  const patternList = Object.entries(CREATIVE_PATTERNS)
    .map(([cat, patterns]) => `${cat}: ${(patterns as readonly string[]).join(', ')}`)
    .join('\n');

  const prompt = `You are a performance creative analyst specializing in paid social ads. Analyze this video ad in detail.

AD CONTEXT: "${ad.name}" — ${ad.roas}x ROAS, $${ad.spend} spend, ${ad.ctr}% CTR

PATTERN TAXONOMY (tag ALL that apply from each category):
${patternList}

Analyze the video for:
1. Hook patterns — what techniques are used in the first 3 seconds?
2. Visual style — camera work, production quality, format
3. Editing style — cut pacing, transitions, effects
4. Audio — voiceover, music, sound design
5. Text overlays — style and placement of on-screen text
6. Color/mood — overall color grading and emotional tone
7. CTA style — how the call-to-action is presented
8. Timing — hook duration, total duration, pacing, cuts per second
9. Content flags — face present? product shot? voiceover? music?
10. Strategic insight — why is this ad performing at this level?
11. Winning elements — top 3 things making this ad work
12. Suggested variations — 3 things to test differently

Respond with ONLY valid JSON matching this exact schema:
{
  "hook_patterns": ["Pattern name from taxonomy"],
  "visual_style": ["Style from taxonomy"],
  "editing_style": ["Style from taxonomy"],
  "audio_style": ["Style from taxonomy"],
  "text_overlay_style": ["Style from taxonomy"],
  "color_mood": ["Mood from taxonomy"],
  "cta_style": ["Style from taxonomy"],
  "hook_duration_seconds": 3,
  "total_duration_seconds": 30,
  "pacing": "fast",
  "cuts_per_second": 0.5,
  "has_face": true,
  "has_product_shot": true,
  "has_text_overlay": true,
  "has_voiceover": true,
  "has_music": true,
  "music_genre": "genre description",
  "language": "en",
  "performance_insight": "Why this works...",
  "winning_elements": ["element 1", "element 2", "element 3"],
  "suggested_variations": ["variation 1", "variation 2", "variation 3"]
}`;

  try {
    const response = await safeFetch(`${GEMINI_URL}?key=${config.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      service: 'Gemini Video Analysis',
      timeoutMs: 120_000,
      body: JSON.stringify({
        contents: [{
          parts: [
            { file_data: { mime_type: 'video/mp4', file_uri: fileUri } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      logger.error(`Gemini Video Analysis error: HTTP ${response.status} — ${errText.slice(0, 200)}`);
      return null;
    }

    const data = await safeJson<any>(response);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      hook_patterns: parsed.hook_patterns || [],
      visual_style: parsed.visual_style || [],
      editing_style: parsed.editing_style || [],
      audio_style: parsed.audio_style || [],
      text_overlay_style: parsed.text_overlay_style || [],
      color_mood: parsed.color_mood || [],
      cta_style: parsed.cta_style || [],
      hook_duration_seconds: parsed.hook_duration_seconds || 3,
      total_duration_seconds: parsed.total_duration_seconds || 30,
      pacing: parsed.pacing || 'medium',
      cuts_per_second: parsed.cuts_per_second || 0,
      has_face: parsed.has_face ?? false,
      has_product_shot: parsed.has_product_shot ?? false,
      has_text_overlay: parsed.has_text_overlay ?? false,
      has_voiceover: parsed.has_voiceover ?? false,
      has_music: parsed.has_music ?? false,
      music_genre: parsed.music_genre || 'unknown',
      language: parsed.language || 'en',
      performance_insight: parsed.performance_insight || '',
      winning_elements: parsed.winning_elements || [],
      suggested_variations: parsed.suggested_variations || [],
    };
  } catch (err: unknown) {
    logger.error({ err }, 'Gemini Video analysis failed');
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Fetch thumbnail as base64 (image fallback)                         */
/* ------------------------------------------------------------------ */

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await safeFetch(url, {
      service: 'Thumbnail fetch',
      timeoutMs: 15_000,
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim();
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // Skip if image is too large (>4MB base64 ~ 3MB raw) — Gemini limit
    if (base64.length > 4 * 1024 * 1024) return null;

    return { base64, mimeType };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Gemini image analysis → partial VideoDNA                           */
/* ------------------------------------------------------------------ */

async function analyzeImageWithGemini(ads: AdForAnalysis[]): Promise<Map<string, VideoDNA>> {
  const results = new Map<string, VideoDNA>();
  if (!config.geminiApiKey) return results;

  const imageResults = await Promise.all(
    ads.map(async ad => ({
      ad,
      image: await fetchImageAsBase64(ad.thumbnail_url),
    }))
  );

  const withImages = imageResults.filter(r => r.image !== null) as
    { ad: AdForAnalysis; image: { base64: string; mimeType: string } }[];

  if (withImages.length === 0) return results;

  const adContext = withImages.map((r, i) =>
    `Image ${i + 1} is for Ad (id: ${r.ad.id}): "${r.ad.name}" — ${r.ad.roas}x ROAS, $${r.ad.spend} spend, ${r.ad.ctr}% CTR`
  ).join('\n');

  const patternList = Object.entries(CREATIVE_PATTERNS)
    .map(([cat, patterns]) => `${cat}: ${(patterns as readonly string[]).join(', ')}`)
    .join('\n');

  const parts: any[] = [
    {
      text: `You are a performance creative analyst. Analyze these ${withImages.length} ad thumbnails.

AD PERFORMANCE CONTEXT:
${adContext}

PATTERN TAXONOMY (tag ALL that apply from each category):
${patternList}

For EACH ad image (in order), analyze and return a JSON object keyed by ad ID. Each value should have:
- hook_patterns, visual_style, editing_style, audio_style, text_overlay_style, color_mood, cta_style (arrays of strings from the taxonomy above — for images, infer what you can see, leave audio/editing as best guesses)
- hook_duration_seconds (estimate), total_duration_seconds (estimate 0 for static)
- pacing: "fast" | "medium" | "slow"
- cuts_per_second: 0 for static
- has_face, has_product_shot, has_text_overlay (booleans)
- has_voiceover: false, has_music: false (can't tell from image)
- music_genre: "unknown", language: "en"
- performance_insight, winning_elements (top 3), suggested_variations (3 ideas)

Respond with ONLY valid JSON:
{ "ad_id_here": { ...fields... } }`
    }
  ];

  for (const r of withImages) {
    parts.push({
      inline_data: {
        mime_type: r.image.mimeType,
        data: r.image.base64,
      },
    });
  }

  try {
    const response = await safeFetch(`${GEMINI_URL}?key=${config.geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      service: 'Gemini Vision',
      timeoutMs: 60_000,
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      logger.error(`Gemini Vision API error: HTTP ${response.status} — ${errText.slice(0, 200)}`);
      return results;
    }

    const data = await safeJson<any>(response);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      for (const r of withImages) {
        const adId = r.ad.id;
        const p = parsed[adId];
        if (p) {
          results.set(adId, {
            hook_patterns: p.hook_patterns || [],
            visual_style: p.visual_style || [],
            editing_style: p.editing_style || [],
            audio_style: p.audio_style || [],
            text_overlay_style: p.text_overlay_style || [],
            color_mood: p.color_mood || [],
            cta_style: p.cta_style || [],
            hook_duration_seconds: p.hook_duration_seconds || 0,
            total_duration_seconds: p.total_duration_seconds || 0,
            pacing: p.pacing || 'medium',
            cuts_per_second: p.cuts_per_second || 0,
            has_face: p.has_face ?? false,
            has_product_shot: p.has_product_shot ?? false,
            has_text_overlay: p.has_text_overlay ?? false,
            has_voiceover: false,
            has_music: false,
            music_genre: 'unknown',
            language: p.language || 'en',
            performance_insight: p.performance_insight || '',
            winning_elements: p.winning_elements || [],
            suggested_variations: p.suggested_variations || [],
          });
        }
      }
    }
  } catch (err: unknown) {
    logger.error({ err }, 'Gemini Vision analysis failed');
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Gemini concurrency limiter — max 2 concurrent video analyses       */
/* ------------------------------------------------------------------ */

const GEMINI_MAX_CONCURRENT = 2;

async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Gemini File API cleanup                                            */
/* ------------------------------------------------------------------ */

const GEMINI_FILE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function deleteGeminiFile(fileName: string): Promise<void> {
  if (!config.geminiApiKey || !fileName) return;
  try {
    await safeFetch(
      `${GEMINI_FILE_API_BASE}/${fileName}?key=${config.geminiApiKey}`,
      { method: 'DELETE', service: 'Gemini File delete', timeoutMs: 10_000 },
    );
    logger.info(`Deleted Gemini file: ${fileName}`);
  } catch (err: unknown) {
    logger.warn({ err }, `Failed to delete Gemini file: ${fileName}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Analyze top ads — video ads get full video analysis via Gemini File API,
 * image ads fall back to thumbnail analysis. Results are cached.
 */
export async function analyzeTopAdVisuals(
  ads: AdForAnalysis[],
  accountId: string,
  meta?: MetaApiService,
): Promise<Map<string, VideoDNA>> {
  const selected = selectAdsForAnalysis(ads);
  if (selected.length === 0) return new Map();

  // Check cache first
  const cached = getCachedAnalyses(selected.map(a => a.id));
  const uncached = selected.filter(a => !cached.has(a.id));

  if (uncached.length === 0) return cached;

  // Split into video ads and image-only ads
  const videoAds = uncached.filter(a => a.video_id && meta);
  const imageAds = uncached.filter(a => !a.video_id || !meta);

  const fresh = new Map<string, VideoDNA>();

  // Process video ads in batches of GEMINI_MAX_CONCURRENT (rate limiting)
  const fallbacks = await processInBatches(videoAds, GEMINI_MAX_CONCURRENT, async (ad): Promise<AdForAnalysis | null> => {
    let uploadedFileName: string | null = null;
    try {
      const sourceUrl = await fetchVideoSource(meta!, ad.video_id!, accountId);
      if (!sourceUrl) {
        return ad;
      }

      const videoData = await downloadVideo(sourceUrl);
      if (!videoData) {
        return ad;
      }

      const uploaded = await uploadToGeminiFileApi(videoData.buffer, videoData.mimeType);
      if (!uploaded) {
        return ad;
      }

      // Extract file name from URI for cleanup (format: files/abc123)
      const uriParts = uploaded.fileUri.match(/files\/[^/]+/);
      uploadedFileName = uriParts ? uriParts[0] : null;

      const dna = await analyzeVideoWithGemini(uploaded.fileUri, ad);
      if (dna) {
        fresh.set(ad.id, dna);
        return null;
      } else {
        return ad;
      }
    } catch (err: unknown) {
      logger.error({ err }, `Video analysis failed for ad ${ad.id}`);
      return ad;
    } finally {
      // Clean up uploaded file from Gemini File API
      if (uploadedFileName) {
        await deleteGeminiFile(uploadedFileName);
      }
    }
  });

  // Merge video fallbacks into imageAds for batch image analysis
  const imageFallbacks = fallbacks.filter((ad): ad is AdForAnalysis => ad !== null);
  const allImageAds = [...imageAds, ...imageFallbacks];

  // Analyze remaining image ads in a single batch call
  if (allImageAds.length > 0) {
    const imageDna = await analyzeImageWithGemini(allImageAds);
    for (const [id, dna] of imageDna) {
      fresh.set(id, dna);
    }
  }

  // Upsert into dna_cache
  const db = getDb();
  for (const [adId, analysis] of fresh) {
    const ad = uncached.find(a => a.id === adId);
    db.prepare(`
      INSERT INTO dna_cache (ad_id, account_id, ad_name, visual_analysis)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ad_id) DO UPDATE SET visual_analysis = excluded.visual_analysis
    `).run(adId, accountId, ad?.name || '', JSON.stringify(analysis));
  }

  // Merge cached + fresh
  const merged = new Map(cached);
  for (const [id, analysis] of fresh) {
    merged.set(id, analysis);
  }

  return merged;
}

/**
 * Build a rich text summary of video DNA for inclusion in Claude prompts.
 */
export function buildVisualSummary(
  analyses: Map<string, VideoDNA>,
  ads: AdForAnalysis[],
): string {
  if (analyses.size === 0) return '';

  const lines: string[] = [];
  for (const ad of ads) {
    const dna = analyses.get(ad.id);
    if (!dna) continue;

    const parts: string[] = [
      `"${ad.name}" (${ad.roas}x ROAS):`,
    ];

    if (dna.hook_patterns?.length) {
      parts.push(`  Hook: ${dna.hook_patterns.join(', ')} (${dna.hook_duration_seconds}s hook)`);
    }
    if (dna.visual_style?.length) {
      parts.push(`  Visual: ${dna.visual_style.join(', ')}`);
    }
    if (dna.editing_style?.length) {
      parts.push(`  Editing: ${dna.editing_style.join(', ')} (${dna.pacing} pacing, ${dna.cuts_per_second} cuts/s)`);
    }
    if (dna.audio_style?.length) {
      parts.push(`  Audio: ${dna.audio_style.join(', ')}${dna.music_genre !== 'unknown' ? ` [${dna.music_genre}]` : ''}`);
    }
    if (dna.color_mood?.length) {
      parts.push(`  Color: ${dna.color_mood.join(', ')}`);
    }
    if (dna.text_overlay_style?.length) {
      parts.push(`  Text: ${dna.text_overlay_style.join(', ')}`);
    }
    if (dna.cta_style?.length) {
      parts.push(`  CTA: ${dna.cta_style.join(', ')}`);
    }
    if (dna.winning_elements?.length) {
      parts.push(`  Winning elements: ${dna.winning_elements.join('; ')}`);
    }
    if (dna.performance_insight) {
      parts.push(`  Insight: ${dna.performance_insight}`);
    }

    lines.push(parts.join('\n'));
  }

  return lines.length > 0 ? lines.join('\n\n') : '';
}
