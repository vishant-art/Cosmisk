/**
 * AI route — intent detection (Claude-powered with regex fallback).
 */

import { extractText } from '../../utils/claude-helpers.js';
import { createMessage } from '../../services/llm-gateway.js';
import type { Intent } from './types.js';

export function detectIntentRegex(message: string): Intent {
  const lower = message.toLowerCase();
  if (lower.includes('help') || lower.includes('what can you do')) return 'help';
  if (lower.includes('script') || lower.includes('hook') || lower.includes('ad copy')
    || lower.includes('write me') || lower.includes('write a')
    || lower.includes('create a') || lower.includes('new ad') || lower.includes('brief')
    || (lower.includes('give me') && (lower.includes('hook') || lower.includes('script') || lower.includes('copy') || lower.includes('ad') || lower.includes('new') || lower.includes('idea')))
    || (lower.includes('generate') && !lower.includes('overview'))) return 'script';
  if (lower.includes('overview') || lower.includes('how is my account') || lower.includes('how am i doing') || lower.includes('account performance') || lower.includes('summary') || lower.includes('report') || lower.includes('how are my ads')) return 'overview';
  if (lower.includes('predict') || lower.includes('forecast') || lower.includes('next week') || lower.includes('project')) return 'forecast';
  if (lower.includes('compar') || lower.includes('vs') || lower.includes('versus') || lower.includes('last week vs')) return 'comparison';
  if (lower.includes('audience') || lower.includes('who') || lower.includes('demographic') || lower.includes('age') || lower.includes('gender') || lower.includes('segment')) return 'audience';
  if (lower.includes('creative') || lower.includes('which ads') || lower.includes('top ads') || /top \d+ ads/.test(lower) || lower.includes('best ads') || (lower.includes('performing') && lower.includes('ads')) || (lower.includes('my') && lower.includes('ads') && !lower.includes('how are'))) return 'creative';
  if (lower.includes('cpa') || lower.includes('cost per') || lower.includes('acquisition')) return 'cpa';
  if (lower.includes('roas') || lower.includes('return on') || lower.includes('best performing') || lower.includes('best campaign')) return 'roas';
  if (lower.includes('spend') || lower.includes('budget') || lower.includes('spending') || lower.includes('where is my money')) return 'spend';
  return 'overview';
}

export async function detectIntentWithClaude(
  userId: string,
  message: string,
  conversationContext: string,
): Promise<{ intent: Intent; params: Record<string, any> }> {
  try {
    const response = await createMessage({
      userId,
      operation: 'ai.detectIntentWithClaude',
      request: {
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        temperature: 0,
        system: `You are an intent classifier for a Meta Ads analytics platform. Classify the user's message into exactly one intent and extract any parameters.

Intents: roas, spend, audience, creative, cpa, forecast, script, help, overview, comparison

Parameters to extract (if present):
- date_range: specific date range mentioned (e.g., "last week", "this month", "last 3 days")
- campaign_name: specific campaign mentioned
- comparison_periods: if comparing time periods (e.g., ["last_week", "this_week"])
- metric_focus: specific metric they're asking about

Respond ONLY with valid JSON: {"intent": "...", "params": {...}}`,
        messages: [{
          role: 'user',
          content: conversationContext
            ? `Previous context: ${conversationContext}\n\nUser message: ${message}`
            : message,
        }],
      },
    });

    const intentText = extractText(response);
    if (intentText) {
      const parsed = JSON.parse(intentText);
      const validIntents: Intent[] = ['roas', 'spend', 'audience', 'creative', 'cpa', 'forecast', 'script', 'help', 'overview', 'comparison'];
      if (validIntents.includes(parsed.intent)) {
        return { intent: parsed.intent, params: parsed.params || {} };
      }
    }
  } catch {
    // Fallback to regex
  }

  return { intent: detectIntentRegex(message), params: {} };
}

export function detectIntentWithContext(message: string, lastAiResponse: string): Intent {
  const lower = message.toLowerCase();

  // "based on this" / "from this" + generation keywords → script
  if ((lower.includes('based on this') || lower.includes('from this') || lower.includes('using this') || lower.includes('with this data'))
    && (lower.includes('script') || lower.includes('hook') || lower.includes('ad') || lower.includes('copy') || lower.includes('create') || lower.includes('give me') || lower.includes('write') || lower.includes('generate'))) {
    return 'script';
  }

  // "next step" / "suggestion" / "what should I do"
  if (/next step|suggestion|what.?s next|what (should|do) i do|what now|now what|recommend/i.test(lower)) {
    return 'script';
  }

  // Follow-up detection
  const isFollowUp = /^(tell me more|dig deeper|more detail|what about|explain|can you|go deeper|elaborate|break.?down|expand|what do you mean|and the|how about)/i.test(lower)
    || (lower.length < 40 && !/roas|spend|cpa|audience|creative|forecast|script|hook|help|overview|give me|write|create|generate|compar|vs/i.test(lower));

  if (isFollowUp && lastAiResponse) {
    const lastLower = lastAiResponse.toLowerCase();
    if (lastLower.includes('roas') && lastLower.includes('campaign')) return 'roas';
    if (lastLower.includes('spend') && lastLower.includes('budget')) return 'spend';
    if (lastLower.includes('cpa') && lastLower.includes('conversion')) return 'cpa';
    if (lastLower.includes('audience') && lastLower.includes('segment')) return 'audience';
    if (lastLower.includes('creative') && lastLower.includes('ad')) return 'creative';
    if (lastLower.includes('forecast') || lastLower.includes('project')) return 'forecast';
  }

  return detectIntentRegex(message);
}
