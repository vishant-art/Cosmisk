import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CreativeEngineService } from './creative-engine.service';
import { ApiService } from './api.service';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';

describe('CreativeEngineService', () => {
  let service: CreativeEngineService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
      ],
    });
    service = TestBed.inject(CreativeEngineService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadSprints', () => {
    it('should set sprints on success', () => {
      const mockSprints = [{ id: 's1', name: 'Sprint 1' }];
      apiSpy.get.and.returnValue(of({ success: true, sprints: mockSprints }));
      service.loadSprints();
      expect(service.sprints()).toEqual(mockSprints as any);
    });

    it('should not set sprints on failure', () => {
      apiSpy.get.and.returnValue(of({ success: false, sprints: [] }));
      service.loadSprints();
      expect(service.sprints()).toEqual([]);
    });
  });

  describe('getSprints', () => {
    it('should return observable from api.get', () => {
      const mockRes = { success: true, sprints: [] };
      apiSpy.get.and.returnValue(of(mockRes));
      service.getSprints().subscribe(res => {
        expect(res).toEqual(mockRes);
      });
      expect(apiSpy.get).toHaveBeenCalledWith(environment.ENGINE_SPRINTS);
    });
  });

  describe('analyze', () => {
    it('should set analyzing to true and call api.post', () => {
      const mockRes = { success: true, snapshot: {}, summary: {} };
      apiSpy.post.and.returnValue(of(mockRes));
      service.analyze('acc1', 'system', 'USD').subscribe(res => {
        expect(res).toEqual(mockRes as any);
      });
      expect(service.analyzing()).toBeTrue();
      expect(apiSpy.post).toHaveBeenCalledWith(environment.ENGINE_ANALYZE, {
        account_id: 'acc1',
        credential_group: 'system',
        currency: 'USD',
      });
    });
  });

  describe('generatePlan', () => {
    it('should call api.post with correct params', () => {
      const snapshot = {} as any;
      const prefs = { style: 'bold' };
      apiSpy.post.and.returnValue(of({ success: true, sprint_id: 's1', plan: {} }));
      service.generatePlan(snapshot, prefs, 'Test Sprint').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(environment.ENGINE_PLAN, {
        snapshot,
        preferences: prefs,
        sprint_name: 'Test Sprint',
      });
    });
  });

  describe('getSprint', () => {
    it('should call api.get with sprint id', () => {
      apiSpy.get.and.returnValue(of({ success: true, sprint: {}, jobs: [], assets: [] }));
      service.getSprint('s1').subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1`);
    });
  });

  describe('approveSprint', () => {
    it('should call api.post', () => {
      apiSpy.post.and.returnValue(of({ success: true, jobs_created: 5 }));
      service.approveSprint('s1').subscribe(res => {
        expect(res.jobs_created).toBe(5);
      });
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/approve`, {});
    });
  });

  describe('startGeneration', () => {
    it('should set generating to true and call api.post', () => {
      apiSpy.post.and.returnValue(of({ success: true, message: 'started' }));
      service.startGeneration('s1').subscribe();
      expect(service.generating()).toBeTrue();
    });
  });

  describe('getReview', () => {
    it('should call api.get', () => {
      apiSpy.get.and.returnValue(of({ success: true, creatives: [] }));
      service.getReview('s1').subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/review`);
    });
  });

  describe('approveAsset', () => {
    it('should call api.post', () => {
      apiSpy.post.and.returnValue(of({ success: true, asset_id: 'a1' }));
      service.approveAsset('j1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_ASSET}/j1/approve`, {});
    });
  });

  describe('rejectAsset', () => {
    it('should call api.post', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.rejectAsset('a1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_ASSET}/a1/reject`, {});
    });
  });

  describe('retryJob', () => {
    it('should call api.post', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.retryJob('j1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_JOB}/j1/retry`, {});
    });
  });

  describe('generateScripts', () => {
    it('should call api.post with params', () => {
      const params = { product_name: 'Widget', target_audience: 'Devs' };
      apiSpy.post.and.returnValue(of({ success: true, scripts_generated: 3 }));
      service.generateScripts('s1', params).subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/scripts`, params);
    });
  });

  describe('publishSprint', () => {
    it('should call api.post with publish params', () => {
      const params = { account_id: 'a1', page_id: 'p1' };
      apiSpy.post.and.returnValue(of({ success: true, published: 2, failed: 0, campaign_id: 'c1' }));
      service.publishSprint('s1', params).subscribe(res => {
        expect(res.published).toBe(2);
      });
    });
  });

  describe('trackPerformance', () => {
    it('should call api.post', () => {
      apiSpy.post.and.returnValue(of({ success: true, tracked: 5, total: 10 }));
      service.trackPerformance('s1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/track`, {});
    });
  });

  describe('cancelSprint', () => {
    it('should call api.post', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.cancelSprint('s1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/cancel`, {});
    });
  });

  describe('deleteSprint', () => {
    it('should call api.delete', () => {
      apiSpy.delete.and.returnValue(of({ success: true }));
      service.deleteSprint('s1').subscribe();
      expect(apiSpy.delete).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1`);
    });
  });

  describe('getCosts', () => {
    it('should call api.get', () => {
      apiSpy.get.and.returnValue(of({ success: true, costs: {} }));
      service.getCosts().subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.ENGINE_COSTS);
    });
  });

  describe('getUsage', () => {
    it('should call api.get', () => {
      apiSpy.get.and.returnValue(of({ success: true, usage: {} }));
      service.getUsage().subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.ENGINE_USAGE);
    });
  });

  describe('getTemplates', () => {
    it('should call api.get', () => {
      apiSpy.get.and.returnValue(of({ success: true, templates: [] }));
      service.getTemplates().subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.ENGINE_TEMPLATES);
    });
  });

  describe('getAnalytics', () => {
    it('should call api.get', () => {
      apiSpy.get.and.returnValue(of({ success: true, analytics: {} }));
      service.getAnalytics().subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.ENGINE_ANALYTICS);
    });
  });

  describe('duplicateSprint', () => {
    it('should call api.post with name', () => {
      apiSpy.post.and.returnValue(of({ success: true, sprint_id: 's2', name: 'Copy' }));
      service.duplicateSprint('s1', 'Copy').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/duplicate`, { name: 'Copy' });
    });

    it('should work without name', () => {
      apiSpy.post.and.returnValue(of({ success: true, sprint_id: 's2', name: 'Sprint 1 (copy)' }));
      service.duplicateSprint('s1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/duplicate`, { name: undefined });
    });
  });

  describe('editAsset', () => {
    it('should call api.post with edits', () => {
      const edits = { headline: 'New Headline', cta_text: 'Buy Now' };
      apiSpy.post.and.returnValue(of({ success: true, asset_id: 'a1' }));
      service.editAsset('a1', edits).subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_ASSET}/a1/edit`, edits);
    });
  });
});
