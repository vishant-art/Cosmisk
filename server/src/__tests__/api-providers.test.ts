import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FluxProvider,
  HeyGenProvider,
  KlingProvider,
  CreatifyProvider,
  getProvider,
  getAllProviders,
} from '../services/api-providers.js';

// Mock config with API keys set
vi.mock('../config.js', () => ({
  config: {
    fluxApiKey: 'test-flux-key',
    heygenApiKey: 'test-heygen-key',
    klingApiKey: 'test-kling-key',
    creatifyApiKey: 'test-creatify-key',
    elevenLabsApiKey: 'test-elevenlabs-key',
    nanoBananaApiKey: 'test-nanobanana-key',
    n8nVideoWebhook: 'https://n8n.test/webhook',
  },
}));

// Mock safe-fetch
const mockSafeFetch = vi.fn();
const mockFetchJson = vi.fn();
const mockSafeJson = vi.fn();

vi.mock('../utils/safe-fetch.js', () => ({
  safeFetch: (...args: any[]) => mockSafeFetch(...args),
  fetchJson: (...args: any[]) => mockFetchJson(...args),
  safeJson: (...args: any[]) => mockSafeJson(...args),
  ExternalApiError: class ExternalApiError extends Error {
    constructor(service: string, statusCode: number | null, message: string) {
      super(`[${service}] ${message}`);
      this.name = 'ExternalApiError';
    }
  },
}));

beforeEach(() => {
  mockSafeFetch.mockReset();
  mockFetchJson.mockReset();
  mockSafeJson.mockReset();
});

/* ------------------------------------------------------------------ */
/*  Provider selection                                                 */
/* ------------------------------------------------------------------ */

describe('getProvider', () => {
  it('should return correct provider by name', () => {
    expect(getProvider('flux').name).toBe('flux');
    expect(getProvider('heygen').name).toBe('heygen');
    expect(getProvider('kling').name).toBe('kling');
    expect(getProvider('creatify').name).toBe('creatify');
  });

  it('should default to kling for unknown provider', () => {
    expect(getProvider('nonexistent').name).toBe('kling');
  });

  it('should have all expected providers registered', () => {
    const all = getAllProviders();
    expect(Object.keys(all)).toEqual(
      expect.arrayContaining(['flux', 'heygen', 'kling', 'creatify', 'elevenlabs', 'nanobanana', 'veo3'])
    );
  });
});

/* ------------------------------------------------------------------ */
/*  FluxProvider                                                       */
/* ------------------------------------------------------------------ */

describe('FluxProvider', () => {
  const provider = new FluxProvider();

  it('should return processing status with job_id for async generation', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: true,
    });
    mockSafeJson.mockResolvedValueOnce({ id: 'flux-job-123' });

    const result = await provider.generate({ format: 'static_ad', prompt: 'A beautiful product' });
    expect(result.status).toBe('processing');
    expect(result.job_id).toBe('flux-job-123');
    expect(result.cost_cents).toBe(4);
  });

  it('should return completed with output_url for direct result', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });
    mockSafeJson.mockResolvedValueOnce({ sample: 'https://cdn.test/image.png' });

    const result = await provider.generate({ format: 'static_ad', prompt: 'test' });
    expect(result.status).toBe('completed');
    expect(result.output_url).toBe('https://cdn.test/image.png');
  });

  it('should cost more for carousel format', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });
    mockSafeJson.mockResolvedValueOnce({ id: 'job-1' });

    const result = await provider.generate({ format: 'carousel', prompt: 'test' });
    expect(result.cost_cents).toBe(20);
  });

  it('should return failed on HTTP error', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    });

    const result = await provider.generate({ format: 'static_ad', prompt: 'test' });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('500');
  });

  it('should check status and return completed when Ready', async () => {
    mockFetchJson.mockResolvedValueOnce({
      status: 'Ready',
      result: { sample: 'https://cdn.test/result.png' },
    });

    const status = await provider.checkStatus('job-123');
    expect(status.status).toBe('completed');
    expect(status.output_url).toBe('https://cdn.test/result.png');
  });

  it('should return processing when not ready', async () => {
    mockFetchJson.mockResolvedValueOnce({ status: 'Pending' });

    const status = await provider.checkStatus('job-123');
    expect(status.status).toBe('processing');
  });

  it('should return failed on moderated content', async () => {
    mockFetchJson.mockResolvedValueOnce({ status: 'Request Moderated' });

    const status = await provider.checkStatus('job-123');
    expect(status.status).toBe('failed');
    expect(status.error).toBe('Request Moderated');
  });
});

/* ------------------------------------------------------------------ */
/*  HeyGenProvider                                                     */
/* ------------------------------------------------------------------ */

describe('HeyGenProvider', () => {
  const provider = new HeyGenProvider();

  it('should require script with sections', async () => {
    const result = await provider.generate({ format: 'ugc_talking_head' });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Script with sections required');
  });

  it('should send correct request to HeyGen API', async () => {
    mockFetchJson.mockResolvedValueOnce({
      data: { video_id: 'hg-vid-123' },
    });

    const result = await provider.generate({
      format: 'ugc_talking_head',
      script: {
        sections: [
          { dialogue: 'Hello world!' },
          { dialogue: 'Buy now!' },
        ],
      },
      avatar: 'custom-avatar',
      voice_id: 'custom-voice',
      aspect_ratio: '9:16',
    });

    expect(result.status).toBe('processing');
    expect(result.job_id).toBe('hg-vid-123');
    expect(result.cost_cents).toBe(99);

    // Verify request body
    const body = JSON.parse(mockFetchJson.mock.calls[0][1].body);
    expect(body.video_inputs[0].character.avatar_id).toBe('custom-avatar');
    expect(body.video_inputs[0].voice.voice_id).toBe('custom-voice');
    expect(body.video_inputs[0].voice.input_text).toBe('Hello world! Buy now!');
  });

  it('should check status correctly', async () => {
    mockFetchJson.mockResolvedValueOnce({
      data: {
        status: 'completed',
        video_url: 'https://cdn.heygen.com/video.mp4',
        thumbnail_url: 'https://cdn.heygen.com/thumb.jpg',
      },
    });

    const status = await provider.checkStatus('vid-123');
    expect(status.status).toBe('completed');
    expect(status.output_url).toBe('https://cdn.heygen.com/video.mp4');
    expect(status.thumbnail_url).toBe('https://cdn.heygen.com/thumb.jpg');
  });

  it('should return processing for pending status', async () => {
    mockFetchJson.mockResolvedValueOnce({
      data: { status: 'pending' },
    });

    const status = await provider.checkStatus('vid-123');
    expect(status.status).toBe('processing');
  });
});

/* ------------------------------------------------------------------ */
/*  KlingProvider                                                      */
/* ------------------------------------------------------------------ */

describe('KlingProvider', () => {
  const provider = new KlingProvider();

  it('should send video generation request', async () => {
    mockFetchJson.mockResolvedValueOnce({
      data: { task_id: 'kling-task-123' },
    });

    const result = await provider.generate({
      format: 'skit',
      prompt: 'A funny skit about coffee',
      duration: '10',
      aspect_ratio: '16:9',
    });

    expect(result.status).toBe('processing');
    expect(result.job_id).toBe('kling-task-123');
    expect(result.cost_cents).toBe(50);

    const body = JSON.parse(mockFetchJson.mock.calls[0][1].body);
    expect(body.prompt).toBe('A funny skit about coffee');
    expect(body.duration).toBe('10');
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.model).toBe('kling-v3');
  });

  it('should build prompt from script when no prompt given', async () => {
    mockFetchJson.mockResolvedValueOnce({
      data: { task_id: 'task-1' },
    });

    await provider.generate({
      format: 'skit',
      script: {
        sections: [
          { timing: '0:00-0:03', visual: 'Close-up of coffee cup' },
          { timing: '0:03-0:06', visual: 'Person smiling' },
        ],
      },
    });

    const body = JSON.parse(mockFetchJson.mock.calls[0][1].body);
    expect(body.prompt).toContain('Close-up of coffee cup');
    expect(body.prompt).toContain('Person smiling');
  });

  it('should check status and return completed on succeed', async () => {
    mockFetchJson.mockResolvedValueOnce({
      data: {
        task_status: 'succeed',
        task_result: {
          videos: [{ url: 'https://cdn.kling.com/video.mp4', thumbnail_url: 'https://cdn.kling.com/thumb.jpg' }],
        },
      },
    });

    const status = await provider.checkStatus('task-123');
    expect(status.status).toBe('completed');
    expect(status.output_url).toBe('https://cdn.kling.com/video.mp4');
  });

  it('should return failed on failed status', async () => {
    mockFetchJson.mockResolvedValueOnce({
      data: { task_status: 'failed', task_status_msg: 'Content violation' },
    });

    const status = await provider.checkStatus('task-123');
    expect(status.status).toBe('failed');
    expect(status.error).toBe('Content violation');
  });
});

/* ------------------------------------------------------------------ */
/*  CreatifyProvider                                                   */
/* ------------------------------------------------------------------ */

describe('CreatifyProvider', () => {
  const provider = new CreatifyProvider();

  it('should require product_url', async () => {
    const result = await provider.generate({ format: 'product_demo' });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('product_url required');
  });

  it('should send product demo request', async () => {
    mockFetchJson.mockResolvedValueOnce({ id: 'creatify-job-1' });

    const result = await provider.generate({
      format: 'product_demo',
      product_url: 'https://example.com/product',
      aspect_ratio: '9:16',
      duration: '30',
    });

    expect(result.status).toBe('processing');
    expect(result.job_id).toBe('creatify-job-1');
    expect(result.cost_cents).toBe(75);
  });

  it('should check status and return completed when done', async () => {
    mockFetchJson.mockResolvedValueOnce({
      status: 'done',
      video_url: 'https://cdn.creatify.ai/video.mp4',
      thumbnail_url: 'https://cdn.creatify.ai/thumb.jpg',
    });

    const status = await provider.checkStatus('job-1');
    expect(status.status).toBe('completed');
    expect(status.output_url).toBe('https://cdn.creatify.ai/video.mp4');
  });

  it('should return failed on error status', async () => {
    mockFetchJson.mockResolvedValueOnce({
      status: 'failed',
      error_message: 'Invalid product URL',
    });

    const status = await provider.checkStatus('job-1');
    expect(status.status).toBe('failed');
    expect(status.error).toBe('Invalid product URL');
  });
});

/* ------------------------------------------------------------------ */
/*  Response normalization                                             */
/* ------------------------------------------------------------------ */

describe('Response normalization', () => {
  it('all providers should implement CreativeProvider interface', () => {
    const all = getAllProviders();
    for (const [name, provider] of Object.entries(all)) {
      expect(provider.name).toBe(name);
      expect(typeof provider.generate).toBe('function');
      expect(typeof provider.checkStatus).toBe('function');
    }
  });

  it('all providers return GenerateResult shape on failure', async () => {
    // Reset mocks to return errors
    mockFetchJson.mockRejectedValue(new Error('Network error'));
    mockSafeFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'error',
    });
    mockSafeJson.mockResolvedValue(null);

    const providers = [
      new KlingProvider(),
      new CreatifyProvider(),
    ];

    for (const p of providers) {
      const result = await p.generate({
        format: 'test',
        prompt: 'test',
        product_url: 'https://example.com',
      });
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('cost_cents');
      expect(['completed', 'processing', 'failed']).toContain(result.status);
    }
  });
});
