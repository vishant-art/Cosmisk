import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { InsightCardComponent } from '../../shared/components/insight-card/insight-card.component';
import { DEMO_INSIGHTS } from '../../shared/data/demo-data';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, InsightCardComponent, LucideAngularModule],
  styles: [`
    @keyframes confetti-fall {
      0% { transform: translateY(-100%) rotate(0deg); opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }
    .confetti-piece {
      position: fixed;
      top: -10px;
      width: 10px;
      height: 10px;
      animation: confetti-fall 3s ease-in forwards;
      z-index: 50;
    }
    .confetti-piece:nth-child(1) { left: 10%; background: #E74C3C; animation-delay: 0s; animation-duration: 2.5s; }
    .confetti-piece:nth-child(2) { left: 20%; background: #3498DB; animation-delay: 0.2s; animation-duration: 3s; border-radius: 50%; }
    .confetti-piece:nth-child(3) { left: 30%; background: #F39C12; animation-delay: 0.4s; animation-duration: 2.8s; }
    .confetti-piece:nth-child(4) { left: 40%; background: #2ECC71; animation-delay: 0.1s; animation-duration: 3.2s; border-radius: 50%; }
    .confetti-piece:nth-child(5) { left: 50%; background: #9B59B6; animation-delay: 0.3s; animation-duration: 2.6s; }
    .confetti-piece:nth-child(6) { left: 60%; background: #E74C3C; animation-delay: 0.5s; animation-duration: 3.1s; border-radius: 50%; }
    .confetti-piece:nth-child(7) { left: 70%; background: #1ABC9C; animation-delay: 0.15s; animation-duration: 2.9s; }
    .confetti-piece:nth-child(8) { left: 80%; background: #F39C12; animation-delay: 0.35s; animation-duration: 2.7s; border-radius: 50%; }
    .confetti-piece:nth-child(9) { left: 90%; background: #3498DB; animation-delay: 0.25s; animation-duration: 3.3s; }
    .confetti-piece:nth-child(10) { left: 15%; background: #2ECC71; animation-delay: 0.45s; animation-duration: 2.4s; border-radius: 50%; }
    .confetti-piece:nth-child(11) { left: 35%; background: #9B59B6; animation-delay: 0.55s; animation-duration: 3s; }
    .confetti-piece:nth-child(12) { left: 55%; background: #E74C3C; animation-delay: 0.6s; animation-duration: 2.8s; border-radius: 50%; }
    .confetti-piece:nth-child(13) { left: 75%; background: #F39C12; animation-delay: 0.1s; animation-duration: 3.4s; }
    .confetti-piece:nth-child(14) { left: 85%; background: #1ABC9C; animation-delay: 0.4s; animation-duration: 2.5s; border-radius: 50%; }
    .confetti-piece:nth-child(15) { left: 45%; background: #3498DB; animation-delay: 0.7s; animation-duration: 3.2s; }

    @keyframes scroll-text {
      0% { transform: translateY(0); }
      100% { transform: translateY(-50%); }
    }
    .animate-scroll-text {
      animation: scroll-text 4s linear infinite;
    }
  `],
  template: `
    <div class="w-full max-w-2xl mx-auto">
      <!-- Progress Bar -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-body font-medium text-gray-500">Step {{ currentStep() }} of 5</span>
        </div>
        <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="h-full bg-accent rounded-full transition-all duration-500"
            [style.width.%]="currentStep() * 20">
          </div>
        </div>
      </div>

      <!-- Step 1: Connect Meta -->
      @if (currentStep() === 1) {
        <div class="text-center animate-fade-in">
          <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
            <lucide-icon name="zap" [size]="32" class="text-accent"></lucide-icon>
          </div>
          <h2 class="text-page-title font-display text-navy mb-3">Let's connect your Meta ad account</h2>
          <p class="text-gray-600 font-body mb-8 max-w-md mx-auto">
            We'll analyze your creatives and show you insights in under 60 seconds.
          </p>

          @if (!metaConnected()) {
            <button (click)="connectMeta()" class="btn-primary !py-3.5 !px-8 !text-base mb-4">
              <lucide-icon name="globe" [size]="18" class="mr-2"></lucide-icon> Connect with Meta
            </button>
          } @else {
            <div class="inline-flex items-center gap-2 px-6 py-3 bg-green-50 text-green-700 rounded-lg font-body font-medium mb-4">
              <span>✓</span> Meta Ads Connected — 8 ad accounts found
            </div>
            <br>
            <button (click)="nextStep()" class="btn-primary !py-3 !px-8 mt-4">Continue</button>
          }

          <p class="text-xs text-gray-400 font-body mt-4">We request read-only access. We never modify your campaigns.</p>
          <button (click)="nextStep()" class="text-sm text-gray-500 hover:text-accent mt-4 font-body border-0 bg-transparent cursor-pointer">
            Skip for now →
          </button>
        </div>
      }

      <!-- Step 2: AI Scanning -->
      @if (currentStep() === 2) {
        <div class="text-center animate-fade-in">
          <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
            <lucide-icon name="brain" [size]="32" class="text-accent pulse-dot"></lucide-icon>
          </div>
          <h2 class="text-page-title font-display text-navy mb-3">Our AI is reading your ad DNA...</h2>
          <p class="text-gray-600 font-body mb-8">Hang tight. This usually takes 30-60 seconds.</p>

          <!-- Progress Ring -->
          <div class="relative w-32 h-32 mx-auto mb-8">
            <svg class="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E2DD" stroke-width="6"/>
              <circle cx="50" cy="50" r="45" fill="none" stroke="#E74C3C" stroke-width="6"
                stroke-dasharray="283" [attr.stroke-dashoffset]="283 - (scanProgress() / 100 * 283)"
                stroke-linecap="round" class="transition-all duration-500"/>
            </svg>
            <span class="absolute inset-0 flex items-center justify-center text-xl font-mono font-bold text-navy">
              {{ scanProgress() }}%
            </span>
          </div>

          <!-- AI Processing Text -->
          <div class="mt-4 bg-navy/5 rounded-lg p-3 font-mono text-[10px] text-gray-400 h-16 overflow-hidden relative">
            <div class="animate-scroll-text space-y-1">
              <p class="m-0">Analyzing hook patterns...</p>
              <p class="m-0">Extracting visual DNA signatures...</p>
              <p class="m-0">Processing audio fingerprints...</p>
              <p class="m-0">Matching against 10,000+ creative patterns...</p>
              <p class="m-0">Generating intelligence report...</p>
            </div>
          </div>

          <!-- Checklist -->
          <div class="max-w-sm mx-auto space-y-3 text-left mt-6">
            @for (item of scanItems; track item.label; let i = $index) {
              <div class="flex items-center gap-3 text-sm font-body">
                @if (scanProgress() > item.threshold) {
                  <span class="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs">✓</span>
                  <span class="text-navy">{{ item.complete }}</span>
                } @else {
                  <span class="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                    <span class="w-3 h-3 bg-gray-300 rounded-full pulse-dot"></span>
                  </span>
                  <span class="text-gray-500">{{ item.label }}</span>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Step 3: Success Oracle -->
      @if (currentStep() === 3) {
        <div class="text-center animate-fade-in">
          <div class="w-20 h-20 mx-auto mb-6 bg-yellow-50 rounded-full flex items-center justify-center">
            <lucide-icon name="sparkles" [size]="32" class="text-accent"></lucide-icon>
          </div>
          <h2 class="text-page-title font-display text-navy mb-3">Your First Creative Intelligence Report</h2>
          <p class="text-gray-600 font-body mb-8">Here's what our AI discovered about your ads.</p>

          <div class="space-y-4 text-left max-w-lg mx-auto mb-8">
            @for (insight of insights; track insight.id) {
              <app-insight-card [insight]="insight" />
            }
          </div>

          <button (click)="nextStep()" class="btn-primary !py-3 !px-8">Continue Setup →</button>
        </div>
      }

      <!-- Step 4: Set Goals -->
      @if (currentStep() === 4) {
        <div class="animate-fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="target" [size]="32" class="text-accent"></lucide-icon>
            </div>
            <h2 class="text-page-title font-display text-navy mb-3">What are you optimizing for?</h2>
          </div>

          <div class="grid grid-cols-2 gap-4 mb-8">
            @for (goal of goals; track goal.id) {
              <button
                (click)="selectedGoal.set(goal.id)"
                class="p-5 rounded-card border-2 text-left transition-all cursor-pointer bg-white"
                [ngClass]="selectedGoal() === goal.id ? 'border-accent bg-red-50' : 'border-border hover:border-gray-300'">
                <lucide-icon [name]="goal.icon" [size]="20" class="text-accent mb-2 block"></lucide-icon>
                <h3 class="text-sm font-body font-semibold text-navy m-0 mb-1">{{ goal.label }}</h3>
                <p class="text-xs text-gray-500 font-body m-0">{{ goal.description }}</p>
              </button>
            }
          </div>

          <div class="grid grid-cols-2 gap-4 mb-8">
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">My current ROAS target</label>
              <div class="relative">
                <input type="number" [(ngModel)]="roasTarget" class="input !pr-8" placeholder="3.0">
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">x</span>
              </div>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Monthly Meta budget</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <input type="text" [(ngModel)]="budget" class="input !pl-8" placeholder="18,00,000">
              </div>
            </div>
          </div>

          <div class="text-center">
            <button (click)="nextStep()" class="btn-primary !py-3 !px-8">Continue →</button>
          </div>
        </div>
      }

      <!-- Step 5: Competitors -->
      @if (currentStep() === 5) {
        <div class="animate-fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="eye" [size]="32" class="text-accent"></lucide-icon>
            </div>
            <h2 class="text-page-title font-display text-navy mb-3">Who are your competitors?</h2>
            <p class="text-gray-600 font-body">We'll track their ad strategies so you stay ahead.</p>
          </div>

          <div class="bg-white rounded-card p-6 shadow-card mb-6">
            <p class="text-xs text-gray-500 font-body font-medium mb-4 uppercase tracking-wider">AI Suggested Competitors</p>
            <div class="space-y-3">
              @for (comp of competitors; track comp.name) {
                <div class="flex items-center justify-between p-3 rounded-lg border border-border hover:border-gray-300 transition-colors">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500">
                      {{ comp.name.charAt(0) }}
                    </div>
                    <div>
                      <p class="text-sm font-body font-medium text-navy m-0">{{ comp.name }}</p>
                      <p class="text-xs text-gray-500 m-0">{{ comp.category }}</p>
                    </div>
                  </div>
                  <button
                    (click)="comp.added = !comp.added"
                    class="px-4 py-1.5 rounded-lg text-xs font-body font-medium transition-all border-0 cursor-pointer"
                    [ngClass]="comp.added ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
                    {{ comp.added ? '✓ Added' : 'Add' }}
                  </button>
                </div>
              }
            </div>
          </div>

          <div class="text-center">
            <button (click)="completeOnboarding()" class="btn-primary !py-4 !px-10 !text-base">
              Launch Cosmisk
            </button>
            <br>
            <button (click)="completeOnboarding()" class="text-sm text-gray-500 hover:text-accent mt-3 font-body border-0 bg-transparent cursor-pointer">
              I'll add competitors later →
            </button>
          </div>
        </div>
      }

      <!-- Confetti Screen -->
      @if (currentStep() === 6) {
        <div class="text-center animate-fade-in py-12 relative">
          <!-- Confetti pieces -->
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>

          <div class="mb-6"><lucide-icon name="sparkles" [size]="48" class="text-accent"></lucide-icon></div>
          <h2 class="text-page-title font-display text-navy mb-3">You're all set!</h2>
          <p class="text-gray-600 font-body mb-8">Your Creative DNA analysis is ready.</p>
          <button (click)="goToDashboard()" class="btn-primary !py-3.5 !px-8 !text-base">Go to Dashboard</button>
        </div>
      }
    </div>
  `
})
export default class OnboardingComponent {
  private router = inject(Router);
  private auth = inject(AuthService);

  currentStep = signal(1);
  metaConnected = signal(false);
  scanProgress = signal(0);
  selectedGoal = signal('roas');
  roasTarget = 3.0;
  budget = '18,00,000';

  insights = DEMO_INSIGHTS;

  scanItems = [
    { label: 'Scanning active campaigns...', complete: 'Found 8 campaigns', threshold: 20 },
    { label: 'Analyzing 47 creatives...', complete: '47 creatives analyzed', threshold: 45 },
    { label: 'Extracting Creative DNA...', complete: 'DNA profiles created', threshold: 70 },
    { label: 'Generating first insights...', complete: '3 insights ready!', threshold: 90 },
  ];

  goals = [
    { id: 'roas', icon: 'trending-up', label: 'Maximize ROAS', description: 'Highest return on every rupee spent' },
    { id: 'cpa', icon: 'trending-down', label: 'Lower CPA/CAC', description: 'Bring customer acquisition cost down' },
    { id: 'scale', icon: 'bar-chart-3', label: 'Scale Spend', description: 'Spend more while maintaining efficiency' },
    { id: 'velocity', icon: 'zap', label: 'Creative Velocity', description: 'Produce winning creatives faster' },
  ];

  competitors = [
    { name: 'WOW Skin Science', category: 'Health & Wellness', added: false },
    { name: 'Oziva', category: 'Health & Wellness', added: false },
    { name: 'The Man Company', category: 'Personal Care', added: false },
  ];

  connectMeta() {
    this.metaConnected.set(true);
  }

  nextStep() {
    const step = this.currentStep();
    if (step === 1) {
      this.currentStep.set(2);
      this.startScan();
    } else {
      this.currentStep.update(s => s + 1);
    }
  }

  private startScan() {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 8 + 2;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => this.currentStep.set(3), 500);
      }
      this.scanProgress.set(Math.round(progress));
    }, 300);
  }

  completeOnboarding() {
    this.currentStep.set(6);
  }

  goToDashboard() {
    this.auth.setOnboardingComplete();
    this.router.navigate(['/app/dashboard']);
  }
}
