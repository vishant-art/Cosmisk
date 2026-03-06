/**
 * Unified API provider layer for creative generation.
 * Each provider implements the same interface for generate + status polling.
 */

import { config } from '../config.js';
import { fetchJson, safeFetch, safeJson, ExternalApiError } from '../utils/safe-fetch.js';

/* ------------------------------------------------------------------ */
/*  Common types                                                       */
/* ------------------------------------------------------------------ */

export interface GenerateResult {
  status: 'completed' | 'processing' | 'failed';
  job_id?: string;       // for async polling
  output_url?: string;   // immediate result
  thumbnail_url?: string;
  cost_cents: number;
  error?: string;
}

export interface StatusResult {
  status: 'completed' | 'processing' | 'failed';
  output_url?: string;
  thumbnail_url?: string;
  error?: string;
}

export interface CreativeProvider {
  name: string;
  generate(params: ProviderParams): Promise<GenerateResult>;
  checkStatus(jobId: string): Promise<StatusResult>;
}

export interface ProviderParams {
  format: string;
  script?: any;        // parsed script object from Claude
  prompt?: string;      // for image providers
  aspect_ratio?: string;
  duration?: string;
  avatar?: string;
  voice_id?: string;
  product_url?: string; // for Creatify product demos
  reference_image_url?: string;
}

/* ------------------------------------------------------------------ */
/*  Flux (BFL) — Static images, carousels                              */
/* ------------------------------------------------------------------ */

export class FluxProvider implements CreativeProvider {
  name = 'flux';

  async generate(params: ProviderParams): Promise<GenerateResult> {
    const apiKey = config.fluxApiKey;
    if (!apiKey) {
      return { status: 'failed', cost_cents: 0, error: 'FLUX_API_KEY not configured' };
    }

    const prompt = params.prompt || this.buildPromptFromScript(params.script, params.format);
    const dimensions = mapAspectRatio(params.aspect_ratio || '1:1');

    try {
      const response = await safeFetch('https://api.bfl.ml/v1/flux-pro-1.1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Key': apiKey,
        },
        body: JSON.stringify({
          prompt,
          width: dimensions.width,
          height: dimensions.height,
        }),
        service: 'Flux',
        timeoutMs: 60_000,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        return { status: 'failed', cost_cents: 0, error: `HTTP ${response.status}: ${errText}` };
      }

      const data = await safeJson<any>(response);
      if (!data) {
        return { status: 'failed', cost_cents: 0, error: 'Invalid JSON from Flux' };
      }

      // Flux returns an async task — need to poll for result
      if (data.id) {
        return {
          status: 'processing',
          job_id: data.id,
          cost_cents: params.format === 'carousel' ? 20 : 4,
        };
      }

      // Direct result
      return {
        status: 'completed',
        output_url: data.sample || data.url || data.image_url,
        cost_cents: params.format === 'carousel' ? 20 : 4,
      };
    } catch (err: any) {
      return { status: 'failed', cost_cents: 0, error: err.message };
    }
  }

  async checkStatus(jobId: string): Promise<StatusResult> {
    const apiKey = config.fluxApiKey;
    if (!apiKey) return { status: 'failed', error: 'FLUX_API_KEY not configured' };

    try {
      const data = await fetchJson<any>(`https://api.bfl.ml/v1/get_result?id=${jobId}`, {
        headers: { 'X-Key': apiKey },
        service: 'Flux',
      });

      if (data.status === 'Ready') {
        return {
          status: 'completed',
          output_url: data.result?.sample || data.result?.url,
        };
      }
      if (data.status === 'Error' || data.status === 'Request Moderated') {
        return { status: 'failed', error: data.status };
      }
      return { status: 'processing' };
    } catch (err: any) {
      return { status: 'failed', error: err.message };
    }
  }

  private buildPromptFromScript(script: any, format: string): string {
    if (!script?.sections) return `Professional advertisement for ${format}`;
    // Use text overlays and visual descriptions from the script
    const visuals = script.sections
      .map((s: any) => s.visual || s.text_overlay)
      .filter(Boolean)
      .join('. ');
    return visuals || `Professional ${format} advertisement`;
  }
}

/* ------------------------------------------------------------------ */
/*  NanoBanana — Existing image gen (wrap existing pattern)            */
/* ------------------------------------------------------------------ */

export class NanoBananaProvider implements CreativeProvider {
  name = 'nanobanana';

  async generate(params: ProviderParams): Promise<GenerateResult> {
    const apiKey = config.nanoBananaApiKey;
    if (!apiKey) {
      return { status: 'failed', cost_cents: 0, error: 'NANO_BANANA_API_KEY not configured' };
    }

    const prompt = params.prompt || this.buildPromptFromScript(params.script, params.format);
    const dimensions = mapAspectRatio(params.aspect_ratio || '1:1');

    try {
      const data = await fetchJson<any>('https://api.nanobanana.com/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          width: dimensions.width,
          height: dimensions.height,
          ...(params.reference_image_url ? { reference_image: params.reference_image_url } : {}),
        }),
        service: 'NanoBanana',
        timeoutMs: 60_000,
      });

      const imageUrl = data.image_url || data.url || data.output?.url || data.data?.url;
      if (imageUrl) {
        return {
          status: 'completed',
          output_url: imageUrl,
          cost_cents: 4,
        };
      }

      return { status: 'failed', cost_cents: 0, error: 'No image URL in response' };
    } catch (err: any) {
      return { status: 'failed', cost_cents: 0, error: err.message };
    }
  }

  async checkStatus(_jobId: string): Promise<StatusResult> {
    // NanoBanana is synchronous — no polling needed
    return { status: 'completed' };
  }

  private buildPromptFromScript(script: any, format: string): string {
    if (!script?.sections) return `Professional advertisement for ${format}`;
    const visuals = script.sections
      .map((s: any) => s.visual || s.text_overlay)
      .filter(Boolean)
      .join('. ');
    return visuals || `Professional ${format} advertisement`;
  }
}

/* ------------------------------------------------------------------ */
/*  HeyGen — Avatar videos (UGC, podcast, testimonial)                 */
/* ------------------------------------------------------------------ */

export class HeyGenProvider implements CreativeProvider {
  name = 'heygen';

  async generate(params: ProviderParams): Promise<GenerateResult> {
    const apiKey = config.heygenApiKey;
    if (!apiKey) {
      return { status: 'failed', cost_cents: 0, error: 'HEYGEN_API_KEY not configured' };
    }

    const script = params.script;
    if (!script?.sections?.length) {
      return { status: 'failed', cost_cents: 0, error: 'Script with sections required for HeyGen' };
    }

    // Build the full dialogue from script sections
    const fullDialogue = script.sections
      .map((s: any) => s.dialogue)
      .filter(Boolean)
      .join(' ');

    try {
      const data = await fetchJson<any>('https://api.heygen.com/v2/video/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({
          video_inputs: [{
            character: {
              type: 'avatar',
              avatar_id: params.avatar || 'default',
              avatar_style: 'normal',
            },
            voice: {
              type: 'text',
              input_text: fullDialogue,
              voice_id: params.voice_id || 'default',
            },
          }],
          dimension: mapAspectRatioHeyGen(params.aspect_ratio || '9:16'),
        }),
        service: 'HeyGen',
        timeoutMs: 30_000,
      });

      if (data.data?.video_id) {
        return {
          status: 'processing',
          job_id: data.data.video_id,
          cost_cents: 99,
        };
      }

      return { status: 'failed', cost_cents: 0, error: data.message || 'No video_id returned' };
    } catch (err: any) {
      return { status: 'failed', cost_cents: 0, error: err.message };
    }
  }

  async checkStatus(jobId: string): Promise<StatusResult> {
    const apiKey = config.heygenApiKey;
    if (!apiKey) return { status: 'failed', error: 'HEYGEN_API_KEY not configured' };

    try {
      const data = await fetchJson<any>(`https://api.heygen.com/v1/video_status.get?video_id=${jobId}`, {
        headers: { 'X-Api-Key': apiKey },
        service: 'HeyGen',
      });

      if (data.data?.status === 'completed') {
        return {
          status: 'completed',
          output_url: data.data.video_url,
          thumbnail_url: data.data.thumbnail_url,
        };
      }
      if (data.data?.status === 'failed') {
        return { status: 'failed', error: data.data.error || 'HeyGen generation failed' };
      }
      return { status: 'processing' };
    } catch (err: any) {
      return { status: 'failed', error: err.message };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Kling 3.0 — General video gen (skits, before/after, B-roll)        */
/* ------------------------------------------------------------------ */

export class KlingProvider implements CreativeProvider {
  name = 'kling';

  async generate(params: ProviderParams): Promise<GenerateResult> {
    const apiKey = config.klingApiKey;
    if (!apiKey) {
      return { status: 'failed', cost_cents: 0, error: 'KLING_API_KEY not configured' };
    }

    const prompt = params.prompt || this.buildPromptFromScript(params.script, params.format);

    try {
      const data = await fetchJson<any>('https://api.klingai.com/v1/videos/text2video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          duration: params.duration || '5',
          aspect_ratio: params.aspect_ratio || '9:16',
          model: 'kling-v3',
        }),
        service: 'Kling',
        timeoutMs: 30_000,
      });

      if (data.data?.task_id) {
        return {
          status: 'processing',
          job_id: data.data.task_id,
          cost_cents: 50,
        };
      }

      return { status: 'failed', cost_cents: 0, error: data.message || 'No task_id returned' };
    } catch (err: any) {
      return { status: 'failed', cost_cents: 0, error: err.message };
    }
  }

  async checkStatus(jobId: string): Promise<StatusResult> {
    const apiKey = config.klingApiKey;
    if (!apiKey) return { status: 'failed', error: 'KLING_API_KEY not configured' };

    try {
      const data = await fetchJson<any>(`https://api.klingai.com/v1/videos/text2video/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        service: 'Kling',
      });

      if (data.data?.task_status === 'succeed') {
        const video = data.data.task_result?.videos?.[0];
        return {
          status: 'completed',
          output_url: video?.url,
          thumbnail_url: video?.thumbnail_url,
        };
      }
      if (data.data?.task_status === 'failed') {
        return { status: 'failed', error: data.data.task_status_msg || 'Kling generation failed' };
      }
      return { status: 'processing' };
    } catch (err: any) {
      return { status: 'failed', error: err.message };
    }
  }

  private buildPromptFromScript(script: any, format: string): string {
    if (!script?.sections) return `Create a ${format} video advertisement`;
    return script.sections
      .map((s: any) => `[${s.timing || ''}] ${s.visual || ''}`)
      .filter((s: string) => s.trim().length > 3)
      .join('. ');
  }
}

/* ------------------------------------------------------------------ */
/*  Creatify — Product demo videos from URL                            */
/* ------------------------------------------------------------------ */

export class CreatifyProvider implements CreativeProvider {
  name = 'creatify';

  async generate(params: ProviderParams): Promise<GenerateResult> {
    const apiKey = config.creatifyApiKey;
    if (!apiKey) {
      return { status: 'failed', cost_cents: 0, error: 'CREATIFY_API_KEY not configured' };
    }

    if (!params.product_url) {
      return { status: 'failed', cost_cents: 0, error: 'product_url required for Creatify' };
    }

    try {
      const data = await fetchJson<any>('https://api.creatify.ai/api/videos/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          url: params.product_url,
          aspect_ratio: params.aspect_ratio || '9:16',
          duration: params.duration || '30',
        }),
        service: 'Creatify',
        timeoutMs: 30_000,
      });

      if (data.id) {
        return {
          status: 'processing',
          job_id: data.id,
          cost_cents: 75,
        };
      }

      return { status: 'failed', cost_cents: 0, error: 'No job id returned from Creatify' };
    } catch (err: any) {
      return { status: 'failed', cost_cents: 0, error: err.message };
    }
  }

  async checkStatus(jobId: string): Promise<StatusResult> {
    const apiKey = config.creatifyApiKey;
    if (!apiKey) return { status: 'failed', error: 'CREATIFY_API_KEY not configured' };

    try {
      const data = await fetchJson<any>(`https://api.creatify.ai/api/videos/${jobId}/`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        service: 'Creatify',
      });

      if (data.status === 'done') {
        return {
          status: 'completed',
          output_url: data.video_url || data.output,
          thumbnail_url: data.thumbnail_url,
        };
      }
      if (data.status === 'failed' || data.status === 'error') {
        return { status: 'failed', error: data.error_message || 'Creatify generation failed' };
      }
      return { status: 'processing' };
    } catch (err: any) {
      return { status: 'failed', error: err.message };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  ElevenLabs — Voice generation (used for localization, voiceovers)   */
/* ------------------------------------------------------------------ */

export class ElevenLabsProvider implements CreativeProvider {
  name = 'elevenlabs';

  async generate(params: ProviderParams): Promise<GenerateResult> {
    const apiKey = config.elevenLabsApiKey;
    if (!apiKey) {
      return { status: 'failed', cost_cents: 0, error: 'ELEVENLABS_API_KEY not configured' };
    }

    const text = params.prompt || this.extractDialogue(params.script);
    if (!text) {
      return { status: 'failed', cost_cents: 0, error: 'No text/dialogue for voice generation' };
    }

    const voiceId = params.voice_id || 'pNInz6obpgDQGcFmaJgB'; // default "Adam"

    try {
      const response = await safeFetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
        service: 'ElevenLabs',
        timeoutMs: 60_000,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        return { status: 'failed', cost_cents: 0, error: `HTTP ${response.status}: ${errText}` };
      }

      // ElevenLabs returns audio directly as binary — we'd need to upload this somewhere
      // For now, return the audio as a blob URL placeholder
      // In production, you'd upload to S3/GCS and return the URL
      const costCents = Math.ceil(text.length / 1000 * 12); // ~$0.12 per 1k chars

      return {
        status: 'completed',
        output_url: `elevenlabs://generated/${Date.now()}`, // placeholder — needs file upload
        cost_cents: costCents,
      };
    } catch (err: any) {
      return { status: 'failed', cost_cents: 0, error: err.message };
    }
  }

  async checkStatus(_jobId: string): Promise<StatusResult> {
    // ElevenLabs is synchronous
    return { status: 'completed' };
  }

  private extractDialogue(script: any): string {
    if (!script?.sections) return '';
    return script.sections
      .map((s: any) => s.dialogue)
      .filter(Boolean)
      .join(' ');
  }
}

/* ------------------------------------------------------------------ */
/*  Veo3 — Video via n8n webhook (wrap existing)                       */
/* ------------------------------------------------------------------ */

export class Veo3Provider implements CreativeProvider {
  name = 'veo3';

  async generate(params: ProviderParams): Promise<GenerateResult> {
    const webhookUrl = config.n8nVideoWebhook;
    if (!webhookUrl) {
      return { status: 'failed', cost_cents: 0, error: 'N8N_VIDEO_WEBHOOK not configured' };
    }

    const script = params.prompt || this.extractDialogue(params.script);

    try {
      const data = await fetchJson<any>(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          duration: params.duration || '30s',
          aspect_ratio: params.aspect_ratio || '9:16',
          avatar: params.avatar || 'sophia',
          timestamp: new Date().toISOString(),
        }),
        service: 'Veo3',
        timeoutMs: 30_000,
      });

      // n8n might return immediately with video or async job ID
      if (data.video_url) {
        return {
          status: 'completed',
          output_url: data.video_url,
          cost_cents: 50,
        };
      }

      const jobId = data.id || data.generation_id || data.executionId;
      if (jobId) {
        return {
          status: 'processing',
          job_id: String(jobId),
          cost_cents: 50,
        };
      }

      return { status: 'failed', cost_cents: 0, error: 'No video or job ID from Veo3' };
    } catch (err: any) {
      return { status: 'failed', cost_cents: 0, error: err.message };
    }
  }

  async checkStatus(jobId: string): Promise<StatusResult> {
    const webhookUrl = config.n8nVideoWebhook;
    if (!webhookUrl) return { status: 'failed', error: 'N8N_VIDEO_WEBHOOK not configured' };

    try {
      const statusUrl = webhookUrl.replace(/\/?$/, '') + '/status';
      const data = await fetchJson<any>(`${statusUrl}?generation_id=${jobId}`, {
        service: 'Veo3',
      });

      if (data.status === 'completed' && data.video_url) {
        return { status: 'completed', output_url: data.video_url };
      }
      if (data.status === 'failed') {
        return { status: 'failed', error: 'Veo3 generation failed' };
      }
      return { status: 'processing' };
    } catch (err: any) {
      return { status: 'failed', error: err.message };
    }
  }

  private extractDialogue(script: any): string {
    if (!script?.sections) return '';
    return script.sections
      .map((s: any) => s.dialogue || s.visual)
      .filter(Boolean)
      .join('. ');
  }
}

/* ------------------------------------------------------------------ */
/*  Provider registry                                                   */
/* ------------------------------------------------------------------ */

const providers: Record<string, CreativeProvider> = {
  flux: new FluxProvider(),
  nanobanana: new NanoBananaProvider(),
  heygen: new HeyGenProvider(),
  kling: new KlingProvider(),
  creatify: new CreatifyProvider(),
  elevenlabs: new ElevenLabsProvider(),
  veo3: new Veo3Provider(),
};

export function getProvider(name: string): CreativeProvider {
  return providers[name] || providers['kling']; // default to Kling for unknown providers
}

export function getAllProviders(): Record<string, CreativeProvider> {
  return providers;
}

/* ------------------------------------------------------------------ */
/*  Shared utilities                                                    */
/* ------------------------------------------------------------------ */

function mapAspectRatio(ratio: string): { width: number; height: number } {
  switch (ratio) {
    case '9:16': return { width: 768, height: 1344 };
    case '16:9': return { width: 1344, height: 768 };
    case '4:5':  return { width: 864, height: 1080 };
    case '1:1':
    default:     return { width: 1024, height: 1024 };
  }
}

function mapAspectRatioHeyGen(ratio: string): { width: number; height: number } {
  switch (ratio) {
    case '9:16': return { width: 720, height: 1280 };
    case '16:9': return { width: 1280, height: 720 };
    case '1:1':
    default:     return { width: 1080, height: 1080 };
  }
}
