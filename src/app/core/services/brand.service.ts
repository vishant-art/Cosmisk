import { Injectable, signal, computed } from '@angular/core';
import { Brand } from '../models/brand.model';
import { DEMO_BRAND, DEMO_AGENCY_BRANDS } from '../../shared/data/demo-data';

@Injectable({ providedIn: 'root' })
export class BrandService {
  private activeBrand = signal<Brand>(DEMO_BRAND);
  private brands = signal<Brand[]>(DEMO_AGENCY_BRANDS);

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
}
