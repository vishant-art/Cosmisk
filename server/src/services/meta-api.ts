import { config } from '../config.js';

export class MetaApiService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async get<T = any>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${config.graphApiBase}${path}`);
    url.searchParams.set('access_token', this.accessToken);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new MetaApiError(
        error?.error?.message || `Meta API error: ${res.status}`,
        res.status,
        error?.error?.code
      );
    }
    return res.json().catch(() => ({} as T)) as Promise<T>;
  }

  async getAllPages<T = any>(path: string, params: Record<string, string> = {}, maxPages = 20): Promise<T[]> {
    const allData: T[] = [];
    let url: string | null = `${config.graphApiBase}${path}`;
    let queryParams: Record<string, string> = { ...params, access_token: this.accessToken };
    let isFirstRequest = true;
    let pageCount = 0;

    while (url && pageCount < maxPages) {
      pageCount++;
      let fetchUrl: string;
      if (isFirstRequest) {
        const u = new URL(url);
        for (const [key, value] of Object.entries(queryParams)) {
          u.searchParams.set(key, value);
        }
        fetchUrl = u.toString();
        isFirstRequest = false;
      } else {
        fetchUrl = url;
      }

      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new MetaApiError(
          error?.error?.message || `Meta API error: ${res.status}`,
          res.status,
          error?.error?.code
        );
      }

      const json = await res.json().catch(() => ({})) as any;
      if (json.data) {
        allData.push(...json.data);
      }
      url = json.paging?.next || null;
    }

    return allData;
  }
}

export class MetaApiError extends Error {
  status: number;
  code?: number;
  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = 'MetaApiError';
    this.status = status;
    this.code = code;
  }
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{ accessToken: string; expiresIn: number }> {
  // Step 1: Exchange code for short-lived token
  const shortUrl = new URL(`${config.graphApiBase}/oauth/access_token`);
  shortUrl.searchParams.set('client_id', config.metaAppId);
  shortUrl.searchParams.set('client_secret', config.metaAppSecret);
  shortUrl.searchParams.set('redirect_uri', redirectUri);
  shortUrl.searchParams.set('code', code);

  const shortRes = await fetch(shortUrl.toString());
  if (!shortRes.ok) {
    const err = await shortRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to exchange code for token');
  }
  const shortData = await shortRes.json() as any;

  // Step 2: Exchange for long-lived token
  const longUrl = new URL(`${config.graphApiBase}/oauth/access_token`);
  longUrl.searchParams.set('grant_type', 'fb_exchange_token');
  longUrl.searchParams.set('client_id', config.metaAppId);
  longUrl.searchParams.set('client_secret', config.metaAppSecret);
  longUrl.searchParams.set('fb_exchange_token', shortData.access_token);

  const longRes = await fetch(longUrl.toString());
  if (!longRes.ok) {
    const err = await longRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to exchange for long-lived token');
  }
  const longData = await longRes.json() as any;

  return {
    accessToken: longData.access_token,
    expiresIn: longData.expires_in || 5184000, // 60 days default
  };
}

export async function getMetaUser(accessToken: string): Promise<{ id: string; name: string }> {
  const url = new URL(`${config.graphApiBase}/me`);
  url.searchParams.set('fields', 'name,id');
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch Meta user info');
  return res.json() as Promise<{ id: string; name: string }>;
}
