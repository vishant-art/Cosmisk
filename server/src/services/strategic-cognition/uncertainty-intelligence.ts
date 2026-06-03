/**
 * Uncertainty-Aware Intelligence
 *
 * Instead of overconfident point estimates, this system:
 * 1. Provides confidence intervals, not just single numbers
 * 2. Detects and reports conflicting evidence
 * 3. Performs sensitivity analysis on key assumptions
 * 4. Tracks calibration over time (were we right?)
 * 5. Communicates uncertainty honestly to operators
 *
 * Example Output:
 *   Instead of: "ROAS will improve 20%"
 *
 *   Report: "ROAS improvement estimate:
 *     - Point estimate: 20%
 *     - 80% confidence interval: 8% to 35%
 *     - Distribution: Right-skewed (more upside than downside)
 *     - Evidence quality: Moderate
 *     - Key uncertainties:
 *       1. Competitor response unknown
 *       2. Seasonality may amplify or dampen
 *     - If Tier-2 CAC is 30% higher than assumed → improvement drops to 5%"
 *
 * NOTE: This file is a barrel. Implementation lives in ./uncertainty-intelligence/*.
 * It re-exports the original public surface unchanged.
 */

export type {
  DistributionType,
  EvidenceQuality,
  ImpactSeverity,
  ConflictResolution,
  UncertainEstimate,
  UncertaintySource,
  EvidenceConflict,
  SensitivityAnalysis,
  CalibrationRecord,
  UncertaintyModel,
  OverallUncertainty,
  UncertaintyReport,
  UncertaintyInput,
  UncertaintyAnalysisResult,
} from './uncertainty-intelligence/types.js';

export {
  UncertaintyIntelligenceEngine,
  createUncertaintyIntelligenceEngine,
  analyzeUncertainty,
} from './uncertainty-intelligence/engine.js';

export { formatUncertainEstimate } from './uncertainty-intelligence/formatting.js';
