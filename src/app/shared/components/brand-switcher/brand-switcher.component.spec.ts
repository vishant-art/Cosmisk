import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BrandSwitcherComponent } from './brand-switcher.component';
import { BrandService } from '../../../core/services/brand.service';
import { signal } from '@angular/core';

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
      providers: [
        { provide: BrandService, useValue: mockBrandService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(BrandSwitcherComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should start with dropdown closed', () => {
    expect(component.open()).toBeFalse();
  });

  it('should display current brand name', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Acme Corp');
  });

  it('should show fallback when no brand is selected', () => {
    mockBrandService.currentBrand = signal(null);
    fixture = TestBed.createComponent(BrandSwitcherComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Select Brand');
  });

  it('should toggle dropdown', () => {
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button');
    button.click();
    expect(component.open()).toBeTrue();
  });

  it('should filter brands by search term', () => {
    component.searchTerm.set('acme');
    const filtered = component.filteredBrands();
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('Acme Corp');
  });

  it('should return all brands when search is empty', () => {
    component.searchTerm.set('');
    expect(component.filteredBrands().length).toBe(2);
  });

  it('should switch brand and close dropdown', () => {
    component.open.set(true);
    component.selectBrand('b2');
    expect(mockBrandService.switchBrand).toHaveBeenCalledWith('b2');
    expect(component.open()).toBeFalse();
    expect(component.searchTerm()).toBe('');
  });

  it('should update searchTerm on input', () => {
    const mockEvent = { target: { value: 'beta' } } as any;
    component.onSearch(mockEvent);
    expect(component.searchTerm()).toBe('beta');
  });

  it('should return correct roas class for high roas', () => {
    expect(component.getRoasClass(3.5)).toContain('text-green-400');
  });

  it('should return correct roas class for medium roas', () => {
    expect(component.getRoasClass(2.5)).toContain('text-yellow-400');
  });

  it('should return correct roas class for low roas', () => {
    expect(component.getRoasClass(1.0)).toContain('text-red-400');
  });

  it('should return correct roas class for undefined', () => {
    expect(component.getRoasClass(undefined)).toContain('text-red-400');
  });

  it('should display brand initial in avatar', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const avatar = el.querySelector('.rounded-full.bg-accent');
    expect(avatar?.textContent?.trim()).toBe('A');
  });
});
