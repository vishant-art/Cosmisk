/* ------------------------------------------------------------------ */
/*  Creative Performance Scorer — Types                                */
/* ------------------------------------------------------------------ */

export interface CreativeScoreInput {
  userId: string;
  format: string;            // scripts | static | carousel | video
  hookType?: string;         // e.g. "Pattern Interrupt", "Curiosity Gap"
  dnaTags?: {
    hook?: string[];
    visual?: string[];
    audio?: string[];
    editing?: string[];
    text_overlay?: string[];
    color_mood?: string[];
    cta?: string[];
  };
  scriptText?: string;       // raw script content for pattern extraction
  platform?: string;         // default 'meta'
  metaAccountId?: string;
}

export interface ScoreDimension {
  score: number;             // 0-20
  label: string;
  detail: string;
}

export interface CreativeScore {
  total: number;             // 0-100
  dimensions: {
    patternMatch: ScoreDimension;
    hookQuality: ScoreDimension;
    formatSignal: ScoreDimension;
    dataConfidence: ScoreDimension;
    novelty: ScoreDimension;
  };
  confidence: 'low' | 'moderate' | 'high';
  predictedRoasRange?: { p25: number; p50: number; p75: number };
  matchedPatterns: string[];
  warnings: string[];
  topInsight: string;
}

export interface ClientCreativeScoreReport {
  clientId: string;
  clientName: string;
  revenueLevel: string;
  scoreThreshold: number;
  scores: Array<{
    input: CreativeScoreInput;
    score: CreativeScore;
    meetsThreshold: boolean;
  }>;
  summary: {
    totalScored: number;
    avgScore: number;
    aboveThreshold: number;
    belowThreshold: number;
    topFormat: string;
    winningPatterns: string[];
  };
  shouldAlert: boolean;
  alertReason?: string;
  scoredAt: string;
}

/* ------------------------------------------------------------------ */
/*  Internal shared types                                              */
/* ------------------------------------------------------------------ */

export interface WinningDna {
  hooks: Map<string, number>;   // pattern -> weighted count
  visuals: Map<string, number>;
  audio: Map<string, number>;
}

export interface DimensionResult {
  score: number;
  detail: string;
  warnings: string[];
  matchedPatterns: string[];
}
