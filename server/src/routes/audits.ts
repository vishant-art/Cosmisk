/**
 * Audit Routes - API endpoints for the Adaptive Audit System
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { runAudit, getAuditHistory } from '../audit/index.js';
import { getDb } from '../db/index.js';
import type { AuditConfig } from '../audit/types.js';

interface TriggerAuditBody {
  brandId: string;
  datePreset?: AuditConfig['datePreset'];
  outputFormat?: 'markdown' | 'json' | 'both';
}

interface GetAuditParams {
  auditId: string;
}

interface ListAuditsQuery {
  brandId?: string;
  limit?: number;
}

export async function auditRoutes(app: FastifyInstance) {

  /**
   * POST /audits/trigger
   * Trigger a new audit for a brand
   */
  app.post<{ Body: TriggerAuditBody }>(
    '/trigger',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest<{ Body: TriggerAuditBody }>, reply: FastifyReply) => {
      const { brandId, datePreset = 'last_30d', outputFormat = 'markdown' } = request.body;

      if (!brandId) {
        return reply.status(400).send({ error: 'brandId is required' });
      }

      try {
        // Start audit in background
        const auditPromise = runAudit({
          brandId,
          datePreset,
          outputFormat,
          saveToDisk: true,
          outputPath: './data/audits',
        });

        // Return immediately with job info
        reply.status(202).send({
          status: 'started',
          message: `Audit started for brand ${brandId}`,
          datePreset,
        });

        // Let audit complete in background
        auditPromise.catch(error => {
          console.error(`Audit failed for ${brandId}:`, error);
        });

      } catch (error: any) {
        console.error('Failed to start audit:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * POST /audits/run
   * Run audit synchronously and return results
   */
  app.post<{ Body: TriggerAuditBody }>(
    '/run',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest<{ Body: TriggerAuditBody }>, reply: FastifyReply) => {
      const { brandId, datePreset = 'last_30d', outputFormat = 'markdown' } = request.body;

      if (!brandId) {
        return reply.status(400).send({ error: 'brandId is required' });
      }

      try {
        const result = await runAudit({
          brandId,
          datePreset,
          outputFormat,
          saveToDisk: true,
          outputPath: './data/audits',
        });

        return {
          status: 'completed',
          audit: result.audit,
          markdown: result.markdown,
          json: result.json ? JSON.parse(result.json) : undefined,
        };

      } catch (error: any) {
        console.error('Audit failed:', error);
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * GET /audits/:auditId
   * Get a specific audit by ID
   */
  app.get<{ Params: GetAuditParams }>(
    '/:auditId',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest<{ Params: GetAuditParams }>, reply: FastifyReply) => {
      const { auditId } = request.params;

      const db = getDb();
      const row = db.prepare(`
        SELECT * FROM audits WHERE id = ?
      `).get(auditId) as any;

      if (!row) {
        return reply.status(404).send({ error: 'Audit not found' });
      }

      return {
        id: row.id,
        brandId: row.brand_id,
        brandName: row.brand_name,
        dateRange: {
          start: row.date_range_start,
          end: row.date_range_end,
        },
        summary: {
          healthScore: row.health_score,
          wastedSpend: row.wasted_spend,
          bestCpa: row.best_cpa,
          worstCpa: row.worst_cpa,
          topFindings: JSON.parse(row.top_findings || '[]'),
          topPriority: row.top_priority,
        },
        confidence: row.confidence_level,
        fullOutput: row.full_output ? JSON.parse(row.full_output) : null,
        createdAt: row.created_at,
      };
    }
  );

  /**
   * GET /audits
   * List audits (optionally filtered by brand)
   */
  app.get<{ Querystring: ListAuditsQuery }>(
    '/',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest<{ Querystring: ListAuditsQuery }>, reply: FastifyReply) => {
      const { brandId, limit = 20 } = request.query;

      const db = getDb();

      let query = `
        SELECT id, brand_id, brand_name, date_range_start, date_range_end,
               health_score, wasted_spend, best_cpa, top_priority, created_at
        FROM audits
      `;

      const params: any[] = [];

      if (brandId) {
        query += ' WHERE brand_id = ?';
        params.push(brandId);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const rows = db.prepare(query).all(...params) as any[];

      return {
        audits: rows.map(row => ({
          id: row.id,
          brandId: row.brand_id,
          brandName: row.brand_name,
          dateRange: {
            start: row.date_range_start,
            end: row.date_range_end,
          },
          healthScore: row.health_score,
          wastedSpend: row.wasted_spend,
          bestCpa: row.best_cpa,
          topPriority: row.top_priority,
          createdAt: row.created_at,
        })),
        count: rows.length,
      };
    }
  );

  /**
   * GET /audits/brand/:brandId/history
   * Get audit history for a specific brand
   */
  app.get<{ Params: { brandId: string }; Querystring: { limit?: number } }>(
    '/brand/:brandId/history',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { brandId } = request.params;
      const { limit = 10 } = request.query;

      const history = getAuditHistory(brandId, limit);

      return {
        brandId,
        audits: history,
        count: history.length,
      };
    }
  );

  /**
   * GET /audits/brands
   * List all brands with audit data
   */
  app.get(
    '/brands',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const db = getDb();

      const rows = db.prepare(`
        SELECT b.id, b.name, b.domain, b.category, b.stage,
               b.meta_ad_account_id, b.shopify_domain,
               COUNT(a.id) as audit_count,
               MAX(a.created_at) as last_audit_at
        FROM brands b
        LEFT JOIN audits a ON b.id = a.brand_id
        GROUP BY b.id
        ORDER BY b.name
      `).all() as any[];

      return {
        brands: rows.map(row => ({
          id: row.id,
          name: row.name,
          domain: row.domain,
          category: row.category,
          stage: row.stage,
          metaAdAccountId: row.meta_ad_account_id,
          shopifyDomain: row.shopify_domain,
          auditCount: row.audit_count,
          lastAuditAt: row.last_audit_at,
        })),
        count: rows.length,
      };
    }
  );
}
