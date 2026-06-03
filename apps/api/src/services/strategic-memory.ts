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

import { getDbAdapter } from '../db/adapter.js';
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

let tablesInitialized = false;

async function ensureTables(): Promise<void> {
  if (tablesInitialized) return;
  const database = getDbAdapter();

  // Reports table
  await database.exec(`
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
  await database.exec(`
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
  await database.exec(`
    CREATE TABLE IF NOT EXISTS strategic_running_context (
      client_id TEXT PRIMARY KEY,
      context_json TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Predictions table
  await database.exec(`
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

  tablesInitialized = true;
  logger.info('[StrategicMemory] Tables initialized');
}

// ============================================================================
// REPORT MEMORY
// ============================================================================

export async function recordReport(report: ReportRecord): Promise<void> {
  await ensureTables();
  const database = getDbAdapter();

  await database.run(`
    INSERT INTO strategic_reports (id, client_id, report_type, generated_at, week_number, year, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    report.id,
    report.clientId,
    report.reportType,
    report.generatedAt,
    report.weekNumber,
    report.year,
    JSON.stringify(report)
  ]);

  logger.info(`[StrategicMemory] Recorded report ${report.id} for ${report.clientId}`);
}

export async function getRecentReports(clientId: string, limit: number = 4): Promise<ReportRecord[]> {
  await ensureTables();
  const database = getDbAdapter();

  const rows = await database.all<{ data_json: string }>(`
    SELECT data_json FROM strategic_reports
    WHERE client_id = ?
    ORDER BY generated_at DESC
    LIMIT ?
  `, [clientId, limit]);

  return rows.map(row => JSON.parse(row.data_json) as ReportRecord);
}

export async function getLastWeekReport(clientId: string): Promise<ReportRecord | null> {
  const reports = await getRecentReports(clientId, 1);
  return reports[0] || null;
}

export async function getReportsByWeek(clientId: string, year: number, weekNumber: number): Promise<ReportRecord[]> {
  await ensureTables();
  const database = getDbAdapter();

  const rows = await database.all<{ data_json: string }>(`
    SELECT data_json FROM strategic_reports
    WHERE client_id = ? AND year = ? AND week_number = ?
  `, [clientId, year, weekNumber]);

  return rows.map(row => JSON.parse(row.data_json) as ReportRecord);
}

// ============================================================================
// RECOMMENDATION TRACKING
// ============================================================================

export async function recordRecommendation(rec: RecommendationRecord): Promise<void> {
  await ensureTables();
  const database = getDbAdapter();

  await database.run(`
    INSERT INTO strategic_recommendations (id, client_id, report_id, recommendation, category, priority, status, data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    rec.id,
    rec.clientId,
    rec.reportId,
    rec.recommendation,
    rec.category,
    rec.priority,
    rec.status,
    JSON.stringify(rec)
  ]);

  logger.info(`[StrategicMemory] Recorded recommendation ${rec.id}`);
}

export async function updateRecommendationStatus(
  recId: string,
  status: RecommendationRecord['status'],
  outcome?: { actualOutcome: string; wasSuccessful: boolean }
): Promise<void> {
  await ensureTables();
  const database = getDbAdapter();

  const existing = await database.get<{ data_json: string }>(`
    SELECT data_json FROM strategic_recommendations WHERE id = ?
  `, [recId]);

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

  await database.run(`
    UPDATE strategic_recommendations
    SET status = ?, data_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, JSON.stringify(rec), recId]);

  logger.info(`[StrategicMemory] Updated recommendation ${recId} to ${status}`);
}

export async function getPendingRecommendations(clientId: string): Promise<RecommendationRecord[]> {
  await ensureTables();
  const database = getDbAdapter();

  const rows = await database.all<{ data_json: string }>(`
    SELECT data_json FROM strategic_recommendations
    WHERE client_id = ? AND status IN ('pending', 'in_progress')
    ORDER BY created_at DESC
  `, [clientId]);

  return rows.map(row => JSON.parse(row.data_json) as RecommendationRecord);
}

export async function getRecommendationHistory(clientId: string, limit: number = 20): Promise<RecommendationRecord[]> {
  await ensureTables();
  const database = getDbAdapter();

  const rows = await database.all<{ data_json: string }>(`
    SELECT data_json FROM strategic_recommendations
    WHERE client_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `, [clientId, limit]);

  return rows.map(row => JSON.parse(row.data_json) as RecommendationRecord);
}

// ============================================================================
// RUNNING CONTEXT
// ============================================================================

export async function getRunningContext(clientId: string): Promise<RunningContext | null> {
  await ensureTables();
  const database = getDbAdapter();

  const row = await database.get<{ context_json: string }>(`
    SELECT context_json FROM strategic_running_context WHERE client_id = ?
  `, [clientId]);

  if (!row) {
    return null;
  }

  return JSON.parse(row.context_json) as RunningContext;
}

export async function updateRunningContext(clientId: string, updates: Partial<RunningContext>): Promise<RunningContext> {
  await ensureTables();
  const database = getDbAdapter();

  let existing = await getRunningContext(clientId);

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

  await database.run(`
    INSERT INTO strategic_running_context (client_id, context_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET context_json = excluded.context_json, updated_at = excluded.updated_at
  `, [clientId, JSON.stringify(updated), updated.updatedAt]);

  logger.info(`[StrategicMemory] Updated running context for ${clientId}`);
  return updated;
}

export async function addKnownIssue(clientId: string, issue: string, severity: 'critical' | 'high' | 'medium' | 'low'): Promise<void> {
  const context = (await getRunningContext(clientId)) || {
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

  await updateRunningContext(clientId, context);
}

export async function resolveKnownIssue(clientId: string, issueText: string): Promise<void> {
  const context = await getRunningContext(clientId);
  if (!context) return;

  const issue = context.knownIssues.find(i => i.issue === issueText);
  if (issue) {
    issue.status = 'resolved';
    await updateRunningContext(clientId, context);
  }
}

export async function addOpenQuestion(clientId: string, question: string, hypothesis?: string): Promise<void> {
  const context = (await getRunningContext(clientId)) || {
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

  await updateRunningContext(clientId, context);
}

export async function answerOpenQuestion(clientId: string, questionText: string, answer: string): Promise<void> {
  const context = await getRunningContext(clientId);
  if (!context) return;

  const question = context.openQuestions.find(q => q.question === questionText);
  if (question) {
    question.status = 'answered';
    question.answer = answer;
    await updateRunningContext(clientId, context);
  }
}

export async function addLearnedPattern(clientId: string, pattern: string, confidence: number, evidence: string): Promise<void> {
  const context = (await getRunningContext(clientId)) || {
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

  await updateRunningContext(clientId, context);
}

// ============================================================================
// PREDICTION TRACKING
// ============================================================================

export async function recordPrediction(pred: PredictionRecord): Promise<void> {
  await ensureTables();
  const database = getDbAdapter();

  await database.run(`
    INSERT INTO strategic_predictions (id, client_id, report_id, prediction, status, data_json, verify_after)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    pred.id,
    pred.clientId,
    pred.reportId,
    pred.prediction,
    pred.status,
    JSON.stringify(pred),
    pred.verifyAfter
  ]);

  logger.info(`[StrategicMemory] Recorded prediction ${pred.id}`);
}

export async function verifyPrediction(
  predId: string,
  actualValue: number,
  wasCorrect: boolean,
  lessonLearned?: string
): Promise<void> {
  await ensureTables();
  const database = getDbAdapter();

  const existing = await database.get<{ data_json: string }>(`
    SELECT data_json FROM strategic_predictions WHERE id = ?
  `, [predId]);

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

  await database.run(`
    UPDATE strategic_predictions
    SET status = 'verified', data_json = ?
    WHERE id = ?
  `, [JSON.stringify(pred), predId]);

  logger.info(`[StrategicMemory] Verified prediction ${predId}: ${wasCorrect ? 'CORRECT' : 'INCORRECT'}`);
}

export async function getPendingPredictions(clientId: string): Promise<PredictionRecord[]> {
  await ensureTables();
  const database = getDbAdapter();
  const now = new Date().toISOString();

  const rows = await database.all<{ data_json: string }>(`
    SELECT data_json FROM strategic_predictions
    WHERE client_id = ? AND status = 'pending' AND verify_after <= ?
  `, [clientId, now]);

  return rows.map(row => JSON.parse(row.data_json) as PredictionRecord);
}

export async function getPredictionAccuracy(clientId: string): Promise<{ total: number; correct: number; accuracy: number }> {
  await ensureTables();
  const database = getDbAdapter();

  const total = (await database.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM strategic_predictions
    WHERE client_id = ? AND status = 'verified'
  `, [clientId]))!;

  const correct = (await database.get<{ count: number }>(`
    SELECT COUNT(*) as count FROM strategic_predictions
    WHERE client_id = ? AND status = 'verified' AND data_json LIKE '%"wasCorrect":true%'
  `, [clientId]))!;

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
export async function getStrategicContextForAgent(clientId: string): Promise<string> {
  const recentReports = await getRecentReports(clientId, 4);
  const pendingRecs = await getPendingRecommendations(clientId);
  const runningContext = await getRunningContext(clientId);
  const predictionAccuracy = await getPredictionAccuracy(clientId);

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
export async function shouldShipReport(clientId: string, headline: string, insights: string[]): Promise<{
  shouldShip: boolean;
  reason: string;
}> {
  const lastReport = await getLastWeekReport(clientId);

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
