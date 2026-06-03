/**
 * Competitor Creative Intelligence — Report Runners & Formatting
 *
 * Barrel: re-exports the focused modules under ./reports/.
 * Top-level orchestration entry points and human-readable formatting.
 */

export {
  runCompetitorCreativeIntel,
  runCompetitorIntelFromDiscovery,
} from './reports/library-runners.js';
export { formatCreativeIntelReport } from './reports/formatter.js';
export { runCompetitorCreativeIntelBulk } from './reports/bulk-runner.js';
export { runCompetitorIntelForClient } from './reports/client-runner.js';
