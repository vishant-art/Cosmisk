import { Component, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

interface TourStep {
  title: string;
  description: string;
  icon: string;
  route?: string;
  shortcut?: string;
}

@Component({
  selector: 'app-welcome-tour',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (visible()) {
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center animate-fade-in" (click)="skip()">
        <div class="w-full max-w-lg mx-4 animate-slide-up" (click)="$event.stopPropagation()">
          <div class="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <!-- Header -->
            <div class="bg-gradient-to-r from-accent to-violet-500 p-6 text-white">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-mono font-bold uppercase tracking-widest opacity-70">
                  {{ currentStep() + 1 }} / {{ steps.length }}
                </span>
                <button (click)="skip()" class="text-white/60 hover:text-white text-xs font-body border-0 bg-transparent cursor-pointer">
                  Skip tour
                </button>
              </div>
              <h2 class="text-lg font-display font-bold m-0 mb-1">{{ steps[currentStep()].title }}</h2>
              <p class="text-sm text-white/80 font-body m-0 leading-relaxed">{{ steps[currentStep()].description }}</p>
            </div>

            <!-- Icon showcase -->
            <div class="p-8 flex flex-col items-center">
              <div class="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                <lucide-icon [name]="steps[currentStep()].icon" [size]="32" class="text-accent"></lucide-icon>
              </div>
              @if (steps[currentStep()].shortcut) {
                <div class="flex items-center gap-1.5 mb-2">
                  <span class="text-xs text-gray-500 font-body">Shortcut:</span>
                  <kbd class="px-2 py-1 bg-gray-100 rounded border border-gray-200 text-xs font-mono text-gray-700">{{ steps[currentStep()].shortcut }}</kbd>
                </div>
              }

              <!-- Progress dots -->
              <div class="flex items-center gap-2 mt-4">
                @for (step of steps; track $index) {
                  <button
                    (click)="currentStep.set($index)"
                    class="border-0 cursor-pointer p-0 transition-all"
                    [ngClass]="$index === currentStep() ? 'w-6 h-2 bg-accent rounded-full' : $index < currentStep() ? 'w-2 h-2 bg-accent/40 rounded-full' : 'w-2 h-2 bg-gray-200 rounded-full'">
                  </button>
                }
              </div>
            </div>

            <!-- Navigation -->
            <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                (click)="prev()"
                [disabled]="currentStep() === 0"
                class="px-4 py-2 text-sm font-body font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default">
                Back
              </button>
              @if (currentStep() < steps.length - 1) {
                <button
                  (click)="next()"
                  class="px-5 py-2 text-sm font-body font-bold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors border-0 cursor-pointer shadow-sm">
                  Next
                </button>
              } @else {
                <button
                  (click)="finish()"
                  class="px-5 py-2 text-sm font-body font-bold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors border-0 cursor-pointer shadow-sm">
                  Get Started
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes slide-up {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-up {
      animation: slide-up 0.3s ease-out;
    }
  `]
})
export class WelcomeTourComponent {
  private router = inject(Router);

  visible = signal(false);
  currentStep = signal(0);

  steps: TourStep[] = [
    {
      title: 'Welcome to Cosmisk',
      description: 'Your AI-powered creative intelligence platform. One person + Cosmisk = the output of an entire agency team.',
      icon: 'sparkles',
    },
    {
      title: 'AI Command Bar',
      description: 'Press Cmd+K to ask anything: "pause my worst campaigns", "show today\'s ROAS", or "generate a new creative brief". Your AI strategist is always one keystroke away.',
      icon: 'command',
      shortcut: 'Cmd+K',
    },
    {
      title: 'Dashboard Intelligence',
      description: 'Real-time KPIs, AI-generated insights with one-click actions, morning briefings from your autonomous strategist, and live agent activity.',
      icon: 'layout-dashboard',
      route: '/app/dashboard',
    },
    {
      title: 'Creative DNA Analysis',
      description: 'Every ad is decoded into Hook DNA, Visual DNA, and Audio DNA — 100+ patterns that explain WHY ads work, not just how they perform.',
      icon: 'dna',
      route: '/app/creative-cockpit',
    },
    {
      title: 'Autonomous AI Agents',
      description: '6 AI agents work 24/7: Watchdog monitors your campaigns, Morning Briefing synthesizes strategy, Report Agent generates weekly insights, and more.',
      icon: 'bot',
      route: '/app/autopilot',
    },
    {
      title: 'Creative Engine',
      description: 'Batch-generate 100+ creatives in under 60 seconds: UGC videos, statics, carousels. AI scores every creative before launch.',
      icon: 'rocket',
      route: '/app/ugc-studio',
      shortcut: 'G+E',
    },
    {
      title: 'Keyboard Shortcuts',
      description: 'Navigate like a pro. Press ? for the full shortcuts overlay, or use G+D for Dashboard, G+A for Analytics, G+B for Brain.',
      icon: 'keyboard',
      shortcut: '?',
    },
  ];

  show() {
    this.currentStep.set(0);
    this.visible.set(true);
  }

  next() {
    if (this.currentStep() < this.steps.length - 1) {
      this.currentStep.update(s => s + 1);
    }
  }

  prev() {
    if (this.currentStep() > 0) {
      this.currentStep.update(s => s - 1);
    }
  }

  skip() {
    this.visible.set(false);
    localStorage.setItem('cosmisk_tour_seen', 'true');
  }

  finish() {
    this.visible.set(false);
    localStorage.setItem('cosmisk_tour_seen', 'true');
    this.router.navigate(['/app/dashboard']);
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!this.visible()) return;
    if (event.key === 'Escape') this.skip();
    if (event.key === 'ArrowRight' || event.key === 'Enter') this.next();
    if (event.key === 'ArrowLeft') this.prev();
  }
}
