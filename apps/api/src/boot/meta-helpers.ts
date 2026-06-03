import { getDbAdapter } from '../db/adapter.js';
import { decryptToken } from '../services/token-crypto.js';
import type { MetaTokenRow } from '../types/index.js';

export async function getMetaTokenForUser(userId: string): Promise<string | null> {
  const row = await getDbAdapter().get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [userId]);
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

export function roundNum(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
