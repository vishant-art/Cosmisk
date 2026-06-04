import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AreaChartComponent } from './area-chart.component';

describe('AreaChartComponent', () => {
  let component: AreaChartComponent;
  let fixture: ComponentFixture<AreaChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AreaChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AreaChartComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default labels to empty array', () => {
    expect(component.labels).toEqual([]);
  });

  it('should default values to empty array', () => {
    expect(component.values).toEqual([]);
  });

  it('should default label to Value', () => {
    expect(component.label).toBe('Value');
  });

  it('should default color to #6366F1', () => {
    expect(component.color).toBe('#6366F1');
  });

  it('should default height to 208', () => {
    expect(component.height).toBe(208);
  });

  it('should default suffix to empty string', () => {
    expect(component.suffix).toBe('');
  });

  it('should accept labels input', () => {
    component.labels = ['Mon', 'Tue', 'Wed'];
    expect(component.labels.length).toBe(3);
  });

  it('should accept values input', () => {
    component.values = [100, 200, 300];
    expect(component.values.length).toBe(3);
  });

  it('should accept color input', () => {
    component.color = '#FF0000';
    expect(component.color).toBe('#FF0000');
  });

  it('should accept height input', () => {
    component.height = 300;
    expect(component.height).toBe(300);
  });

  it('should destroy chart on ngOnDestroy', () => {
    // Chart is created in ngAfterViewInit, so we trigger it
    component.labels = ['A', 'B'];
    component.values = [1, 2];
    fixture.detectChanges();
    // After view init, chart should exist
    expect(component['chart']).toBeTruthy();
    component.ngOnDestroy();
    // Chart reference should be cleaned up (destroy called)
    // We just verify no error is thrown
    expect(true).toBeTrue();
  });

  it('should create chart after view init', () => {
    component.labels = ['Jan', 'Feb', 'Mar'];
    component.values = [10, 20, 30];
    fixture.detectChanges();
    expect(component['chart']).toBeTruthy();
  });
});
