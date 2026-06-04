import { Component, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-scroll-top',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (visible()) {
      <button
        (click)="scrollToTop()"
        class="fixed bottom-12 right-6 z-40 w-10 h-10 rounded-full bg-accent text-white shadow-lg flex items-center justify-center border-0 cursor-pointer hover:bg-accent/90 transition-all duration-200 hover:scale-110 animate-fade-in"
        title="Back to top">
        <lucide-icon name="arrow-up" [size]="18"></lucide-icon>
      </button>
    }
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in { animation: fade-in 0.2s ease-out; }
  `]
})
export class ScrollTopComponent {
  visible = signal(false);

  @HostListener('window:scroll')
  onScroll() {
    this.visible.set(window.scrollY > 400);
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
