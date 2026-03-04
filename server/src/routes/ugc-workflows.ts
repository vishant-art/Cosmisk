import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/index.js';
import type { UgcConceptRow } from '../types/index.js';

export async function ugcWorkflowRoutes(app: FastifyInstance) {

  // POST /ugc-onboarding
  app.post('/ugc-onboarding', { preHandler: [app.authenticate] }, async (request) => {
    const body = request.body as { name?: string; brand_name?: string; brief?: any };
    const db = getDb();
    const id = uuidv4();

    db.prepare(
      'INSERT INTO ugc_projects (id, user_id, name, brand_name, status, brief) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, request.user.id, body.name || 'New Project', body.brand_name || null, 'onboarding', body.brief ? JSON.stringify(body.brief) : null);

    return { success: true, project_id: id };
  });

  // POST /ugc-phase1 (research)
  app.post('/ugc-phase1', { preHandler: [app.authenticate] }, async (request) => {
    const { project_id } = request.body as { project_id: string };
    const db = getDb();

    db.prepare("UPDATE ugc_projects SET status = 'research', updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(project_id, request.user.id);

    return { success: true };
  });

  // POST /ugc-concept-approval
  app.post('/ugc-concept-approval', { preHandler: [app.authenticate] }, async (request) => {
    const { project_id, action, concept_ids, notes } = request.body as {
      project_id: string; action: string; concept_ids?: string[]; notes?: string;
    };

    const db = getDb();
    const newStatus = action === 'pm_approve' ? 'approved' : 'rejected';

    if (concept_ids?.length) {
      const stmt = db.prepare('UPDATE ugc_concepts SET status = ?, feedback = ? WHERE id = ?');
      for (const cid of concept_ids) {
        stmt.run(newStatus, notes || null, cid);
      }
    }

    return { success: true };
  });

  // POST /ugc-phase3 (write scripts)
  app.post('/ugc-phase3', { preHandler: [app.authenticate] }, async (request) => {
    const { project_id } = request.body as { project_id: string };
    const db = getDb();

    db.prepare("UPDATE ugc_projects SET status = 'scripting', updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(project_id, request.user.id);

    return { success: true };
  });

  // POST /ugc-delivery
  app.post('/ugc-delivery', { preHandler: [app.authenticate] }, async (request) => {
    const { project_id } = request.body as { project_id: string };
    const db = getDb();

    db.prepare("UPDATE ugc_projects SET status = 'delivered', updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(project_id, request.user.id);

    return { success: true };
  });

  // POST /ugc-script-revision
  app.post('/ugc-script-revision', { preHandler: [app.authenticate] }, async (request) => {
    const { script_id, content } = request.body as { script_id: string; content?: string };
    const db = getDb();

    if (content) {
      db.prepare("UPDATE ugc_scripts SET content = ?, status = 'in_review', updated_at = datetime('now') WHERE id = ?")
        .run(content, script_id);
    }

    return { success: true };
  });
}
