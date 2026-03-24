import { getDb } from '../db/index.js';
import Anthropic from '@anthropic-ai/sdk';
import { extractText } from '../utils/claude-helpers.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentType, AgentCoreMemoryRow, AgentEpisodeRow, AgentEntityRow,
} from '../types/index.js';

const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

/* ------------------------------------------------------------------ */
/*  Core Memory — always included in agent prompts                     */
/* ------------------------------------------------------------------ */

export function getCoreMemory(userId: string, agentType: AgentType): Record<string, string> {
  const db = getDb();
  const rows = db.prepare(
    'SELECT key, value FROM agent_core_memory WHERE user_id = ? AND agent_type = ?'
  ).all(userId, agentType) as Pick<AgentCoreMemoryRow, 'key' | 'value'>[];

  const memory: Record<string, string> = {};
  for (const row of rows) {
    memory[row.key] = row.value;
  }
  return memory;
}

export function setCoreMemory(
  userId: string,
  agentType: AgentType,
  key: string,
  value: string,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_core_memory (id, user_id, agent_type, key, value, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, agent_type, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(uuidv4(), userId, agentType, key, value);
}

export function deleteCoreMemory(userId: string, agentType: AgentType, key: string): void {
  const db = getDb();
  db.prepare(
    'DELETE FROM agent_core_memory WHERE user_id = ? AND agent_type = ? AND key = ?'
  ).run(userId, agentType, key);
}

/* ------------------------------------------------------------------ */
/*  Episodic Memory — timestamped events with relevance scoring        */
/* ------------------------------------------------------------------ */

export async function recordEpisode(
  userId: string,
  agentType: AgentType,
  event: string,
  context?: string,
  outcome?: string,
): Promise<string> {
  const db = getDb();
  const episodeId = uuidv4();

  // Insert episode immediately without blocking on entity extraction (#10)
  db.prepare(`
    INSERT INTO agent_episodes (id, user_id, agent_type, event, context, outcome, entities, relevance_score)
    VALUES (?, ?, ?, ?, ?, ?, '[]', 1.0)
  `).run(episodeId, userId, agentType, event, context || null, outcome || null);

  // Extract entities in background (fire-and-forget, no blocking Haiku call)
  extractEntities(event + (context ? ` ${context}` : '')).then(entities => {
    if (entities.length > 0) {
      db.prepare('UPDATE agent_episodes SET entities = ? WHERE id = ?')
        .run(JSON.stringify(entities), episodeId);
      for (const entity of entities) {
        upsertEntity(userId, entity);
      }
    }
  }).catch(() => {});

  return episodeId;
}

export function updateEpisodeOutcome(episodeId: string, outcome: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE agent_episodes SET outcome = ? WHERE id = ?"
  ).run(outcome, episodeId);
}

/* ------------------------------------------------------------------ */
/*  Entity tracking                                                    */
/* ------------------------------------------------------------------ */

function upsertEntity(userId: string, entityStr: string): void {
  const db = getDb();

  // Parse "type:name" format, default to "general" type
  const colonIdx = entityStr.indexOf(':');
  const entityType = colonIdx > 0 ? entityStr.substring(0, colonIdx) : 'general';
  const entityName = colonIdx > 0 ? entityStr.substring(colonIdx + 1) : entityStr;

  db.prepare(`
    INSERT INTO agent_entities (id, user_id, entity_type, entity_name, mention_count, first_seen, last_seen)
    VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    ON CONFLICT(user_id, entity_type, entity_name) DO UPDATE SET
      mention_count = mention_count + 1,
      last_seen = datetime('now')
  `).run(uuidv4(), userId, entityType, entityName);
}

/* ------------------------------------------------------------------ */
/*  Entity extraction via Claude Haiku                                 */
/* ------------------------------------------------------------------ */

async function extractEntities(text: string): Promise<string[]> {
  if (!process.env['ANTHROPIC_API_KEY']) return [];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0,
      system: `Extract named entities from the text. Return a JSON array of strings in "type:name" format.
Types: campaign, adset, ad, brand, metric, pattern, audience.
Example: ["campaign:Summer Sale 2024", "metric:ROAS", "brand:Nike"]
Return ONLY the JSON array.`,
      messages: [{ role: 'user', content: text }],
    });

    const extracted = extractText(response);
    if (!extracted) return [];
    const match = extracted.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Reinforcement — bump score when a decision had positive outcome    */
/* ------------------------------------------------------------------ */

export function reinforceEpisode(episodeId: string, boost: number = 0.3): void {
  const db = getDb();
  db.prepare(`
    UPDATE agent_episodes
    SET relevance_score = MIN(relevance_score + ?, 3.0),
        reinforcement_count = reinforcement_count + 1
    WHERE id = ?
  `).run(boost, episodeId);
}

export function penalizeEpisode(episodeId: string, penalty: number = 0.3): void {
  const db = getDb();
  db.prepare(`
    UPDATE agent_episodes
    SET relevance_score = MAX(relevance_score - ?, 0.1)
    WHERE id = ?
  `).run(penalty, episodeId);
}

/* ------------------------------------------------------------------ */
/*  Decay — reduce relevance of old un-reinforced memories             */
/* ------------------------------------------------------------------ */

export function runDecay(agentType?: AgentType): number {
  const db = getDb();

  // Decay episodes older than 14 days that haven't been reinforced
  const agentFilter = agentType ? "AND agent_type = ?" : "";
  const params: any[] = agentType ? [agentType] : [];

  const result = db.prepare(`
    UPDATE agent_episodes
    SET relevance_score = MAX(relevance_score * 0.9, 0.1)
    WHERE created_at < datetime('now', '-14 days')
    AND reinforcement_count = 0
    AND relevance_score > 0.2
    ${agentFilter}
  `).run(...params);

  // Delete episodes with very low relevance that are older than 90 days
  const deleted = db.prepare(`
    DELETE FROM agent_episodes
    WHERE created_at < datetime('now', '-90 days')
    AND relevance_score < 0.2
    ${agentFilter}
  `).run(...params);

  return result.changes + deleted.changes;
}

/* ------------------------------------------------------------------ */
/*  Build context window — assemble relevant memory for agent prompts  */
/* ------------------------------------------------------------------ */

export function buildContextWindow(
  userId: string,
  agentType: AgentType,
  opts?: {
    maxEpisodes?: number;
    maxEntities?: number;
    relevanceThreshold?: number;
    entityTypes?: string[];
  },
): string {
  const {
    maxEpisodes = 15,
    maxEntities = 10,
    relevanceThreshold = 0.3,
    entityTypes,
  } = opts || {};

  const sections: string[] = [];

  // 1. Core memory (always included)
  const coreMemory = getCoreMemory(userId, agentType);
  if (Object.keys(coreMemory).length > 0) {
    sections.push('CORE MEMORY:');
    for (const [key, value] of Object.entries(coreMemory)) {
      sections.push(`- ${key}: ${value}`);
    }
  }

  // 2. Recent relevant episodes
  const db = getDb();
  const episodes = db.prepare(`
    SELECT event, context, outcome, relevance_score, created_at
    FROM agent_episodes
    WHERE user_id = ? AND agent_type = ?
    AND relevance_score >= ?
    ORDER BY relevance_score DESC, created_at DESC
    LIMIT ?
  `).all(userId, agentType, relevanceThreshold, maxEpisodes) as AgentEpisodeRow[];

  if (episodes.length > 0) {
    sections.push('\nPAST EPISODES:');
    for (const ep of episodes) {
      let line = `- [${ep.created_at}] ${ep.event}`;
      if (ep.outcome) line += ` → Outcome: ${ep.outcome}`;
      if (ep.relevance_score > 1.5) line += ' (reinforced — this worked well)';
      sections.push(line);
    }
  }

  // 3. Known entities
  let entityQuery = `
    SELECT entity_type, entity_name, attributes, mention_count
    FROM agent_entities
    WHERE user_id = ?
  `;
  const entityParams: any[] = [userId];

  if (entityTypes && entityTypes.length > 0) {
    const placeholders = entityTypes.map(() => '?').join(',');
    entityQuery += ` AND entity_type IN (${placeholders})`;
    entityParams.push(...entityTypes);
  }

  entityQuery += ' ORDER BY mention_count DESC, last_seen DESC LIMIT ?';
  entityParams.push(maxEntities);

  const entities = db.prepare(entityQuery).all(...entityParams) as AgentEntityRow[];

  if (entities.length > 0) {
    sections.push('\nKNOWN ENTITIES:');
    for (const e of entities) {
      let line = `- ${e.entity_type}:${e.entity_name} (mentioned ${e.mention_count}x)`;
      if (e.attributes) {
        try {
          const attrs = JSON.parse(e.attributes);
          if (typeof attrs === 'object') {
            const attrStr = Object.entries(attrs).map(([k, v]) => `${k}=${v}`).join(', ');
            if (attrStr) line += ` [${attrStr}]`;
          }
        } catch { /* ignore parse errors */ }
      }
      sections.push(line);
    }
  }

  return sections.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Convenience: record a decision as an episode for learning          */
/* ------------------------------------------------------------------ */

export async function recordDecisionEpisode(
  userId: string,
  agentType: AgentType,
  decision: {
    type: string;
    targetName: string;
    suggestedAction: string;
    reasoning: string;
    outcome?: string;
  },
): Promise<string> {
  const event = `Recommended ${decision.suggestedAction} on "${decision.targetName}" (${decision.type})`;
  const context = decision.reasoning;
  return recordEpisode(userId, agentType, event, context, decision.outcome);
}
