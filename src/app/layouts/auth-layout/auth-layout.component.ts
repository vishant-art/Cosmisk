import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, LucideAngularModule],
  styles: [`
    @keyframes auth-mesh {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    .auth-left {
      background:
        radial-gradient(ellipse at 20% 30%, rgba(99, 102, 241, 0.12) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 70%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
        #0C0C14;
    }
  `],
  template: `
    <div class="min-h-screen flex">
      <!-- Left Panel (desktop only) -->
      <div class="hidden lg:flex lg:w-1/2 auth-left relative overflow-hidden flex-col items-center justify-center p-12">
        <!-- Subtle dot pattern -->
        <div class="absolute inset-0 opacity-[0.02]"
          style="background-image: radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px); background-size: 50px 50px;">
        </div>

        <div class="relative z-10 text-center max-w-md">
          <div class="w-12 h-12 mx-auto mb-4 rounded-xl bg-accent/20 flex items-center justify-center" style="filter: drop-shadow(0 0 8px rgba(99,102,241,0.4))">
            <lucide-icon name="sparkles" [size]="24" class="text-accent"></lucide-icon>
          </div>
          <a routerLink="/" class="no-underline">
            <h1 class="text-white font-display font-bold text-4xl mb-3">COSMISK</h1>
          </a>
          <p class="text-gray-400 font-body text-lg mb-12">AI-Powered Creative Intelligence</p>

          <!-- Testimonial (glass) -->
          <div class="bg-white/[0.04] rounded-card p-6 border border-white/[0.08] backdrop-blur-sm">
            <p class="text-white/90 font-body text-sm italic mb-4 leading-relaxed">
              "{{ testimonials[activeTestimonial()].quote }}"
            </p>
            <div class="flex items-center justify-center gap-3">
              <div class="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                {{ testimonials[activeTestimonial()].initials }}
              </div>
              <div class="text-left">
                <p class="text-white text-sm font-semibold m-0">{{ testimonials[activeTestimonial()].name }}</p>
                <p class="text-gray-400 text-xs m-0">{{ testimonials[activeTestimonial()].role }}</p>
              </div>
            </div>
          </div>

          <!-- Dots -->
          <div class="flex justify-center gap-2 mt-4">
            @for (t of testimonials; track $index) {
              <span
                class="w-2 h-2 rounded-full transition-colors"
                [ngClass]="$index === activeTestimonial() ? 'bg-accent' : 'bg-white/20'">
              </span>
            }
          </div>
        </div>
      </div>

      <!-- Right Panel (form) -->
      <div class="flex-1 flex items-center justify-center p-6 bg-[#F7F8FA]">
        <div class="w-full max-w-md">
          <router-outlet />
        </div>
      </div>
    </div>
  `
})
export class AuthLayoutComponent implements OnInit, OnDestroy {
  activeTestimonial = signal(0);
  private intervalId?: ReturnType<typeof setInterval>;

  testimonials = [
    {
      quote: "Cosmisk changed how we think about creative. We went from guessing to knowing exactly why our best ads work.",
      name: 'Rajesh Gupta',
      initials: 'RG',
      role: 'Founder, Nectar Supplements'
    },
    {
      quote: "Managing 35 brands became 10x easier. The Creative DNA concept is brilliant — our clients love the reports.",
      name: 'Priya Sharma',
      initials: 'PS',
      role: 'CEO, AdScale Agency'
    },
    {
      quote: "We reduced our creative production time by 60% using Director Lab and UGC Studio. Game changer for D2C.",
      name: 'Amit Patel',
      initials: 'AP',
      role: 'CMO, Urban Drape'
    },
  ];

  ngOnInit() {
    this.intervalId = setInterval(() => {
      this.activeTestimonial.update(i => (i + 1) % this.testimonials.length);
    }, 5000);
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}
