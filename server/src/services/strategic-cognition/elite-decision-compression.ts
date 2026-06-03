/**
 * Elite Decision Compression Engine
 *
 * NOT a reporting system. A strategic leverage discovery system.
 *
 * ---------------------------------------------------------------------------
 * BARREL: this module was decomposed into focused submodules under
 * ./elite-decision-compression/. The original public surface is preserved
 * here via re-exports so existing importers are unaffected. No behavior change.
 */

// Shared public types (leaf module)
export type {
  AccountDecomposition,
  GeographicAsymmetry,
  CreativeSystemHealth,
  AudienceQualityDecay,
  HiddenContradiction,
  StrategicLeverage,
  TheOneThing,
  ActionSystem,
  EliteIntelligenceOutput,
} from './elite-decision-compression/types.js';

// Engine class + factory
export {
  EliteDecisionCompressionEngine,
  createEliteDecisionEngine,
} from './elite-decision-compression/engine.js';
