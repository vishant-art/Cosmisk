/**
 * Safe fetch wrapper with timeout and JSON parsing protection.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

export class ExternalApiError extends Error {
  constructor(
    public service: string,
    public statusCode: number | null,
    message: string,
    public cause?: unknown,
  ) {
    super(`[${service}] ${message}`);
    this.name = 'ExternalApiError';
  }
}

/**
 * Fetch with timeout. Returns the Response object.
 * Throws ExternalApiError on network errors or timeout.
 */
export async function safeFetch(
  url: string | URL,
  init: RequestInit & { service?: string; timeoutMs?: number } = {},
): Promise<Response> {
  const { service = 'External API', timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  fetchInit.signal = controller.signal;

  try {
    return await fetch(url.toString(), fetchInit);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ExternalApiError(service, null, `Request timed out after ${timeoutMs}ms`);
    }
    throw new ExternalApiError(service, null, err.message || 'Network error', err);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse JSON safely from a Response. Returns null on failure instead of throwing.
 */
export async function safeJson<T = any>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

/**
 * Fetch + check status + parse JSON in one call.
 * Throws ExternalApiError if response is not ok or JSON parse fails.
 */
export async function fetchJson<T = any>(
  url: string | URL,
  init: RequestInit & { service?: string; timeoutMs?: number } = {},
): Promise<T> {
  const service = init.service || 'External API';
  const response = await safeFetch(url, init);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new ExternalApiError(service, response.status, `HTTP ${response.status}: ${errorText}`);
  }

  const data = await safeJson<T>(response);
  if (data === null) {
    throw new ExternalApiError(service, response.status, 'Invalid JSON response');
  }

  return data;
}
