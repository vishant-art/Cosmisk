import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrandSwitcherComponent } from './brand-switcher.component';
import { BrandService } from '../../../core/services/brand.service';

describe('BrandSwitcherComponent', () => {
  let component: BrandSwitcherComponent;
  let fixture: ComponentFixture<BrandSwitcherComponent>;
  let mockBrandService: any;

  beforeEach(async () => {
    mockBrandService = {
      currentBrand: signal({ id: 'b1', name: 'Acme Corp', category: 'D2C', status: 'active' as const }),
      allBrands: signal([
        { id: 'b1', name: 'Acme Corp', category: 'D2C', status: 'active' as const, roas: 3.5, alertCount: 0 },
        { id: 'b2', name: 'Beta Brand', category: 'D2C', status: 'active' as const, roas: 1.5, alertCount: 2 },
      ]),
      switchBrand: jasmine.createSpy('switchBrand'),
    };

    await TestBed.configureTestingModule({
      imports: [BrandSwitcherComponent],
      providers: [{ provide: BrandService, useValue: mockBrandService }],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .overrideComponent(BrandSwitcherComponent, { set: { imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA] } })
    .compileComponents();
    fixture = TestBed.createComponent(BrandSwitcherComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => { fixture.detectChanges(); expect(component).toBeTruthy(); });
  it('should start closed', () => { expect(component.open()).toBeFalse(); });
  it('should display current brand', () => { fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Acme Corp'); });
  it('should show fallback when no brand', () => {
    mockBrandService.currentBrand.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Select Brand');
  });
  it('should toggle dropdown', () => { fixture.detectChanges(); fixture.nativeElement.querySelector('button').click(); expect(component.open()).toBeTrue(); });
  it('should filter brands', () => { component.searchTerm.set('acme'); expect(component.filteredBrands().length).toBe(1); });
  it('should return all brands when empty', () => { component.searchTerm.set(''); expect(component.filteredBrands().length).toBe(2); });
  it('should switch brand', () => { component.open.set(true); component.selectBrand('b2'); expect(mockBrandService.switchBrand).toHaveBeenCalledWith('b2'); expect(component.open()).toBeFalse(); });
  it('should update search', () => { component.onSearch({ target: { value: 'beta' } } as any); expect(component.searchTerm()).toBe('beta'); });
  it('should return correct roas class high', () => { expect(component.getRoasClass(3.5)).toContain('text-green-400'); });
  it('should return correct roas class medium', () => { expect(component.getRoasClass(2.5)).toContain('text-yellow-400'); });
  it('should return correct roas class low', () => { expect(component.getRoasClass(1.0)).toContain('text-red-400'); });
  it('should return correct roas class undefined', () => { expect(component.getRoasClass(undefined)).toContain('text-red-400'); });
  it('should display brand initial', () => { fixture.detectChanges(); const a = fixture.nativeElement.querySelector('.rounded-full.bg-accent'); expect(a?.textContent?.trim()).toBe('A'); });
});
