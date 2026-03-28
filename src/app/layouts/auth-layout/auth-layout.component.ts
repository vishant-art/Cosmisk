import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, LucideAngularModule],
  styles: [`
    @keyframes auth-glow {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.1); }
    }
    @keyframes auth-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }
    @keyframes metric-count {
      0% { opacity: 0; transform: translateY(12px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes slide-testimonial {
      0% { opacity: 0; transform: translateX(20px); }
      100% { opacity: 1; transform: translateX(0); }
    }
    .auth-left {
      background:
        radial-gradient(ellipse at 20% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 50%, rgba(79, 70, 229, 0.05) 0%, transparent 70%),
        #0C0C14;
    }
    .auth-glow-orb {
      animation: auth-glow 6s ease-in-out infinite;
    }
    .auth-glow-orb-2 {
      animation: auth-glow 8s ease-in-out infinite 2s;
    }
    .auth-float { animation: auth-float 4s ease-in-out infinite; }
    .auth-float-delayed { animation: auth-float 5s ease-in-out infinite 1.5s; }
    .metric-enter { animation: metric-count 0.6s ease-out forwards; }
    .testimonial-enter { animation: slide-testimonial 0.5s ease-out forwards; }

    .metric-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(8px);
    }
    .metric-card:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(99, 102, 241, 0.2);
    }

    .trust-badge {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
  `],
  template: `
    <div class="min-h-screen flex">
      <!-- Left Panel (desktop only) -->
      <div class="hidden lg:flex lg:w-[52%] auth-left relative overflow-hidden flex-col justify-between p-10 xl:p-14">

        <!-- Animated glow orbs -->
        <div class="absolute top-20 left-20 w-64 h-64 rounded-full bg-accent/10 blur-[100px] auth-glow-orb"></div>
        <div class="absolute bottom-32 right-16 w-48 h-48 rounded-full bg-purple-500/10 blur-[80px] auth-glow-orb-2"></div>

        <!-- Dot grid pattern -->
        <div class="absolute inset-0 opacity-[0.03]"
          style="background-image: radial-gradient(circle, white 1px, transparent 1px); background-size: 32px 32px;">
        </div>

        <!-- Top: Logo + tagline -->
        <div class="relative z-10">
          <a routerLink="/" class="no-underline inline-flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center"
              style="filter: drop-shadow(0 0 12px rgba(99,102,241,0.4))">
              <lucide-icon name="sparkles" [size]="20" class="text-accent"></lucide-icon>
            </div>
            <span class="text-white font-display font-bold text-2xl tracking-wide">COSMISK</span>
          </a>
        </div>

        <!-- Center: Hero content -->
        <div class="relative z-10 max-w-lg">
          <h2 class="text-white font-display font-bold text-3xl xl:text-4xl leading-tight mb-4">
            Your AI strategist for<br>
            <span class="text-gradient bg-gradient-to-r from-accent via-purple-400 to-accent bg-clip-text text-transparent"
              style="background-size: 200% auto; animation: gradient-text 3s linear infinite;">
              Meta & Google Ads
            </span>
          </h2>
          <p class="text-gray-400 font-body text-base leading-relaxed mb-8">
            Stop guessing what works. Cosmisk analyzes your creatives, forecasts performance, and tells you exactly what to do next.
          </p>

          <!-- Live metrics preview -->
          <div class="grid grid-cols-3 gap-3 mb-8">
            @for (metric of liveMetrics; track metric.label) {
              <div class="metric-card rounded-xl p-4 transition-all duration-300 auth-float"
                [class.auth-float-delayed]="$index === 1">
                <p class="text-gray-500 text-[11px] font-mono uppercase tracking-wider mb-1 m-0">{{ metric.label }}</p>
                <p class="text-white font-display font-bold text-xl m-0 metric-enter">{{ metric.value }}</p>
                <div class="flex items-center gap-1 mt-1">
                  <lucide-icon [name]="metric.trend === 'up' ? 'trending-up' : 'trending-down'" [size]="12"
                    [class]="metric.trend === 'up' ? 'text-emerald-400' : 'text-red-400'"></lucide-icon>
                  <span class="text-[11px] font-mono" [class]="metric.trend === 'up' ? 'text-emerald-400' : 'text-red-400'">
                    {{ metric.change }}
                  </span>
                </div>
              </div>
            }
          </div>

          <!-- Testimonial -->
          <div class="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] backdrop-blur-sm testimonial-enter"
            [style.animation-delay]="'0.3s'">
            <div class="flex gap-3">
              <div class="text-accent/60 shrink-0 mt-0.5">
                <lucide-icon name="message-square" [size]="18"></lucide-icon>
              </div>
              <div>
                <p class="text-white/80 font-body text-sm leading-relaxed mb-3 m-0">
                  {{ testimonials[activeTestimonial()].quote }}
                </p>
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                    {{ testimonials[activeTestimonial()].initials }}
                  </div>
                  <div>
                    <p class="text-white text-sm font-semibold m-0">{{ testimonials[activeTestimonial()].name }}</p>
                    <p class="text-gray-500 text-xs m-0">{{ testimonials[activeTestimonial()].role }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Dots -->
          <div class="flex gap-1.5 mt-4">
            @for (t of testimonials; track $index) {
              <button
                (click)="activeTestimonial.set($index)"
                class="h-1.5 rounded-full transition-all duration-300 border-0 cursor-pointer"
                [class]="$index === activeTestimonial()
                  ? 'bg-accent w-6'
                  : 'bg-white/20 w-1.5 hover:bg-white/30'">
              </button>
            }
          </div>
        </div>

        <!-- Bottom: Trust badges -->
        <div class="relative z-10 flex items-center gap-4">
          @for (badge of trustBadges; track badge.text) {
            <div class="trust-badge rounded-lg px-3 py-2 flex items-center gap-2">
              <lucide-icon [name]="badge.icon" [size]="14" class="text-gray-500"></lucide-icon>
              <span class="text-gray-500 text-xs font-body">{{ badge.text }}</span>
            </div>
          }
        </div>
      </div>

      <!-- Right Panel (form) -->
      <div class="flex-1 flex items-center justify-center p-6 sm:p-10 bg-[#F7F8FA]">
        <div class="w-full max-w-[420px]">
          <!-- Mobile logo -->
          <div class="lg:hidden flex items-center justify-center gap-2.5 mb-10">
            <div class="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <lucide-icon name="sparkles" [size]="16" class="text-accent"></lucide-icon>
            </div>
            <span class="font-display font-bold text-xl text-navy">COSMISK</span>
          </div>

          <router-outlet />
        </div>
      </div>
    </div>
  `
})
export class AuthLayoutComponent implements OnInit, OnDestroy {
  activeTestimonial = signal(0);
  private intervalId?: ReturnType<typeof setInterval>;

  liveMetrics = [
    { label: 'Patterns', value: '100+', change: '7 categories', trend: 'up' as const },
    { label: 'AI Agents', value: '6', change: '24/7 active', trend: 'up' as const },
    { label: 'Formats', value: '10+', change: 'UGC to static', trend: 'up' as const },
  ];

  trustBadges = [
    { icon: 'shield', text: 'AES-256 encrypted' },
    { icon: 'lock', text: 'Read-only Meta access' },
    { icon: 'globe', text: 'Real-time Meta sync' },
  ];

  testimonials = [
    {
      quote: "Upload any ad. Cosmisk extracts Creative DNA — the specific hooks, visuals, and audio patterns that drive ROAS. Then generates more of what works.",
      name: 'Creative DNA',
      initials: 'CD',
      role: 'Core Intelligence Engine'
    },
    {
      quote: "Six autonomous AI agents monitor your Meta campaigns, spot fatigue before it costs you, and recommend budget shifts with full reasoning you can approve or reject.",
      name: 'The Brain',
      initials: 'AI',
      role: 'Autonomous Agent System'
    },
    {
      quote: "From brief to publishable UGC video in under 60 seconds. AI avatars, voiceovers, and scripts — across 10+ formats including carousel, static, and podcast clips.",
      name: 'Creative Studio',
      initials: 'CS',
      role: 'Content Generation Engine'
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
