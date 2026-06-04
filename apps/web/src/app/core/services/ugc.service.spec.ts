import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { UgcService } from './ugc.service';
import { ApiService } from './api.service';
import { AdAccountService } from './ad-account.service';
import { environment } from '../../../environments/environment';

describe('UgcService', () => {
  let service: UgcService;
  let apiSpy: jasmine.SpyObj<ApiService>;
  let adAccountSpy: jasmine.SpyObj<AdAccountService>;

  const mockAccount = {
    id: 'act_123',
    account_id: '123',
    name: 'Test Account',
    business_name: 'Test Biz',
    status: 'active' as const,
    currency: 'INR',
    credential_group: 'system' as const,
  };

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
    adAccountSpy = jasmine.createSpyObj('AdAccountService', ['currentAccount', 'loadAccounts'], {
      currentAccount: jasmine.createSpy().and.returnValue(mockAccount),
    });
    // Override the currentAccount to be a callable spy that returns mockAccount
    (adAccountSpy as any).currentAccount = jasmine.createSpy('currentAccount').and.returnValue(mockAccount);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        UgcService,
        { provide: ApiService, useValue: apiSpy },
        { provide: AdAccountService, useValue: adAccountSpy },
      ],
    });

    service = TestBed.inject(UgcService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getProjects()', () => {
    it('should GET projects list', () => {
      const mockProjects = { projects: [{ id: 'p1', name: 'Project 1', brand_name: 'Brand', status: 'active', created_at: '' }] };
      apiSpy.get.and.returnValue(of(mockProjects));

      service.getProjects().subscribe((res) => {
        expect(res.projects.length).toBe(1);
      });
      expect(apiSpy.get).toHaveBeenCalledWith(environment.UGC_PROJECTS);
    });
  });

  describe('getProjectDetail()', () => {
    it('should POST project detail request', () => {
      apiSpy.post.and.returnValue(of({ id: 'p1', name: 'Project 1' }));

      service.getProjectDetail('p1').subscribe();
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_PROJECT_DETAIL, { project_id: 'p1' });
    });
  });

  describe('getConcepts()', () => {
    it('should GET concepts with project_id param', () => {
      apiSpy.get.and.returnValue(of({ concepts: [] }));
      service.getConcepts('p1').subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.UGC_CONCEPTS, { project_id: 'p1' });
    });
  });

  describe('getScripts()', () => {
    it('should GET scripts with project_id param', () => {
      apiSpy.get.and.returnValue(of({ scripts: [] }));
      service.getScripts('p1').subscribe();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.UGC_SCRIPTS, { project_id: 'p1' });
    });
  });

  describe('onboardProject()', () => {
    it('should POST onboard with brief and ad account data', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      const brief = {
        brand_name: 'Test Brand',
        product_feature: 'Great product',
        target_user: 'Young adults',
        website_url: 'https://test.com',
        competitors: ['comp1'],
        num_scripts: 4,
      };

      service.onboardProject(brief);

      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_ONBOARD, jasmine.objectContaining({
        name: 'Test Brand',
        brand_name: 'Test Brand',
        account_id: 'act_123',
        credential_group: 'system',
        currency: 'INR',
        num_concepts: 4,
        brief: {
          product_description: 'Great product',
          target_audience: 'Young adults',
          brand_name: 'Test Brand',
          website_url: 'https://test.com',
          competitors: ['comp1'],
        },
      }));
    });

    it('should use defaults when brief fields are missing', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      const brief: Record<string, unknown> = {};

      service.onboardProject(brief);

      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_ONBOARD, jasmine.objectContaining({
        name: 'New Project',
        num_concepts: 6,
      }));
    });

    it('should handle null ad account', () => {
      adAccountSpy.currentAccount.and.returnValue(null);
      apiSpy.post.and.returnValue(of({ success: true }));

      service.onboardProject({ brand_name: 'Test' });

      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_ONBOARD, jasmine.objectContaining({
        account_id: undefined,
        currency: 'INR',
      }));
    });
  });

  describe('writeScripts()', () => {
    it('should POST write scripts with project and account data', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.writeScripts('p1');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_WRITE_SCRIPTS, {
        project_id: 'p1',
        account_id: 'act_123',
        currency: 'INR',
      });
    });
  });

  describe('approveConcepts()', () => {
    it('should POST pm_approve action', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.approveConcepts('p1', ['c1', 'c2'], 'Looks good');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_APPROVE, {
        project_id: 'p1',
        action: 'pm_approve',
        concept_ids: ['c1', 'c2'],
        notes: 'Looks good',
      });
    });
  });

  describe('clientApproveConcepts()', () => {
    it('should POST client_approve action', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.clientApproveConcepts('p1', ['c1']);
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_APPROVE, {
        project_id: 'p1',
        action: 'client_approve',
        concept_ids: ['c1'],
      });
    });
  });

  describe('rejectConcepts()', () => {
    it('should POST pm_reject action with feedback', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.rejectConcepts('p1', ['c1'], 'Needs rework');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_APPROVE, {
        project_id: 'p1',
        action: 'pm_reject',
        concept_ids: ['c1'],
        feedback: 'Needs rework',
      });
    });
  });

  describe('deliverScripts()', () => {
    it('should POST deliver with approve action', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.deliverScripts('p1');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_DELIVER, {
        project_id: 'p1',
        action: 'approve',
      });
    });
  });

  describe('sendToClient()', () => {
    it('should POST deliver with send_to_client action', () => {
      apiSpy.post.and.returnValue(of({ success: true }));
      service.sendToClient('p1');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.UGC_DELIVER, {
        project_id: 'p1',
        action: 'send_to_client',
      });
    });
  });
});
