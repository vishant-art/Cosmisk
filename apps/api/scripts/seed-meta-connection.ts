/**
 * Seed a per-user Meta connection for DEMO purposes (Option A).
 *
 * The frontend "Meta connected" badge is driven by `GET /auth/meta-status`,
 * which reads a `meta_tokens` row for the logged-in user, decrypts it, and
 * live-validates against Meta `/me/adaccounts`. In the split demo we keep the
 * browser OAuth flow disabled (META_OAUTH_ENABLED=false), so no row exists and
 * the UI shows "not connected" — even though the ai-layer already pulls data
 * via its own global env token.
 *
 * This script inserts ONE meta_tokens row for the demo user, storing the SAME
 * real Meta user token already set in Service B's META_ACCESS_TOKEN env, so the
 * status route validates successfully and the UI flips to "connected".
 *
 * It mirrors the exact upsert the real OAuth callback does
 * (routes/auth.ts POST /meta-oauth/exchange) and uses the same encryptToken.
 *
 * Required env (same values as Service A / Service B):
 *   DATABASE_URL          Neon pooled connection (handled by src/db/pg.js)
 *   TOKEN_ENCRYPTION_KEY  MUST match Service A, or the app can't decrypt
 *   META_ACCESS_TOKEN     the Pratap Sons *user* access token (as on Service B)
 *   DEMO_USER_EMAIL       the account you'll log in with for the demo
 * Optional env:
 *   DEMO_BRAND_ID         active brand to pin (default: pratap-sons)
 *   DEMO_META_USER_NAME   label shown in the UI (default: "Pratap Sons (demo)")
 *   DEMO_TOKEN_TTL_DAYS   expiry horizon in days (default: 55)
 *
 * Run: `DEMO_USER_EMAIL=you@demo.com npx tsx scripts/seed-meta-connection.ts`
 */
import { eq } from 'drizzle-orm';
import { pgDb, closePgPool } from '../src/db/pg.js';
import { users, metaTokens } from '../src/db/pg-schema.js';
import { encryptToken } from '../src/services/token-crypto.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

async function main(): Promise<void> {
  const email = requireEnv('DEMO_USER_EMAIL');
  const token = requireEnv('META_ACCESS_TOKEN');
  // encryptToken reads config.tokenEncryptionKey — fail loud if it's the dev default.
  if (!process.env['TOKEN_ENCRYPTION_KEY']?.trim()) {
    throw new Error('Missing TOKEN_ENCRYPTION_KEY — must match Service A or the app cannot decrypt this row.');
  }

  const brandId = (process.env['DEMO_BRAND_ID'] || 'pratap-sons').trim();
  const metaUserName = (process.env['DEMO_META_USER_NAME'] || 'Pratap Sons (demo)').trim();
  const ttlDays = Number(process.env['DEMO_TOKEN_TTL_DAYS'] || '55');

  const [user] = await pgDb.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) {
    throw new Error(`No user found with email "${email}". Sign up that account first, then re-run.`);
  }

  const encrypted = encryptToken(token);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  await pgDb
    .insert(metaTokens)
    .values({
      userId: user.id,
      encryptedAccessToken: encrypted,
      metaUserId: 'demo-seed',
      metaUserName,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: metaTokens.userId,
      set: {
        encryptedAccessToken: encrypted,
        metaUserName,
        expiresAt,
      },
    });

  // Pin the active brand so downstream per-brand resolution stays consistent.
  await pgDb
    .update(users)
    .set({ activeBrand: brandId, onboardingComplete: 1 })
    .where(eq(users.id, user.id));

  console.log(
    `[seed-meta-connection] seeded meta_tokens for ${email} (user=${user.id}), ` +
    `active_brand=${brandId}, expires_at=${expiresAt}. ` +
    `Reload the app — /auth/meta-status should now report connected.`,
  );

  await closePgPool();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-meta-connection] failed:', err.message || err);
    closePgPool().finally(() => process.exit(1));
  });
