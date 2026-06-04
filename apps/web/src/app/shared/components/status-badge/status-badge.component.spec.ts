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
    expect(component).toBeTruthy();
  });

  it('should default status to stable', () => {
    expect(component.status).toBe('stable');
  });

  it('should capitalize label', () => {
    component.status = 'winning';
    expect(component.label).toBe('Winning');

    component.status = 'fatiguing';
    expect(component.label).toBe('Fatiguing');

    component.status = 'new';
    expect(component.label).toBe('New');

    component.status = 'stable';
    expect(component.label).toBe('Stable');
  });

  it('should return correct dotClass for winning', () => {
    component.status = 'winning';
    expect(component.dotClass).toBe('bg-green-500');
  });

  it('should return correct dotClass for stable', () => {
    component.status = 'stable';
    expect(component.dotClass).toBe('bg-gray-400');
  });

  it('should return correct dotClass for fatiguing', () => {
    component.status = 'fatiguing';
    expect(component.dotClass).toBe('bg-red-500');
  });

  it('should return correct dotClass for new', () => {
    component.status = 'new';
    expect(component.dotClass).toBe('bg-blue-500');
  });

  it('should return correct textClass for winning', () => {
    component.status = 'winning';
    expect(component.textClass).toBe('text-green-700');
  });

  it('should return correct textClass for stable', () => {
    component.status = 'stable';
    expect(component.textClass).toBe('text-gray-600');
  });

  it('should return correct textClass for fatiguing', () => {
    component.status = 'fatiguing';
    expect(component.textClass).toBe('text-red-600');
  });

  it('should return correct textClass for new', () => {
    component.status = 'new';
    expect(component.textClass).toBe('text-blue-600');
  });
});
