import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';

export interface UgcProjectSummary {
  id: string;
  client_code: string;
  brand_name: string;
  status: string;
  num_scripts: number;
  created_at: string;
  pm_email?: string;
}

export interface UgcConcept {
  id: string;
  title: string;
  angle: string;
  hook_type: string;
  status: string;
  virality_score?: number;
}

export interface UgcScript {
  id: string;
  title: string;
  overall_status: string;
  google_doc_id?: string;
  google_doc_url?: string;
}

export interface UgcProjectDetail {
  project: {
    id: string;
    client_code: string;
    brand_name: string;
    status: string;
    num_scripts: number;
    target_audience: string;
    product_feature: string;
    created_at: string;
    concepts: UgcConcept[];
    scripts: UgcScript[];
  };
}

export interface DashboardKpis {
  projects: { total: number; by_status: Record<string, number> };
  concepts: { total: number; approved: number; pending: number; rejected: number };
  scripts: { total: number; delivered: number; in_review: number; draft: number };
  recent_projects: UgcProjectSummary[];
}

@Injectable({ providedIn: 'root' })
export class UgcService {
  private api = inject(ApiService);

  getDashboardKpis(): Observable<DashboardKpis> {
    return this.api.get<DashboardKpis>(environment.DASHBOARD_KPI);
  }

  getProjects(): Observable<{ projects: UgcProjectSummary[] }> {
    return this.api.get<{ projects: UgcProjectSummary[] }>(environment.UGC_PROJECTS);
  }

  getProjectDetail(projectId: string): Observable<UgcProjectDetail> {
    return this.api.post<UgcProjectDetail>(environment.UGC_PROJECT_DETAIL, { project_id: projectId });
  }

  getConcepts(projectId: string): Observable<{ concepts: UgcConcept[] }> {
    return this.api.get<{ concepts: UgcConcept[] }>(environment.UGC_CONCEPTS, { project_id: projectId });
  }

  getScripts(projectId: string): Observable<{ scripts: UgcScript[] }> {
    return this.api.get<{ scripts: UgcScript[] }>(environment.UGC_SCRIPTS, { project_id: projectId });
  }

  onboardProject(brief: Record<string, unknown>) {
    return this.api.post(environment.UGC_ONBOARD, brief);
  }

  approveConcepts(projectId: string, conceptIds: string[], notes?: string) {
    return this.api.post(environment.UGC_APPROVE, {
      project_id: projectId,
      action: 'pm_approve',
      concept_ids: conceptIds,
      notes,
    });
  }

  rejectConcepts(projectId: string, conceptIds: string[], feedback: string) {
    return this.api.post(environment.UGC_APPROVE, {
      project_id: projectId,
      action: 'pm_reject',
      concept_ids: conceptIds,
      feedback,
    });
  }

  deliverScripts(projectId: string) {
    return this.api.post(environment.UGC_DELIVER, {
      project_id: projectId,
      action: 'approve',
    });
  }

  sendToClient(projectId: string) {
    return this.api.post(environment.UGC_DELIVER, {
      project_id: projectId,
      action: 'send_to_client',
    });
  }
}
