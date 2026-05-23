/**
 * Time of Day Analyzer (stub).
 *
 * Production version surfaces hours-of-day with poor ROAS to recommend
 * dayparting. unified-agent-runner reads .hourlyWastedSpend and
 * .suggestedSchedule.disabledHours.
 */

import { logger } from '../utils/logger.js';

export interface TimeOfDayAnalysis {
  hourlyWastedSpend: number;
  suggestedSchedule: {
    disabledHours: number[];
  };
}

export async function analyzeTimeOfDay(
  userId: string,
  accountId: string,
): Promise<TimeOfDayAnalysis | null> {
  logger.debug({ userId, accountId }, '[time-of-day-analyzer] stub — returning null');
  return null;
}
