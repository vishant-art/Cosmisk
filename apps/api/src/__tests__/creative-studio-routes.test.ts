import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// GET /asset/:jobId/* is intentionally UNAUTHENTICATED (the jobId is the capability
// token so <img>/<video> tags can load without a JWT). Downstream storage.py builds
// the R2 key by plain concatenation, so the 32-hex regex on jobId is the ENTIRE
// control against an anon caller presigning arbitrary bucket objects. Test it.

const mockAssetUrl = vi.fn();
const mockAsset = vi.fn();

vi.mock('../db/adapter.js', () => ({
  getDbAdapter: () => ({
    run: async () => ({ changes: 1, lastInsertRowid: null }),
    get: async () => undefined,
    all: async () => [],
  }),
}));
vi.mock('../boot/meta-helpers.js', () => ({
  getMetaTokenForUser: async () => null,
}));
vi.mock('../services/creative-gen-client.js', () => ({
  creativeGenEnabled: () => false,
  startCreativeGen: vi.fn(),
  getCreativeJob: vi.fn(),
  fetchCreativeAsset: (...args: unknown[]) => mockAsset(...args),
  fetchCreativeAssetUrl: (...args: unknown[]) => mockAssetUrl(...args),
  videoPlan: vi.fn(),
  videoGenerate: vi.fn(),
  markPublished: vi.fn(),
  learn: vi.fn(),
  getPrior: vi.fn(),
  getGraph: vi.fn(),
  voicePreview: vi.fn(),
}));

const { creativeStudioRoutes } = await import('../routes/creative-studio.js');

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  // The sibling routes in this module use app.authenticate in preHandler; stub it
  // so registration succeeds. The asset route under test never invokes it.
  app.decorate('authenticate', async () => {});
  await app.register(creativeStudioRoutes, { prefix: '/creative-studio' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  mockAssetUrl.mockReset();
  mockAsset.mockReset();
});

const HEX_ID = 'a'.repeat(32); // uuid4().hex shape: 32 lowercase hex chars

describe('GET /creative-studio/asset/:jobId/*', () => {
  it('400 on a non-hex jobId (key-prefix selector like backups/db.sql)', async () => {
    const r = await app.inject({ method: 'GET', url: '/creative-studio/asset/backups/db.sql' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ success: false, error: 'bad path' });
    // the whole point: the ai-layer client is never reached, so no presign is minted
    expect(mockAssetUrl).not.toHaveBeenCalled();
    expect(mockAsset).not.toHaveBeenCalled();
  });

  it('400 on uppercase hex (uuid4().hex is lowercase only)', async () => {
    const r = await app.inject({ method: 'GET', url: `/creative-studio/asset/${'A'.repeat(32)}/final.mp4` });
    expect(r.statusCode).toBe(400);
    expect(mockAssetUrl).not.toHaveBeenCalled();
  });

  it('400 on .. traversal in the file segment', async () => {
    const r = await app.inject({ method: 'GET', url: `/creative-studio/asset/${HEX_ID}/..%2f..%2fsecrets.env` });
    expect(r.statusCode).toBe(400);
    expect(mockAssetUrl).not.toHaveBeenCalled();
    expect(mockAsset).not.toHaveBeenCalled();
  });

  it('a real 32-hex jobId passes the guard and reaches the client (302 to the presigned URL)', async () => {
    mockAssetUrl.mockResolvedValueOnce('https://r2.example/signed');
    const r = await app.inject({ method: 'GET', url: `/creative-studio/asset/${HEX_ID}/final.mp4` });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('https://r2.example/signed');
    // Third arg = save-as flag; false here because ?download=1 was not sent, so the asset
    // is presigned to render inline as before.
    expect(mockAssetUrl).toHaveBeenCalledWith(HEX_ID, 'final.mp4', false);
  });

  it('?download=1 asks the client to presign a save-as (the <a download> attribute is ignored cross-origin)', async () => {
    mockAssetUrl.mockResolvedValueOnce('https://r2.example/signed-attachment');
    const r = await app.inject({
      method: 'GET', url: `/creative-studio/asset/${HEX_ID}/ad_00_4x5.png?download=1`,
    });
    expect(r.statusCode).toBe(302);
    expect(mockAssetUrl).toHaveBeenCalledWith(HEX_ID, 'ad_00_4x5.png', true);
  });
});
