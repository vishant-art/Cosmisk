/**
 * PATTERN TRANSFER - Cross-Client Learning System
 *
 * Promotes high-confidence patterns observed across multiple clients into
 * global knowledge that can be injected into new client contexts.
 *
 * RULES:
 * - Pattern must appear in 3+ clients with 90%+ confidence to go global
 * - Global patterns are category-specific (oos, fatigue, ltv, creative, discount, general)
 * - Used to bootstrap new client intelligence faster
 */

import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { getRunningContext } from './strategic-memory.js';

// ============================================================================
// TYPES
// ============================================================================

export interface GlobalPattern {
  id: string;
  pattern: string;
  confidence: number;
  sourceClientCount: number;
  createdAt: string;
  category: 'oos' | 'fatigue' | 'ltv' | 'creative' | 'discount' | 'general';
}

interface PatternCandidate {
  pattern: string;
  category: GlobalPattern['category'];
  confidence: number;
  clientId: string;
  evidence: string;
  learnedAt: string;
}

// ============================================================================
// DATABASE SETUP
// ============================================================================

/**
 * Initialize global patterns table
 * Call this during app startup or first use
 */
export function setupGlobalPatternsSchema(): void {
  const db = getDb();

  // Global patterns table
  db.exec(`
    CREATE TABLE IF NOT EXISTS global_patterns (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      category TEXT NOT NULL,
      confidence REAL NOT NULL,
      source_client_count INTEGER NOT NULL DEFAULT 1,
      source_clients TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Index for fast category lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_global_patterns_category
    ON global_patterns(category)
  `);

  // Index for confidence-based queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_global_patterns_confidence
    ON global_patterns(confidence DESC)
  `);

  logger.info('[PatternTransfer] Global patterns schema initialized');
}

// ============================================================================
// PATTERN PROMOTION
// ============================================================================

/**
 * Attempt to promote a pattern to global knowledge
 *
 * Logic:
 * 1. Check if pattern exists in 3+ different clients with 90%+ confidence
 * 2. If yes, promote to global_patterns table
 * 3. Return true if promoted, false otherwise
 *
 * This is typically called after addLearnedPattern() in strategic-memory.ts
 */
export function promotePatternToGlobal(
  pattern: string,
  category: GlobalPattern['category'],
  confidence: number
): boolean {
  const db = getDb();

  // Don't promote low-confidence patterns
  if (confidence < 90) {
    logger.debug(`[PatternTransfer] Pattern confidence ${confidence}% too low for promotion`);
    return false;
  }

  // Check if pattern already exists globally
  const existing = db
    .prepare('SELECT id, source_client_count FROM global_patterns WHERE pattern = ? AND category = ?')
    .get(pattern, category) as { id: string; source_client_count: number } | undefined;

  if (existing) {
    logger.debug(`[PatternTransfer] Pattern already global (${existing.source_client_count} clients)`);
    return true;
  }

  // Scan all clients to see how many have learned this pattern
  const candidates = extractPatternCandidates(pattern, category);

  if (candidates.length < 3) {
    logger.debug(
      `[PatternTransfer] Pattern found in ${candidates.length}/3 clients, not promoting yet`
    );
    return false;
  }

  // Promote to global
  const id = crypto.randomUUID();
  const sourceClients = candidates.map(c => c.clientId).join(',');
  const avgConfidence = candidates.reduce((sum, c) => sum + c.confidence, 0) / candidates.length;

  db.prepare(`
    INSERT INTO global_patterns (id, pattern, category, confidence, source_client_count, source_clients, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, pattern, category, avgConfidence, candidates.length, sourceClients, new Date().toISOString());

  logger.info(
    `[PatternTransfer] ✓ Promoted pattern to global: "${pattern}" (${category}, ${candidates.length} clients, ${avgConfidence.toFixed(0)}% confidence)`
  );

  return true;
}

/**
 * Extract all instances of a pattern across all clients
 * Used to check if pattern qualifies for promotion
 */
function extractPatternCandidates(
  pattern: string,
  category: GlobalPattern['category']
): PatternCandidate[] {
  const db = getDb();

  // Get all running contexts
  const contexts = db
    .prepare('SELECT client_id, context_json FROM strategic_running_context')
    .all() as { client_id: string; context_json: string }[];

  const candidates: PatternCandidate[] = [];

  for (const row of contexts) {
    try {
      const context = JSON.parse(row.context_json);

      // Check learned patterns
      if (context.learnedPatterns && Array.isArray(context.learnedPatterns)) {
        for (const learned of context.learnedPatterns) {
          // Fuzzy match: normalize whitespace and case for comparison
          const normalizedPattern = pattern.toLowerCase().replace(/\s+/g, ' ').trim();
          const normalizedLearned = learned.pattern.toLowerCase().replace(/\s+/g, ' ').trim();

          if (normalizedLearned.includes(normalizedPattern) || normalizedPattern.includes(normalizedLearned)) {
            if (learned.confidence >= 90) {
              candidates.push({
                pattern: learned.pattern,
                category,
                confidence: learned.confidence,
                clientId: row.client_id,
                evidence: learned.evidence || 'N/A',
                learnedAt: learned.learnedAt || new Date().toISOString(),
              });
              break; // Only count once per client
            }
          }
        }
      }
    } catch (err) {
      logger.warn(`[PatternTransfer] Failed to parse context for ${row.client_id}: ${err}`);
    }
  }

  return candidates;
}

// ============================================================================
// GLOBAL PATTERN RETRIEVAL
// ============================================================================

/**
 * Get all global patterns, optionally filtered by category
 *
 * Returns patterns sorted by confidence (highest first)
 */
export function getGlobalPatterns(category?: GlobalPattern['category']): GlobalPattern[] {
  const db = getDb();

  let query = `
    SELECT id, pattern, category, confidence, source_client_count, created_at
    FROM global_patterns
  `;
  const params: any[] = [];

  if (category) {
    query += ' WHERE category = ?';
    params.push(category);
  }

  query += ' ORDER BY confidence DESC, source_client_count DESC';

  const rows = db.prepare(query).all(...params) as Array<{
    id: string;
    pattern: string;
    category: string;
    confidence: number;
    source_client_count: number;
    created_at: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    pattern: row.pattern,
    confidence: row.confidence,
    sourceClientCount: row.source_client_count,
    createdAt: row.created_at,
    category: row.category as GlobalPattern['category'],
  }));
}

/**
 * Get global patterns formatted as context string for agent injection
 *
 * This is what gets injected into new client contexts to bootstrap their intelligence
 */
export function getContextWithGlobalPatterns(clientId: string): string {
  const db = getDb();

  // Get client's own context first
  const clientContext = getRunningContext(clientId);

  // Get all global patterns
  const globalPatterns = getGlobalPatterns();

  if (globalPatterns.length === 0) {
    return ''; // No global patterns yet
  }

  // Build context string
  let context = `
═══════════════════════════════════════════════════════════════════════
GLOBAL PATTERNS - Cross-Client Intelligence
Learned from ${new Set(globalPatterns.map(p => p.sourceClientCount)).size} clients
═══════════════════════════════════════════════════════════════════════

These patterns have been observed across multiple clients with high confidence.
Use them as starting hypotheses for ${clientId.toUpperCase()}.

`;

  // Group by category
  const categories: Record<string, GlobalPattern[]> = {};
  for (const pattern of globalPatterns) {
    if (!categories[pattern.category]) {
      categories[pattern.category] = [];
    }
    categories[pattern.category].push(pattern);
  }

  for (const [cat, patterns] of Object.entries(categories)) {
    context += `\n${cat.toUpperCase()} PATTERNS:\n`;
    for (const p of patterns) {
      context += `  • ${p.pattern}\n`;
      context += `    Confidence: ${p.confidence.toFixed(0)}%, Seen in ${p.sourceClientCount} clients\n`;
    }
  }

  context += `
─────────────────────────────────────────────────────────────────────
NOTE: These are starting points. Validate against ${clientId}'s specific data.
─────────────────────────────────────────────────────────────────────
`;

  return context;
}

// ============================================================================
// PATTERN MANAGEMENT
// ============================================================================

/**
 * Get pattern statistics for monitoring
 */
export function getGlobalPatternStats(): {
  totalPatterns: number;
  byCategory: Record<string, number>;
  avgConfidence: number;
  avgClientCount: number;
} {
  const db = getDb();

  const total = db
    .prepare('SELECT COUNT(*) as count FROM global_patterns')
    .get() as { count: number };

  const byCategory = db
    .prepare('SELECT category, COUNT(*) as count FROM global_patterns GROUP BY category')
    .all() as Array<{ category: string; count: number }>;

  const stats = db
    .prepare('SELECT AVG(confidence) as avg_conf, AVG(source_client_count) as avg_clients FROM global_patterns')
    .get() as { avg_conf: number; avg_clients: number } | undefined;

  return {
    totalPatterns: total.count,
    byCategory: byCategory.reduce((acc, row) => {
      acc[row.category] = row.count;
      return acc;
    }, {} as Record<string, number>),
    avgConfidence: stats?.avg_conf || 0,
    avgClientCount: stats?.avg_clients || 0,
  };
}

/**
 * Delete a global pattern (admin function)
 */
export function deleteGlobalPattern(patternId: string): boolean {
  const db = getDb();

  const result = db.prepare('DELETE FROM global_patterns WHERE id = ?').run(patternId);

  if (result.changes > 0) {
    logger.info(`[PatternTransfer] Deleted global pattern ${patternId}`);
    return true;
  }

  return false;
}

/**
 * Batch scan all clients and promote qualifying patterns
 * Run this periodically (e.g., weekly) to discover new global patterns
 */
export function scanAndPromotePatterns(): {
  scanned: number;
  promoted: number;
  patterns: string[];
} {
  const db = getDb();

  // Get all unique patterns across all clients
  const contexts = db
    .prepare('SELECT client_id, context_json FROM strategic_running_context')
    .all() as { client_id: string; context_json: string }[];

  const patternMap = new Map<string, { category: string; count: number }>();

  for (const row of contexts) {
    try {
      const context = JSON.parse(row.context_json);

      if (context.learnedPatterns && Array.isArray(context.learnedPatterns)) {
        for (const learned of context.learnedPatterns) {
          if (learned.confidence >= 90) {
            const key = `${learned.pattern}||${inferCategory(learned.pattern)}`;
            const existing = patternMap.get(key);
            if (existing) {
              existing.count++;
            } else {
              patternMap.set(key, { category: inferCategory(learned.pattern), count: 1 });
            }
          }
        }
      }
    } catch (err) {
      logger.warn(`[PatternTransfer] Failed to parse context for ${row.client_id}: ${err}`);
    }
  }

  // Promote patterns that appear in 3+ clients
  const promoted: string[] = [];
  patternMap.forEach((data, key) => {
    const [pattern] = key.split('||');
    if (data.count >= 3) {
      const success = promotePatternToGlobal(pattern, data.category as GlobalPattern['category'], 90);
      if (success) {
        promoted.push(pattern);
      }
    }
  });

  logger.info(
    `[PatternTransfer] Batch scan complete: ${patternMap.size} unique patterns, ${promoted.length} promoted`
  );

  return {
    scanned: patternMap.size,
    promoted: promoted.length,
    patterns: promoted,
  };
}

/**
 * Infer category from pattern text (simple heuristic)
 */
function inferCategory(pattern: string): GlobalPattern['category'] {
  const lower = pattern.toLowerCase();

  if (lower.includes('out of stock') || lower.includes('oos') || lower.includes('inventory')) {
    return 'oos';
  }
  if (lower.includes('fatigue') || lower.includes('frequency') || lower.includes('saturation')) {
    return 'fatigue';
  }
  if (lower.includes('ltv') || lower.includes('lifetime value') || lower.includes('retention')) {
    return 'ltv';
  }
  if (lower.includes('creative') || lower.includes('ad copy') || lower.includes('visual')) {
    return 'creative';
  }
  if (lower.includes('discount') || lower.includes('coupon') || lower.includes('promo')) {
    return 'discount';
  }

  return 'general';
}
