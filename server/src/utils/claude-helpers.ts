import type Anthropic from '@anthropic-ai/sdk';

/**
 * Extract text from a Claude message response.
 * Safely handles the content block array without unsafe type casts.
 */
export function extractText(response: Anthropic.Message, fallback = ''): string {
  for (const block of response.content) {
    if (block.type === 'text') {
      return block.text;
    }
  }
  return fallback;
}
