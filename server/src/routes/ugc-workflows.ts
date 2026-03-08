import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import { decryptToken } from '../services/token-crypto.js';
import { MetaApiService } from '../services/meta-api.js';
import { parseInsightMetrics } from '../services/insights-parser.js';
import { round, fmt, setCurrency } from '../services/format-helpers.js';
import { assessConfidence, computeTrend } from '../services/trend-analyzer.js';
import type { MetaTokenRow, UgcConceptRow } from '../types/index.js';

function getUserMetaToken(userId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM meta_tokens WHERE user_id = ?').get(userId) as MetaTokenRow | undefined;
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

/* ------------------------------------------------------------------ */
/*  Concept generation — data-driven from Meta top performers          */
/* ------------------------------------------------------------------ */

interface TopAd {
  name: string;
  spend: number;
  roas: number;
  ctr: number;
  cpa: number;
  impressions: number;
  conversions: number;
}

async function fetchTopAds(meta: MetaApiService, accountId: string, currency: string): Promise<TopAd[]> {
  setCurrency(currency);
  try {
    const data = await meta.get<any>(`/${accountId}/ads`, {
      fields: 'name,insights.fields(spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas).date_preset(last_30d)',
      limit: '50',
      effective_status: "['ACTIVE','PAUSED']",
    });

    const ads: TopAd[] = [];
    for (const ad of (data.data || [])) {
      const row = ad.insights?.data?.[0];
      if (!row) continue;
      const m = parseInsightMetrics(row);
      if (m.spend < 1) continue;
      ads.push({
        name: ad.name || 'Untitled',
        spend: m.spend,
        roas: m.roas,
        ctr: m.ctr,
        cpa: m.cpa,
        impressions: m.impressions,
        conversions: m.conversions,
      });
    }

    // Sort by ROAS descending
    ads.sort((a, b) => b.roas - a.roas);
    return ads;
  } catch {
    return [];
  }
}

function generateConceptsFromData(
  topAds: TopAd[],
  brief: any,
  currency: string,
  numConcepts: number
): { title: string; description: string }[] {
  setCurrency(currency);
  const concepts: { title: string; description: string }[] = [];
  const productName = brief?.product_description || brief?.brand_name || 'your product';
  const audience = brief?.target_audience || 'your target audience';

  // Concept 1: Hero replication — replicate top performer
  const hero = topAds[0];
  if (hero) {
    concepts.push({
      title: `Replicate "${hero.name}" Winner`,
      description: `Your top performer "${hero.name}" is running at ${round(hero.roas, 2)}x ROAS with ${fmt(hero.spend)} spend. ` +
        `Create a variation that keeps the same winning angle but with fresh creative. ` +
        `Test with the same audience to validate the angle scales. ` +
        `Target: maintain ${round(hero.roas, 1)}x+ ROAS while increasing reach.`,
    });
  }

  // Concept 2: Audience-first — if brief has target audience info
  if (topAds.length >= 2) {
    const highCtr = [...topAds].sort((a, b) => b.ctr - a.ctr)[0];
    concepts.push({
      title: `High-Engagement Hook`,
      description: `"${highCtr.name}" has the highest engagement at ${round(highCtr.ctr, 2)}% CTR across your ads. ` +
        `Create a new ad using the same attention-grabbing hook style, optimized for ${audience}. ` +
        `Lead with the hook that stops the scroll, then transition to ${productName} benefits. ` +
        `Format: short-form video (15-30s) or carousel for maximum engagement.`,
    });
  }

  // Concept 3: Low-CPA optimizer
  const lowCpa = topAds.filter(a => a.conversions > 0).sort((a, b) => a.cpa - b.cpa);
  if (lowCpa.length > 0) {
    const best = lowCpa[0];
    concepts.push({
      title: `CPA Optimizer — Conversion-First`,
      description: `"${best.name}" converts at ${fmt(best.cpa)} CPA (${best.conversions} conversions from ${fmt(best.spend)} spend). ` +
        `Create a direct-response ad that leads with the conversion trigger. ` +
        `Emphasize urgency and social proof for ${audience}. ` +
        `Use the same offer structure but test new visuals and copy.`,
    });
  }

  // Concept 4: Budget gap — find underspent winners
  const underspent = topAds.filter(a => a.roas > 2 && a.spend < (topAds[0]?.spend || 100) * 0.3);
  if (underspent.length > 0) {
    const hidden = underspent[0];
    concepts.push({
      title: `Scale Hidden Gem "${hidden.name}"`,
      description: `"${hidden.name}" has ${round(hidden.roas, 2)}x ROAS but only ${fmt(hidden.spend)} in spend — it's under-invested. ` +
        `Create 3-5 creative variations to test at higher budgets. ` +
        `Variations: try different hooks, testimonial vs product-focused, and static vs video formats. ` +
        `Goal: validate this angle scales before doubling down.`,
    });
  }

  // Concept 5: Anti-fatigue — fresh angle
  concepts.push({
    title: `Fresh Angle — Beat Creative Fatigue`,
    description: `Your current top ads have been running for a while. Create a completely new creative angle for ${productName} ` +
      `targeting ${audience}. Try a format you haven't used before — if your winners are videos, test carousels. ` +
      `If they're product shots, try UGC-style testimonials. ` +
      `Budget: start at 20% of your average ad spend and scale based on early signals.`,
  });

  // Concept 6: UGC-style
  concepts.push({
    title: `UGC Testimonial Style`,
    description: `Create a user-generated content style ad for ${productName}. ` +
      `Authentic, phone-shot feel with real language. Hook: "I wasn't sure about ${productName} until..." ` +
      `Show the before/after or unboxing moment. ` +
      `This format typically outperforms polished studio content for ${audience} at lower production cost.`,
  });

  // If no data at all, add generic but useful concepts
  if (topAds.length === 0) {
    concepts.length = 0;
    concepts.push(
      {
        title: 'Problem-Solution Hook',
        description: `Start with the #1 pain point of ${audience}, then reveal how ${productName} solves it. ` +
          `Format: 15-second video or static with bold text overlay. ` +
          `CTA: direct to purchase or lead form. Test 2-3 different pain points.`,
      },
      {
        title: 'Social Proof / Testimonial',
        description: `Collect or create testimonials from ${audience}. Show real results, real people, real language. ` +
          `UGC-style video or carousel of customer screenshots. ` +
          `This builds trust fast for new ad accounts with limited performance data.`,
      },
      {
        title: 'Comparison / "Why Us"',
        description: `Create a comparison ad that positions ${productName} against alternatives. ` +
          `Not attacking competitors — showing why your solution is different. ` +
          `Works well as carousel format with feature-by-feature comparison.`,
      },
      {
        title: 'Limited-Time Offer',
        description: `Create urgency with a time-limited offer for ${productName}. ` +
          `Bold visual, countdown feel, clear CTA. ` +
          `Test different offer structures: percentage off, free shipping, bundle deal.`,
      }
    );
  }

  return concepts.slice(0, numConcepts || 6);
}

function generateScriptFromConcept(
  concept: { title: string; description: string },
  brief: any,
  topAds: TopAd[],
  currency: string
): string {
  setCurrency(currency);
  const productName = brief?.product_description || brief?.brand_name || 'your product';
  const audience = brief?.target_audience || 'your target audience';
  const hero = topAds[0];

  const lines: string[] = [];
  lines.push(`SCRIPT: ${concept.title}`);
  lines.push(`Target: ${audience}`);
  lines.push(`Product: ${productName}`);
  if (hero) lines.push(`Top Performer Reference: "${hero.name}" (${round(hero.roas, 2)}x ROAS)`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Generate script sections based on concept type
  if (concept.title.includes('Replicate')) {
    lines.push('HOOK (0-3s):');
    lines.push(`[Open on product shot or problem visual]`);
    lines.push(`"${hero?.name ? `The same thing that made "${hero.name}" our #1 ad` : 'What if I told you'} — but from a completely new angle."`);
    lines.push('');
    lines.push('PROBLEM (3-8s):');
    lines.push(`[Show the pain point ${audience} faces]`);
    lines.push(`"You've tried everything else. Nothing sticks."`);
    lines.push('');
    lines.push('SOLUTION (8-18s):');
    lines.push(`[Product reveal / demonstration]`);
    lines.push(`"${productName} is different because [key differentiator]."`);
    lines.push(`Show the product in use. Focus on the transformation moment.`);
    lines.push('');
    lines.push('PROOF (18-25s):');
    lines.push(`[Results / testimonial / social proof]`);
    lines.push(`"[X] people already switched. Here's what they're saying..."`);
    lines.push('');
    lines.push('CTA (25-30s):');
    lines.push(`"Link in bio / Shop now / Limited time offer"`);
    lines.push(`[End card with product and offer]`);
  } else if (concept.title.includes('UGC') || concept.title.includes('Testimonial')) {
    lines.push('HOOK (0-3s):');
    lines.push(`[Camera facing, casual setting, like a friend talking to you]`);
    lines.push(`"Okay so I HAVE to share this because I was SO skeptical about ${productName}..."`);
    lines.push('');
    lines.push('STORY (3-12s):');
    lines.push(`[Natural, unscripted feel]`);
    lines.push(`"I saw it everywhere and thought 'another one of those.' But then [friend/review] convinced me to try it."`);
    lines.push('');
    lines.push('REVEAL (12-22s):');
    lines.push(`[Show product, unboxing, or before/after]`);
    lines.push(`"And honestly? [Specific result]. I was not expecting that."`);
    lines.push(`Show genuine reaction. This is the money shot.`);
    lines.push('');
    lines.push('CTA (22-30s):');
    lines.push(`"If you've been on the fence — just try it. Link below. You'll thank me later."`);
    lines.push(`[Point at link, smile]`);
  } else if (concept.title.includes('CPA')) {
    lines.push('HOOK (0-3s):');
    lines.push(`[Bold text overlay or pattern interrupt]`);
    lines.push(`"This ${productName} hack is saving people [money/time/hassle]."`);
    lines.push('');
    lines.push('URGENCY (3-10s):');
    lines.push(`"And right now it's [offer details]. But not for long."`);
    lines.push('');
    lines.push('DEMO (10-20s):');
    lines.push(`[Quick product demo — focus on the core benefit]`);
    lines.push(`Show the transformation in 10 seconds or less.`);
    lines.push('');
    lines.push('SOCIAL PROOF (20-25s):');
    lines.push(`"[Number] people already switched this month."`);
    lines.push(`Flash customer reviews / ratings.`);
    lines.push('');
    lines.push('CTA (25-30s):');
    lines.push(`"Tap the link. [Specific offer]. Ends [timeframe]."`);
  } else {
    lines.push('HOOK (0-3s):');
    lines.push(`[Attention grabber — question, bold claim, or visual interrupt]`);
    lines.push(`"[Hook aligned with concept: ${concept.title}]"`);
    lines.push('');
    lines.push('BODY (3-20s):');
    lines.push(`[Develop the concept angle]`);
    lines.push(`Explain why ${productName} is relevant to ${audience}.`);
    lines.push(`Show the product in context. Make it feel real, not salesy.`);
    lines.push('');
    lines.push('PROOF (20-25s):');
    lines.push(`[Back it up — results, testimonials, authority]`);
    lines.push('');
    lines.push('CTA (25-30s):');
    lines.push(`[Clear call to action with urgency or incentive]`);
  }

  lines.push('');
  lines.push('---');
  lines.push(`NOTES: Based on analysis of ${topAds.length} ads in your account. ` +
    (hero ? `Top performer "${hero.name}" used as style reference.` : 'No performance data available — using best practice frameworks.'));

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

export async function ugcWorkflowRoutes(app: FastifyInstance) {

  // POST /ugc-onboarding — create project AND generate concepts from data
  app.post('/ugc-onboarding', { preHandler: [app.authenticate] }, async (request) => {
    const body = request.body as {
      name?: string;
      brand_name?: string;
      brief?: any;
      account_id?: string;
      credential_group?: string;
      currency?: string;
      num_concepts?: number;
    };
    const db = getDb();
    const id = uuidv4();
    const currency = body.currency || 'USD';

    db.prepare(
      'INSERT INTO ugc_projects (id, user_id, name, brand_name, status, brief) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, request.user.id, body.name || 'New Project', body.brand_name || null, 'onboarding', body.brief ? JSON.stringify(body.brief) : null);

    // If account is connected, fetch top performers and generate concepts
    let conceptCount = 0;
    if (body.account_id) {
      const token = getUserMetaToken(request.user.id);
      if (token) {
        try {
          const meta = new MetaApiService(token);
          const topAds = await fetchTopAds(meta, body.account_id, currency);
          const concepts = generateConceptsFromData(topAds, body.brief, currency, body.num_concepts || 6);

          const stmt = db.prepare(
            'INSERT INTO ugc_concepts (id, project_id, title, description, status) VALUES (?, ?, ?, ?, ?)'
          );
          for (const c of concepts) {
            stmt.run(uuidv4(), id, c.title, c.description, 'pending');
            conceptCount++;
          }

          // Move to concepts phase
          db.prepare("UPDATE ugc_projects SET status = 'concepts', updated_at = datetime('now') WHERE id = ?").run(id);
        } catch {
          // Still create project even if data fetch fails
          db.prepare("UPDATE ugc_projects SET status = 'concepts', updated_at = datetime('now') WHERE id = ?").run(id);
        }
      }
    }

    // If no account, generate generic concepts from brief
    if (conceptCount === 0) {
      const concepts = generateConceptsFromData([], body.brief, currency, body.num_concepts || 4);
      const stmt = db.prepare(
        'INSERT INTO ugc_concepts (id, project_id, title, description, status) VALUES (?, ?, ?, ?, ?)'
      );
      for (const c of concepts) {
        stmt.run(uuidv4(), id, c.title, c.description, 'pending');
        conceptCount++;
      }
      db.prepare("UPDATE ugc_projects SET status = 'concepts', updated_at = datetime('now') WHERE id = ?").run(id);
    }

    return { success: true, project_id: id, concepts_generated: conceptCount };
  });

  // POST /ugc-phase1 (research)
  app.post('/ugc-phase1', { preHandler: [app.authenticate] }, async (request) => {
    const { project_id } = request.body as { project_id: string };
    const db = getDb();
    db.prepare("UPDATE ugc_projects SET status = 'research', updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(project_id, request.user.id);
    return { success: true };
  });

  // POST /ugc-concept-approval
  app.post('/ugc-concept-approval', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { project_id, action, concept_ids, notes } = request.body as {
      project_id: string; action: string; concept_ids?: string[]; notes?: string;
    };
    const db = getDb();

    // Verify ownership
    const project = db.prepare('SELECT id FROM ugc_projects WHERE id = ? AND user_id = ?')
      .get(project_id, request.user.id) as any;
    if (!project) {
      return reply.status(403).send({ success: false, error: 'Not authorized to modify this project' });
    }

    const newStatus = action === 'pm_approve' || action === 'client_approve' ? 'approved' : 'rejected';

    if (concept_ids?.length) {
      // Only update concepts belonging to this project
      const stmt = db.prepare('UPDATE ugc_concepts SET status = ?, feedback = ? WHERE id = ? AND project_id = ?');
      for (const cid of concept_ids) {
        stmt.run(newStatus, notes || null, cid, project_id);
      }
    }

    return { success: true };
  });

  // POST /ugc-phase3 (write scripts) — generates scripts from approved concepts
  app.post('/ugc-phase3', { preHandler: [app.authenticate] }, async (request) => {
    const { project_id, account_id, currency } = request.body as {
      project_id: string;
      account_id?: string;
      currency?: string;
    };
    const db = getDb();
    const cur = currency || 'USD';

    // Get project brief
    const project = db.prepare('SELECT * FROM ugc_projects WHERE id = ? AND user_id = ?')
      .get(project_id, request.user.id) as any;
    if (!project) return { success: false, error: 'Project not found' };

    const brief = project.brief ? JSON.parse(project.brief) : {};

    // Fetch top ads for data context
    let topAds: TopAd[] = [];
    if (account_id) {
      const token = getUserMetaToken(request.user.id);
      if (token) {
        try {
          const meta = new MetaApiService(token);
          topAds = await fetchTopAds(meta, account_id, cur);
        } catch { /* continue without data */ }
      }
    }

    // Get approved concepts
    const approvedConcepts = db.prepare(
      "SELECT * FROM ugc_concepts WHERE project_id = ? AND status = 'approved'"
    ).all(project_id) as UgcConceptRow[];

    // Generate scripts for each approved concept
    let scriptCount = 0;
    const stmtScript = db.prepare(
      'INSERT INTO ugc_scripts (id, concept_id, project_id, title, content, status) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const concept of approvedConcepts) {
      const content = generateScriptFromConcept(
        { title: concept.title, description: concept.description || '' },
        brief,
        topAds,
        cur
      );
      stmtScript.run(uuidv4(), concept.id, project_id, concept.title + ' — Script', content, 'draft');
      scriptCount++;
    }

    db.prepare("UPDATE ugc_projects SET status = 'scripting', updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(project_id, request.user.id);

    return { success: true, scripts_generated: scriptCount };
  });

  // POST /ugc-delivery
  app.post('/ugc-delivery', { preHandler: [app.authenticate] }, async (request) => {
    const { project_id } = request.body as { project_id: string };
    const db = getDb();
    db.prepare("UPDATE ugc_projects SET status = 'delivered', updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(project_id, request.user.id);
    return { success: true };
  });

  // POST /ugc-script-revision
  app.post('/ugc-script-revision', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { script_id, content } = request.body as { script_id: string; content?: string };
    const db = getDb();

    // Verify ownership: script must belong to a project owned by this user
    const script = db.prepare(
      `SELECT s.id FROM ugc_scripts s
       JOIN ugc_projects p ON s.project_id = p.id
       WHERE s.id = ? AND p.user_id = ?`
    ).get(script_id, request.user.id) as any;

    if (!script) {
      return reply.status(403).send({ success: false, error: 'Not authorized to edit this script' });
    }

    if (content) {
      db.prepare("UPDATE ugc_scripts SET content = ?, status = 'in_review', updated_at = datetime('now') WHERE id = ?")
        .run(content, script_id);
    }
    return { success: true };
  });
}
