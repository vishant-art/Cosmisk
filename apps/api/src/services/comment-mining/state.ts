/**
 * Comment Mining Agent — shared module-level state (single source of truth).
 *
 * The Anthropic client is constructed once at module load, exactly as in the
 * original comment-mining-agent.ts. It must live in ONE module and be imported
 * elsewhere — never duplicated.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';

export const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
