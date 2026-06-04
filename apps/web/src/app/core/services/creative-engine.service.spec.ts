import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { CreativeEngineService } from './creative-engine.service';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

describe('CreativeEngineService', () => {
  let service: CreativeEngineService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        CreativeEngineService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    service = TestBed.inject(CreativeEngineService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial signal values', () => {
    expect(service.sprints()).toEqual([]);
    expect(service.currentSprint()).toBeNull();
    expect(service.analyzing()).toBeFalse();
    expect(service.generating()).toBeFalse();
  });

  describe('loadSprints()', () => {
    it('should fetch sprints and update signal on success', () => {
      const mockSprints = [{ id: 's1', name: 'Sprint 1' }];
      apiSpy.get.and.returnValue(of({ success: true, sprints: mockSprints }));

      service.loadSprints();

      expect(apiSpy.get).toHaveBeenCalledWith(environment.ENGINE_SPRINTS);
      expect(service.sprints() as any[]).toEqual(mockSprints);
    });

    it('should not update sprints when success is false', () => {
      apiSpy.get.and.returnValue(of({ success: false, sprints: [] }));
      service.loadSprints();
      expect(service.sprints()).toEqual([]);
    });
  });

  describe('getSprints()', () => {
    it('should return observable from API', () => {
      const mock = { success: true, sprints: [] };
      apiSpy.get.and.returnValue(of(mock));

      service.getSprints().subscribe((res) => {
        expect(res).toEqual(mock);
      });
    });
  });

  describe('analyze()', () => {
    it('should set analyzing to true and call API', () => {
      apiSpy.post.and.returnValue(of({ success: true, snapshot: {}, summary: {} }));

      service.analyze('act_123', 'system', 'USD');

      expect(service.analyzing()).toBeTrue();
      expect(apiSpy.post).toHaveBeenCalledWith(environment.ENGINE_ANALYZE, {
        account_id: 'act_123',
        credential_group: 'system',
        currency: 'USD',
      });
    });
  });

  describe('generatePlan()', () => {
    it('should post snapshot and preferences', () => {
      apiSpy.post.and.returnValue(of({ success: true, sprint_id: 's1', plan: {} }));
      const snapshot = {} as any;

      service.generatePlan(snapshot, { style: 'ugc' }, 'My Sprint');

      expect(apiSpy.post).toHaveBeenCalledWith(environment.ENGINE_PLAN, {
        snapshot,
        preferences: { style: 'ugc' },
        sprint_name: 'My Sprint',
      });
    });
  });

  describe('getSprint()', () => {
    it('should GET sprint detail by ID', () => {
      apiSpy.get.and.returnValue(of({ success: true, sprint: {}, jobs: [], assets: [] }));
      service.getSprint('s1').subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1`);
    });
  });

  describe('approveSprint()', () => {
    it('should POST approve for sprint', () => {
      apiSpy.post.and.returnValue(of({ success: true, jobs_created: 5 }));
      service.approveSprint('s1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/approve`, {});
    });
  });

  describe('startGeneration()', () => {
    it('should set generating to true and call API', () => {
      apiSpy.post.and.returnValue(of({ success: true, message: 'started' }));
      service.startGeneration('s1').subscribe();
      expect(service.generating()).toBeTrue();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/generate`, {});
    });
  });

  describe('getReview()', () => {
    it('should GET review for sprint', () => {
      apiSpy.get.and.returnValue(of({ success: true, creatives: [] }));
      service.getReview('s1').subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/review`);
    });
  });

  describe('approveAsset()', () => {
    it('should POST approve for asset', () => {
      apiSpy.post.and.returnValue(of({ success: true, asset_id: 'a1' }));
      service.approveAsset('j1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_ASSET}/j1/approve`, {});
    });
  });

  describe('rejectAsset()', () => {
    it('should POST reject for asset', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.rejectAsset('a1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_ASSET}/a1/reject`, {});
    });
  });

  describe('retryJob()', () => {
    it('should POST retry for job', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.retryJob('j1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_JOB}/j1/retry`, {});
    });
  });

  describe('generateScripts()', () => {
    it('should POST script generation params', () => {
      apiSpy.post.and.returnValue(of({ success: true, scripts_generated: 3 }));
      service.generateScripts('s1', { product_name: 'Shoes', brand_name: 'Nike' }).subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/scripts`, {
        product_name: 'Shoes',
        brand_name: 'Nike',
      });
    });
  });

  describe('publishSprint()', () => {
    it('should POST publish params', () => {
      apiSpy.post.and.returnValue(of({ success: true, published: 3, failed: 0, campaign_id: 'c1' }));
      service.publishSprint('s1', { account_id: 'act_1', page_id: 'p1' }).subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/publish`, {
        account_id: 'act_1',
        page_id: 'p1',
      });
    });
  });

  describe('trackPerformance()', () => {
    it('should POST track for sprint', () => {
      apiSpy.post.and.returnValue(of({ success: true, tracked: 5, total: 5 }));
      service.trackPerformance('s1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/track`, {});
    });
  });

  describe('cancelSprint()', () => {
    it('should POST cancel for sprint', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.cancelSprint('s1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/cancel`, {});
    });
  });

  describe('deleteSprint()', () => {
    it('should DELETE sprint', () => {
      apiSpy.delete.and.returnValue(of({ success: true }));
      service.deleteSprint('s1').subscribe();
      expect(apiSpy.delete).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1`);
    });
  });

  describe('getCosts()', () => {
    it('should GET costs', () => {
      apiSpy.get.and.returnValue(of({ success: true, costs: {} }));
      service.getCosts().subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.ENGINE_COSTS);
    });
  });

  describe('getUsage()', () => {
    it('should GET usage', () => {
      apiSpy.get.and.returnValue(of({ success: true, usage: {} }));
      service.getUsage().subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.ENGINE_USAGE);
    });
  });

  describe('getTemplates()', () => {
    it('should GET templates', () => {
      apiSpy.get.and.returnValue(of({ success: true, templates: [] }));
      service.getTemplates().subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.ENGINE_TEMPLATES);
    });
  });

  describe('getAnalytics()', () => {
    it('should GET analytics', () => {
      apiSpy.get.and.returnValue(of({ success: true, analytics: {} }));
      service.getAnalytics().subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.ENGINE_ANALYTICS);
    });
  });

  describe('duplicateSprint()', () => {
    it('should POST duplicate with optional name', () => {
      apiSpy.post.and.returnValue(of({ success: true, sprint_id: 's2', name: 'Copy' }));
      service.duplicateSprint('s1', 'Copy').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/duplicate`, { name: 'Copy' });
    });

    it('should POST duplicate without name', () => {
      apiSpy.post.and.returnValue(of({ success: true, sprint_id: 's2', name: 'Sprint 1 (copy)' }));
      service.duplicateSprint('s1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_SPRINT}/s1/duplicate`, { name: undefined });
    });
  });

  describe('editAsset()', () => {
    it('should POST edit with edits object', () => {
      apiSpy.post.and.returnValue(of({ success: true, asset_id: 'a1' }));
      service.editAsset('a1', { headline: 'New Headline' }).subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(`${environment.ENGINE_ASSET}/a1/edit`, { headline: 'New Headline' });
    });
  });
});
