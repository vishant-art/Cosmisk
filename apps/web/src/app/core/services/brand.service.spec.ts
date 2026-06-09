import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { BrandService } from './brand.service';
import { ApiService } from './api.service';

describe('BrandService', () => {
  let service: BrandService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  const mockBrandsResponse = {
    brands: [
      { brand_name: 'Acme Corp', project_count: 3, client_codes: ['AC'], latest_status: 'active' },
      { brand_name: 'Beta Inc', project_count: 1, client_codes: ['BI'], latest_status: 'active' },
    ],
  };

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
    apiSpy.get.and.returnValue(of(mockBrandsResponse));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        BrandService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    service = TestBed.inject(BrandService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadBrands()', () => {
    it('should load and map brands from API on construction', () => {
      expect(apiSpy.get).toHaveBeenCalled();
      expect(service.allBrands().length).toBe(2);
      expect(service.allBrands()[0].name).toBe('Acme Corp');
      expect(service.allBrands()[0].activeCampaigns).toBe(3);
      expect(service.allBrands()[0].status).toBe('active');
      expect(service.loading()).toBeFalse();
    });

    it('should set the first brand as active', () => {
      expect(service.currentBrand()).toBeTruthy();
      expect(service.currentBrand()!.name).toBe('Acme Corp');
    });

    it('should compute brandCount correctly', () => {
      expect(service.brandCount()).toBe(2);
    });

    it('should handle empty brands response', () => {
      apiSpy.get.and.returnValue(of({ brands: [] }));
      service.loadBrands();
      // brands remain from initial load since empty array doesn't enter the if block
      // but loading should be false
      expect(service.loading()).toBeFalse();
    });

    it('should handle API error gracefully', () => {
      apiSpy.get.and.returnValue(throwError(() => new Error('Network error')));
      service.loadBrands();
      expect(service.loading()).toBeFalse();
    });
  });

  describe('switchBrand()', () => {
    it('should switch to the specified brand', () => {
      const brands = service.allBrands();
      service.switchBrand(brands[1].id);
      expect(service.currentBrand()!.name).toBe('Beta Inc');
    });

    it('should do nothing if brand ID not found', () => {
      const currentBefore = service.currentBrand();
      service.switchBrand('nonexistent-id');
      expect(service.currentBrand()).toEqual(currentBefore);
    });
  });

  describe('getBrandById()', () => {
    it('should return the brand with matching ID', () => {
      const brands = service.allBrands();
      const found = service.getBrandById(brands[0].id);
      expect(found).toBeTruthy();
      expect(found!.name).toBe('Acme Corp');
    });

    it('should return undefined for unknown ID', () => {
      const found = service.getBrandById('unknown');
      expect(found).toBeUndefined();
    });
  });
});
