import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { KpiCardComponent } from './kpi-card.component';

describe('KpiCardComponent', () => {
  let component: KpiCardComponent;
  let fixture: ComponentFixture<KpiCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KpiCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiCardComponent);
    component = fixture.componentInstance;
    component.title = 'Spend';
    component.value = 0;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept required title input', () => {
    component.title = 'ROAS';
    expect(component.title).toBe('ROAS');
  });

  it('should accept required value input', () => {
    component.value = 42;
    expect(component.value).toBe(42);
  });

  it('should default isCurrency to false', () => {
    expect(component.isCurrency).toBeFalse();
  });

  it('should default suffix to empty string', () => {
    expect(component.suffix).toBe('');
  });

  it('should default color to default', () => {
    expect(component.color).toBe('default');
  });

  it('should return correct valueColor for green', () => {
    component.color = 'green';
    expect(component.valueColor).toBe('text-green-600');
  });

  it('should return correct valueColor for yellow', () => {
    component.color = 'yellow';
    expect(component.valueColor).toBe('text-yellow-600');
  });

  it('should return correct valueColor for red', () => {
    component.color = 'red';
    expect(component.valueColor).toBe('text-red-600');
  });

  it('should return correct valueColor for default', () => {
    component.color = 'default';
    expect(component.valueColor).toBe('text-navy');
  });

  it('should return correct sparklineColor for green', () => {
    component.color = 'green';
    expect(component.sparklineColor).toBe('bg-green-200');
  });

  it('should return correct sparklineColor for default', () => {
    component.color = 'default';
    expect(component.sparklineColor).toBe('bg-accent/20');
  });

  it('should format value with suffix', () => {
    component.value = 3.5;
    component.suffix = 'x';
    expect(component.formattedValue).toBe('3.5x');
  });

  it('should format value without suffix', () => {
    component.value = 100;
    component.suffix = '';
    expect(component.formattedValue).toBe('100');
  });

  it('should normalize sparkline data', () => {
    component.sparkline = [10, 20, 30, 40, 50];
    const normalized = component.normalizedSparkline;
    expect(normalized.length).toBe(5);
    // Min should map to 20, max should map to 100
    expect(normalized[0]).toBe(20);
    expect(normalized[4]).toBe(100);
  });

  it('should return empty array for empty sparkline', () => {
    component.sparkline = [];
    expect(component.normalizedSparkline).toEqual([]);
  });

  it('should handle sparkline with all same values', () => {
    component.sparkline = [5, 5, 5];
    const normalized = component.normalizedSparkline;
    expect(normalized.length).toBe(3);
    // range is 0, so range becomes 1, all values map to (0/1)*80+20 = 20
    normalized.forEach(v => expect(v).toBe(20));
  });

  it('should animate to value on init', fakeAsync(() => {
    component.value = 100;
    component.ngOnInit();
    tick(1000); // let animation complete
    expect(component.displayValue()).toBe(100);
    expect(component.displayCurrencyValue()).toBe(100);
  }));

  it('should set display to 0 when value is 0', () => {
    component.value = 0;
    component.ngOnInit();
    expect(component.displayValue()).toBe(0);
    expect(component.displayCurrencyValue()).toBe(0);
  });
});
