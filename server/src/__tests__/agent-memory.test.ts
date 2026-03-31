/**
 * Tests for agent-memory.ts — three-tier memory system (core, episodic, entity).
 *
 * Tests buildContextWindow(), recordEpisode(), runDecay(), reinforcement,
 * penalization, and core memory CRUD operations against real in-memory SQLite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTables } from '../db/schema.js';
import { v4 as uuidv4 } from 'uuid';

// Mock the db module to return our in-memory database
let testDb: Database.Database;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
}));

// Mock Anthropic SDK (used for entity extraction via Haiku)
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '["campaign:Summer Sale", "metric:ROAS"]' }],
        }),
      };
    },
  };
});

// Mock config
vi.mock('../config.js', () => ({
  config: {
    anthropicApiKey: 'test-key',
  },
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock extractText helper
vi.mock('../utils/claude-helpers.js', () => ({
  extractText: (response: any) => {
    for (const block of response.content) {
      if (block.type === 'text') return block.text;
    }
    return '';
  },
}));

const TEST_USER_ID = 'user-test-1';

describe('Agent Memory', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('foreign_keys = ON');
    createTables(testDb);

    // Insert test user (required by foreign keys)
    testDb.prepare(
      'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(TEST_USER_ID, 'Test User', 'test@test.com', 'hash');
  });

  afterEach(() => {
    testDb.close();
    vi.restoreAllMocks();
  });

  describe('getCoreMemory', () => {
    it('returns empty object when no core memory exists', async () => {
      const { getCoreMemory } = await import('../services/agent-memory.js');
      const memory = getCoreMemory(TEST_USER_ID, 'watchdog');
      expect(memory).toEqual({});
    });

    it('returns all key-value pairs for user+agent', async () => {
      // Insert core memory directly
      testDb.prepare(
        "INSERT INTO agent_core_memory (id, user_id, agent_type, key, value, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
      ).run(uuidv4(), TEST_USER_ID, 'watchdog', 'strategy', 'Focus on ROAS > 2.0');
      testDb.prepare(
        "INSERT INTO agent_core_memory (id, user_id, agent_type, key, value, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
      ).run(uuidv4(), TEST_USER_ID, 'watchdog', 'budget_limit', '$500/day');

      const { getCoreMemory } = await import('../services/agent-memory.js');
      const memory = getCoreMemory(TEST_USER_ID, 'watchdog');
      expect(memory).toEqual({
        strategy: 'Focus on ROAS > 2.0',
        budget_limit: '$500/day',
      });
    });

    it('does not return memory from other agent types', async () => {
      testDb.prepare(
        "INSERT INTO agent_core_memory (id, user_id, agent_type, key, value, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
      ).run(uuidv4(), TEST_USER_ID, 'briefing', 'tone', 'formal');

      const { getCoreMemory } = await import('../services/agent-memory.js');
      const memory = getCoreMemory(TEST_USER_ID, 'watchdog');
      expect(memory).toEqual({});
    });
  });

  describe('setCoreMemory', () => {
    it('inserts new core memory', async () => {
      const { setCoreMemory, getCoreMemory } = await import('../services/agent-memory.js');
      setCoreMemory(TEST_USER_ID, 'watchdog', 'preference', 'conservative');

      const memory = getCoreMemory(TEST_USER_ID, 'watchdog');
      expect(memory.preference).toBe('conservative');
    });

    it('upserts existing key (updates value)', async () => {
      const { setCoreMemory, getCoreMemory } = await import('../services/agent-memory.js');
      setCoreMemory(TEST_USER_ID, 'watchdog', 'threshold', '50');
      setCoreMemory(TEST_USER_ID, 'watchdog', 'threshold', '75');

      const memory = getCoreMemory(TEST_USER_ID, 'watchdog');
      expect(memory.threshold).toBe('75');

      // Verify only one row exists
      const count = (testDb.prepare(
        "SELECT COUNT(*) as c FROM agent_core_memory WHERE user_id = ? AND agent_type = ? AND key = ?"
      ).get(TEST_USER_ID, 'watchdog', 'threshold') as { c: number }).c;
      expect(count).toBe(1);
    });
  });

  describe('deleteCoreMemory', () => {
    it('removes a specific core memory key', async () => {
      const { setCoreMemory, deleteCoreMemory, getCoreMemory } = await import('../services/agent-memory.js');
      setCoreMemory(TEST_USER_ID, 'watchdog', 'temp', 'value');
      deleteCoreMemory(TEST_USER_ID, 'watchdog', 'temp');

      const memory = getCoreMemory(TEST_USER_ID, 'watchdog');
      expect(memory.temp).toBeUndefined();
    });
  });

  describe('recordEpisode', () => {
    it('inserts an episode with default relevance_score 1.0', async () => {
      const { recordEpisode } = await import('../services/agent-memory.js');
      const episodeId = await recordEpisode(
        TEST_USER_ID, 'watchdog',
        'Paused campaign Summer Sale due to high CPA',
        'CPA was $120, threshold $50',
        'Campaign paused successfully'
      );

      expect(episodeId).toBeTruthy();

      const row = testDb.prepare('SELECT * FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row).toBeTruthy();
      expect(row.event).toBe('Paused campaign Summer Sale due to high CPA');
      expect(row.context).toBe('CPA was $120, threshold $50');
      expect(row.outcome).toBe('Campaign paused successfully');
      expect(row.relevance_score).toBe(1.0);
      expect(row.reinforcement_count).toBe(0);
    });

    it('inserts episode with null context and outcome when not provided', async () => {
      const { recordEpisode } = await import('../services/agent-memory.js');
      const episodeId = await recordEpisode(TEST_USER_ID, 'watchdog', 'Test event');

      const row = testDb.prepare('SELECT * FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.context).toBeNull();
      expect(row.outcome).toBeNull();
    });
  });

  describe('updateEpisodeOutcome', () => {
    it('updates outcome on an existing episode', async () => {
      const { recordEpisode, updateEpisodeOutcome } = await import('../services/agent-memory.js');
      const episodeId = await recordEpisode(TEST_USER_ID, 'watchdog', 'Suggested budget increase');

      updateEpisodeOutcome(episodeId, 'ROAS improved from 1.2 to 2.5');

      const row = testDb.prepare('SELECT outcome FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.outcome).toBe('ROAS improved from 1.2 to 2.5');
    });
  });

  describe('reinforceEpisode', () => {
    it('boosts relevance score by default 0.3', async () => {
      const { recordEpisode, reinforceEpisode } = await import('../services/agent-memory.js');
      const episodeId = await recordEpisode(TEST_USER_ID, 'watchdog', 'Good decision');

      reinforceEpisode(episodeId);

      const row = testDb.prepare('SELECT relevance_score, reinforcement_count FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.relevance_score).toBeCloseTo(1.3, 2);
      expect(row.reinforcement_count).toBe(1);
    });

    it('caps relevance score at 3.0', async () => {
      const { recordEpisode, reinforceEpisode } = await import('../services/agent-memory.js');
      const episodeId = await recordEpisode(TEST_USER_ID, 'watchdog', 'Great decision');

      // Reinforce many times to hit the cap
      for (let i = 0; i < 20; i++) {
        reinforceEpisode(episodeId);
      }

      const row = testDb.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.relevance_score).toBe(3.0);
    });

    it('accepts custom boost amount', async () => {
      const { recordEpisode, reinforceEpisode } = await import('../services/agent-memory.js');
      const episodeId = await recordEpisode(TEST_USER_ID, 'watchdog', 'Custom boost');

      reinforceEpisode(episodeId, 0.5);

      const row = testDb.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.relevance_score).toBeCloseTo(1.5, 2);
    });
  });

  describe('penalizeEpisode', () => {
    it('reduces relevance score by default 0.3', async () => {
      const { recordEpisode, penalizeEpisode } = await import('../services/agent-memory.js');
      const episodeId = await recordEpisode(TEST_USER_ID, 'watchdog', 'Bad decision');

      penalizeEpisode(episodeId);

      const row = testDb.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.relevance_score).toBeCloseTo(0.7, 2);
    });

    it('floors relevance score at 0.1', async () => {
      const { recordEpisode, penalizeEpisode } = await import('../services/agent-memory.js');
      const episodeId = await recordEpisode(TEST_USER_ID, 'watchdog', 'Terrible decision');

      for (let i = 0; i < 20; i++) {
        penalizeEpisode(episodeId);
      }

      const row = testDb.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.relevance_score).toBeCloseTo(0.1, 2);
    });
  });

  describe('runDecay', () => {
    it('decays old un-reinforced episodes by 10%', async () => {
      // Insert an old episode (> 14 days ago, reinforcement_count = 0, relevance > 0.2)
      const episodeId = uuidv4();
      testDb.prepare(`
        INSERT INTO agent_episodes (id, user_id, agent_type, event, relevance_score, reinforcement_count, created_at)
        VALUES (?, ?, 'watchdog', 'Old event', 1.0, 0, datetime('now', '-20 days'))
      `).run(episodeId, TEST_USER_ID);

      const { runDecay } = await import('../services/agent-memory.js');
      const changed = runDecay();

      expect(changed).toBeGreaterThanOrEqual(1);

      const row = testDb.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.relevance_score).toBeCloseTo(0.9, 2); // 1.0 * 0.9
    });

    it('does NOT decay reinforced episodes', async () => {
      const episodeId = uuidv4();
      testDb.prepare(`
        INSERT INTO agent_episodes (id, user_id, agent_type, event, relevance_score, reinforcement_count, created_at)
        VALUES (?, ?, 'watchdog', 'Reinforced event', 1.5, 2, datetime('now', '-20 days'))
      `).run(episodeId, TEST_USER_ID);

      const { runDecay } = await import('../services/agent-memory.js');
      runDecay();

      const row = testDb.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.relevance_score).toBe(1.5); // Unchanged
    });

    it('does NOT decay recent episodes (< 14 days)', async () => {
      const episodeId = uuidv4();
      testDb.prepare(`
        INSERT INTO agent_episodes (id, user_id, agent_type, event, relevance_score, reinforcement_count, created_at)
        VALUES (?, ?, 'watchdog', 'Recent event', 1.0, 0, datetime('now', '-5 days'))
      `).run(episodeId, TEST_USER_ID);

      const { runDecay } = await import('../services/agent-memory.js');
      runDecay();

      const row = testDb.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.relevance_score).toBe(1.0);
    });

    it('deletes very old episodes with very low relevance (> 90 days, < 0.2)', async () => {
      const episodeId = uuidv4();
      testDb.prepare(`
        INSERT INTO agent_episodes (id, user_id, agent_type, event, relevance_score, reinforcement_count, created_at)
        VALUES (?, ?, 'watchdog', 'Ancient event', 0.15, 0, datetime('now', '-100 days'))
      `).run(episodeId, TEST_USER_ID);

      const { runDecay } = await import('../services/agent-memory.js');
      runDecay();

      const row = testDb.prepare('SELECT * FROM agent_episodes WHERE id = ?').get(episodeId);
      expect(row).toBeUndefined(); // Deleted
    });

    it('filters by agentType when provided', async () => {
      const watchdogId = uuidv4();
      const briefingId = uuidv4();

      testDb.prepare(`
        INSERT INTO agent_episodes (id, user_id, agent_type, event, relevance_score, reinforcement_count, created_at)
        VALUES (?, ?, 'watchdog', 'Watchdog old', 1.0, 0, datetime('now', '-20 days'))
      `).run(watchdogId, TEST_USER_ID);

      testDb.prepare(`
        INSERT INTO agent_episodes (id, user_id, agent_type, event, relevance_score, reinforcement_count, created_at)
        VALUES (?, ?, 'briefing', 'Briefing old', 1.0, 0, datetime('now', '-20 days'))
      `).run(briefingId, TEST_USER_ID);

      const { runDecay } = await import('../services/agent-memory.js');
      runDecay('watchdog');

      const watchdogRow = testDb.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(watchdogId) as any;
      const briefingRow = testDb.prepare('SELECT relevance_score FROM agent_episodes WHERE id = ?').get(briefingId) as any;

      expect(watchdogRow.relevance_score).toBeCloseTo(0.9, 2); // Decayed
      expect(briefingRow.relevance_score).toBe(1.0); // Untouched
    });
  });

  describe('buildContextWindow', () => {
    it('includes core memory in output', async () => {
      testDb.prepare(
        "INSERT INTO agent_core_memory (id, user_id, agent_type, key, value, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
      ).run(uuidv4(), TEST_USER_ID, 'watchdog', 'strategy', 'Focus on ROAS');

      const { buildContextWindow } = await import('../services/agent-memory.js');
      const context = buildContextWindow(TEST_USER_ID, 'watchdog');

      expect(context).toContain('CORE MEMORY:');
      expect(context).toContain('strategy: Focus on ROAS');
    });

    it('includes relevant episodes sorted by relevance', async () => {
      // Insert episodes with different relevance
      testDb.prepare(`
        INSERT INTO agent_episodes (id, user_id, agent_type, event, outcome, relevance_score, reinforcement_count, created_at)
        VALUES (?, ?, 'watchdog', 'High relevance event', 'Good outcome', 2.0, 1, datetime('now', '-1 day'))
      `).run(uuidv4(), TEST_USER_ID);

      testDb.prepare(`
        INSERT INTO agent_episodes (id, user_id, agent_type, event, outcome, relevance_score, reinforcement_count, created_at)
        VALUES (?, ?, 'watchdog', 'Low relevance event', NULL, 0.5, 0, datetime('now', '-2 days'))
      `).run(uuidv4(), TEST_USER_ID);

      const { buildContextWindow } = await import('../services/agent-memory.js');
      const context = buildContextWindow(TEST_USER_ID, 'watchdog');

      expect(context).toContain('PAST EPISODES:');
      expect(context).toContain('High relevance event');
      expect(context).toContain('Good outcome');
      expect(context).toContain('(reinforced');
    });

    it('filters episodes below relevance threshold', async () => {
      testDb.prepare(`
        INSERT INTO agent_episodes (id, user_id, agent_type, event, relevance_score, reinforcement_count, created_at)
        VALUES (?, ?, 'watchdog', 'Irrelevant event', 0.1, 0, datetime('now'))
      `).run(uuidv4(), TEST_USER_ID);

      const { buildContextWindow } = await import('../services/agent-memory.js');
      const context = buildContextWindow(TEST_USER_ID, 'watchdog', { relevanceThreshold: 0.3 });

      expect(context).not.toContain('Irrelevant event');
    });

    it('includes known entities', async () => {
      testDb.prepare(`
        INSERT INTO agent_entities (id, user_id, entity_type, entity_name, mention_count, first_seen, last_seen)
        VALUES (?, ?, 'campaign', 'Summer Sale', 5, datetime('now', '-10 days'), datetime('now'))
      `).run(uuidv4(), TEST_USER_ID);

      const { buildContextWindow } = await import('../services/agent-memory.js');
      const context = buildContextWindow(TEST_USER_ID, 'watchdog');

      expect(context).toContain('KNOWN ENTITIES:');
      expect(context).toContain('campaign:Summer Sale');
      expect(context).toContain('mentioned 5x');
    });

    it('filters entities by type when entityTypes provided', async () => {
      testDb.prepare(`
        INSERT INTO agent_entities (id, user_id, entity_type, entity_name, mention_count, first_seen, last_seen)
        VALUES (?, ?, 'campaign', 'Summer Sale', 5, datetime('now'), datetime('now'))
      `).run(uuidv4(), TEST_USER_ID);

      testDb.prepare(`
        INSERT INTO agent_entities (id, user_id, entity_type, entity_name, mention_count, first_seen, last_seen)
        VALUES (?, ?, 'metric', 'ROAS', 3, datetime('now'), datetime('now'))
      `).run(uuidv4(), TEST_USER_ID);

      const { buildContextWindow } = await import('../services/agent-memory.js');
      const context = buildContextWindow(TEST_USER_ID, 'watchdog', { entityTypes: ['campaign'] });

      expect(context).toContain('campaign:Summer Sale');
      expect(context).not.toContain('metric:ROAS');
    });

    it('respects maxEpisodes limit', async () => {
      // Insert 20 episodes
      for (let i = 0; i < 20; i++) {
        testDb.prepare(`
          INSERT INTO agent_episodes (id, user_id, agent_type, event, relevance_score, reinforcement_count, created_at)
          VALUES (?, ?, 'watchdog', ?, 1.0, 0, datetime('now'))
        `).run(uuidv4(), TEST_USER_ID, `Event ${i}`);
      }

      const { buildContextWindow } = await import('../services/agent-memory.js');
      const context = buildContextWindow(TEST_USER_ID, 'watchdog', { maxEpisodes: 5 });

      // Count episode lines (each starts with "- [")
      const episodeLines = context.split('\n').filter(l => l.startsWith('- ['));
      expect(episodeLines.length).toBeLessThanOrEqual(5);
    });

    it('returns empty string when no memory exists', async () => {
      const { buildContextWindow } = await import('../services/agent-memory.js');
      const context = buildContextWindow(TEST_USER_ID, 'watchdog');
      expect(context).toBe('');
    });

    it('includes entity attributes when available', async () => {
      testDb.prepare(`
        INSERT INTO agent_entities (id, user_id, entity_type, entity_name, attributes, mention_count, first_seen, last_seen)
        VALUES (?, ?, 'campaign', 'Winter Promo', '{"status":"active","budget":"500"}', 3, datetime('now'), datetime('now'))
      `).run(uuidv4(), TEST_USER_ID);

      const { buildContextWindow } = await import('../services/agent-memory.js');
      const context = buildContextWindow(TEST_USER_ID, 'watchdog');

      expect(context).toContain('status=active');
      expect(context).toContain('budget=500');
    });
  });

  describe('recordDecisionEpisode', () => {
    it('formats decision as an episode event', async () => {
      const { recordDecisionEpisode } = await import('../services/agent-memory.js');
      const episodeId = await recordDecisionEpisode(TEST_USER_ID, 'watchdog', {
        type: 'budget_change',
        targetName: 'Summer Sale Campaign',
        suggestedAction: 'reduce budget by 20%',
        reasoning: 'CPA has increased 3x in the last 7 days',
        outcome: 'Budget reduced',
      });

      const row = testDb.prepare('SELECT * FROM agent_episodes WHERE id = ?').get(episodeId) as any;
      expect(row.event).toContain('reduce budget by 20%');
      expect(row.event).toContain('Summer Sale Campaign');
      expect(row.context).toBe('CPA has increased 3x in the last 7 days');
      expect(row.outcome).toBe('Budget reduced');
    });
  });
});
