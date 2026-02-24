import { Injectable, signal, computed, inject } from '@angular/core';
import { Brand } from '../models/brand.model';
import { DEMO_BRAND, DEMO_AGENCY_BRANDS } from '../../shared/data/demo-data';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

interface BrandsApiResponse {
  brands: Array<{
    brand_name: string;
    project_count: number;
    client_codes: string[];
    latest_status: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class BrandService {
  private api = inject(ApiService);
  private activeBrand = signal<Brand>(DEMO_BRAND);
  private brands = signal<Brand[]>(DEMO_AGENCY_BRANDS);

  constructor() {
    this.loadBrands();
  }

  currentBrand = this.activeBrand.asReadonly();
  allBrands = this.brands.asReadonly();
  brandCount = computed(() => this.brands().length);

  switchBrand(brandId: string) {
    const brand = this.brands().find(b => b.id === brandId);
    if (brand) {
      this.activeBrand.set(brand);
    }
  }

  getBrandById(id: string): Brand | undefined {
    return this.brands().find(b => b.id === id);
  }

  loadBrands() {
    this.api.get<BrandsApiResponse>(environment.BRANDS_LIST).subscribe({
      next: (res) => {
        if (res.brands?.length) {
          const mapped: Brand[] = res.brands.map((b, i) => ({
            id: `brand-${i}`,
            name: b.brand_name,
            category: 'UGC',
            status: 'active' as const,
            activeCampaigns: b.project_count,
          }));
          this.brands.set(mapped);
          this.activeBrand.set(mapped[0]);
        }
      },
      error: () => {
        // Keep demo data on failure
      },
    });
  }
}
