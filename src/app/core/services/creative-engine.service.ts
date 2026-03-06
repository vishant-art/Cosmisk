import { Injectable, inject, signal } from '@angular/core';
import { Observable, timer } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';
import type {
  Sprint, AccountSnapshot, SprintPlan, SprintProgress,
  CreativeJob, CostSummary, SprintTemplate, EngineAnalytics,
} from '../models/creative-engine.model';

@Injectable({ providedIn: 'root' })
export class CreativeEngineService {
  private api = inject(ApiService);

  sprints = signal<Sprint[]>([]);
  currentSprint = signal<Sprint | null>(null);
  analyzing = signal(false);
  generating = signal(false);

  loadSprints(): void {
    this.api.get<{ success: boolean; sprints: Sprint[] }>(
      environment.ENGINE_SPRINTS
    ).subscribe({
      next: (res) => {
        if (res.success) this.sprints.set(res.sprints);
      },
    });
  }

  getSprints(): Observable<{ success: boolean; sprints: Sprint[] }> {
    return this.api.get(environment.ENGINE_SPRINTS);
  }

  analyze(accountId: string, credentialGroup: string, currency: string): Observable<{
    success: boolean;
    snapshot: AccountSnapshot;
    summary: any;
  }> {
    this.analyzing.set(true);
    return this.api.post(environment.ENGINE_ANALYZE, {
      account_id: accountId,
      credential_group: credentialGroup,
      currency,
    });
  }

  generatePlan(snapshot: AccountSnapshot, preferences: any, sprintName: string): Observable<{
    success: boolean;
    sprint_id: string;
    plan: SprintPlan;
  }> {
    return this.api.post(environment.ENGINE_PLAN, {
      snapshot,
      preferences,
      sprint_name: sprintName,
    });
  }

  getSprint(sprintId: string): Observable<{
    success: boolean;
    sprint: Sprint;
    jobs: CreativeJob[];
    assets: any[];
  }> {
    return this.api.get(`${environment.ENGINE_SPRINT}/${sprintId}`);
  }

  approveSprint(sprintId: string): Observable<{ success: boolean; jobs_created: number }> {
    return this.api.post(`${environment.ENGINE_SPRINT}/${sprintId}/approve`, {});
  }

  startGeneration(sprintId: string): Observable<{ success: boolean; message: string }> {
    this.generating.set(true);
    return this.api.post(`${environment.ENGINE_SPRINT}/${sprintId}/generate`, {});
  }

  pollProgress(sprintId: string): Observable<{ success: boolean; progress: SprintProgress; status: string }> {
    return timer(0, 3000).pipe(
      switchMap(() =>
        this.api.get<{ success: boolean; progress: SprintProgress; status: string }>(
          `${environment.ENGINE_SPRINT}/${sprintId}/progress`
        )
      ),
      takeWhile(
        (res) => res.progress.pct < 100 && res.status === 'generating',
        true
      ),
    );
  }

  getReview(sprintId: string): Observable<{ success: boolean; creatives: CreativeJob[] }> {
    return this.api.get(`${environment.ENGINE_SPRINT}/${sprintId}/review`);
  }

  approveAsset(jobId: string): Observable<{ success: boolean; asset_id: string }> {
    return this.api.post(`${environment.ENGINE_ASSET}/${jobId}/approve`, {});
  }

  rejectAsset(assetId: string): Observable<{ success: boolean }> {
    return this.api.post(`${environment.ENGINE_ASSET}/${assetId}/reject`, {});
  }

  retryJob(jobId: string): Observable<{ success: boolean }> {
    return this.api.post(`${environment.ENGINE_JOB}/${jobId}/retry`, {});
  }

  generateScripts(sprintId: string, params: {
    product_name?: string; target_audience?: string; brand_name?: string;
  }): Observable<{ success: boolean; scripts_generated: number }> {
    return this.api.post(`${environment.ENGINE_SPRINT}/${sprintId}/scripts`, params);
  }

  publishSprint(sprintId: string, params: {
    account_id: string; page_id: string; campaign_id?: string; adset_id?: string; status?: string;
  }): Observable<{ success: boolean; published: number; failed: number; campaign_id: string }> {
    return this.api.post(`${environment.ENGINE_SPRINT}/${sprintId}/publish`, params);
  }

  trackPerformance(sprintId: string): Observable<{ success: boolean; tracked: number; total: number }> {
    return this.api.post(`${environment.ENGINE_SPRINT}/${sprintId}/track`, {});
  }

  cancelSprint(sprintId: string): Observable<{ success: boolean }> {
    return this.api.post(`${environment.ENGINE_SPRINT}/${sprintId}/cancel`, {});
  }

  deleteSprint(sprintId: string): Observable<{ success: boolean }> {
    return this.api.delete(`${environment.ENGINE_SPRINT}/${sprintId}`);
  }

  getCosts(): Observable<{ success: boolean; costs: CostSummary }> {
    return this.api.get(environment.ENGINE_COSTS);
  }

  getUsage(): Observable<{ success: boolean; usage: any }> {
    return this.api.get(environment.ENGINE_USAGE);
  }

  getTemplates(): Observable<{ success: boolean; templates: SprintTemplate[] }> {
    return this.api.get(environment.ENGINE_TEMPLATES);
  }

  getAnalytics(): Observable<{ success: boolean; analytics: EngineAnalytics }> {
    return this.api.get(environment.ENGINE_ANALYTICS);
  }

  duplicateSprint(sprintId: string, name?: string): Observable<{ success: boolean; sprint_id: string; name: string }> {
    return this.api.post(`${environment.ENGINE_SPRINT}/${sprintId}/duplicate`, { name });
  }

  editAsset(assetId: string, edits: {
    headline?: string; cta_text?: string; hook_text?: string; notes?: string;
  }): Observable<{ success: boolean; asset_id: string }> {
    return this.api.post(`${environment.ENGINE_ASSET}/${assetId}/edit`, edits);
  }
}
