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

export interface StudioOutput {
  id: string;
  generation_id: string;
  format: string;
  status: string;
  output: any;
  output_json: string;
  cost_cents: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudioGeneration {
  id: string;
  user_id: string;
  brief: StudioBrief;
  formats: string[];
  meta_account_id: string | null;
  status: string;
  outputs?: StudioOutput[];
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class CreativeStudioService {
  private api = inject(ApiService);

  analyzeUrl(url: string): Observable<{ success: boolean; analysis: UrlAnalysis }> {
    return this.api.post('creative-studio/analyze-url', { url });
  }

  generate(brief: StudioBrief, formats: string[], metaAccountId?: string): Observable<{ success: boolean; generation_id: string }> {
    return this.api.post('creative-studio/generate', { brief, formats, meta_account_id: metaAccountId });
  }

  getGeneration(id: string): Observable<{ success: boolean; generation: StudioGeneration }> {
    return this.api.get(`creative-studio/generation/${id}`);
  }

  getGenerations(): Observable<{ success: boolean; generations: StudioGeneration[] }> {
    return this.api.get('creative-studio/generations');
  }
}
