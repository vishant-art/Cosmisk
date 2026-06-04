import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BrandSwitcherComponent } from './brand-switcher.component';
import { BrandService } from '../../../core/services/brand.service';

describe('BrandSwitcherComponent', () => {
  let component: BrandSwitcherComponent;
  let fixture: ComponentFixture<BrandSwitcherComponent>;
  let brandServiceSpy: jasmine.SpyObj<BrandService>;

  const mockBrands = [
    { id: 'b1', name: 'Oud Arabia', roas: 3.5, alertCount: 2 },
    { id: 'b2', name: 'Pratap Sons', roas: 2.1, alertCount: 0 },
    { id: 'b3', name: 'Test Brand', roas: 1.0, alertCount: 0 },
  ];

  beforeEach(async () => {
    brandServiceSpy = jasmine.createSpyObj(
      'BrandService',
      ['switchBrand'],
      {
        currentBrand: jasmine.createSpy().and.returnValue({ id: 'b1', name: 'Oud Arabia' }),
        allBrands: jasmine.createSpy().and.returnValue(mockBrands),
      }
    );

    await TestBed.configureTestingModule({
      imports: [BrandSwitcherComponent, RouterTestingModule],
    })
      .overrideProvider(BrandService, { useValue: brandServiceSpy })
      .compileComponents();

    fixture = TestBed.createComponent(BrandSwitcherComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with dropdown closed', () => {
    expect(component.open()).toBeFalse();
  });

  it('should start with empty search term', () => {
    expect(component.searchTerm()).toBe('');
  });

  it('should toggle dropdown', () => {
    component.open.set(true);
    expect(component.open()).toBeTrue();
  });

  it('should update search term on search', () => {
    const mockEvent = { target: { value: 'oud' } } as unknown as Event;
    component.onSearch(mockEvent);
    expect(component.searchTerm()).toBe('oud');
  });

  it('should select brand and close dropdown', () => {
    component.open.set(true);
    component.selectBrand('b2');
    expect(brandServiceSpy.switchBrand).toHaveBeenCalledWith('b2');
    expect(component.open()).toBeFalse();
    expect(component.searchTerm()).toBe('');
  });

  it('should filter brands by search term', () => {
    component.searchTerm.set('oud');
    const filtered = component.filteredBrands();
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('Oud Arabia');
  });

  it('should return all brands when search is empty', () => {
    component.searchTerm.set('');
    const filtered = component.filteredBrands();
    expect(filtered.length).toBe(3);
  });

  it('should return empty when no match', () => {
    component.searchTerm.set('nonexistent');
    const filtered = component.filteredBrands();
    expect(filtered.length).toBe(0);
  });

  it('should return green class for ROAS >= 3', () => {
    expect(component.getRoasClass(3.5)).toContain('text-green-400');
  });

  it('should return yellow class for ROAS >= 2 but < 3', () => {
    expect(component.getRoasClass(2.5)).toContain('text-yellow-400');
  });

  it('should return red class for ROAS < 2', () => {
    expect(component.getRoasClass(1.0)).toContain('text-red-400');
  });

  it('should return red class for undefined ROAS', () => {
    expect(component.getRoasClass(undefined)).toContain('text-red-400');
  });
});
