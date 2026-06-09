import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { AdAccountService } from './ad-account.service';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';

export interface UgcProjectSummary {
  id: string;
  name: string;
  brand_name: string;
  status: string;
  created_at: string;
}

export interface UgcConcept {
  id: string;
  title: string;
  description: string;
  status: string;
  feedback?: string;
  created_at: string;
}

export interface UgcScript {
  id: string;
  concept_id: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UgcProjectDetail {
  id: string;
  name: string;
  brand_name: string;
  status: string;
  brief: any;
  concepts: UgcConcept[];
  scripts: UgcScript[];
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class UgcService {
  private api = inject(ApiService);
  private adAccountService = inject(AdAccountService);

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
    const acc = this.adAccountService.currentAccount();
    return this.api.post(environment.UGC_ONBOARD, {
      ...brief,
      name: brief['brand_name'] || 'New Project',
      brand_name: brief['brand_name'],
      brief: {
        product_description: brief['product_feature'],
        target_audience: brief['target_user'],
        brand_name: brief['brand_name'],
        website_url: brief['website_url'],
        competitors: brief['competitors'],
      },
      account_id: acc?.id,
      credential_group: acc?.credential_group,
      currency: acc?.currency || 'INR',
      num_concepts: brief['num_scripts'] || 6,
    });
  }

  writeScripts(projectId: string) {
    const acc = this.adAccountService.currentAccount();
    return this.api.post(environment.UGC_WRITE_SCRIPTS, {
      project_id: projectId,
      account_id: acc?.id,
      currency: acc?.currency || 'INR',
    });
  }

  approveConcepts(projectId: string, conceptIds: string[], notes?: string) {
    return this.api.post(environment.UGC_APPROVE, {
      project_id: projectId,
      action: 'pm_approve',
      concept_ids: conceptIds,
      notes,
    });
  }

  clientApproveConcepts(projectId: string, conceptIds: string[]) {
    return this.api.post(environment.UGC_APPROVE, {
      project_id: projectId,
      action: 'client_approve',
      concept_ids: conceptIds,
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
