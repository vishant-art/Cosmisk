/**
 * Strategic Narrative Synthesis
 *
 * Instead of delivering disconnected findings, this system:
 * 1. Aggregates findings from hypotheses, causal models, and curiosity scans
 * 2. Identifies themes that emerge across multiple signals
 * 3. Resolves contradictions between conflicting findings
 * 4. Builds a coherent worldview model
 * 5. Projects forward: what happens if current trends continue
 * 6. Identifies inflection points where the story might change
 * 7. Synthesizes strategic imperatives
 * 8. Acknowledges uncertainties honestly
 *
 * Example Output:
 *   "Market is maturing. You hold strong position in metros but are losing
 *    ground in Tier-2 to competitors. Trust erosion is accelerating.
 *    Key inflection: competitor Tier-2 launch in 3-6 months (60% probability).
 *    Strategic imperative: Expand to Tier-2 NOW before window closes."
 *
 * ---------------------------------------------------------------------------
 * BARREL: this module was decomposed into focused submodules under
 * ./narrative-synthesis/. The original public surface is preserved here via
 * re-exports so existing importers are unaffected. No behavior change.
 */

// Shared types (leaf module)
export type {
  MarketState,
  CompetitivePosition,
  TimeHorizon,
  ForceDirection,
  WorldviewModel,
  StrategicForce,
  InflectionPoint,
  StrategicImperative,
  NarrativeUncertainty,
  Theme,
  Contradiction,
  StrategicNarrative,
  ExecutiveSummary,
  NarrativeInputs,
  NarrativeSynthesisResult,
} from './narrative-synthesis/types.js';

// Synthesizer engine + factory / convenience functions
export {
  NarrativeSynthesizer,
  createNarrativeSynthesizer,
  synthesizeNarrative,
} from './narrative-synthesis/synthesizer.js';
