import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CountUpDirective } from './count-up.directive';

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
  template: `<span [appCountUp]="'1,00,000'" [countDuration]="100">0</span>`,
  standalone: true,
  imports: [CountUpDirective],
})
class TestHostComponent {}

@Component({
  template: `<span [appCountUp]="'3.14'" [countDuration]="100">0</span>`,
  standalone: true,
  imports: [CountUpDirective],
})
class TestHostDecimalComponent {}

@Component({
  template: `<span [appCountUp]="'0'" [countDuration]="100">0</span>`,
  standalone: true,
  imports: [CountUpDirective],
})
class TestHostZeroComponent {}

@Component({
  template: `<span [appCountUp]="'₹1,00,000+'" [countDuration]="100">0</span>`,
  standalone: true,
  imports: [CountUpDirective],
})
class TestHostPrefixSuffixComponent {}

@Component({
  template: `<span [appCountUp]="'hello'" [countDuration]="100">0</span>`,
  standalone: true,
  imports: [CountUpDirective],
})
class TestHostNonNumericComponent {}

describe('CountUpDirective', () => {
  let originalIntersectionObserver: typeof IntersectionObserver;
  let originalRaf: typeof requestAnimationFrame;
  let originalPerformanceNow: typeof performance.now;

  beforeEach(() => {
    MockIntersectionObserver.reset();
    originalIntersectionObserver = window.IntersectionObserver;
    (window as any).IntersectionObserver = MockIntersectionObserver;
  });

  afterEach(() => {
    window.IntersectionObserver = originalIntersectionObserver;
  });

  it('should create an instance and observe the element', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();

    expect(MockIntersectionObserver.instances.length).toBe(1);
    const observer = MockIntersectionObserver.instances[0];
    expect(observer.observedElements.length).toBe(1);
  });

  it('should use threshold of 0.3', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();

    const observer = MockIntersectionObserver.instances[0];
    expect(observer.options?.threshold).toBe(0.3);
  });

  it('should animate to target value when element enters viewport', (done: DoneFn) => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();

    const spanEl = fixture.nativeElement.querySelector('span') as HTMLElement;
    const observer = MockIntersectionObserver.instances[0];

    observer.simulateIntersection(true);

    // Wait for animation to complete (duration is 100ms + buffer)
    setTimeout(() => {
      expect(spanEl.textContent).toBe('1,00,000');
      done();
    }, 250);
  });

  it('should handle decimal target values', (done: DoneFn) => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostDecimalComponent],
    }).createComponent(TestHostDecimalComponent);

    fixture.detectChanges();

    const spanEl = fixture.nativeElement.querySelector('span') as HTMLElement;
    const observer = MockIntersectionObserver.instances[0];

    observer.simulateIntersection(true);

    setTimeout(() => {
      expect(spanEl.textContent).toBe('3.14');
      done();
    }, 250);
  });

  it('should handle zero target value', (done: DoneFn) => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostZeroComponent],
    }).createComponent(TestHostZeroComponent);

    fixture.detectChanges();

    const spanEl = fixture.nativeElement.querySelector('span') as HTMLElement;
    const observer = MockIntersectionObserver.instances[0];

    observer.simulateIntersection(true);

    setTimeout(() => {
      expect(spanEl.textContent).toBe('0');
      done();
    }, 250);
  });

  it('should handle prefix and suffix in target value', (done: DoneFn) => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostPrefixSuffixComponent],
    }).createComponent(TestHostPrefixSuffixComponent);

    fixture.detectChanges();

    const spanEl = fixture.nativeElement.querySelector('span') as HTMLElement;
    const observer = MockIntersectionObserver.instances[0];

    observer.simulateIntersection(true);

    setTimeout(() => {
      expect(spanEl.textContent).toBe('₹1,00,000+');
      done();
    }, 250);
  });

  it('should display raw value for non-numeric strings', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostNonNumericComponent],
    }).createComponent(TestHostNonNumericComponent);

    fixture.detectChanges();

    const spanEl = fixture.nativeElement.querySelector('span') as HTMLElement;
    const observer = MockIntersectionObserver.instances[0];

    observer.simulateIntersection(true);

    expect(spanEl.textContent).toBe('hello');
  });

  it('should unobserve after intersection', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();

    const observer = MockIntersectionObserver.instances[0];
    expect(observer.observedElements.length).toBe(1);

    observer.simulateIntersection(true);
    expect(observer.observedElements.length).toBe(0);
  });

  it('should disconnect observer on destroy', () => {
    const fixture = TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).createComponent(TestHostComponent);

    fixture.detectChanges();

    const observer = MockIntersectionObserver.instances[0];
    spyOn(observer, 'disconnect');

    fixture.destroy();
    expect(observer.disconnect).toHaveBeenCalled();
  });
});
