import { Directive, ElementRef, Input, AfterViewInit, OnDestroy, NgZone } from '@angular/core';

@Directive({
  selector: '[appCountUp]',
  standalone: true,
})
export class CountUpDirective implements AfterViewInit, OnDestroy {
  @Input('appCountUp') targetValue = '';
  @Input() countDuration = 2000;

  private observer?: IntersectionObserver;

  constructor(private el: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.animate();
              this.observer?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.3 }
      );
      this.observer.observe(this.el.nativeElement);
    });
  }

  private animate() {
    const raw = this.targetValue;
    // Extract numeric part, prefix, and suffix
    const match = raw.match(/^([^\d]*)([\d,.]+)(.*)$/);
    if (!match) {
      this.el.nativeElement.textContent = raw;
      return;
    }

    const prefix = match[1];
    const numStr = match[2].replace(/,/g, '');
    const suffix = match[3];
    const target = parseFloat(numStr);
    const isFloat = numStr.includes('.');
    const decimals = isFloat ? (numStr.split('.')[1]?.length || 0) : 0;
    const hasCommas = match[2].includes(',');

    const duration = this.countDuration;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      let formatted: string;
      if (isFloat) {
        formatted = current.toFixed(decimals);
      } else {
        const rounded = Math.round(current);
        formatted = hasCommas ? rounded.toLocaleString('en-IN') : rounded.toString();
      }

      this.el.nativeElement.textContent = prefix + formatted + suffix;

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
