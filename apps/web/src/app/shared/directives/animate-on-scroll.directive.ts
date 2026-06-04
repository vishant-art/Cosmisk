import { Directive, ElementRef, Input, AfterViewInit, OnDestroy, NgZone } from '@angular/core';

@Directive({
  selector: '[appAnimateOnScroll]',
  standalone: true,
})
export class AnimateOnScrollDirective implements AfterViewInit, OnDestroy {
  @Input() aosDelay = 0;

  private observer?: IntersectionObserver;

  constructor(private el: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngAfterViewInit() {
    if (this.aosDelay) {
      this.el.nativeElement.style.transitionDelay = `${this.aosDelay}ms`;
    }

    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('aos-visible');
              this.observer?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      );
      this.observer.observe(this.el.nativeElement);
    });
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
