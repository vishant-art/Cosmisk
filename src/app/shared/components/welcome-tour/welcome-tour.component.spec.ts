import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { WelcomeTourComponent } from './welcome-tour.component';

describe('WelcomeTourComponent', () => {
  let component: WelcomeTourComponent;
  let fixture: ComponentFixture<WelcomeTourComponent>;
  let mockRouter: any;

  beforeEach(async () => {
    mockRouter = {
      navigate: jasmine.createSpy('navigate'),
    };

    await TestBed.configureTestingModule({
      imports: [WelcomeTourComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(WelcomeTourComponent);
    component = fixture.componentInstance;
    // Clear any localStorage from previous tests
    localStorage.removeItem('cosmisk_tour_seen');
  });

  afterEach(() => {
    localStorage.removeItem('cosmisk_tour_seen');
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should start with visible = false', () => {
    expect(component.visible()).toBeFalse();
  });

  it('should show tour and reset step to 0', () => {
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

  it('should not advance past last step', () => {
    component.show();
    for (let i = 0; i < component.steps.length + 5; i++) {
      component.next();
    }
    expect(component.currentStep()).toBe(component.steps.length - 1);
  });

  it('should go back to previous step', () => {
    component.show();
    component.next();
    component.next();
    component.prev();
    expect(component.currentStep()).toBe(1);
  });

  it('should not go before step 0', () => {
    component.show();
    component.prev();
    expect(component.currentStep()).toBe(0);
  });

  it('should skip tour and save to localStorage', () => {
    component.show();
    component.skip();
    expect(component.visible()).toBeFalse();
    expect(localStorage.getItem('cosmisk_tour_seen')).toBe('true');
  });

  it('should finish tour, save to localStorage and navigate to dashboard', () => {
    component.show();
    component.finish();
    expect(component.visible()).toBeFalse();
    expect(localStorage.getItem('cosmisk_tour_seen')).toBe('true');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/dashboard']);
  });

  it('should have 7 tour steps', () => {
    expect(component.steps.length).toBe(7);
  });

  it('should handle Escape key to skip', () => {
    component.show();
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onKeydown(event);
    expect(component.visible()).toBeFalse();
  });

  it('should handle ArrowRight key to advance', () => {
    component.show();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    component.onKeydown(event);
    expect(component.currentStep()).toBe(1);
  });

  it('should handle ArrowLeft key to go back', () => {
    component.show();
    component.next();
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    component.onKeydown(event);
    expect(component.currentStep()).toBe(0);
  });

  it('should handle Enter key to advance', () => {
    component.show();
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onKeydown(event);
    expect(component.currentStep()).toBe(1);
  });

  it('should not handle keyboard when not visible', () => {
    component.currentStep.set(0);
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    component.onKeydown(event);
    expect(component.currentStep()).toBe(0);
  });

  it('should not render content when not visible', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.fixed')).toBeNull();
  });

  it('should render content when visible', () => {
    component.show();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.fixed')).toBeTruthy();
  });
});
