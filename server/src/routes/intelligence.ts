/**
 * Intelligence API Routes — Cosmisk
 *
 * Exposes intelligence packages, reality testing, and operator briefings via REST.
 */

import { FastifyInstance } from 'fastify';
import { generateOperatorPackage, generateTier2Package, generateTier3Package, generateCompleteExperience } from '../services/operator-experience.js';
import { generateRealityTestingPackage, trackRecommendation, recordView, recordAction, recordOutcome, submitFeedback, trackBehavior } from '../services/reality-testing.js';
import type { OperatorFeedback, BehaviorEventType } from '../services/reality-testing.js';
import { buildCreativeContext, validateCreativeQuality, getCategoryKnowledge } from '../services/creative-intelligence.js';
import * as persistence from '../services/intelligence-persistence.js';
import { logger } from '../utils/logger.js';

export default async function intelligenceRoutes(fastify: FastifyInstance): Promise<void> {
  // =========================================================================
  // OPERATOR EXPERIENCE
  // =========================================================================

  /**
   * Get complete operator experience package
   */
  fastify.get<{
    Params: { clientId: string };
    Querystring: { persona?: string };
  }>('/intelligence/:clientId', async (request, reply) => {
    const { clientId } = request.params;
    const { persona } = request.query;

    try {
      // Get stored predictions for scorecard
      const predictions = persistence.getPredictionsByClient(clientId);
      const recommendations = persistence.getRecommendationsByClient(clientId);

      // Generate insights from recent recommendations
      const insights = recommendations.slice(0, 10).map(rec => ({
        type: rec.type,
        evidence: [],
        context: { suggestedAction: rec.recommendation },
      }));

      // Generate complete experience
      const experience = generateCompleteExperience(clientId, insights);

      return { success: true, data: experience };
    } catch (err) {
      logger.error({ err, clientId }, '[Intelligence] Failed to generate experience');
      return reply.status(500).send({ success: false, error: 'Failed to generate intelligence' });
    }
  });

  /**
   * Get role-specific briefing
   */
  fastify.get<{
    Params: { clientId: string; persona: string };
  }>('/intelligence/:clientId/briefing/:persona', async (request, reply) => {
    const { clientId, persona } = request.params;

    try {
      const recommendations = persistence.getRecommendationsByClient(clientId);
      const insights = recommendations.slice(0, 10).map(rec => ({
        type: rec.type,
        evidence: [],
        context: { suggestedAction: rec.recommendation },
      }));

      const tier1 = generateOperatorPackage(clientId, insights);
      const tier2 = generateTier2Package(
        clientId,
        tier1.narrativeInsights,
        tier1.hiddenOpportunities,
        tier1.timedItems
      );

      const validPersonas = ['founder', 'media_buyer', 'creative_strategist', 'growth_lead'];
      const selectedPersona = validPersonas.includes(persona) ? persona : 'founder';

      return {
        success: true,
        data: tier2.briefings[selectedPersona as keyof typeof tier2.briefings],
      };
    } catch (err) {
      logger.error({ err, clientId, persona }, '[Intelligence] Failed to generate briefing');
      return reply.status(500).send({ success: false, error: 'Failed to generate briefing' });
    }
  });

  // =========================================================================
  // REALITY TESTING
  // =========================================================================

  /**
   * Get reality testing package
   */
  fastify.get<{
    Params: { clientId: string };
    Querystring: { operatorId?: string };
  }>('/reality-testing/:clientId', async (request, reply) => {
    const { clientId } = request.params;
    const { operatorId } = request.query;

    try {
      const pkg = generateRealityTestingPackage(clientId, operatorId);
      return { success: true, data: pkg };
    } catch (err) {
      logger.error({ err, clientId }, '[Intelligence] Failed to generate reality testing package');
      return reply.status(500).send({ success: false, error: 'Failed to generate reality testing' });
    }
  });

  /**
   * Track a recommendation
   */
  fastify.post<{
    Body: {
      clientId: string;
      type: string;
      headline: string;
      recommendation: string;
      confidence: number;
      urgency: string;
    };
  }>('/reality-testing/track-recommendation', async (request, reply) => {
    const { clientId, type, headline, recommendation, confidence, urgency } = request.body;

    try {
      const tracked = trackRecommendation(clientId, type, headline, recommendation, confidence, urgency);

      // Also persist to DB
      persistence.saveRecommendation(tracked);

      return { success: true, data: { id: tracked.id } };
    } catch (err) {
      logger.error({ err }, '[Intelligence] Failed to track recommendation');
      return reply.status(500).send({ success: false, error: 'Failed to track recommendation' });
    }
  });

  /**
   * Record recommendation view
   */
  fastify.post<{
    Params: { recommendationId: string };
  }>('/reality-testing/recommendations/:recommendationId/view', async (request, reply) => {
    const { recommendationId } = request.params;

    try {
      recordView(recommendationId);
      persistence.updateRecommendationView(recommendationId);
      return { success: true };
    } catch (err) {
      logger.error({ err, recommendationId }, '[Intelligence] Failed to record view');
      return reply.status(500).send({ success: false, error: 'Failed to record view' });
    }
  });

  /**
   * Record recommendation action
   */
  fastify.post<{
    Params: { recommendationId: string };
    Body: { action: string };
  }>('/reality-testing/recommendations/:recommendationId/action', async (request, reply) => {
    const { recommendationId } = request.params;
    const { action } = request.body;

    try {
      recordAction(recommendationId, action);
      persistence.updateRecommendationAction(recommendationId, action);
      return { success: true };
    } catch (err) {
      logger.error({ err, recommendationId }, '[Intelligence] Failed to record action');
      return reply.status(500).send({ success: false, error: 'Failed to record action' });
    }
  });

  /**
   * Record recommendation outcome
   */
  fastify.post<{
    Params: { recommendationId: string };
    Body: { positive: boolean; notes?: string };
  }>('/reality-testing/recommendations/:recommendationId/outcome', async (request, reply) => {
    const { recommendationId } = request.params;
    const { positive, notes } = request.body;

    try {
      recordOutcome(recommendationId, positive, notes);
      persistence.updateRecommendationOutcome(recommendationId, positive, notes);
      return { success: true };
    } catch (err) {
      logger.error({ err, recommendationId }, '[Intelligence] Failed to record outcome');
      return reply.status(500).send({ success: false, error: 'Failed to record outcome' });
    }
  });

  /**
   * Submit operator feedback
   */
  fastify.post<{
    Body: {
      recommendationId: string;
      clientId: string;
      operatorId: string;
      rating: 1 | 2 | 3 | 4 | 5;
      feedbackType: string;
      freeformFeedback?: string;
    };
  }>('/reality-testing/feedback', async (request, reply) => {
    const { recommendationId, clientId, operatorId, rating, feedbackType, freeformFeedback } = request.body;

    try {
      const feedback = submitFeedback(
        recommendationId,
        clientId,
        operatorId,
        rating,
        feedbackType as OperatorFeedback['feedbackType'],
        { freeformFeedback }
      );

      persistence.saveFeedback(feedback);
      persistence.updateRecommendationRating(recommendationId, rating, freeformFeedback);

      return { success: true, data: { id: feedback.id } };
    } catch (err) {
      logger.error({ err }, '[Intelligence] Failed to submit feedback');
      return reply.status(500).send({ success: false, error: 'Failed to submit feedback' });
    }
  });

  /**
   * Track operator behavior
   */
  fastify.post<{
    Body: {
      clientId: string;
      operatorId: string;
      eventType: string;
      context: string;
      itemId?: string;
      itemType?: string;
    };
  }>('/reality-testing/behavior', async (request, reply) => {
    const { clientId, operatorId, eventType, context, itemId, itemType } = request.body;

    try {
      const event = trackBehavior(clientId, operatorId, eventType as BehaviorEventType, context, { itemId, itemType });
      persistence.saveBehaviorEvent(event);
      return { success: true, data: { id: event.id } };
    } catch (err) {
      logger.error({ err }, '[Intelligence] Failed to track behavior');
      return reply.status(500).send({ success: false, error: 'Failed to track behavior' });
    }
  });

  // =========================================================================
  // CREATIVE INTELLIGENCE
  // =========================================================================

  /**
   * Get creative intelligence context
   */
  fastify.get<{
    Params: { clientId: string };
  }>('/creative-intelligence/:clientId', async (request, reply) => {
    const { clientId } = request.params;

    try {
      // Build context with whatever data is available
      const context = await buildCreativeContext(clientId, {});
      return { success: true, data: context };
    } catch (err) {
      logger.error({ err, clientId }, '[Intelligence] Failed to get creative context');
      return reply.status(500).send({ success: false, error: 'Failed to get creative context' });
    }
  });

  /**
   * Validate creative quality
   */
  fastify.post<{
    Body: {
      creativeId: string;
      analysis: any;
      brand: {
        brandName: string;
        category: string;
        pricePoint: 'budget' | 'mid' | 'premium' | 'luxury';
      };
    };
  }>('/creative-intelligence/validate', async (request, reply) => {
    const { creativeId, analysis, brand } = request.body;

    try {
      const validation = await validateCreativeQuality(creativeId, analysis, brand);
      return { success: true, data: validation };
    } catch (err) {
      logger.error({ err, creativeId }, '[Intelligence] Failed to validate creative');
      return reply.status(500).send({ success: false, error: 'Failed to validate creative' });
    }
  });

  /**
   * Get category knowledge
   */
  fastify.get<{
    Params: { category: string };
  }>('/creative-intelligence/category/:category', async (request, reply) => {
    const { category } = request.params;

    try {
      const knowledge = await getCategoryKnowledge(category);
      return { success: true, data: knowledge };
    } catch (err) {
      logger.error({ err, category }, '[Intelligence] Failed to get category knowledge');
      return reply.status(500).send({ success: false, error: 'Failed to get category knowledge' });
    }
  });

  // =========================================================================
  // PREDICTIONS
  // =========================================================================

  /**
   * Get predictions for a client
   */
  fastify.get<{
    Params: { clientId: string };
    Querystring: { unverified?: string };
  }>('/predictions/:clientId', async (request, reply) => {
    const { clientId } = request.params;
    const { unverified } = request.query;

    try {
      const predictions = unverified === 'true'
        ? persistence.getUnverifiedPredictions(clientId)
        : persistence.getPredictionsByClient(clientId);

      return { success: true, data: predictions };
    } catch (err) {
      logger.error({ err, clientId }, '[Intelligence] Failed to get predictions');
      return reply.status(500).send({ success: false, error: 'Failed to get predictions' });
    }
  });

  /**
   * Get operator profile
   */
  fastify.get<{
    Params: { clientId: string; operatorId: string };
  }>('/operator-profile/:clientId/:operatorId', async (request, reply) => {
    const { clientId, operatorId } = request.params;

    try {
      const profile = persistence.getOperatorProfile(clientId, operatorId);
      return { success: true, data: profile };
    } catch (err) {
      logger.error({ err, clientId, operatorId }, '[Intelligence] Failed to get operator profile');
      return reply.status(500).send({ success: false, error: 'Failed to get operator profile' });
    }
  });

  logger.info('[Intelligence Routes] Loaded');
}
