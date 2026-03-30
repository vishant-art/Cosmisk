import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { BrandService } from './brand.service';
import { ApiService } from './api.service';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

describe('BrandService', () => {
  let service: BrandService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  const mockBrandsResponse = {
    brands: [
      { brand_name: 'Brand A', project_count: 3, client_codes: ['A1'], latest_status: 'active' },
      { brand_name: 'Brand B', project_count: 1, client_codes: ['B1'], latest_status: 'active' },
    ],
  };

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
    apiSpy.get.and.returnValue(of(mockBrandsResponse));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
      ],
    });
    service = TestBed.inject(BrandService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load brands on construction', () => {
    expect(apiSpy.get).toHaveBeenCalledWith(environment.BRANDS_LIST);
    expect(service.allBrands().length).toBe(2);
    expect(service.allBrands()[0].name).toBe('Brand A');
    expect(service.allBrands()[0].activeCampaigns).toBe(3);
  });

  it('should set the first brand as active', () => {
    expect(service.currentBrand()).toBeTruthy();
    expect(service.currentBrand()!.name).toBe('Brand A');
  });

  it('should set loading to false after loading', () => {
    expect(service.loading()).toBeFalse();
  });

  describe('brandCount', () => {
    it('should return the number of brands', () => {
      expect(service.brandCount()).toBe(2);
    });
  });

  describe('switchBrand', () => {
    it('should switch to a brand by id', () => {
      service.switchBrand('brand-1');
      expect(service.currentBrand()!.name).toBe('Brand B');
    });

    it('should not change if brand id not found', () => {
      service.switchBrand('nonexistent');
      expect(service.currentBrand()!.name).toBe('Brand A');
    });
  });

  describe('getBrandById', () => {
    it('should return the brand with matching id', () => {
      const brand = service.getBrandById('brand-0');
      expect(brand).toBeTruthy();
      expect(brand!.name).toBe('Brand A');
    });

    it('should return undefined for unknown id', () => {
      expect(service.getBrandById('nonexistent')).toBeUndefined();
    });
  });

  describe('loadBrands error', () => {
    it('should set loading to false on error', () => {
      apiSpy.get.and.returnValue(throwError(() => new Error('Network error')));
      service.loadBrands();
      expect(service.loading()).toBeFalse();
    });
  });

  describe('loadBrands empty response', () => {
    it('should handle empty brands array', () => {
      apiSpy.get.and.returnValue(of({ brands: [] }));
      service.loadBrands();
      expect(service.loading()).toBeFalse();
    });
  });
});
