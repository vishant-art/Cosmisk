export type HookDnaType =
  | 'Shock Statement' | 'Price Anchor' | 'Authority' | 'Personal Story'
  | 'Curiosity' | 'Social Proof' | 'Urgency' | 'Education' | 'Transformation'
  | 'Direct Interrogation';

export type VisualDnaType =
  | 'Macro Texture' | 'Warm Palette' | 'Cool Palette' | 'UGC Style'
  | 'Product Focus' | 'Text-Heavy' | 'Lifestyle' | 'Before/After'
  | 'Flat Lay' | 'Minimal' | 'Dark Mood' | 'Split Screen' | 'Cinematic';

export type AudioDnaType =
  | 'Hindi VO' | 'English VO' | 'Music-Only' | 'ASMR' | 'Upbeat'
  | 'Emotional' | 'Trending Audio' | 'Original Score' | 'Silent' | 'Sound Effects'
  | 'Hindi Female VO' | 'Hindi Male VO' | 'English Female VO' | 'English Male VO'
  | 'Upbeat Music' | 'Emotional Music' | 'No Audio';

export type CreativeStatus = 'winning' | 'stable' | 'fatiguing' | 'new';
export type CreativeFormat = 'video' | 'static' | 'carousel';

export interface CreativeDna {
  hook: HookDnaType[];
  visual: VisualDnaType[];
  audio: AudioDnaType[];
}

export interface Creative {
  id: string;
  name: string;
  brandId: string;
  format: CreativeFormat;
  duration?: number;
  thumbnailUrl: string;
  videoId?: string;
  videoSourceUrl?: string;
  status: CreativeStatus;
  dna: CreativeDna;
  metrics: {
    roas: number;
    cpa: number;
    ctr: number;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
  };
  trend: {
    direction: 'up' | 'down' | 'flat';
    percentage: number;
    period: string;
  };
  daysActive: number;
  createdAt: string;
  adSetId: string;
  campaignId: string;
  source?: 'meta' | 'engine';
  dnaReasoning?: string;
}

export interface CreativeDetail extends Creative {
  dnaExplanations: {
    hook: string;
    visual: string;
    audio: string;
  };
  performanceHistory: {
    date: string;
    roas: number;
    spend: number;
    ctr: number;
  }[];
  frameByFrame?: {
    startTime: number;
    endTime: number;
    label: string;
    type: 'hook' | 'visual' | 'proof' | 'cta';
    color: string;
  }[];
  attentionHeatmap?: number[];
  recommendations: AiRecommendation[];
  similarCreatives: {
    id: string;
    name: string;
    thumbnailUrl: string;
    roas: number;
    matchPercentage: number;
  }[];
}

export interface AiRecommendation {
  type: 'scale' | 'iterate' | 'watch' | 'kill';
  title: string;
  description: string;
}
