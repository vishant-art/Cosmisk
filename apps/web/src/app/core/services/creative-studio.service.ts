import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';

export interface UrlAnalysis {
  brand_name: string;
  product_name: string;
  product_description: string;
  target_audience: string;
  key_features: string[];
  price: string;
  images: string[];
}

export interface StudioBrief {
  brand_name: string;
  product_name: string;
  product_description: string;
  target_audience: string;
  key_features?: string[];
  price?: string;
}

export interface ScoreDimension {
  score: number;
  label: string;
  detail: string;
}

export interface CreativeScore {
  total: number;
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

export interface StudioOutput {
  id: string;
  generation_id: string;
  format: string;
  status: string;
  output: any;
  output_json: string;
  score_json: CreativeScore[] | null;
  cost_cents: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudioGeneration {
  id: string;
  user_id: string;
  brief: StudioBrief | null;   // null in campaign mode ("generate from winners" — no manual brief)
  formats: string[];
  meta_account_id: string | null;
  status: string;
  ai_job_id?: string | null;   // durable link to the ai-layer job (rejected[]/cost_usd/qa_passed live there, not here)
  cost_cents?: number;         // rolled-up run cost (display only)
  stage?: string | null;       // live milestone while generating ("Brand kit decided", ...)
  progress?: string[];         // all milestones so far
  error_message?: string | null; // set on status: failed
  brand_kit?: Record<string, any> | null;   // AI brand kit (palette/tone/logo)
  winners?: { url: string }[]; // Meta winning creatives we conditioned on
  outputs?: StudioOutput[];
  created_at: string;
  updated_at: string;
}

export interface CreatorKit {
  name?: string; age_range?: string; gender?: string;
  appearance?: string; wardrobe?: string; setting?: string;
  energy?: string; voice_id?: string;
}

export interface VideoQuote {
  clips: number; estimated_usd: number; balance_usd: number | null;
  affordable: boolean; guard_enabled: boolean; shortfall_usd: number;
}
export interface VideoPlan {
  job_id: string; shots: number; duration_s: number; grounded: boolean;
  script?: { hook?: string; demo?: string; cta?: string } | any;
  storyboard: { shots: { title?: string; description?: string; duration_s?: number; camera?: string; subject?: string; dialogue?: string }[] };
  quote: VideoQuote;
}

@Injectable({ providedIn: 'root' })
export class CreativeStudioService {
  private api = inject(ApiService);

  // DISCONNECTED (ai-layer-only): legacy TS URL analyzer — see dev_reports/ai_serv/creative/DISCONNECTED_TS_MODULES.md
  // analyzeUrl(url: string): Observable<{ success: boolean; analysis: UrlAnalysis }> {
  //   return this.api.post('creative-studio/analyze-url', { url });
  // }

  // brief is optional — null runs "generate from winners" (campaign mode; grounds on the account).
  generate(brief: StudioBrief | null, formats: string[], opts?: { metaAccountId?: string; direction?: string }): Observable<{ success: boolean; generation_id: string }> {
    return this.api.post('creative-studio/generate', { brief: brief ?? undefined, formats, meta_account_id: opts?.metaAccountId, direction: opts?.direction });
  }

  getGeneration(id: string): Observable<{ success: boolean; generation: StudioGeneration }> {
    return this.api.get(`creative-studio/generation/${id}`);
  }

  getGenerations(): Observable<{ success: boolean; generations: StudioGeneration[] }> {
    return this.api.get('creative-studio/generations');
  }

  // DISCONNECTED (ai-layer-only): legacy TS scorer + accuracy — see dev_reports/ai_serv/creative/DISCONNECTED_TS_MODULES.md
  // scoreCreative(body: { format: string; hook_type?: string; script_text?: string; meta_account_id?: string }): Observable<{ success: boolean; score: CreativeScore }> {
  //   return this.api.post('creative-studio/score', body);
  // }
  // getAccuracy(): Observable<{ success: boolean; totalPredictions: number; resolvedPredictions: number; meanAbsoluteError: number | null; trend: string }> {
  //   return this.api.get('creative-studio/accuracy');
  // }

  videoPlan(generationId: string, opts: { seconds?: number; direction?: string; n_shots?: number; creator?: CreatorKit }):
    Observable<{ success: boolean; plan: VideoPlan; error?: string }> {
    return this.api.post('creative-studio/video/plan', { generation_id: generationId, ...opts });
  }

  videoGenerate(generationId: string, opts: { voiceover?: boolean; captions?: boolean; sfx?: boolean; direction?: string; creator?: CreatorKit; pin_face?: boolean; hero_with_creator?: boolean }):
    Observable<{ success: boolean; status: string; clips: number; error?: string }> {
    return this.api.post('creative-studio/video/generate', { generation_id: generationId, ...opts });
  }

  getVideoJob(jobId: string): Observable<{ success: boolean; job: any }> {
    return this.api.get(`creative-studio/video/job/${jobId}`);
  }

  markPublished(variantId: string, metaAdId: string): Observable<{ success: boolean; status: string; error?: string }> {
    return this.api.post(`creative-studio/variants/${variantId}/published`, { meta_ad_id: metaAdId });
  }
  learn(accountId: string): Observable<{ success: boolean; result: any; error?: string }> {
    return this.api.post('creative-studio/learn', { account_id: accountId });
  }
  getPrior(accountId: string): Observable<{ success: boolean; prior: any }> {
    return this.api.get(`creative-studio/prior/${accountId}`);
  }
  getGraph(accountId: string): Observable<{ success: boolean; graph: any }> {
    return this.api.get(`creative-studio/graph/${accountId}`);
  }
  voicePreview(voiceId?: string, text?: string): Observable<{ success: boolean; url: string; error?: string }> {
    return this.api.post('creative-studio/voice/preview', { voice_id: voiceId, text });
  }
}
