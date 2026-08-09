import { round, fmt } from '../format-helpers.js';
import { createMessage, isCreditsExhausted } from '../llm-gateway.js';
import { extractText } from '../../utils/claude-helpers.js';
import { logger } from '../../utils/logger.js';
import type { AgentDecisionRow } from '../../types/index.js';
import {
  watchdogSnapshotToSignals,
  buildStrategicPromptSection,
} from '../intelligence-integration.js';
import { validateDecision } from './decision-helpers.js';
import { applyFactualValidation } from './factual-validation.js';
import type { AccountSnapshot, WatchdogDecision } from './types.js';

/* ------------------------------------------------------------------ */
/*  Gemini-powered reasoning (via llmGateway)                          */
/* ------------------------------------------------------------------ */

export async function reasonAboutPerformance(
  userId: string,
  snapshot: AccountSnapshot,
  pastDecisions: AgentDecisionRow[],
  memoryContext: string,
  clientId?: string,
): Promise<WatchdogDecision[]> {
  const pastContext = pastDecisions.length > 0
    ? `\n\nPAST DECISIONS (learn from these):\n${pastDecisions.map(d =>
        `- ${d.type} on "${d.target_name}": ${d.suggested_action} (${d.status}${d.outcome ? `, outcome: ${d.outcome}` : ''})`
      ).join('\n')}`
    : '';

  const memorySection = memoryContext
    ? `\n\nAGENT MEMORY:\n${memoryContext}`
    : '';

  // === INTELLIGENCE CORE INTEGRATION ===
  // Convert snapshot to signals and get strategic context
  let strategicSection = '';
  if (clientId) {
    try {
      const signals = watchdogSnapshotToSignals(snapshot);
      strategicSection = await buildStrategicPromptSection(clientId, signals);
    } catch (err) {
      logger.warn({ err }, '[Watchdog] Intelligence integration failed, continuing without');
    }
  }

  const prompt = `You are the Ad Watchdog, an elite performance intelligence agent (NOT a dashboard).

CRITICAL: You are advising experienced media buyers spending ₹30L+/month. They already know basic metrics.
- Do NOT state obvious observations like "CTR dropped" or "CPA increased"
- DO explain WHY patterns exist and WHAT strategic action to take
- Every insight must synthesize multiple signals, not just report one metric
- If you can't provide strategic value, return an empty array []
${strategicSection}
You are monitoring Meta Ads performance.

ACCOUNT SNAPSHOT:
- Account: ${snapshot.accountName} (${snapshot.accountId})
- 7-day: ${fmt(snapshot.week.spend)} spend, ${round(snapshot.week.roas, 2)}x ROAS, ${fmt(snapshot.week.cpa)} CPA, ${round(snapshot.week.ctr, 2)}% CTR, ${snapshot.week.conversions} conversions
- 30-day: ${fmt(snapshot.month.spend)} spend, ${round(snapshot.month.roas, 2)}x ROAS, ${fmt(snapshot.month.cpa)} CPA, ${round(snapshot.month.ctr, 2)}% CTR, ${snapshot.month.conversions} conversions
- Daily ROAS trend: [${snapshot.dailyRoas.map(r => round(r, 2)).join(', ')}]

CAMPAIGNS:
${snapshot.campaigns.map(c =>
  `- "${c.name}": ${fmt(c.spend)} spend, ${round(c.roas, 2)}x ROAS, ${fmt(c.cpa)} CPA, ${round(c.ctr, 2)}% CTR, ${c.conversions} conv | ROAS ${c.roasTrend} | CPA ${c.cpaTrend} | CTR ${c.ctrTrend} | confidence: ${c.confidence}`
).join('\n')}
${pastContext}${memorySection}

RULES:
1. Think like an elite D2C operator, not a rule engine. Consider trends, confidence, and context.
2. NEVER state obvious metrics without explaining WHY and WHAT TO DO ABOUT IT.
3. Every decision must synthesize at least 2 signals (e.g., "ROAS declining + frequency increasing = audience fatigue").
4. Be specific: name the campaign/ad, state the action, quantify the impact.
5. Consider data confidence: 1 conversion on $5 spend means nothing. 50 conversions on $500 is a real pattern.
6. If you recommended something before and the outcome was bad, learn from it.
7. For each recommendation, specify ONE action: pause, reduce_budget, increase_budget, new_creative, or monitor.
8. Quality check: Would an experienced media buyer already know this? If yes, don't include it.

Respond with a JSON array of decisions. Each decision:
{
  "type": "roas_decline" | "cpa_spike" | "scale_opportunity" | "creative_fatigue" | "wasted_spend" | "budget_reallocation",
  "targetId": "campaign_id or account_id",
  "targetName": "human readable name",
  "reasoning": "2-3 sentence explanation of WHY, referencing specific data",
  "confidence": "high" | "moderate" | "low",
  "urgency": "low" | "medium" | "high" | "critical",
  "suggestedAction": "pause" | "reduce_budget" | "increase_budget" | "new_creative" | "monitor",
  "estimatedImpact": "e.g. 'Save $X/day' or 'Potential +Y% ROAS'"
}

If the account is performing well and no action is needed, return an empty array [].
Return ONLY the JSON array, no other text.`;

  try {
    const response = await createMessage({
      userId,
      operation: 'ad-watchdog.reasonAboutPerformance',
      request: {
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      },
    });

    const rawText = extractText(response);
    if (!rawText) return [];

    const jsonStr = rawText.trim();

    // Try direct parse first, then regex extraction (#8)
    let parsed: any[];
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const match = jsonStr.match(/\[[\s\S]*?\]/);
      if (!match) return [];
      parsed = JSON.parse(match[0]);
    }

    if (!Array.isArray(parsed)) return [];

    // Validate each decision (#9)
    const validDecisions = parsed.map(validateDecision).filter((d): d is WatchdogDecision => d !== null);

    // Apply factual validation - cross-check AI claims against actual data
    const factuallyValidated = applyFactualValidation(validDecisions, snapshot);

    return factuallyValidated;
  } catch (err: any) {
    // Credits-exhausted is reported once by the gateway; the watchdog fans out per concept,
    // so repeating it here logged ~30 identical lines per cron run. Degradation is unchanged
    // (still returns []); only the duplicate line is dropped.
    if (!isCreditsExhausted(err)) {
      // NOTE: this path also catches Anthropic errors despite the "Gemini" label — the name is
      // stale, not a misroute. Left as-is to keep this diff to the noise fix.
      logger.error({ err: err.message }, '[Watchdog] reasoning failed');
    }
    return [];
  }
}
