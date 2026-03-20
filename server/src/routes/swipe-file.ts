import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import type { SwipeFileRow } from '../types/index.js';

export async function swipeFileRoutes(app: FastifyInstance) {

  /* ---- GET /list — all saved swipe file items for the user ---- */
  app.get('/list', { preHandler: [app.authenticate] }, async (request) => {
    const db = getDb();
    const userId = request.user.id;

    const rows = db.prepare(
      'SELECT * FROM swipe_file WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId) as SwipeFileRow[];

    return {
      success: true,
      items: rows.map(r => ({
        id: r.id,
        brand: r.brand,
        thumbnail: r.thumbnail || '',
        hookDna: JSON.parse(r.hook_dna),
        visualDna: JSON.parse(r.visual_dna),
        audioDna: JSON.parse(r.audio_dna),
        notes: r.notes || '',
        sourceUrl: r.source_url || '',
        sourceAdId: r.source_ad_id || '',
        savedAt: r.created_at,
      })),
    };
  });

  /* ---- POST /save — save a new swipe file item ---- */
  app.post('/save', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDb();
    const userId = request.user.id;
    const body = request.body as Record<string, unknown>;

    const brand = (body['brand'] as string) || '';
    const thumbnail = (body['thumbnail'] as string) || null;
    const hookDna = JSON.stringify(body['hookDna'] || []);
    const visualDna = JSON.stringify(body['visualDna'] || []);
    const audioDna = JSON.stringify(body['audioDna'] || []);
    const notes = (body['notes'] as string) || null;
    const sourceUrl = (body['sourceUrl'] as string) || null;
    const sourceAdId = (body['sourceAdId'] as string) || null;

    const id = randomUUID();

    db.prepare(`
      INSERT INTO swipe_file (id, user_id, brand, thumbnail, hook_dna, visual_dna, audio_dna, notes, source_url, source_ad_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, brand, thumbnail, hookDna, visualDna, audioDna, notes, sourceUrl, sourceAdId);

    return { success: true, id };
  });

  /* ---- DELETE /:id — remove a swipe file item ---- */
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const db = getDb();
    const userId = request.user.id;
    const { id } = request.params as { id: string };

    const result = db.prepare(
      'DELETE FROM swipe_file WHERE id = ? AND user_id = ?'
    ).run(id, userId);

    if (result.changes === 0) {
      return reply.status(404).send({ success: false, error: 'Item not found' });
    }

    return { success: true };
  });
}
