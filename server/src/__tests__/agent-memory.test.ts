/**
 * Tests for the agent memory system: core memory CRUD, episode storage/retrieval,
 * entity tracking, relevance scoring, reinforcement, decay, and context window assembly.
 *
 * Uses an in-memory SQLite database to validate the actual SQL logic
 * without needing to mock the database layer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

/* ------------------------------------------------------------------ */
/*  In-memory DB setup matching production schema                      */
/* ------------------------------------------------------------------ */

let db: Database.Database;

function setupDb(): Database.Database {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      plan TEXT DEFAULT 'free',
      onboarding_complete INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_core_memory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      agent_type TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, agent_type, key)
    );

    CREATE TABLE agent_episodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      agent_type TEXT NOT NULL,
      event TEXT NOT NULL,
      context TEXT,
      outcome TEXT,
      entities TEXT,
      relevance_score REAL NOT NULL DEFAULT 1.0,
      reinforcement_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_agent_episodes_user ON agent_episodes(user_id, agent_type);

    CREATE TABLE agent_entities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      entity_type TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      attributes TEXT,
      mention_count INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, entity_type, entity_name)
    );
    CREATE INDEX idx_agent_entities_user ON agent_entities(user_id, entity_type);
  `);

  d.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
    'user-1', 'Test User', 'test@test.com', 'hash'
  );
  return d;
}

/* ------------------------------------------------------------------ */
/*  Helpers that mirror the agent-memory.ts logic against our test DB  */
/* ------------------------------------------------------------------ */

function getCoreMemory(userId: string, agentType: string): Record<string, string> {
  const rows = db.prepare(
    'SELECT key, value FROM agent_core_memory WHERE user_id = ? AND agent_type = ?'
  ).all(userId, agentType) as Array<{ key: string; value: string }>;
  const memory: Record<string, string> = {};
  for (const row of rows) memory[row.key] = row.value;
  return memory;
}

function setCoreMemory(userId: string, agentType: string, key: string, value: string): void {
  db.prepare(`
    INSERT INTO agent_core_memory (id, user_id, agent_type, key, value, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, agent_type, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(uuidv4(), userId, agentType, key, value);
}

function deleteCoreMemory(userId: string, agentType: string, key: string): void {
  db.prepare(
    'DELETE FROM agent_core_memory WHERE user_id = ? AND agent_type = ? AND key = ?'
  ).run(userId, agentType, key);
}

function insertEpisode(
  userId: string, agentType: string, event: string,
  context?: string, outcome?: string, relevanceScore = 1.0,
  reinforcementCount = 0, createdAt?: string,
): string {
  const id = uuidv4();
  if (createdAt) {
    db.prepare(`
      INSERT INTO agent_episodes (id, user_id, agent_type, event, context, outcome, entities, relevance_score, reinforcement_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)
    `).run(id, userId, agentType, event, context || null, outcome || null, relevanceScore, reinforcementCount, createdAt);
  } else {
    db.prepare(`
      INSERT INTO agent_episodes (id, user_id, agent_type, event, context, outcome, entities, relevance_score, reinforcement_count)
      VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?)
    `).run(id, userId, agentType, event, context || null, outcome || null, relevanceScore, reinforcementCount);
  }
  return id;
}

function reinforceEpisode(episodeId: string, boost: number = 0.3): void {
  db.prepare(`
    UPDATE agent_episodes
    SET relevance_score = MIN(relevance_score + ?, 3.0),
        reinforcement_count = reinforcement_count + 1
    WHERE id = ?
  `).run(boost, episodeId);
}

function penalizeEpisode(episodeId: string, penalty: number = 0.3): void {
  db.prepare(`
    UPDATE agent_episodes
    SET relevance_score = MAX(relevance_score - ?, 0.1)
    WHERE id = ?
  `).run(penalty, episodeId);
}

function upsertEntity(userId: string, entityStr: string): void {
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

function buildContextWindow(
  userId: string, agentType: string,
  opts?: { maxEpisodes?: number; maxEntities?: number; relevanceThreshold?: number; entityTypes?: string[] },
): string {
  const { maxEpisodes = 15, maxEntities = 10, relevanceThreshold = 0.3, entityTypes } = opts || {};
  const sections: string[] = [];

  // Core memory
  const coreMemory = getCoreMemory(userId, agentType);
  if (Object.keys(coreMemory).length > 0) {
    sections.push('CORE MEMORY:');
    for (const [key, value] of Object.entries(coreMemory)) {
      sections.push(`- ${key}: ${value}`);
    }
  }

  // Episodes
  const episodes = db.prepare(`
    SELECT event, context, outcome, relevance_score, created_at
    FROM agent_episodes
    WHERE user_id = ? AND agent_type = ?
    AND relevance_score >= ?
    ORDER BY relevance_score DESC, created_at DESC
    LIMIT ?
  `).all(userId, agentType, relevanceThreshold, maxEpisodes) as any[];

  if (episodes.length > 0) {
    sections.push('\nPAST EPISODES:');
    for (const ep of episodes) {
      let line = `- [${ep.created_at}] ${ep.event}`;
      if (ep.outcome) line += ` → Outcome: ${ep.outcome}`;
      if (ep.relevance_score > 1.5) line += ' (reinforced — this worked well)';
      sections.push(line);
    }
  }

  // Entities
  let entityQuery = `SELECT entity_type, entity_name, attributes, mention_count FROM agent_entities WHERE user_id = ?`;
  const entityParams: any[] = [userId];
  if (entityTypes && entityTypes.length > 0) {
    const placeholders = entityTypes.map(() => '?').join(',');
    entityQuery += ` AND entity_type IN (${placeholders})`;
    entityParams.push(...entityTypes);
  }
  entityQuery += ' ORDER BY mention_count DESC, last_seen DESC LIMIT ?';
  entityParams.push(maxEntities);

  const entities = db.prepare(entityQuery).all(...entityParams) as any[];
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
        } catch { /* ignore */ }
      }
      sections.push(line);
    }
  }

  return sections.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => { db = setupDb(); });
afterEach(() => { db.close(); });

describe('Agent Memory — Core Memory CRUD', () => {
  it('stores and retrieves a key-value pair', () => {
    setCoreMemory('user-1', 'watchdog', 'preferred_roas', '3.0');
    const memory = getCoreMemory('user-1', 'watchdog');
    expect(memory['preferred_roas']).toBe('3.0');
  });

  it('returns empty object when no memory exists', () => {
    const memory = getCoreMemory('user-1', 'watchdog');
    expect(Object.keys(memory)).toHaveLength(0);
  });

  it('upserts value on conflict (same user+agent+key)', () => {
    setCoreMemory('user-1', 'watchdog', 'target_cpa', '50');
    setCoreMemory('user-1', 'watchdog', 'target_cpa', '35');
    const memory = getCoreMemory('user-1', 'watchdog');
    expect(memory['target_cpa']).toBe('35');
  });

  it('isolates memory between agent types', () => {
    setCoreMemory('user-1', 'watchdog', 'notes', 'watchdog note');
    setCoreMemory('user-1', 'content', 'notes', 'content note');
    expect(getCoreMemory('user-1', 'watchdog')['notes']).toBe('watchdog note');
    expect(getCoreMemory('user-1', 'content')['notes']).toBe('content note');
  });

  it('deletes a specific key', () => {
    setCoreMemory('user-1', 'watchdog', 'temp', 'value');
    deleteCoreMemory('user-1', 'watchdog', 'temp');
    const memory = getCoreMemory('user-1', 'watchdog');
    expect(memory['temp']).toBeUndefined();
  });

  it('delete is a no-op for nonexistent key', () => {
    deleteCoreMemory('user-1', 'watchdog', 'nope');
    // Should not throw
    expect(true).toBe(true);
  });

  it('stores multiple keys for the same agent', () => {
    setCoreMemory('user-1', 'watchdog', 'key1', 'val1');
    setCoreMemory('user-1', 'watchdog', 'key2', 'val2');
    setCoreMemory('user-1', 'watchdog', 'key3', 'val3');
    const memory = getCoreMemory('user-1', 'watchdog');
    expect(Object.keys(memory)).toHaveLength(3);
  });
});

describe('Agent Memory — Episode Storage & Retrieval', () => {
  it('inserts an episode with default relevance score of 1.0', () => {
    const id = insertEpisode('user-1', 'watchdog', 'Paused campaign X');
    const row = db.prepare('SELECT * FROM agent_episodes WHERE id = ?').get(id) as any;
    expect(row.event).toBe('Paused campaign X');
    expect(row.relevance_score).toBe(1.0);
    expect(row.reinforcement_count).toBe(0);
  });

  it('stores context and outcome', () => {
    const id = insertEpisode('user-1', 'watchdog', 'Budget cut', 'CPA was too high', 'CPA dropped 20%');
    const row = db.prepare('SELECT * FROM agent_episodes WHERE id = ?').get(id) as any;
    expect(row.context).toBe('CPA was too high');
    expect(row.outcome).toBe('CPA dropped 20%');
  });

  it('retrieves episodes ordered by relevance then recency', () => {
    insertEpisode('user-1', 'watchdog', 'Low relevance', undefined, undefined, 0.5);
    insertEpisode('user-1', 'watchdog', 'High relevance', undefined, undefined, 2.0);
    insertEpisode('user-1', 'watchdog', 'Medium relevance', undefined, undefined, 1.0);

    const episodes = db.prepare(`
      SELECT event, relevance_score FROM agent_episodes
      WHERE user_id = 'user-1' AND agent_type = 'watchdog'
      ORDER BY relevance_score DESC, created_at DESC
    `).all() as any[];

    expect(episodes[0].event).toBe('High relevance');
    expect(episodes[1].event).toBe('Medium relevance');
    expect(episodes[2].event).toBe('Low relevance');
  });

  it('filters by relevance threshold', () => {
    insertEpisode('user-1', 'watchdog', 'Good episode', undefined, undefined, 1.5);
    insertEpisode('user-1', 'watchdog', 'Bad episode', undefined, undefined, 0.2);

    const episodes = db.prepare(`
      SELECT event FROM agent_episodes
      WHERE user_id = 'user-1' AND agent_type = 'watchdog' AND relevance_score >= 0.3
    `).all() as any[];

    expect(episodes).toHaveLength(1);
    expect(episodes[0].event).toBe('Good episode');
  });
});

describe('Agent Memory — Reinforcement & Penalty', () => {
  it('reinforces an episode (boosts score)', () => {
    const id = insertEpisode('user-1', 'watchdog', 'Good call');
    reinforceEpisode(id, 0.5);
    const row = db.prepare('SELECT relevance_score, reinforcement_count FROM agent_episodes WHERE id = ?').get(id) as any;
    expect(row.relevance_score).toBe(1.5);
    expect(row.reinforcement_count).toBe(1);
  });

  it('caps reinforcement at 3.0', () => {
    const id = insertEpisode('user-1', 'watchdog', 'Great call', undefined, undefined, 2.8);
    reinforceEpisode(id, 0.5);
    const row = db.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(id) as any;
    expect(row.relevance_score).toBe(3.0);
  });

  it('penalizes an episode (reduces score)', () => {
    const id = insertEpisode('user-1', 'watchdog', 'Bad call', undefined, undefined, 1.0);
    penalizeEpisode(id, 0.5);
    const row = db.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(id) as any;
    expect(row.relevance_score).toBe(0.5);
  });

  it('penalty floor is 0.1', () => {
    const id = insertEpisode('user-1', 'watchdog', 'Terrible call', undefined, undefined, 0.2);
    penalizeEpisode(id, 0.5);
    const row = db.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(id) as any;
    expect(row.relevance_score).toBe(0.1);
  });

  it('multiple reinforcements stack', () => {
    const id = insertEpisode('user-1', 'watchdog', 'Good call');
    reinforceEpisode(id, 0.3);
    reinforceEpisode(id, 0.3);
    reinforceEpisode(id, 0.3);
    const row = db.prepare('SELECT relevance_score, reinforcement_count FROM agent_episodes WHERE id = ?').get(id) as any;
    expect(row.relevance_score).toBeCloseTo(1.9, 1);
    expect(row.reinforcement_count).toBe(3);
  });
});

describe('Agent Memory — Entity Tracking', () => {
  it('creates a new entity from type:name format', () => {
    upsertEntity('user-1', 'campaign:Summer Sale 2024');
    const entity = db.prepare(
      "SELECT * FROM agent_entities WHERE user_id = 'user-1' AND entity_type = 'campaign'"
    ).get() as any;
    expect(entity.entity_name).toBe('Summer Sale 2024');
    expect(entity.mention_count).toBe(1);
  });

  it('increments mention count on duplicate entity', () => {
    upsertEntity('user-1', 'campaign:Summer Sale');
    upsertEntity('user-1', 'campaign:Summer Sale');
    upsertEntity('user-1', 'campaign:Summer Sale');
    const entity = db.prepare(
      "SELECT mention_count FROM agent_entities WHERE user_id = 'user-1' AND entity_name = 'Summer Sale'"
    ).get() as any;
    expect(entity.mention_count).toBe(3);
  });

  it('defaults to general type when no colon', () => {
    upsertEntity('user-1', 'ROAS');
    const entity = db.prepare(
      "SELECT entity_type FROM agent_entities WHERE user_id = 'user-1' AND entity_name = 'ROAS'"
    ).get() as any;
    expect(entity.entity_type).toBe('general');
  });

  it('handles entity names containing colons', () => {
    // "metric:ROAS:week" should split on FIRST colon only
    upsertEntity('user-1', 'metric:ROAS:week');
    const entity = db.prepare(
      "SELECT entity_type, entity_name FROM agent_entities WHERE user_id = 'user-1' AND entity_type = 'metric'"
    ).get() as any;
    expect(entity.entity_name).toBe('ROAS:week');
  });

  it('tracks entities for different users independently', () => {
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
      'user-2', 'User 2', 'user2@test.com', 'hash'
    );
    upsertEntity('user-1', 'campaign:Alpha');
    upsertEntity('user-2', 'campaign:Alpha');
    const count1 = db.prepare(
      "SELECT mention_count FROM agent_entities WHERE user_id = 'user-1' AND entity_name = 'Alpha'"
    ).get() as any;
    const count2 = db.prepare(
      "SELECT mention_count FROM agent_entities WHERE user_id = 'user-2' AND entity_name = 'Alpha'"
    ).get() as any;
    expect(count1.mention_count).toBe(1);
    expect(count2.mention_count).toBe(1);
  });
});

describe('Agent Memory — Context Window Assembly', () => {
  it('includes core memory in context window', () => {
    setCoreMemory('user-1', 'watchdog', 'target_roas', '3.0');
    const ctx = buildContextWindow('user-1', 'watchdog');
    expect(ctx).toContain('CORE MEMORY:');
    expect(ctx).toContain('target_roas: 3.0');
  });

  it('includes episodes above relevance threshold', () => {
    insertEpisode('user-1', 'watchdog', 'Paused low-ROAS campaign', undefined, undefined, 1.5);
    insertEpisode('user-1', 'watchdog', 'Stale episode', undefined, undefined, 0.1);
    const ctx = buildContextWindow('user-1', 'watchdog', { relevanceThreshold: 0.3 });
    expect(ctx).toContain('Paused low-ROAS campaign');
    expect(ctx).not.toContain('Stale episode');
  });

  it('marks reinforced episodes in context', () => {
    const id = insertEpisode('user-1', 'watchdog', 'Scaled budget', undefined, undefined, 2.0);
    const ctx = buildContextWindow('user-1', 'watchdog');
    expect(ctx).toContain('reinforced');
  });

  it('includes episode outcomes when present', () => {
    insertEpisode('user-1', 'watchdog', 'Cut budget on X', undefined, 'CPA dropped 30%');
    const ctx = buildContextWindow('user-1', 'watchdog');
    expect(ctx).toContain('Outcome: CPA dropped 30%');
  });

  it('includes entities in context window', () => {
    upsertEntity('user-1', 'campaign:Summer Sale');
    upsertEntity('user-1', 'campaign:Summer Sale');
    const ctx = buildContextWindow('user-1', 'watchdog');
    expect(ctx).toContain('KNOWN ENTITIES:');
    expect(ctx).toContain('campaign:Summer Sale (mentioned 2x)');
  });

  it('filters entities by type when entityTypes provided', () => {
    upsertEntity('user-1', 'campaign:Alpha');
    upsertEntity('user-1', 'metric:ROAS');
    const ctx = buildContextWindow('user-1', 'watchdog', { entityTypes: ['campaign'] });
    expect(ctx).toContain('campaign:Alpha');
    expect(ctx).not.toContain('metric:ROAS');
  });

  it('limits episodes to maxEpisodes', () => {
    for (let i = 0; i < 20; i++) {
      insertEpisode('user-1', 'watchdog', `Episode ${i}`);
    }
    const ctx = buildContextWindow('user-1', 'watchdog', { maxEpisodes: 5 });
    const episodeCount = (ctx.match(/Episode \d+/g) || []).length;
    expect(episodeCount).toBe(5);
  });

  it('returns empty string when no memory exists', () => {
    const ctx = buildContextWindow('user-1', 'watchdog');
    expect(ctx).toBe('');
  });
});
