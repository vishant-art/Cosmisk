/**
 * STRATEGIC MEMORY
 *
 * Week-to-week continuity system that solves the "agent forgets everything" problem.
 *
 * This maintains:
 * - Previous reports and what was shared
 * - Recommendations and whether they were acted on
 * - Running context and open questions
 * - Predictions and their outcomes (for learning)
 * - Client interactions and feedback
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ReportRecord {
  id: string;
  clientId: string;
  reportType: string;           // 'elite-intelligence' | 'weekly-brief' | 'creative-intel'
  generatedAt: string;
  weekNumber: number;           // ISO week number
  year: number;

  // What was in the report
  headline: string;
  keyInsights: string[];
  recommendations: string[];
  metricsSnapshot: Record<string, number>;

  // Quality info
  qualityScore: number;
  wasShipped: boolean;
  shipDecision: 'SHIP' | 'HOLD' | 'REJECT';

  // Delivery
  deliveredVia: string[];       // ['whatsapp', 'email']
  deliveredAt?: string;
}

export interface RecommendationRecord {
  id: string;
  clientId: string;
  reportId: string;
  createdAt: string;

  // The recommendation
  recommendation: string;
  category: 'budget' | 'creative' | 'audience' | 'product' | 'strategy';
  priority: 'critical' | 'high' | 'medium' | 'low';
  expectedImpact: string;       // "₹0.7L/month savings"

  // Tracking
  status: 'pending' | 'in_progress' | 'implemented' | 'rejected' | 'expired';
  statusUpdatedAt?: string;
  implementedAt?: string;

  // Outcome (if implemented)
  actualOutcome?: string;       // "ROAS improved 12%"
  outcomeVerifiedAt?: string;
  wasSuccessful?: boolean;

  // Notes
  clientFeedback?: string;
  internalNotes?: string;
}

export interface RunningContext {
  clientId: string;
  updatedAt: string;

  // Current focus areas
  currentFocus: string[];       // ["Budget efficiency", "USA scaling"]
  activeInitiatives: string[];  // ["Tier-2 expansion test", "New creative batch"]

  // Known issues (persistent until resolved)
  knownIssues: Array<{
    issue: string;
    identifiedAt: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    status: 'open' | 'investigating' | 'resolved';
  }>;

  // Open questions (things we're trying to answer)
  openQuestions: Array<{
    question: string;
    askedAt: string;
    hypothesis?: string;
    status: 'open' | 'answered' | 'abandoned';
    answer?: string;
  }>;

  // Patterns we've learned about this client
  learnedPatterns: Array<{
    pattern: string;
    confidence: number;
    learnedAt: string;
    evidence: string;
  }>;

  // Things that didn't work (avoid repeating)
  failedApproaches: Array<{
    approach: string;
    triedAt: string;
    whyFailed: string;
  }>;
}

export interface PredictionRecord {
  id: string;
  clientId: string;
  reportId: string;
  madeAt: string;

  // The prediction
  prediction: string;
  metric: string;               // "ROAS" | "CPA" | "CTR"
  expectedValue: number;
  expectedDirection: 'increase' | 'decrease' | 'stable';
  timeframe: string;            // "7 days" | "14 days" | "30 days"
  confidence: number;           // 0-100

  // Verification
  verifyAfter: string;          // Date when we should check
  status: 'pending' | 'verified' | 'expired';
  verifiedAt?: string;
  actualValue?: number;
  wasCorrect?: boolean;
  errorPercent?: number;

  // Learning
  lessonLearned?: string;
}

// ============================================================================
// DATABASE SETUP
// ============================================================================

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database('./data/cosmisk.db');
    initStrategicMemoryTables();
  }
  return db;
}

function initStrategicMemoryTables(): void {
  const database = db;

  // Reports table
  database.exec(`
    CREATE TABLE IF NOT EXISTS strategic_reports (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      report_type TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      week_number INTEGER,
      year INTEGER,
      data_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Recommendations table
  database.exec(`
    CREATE TABLE IF NOT EXISTS strategic_recommendations (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      report_id TEXT,
      recommendation TEXT NOT NULL,
      category TEXT,
      priority TEXT,
      status TEXT DEFAULT 'pending',
      data_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Running context table
  database.exec(`
    CREATE TABLE IF NOT EXISTS strategic_running_context (
      client_id TEXT PRIMARY KEY,
      context_json TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Predictions table
  database.exec(`
    CREATE TABLE IF NOT EXISTS strategic_predictions (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      report_id TEXT,
      prediction TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      data_json TEXT NOT NULL,
      verify_after TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  logger.info('[StrategicMemory] Tables initialized');
}

// ============================================================================
// REPORT MEMORY
// ============================================================================

export function recordReport(report: ReportRecord): void {
  const database = getDb();

  database.prepare(`
    INSERT INTO strategic_reports (id, client_id, report_type, generated_at, week_number, year, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    report.id,
    report.clientId,
    report.reportType,
    report.generatedAt,
    report.weekNumber,
    report.year,
    JSON.stringify(report)
  );

  logger.info(`[StrategicMemory] Recorded report ${report.id} for ${report.clientId}`);
}

export function getRecentReports(clientId: string, limit: number = 4): ReportRecord[] {
  const database = getDb();

  const rows = database.prepare(`
    SELECT data_json FROM strategic_reports
    WHERE client_id = ?
    ORDER BY generated_at DESC
    LIMIT ?
  `).all(clientId, limit) as { data_json: string }[];

  return rows.map(row => JSON.parse(row.data_json) as ReportRecord);
}

export function getLastWeekReport(clientId: string): ReportRecord | null {
  const reports = getRecentReports(clientId, 1);
  return reports[0] || null;
}

export function getReportsByWeek(clientId: string, year: number, weekNumber: number): ReportRecord[] {
  const database = getDb();

  const rows = database.prepare(`
    SELECT data_json FROM strategic_reports
    WHERE client_id = ? AND year = ? AND week_number = ?
  `).all(clientId, year, weekNumber) as { data_json: string }[];

  return rows.map(row => JSON.parse(row.data_json) as ReportRecord);
}

// ============================================================================
// RECOMMENDATION TRACKING
// ============================================================================

export function recordRecommendation(rec: RecommendationRecord): void {
  const database = getDb();

  database.prepare(`
    INSERT INTO strategic_recommendations (id, client_id, report_id, recommendation, category, priority, status, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    rec.id,
    rec.clientId,
    rec.reportId,
    rec.recommendation,
    rec.category,
    rec.priority,
    rec.status,
    JSON.stringify(rec)
  );

  logger.info(`[StrategicMemory] Recorded recommendation ${rec.id}`);
}

export function updateRecommendationStatus(
  recId: string,
  status: RecommendationRecord['status'],
  outcome?: { actualOutcome: string; wasSuccessful: boolean }
): void {
  const database = getDb();

  const existing = database.prepare(`
    SELECT data_json FROM strategic_recommendations WHERE id = ?
  `).get(recId) as { data_json: string } | undefined;

  if (!existing) {
    logger.warn(`[StrategicMemory] Recommendation ${recId} not found`);
    return;
  }

  const rec = JSON.parse(existing.data_json) as RecommendationRecord;
  rec.status = status;
  rec.statusUpdatedAt = new Date().toISOString();

  if (status === 'implemented') {
    rec.implementedAt = new Date().toISOString();
  }

  if (outcome) {
    rec.actualOutcome = outcome.actualOutcome;
    rec.wasSuccessful = outcome.wasSuccessful;
    rec.outcomeVerifiedAt = new Date().toISOString();
  }

  database.prepare(`
    UPDATE strategic_recommendations
    SET status = ?, data_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, JSON.stringify(rec), recId);

  logger.info(`[StrategicMemory] Updated recommendation ${recId} to ${status}`);
}

export function getPendingRecommendations(clientId: string): RecommendationRecord[] {
  const database = getDb();

  const rows = database.prepare(`
    SELECT data_json FROM strategic_recommendations
    WHERE client_id = ? AND status IN ('pending', 'in_progress')
    ORDER BY created_at DESC
  `).all(clientId) as { data_json: string }[];

  return rows.map(row => JSON.parse(row.data_json) as RecommendationRecord);
}

export function getRecommendationHistory(clientId: string, limit: number = 20): RecommendationRecord[] {
  const database = getDb();

  const rows = database.prepare(`
    SELECT data_json FROM strategic_recommendations
    WHERE client_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(clientId, limit) as { data_json: string }[];

  return rows.map(row => JSON.parse(row.data_json) as RecommendationRecord);
}

// ============================================================================
// RUNNING CONTEXT
// ============================================================================

export function getRunningContext(clientId: string): RunningContext | null {
  const database = getDb();

  const row = database.prepare(`
    SELECT context_json FROM strategic_running_context WHERE client_id = ?
  `).get(clientId) as { context_json: string } | undefined;

  if (!row) {
    return null;
  }

  return JSON.parse(row.context_json) as RunningContext;
}

export function updateRunningContext(clientId: string, updates: Partial<RunningContext>): RunningContext {
  const database = getDb();

  let existing = getRunningContext(clientId);

  if (!existing) {
    existing = {
      clientId,
      updatedAt: new Date().toISOString(),
      currentFocus: [],
      activeInitiatives: [],
      knownIssues: [],
      openQuestions: [],
      learnedPatterns: [],
      failedApproaches: []
    };
  }

  const updated: RunningContext = {
    ...existing,
    ...updates,
    clientId, // Prevent ID change
    updatedAt: new Date().toISOString()
  };

  database.prepare(`
    INSERT OR REPLACE INTO strategic_running_context (client_id, context_json, updated_at)
    VALUES (?, ?, ?)
  `).run(clientId, JSON.stringify(updated), updated.updatedAt);

  logger.info(`[StrategicMemory] Updated running context for ${clientId}`);
  return updated;
}

export function addKnownIssue(clientId: string, issue: string, severity: 'critical' | 'high' | 'medium' | 'low'): void {
  const context = getRunningContext(clientId) || {
    clientId,
    updatedAt: '',
    currentFocus: [],
    activeInitiatives: [],
    knownIssues: [],
    openQuestions: [],
    learnedPatterns: [],
    failedApproaches: []
  };

  context.knownIssues.push({
    issue,
    identifiedAt: new Date().toISOString(),
    severity,
    status: 'open'
  });

  updateRunningContext(clientId, context);
}

export function resolveKnownIssue(clientId: string, issueText: string): void {
  const context = getRunningContext(clientId);
  if (!context) return;

  const issue = context.knownIssues.find(i => i.issue === issueText);
  if (issue) {
    issue.status = 'resolved';
    updateRunningContext(clientId, context);
  }
}

export function addOpenQuestion(clientId: string, question: string, hypothesis?: string): void {
  const context = getRunningContext(clientId) || {
    clientId,
    updatedAt: '',
    currentFocus: [],
    activeInitiatives: [],
    knownIssues: [],
    openQuestions: [],
    learnedPatterns: [],
    failedApproaches: []
  };

  context.openQuestions.push({
    question,
    askedAt: new Date().toISOString(),
    hypothesis,
    status: 'open'
  });

  updateRunningContext(clientId, context);
}

export function answerOpenQuestion(clientId: string, questionText: string, answer: string): void {
  const context = getRunningContext(clientId);
  if (!context) return;

  const question = context.openQuestions.find(q => q.question === questionText);
  if (question) {
    question.status = 'answered';
    question.answer = answer;
    updateRunningContext(clientId, context);
  }
}

export function addLearnedPattern(clientId: string, pattern: string, confidence: number, evidence: string): void {
  const context = getRunningContext(clientId) || {
    clientId,
    updatedAt: '',
    currentFocus: [],
    activeInitiatives: [],
    knownIssues: [],
    openQuestions: [],
    learnedPatterns: [],
    failedApproaches: []
  };

  context.learnedPatterns.push({
    pattern,
    confidence,
    learnedAt: new Date().toISOString(),
    evidence
  });

  updateRunningContext(clientId, context);
}

// ============================================================================
// PREDICTION TRACKING
// ============================================================================

export function recordPrediction(pred: PredictionRecord): void {
  const database = getDb();

  database.prepare(`
    INSERT INTO strategic_predictions (id, client_id, report_id, prediction, status, data_json, verify_after)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    pred.id,
    pred.clientId,
    pred.reportId,
    pred.prediction,
    pred.status,
    JSON.stringify(pred),
    pred.verifyAfter
  );

  logger.info(`[StrategicMemory] Recorded prediction ${pred.id}`);
}

export function verifyPrediction(
  predId: string,
  actualValue: number,
  wasCorrect: boolean,
  lessonLearned?: string
): void {
  const database = getDb();

  const existing = database.prepare(`
    SELECT data_json FROM strategic_predictions WHERE id = ?
  `).get(predId) as { data_json: string } | undefined;

  if (!existing) {
    logger.warn(`[StrategicMemory] Prediction ${predId} not found`);
    return;
  }

  const pred = JSON.parse(existing.data_json) as PredictionRecord;
  pred.status = 'verified';
  pred.verifiedAt = new Date().toISOString();
  pred.actualValue = actualValue;
  pred.wasCorrect = wasCorrect;
  pred.errorPercent = Math.abs((actualValue - pred.expectedValue) / pred.expectedValue * 100);
  if (lessonLearned) {
    pred.lessonLearned = lessonLearned;
  }

  database.prepare(`
    UPDATE strategic_predictions
    SET status = 'verified', data_json = ?
    WHERE id = ?
  `).run(JSON.stringify(pred), predId);

  logger.info(`[StrategicMemory] Verified prediction ${predId}: ${wasCorrect ? 'CORRECT' : 'INCORRECT'}`);
}

export function getPendingPredictions(clientId: string): PredictionRecord[] {
  const database = getDb();
  const now = new Date().toISOString();

  const rows = database.prepare(`
    SELECT data_json FROM strategic_predictions
    WHERE client_id = ? AND status = 'pending' AND verify_after <= ?
  `).all(clientId, now) as { data_json: string }[];

  return rows.map(row => JSON.parse(row.data_json) as PredictionRecord);
}

export function getPredictionAccuracy(clientId: string): { total: number; correct: number; accuracy: number } {
  const database = getDb();

  const total = database.prepare(`
    SELECT COUNT(*) as count FROM strategic_predictions
    WHERE client_id = ? AND status = 'verified'
  `).get(clientId) as { count: number };

  const correct = database.prepare(`
    SELECT COUNT(*) as count FROM strategic_predictions
    WHERE client_id = ? AND status = 'verified' AND data_json LIKE '%"wasCorrect":true%'
  `).get(clientId) as { count: number };

  return {
    total: total.count,
    correct: correct.count,
    accuracy: total.count > 0 ? (correct.count / total.count) * 100 : 0
  };
}

// ============================================================================
// CONTEXT FOR AGENTS
// ============================================================================

/**
 * Get full strategic context for agent injection
 * This is what agents read to understand history and continuity
 */
export function getStrategicContextForAgent(clientId: string): string {
  const recentReports = getRecentReports(clientId, 4);
  const pendingRecs = getPendingRecommendations(clientId);
  const runningContext = getRunningContext(clientId);
  const predictionAccuracy = getPredictionAccuracy(clientId);

  let context = `
═══════════════════════════════════════════════════════════════════════
STRATEGIC MEMORY - ${clientId.toUpperCase()}
Last updated: ${runningContext?.updatedAt || 'Never'}
═══════════════════════════════════════════════════════════════════════

`;

  // Recent reports
  if (recentReports.length > 0) {
    context += `RECENT REPORTS:\n`;
    for (const report of recentReports) {
      context += `  Week ${report.weekNumber} (${report.reportType}): "${report.headline}"\n`;
      context += `    Quality: ${report.qualityScore}/100, Shipped: ${report.wasShipped ? 'YES' : 'NO'}\n`;
    }
    context += '\n';
  } else {
    context += `RECENT REPORTS: None yet (first run)\n\n`;
  }

  // Pending recommendations
  if (pendingRecs.length > 0) {
    context += `PENDING RECOMMENDATIONS (${pendingRecs.length}):\n`;
    for (const rec of pendingRecs) {
      context += `  [${rec.priority.toUpperCase()}] ${rec.recommendation}\n`;
      context += `    Status: ${rec.status}, Expected: ${rec.expectedImpact}\n`;
    }
    context += '\n';
  }

  // Running context
  if (runningContext) {
    if (runningContext.currentFocus.length > 0) {
      context += `CURRENT FOCUS: ${runningContext.currentFocus.join(', ')}\n\n`;
    }

    if (runningContext.knownIssues.filter(i => i.status === 'open').length > 0) {
      context += `KNOWN ISSUES (Open):\n`;
      for (const issue of runningContext.knownIssues.filter(i => i.status === 'open')) {
        context += `  [${issue.severity.toUpperCase()}] ${issue.issue}\n`;
      }
      context += '\n';
    }

    if (runningContext.openQuestions.filter(q => q.status === 'open').length > 0) {
      context += `OPEN QUESTIONS:\n`;
      for (const q of runningContext.openQuestions.filter(q => q.status === 'open')) {
        context += `  • ${q.question}\n`;
        if (q.hypothesis) context += `    Hypothesis: ${q.hypothesis}\n`;
      }
      context += '\n';
    }

    if (runningContext.learnedPatterns.length > 0) {
      context += `LEARNED PATTERNS:\n`;
      for (const p of runningContext.learnedPatterns.slice(-5)) {
        context += `  • ${p.pattern} (${p.confidence}% confidence)\n`;
      }
      context += '\n';
    }

    if (runningContext.failedApproaches.length > 0) {
      context += `FAILED APPROACHES (Don't repeat):\n`;
      for (const f of runningContext.failedApproaches.slice(-3)) {
        context += `  ✗ ${f.approach}: ${f.whyFailed}\n`;
      }
      context += '\n';
    }
  }

  // Prediction accuracy
  if (predictionAccuracy.total > 0) {
    context += `PREDICTION TRACK RECORD: ${predictionAccuracy.accuracy.toFixed(0)}% accuracy (${predictionAccuracy.correct}/${predictionAccuracy.total})\n`;
  }

  return context;
}

/**
 * Check if we should ship a report based on previous context
 * This helps avoid shipping duplicate/redundant reports
 */
export function shouldShipReport(clientId: string, headline: string, insights: string[]): {
  shouldShip: boolean;
  reason: string;
} {
  const lastReport = getLastWeekReport(clientId);

  if (!lastReport) {
    return { shouldShip: true, reason: 'First report for this client' };
  }

  // Check if headline is same as last week
  if (lastReport.headline === headline) {
    return {
      shouldShip: false,
      reason: `Same headline as last week: "${headline}". Need new insight or acknowledge no change.`
    };
  }

  // Check if insights are all duplicates
  const duplicateInsights = insights.filter(i => lastReport.keyInsights.includes(i));
  if (duplicateInsights.length === insights.length && insights.length > 0) {
    return {
      shouldShip: false,
      reason: 'All insights are same as last week. No new information to share.'
    };
  }

  return { shouldShip: true, reason: 'New insights detected' };
}
