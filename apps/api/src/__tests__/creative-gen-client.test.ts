import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../config.js', () => ({
  config: { aiLayerUrl: 'http://ai-layer:8000', aiLayerApiKey: 'k' },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function ok(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') };
}

describe('creative-gen-client', () => {
  beforeEach(() => mockFetch.mockReset());

  it('startCreativeGen forwards direction in the body', async () => {
    mockFetch.mockResolvedValueOnce(ok({ job_id: 'j1' }));
    const { startCreativeGen } = await import('../services/creative-gen-client.js');
    await startCreativeGen({ brief: { brand_name: 'X' }, direction: 'tall blonde, rooftop' });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://ai-layer:8000/creative/generate');
    expect(JSON.parse(opts.body).direction).toBe('tall blonde, rooftop');
  });

  it('videoPlan forwards creator + n_shots + seconds', async () => {
    mockFetch.mockResolvedValueOnce(ok({ job_id: 'j1', shots: 3, duration_s: 24, grounded: true, storyboard: {}, quote: {} }));
    const { videoPlan } = await import('../services/creative-gen-client.js');
    await videoPlan('j1', { seconds: 24, direction: 'cozy', n_shots: 3, creator: { name: 'Maya', gender: 'woman' } });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.job_id).toBe('j1');
    expect(body.n_shots).toBe(3);
    expect(body.creator).toEqual({ name: 'Maya', gender: 'woman' });
  });

  it('videoGenerate forwards direction, creator, pin_face, hero_with_creator', async () => {
    mockFetch.mockResolvedValueOnce(ok({ job_id: 'j1', status: 'queued', clips: 3 }));
    const { videoGenerate } = await import('../services/creative-gen-client.js');
    await videoGenerate('j1', {
      voiceover: true, captions: true, sfx: false,
      direction: 'cozy', creator: { name: 'Maya' }, pin_face: true, hero_with_creator: true,
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.direction).toBe('cozy');
    expect(body.creator).toEqual({ name: 'Maya' });
    expect(body.pin_face).toBe(true);
    expect(body.hero_with_creator).toBe(true);
    expect(body.sfx).toBe(false);
  });
});
