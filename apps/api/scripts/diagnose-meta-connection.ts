/**
 * Diagnose why the UI still shows "connect Meta" after seeding a meta_tokens row.
 *
 * READ-ONLY. Writes nothing. Prints no secret values — only sha256 fingerprints
 * (first 8 hex chars) so keys/tokens can be compared without being exposed.
 *
 * Both GET /auth/meta-status (routes/auth.ts:92) and GET /ad-accounts/list
 * (routes/ad-accounts.ts:24) run the same chain, and collapse three distinct
 * failures into one indistinguishable "not connected" result:
 *
 *   Stage 1  meta_tokens row exists for the user?          -> else disconnected
 *   Stage 2  decrypts with THIS TOKEN_ENCRYPTION_KEY?      -> else throws -> expired
 *   Stage 3  token satisfies Meta GET /me/adaccounts?      -> else caught  -> expired
 *
 * This separates them.
 *
 * Run from apps/api (env comes from the repo .env via the pg layer's load-env):
 *   DEMO_USER_EMAIL=anant@demo.com npx tsx scripts/diagnose-meta-connection.ts
 */
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { pgDb, closePgPool } from '../src/db/pg.js';
import { users, metaTokens } from '../src/db/pg-schema.js';
import { decryptToken } from '../src/services/token-crypto.js';
import { config } from '../src/config.js';

const fp = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 8);

async function main(): Promise<void> {
  const email = (process.env['DEMO_USER_EMAIL'] || 'anant@demo.com').trim();

  console.log(`\n=== Meta connection diagnosis — ${email} ===`);
  console.log(`TOKEN_ENCRYPTION_KEY fingerprint: ${fp(config.tokenEncryptionKey)}`);
  console.log(`  ^ must equal the fingerprint of Railway Service A's TOKEN_ENCRYPTION_KEY.`);
  console.log(`    (If Service A uses a different key, it cannot decrypt what we seeded.)\n`);

  // ---- Stage 1: row exists ----
  const [user] = await pgDb.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) {
    console.log(`FAIL stage 1 — no user with email "${email}".`);
    return;
  }
  const [row] = await pgDb.select().from(metaTokens).where(eq(metaTokens.userId, user.id));
  if (!row) {
    console.log(`FAIL stage 1 — no meta_tokens row for user ${user.id}. The seed did not land.`);
    return;
  }
  const isExpired = row.expiresAt ? new Date(row.expiresAt) < new Date() : false;
  console.log(`PASS stage 1 — row exists (user=${user.id}, meta_user_name="${row.metaUserName}")`);
  console.log(`  expires_at = ${row.expiresAt} -> ${isExpired ? 'IN THE PAST (route short-circuits to "expired")' : 'in the future, OK'}`);
  if (isExpired) return;

  // ---- Stage 2: decrypt with this key ----
  let token: string;
  try {
    token = decryptToken(row.encryptedAccessToken);
    console.log(`PASS stage 2 — decrypt OK (plaintext len=${token.length}, fingerprint=${fp(token)})`);
  } catch (err: any) {
    console.log(`FAIL stage 2 — decrypt threw: ${err.message}`);
    console.log(`  => TOKEN_ENCRYPTION_KEY mismatch: the row was encrypted with a different key.`);
    console.log(`  => Fix: re-run seed-meta-connection.ts using Service A's exact key.`);
    return;
  }

  const envToken = process.env['META_ACCESS_TOKEN']?.trim();
  if (envToken) {
    const same = fp(envToken) === fp(token);
    console.log(`  META_ACCESS_TOKEN fingerprint=${fp(envToken)} -> ${same ? 'MATCHES seeded token' : 'DIFFERS from seeded token'}`);
  }

  // ---- Stage 3: the exact Graph call the routes make ----
  const url = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&limit=10&access_token=${encodeURIComponent(token)}`;
  const resp = await fetch(url);
  const body: any = await resp.json().catch(() => ({}));

  if (!resp.ok || body.error) {
    console.log(`FAIL stage 3 — GET /me/adaccounts returned HTTP ${resp.status}`);
    console.log(`  Meta error: ${JSON.stringify(body.error ?? body)}`);
    console.log(`  => Routes catch this and report "expired" -> UI shows "connect Meta".`);
    console.log(`  => Usual causes: not a USER token (system-user/page token), missing ads_read scope, or expired at Meta.`);
    return;
  }

  const accounts: any[] = body.data ?? [];
  if (accounts.length === 0) {
    console.log(`FAIL stage 3 — /me/adaccounts returned 200 with ZERO accounts.`);
    console.log(`  => /ad-accounts/list yields an empty selector, so the UI still gates on "connect Meta".`);
    console.log(`  => The token authenticates but has no ad-account access. Grant it in Business Manager.`);
    return;
  }

  console.log(`PASS stage 3 — /me/adaccounts returned ${accounts.length} account(s):`);
  for (const a of accounts) console.log(`    ${a.id}  ${a.name ?? ''}`);
  console.log(`\nAll three stages pass locally.`);
  console.log(`If prod STILL shows "connect Meta", the difference is server-side env —`);
  console.log(`compare Railway Service A's TOKEN_ENCRYPTION_KEY fingerprint to the one above.`);
}

main()
  .then(() => closePgPool().then(() => process.exit(0)))
  .catch((err) => {
    console.error('[diagnose-meta-connection] failed:', err.message || err);
    closePgPool().finally(() => process.exit(1));
  });
