// ============================================================================
// 4. CREATIVE EVOLUTION SYSTEM
// ============================================================================

import { logger } from '../../utils/logger.js';
import { getDbAdapter } from '../../db/adapter.js';
import type { CreativeEvolution, EvolutionDimension } from './types.js';

/**
 * Track creative evolution
 */
export async function recordEvolution(
  clientId: string,
  dimension: EvolutionDimension,
  previousState: string,
  newState: string,
  triggerSignals: string[],
  confidence: number
): Promise<CreativeEvolution> {
  const evolution: CreativeEvolution = {
    id: `evo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clientId,
    recordedAt: new Date().toISOString(),
    dimension,
    previousState,
    newState,
    triggerSignals,
    confidence,
    applied: false,
  };

  // Save to DB
  await getDbAdapter().run(`
    INSERT INTO creative_evolution (
      id, client_id, recorded_at, dimension, previous_state, new_state,
      trigger_signals, confidence, applied, outcome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    evolution.id,
    evolution.clientId,
    evolution.recordedAt,
    evolution.dimension,
    evolution.previousState,
    evolution.newState,
    JSON.stringify(evolution.triggerSignals),
    evolution.confidence,
    evolution.applied ? 1 : 0,
    evolution.outcome ?? null,
  ]);

  logger.info({ clientId, dimension, confidence }, '[Creative] Evolution recorded');

  return evolution;
}

/**
 * Get evolution history for a dimension
 */
export async function getEvolutionHistory(
  clientId: string,
  dimension?: EvolutionDimension
): Promise<CreativeEvolution[]> {
  let query = 'SELECT * FROM creative_evolution WHERE client_id = ?';
  const params: any[] = [clientId];

  if (dimension) {
    query += ' AND dimension = ?';
    params.push(dimension);
  }

  query += ' ORDER BY recorded_at DESC LIMIT 50';

  const rows = await getDbAdapter().all(query, params) as any[];
  return rows.map(row => ({
    id: row.id,
    clientId: row.client_id,
    recordedAt: row.recorded_at,
    dimension: row.dimension,
    previousState: row.previous_state,
    newState: row.new_state,
    triggerSignals: JSON.parse(row.trigger_signals || '[]'),
    confidence: row.confidence,
    applied: row.applied === 1,
    outcome: row.outcome,
  }));
}
