import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CreativeStudioService } from './creative-studio.service';
import { environment } from '../../../environments/environment';

describe('CreativeStudioService', () => {
  let svc: CreativeStudioService; let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(CreativeStudioService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('generate forwards direction', () => {
    svc.generate({ brand_name: 'X', product_name: 'Y', product_description: 'Z', target_audience: 'A' }, ['1:1'], { direction: 'cozy' }).subscribe();
    const req = http.expectOne(`${environment.API_BASE_URL}/creative-studio/generate`);
    expect(req.request.body.direction).toBe('cozy'); req.flush({ success: true, generation_id: 'g' });
  });

  it('markPublished hits the variant route', () => {
    svc.markPublished('v1', '2384').subscribe();
    const req = http.expectOne(`${environment.API_BASE_URL}/creative-studio/variants/v1/published`);
    expect(req.request.body).toEqual({ meta_ad_id: '2384' }); req.flush({ success: true, status: 'published' });
  });
});
