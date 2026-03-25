import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import type { UgcProjectRow, UgcConceptRow, UgcScriptRow } from '../types/index.js';
import { validate, projectIdBodySchema, projectIdQuerySchema } from '../validation/schemas.js';
import { safeJsonParse } from '../utils/safe-json.js';

export async function ugcRoutes(app: FastifyInstance) {

  // GET /ugc/projects
  app.get('/projects', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const projects = db.prepare(
      'SELECT * FROM ugc_projects WHERE user_id = ? ORDER BY created_at DESC'
    ).all(request.user.id) as UgcProjectRow[];

    return {
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        brand_name: p.brand_name,
        status: p.status,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
    };
  });

  // POST /ugc/project-detail
  app.post('/project-detail', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(projectIdBodySchema, request.body, reply);
    if (!parsed) return;
    const { project_id } = parsed;

    const db = getDb();
    const project = db.prepare(
      'SELECT * FROM ugc_projects WHERE id = ? AND user_id = ?'
    ).get(project_id, request.user.id) as UgcProjectRow | undefined;

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const concepts = db.prepare(
      'SELECT * FROM ugc_concepts WHERE project_id = ? ORDER BY created_at DESC'
    ).all(project_id) as UgcConceptRow[];

    const scripts = db.prepare(
      'SELECT * FROM ugc_scripts WHERE project_id = ? ORDER BY created_at DESC'
    ).all(project_id) as UgcScriptRow[];

    return {
      id: project.id,
      name: project.name,
      brand_name: project.brand_name,
      status: project.status,
      brief: safeJsonParse(project.brief, null),
      concepts: concepts.map(c => ({
        id: c.id,
        title: c.title,
        description: c.description,
        status: c.status,
        feedback: c.feedback,
        created_at: c.created_at,
      })),
      scripts: scripts.map(s => ({
        id: s.id,
        concept_id: s.concept_id,
        title: s.title,
        content: s.content,
        status: s.status,
        created_at: s.created_at,
        updated_at: s.updated_at,
      })),
      created_at: project.created_at,
      updated_at: project.updated_at,
    };
  });

  // GET /ugc/concepts
  app.get('/concepts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(projectIdQuerySchema, request.query, reply);
    if (!parsed) return;
    const { project_id } = parsed;

    const db = getDb();
    const concepts = db.prepare(
      `SELECT c.* FROM ugc_concepts c
       JOIN ugc_projects p ON c.project_id = p.id
       WHERE c.project_id = ? AND p.user_id = ?
       ORDER BY c.created_at DESC`
    ).all(project_id, request.user.id) as UgcConceptRow[];

    return {
      concepts: concepts.map(c => ({
        id: c.id,
        title: c.title,
        description: c.description,
        status: c.status,
        feedback: c.feedback,
        created_at: c.created_at,
      })),
    };
  });

  // GET /ugc/scripts
  app.get('/scripts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = validate(projectIdQuerySchema, request.query, reply);
    if (!parsed) return;
    const { project_id } = parsed;

    const db = getDb();
    const scripts = db.prepare(
      `SELECT s.* FROM ugc_scripts s
       JOIN ugc_projects p ON s.project_id = p.id
       WHERE s.project_id = ? AND p.user_id = ?
       ORDER BY s.created_at DESC`
    ).all(project_id, request.user.id) as UgcScriptRow[];

    return {
      scripts: scripts.map(s => ({
        id: s.id,
        concept_id: s.concept_id,
        title: s.title,
        content: s.content,
        status: s.status,
        created_at: s.created_at,
        updated_at: s.updated_at,
      })),
    };
  });

}
