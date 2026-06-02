/**
 * Intelligence Infrastructure — Cosmisk
 *
 * TIER 3: Production infrastructure for the Intelligence Core
 *
 * Contains:
 * 1. Reasoning Traces — Debug why agents made decisions
 * 2. Evaluation Metrics — Track strategic quality over time
 * 3. Cross-brand Isolation — Prevent pattern contamination
 * 4. Vector-ready Pattern Storage — Abstraction for future vector DB
 */

import { getDbAdapter } from '../db/adapter.js';
import { logger } from '../utils/logger.js';
import type { Evidence } from './quality-gate.js';

// ============================================================================
// 1. REASONING TRACES
// ============================================================================

/**
 * A step in the decision-making process
 */
export interface ReasoningStep {
  stepNumber: number;
  action: string;           // What was done: 'fetch_data', 'analyze', 'filter', 'synthesize', 'decide'
  description: string;      // Human-readable description
  input?: unknown;          // What went in
  output?: unknown;         // What came out
  confidence?: number;      // Confidence at this step
  duration?: number;        // Time in ms
  metadata?: Record<string, unknown>;
}

/**
 * Alternatives that were considered but not chosen
 */
export interface ConsideredAlternative {
  action: string;
  reasoning: string;
  whyRejected: string;
  confidence: number;
}

/**
 * Complete reasoning trace for a decision
 */
export interface ReasoningTrace {
  id: string;
  clientId: string;
  agentType: string;        // 'watchdog', 'creative_strategist', 'report', etc.
  decisionId?: string;      // Link to agent_decisions table
  createdAt: string;

  // The decision chain
  steps: ReasoningStep[];

  // What evidence was used
  evidenceUsed: Evidence[];

  // What alternatives were considered
  alternativesConsidered: ConsideredAlternative[];

  // Final decision
  finalDecision: {
    action: string;
    target: string;
    confidence: number;
    reasoning: string;
  };

  // Quality metrics
  totalDuration: number;    // Total time to decide
  dataSourcesUsed: string[];
  synthesisDepth: number;   // How many signals were combined
}

/**
 * Builder for creating reasoning traces
 */
export class ReasoningTraceBuilder {
  private trace: Partial<ReasoningTrace>;
  private startTime: number;
  private stepStartTime: number;

  constructor(clientId: string, agentType: string) {
    this.startTime = Date.now();
    this.stepStartTime = Date.now();
    this.trace = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      clientId,
      agentType,
      createdAt: new Date().toISOString(),
      steps: [],
      evidenceUsed: [],
      alternativesConsidered: [],
      dataSourcesUsed: [],
      synthesisDepth: 0,
    };
  }

  /**
   * Add a step to the trace
   */
  addStep(
    action: string,
    description: string,
    options?: {
      input?: unknown;
      output?: unknown;
      confidence?: number;
      metadata?: Record<string, unknown>;
    }
  ): this {
    const now = Date.now();
    const step: ReasoningStep = {
      stepNumber: (this.trace.steps?.length || 0) + 1,
      action,
      description,
      duration: now - this.stepStartTime,
      ...options,
    };
    this.trace.steps?.push(step);
    this.stepStartTime = now;
    return this;
  }

  /**
   * Add evidence that was used
   */
  addEvidence(evidence: Evidence | Evidence[]): this {
    const evidenceArray = Array.isArray(evidence) ? evidence : [evidence];
    this.trace.evidenceUsed?.push(...evidenceArray);
    return this;
  }

  /**
   * Add a data source that was consulted
   */
  addDataSource(source: string): this {
    if (!this.trace.dataSourcesUsed?.includes(source)) {
      this.trace.dataSourcesUsed?.push(source);
    }
    return this;
  }

  /**
   * Add an alternative that was considered but rejected
   */
  addAlternative(
    action: string,
    reasoning: string,
    whyRejected: string,
    confidence: number
  ): this {
    this.trace.alternativesConsidered?.push({
      action,
      reasoning,
      whyRejected,
      confidence,
    });
    return this;
  }

  /**
   * Set the final decision
   */
  setFinalDecision(
    action: string,
    target: string,
    confidence: number,
    reasoning: string
  ): this {
    this.trace.finalDecision = { action, target, confidence, reasoning };
    return this;
  }

  /**
   * Link to a decision ID
   */
  linkToDecision(decisionId: string): this {
    this.trace.decisionId = decisionId;
    return this;
  }

  /**
   * Build and store the trace
   */
  build(): ReasoningTrace {
    const trace: ReasoningTrace = {
      ...this.trace,
      totalDuration: Date.now() - this.startTime,
      synthesisDepth: this.trace.dataSourcesUsed?.length || 0,
    } as ReasoningTrace;

    // Store in database (fire-and-forget — preserve sync build() signature)
    storeReasoningTrace(trace).catch(err => logger.debug({ err }, '[Infrastructure] storeReasoningTrace failed'));

    return trace;
  }
}

/**
 * Store a reasoning trace in the database
 */
async function storeReasoningTrace(trace: ReasoningTrace): Promise<void> {
  const db = getDbAdapter();

  try {
    await db.run(`
      INSERT INTO decision_traces (
        id, client_id, agent_type, decision_id, steps_json, evidence_json,
        alternatives_json, final_action, final_target, final_confidence,
        final_reasoning, total_duration, data_sources, synthesis_depth, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      trace.id,
      trace.clientId,
      trace.agentType,
      trace.decisionId || null,
      JSON.stringify(trace.steps),
      JSON.stringify(trace.evidenceUsed),
      JSON.stringify(trace.alternativesConsidered),
      trace.finalDecision?.action || null,
      trace.finalDecision?.target || null,
      trace.finalDecision?.confidence || null,
      trace.finalDecision?.reasoning || null,
      trace.totalDuration,
      JSON.stringify(trace.dataSourcesUsed),
      trace.synthesisDepth
    ]);
  } catch (err) {
    logger.debug({ err }, '[Infrastructure] decision_traces table not found');
  }
}

/**
 * Get reasoning trace for a decision
 */
export async function getReasoningTrace(decisionId: string): Promise<ReasoningTrace | null> {
  const db = getDbAdapter();

  try {
    const row = await db.get(`
      SELECT * FROM decision_traces WHERE decision_id = ?
    `, [decisionId]) as any;  // DB-2: typed when row becomes a Drizzle result

    if (!row) return null;

    return {
      id: row.id,
      clientId: row.client_id,
      agentType: row.agent_type,
      decisionId: row.decision_id,
      createdAt: row.created_at,
      steps: JSON.parse(row.steps_json || '[]'),
      evidenceUsed: JSON.parse(row.evidence_json || '[]'),
      alternativesConsidered: JSON.parse(row.alternatives_json || '[]'),
      finalDecision: {
        action: row.final_action,
        target: row.final_target,
        confidence: row.final_confidence,
        reasoning: row.final_reasoning,
      },
      totalDuration: row.total_duration,
      dataSourcesUsed: JSON.parse(row.data_sources || '[]'),
      synthesisDepth: row.synthesis_depth,
    };
  } catch {
    return null;
  }
}

/**
 * Explain a decision in human-readable format
 */
export async function explainDecision(decisionId: string): Promise<string> {
  const trace = await getReasoningTrace(decisionId);

  if (!trace) {
    return 'No reasoning trace found for this decision.';
  }

  const lines: string[] = [
    `## Decision Explanation`,
    `**Agent:** ${trace.agentType}`,
    `**Time:** ${trace.createdAt}`,
    `**Duration:** ${trace.totalDuration}ms`,
    '',
    `### Final Decision`,
    `- **Action:** ${trace.finalDecision.action}`,
    `- **Target:** ${trace.finalDecision.target}`,
    `- **Confidence:** ${trace.finalDecision.confidence}%`,
    `- **Reasoning:** ${trace.finalDecision.reasoning}`,
    '',
    `### Reasoning Steps`,
  ];

  for (const step of trace.steps) {
    lines.push(`${step.stepNumber}. **${step.action}** — ${step.description} (${step.duration}ms)`);
  }

  if (trace.evidenceUsed.length > 0) {
    lines.push('', `### Evidence Used (${trace.evidenceUsed.length} items)`);
    for (const ev of trace.evidenceUsed.slice(0, 5)) {
      lines.push(`- ${ev.metric}: ${ev.currentValue} (source: ${ev.source})`);
    }
  }

  if (trace.alternativesConsidered.length > 0) {
    lines.push('', `### Alternatives Considered`);
    for (const alt of trace.alternativesConsidered) {
      lines.push(`- **${alt.action}** (${alt.confidence}% confidence) — Rejected: ${alt.whyRejected}`);
    }
  }

  lines.push('', `### Data Sources`, trace.dataSourcesUsed.map(s => `- ${s}`).join('\n'));

  return lines.join('\n');
}

// ============================================================================
// 2. EVALUATION METRICS
// ============================================================================

/**
 * Daily evaluation metrics snapshot
 */
export interface EvaluationMetrics {
  date: string;
  clientId: string;

  // Decision metrics
  decisionsGenerated: number;
  decisionsPassed: number;
  decisionsFiltered: number;
  avgConfidence: number;
  contradictionsDetected: number;

  // Human review metrics
  humanReviewsCreated: number;
  humanReviewsResolved: number;
  humanReviewsPending: number;

  // Prediction metrics
  predictionsGenerated: number;
  predictionsVerified: number;
  predictionsCorrect: number;
  predictionAccuracyRate: number;

  // Quality metrics
  filterRate: number;         // % filtered by quality gate
  evidenceQualityAvg: number; // avg evidence quality score
  synthesisDepthAvg: number;  // avg signals combined

  // Performance metrics
  avgDecisionTime: number;    // ms
}

/**
 * Capture daily evaluation metrics for a client
 */
export async function captureEvaluationMetrics(clientId: string): Promise<EvaluationMetrics> {
  const db = getDbAdapter();
  const today = new Date().toISOString().split('T')[0];

  const metrics: EvaluationMetrics = {
    date: today,
    clientId,
    decisionsGenerated: 0,
    decisionsPassed: 0,
    decisionsFiltered: 0,
    avgConfidence: 0,
    contradictionsDetected: 0,
    humanReviewsCreated: 0,
    humanReviewsResolved: 0,
    humanReviewsPending: 0,
    predictionsGenerated: 0,
    predictionsVerified: 0,
    predictionsCorrect: 0,
    predictionAccuracyRate: 0,
    filterRate: 0,
    evidenceQualityAvg: 0,
    synthesisDepthAvg: 0,
    avgDecisionTime: 0,
  };

  try {
    // Decision metrics (from agent_decisions table)
    const decisionStats = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status != 'filtered' THEN 1 ELSE 0 END) as passed,
        AVG(CAST(json_extract(metadata, '$.confidence') as REAL)) as avg_conf
      FROM agent_decisions
      WHERE user_id = ? AND date(created_at) = ?
    `, [clientId, today]) as any;  // DB-2: typed when row becomes a Drizzle result

    if (decisionStats) {
      metrics.decisionsGenerated = decisionStats.total || 0;
      metrics.decisionsPassed = decisionStats.passed || 0;
      metrics.decisionsFiltered = metrics.decisionsGenerated - metrics.decisionsPassed;
      metrics.avgConfidence = decisionStats.avg_conf || 0;
      metrics.filterRate = metrics.decisionsGenerated > 0
        ? metrics.decisionsFiltered / metrics.decisionsGenerated
        : 0;
    }

    // Human review metrics
    const reviewStats = await db.get(`
      SELECT
        SUM(CASE WHEN date(created_at) = ? THEN 1 ELSE 0 END) as created,
        SUM(CASE WHEN date(reviewed_at) = ? THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM human_reviews
      WHERE client_id = ?
    `, [today, today, clientId]) as any;  // DB-2: typed when row becomes a Drizzle result

    if (reviewStats) {
      metrics.humanReviewsCreated = reviewStats.created || 0;
      metrics.humanReviewsResolved = reviewStats.resolved || 0;
      metrics.humanReviewsPending = reviewStats.pending || 0;
    }

    // Prediction metrics
    const predStats = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('verified_correct', 'verified_incorrect') THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN status = 'verified_correct' THEN 1 ELSE 0 END) as correct
      FROM predictions
      WHERE client_id = ?
    `, [clientId]) as any;  // DB-2: typed when row becomes a Drizzle result

    if (predStats) {
      metrics.predictionsGenerated = predStats.total || 0;
      metrics.predictionsVerified = predStats.verified || 0;
      metrics.predictionsCorrect = predStats.correct || 0;
      metrics.predictionAccuracyRate = predStats.verified > 0
        ? predStats.correct / predStats.verified
        : 0;
    }

    // Trace metrics (synthesis depth, decision time)
    const traceStats = await db.get(`
      SELECT
        AVG(synthesis_depth) as avg_depth,
        AVG(total_duration) as avg_time
      FROM decision_traces
      WHERE client_id = ? AND date(created_at) = ?
    `, [clientId, today]) as any;  // DB-2: typed when row becomes a Drizzle result

    if (traceStats) {
      metrics.synthesisDepthAvg = traceStats.avg_depth || 0;
      metrics.avgDecisionTime = traceStats.avg_time || 0;
    }

  } catch (err) {
    logger.debug({ err }, '[Infrastructure] Error capturing evaluation metrics');
  }

  // Store metrics
  try {
    await db.run(`
      INSERT INTO evaluation_metrics (
        date, client_id, decisions_generated, decisions_passed, decisions_filtered,
        avg_confidence, contradictions_detected, human_reviews_created, human_reviews_resolved,
        human_reviews_pending, predictions_generated, predictions_verified, predictions_correct,
        prediction_accuracy_rate, filter_rate, evidence_quality_avg, synthesis_depth_avg,
        avg_decision_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, client_id) DO UPDATE SET
        decisions_generated = excluded.decisions_generated,
        decisions_passed = excluded.decisions_passed,
        avg_confidence = excluded.avg_confidence
    `, [
      today, clientId, metrics.decisionsGenerated, metrics.decisionsPassed,
      metrics.decisionsFiltered, metrics.avgConfidence, metrics.contradictionsDetected,
      metrics.humanReviewsCreated, metrics.humanReviewsResolved, metrics.humanReviewsPending,
      metrics.predictionsGenerated, metrics.predictionsVerified, metrics.predictionsCorrect,
      metrics.predictionAccuracyRate, metrics.filterRate, metrics.evidenceQualityAvg,
      metrics.synthesisDepthAvg, metrics.avgDecisionTime
    ]);
  } catch {
    logger.debug('[Infrastructure] evaluation_metrics table not found');
  }

  return metrics;
}

/**
 * Get evaluation metrics trend over time
 */
export async function getMetricsTrend(
  clientId: string,
  days = 30
): Promise<EvaluationMetrics[]> {
  const db = getDbAdapter();

  try {
    return await db.all(`
      SELECT * FROM evaluation_metrics
      WHERE client_id = ? AND date >= date('now', '-' || ? || ' days')
      ORDER BY date ASC
    `, [clientId, days]) as EvaluationMetrics[];
  } catch {
    return [];
  }
}

/**
 * Get summary stats for dashboard
 */
export async function getDashboardSummary(clientId: string): Promise<{
  last7Days: { avgConfidence: number; filterRate: number; accuracyRate: number };
  last30Days: { avgConfidence: number; filterRate: number; accuracyRate: number };
  trend: 'improving' | 'stable' | 'declining';
}> {
  const last30 = await getMetricsTrend(clientId, 30);
  const last7 = last30.slice(-7);

  const avg = (arr: EvaluationMetrics[], field: keyof EvaluationMetrics) => {
    if (arr.length === 0) return 0;
    const values = arr.map(m => m[field] as number).filter(v => typeof v === 'number');
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  };

  const last7Stats = {
    avgConfidence: avg(last7, 'avgConfidence'),
    filterRate: avg(last7, 'filterRate'),
    accuracyRate: avg(last7, 'predictionAccuracyRate'),
  };

  const last30Stats = {
    avgConfidence: avg(last30, 'avgConfidence'),
    filterRate: avg(last30, 'filterRate'),
    accuracyRate: avg(last30, 'predictionAccuracyRate'),
  };

  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (last7Stats.avgConfidence > last30Stats.avgConfidence * 1.1) {
    trend = 'improving';
  } else if (last7Stats.avgConfidence < last30Stats.avgConfidence * 0.9) {
    trend = 'declining';
  }

  return { last7Days: last7Stats, last30Days: last30Stats, trend };
}

// ============================================================================
// 3. CROSS-BRAND ISOLATION
// ============================================================================

/**
 * Validate that a query is properly isolated to a client
 */
export function validateClientIsolation(
  clientId: string,
  data: Array<{ client_id?: string; clientId?: string; user_id?: string }>,
  operation: string
): { valid: boolean; leaked: number; error?: string } {
  let leaked = 0;

  for (const item of data) {
    const itemClientId = item.client_id || item.clientId || item.user_id;
    if (itemClientId && itemClientId !== clientId) {
      leaked++;
      logger.error({
        expectedClient: clientId,
        foundClient: itemClientId,
        operation,
      }, '[ISOLATION VIOLATION] Cross-client data leak detected');
    }
  }

  return {
    valid: leaked === 0,
    leaked,
    error: leaked > 0 ? `${leaked} records belong to different clients` : undefined,
  };
}

/**
 * Wrap a query function to enforce client isolation
 */
export function withClientIsolation<T extends Array<{ client_id?: string; clientId?: string; user_id?: string }>>(
  clientId: string,
  operation: string,
  queryFn: () => T
): T {
  const result = queryFn();
  const validation = validateClientIsolation(clientId, result, operation);

  if (!validation.valid) {
    // Filter out leaked data and log
    const filtered = result.filter(item => {
      const itemClientId = item.client_id || item.clientId || item.user_id;
      return !itemClientId || itemClientId === clientId;
    }) as T;

    logger.warn({
      operation,
      originalCount: result.length,
      filteredCount: filtered.length,
      leaked: validation.leaked,
    }, '[Isolation] Filtered leaked data');

    return filtered;
  }

  return result;
}

/**
 * Client isolation context for operations
 */
export class IsolatedClientContext {
  constructor(public readonly clientId: string) {}

  /**
   * Execute a query with isolation validation
   */
  query<T extends Array<{ client_id?: string; clientId?: string; user_id?: string }>>(
    operation: string,
    queryFn: () => T
  ): T {
    return withClientIsolation(this.clientId, operation, queryFn);
  }

  /**
   * Validate data belongs to this client
   */
  validate(data: Array<{ client_id?: string; clientId?: string; user_id?: string }>, operation: string): boolean {
    const result = validateClientIsolation(this.clientId, data, operation);
    return result.valid;
  }
}

// ============================================================================
// 4. VECTOR-READY PATTERN STORAGE
// ============================================================================

/**
 * Pattern that can be embedded for vector search
 */
export interface EmbeddablePattern {
  id: string;
  clientId: string;
  type: 'winning' | 'losing' | 'fatigue' | 'competitor';
  content: string;           // Text content to embed
  metadata: Record<string, unknown>;
  createdAt: string;
  embedding?: number[];      // Future: vector embedding
}

/**
 * Pattern storage interface (abstraction for future vector DB)
 */
export interface PatternStore {
  // CRUD operations
  store(pattern: EmbeddablePattern): Promise<void>;
  get(id: string): Promise<EmbeddablePattern | null>;
  delete(id: string): Promise<void>;

  // Query operations
  findByClient(clientId: string, type?: EmbeddablePattern['type']): Promise<EmbeddablePattern[]>;
  findSimilar(clientId: string, query: string, limit?: number): Promise<EmbeddablePattern[]>;
}

/**
 * SQLite-based pattern store (current implementation)
 * Future: Replace with SQLite-vec or Turso vector extension
 */
export class SQLitePatternStore implements PatternStore {
  async store(pattern: EmbeddablePattern): Promise<void> {
    const db = getDbAdapter();

    try {
      await db.run(`
        INSERT INTO pattern_store (id, client_id, type, content, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          content = excluded.content,
          metadata = excluded.metadata
      `, [
        pattern.id,
        pattern.clientId,
        pattern.type,
        pattern.content,
        JSON.stringify(pattern.metadata)
      ]);
    } catch {
      logger.debug('[Infrastructure] pattern_store table not found');
    }
  }

  async get(id: string): Promise<EmbeddablePattern | null> {
    const db = getDbAdapter();

    try {
      const row = await db.get(`SELECT * FROM pattern_store WHERE id = ?`, [id]) as any;  // DB-2: typed when row becomes a Drizzle result
      if (!row) return null;

      return {
        id: row.id,
        clientId: row.client_id,
        type: row.type,
        content: row.content,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
      };
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    const db = getDbAdapter();

    try {
      await db.run(`DELETE FROM pattern_store WHERE id = ?`, [id]);
    } catch {
      // Ignore
    }
  }

  async findByClient(clientId: string, type?: EmbeddablePattern['type']): Promise<EmbeddablePattern[]> {
    const db = getDbAdapter();

    try {
      let query = `SELECT * FROM pattern_store WHERE client_id = ?`;
      const params: unknown[] = [clientId];

      if (type) {
        query += ` AND type = ?`;
        params.push(type);
      }

      query += ` ORDER BY created_at DESC`;

      const rows = await db.all(query, params) as any[];  // DB-2: typed when row becomes a Drizzle result

      return rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        type: row.type,
        content: row.content,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  async findSimilar(clientId: string, query: string, limit = 10): Promise<EmbeddablePattern[]> {
    // Current implementation: simple text matching
    // Future: vector similarity search
    const db = getDbAdapter();

    try {
      const rows = await db.all(`
        SELECT * FROM pattern_store
        WHERE client_id = ? AND content LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `, [clientId, `%${query}%`, limit]) as any[];  // DB-2: typed when row becomes a Drizzle result

      return rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        type: row.type,
        content: row.content,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Get pattern store instance
 * Future: This will return vector-enabled store when available
 */
export function getPatternStore(): PatternStore {
  return new SQLitePatternStore();
}

/**
 * Convert playbook patterns to embeddable format
 */
export function playbookToEmbeddable(
  clientId: string,
  playbook: {
    winningPatterns?: Array<{ format: string; avgRoas?: number; avgLtv?: number; sampleSize: number }>;
    losingPatterns?: Array<{ format: string; returnRate?: number; reason: string }>;
    fatiguePatterns?: Array<{ format: string; avgDaysToFatigue: number }>;
  }
): EmbeddablePattern[] {
  const patterns: EmbeddablePattern[] = [];

  // Convert winning patterns
  for (const p of playbook.winningPatterns || []) {
    patterns.push({
      id: `win_${clientId}_${p.format.replace(/\s+/g, '_').toLowerCase()}`,
      clientId,
      type: 'winning',
      content: `Winning pattern: ${p.format}. LTV: ${p.avgLtv}, ROAS: ${p.avgRoas}, Sample: ${p.sampleSize}`,
      metadata: p,
      createdAt: new Date().toISOString(),
    });
  }

  // Convert losing patterns
  for (const p of playbook.losingPatterns || []) {
    patterns.push({
      id: `lose_${clientId}_${p.format.replace(/\s+/g, '_').toLowerCase()}`,
      clientId,
      type: 'losing',
      content: `Pattern to avoid: ${p.format}. Reason: ${p.reason}`,
      metadata: p,
      createdAt: new Date().toISOString(),
    });
  }

  // Convert fatigue patterns
  for (const p of playbook.fatiguePatterns || []) {
    patterns.push({
      id: `fatigue_${clientId}_${p.format.replace(/\s+/g, '_').toLowerCase()}`,
      clientId,
      type: 'fatigue',
      content: `Fatigue pattern: ${p.format} typically fatigues in ${p.avgDaysToFatigue} days`,
      metadata: p,
      createdAt: new Date().toISOString(),
    });
  }

  return patterns;
}

// ============================================================================
// Logging
// ============================================================================

logger.info('[Infrastructure] Tier 3 production infrastructure loaded — Traces, Metrics, Isolation, Patterns');
