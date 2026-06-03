import type { FastifyInstance } from 'fastify';
import { getDbAdapter } from '../db/adapter.js';
import { MetaApiService } from '../services/meta-api.js';
import { setCurrency } from '../services/format-helpers.js';
import { validate, aiChatSchema } from '../validation/schemas.js';
import { safeJsonParse } from '../utils/safe-json.js';
import type { Intent } from './ai/types.js';
import { getUserMetaToken, mapDateRange } from './ai/helpers.js';
import { detectIntentWithClaude, detectIntentWithContext } from './ai/intent.js';
import {
  handleRoas,
  handleSpend,
  handleAudience,
  handleCreative,
  handleCpa,
  handleForecast,
  handleScript,
  handleOverview,
  handleComparison,
} from './ai/handlers.js';

/* ------------------------------------------------------------------ */
/*  Route                                                             */
/* ------------------------------------------------------------------ */

export async function aiRoutes(app: FastifyInstance) {

  // POST /ai/chat
  app.post('/chat', { preHandler: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = validate(aiChatSchema, request.body, reply);
    if (!parsed) return;

    const { message, account_id, date_preset = 'last_7d', currency = 'USD', history } = parsed;

    setCurrency(currency);

    // Use Claude-based intent detection for complex queries, regex fallback for simple ones
    const lastAiMessage = history?.filter(m => m.role === 'ai').pop()?.content || '';
    const conversationContext = lastAiMessage ? lastAiMessage.slice(0, 300) : '';

    // For short/simple messages, use regex. For complex natural language, use Claude.
    const isComplex = message.length > 50
      || message.includes('?')
      || /why|how come|what happened|compare|versus|difference|between/i.test(message);

    let intent: Intent;
    let intentParams: Record<string, any> = {};

    if (isComplex) {
      const claudeResult = await detectIntentWithClaude(request.user.id, message, conversationContext);
      intent = claudeResult.intent;
      intentParams = claudeResult.params;
    } else {
      intent = detectIntentWithContext(message, lastAiMessage);
    }

    // Handle help intent without needing an account
    if (intent === 'help') {
      return {
        content: `Hey! I'm your Meta Ads strategist. I pull your live data and tell you what's actually going on — not generic advice, but specific recommendations based on your campaigns.\n\n` +
          `Here's the kind of stuff you can ask me:\n\n` +
          `"How is my account doing?" — I'll break down your performance, flag what's working and what's burning money, and tell you what to do about it.\n\n` +
          `"What's my best campaign by ROAS?" — I'll rank your campaigns, check if the top performer's data is actually reliable, and look at trends to see if it's improving or declining.\n\n` +
          `"Where is my budget going?" — I'll show you where every dollar is being spent and whether it's earning its keep.\n\n` +
          `"What's my CPA?" — Cost efficiency across campaigns with trend direction so you know if things are getting better or worse.\n\n` +
          `"Who is my best audience?" — Segment breakdown by age and gender with spend-to-conversion analysis.\n\n` +
          `"Which ads are performing best?" — Creative health check with fatigue detection.\n\n` +
          `"Write me a video script" or "Give me hooks" — I'll build creative based on what's actually converting in your account.\n\n` +
          `"Predict next week" — Trend-adjusted forecast based on your recent trajectory.\n\n` +
          `Select an ad account from the dropdown and ask away.`,
      };
    }

    // Require an account for data-driven responses
    if (!account_id) {
      return {
        content: 'I need an ad account to pull your data. Please select an ad account from the dropdown above, then ask me your question again.',
      };
    }

    const token = await getUserMetaToken(request.user.id);
    if (!token) {
      return {
        content: 'Your Meta account is not connected. Please go to Settings and connect your Meta account so I can access your ad data.',
      };
    }

    const meta = new MetaApiService(token);

    // Wire extracted intent params: override date_preset if a date_range was extracted
    let effectiveDatePreset = date_preset;
    if (intentParams['date_range']) {
      const mapped = mapDateRange(intentParams['date_range']);
      if (mapped) effectiveDatePreset = mapped;
    }

    // Extract campaign filter if present
    const campaignFilter: string | undefined = intentParams['campaign_name'] || undefined;

    try {
      const uid = request.user.id;
      switch (intent) {
        case 'roas':
          return await handleRoas(uid, meta, account_id, effectiveDatePreset, message, history, campaignFilter);
        case 'spend':
          return await handleSpend(uid, meta, account_id, effectiveDatePreset, message, history, campaignFilter);
        case 'audience':
          return await handleAudience(uid, meta, account_id, effectiveDatePreset, message, history, campaignFilter);
        case 'creative':
          return await handleCreative(uid, meta, account_id, effectiveDatePreset, message, history, campaignFilter);
        case 'cpa':
          return await handleCpa(uid, meta, account_id, effectiveDatePreset, message, history, campaignFilter);
        case 'forecast':
          return await handleForecast(uid, meta, account_id, message, history);
        case 'script':
          return await handleScript(uid, meta, account_id, effectiveDatePreset, message, history, campaignFilter);
        case 'comparison':
          return await handleComparison(uid, meta, account_id, effectiveDatePreset, message, intentParams, history, campaignFilter);
        case 'overview':
        default:
          return await handleOverview(uid, meta, account_id, effectiveDatePreset, message, history, campaignFilter);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';

      // Provide user-friendly error messages
      if (errorMsg.includes('OAuthException') || errorMsg.includes('token')) {
        return {
          content: 'Your Meta access token appears to have expired or become invalid. Please reconnect your Meta account in Settings to continue using data-driven insights.',
        };
      }

      if (errorMsg.includes('permission') || errorMsg.includes('(#10)')) {
        return {
          content: `I do not have permission to access data for this ad account (${account_id}). Please make sure the connected Meta account has access to this ad account.`,
        };
      }

      return {
        content: `I ran into an issue fetching your data: ${errorMsg}. Please try again, or check that your ad account is active and accessible.`,
      };
    }
  });

  // GET /ai/briefing — fetch latest morning briefing + pending decisions for proactive AI Studio
  app.get('/briefing', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user.id;

    // Get latest completed morning briefing
    const briefingRun = await getDbAdapter().get<{ id: string; summary: string; raw_context: string; completed_at: string }>(
      `SELECT * FROM agent_runs
       WHERE user_id = ? AND agent_type = 'morning_briefing' AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [userId]
    );

    if (!briefingRun) {
      return { briefing: null, pendingDecisions: [], suggestions: [] };
    }

    // Get pending watchdog decisions
    const pendingDecisions = await getDbAdapter().all<{ id: string; type: string; target_name: string; reasoning: string; confidence: string; urgency: string; suggested_action: string; estimated_impact: string }>(
      `SELECT id, type, target_name, reasoning, confidence, urgency, suggested_action, estimated_impact
       FROM agent_decisions
       WHERE user_id = ? AND status = 'pending'
       ORDER BY urgency DESC, created_at DESC
       LIMIT 5`,
      [userId]
    );

    // Build context-aware suggestions from real data
    const suggestions: string[] = [];

    // From pending decisions
    for (const d of pendingDecisions.slice(0, 2)) {
      if (d.type === 'pause' || d.type === 'reduce_budget') {
        suggestions.push(`Why is ${d.target_name} underperforming?`);
      } else if (d.type === 'scale' || d.type === 'increase_budget') {
        suggestions.push(`Scale ${d.target_name} — it's performing well`);
      }
    }

    // From briefing content
    const rawContext = safeJsonParse<Record<string, any>>(briefingRun.raw_context, {});
    const summary = briefingRun.summary || '';

    // Extract ROAS mentions from summary
    const roasMatch = summary.match(/ROAS[:\s]+(\d+\.?\d*)/i);
    if (roasMatch) {
      const roas = parseFloat(roasMatch[1]);
      if (roas < 2) suggestions.push(`ROAS is at ${roas}x — what should I change?`);
      else if (roas > 3) suggestions.push(`ROAS is strong at ${roas}x — how do I scale?`);
    }

    // Add generic but relevant suggestions to fill up to 4
    if (suggestions.length < 4) suggestions.push('What should I focus on today?');
    if (suggestions.length < 4) suggestions.push('Show me my top performing campaigns');
    if (suggestions.length < 4) suggestions.push('Which creatives need refreshing?');

    return {
      briefing: {
        content: briefingRun.summary,
        completedAt: briefingRun.completed_at,
        runId: briefingRun.id,
      },
      pendingDecisions: pendingDecisions.map(d => ({
        id: d.id,
        type: d.type,
        targetName: d.target_name,
        suggestedAction: d.suggested_action,
        urgency: d.urgency,
      })),
      suggestions: suggestions.slice(0, 4),
    };
  });
}
