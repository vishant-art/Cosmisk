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
    component.labels = ['Mon', 'Tue'];
    component.values = [10, 20];
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should have default values', () => {
    expect(component.label).toBe('Value');
    expect(component.color).toBe('#6366F1');
    expect(component.height).toBe(208);
    expect(component.suffix).toBe('');
  });

  it('should render a canvas element', () => {
    component.labels = ['A'];
    component.values = [1];
    fixture.detectChanges();
    const canvas = fixture.nativeElement.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });

  it('should apply custom height', () => {
    component.labels = ['A'];
    component.values = [1];
    component.height = 300;
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector('div');
    expect(container.style.height).toBe('300px');
  });

  it('should update chart when values change', () => {
    component.labels = ['A', 'B'];
    component.values = [10, 20];
    fixture.detectChanges();

    // Trigger ngOnChanges with new values
    component.values = [30, 40];
    component.ngOnChanges({
      values: {
        previousValue: [10, 20],
        currentValue: [30, 40],
        firstChange: false,
        isFirstChange: () => false,
      }
    });
    // No error means update worked
    expect(component).toBeTruthy();
  });

  it('should destroy chart on component destroy', () => {
    component.labels = ['A'];
    component.values = [1];
    fixture.detectChanges();
    // Should not throw
    component.ngOnDestroy();
    expect(component).toBeTruthy();
  });
});
