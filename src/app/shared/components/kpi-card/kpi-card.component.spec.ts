import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { KpiCardComponent } from './kpi-card.component';

describe('KpiCardComponent', () => {
  let component: KpiCardComponent;
  let fixture: ComponentFixture<KpiCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KpiCardComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiCardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    component.title = 'Spend';
    component.value = 100;
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display the title', () => {
    component.title = 'Total Spend';
    component.value = 0;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Total Spend');
  });

  it('should format value with suffix', () => {
    component.title = 'CTR';
    component.value = 4.5;
    component.suffix = '%';
    expect(component.formattedValue).toBe('4.5%');
  });

  it('should format value without suffix', () => {
    component.title = 'Count';
    component.value = 42;
    component.suffix = '';
    expect(component.formattedValue).toBe('42');
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

  it('should return default valueColor', () => {
    component.color = 'default';
    expect(component.valueColor).toBe('text-navy');
  });

  it('should return correct sparklineColor', () => {
    component.color = 'green';
    expect(component.sparklineColor).toBe('bg-green-200');
    component.color = 'default';
    expect(component.sparklineColor).toBe('bg-accent/20');
  });

  it('should normalize sparkline data', () => {
    component.sparkline = [10, 20, 30, 40, 50];
    const normalized = component.normalizedSparkline;
    expect(normalized.length).toBe(5);
    expect(normalized[0]).toBe(20); // min maps to 20
    expect(normalized[4]).toBe(100); // max maps to 100
  });

  it('should return empty array for empty sparkline', () => {
    component.sparkline = [];
    expect(component.normalizedSparkline).toEqual([]);
  });

  it('should display subtitle when provided', () => {
    component.title = 'Spend';
    component.value = 0;
    component.subtitle = 'vs last period';
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('vs last period');
  });

  it('should animate value on init', fakeAsync(() => {
    component.title = 'Test';
    component.value = 100;
    fixture.detectChanges(); // triggers ngOnInit
    tick(1000); // wait for animation
    expect(component.displayValue()).toBe(100);
  }));

  it('should handle zero value without animation', () => {
    component.title = 'Test';
    component.value = 0;
    fixture.detectChanges();
    expect(component.displayValue()).toBe(0);
  });
});
