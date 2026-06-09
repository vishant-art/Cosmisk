import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CountUpDirective } from './count-up.directive';

// --- Test host components ---

@Component({
  standalone: true,
  imports: [CountUpDirective],
  template: '<span [appCountUp]="\'1,00,000\'" id="target"></span>',
})
class BasicHostComponent {}

@Component({
  standalone: true,
  imports: [CountUpDirective],
  template: '<span [appCountUp]="targetValue" [countDuration]="duration" id="custom"></span>',
})
class CustomHostComponent {
  targetValue = '$500';
  duration = 1000;
}

@Component({
  standalone: true,
  imports: [CountUpDirective],
  template: '<span [appCountUp]="\'no-number-here\'" id="nomatch"></span>',
})
class NoMatchHostComponent {}

@Component({
  standalone: true,
  imports: [CountUpDirective],
  template: '<span [appCountUp]="\'3.14%\'" id="decimal"></span>',
})
class DecimalHostComponent {}

// --- Mock IntersectionObserver ---

let observerCallback: IntersectionObserverCallback;
let observedElements: Element[] = [];
let disconnectSpy: jasmine.Spy;

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
    observerCallback = callback;
    disconnectSpy = jasmine.createSpy('disconnect');
    this.disconnect = disconnectSpy;
  }

  observe(el: Element) {
    observedElements.push(el);
  }

  unobserve(_el: Element) {}

  disconnect: jasmine.Spy | (() => void) = () => {};
}

describe('CountUpDirective', () => {
  const originalIO = (window as any).IntersectionObserver;
  const originalRAF = window.requestAnimationFrame;

  beforeEach(() => {
    observedElements = [];
    (window as any).IntersectionObserver = MockIntersectionObserver;
  });

  afterEach(() => {
    (window as any).IntersectionObserver = originalIO;
    window.requestAnimationFrame = originalRAF;
  });

  // --- Basic creation ---

  it('should create the directive on the host element', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#target') as HTMLElement;
    expect(target).toBeTruthy();
  });

  it('should observe the host element after view init', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#target') as HTMLElement;
    expect(observedElements).toContain(target);
  });

  // --- Animation trigger ---

  it('should set textContent to the raw value when no numeric match found', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [NoMatchHostComponent],
    }).createComponent(NoMatchHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#nomatch') as HTMLElement;

    // Simulate intersection
    observerCallback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    expect(target.textContent).toBe('no-number-here');
  });

  it('should begin animation when element intersects', () => {
    let rafCalled = false;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCalled = true;
      return 0;
    };

    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#target') as HTMLElement;

    observerCallback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    expect(rafCalled).toBeTrue();
  });

  it('should not animate when element is not intersecting', () => {
    let rafCalled = false;
    window.requestAnimationFrame = (_cb: FrameRequestCallback) => {
      rafCalled = true;
      return 0;
    };

    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#target') as HTMLElement;

    observerCallback(
      [{ isIntersecting: false, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    expect(rafCalled).toBeFalse();
  });

  // --- Final value after animation completes ---

  it('should reach the target value after animation completes', () => {
    // Simulate completing animation by calling the rAF callback with a time far in the future
    const rafCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };

    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#target') as HTMLElement;

    observerCallback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    // Execute the first rAF callback with a time that makes progress = 1
    // The directive uses performance.now() as startTime, so we pass a time way in the future
    if (rafCallbacks.length > 0) {
      // Call with a timestamp that guarantees progress >= 1
      rafCallbacks[0](performance.now() + 10000);
    }

    // The final text should be the full formatted target: "1,00,000"
    expect(target.textContent).toBe('1,00,000');
  });

  it('should handle prefix and suffix correctly with decimal values', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };

    const fixture = TestBed.configureTestingModule({
      imports: [DecimalHostComponent],
    }).createComponent(DecimalHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#decimal') as HTMLElement;

    observerCallback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    // Complete the animation
    if (rafCallbacks.length > 0) {
      rafCallbacks[0](performance.now() + 10000);
    }

    // Should show "3.14%"
    expect(target.textContent).toBe('3.14%');
  });

  it('should handle prefix like $ correctly', () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };

    const fixture = TestBed.configureTestingModule({
      imports: [CustomHostComponent],
    }).createComponent(CustomHostComponent);

    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector('#custom') as HTMLElement;

    observerCallback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    );

    // Complete the animation
    if (rafCallbacks.length > 0) {
      rafCallbacks[0](performance.now() + 10000);
    }

    // Should show "$500"
    expect(target.textContent).toBe('$500');
  });

  // --- Cleanup ---

  it('should disconnect the observer on destroy', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [BasicHostComponent],
    }).createComponent(BasicHostComponent);

    fixture.detectChanges();
    fixture.destroy();

    expect(disconnectSpy).toHaveBeenCalled();
  });
});
