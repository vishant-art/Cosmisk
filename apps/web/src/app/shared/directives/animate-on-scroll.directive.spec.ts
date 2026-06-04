import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnimateOnScrollDirective } from './animate-on-scroll.directive';

// --- Test host components ---

@Component({
  standalone: true,
  imports: [AnimateOnScrollDirective],
  template: '<div appAnimateOnScroll id="target">Content</div>',
})
class BasicHostComponent {}

@Component({
  standalone: true,
  imports: [AnimateOnScrollDirective],
  template: '<div appAnimateOnScroll [aosDelay]="300" id="delayed">Delayed</div>',
})
class DelayedHostComponent {}

// --- Mock IntersectionObserver ---

let observerCallback: IntersectionObserverCallback;
let observerOptions: IntersectionObserverInit | undefined;
let observedElements: Element[] = [];
let disconnectSpy: jasmine.Spy;

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    observerCallback = callback;
    observerOptions = options;
    disconnectSpy = jasmine.createSpy('disconnect');
    this.disconnect = disconnectSpy;
  }

  observe(el: Element) {
    observedElements.push(el);
  }

  unobserve(_el: Element) {}

  disconnect: jasmine.Spy | (() => void) = () => {};
}

describe('AnimateOnScrollDirective', () => {
  const originalIO = (window as any).IntersectionObserver;

  beforeEach(() => {
    observedElements = [];
    (window as any).IntersectionObserver = MockIntersectionObserver;
  });

  afterEach(() => {
    (window as any).IntersectionObserver = originalIO;
  });

  // --- Basic creation ---

  it('should create the directive on the host element', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#target') as HTMLElement;
    expect(target).toBeTruthy();
  });

  it('should observe the host element after view init', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#target') as HTMLElement;
    expect(observedElements).toContain(target);
  });

  it('should use threshold of 0.15', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    expect(observerOptions?.threshold).toBe(0.15);
  });

  // --- AOS delay ---

  it('should set transitionDelay when aosDelay is provided', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [DelayedHostComponent],
    }).createComponent(DelayedHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#delayed') as HTMLElement;
    expect(target.style.transitionDelay).toBe('300ms');
  });

  it('should not set transitionDelay when aosDelay is 0 (default)', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#target') as HTMLElement;
    expect(target.style.transitionDelay).toBe('');
  });

  // --- Intersection behavior ---

  it('should add aos-visible class when element is intersecting', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#target') as HTMLElement;

    // Simulate intersection
    observerCallback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    expect(target.classList.contains('aos-visible')).toBeTrue();
  });

  it('should not add aos-visible class when element is not intersecting', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#target') as HTMLElement;

    observerCallback(
      [{ isIntersecting: false, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    expect(target.classList.contains('aos-visible')).toBeFalse();
  });

  // --- Cleanup ---

  it('should disconnect the observer on destroy', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    fixture.destroy();

    expect(disconnectSpy).toHaveBeenCalled();
  });
});
