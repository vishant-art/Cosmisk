import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnimateOnScrollDirective } from './animate-on-scroll.directive';

// Mock IntersectionObserver
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observedElements: Element[] = [];

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observedElements.push(element);
  }

  unobserve(element: Element) {
    this.observedElements = this.observedElements.filter((el) => el !== element);
  }

  disconnect() {
    this.observedElements = [];
  }

  // Helper to simulate intersection
  simulateIntersection(isIntersecting: boolean) {
    const entries: Partial<IntersectionObserverEntry>[] = this.observedElements.map((target) => ({
      isIntersecting,
      target,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: Date.now(),
    }));
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }

  static instances: MockIntersectionObserver[] = [];
  static reset() {
    MockIntersectionObserver.instances = [];
  }
}

@Component({
  template: `<div appAnimateOnScroll>Test</div>`,
  standalone: true,
  imports: [AnimateOnScrollDirective],
})
class TestHostComponent {}

@Component({
  template: `<div appAnimateOnScroll [aosDelay]="200">Test with delay</div>`,
  standalone: true,
  imports: [AnimateOnScrollDirective],
})
class TestHostWithDelayComponent {}

describe('AnimateOnScrollDirective', () => {
  let originalIntersectionObserver: typeof IntersectionObserver;

  beforeEach(() => {
    MockIntersectionObserver.reset();
    originalIntersectionObserver = window.IntersectionObserver;
    (window as any).IntersectionObserver = MockIntersectionObserver;
  });

  afterEach(() => {
    window.IntersectionObserver = originalIntersectionObserver;
  });

  it('should create an instance and observe the element', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(MockIntersectionObserver.instances.length).toBe(1);
    const observer = MockIntersectionObserver.instances[0];
    expect(observer.observedElements.length).toBe(1);
  });

  it('should add "aos-visible" class when element enters viewport', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    const divEl = fixture.nativeElement.querySelector('div') as HTMLElement;
    expect(divEl.classList.contains('aos-visible')).toBeFalse();

    const observer = MockIntersectionObserver.instances[0];
    observer.simulateIntersection(true);

    expect(divEl.classList.contains('aos-visible')).toBeTrue();
  });

  it('should not add class when element is not intersecting', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    const divEl = fixture.nativeElement.querySelector('div') as HTMLElement;
    const observer = MockIntersectionObserver.instances[0];
    observer.simulateIntersection(false);

    expect(divEl.classList.contains('aos-visible')).toBeFalse();
  });

  it('should unobserve after becoming visible', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    const observer = MockIntersectionObserver.instances[0];
    expect(observer.observedElements.length).toBe(1);

    observer.simulateIntersection(true);
    expect(observer.observedElements.length).toBe(0);
  });

  it('should set transitionDelay when aosDelay is provided', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostWithDelayComponent],
    }).createComponent(TestHostWithDelayComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    const divEl = fixture.nativeElement.querySelector('div') as HTMLElement;
    expect(divEl.style.transitionDelay).toBe('200ms');
  });

  it('should use threshold of 0.15', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    const observer = MockIntersectionObserver.instances[0];
    expect(observer.options?.threshold).toBe(0.15);
  });

  it('should disconnect observer on destroy', async () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    const observer = MockIntersectionObserver.instances[0];
    spyOn(observer, 'disconnect');

    fixture.destroy();
    expect(observer.disconnect).toHaveBeenCalled();
  });
});
