/**
 * Memory API Routes
 *
 * Endpoints for:
 * - Viewing strategic memory status
 * - Manual prediction verification
 * - Recommendation outcome tracking
 * - Memory maintenance triggers
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';
import {
  getStrategicContextForAgent,
  getRecentReports,
  getPendingRecommendations,
  getRecommendationHistory,
  updateRecommendationStatus,
  getPendingPredictions,
  verifyPrediction,
  getPredictionAccuracy,
  getRunningContext,
} from '../services/strategic-memory.js';
import {
  runMaintenanceNow,
  getMaintenanceStatus,
} from '../services/memory-maintenance.js';
import { reinforceEpisode, penalizeEpisode } from '../services/agent-memory.js';

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /memory/status/:clientId
   * Get full strategic memory status for a client
   */
  app.get<{ Params: { clientId: string } }>('/memory/status/:clientId', async (request, reply) => {
    const { clientId } = request.params;

    try {
      const context = getStrategicContextForAgent(clientId);
      const recentReports = getRecentReports(clientId, 10);
      const pendingRecs = getPendingRecommendations(clientId);
      const runningContext = getRunningContext(clientId);
      const predictionAccuracy = getPredictionAccuracy(clientId);
      const pendingPredictions = getPendingPredictions(clientId);

      return reply.send({
        success: true,
        data: {
          clientId,
          contextLength: context?.length || 0,
          hasRunningContext: runningContext !== null,
          recentReports: recentReports.length,
          pendingRecommendations: pendingRecs.length,
          pendingPredictions: pendingPredictions.length,
          predictionAccuracy,
          runningContext: runningContext ? {
            currentFocus: runningContext.currentFocus,
            knownIssuesCount: runningContext.knownIssues.filter(i => i.status === 'open').length,
            openQuestionsCount: runningContext.openQuestions.filter(q => q.status === 'open').length,
            learnedPatternsCount: runningContext.learnedPatterns.length,
            failedApproachesCount: runningContext.failedApproaches.length,
          } : null,
        },
      });
    } catch (err) {
      logger.error({ err, clientId }, '[Memory API] Failed to get status');
      return reply.status(500).send({ success: false, error: 'Failed to get memory status' });
    }
  });

  /**
   * GET /memory/reports/:clientId
   * Get recent reports for a client
   */
  app.get<{ Params: { clientId: string }; Querystring: { limit?: string } }>('/memory/reports/:clientId', async (request, reply) => {
    const { clientId } = request.params;
    const limit = parseInt(request.query.limit || '10', 10);

    try {
      const reports = getRecentReports(clientId, limit);
      return reply.send({
        success: true,
        data: { clientId, reports },
      });
    } catch (err) {
      logger.error({ err, clientId }, '[Memory API] Failed to get reports');
      return reply.status(500).send({ success: false, error: 'Failed to get reports' });
    }
  });

  /**
   * GET /memory/recommendations/:clientId
   * Get recommendation history for a client
   */
  app.get<{ Params: { clientId: string }; Querystring: { pending?: string } }>('/memory/recommendations/:clientId', async (request, reply) => {
    const { clientId } = request.params;
    const pendingOnly = request.query.pending === 'true';

    try {
      const recommendations = pendingOnly
        ? getPendingRecommendations(clientId)
        : getRecommendationHistory(clientId);

      return reply.send({
        success: true,
        data: { clientId, recommendations },
      });
    } catch (err) {
      logger.error({ err, clientId }, '[Memory API] Failed to get recommendations');
      return reply.status(500).send({ success: false, error: 'Failed to get recommendations' });
    }
  });

  /**
   * POST /memory/recommendations/:recId/outcome
   * Record outcome for a recommendation
   */
  app.post<{
    Params: { recId: string };
    Body: { status: 'implemented' | 'rejected'; actualOutcome?: string; wasSuccessful?: boolean };
  }>('/memory/recommendations/:recId/outcome', async (request, reply) => {
    const { recId } = request.params;
    const { status, actualOutcome, wasSuccessful } = request.body;

    try {
      updateRecommendationStatus(
        recId,
        status,
        actualOutcome ? { actualOutcome, wasSuccessful: wasSuccessful ?? true } : undefined
      );

      // Reinforce or penalize related episodes based on outcome
      const db = getDb();
      const rec = db.prepare(`
        SELECT data_json FROM strategic_recommendations WHERE id = ?
      `).get(recId) as { data_json: string } | undefined;

      if (rec && actualOutcome) {
        // Find related episodes and adjust their relevance
        const recData = JSON.parse(rec.data_json);
        const episodes = db.prepare(`
          SELECT id FROM agent_episodes
          WHERE user_id = ? AND event LIKE ?
          ORDER BY created_at DESC LIMIT 5
        `).all(recData.clientId, `%${recData.recommendation?.slice(0, 50) || ''}%`) as { id: string }[];

        for (const ep of episodes) {
          if (wasSuccessful) {
            reinforceEpisode(ep.id, 0.5);
          } else {
            penalizeEpisode(ep.id, 0.3);
          }
        }

        logger.info({
          recId,
          episodesAdjusted: episodes.length,
          wasSuccessful,
        }, '[Memory API] Reinforced/penalized episodes based on outcome');
      }

      return reply.send({
        success: true,
        message: `Recommendation ${recId} marked as ${status}`,
      });
    } catch (err) {
      logger.error({ err, recId }, '[Memory API] Failed to update recommendation');
      return reply.status(500).send({ success: false, error: 'Failed to update recommendation' });
    }
  });

  /**
   * GET /memory/predictions/:clientId
   * Get pending predictions for a client
   */
  app.get<{ Params: { clientId: string } }>('/memory/predictions/:clientId', async (request, reply) => {
    const { clientId } = request.params;

    try {
      const pendingPredictions = getPendingPredictions(clientId);
      const accuracy = getPredictionAccuracy(clientId);

      return reply.send({
        success: true,
        data: {
          clientId,
          pendingPredictions,
          overallAccuracy: accuracy,
        },
      });
    } catch (err) {
      logger.error({ err, clientId }, '[Memory API] Failed to get predictions');
      return reply.status(500).send({ success: false, error: 'Failed to get predictions' });
    }
  });

  /**
   * POST /memory/predictions/:predId/verify
   * Verify a prediction with actual outcome
   */
  app.post<{
    Params: { predId: string };
    Body: { actualValue: number; lessonLearned?: string };
  }>('/memory/predictions/:predId/verify', async (request, reply) => {
    const { predId } = request.params;
    const { actualValue, lessonLearned } = request.body;

    try {
      const db = getDb();
      const pred = db.prepare(`
        SELECT data_json FROM strategic_predictions WHERE id = ?
      `).get(predId) as { data_json: string } | undefined;

      if (!pred) {
        return reply.status(404).send({ success: false, error: 'Prediction not found' });
      }

      const predData = JSON.parse(pred.data_json);
      const expectedValue = predData.expectedValue;
      const tolerance = 0.2; // 20% tolerance

      const wasCorrect = Math.abs(actualValue - expectedValue) / expectedValue <= tolerance;

      verifyPrediction(predId, actualValue, wasCorrect, lessonLearned);

      return reply.send({
        success: true,
        data: {
          predId,
          expectedValue,
          actualValue,
          wasCorrect,
          errorPercent: Math.abs((actualValue - expectedValue) / expectedValue * 100).toFixed(1),
          lessonLearned,
        },
      });
    } catch (err) {
      logger.error({ err, predId }, '[Memory API] Failed to verify prediction');
      return reply.status(500).send({ success: false, error: 'Failed to verify prediction' });
    }
  });

  /**
   * GET /memory/context/:clientId
   * Get full strategic context (what agents see)
   */
  app.get<{ Params: { clientId: string } }>('/memory/context/:clientId', async (request, reply) => {
    const { clientId } = request.params;

    try {
      const context = getStrategicContextForAgent(clientId);

      return reply.send({
        success: true,
        data: {
          clientId,
          context,
          contextLength: context?.length || 0,
        },
      });
    } catch (err) {
      logger.error({ err, clientId }, '[Memory API] Failed to get context');
      return reply.status(500).send({ success: false, error: 'Failed to get context' });
    }
  });

  /**
   * GET /memory/maintenance/status
   * Get memory maintenance scheduler status
   */
  app.get('/memory/maintenance/status', async (request, reply) => {
    try {
      const status = getMaintenanceStatus();
      return reply.send({ success: true, data: status });
    } catch (err) {
      logger.error({ err }, '[Memory API] Failed to get maintenance status');
      return reply.status(500).send({ success: false, error: 'Failed to get maintenance status' });
    }
  });

  /**
   * POST /memory/maintenance/run
   * Trigger all maintenance tasks immediately
   */
  app.post('/memory/maintenance/run', async (request, reply) => {
    try {
      const results = await runMaintenanceNow();
      return reply.send({
        success: true,
        data: results,
        message: 'Maintenance tasks completed',
      });
    } catch (err) {
      logger.error({ err }, '[Memory API] Failed to run maintenance');
      return reply.status(500).send({ success: false, error: 'Failed to run maintenance' });
    }
  });
}
