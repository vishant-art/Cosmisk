import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { WelcomeTourComponent } from './welcome-tour.component';

describe('WelcomeTourComponent', () => {
  let component: WelcomeTourComponent;
  let fixture: ComponentFixture<WelcomeTourComponent>;
  let mockRouter: any;

  beforeEach(async () => {
    mockRouter = { navigate: jasmine.createSpy('navigate') };
    await TestBed.configureTestingModule({
      imports: [WelcomeTourComponent],
      providers: [{ provide: Router, useValue: mockRouter }],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .overrideComponent(WelcomeTourComponent, { set: { imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA] } })
    .compileComponents();
    fixture = TestBed.createComponent(WelcomeTourComponent);
    component = fixture.componentInstance;
    localStorage.removeItem('cosmisk_tour_seen');
  });

  afterEach(() => { localStorage.removeItem('cosmisk_tour_seen'); });

  it('should create', () => { fixture.detectChanges(); expect(component).toBeTruthy(); });
  it('should start hidden', () => { expect(component.visible()).toBeFalse(); });
  it('should show tour at step 0', () => { component.currentStep.set(3); component.show(); expect(component.visible()).toBeTrue(); expect(component.currentStep()).toBe(0); });
  it('should advance step', () => { component.show(); component.next(); expect(component.currentStep()).toBe(1); });
  it('should not exceed last step', () => { component.show(); for (let i = 0; i < 20; i++) component.next(); expect(component.currentStep()).toBe(component.steps.length - 1); });
  it('should go back', () => { component.show(); component.next(); component.next(); component.prev(); expect(component.currentStep()).toBe(1); });
  it('should not go before 0', () => { component.show(); component.prev(); expect(component.currentStep()).toBe(0); });
  it('should skip', () => { component.show(); component.skip(); expect(component.visible()).toBeFalse(); expect(localStorage.getItem('cosmisk_tour_seen')).toBe('true'); });
  it('should finish and navigate', () => { component.show(); component.finish(); expect(component.visible()).toBeFalse(); expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/dashboard']); });
  it('should have 7 steps', () => { expect(component.steps.length).toBe(7); });
  it('should handle Escape', () => { component.show(); component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' })); expect(component.visible()).toBeFalse(); });
  it('should handle ArrowRight', () => { component.show(); component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' })); expect(component.currentStep()).toBe(1); });
  it('should handle ArrowLeft', () => { component.show(); component.next(); component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); expect(component.currentStep()).toBe(0); });
  it('should ignore keyboard when hidden', () => { component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' })); expect(component.currentStep()).toBe(0); });
  it('should not render when hidden', () => { fixture.detectChanges(); expect(fixture.nativeElement.querySelector('.fixed')).toBeNull(); });
  it('should render when visible', () => { component.show(); fixture.detectChanges(); expect(fixture.nativeElement.querySelector('.fixed')).toBeTruthy(); });
});
