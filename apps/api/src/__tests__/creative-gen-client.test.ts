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
});
