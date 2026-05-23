/**
 * Pattern Extractor — shared types.
 *
 * `ExtractedPatterns` is the contract between the ad-engine validator
 * (`./ad-engine/validator.ts`) and the learning-engine
 * (`./learning-engine.ts`). Fields below were enumerated from the actual
 * property accesses in those files.
 *
 * Adding properties is safe; removing them will break tsc.
 *
 * Stub status: the production extractor lives elsewhere (planned —
 * see dev_reports/19_05/INDEX.md, M2 milestone). Today this module exports
 * only the type so importers can compile.
 */

// ============================================================================
// Hooks
// ============================================================================

export interface HookType {
  type: string;
  frequency: number;
  examples: string[];
}

export interface HookPatterns {
  dominantHook: string;
  hookTypes: HookType[];
}

// ============================================================================
// Typography
// ============================================================================

export interface TypographyPatterns {
  primaryFamily: string;
  primaryFont: string;             // validator.ts:960
  headlineWeight: string;          // validator.ts:961
  textHierarchy: string;           // validator.ts:962
  weights: number[];
  textDensity: 'minimal' | 'moderate' | 'heavy';
}

// ============================================================================
// Colours
// ============================================================================

export interface ColourPatterns {
  palette: string[];
  dominantColors: string[];        // validator.ts:972
  mood: string;                    // validator.ts:973
  backgroundStyle: string;         // validator.ts:974
  contrastLevel: 'low' | 'medium' | 'high';
}

// ============================================================================
// Layout
// ============================================================================

export interface LayoutPatterns {
  dominant: 'product-center' | 'lifestyle' | 'split' | 'text-overlay';
  productPlacement: string;        // validator.ts:966
  layoutType: string;              // validator.ts:967
  ctaPosition: string;             // validator.ts:968
  whitespaceUsage: string;         // validator.ts:969
  textPlacement: 'top' | 'bottom' | 'overlay' | 'side';
}

// ============================================================================
// Visual style
// ============================================================================

export interface VisualStyle {
  overallStyle: string;
  imageryStyle: 'studio' | 'lifestyle' | 'ugc' | 'illustration';
}

// ============================================================================
// Quality benchmark — used by validator.ts as a structured object (NOT a
// scalar). Fields enumerated from validator.ts:893-901, 978-986.
// ============================================================================

export interface QualityBenchmark {
  minSophisticationScore: number;
  minFeedNativeScore: number;
  mustHaveElements: string[];
  mustAvoidElements: string[];
}

// ============================================================================
// Aggregate
// ============================================================================

export interface ExtractedPatterns {
  adsAnalyzed: number;
  competitorsAnalyzed: number;     // validator.ts:787
  topCompetitors: string[];
  qualityBenchmark: QualityBenchmark;
  typography: TypographyPatterns;
  colors: ColourPatterns;
  layout: LayoutPatterns;
  visualStyle: VisualStyle;
  hooks: HookPatterns;
}
