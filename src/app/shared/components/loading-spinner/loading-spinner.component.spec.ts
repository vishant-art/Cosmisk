import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoadingSpinnerComponent } from './loading-spinner.component';

describe('LoadingSpinnerComponent', () => {
  let component: LoadingSpinnerComponent;
  let fixture: ComponentFixture<LoadingSpinnerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingSpinnerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingSpinnerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render a spinning div', () => {
    const el: HTMLElement = fixture.nativeElement;
    const spinner = el.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('should have a container with centering classes', () => {
    const el: HTMLElement = fixture.nativeElement;
    const container = el.querySelector('.flex.items-center.justify-center');
    expect(container).toBeTruthy();
  });
});
