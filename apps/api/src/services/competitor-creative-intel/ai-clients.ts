/**
 * Competitor Creative Intelligence — Shared AI Clients
 *
 * Shared module-level state: the Anthropic and Gemini SDK singletons.
 * These MUST live in exactly one module and be imported by the rest —
 * never duplicated.
 */

import { config } from '../../config.js';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
export const gemini = config.geminiApiKey ? new GoogleGenerativeAI(config.geminiApiKey) : null;
