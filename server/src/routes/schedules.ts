/**
 * Scheduled Audits API Routes
 */

import type { FastifyInstance } from 'fastify';
import {
  initializeScheduler,
  stopScheduler,
  createScheduledAudit,
  updateScheduledAudit,
  deleteScheduledAudit,
  getScheduledAudit,
  listScheduledAudits,
  triggerScheduledAudit,
  getSchedulerStatus,
} from '../services/audit-scheduler.js';

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /schedules/status
   * Get scheduler status
   */
  app.get('/status', async () => {
    return getSchedulerStatus();
  });

  /**
   * POST /schedules/start
   * Start the scheduler
   */
  app.post('/start', async () => {
    initializeScheduler();
    return { success: true, message: 'Scheduler started' };
  });

  /**
   * POST /schedules/stop
   * Stop the scheduler
   */
  app.post('/stop', async () => {
    stopScheduler();
    return { success: true, message: 'Scheduler stopped' };
  });

  /**
   * GET /schedules
   * List all scheduled audits
   */
  app.get('/', async (request) => {
    const { brandId } = request.query as { brandId?: string };
    return listScheduledAudits(brandId);
  });

  /**
   * GET /schedules/:id
   * Get a specific scheduled audit
   */
  app.get<{
    Params: { id: string };
  }>('/:id', async (request, reply) => {
    const schedule = getScheduledAudit(request.params.id);

    if (!schedule) {
      reply.status(404);
      return { error: 'Schedule not found' };
    }

    return schedule;
  });

  /**
   * POST /schedules
   * Create a new scheduled audit
   */
  app.post<{
    Body: {
      brandId: string;
      brandName: string;
      frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
      datePreset?: 'last_7d' | 'last_14d' | 'last_30d';
    };
  }>('/', async (request, reply) => {
    const { brandId, brandName, frequency, datePreset } = request.body;

    if (!brandId || !brandName || !frequency) {
      reply.status(400);
      return { error: 'Missing required fields: brandId, brandName, frequency' };
    }

    if (!['daily', 'weekly', 'biweekly', 'monthly'].includes(frequency)) {
      reply.status(400);
      return { error: 'Invalid frequency. Must be: daily, weekly, biweekly, or monthly' };
    }

    const schedule = createScheduledAudit({
      brandId,
      brandName,
      frequency,
      datePreset,
    });

    reply.status(201);
    return schedule;
  });

  /**
   * PATCH /schedules/:id
   * Update a scheduled audit
   */
  app.patch<{
    Params: { id: string };
    Body: {
      frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
      datePreset?: 'last_7d' | 'last_14d' | 'last_30d';
      enabled?: boolean;
    };
  }>('/:id', async (request, reply) => {
    const { frequency, datePreset, enabled } = request.body;

    const schedule = updateScheduledAudit(request.params.id, {
      frequency,
      datePreset,
      enabled,
    });

    if (!schedule) {
      reply.status(404);
      return { error: 'Schedule not found' };
    }

    return schedule;
  });

  /**
   * DELETE /schedules/:id
   * Delete a scheduled audit
   */
  app.delete<{
    Params: { id: string };
  }>('/:id', async (request, reply) => {
    const deleted = deleteScheduledAudit(request.params.id);

    if (!deleted) {
      reply.status(404);
      return { error: 'Schedule not found' };
    }

    return { success: true, message: 'Schedule deleted' };
  });

  /**
   * POST /schedules/:id/trigger
   * Trigger an immediate run of a scheduled audit
   */
  app.post<{
    Params: { id: string };
  }>('/:id/trigger', async (request, reply) => {
    const triggered = await triggerScheduledAudit(request.params.id);

    if (!triggered) {
      reply.status(404);
      return { error: 'Schedule not found' };
    }

    return { success: true, message: 'Audit triggered' };
  });
}
