import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { UgcService } from './ugc.service';
import { ApiService } from './api.service';
import { AdAccountService } from './ad-account.service';
import { of, signal } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdAccount } from '../models/ad-account.model';

describe('UgcService', () => {
  let service: UgcService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  const mockAccount: AdAccount = {
    id: 'act_123',
    account_id: '123',
    name: 'Test Account',
    business_name: 'Test Business',
    status: 'active',
    currency: 'USD',
    credential_group: 'system',
  };

  const mockAdAccountService = {
    currentAccount: jasmine.createSpy('currentAccount').and.returnValue(mockAccount),
    allAccounts: jasmine.createSpy('allAccounts').and.returnValue([]),
    loading: jasmine.createSpy('loading').and.returnValue(false),
    accountCount: jasmine.createSpy('accountCount').and.returnValue(0),
    groupedAccounts: jasmine.createSpy('groupedAccounts').and.returnValue([]),
    loadAccounts: jasmine.createSpy('loadAccounts'),
    switchAccount: jasmine.createSpy('switchAccount'),
  };

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
        { provide: AdAccountService, useValue: mockAdAccountService },
      ],
    });
    service = TestBed.inject(UgcService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getProjects', () => {
    it('should call api.get', () => {
      const mockRes = { projects: [{ id: 'p1', name: 'Project 1', brand_name: 'B', status: 'active', created_at: '' }] };
      apiSpy.get.and.returnValue(of(mockRes));
      service.getProjects().subscribe(res => {
        expect(res.projects.length).toBe(1);
      });
      expect(apiSpy.get).toHaveBeenCalledWith(environment.UGC_PROJECTS);
    });
  });

  describe('getProjectDetail', () => {
    it('should call api.post with project_id', () => {
      apiSpy.post.and.returnValue(of({}));
      service.getProjectDetail('p1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_PROJECT_DETAIL, { project_id: 'p1' });
    });
  });

  describe('getConcepts', () => {
    it('should call api.get with project_id param', () => {
      apiSpy.get.and.returnValue(of({ concepts: [] }));
      service.getConcepts('p1').subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.UGC_CONCEPTS, { project_id: 'p1' });
    });
  });

  describe('getScripts', () => {
    it('should call api.get with project_id param', () => {
      apiSpy.get.and.returnValue(of({ scripts: [] }));
      service.getScripts('p1').subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.UGC_SCRIPTS, { project_id: 'p1' });
    });
  });

  describe('onboardProject', () => {
    it('should call api.post with brief and account info', () => {
      const brief: Record<string, unknown> = {
        brand_name: 'TestBrand',
        product_feature: 'Great product',
        target_user: 'Developers',
        website_url: 'https://example.com',
        competitors: ['Comp1'],
        num_scripts: 4,
      };
      apiSpy.post.and.returnValue(of({}));
      service.onboardProject(brief);
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_ONBOARD, jasmine.objectContaining({
        name: 'TestBrand',
        brand_name: 'TestBrand',
        account_id: 'act_123',
        credential_group: 'system',
        currency: 'USD',
        num_concepts: 4,
      }));
    });

    it('should use defaults when brief fields are missing', () => {
      const brief: Record<string, unknown> = {};
      apiSpy.post.and.returnValue(of({}));
      service.onboardProject(brief);
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_ONBOARD, jasmine.objectContaining({
        name: 'New Project',
        num_concepts: 6,
      }));
    });
  });

  describe('writeScripts', () => {
    it('should call api.post with project and account info', () => {
      apiSpy.post.and.returnValue(of({}));
      service.writeScripts('p1');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_WRITE_SCRIPTS, {
        project_id: 'p1',
        account_id: 'act_123',
        currency: 'USD',
      });
    });
  });

  describe('approveConcepts', () => {
    it('should call api.post with pm_approve action', () => {
      apiSpy.post.and.returnValue(of({}));
      service.approveConcepts('p1', ['c1', 'c2'], 'looks good');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_APPROVE, {
        project_id: 'p1',
        action: 'pm_approve',
        concept_ids: ['c1', 'c2'],
        notes: 'looks good',
      });
    });
  });

  describe('clientApproveConcepts', () => {
    it('should call api.post with client_approve action', () => {
      apiSpy.post.and.returnValue(of({}));
      service.clientApproveConcepts('p1', ['c1']);
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_APPROVE, {
        project_id: 'p1',
        action: 'client_approve',
        concept_ids: ['c1'],
      });
    });
  });

  describe('rejectConcepts', () => {
    it('should call api.post with pm_reject action and feedback', () => {
      apiSpy.post.and.returnValue(of({}));
      service.rejectConcepts('p1', ['c1'], 'needs work');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_APPROVE, {
        project_id: 'p1',
        action: 'pm_reject',
        concept_ids: ['c1'],
        feedback: 'needs work',
      });
    });
  });

  describe('deliverScripts', () => {
    it('should call api.post with approve action', () => {
      apiSpy.post.and.returnValue(of({}));
      service.deliverScripts('p1');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_DELIVER, {
        project_id: 'p1',
        action: 'approve',
      });
    });
  });

  describe('sendToClient', () => {
    it('should call api.post with send_to_client action', () => {
      apiSpy.post.and.returnValue(of({}));
      service.sendToClient('p1');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_DELIVER, {
        project_id: 'p1',
        action: 'send_to_client',
      });
    });
  });
});
