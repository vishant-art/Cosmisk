/**
 * Re-seed the 3 brands lost in the Railway sacrifice.
 *
 * Idempotent: uses `.onConflictDoNothing()` on the `id` PK, so it is safe to
 * run repeatedly. Targets the pooled Neon endpoint via the existing pg layer
 * (which imports net-config + load-env, so DNS/env are handled).
 *
 * Run: `npx tsx scripts/seed-brands.ts`
 */
import { pgDb, closePgPool } from '../src/db/pg.js';
import { brands } from '../src/db/pg-schema.js';

const SEED_BRANDS = [
  { id: 'casorro', name: 'Casorro', domain: 'casorro.in', category: 'fashion', stage: 'scaling', metaAdAccountId: 'act_1221854506209666' },
  { id: 'pratap-sons', name: 'Pratap Sons', domain: 'pratapsons.com', category: 'fashion', stage: 'scaling', metaAdAccountId: 'act_1738503939658460' },
  { id: 'salt-attire', name: 'Salt Attire', domain: 'saltattire.com', category: 'fashion', stage: 'scaling', metaAdAccountId: 'act_26408351442104125' },
];

async function main(): Promise<void> {
  await pgDb.insert(brands).values(SEED_BRANDS).onConflictDoNothing();

  const rows = await pgDb.select().from(brands);
  console.log(`[seed-brands] brands table now has ${rows.length} row(s).`);

  await closePgPool();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-brands] failed:', err);
    closePgPool().finally(() => process.exit(1));
  });
