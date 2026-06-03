/**
 * AI route — Claude prompt construction and invocation.
 */

import { getCurrency, CURRENCY_SYMBOLS } from '../../services/format-helpers.js';
import { extractText } from '../../utils/claude-helpers.js';
import { logger } from '../../utils/logger.js';
import { createMessage } from '../../services/llm-gateway.js';

export function buildSystemPrompt(campaignFilter?: string): string {
  const filterNote = campaignFilter
    ? `\n- The user is asking specifically about campaign: "${campaignFilter}". Focus your analysis on this campaign. If it appears in the data, lead with it. If it does not appear, say so explicitly.`
    : '';
  return `You are a Meta Ads strategist at Cosmisk. You analyze real campaign data and give specific, actionable advice.

Rules:
- Use actual campaign names, computed amounts, and specific numbers from the data provided
- Never be generic — reference the exact campaigns, segments, and metrics in the data
- Write conversationally like a strategist talking to a client, not a report
- Assess data confidence — if a campaign has high ROAS but tiny spend (e.g. <$50) or few conversions (<5), mention the data is thin
- Always identify trends (improving/declining/stable) when daily data is available
- End every response with a specific next action the user should take
- Use the currency symbol ${CURRENCY_SYMBOLS[getCurrency()] || getCurrency()} (${getCurrency()}) for all monetary values — never use $ unless the account currency is USD
- Never use bullet points or numbered lists unless specifically generating hooks/scripts
- Keep responses focused and under 400 words${filterNote}`;
}

export async function askClaude(
  userId: string,
  userMessage: string,
  dataContext: Record<string, any>,
  analysisType: string,
  history?: { role: 'user' | 'ai'; content: string }[],
  campaignFilter?: string,
): Promise<string | null> {
  try {
    const systemPrompt = buildSystemPrompt(campaignFilter)
      + `\n\nAnalysis type: ${analysisType}\n\nData:\n${JSON.stringify(dataContext, null, 2)}`;

    const historyMessages: { role: 'user' | 'assistant'; content: string }[] = [];
    if (history && history.length > 0) {
      const recent = history.slice(-4);
      for (const msg of recent) {
        historyMessages.push({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...historyMessages,
      { role: 'user', content: userMessage },
    ];

    const response = await createMessage({
      userId,
      operation: 'ai.askClaude',
      request: {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        temperature: 0.7,
        system: systemPrompt,
        messages,
      },
    });

    return extractText(response) || null;
  } catch (err: unknown) {
    logger.error({ err }, 'askClaude error');
    return null;
  }
}
