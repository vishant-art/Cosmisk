import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusBadgeComponent } from './status-badge.component';

describe('StatusBadgeComponent', () => {
  let component: StatusBadgeComponent;
  let fixture: ComponentFixture<StatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBadgeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    component.status = 'stable';
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should capitalize the status label', () => {
    component.status = 'winning';
    fixture.detectChanges();
    expect(component.label).toBe('Winning');
  });

  it('should return correct dot class for winning', () => {
    component.status = 'winning';
    expect(component.dotClass).toBe('bg-green-500');
  });

  it('should return correct dot class for stable', () => {
    component.status = 'stable';
    expect(component.dotClass).toBe('bg-gray-400');
  });

  it('should return correct dot class for fatiguing', () => {
    component.status = 'fatiguing';
    expect(component.dotClass).toBe('bg-red-500');
  });

  it('should return correct dot class for new', () => {
    component.status = 'new';
    expect(component.dotClass).toBe('bg-blue-500');
  });

  it('should return correct text class for winning', () => {
    component.status = 'winning';
    expect(component.textClass).toBe('text-green-700');
  });

  it('should return correct text class for fatiguing', () => {
    component.status = 'fatiguing';
    expect(component.textClass).toBe('text-red-600');
  });

  it('should render the label text in the template', () => {
    component.status = 'new';
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('New');
  });
});
