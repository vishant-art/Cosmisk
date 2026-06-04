import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { WelcomeTourComponent } from './welcome-tour.component';
import { Router } from '@angular/router';

describe('WelcomeTourComponent', () => {
  let component: WelcomeTourComponent;
  let fixture: ComponentFixture<WelcomeTourComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WelcomeTourComponent, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(WelcomeTourComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);

    // Clear localStorage before each test
    localStorage.removeItem('cosmisk_tour_seen');
  });

  afterEach(() => {
    localStorage.removeItem('cosmisk_tour_seen');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start not visible', () => {
    expect(component.visible()).toBeFalse();
  });

  it('should start at step 0', () => {
    expect(component.currentStep()).toBe(0);
  });

  it('should have tour steps defined', () => {
    expect(component.steps.length).toBeGreaterThan(0);
  });

  it('should show tour and reset to step 0', () => {
    component.currentStep.set(3);
    component.show();
    expect(component.visible()).toBeTrue();
    expect(component.currentStep()).toBe(0);
  });

  it('should advance to next step', () => {
    component.show();
    component.next();
    expect(component.currentStep()).toBe(1);
  });

  it('should not go beyond last step', () => {
    component.show();
    component.currentStep.set(component.steps.length - 1);
    component.next();
    expect(component.currentStep()).toBe(component.steps.length - 1);
  });

  it('should go back to previous step', () => {
    component.show();
    component.currentStep.set(2);
    component.prev();
    expect(component.currentStep()).toBe(1);
  });

  it('should not go below step 0', () => {
    component.show();
    component.currentStep.set(0);
    component.prev();
    expect(component.currentStep()).toBe(0);
  });

  it('should skip tour and set localStorage', () => {
    component.show();
    component.skip();
    expect(component.visible()).toBeFalse();
    expect(localStorage.getItem('cosmisk_tour_seen')).toBe('true');
  });

  it('should finish tour, set localStorage, and navigate', () => {
    spyOn(router, 'navigate');
    component.show();
    component.finish();
    expect(component.visible()).toBeFalse();
    expect(localStorage.getItem('cosmisk_tour_seen')).toBe('true');
    expect(router.navigate).toHaveBeenCalledWith(['/app/dashboard']);
  });

  it('should handle Escape key to skip', () => {
    component.show();
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onKeydown(event);
    expect(component.visible()).toBeFalse();
  });

  it('should handle ArrowRight key to go next', () => {
    component.show();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    component.onKeydown(event);
    expect(component.currentStep()).toBe(1);
  });

  it('should handle Enter key to go next', () => {
    component.show();
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onKeydown(event);
    expect(component.currentStep()).toBe(1);
  });

  it('should handle ArrowLeft key to go back', () => {
    component.show();
    component.currentStep.set(2);
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    component.onKeydown(event);
    expect(component.currentStep()).toBe(1);
  });

  it('should ignore keydown when not visible', () => {
    component.currentStep.set(0);
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    component.onKeydown(event);
    expect(component.currentStep()).toBe(0);
  });
});
