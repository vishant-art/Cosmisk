import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';
import { CountUpDirective } from '../../shared/directives/count-up.directive';

@Component({
  selector: 'app-for-agencies',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, AnimateOnScrollDirective, CountUpDirective],
  template: `
    <!-- Hero (Dark) -->
    <section class="relative overflow-hidden bg-dark-mesh py-24 lg:py-32 -mt-[72px] pt-[calc(6rem+72px)] lg:pt-[calc(9rem+72px)]">
      <div class="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-violet-500/5 pointer-events-none"></div>
      <div class="relative z-10 max-w-7xl mx-auto px-6 text-center">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 bg-white/[0.06] border border-white/[0.1] rounded-pill text-indigo-300 text-sm font-body font-semibold mb-6">
          <lucide-icon name="building-2" [size]="14"></lucide-icon> BUILT FOR AGENCIES
        </div>
        <h1 class="text-hero font-display text-white mb-6 max-w-4xl mx-auto">
          One Cockpit. <span class="text-gradient">Every Brand.</span><br>Zero Chaos.
        </h1>
        <p class="text-lg text-gray-400 font-body mb-8 max-w-2xl mx-auto leading-relaxed">
          Manage 5 brands or 500 from a single dashboard. White-label reports, cross-brand intelligence,
          and AI-powered creative production that scales with your agency.
        </p>
        <div class="flex flex-wrap gap-4 justify-center mb-12">
          <a routerLink="/signup" class="btn-primary !py-3.5 !px-8 !text-base no-underline hover:shadow-glow hover:scale-[1.02] transition-all duration-300">Start Free Agency Trial</a>
          <a routerLink="/contact" class="btn !py-3.5 !px-8 !text-base bg-white/[0.06] border border-white/[0.15] text-white hover:bg-white/[0.1] no-underline hover:scale-[1.02] transition-all duration-300">
            <lucide-icon name="calendar" [size]="16"></lucide-icon> Book a Demo
          </a>
        </div>

        <!-- Agency Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
          @for (stat of agencyStats; track stat.label) {
            <div class="text-center">
              <p class="text-2xl font-mono font-bold text-white m-0 mb-1" [appCountUp]="stat.value">{{ stat.value }}</p>
              <p class="text-xs text-gray-500 font-body m-0">{{ stat.label }}</p>
            </div>
          }
        </div>
      </div>
    </section>

    <!-- Multi-Brand Showcase -->
    <section class="py-20 bg-[#F7F8FA]">
      <div class="max-w-7xl mx-auto px-6">
        <div appAnimateOnScroll class="text-center mb-16">
          <h2 class="text-page-title font-display text-navy mb-4">Your Agency Command Center</h2>
          <p class="text-lg text-gray-600 font-body max-w-2xl mx-auto">
            Switch between brands instantly. Every brand gets its own Creative DNA, analytics, and AI insights.
          </p>
        </div>

        <div appAnimateOnScroll class="bg-white rounded-2xl shadow-card border border-divider overflow-hidden max-w-4xl mx-auto">
          <!-- Mockup: brand switcher bar -->
          <div class="flex items-center gap-2 px-5 py-3 bg-[#F7F8FA] border-b border-divider overflow-x-auto">
            @for (brand of mockBrands; track brand.name; let i = $index) {
              <div
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-body font-medium whitespace-nowrap transition-all cursor-default"
                [ngClass]="i === 0 ? 'bg-accent/10 text-accent border border-accent/20' : 'text-gray-500 hover:bg-gray-100'">
                <div class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" [style.background]="brand.color">
                  {{ brand.initial }}
                </div>
                {{ brand.name }}
              </div>
            }
            <div class="flex items-center gap-1 px-3 py-1.5 text-gray-400 text-sm">
              <lucide-icon name="plus" [size]="14"></lucide-icon> Add Brand
            </div>
          </div>

          <!-- Mockup: dashboard overview -->
          <div class="p-6 grid md:grid-cols-3 gap-4">
            @for (kpi of mockKPIs; track kpi.label) {
              <div class="bg-[#F7F8FA] rounded-xl p-4 border border-gray-100">
                <p class="text-xs text-gray-500 font-body m-0 mb-1">{{ kpi.label }}</p>
                <p class="text-xl font-mono font-bold text-navy m-0">{{ kpi.value }}</p>
                <p class="text-xs font-mono m-0 mt-1" [ngClass]="kpi.trend.startsWith('+') ? 'text-green-500' : 'text-red-500'">{{ kpi.trend }}</p>
              </div>
            }
          </div>
        </div>
      </div>
    </section>

    <!-- Agency Features Grid -->
    <section class="py-20 bg-white">
      <div class="max-w-7xl mx-auto px-6">
        <div appAnimateOnScroll class="text-center mb-16">
          <h2 class="text-page-title font-display text-navy mb-4">Everything Your Agency Needs</h2>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          @for (feature of agencyFeatures; track feature.title; let i = $index) {
            <div appAnimateOnScroll [aosDelay]="i * 80" class="p-6 bg-[#F7F8FA] rounded-2xl border border-gray-100 hover:border-accent/20 hover:shadow-card transition-all duration-300">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4" [ngClass]="feature.bgClass">
                <lucide-icon [name]="feature.icon" [size]="22" [ngClass]="feature.iconClass"></lucide-icon>
              </div>
              <h3 class="text-card-title font-display text-navy mb-2">{{ feature.title }}</h3>
              <p class="text-sm text-gray-600 font-body leading-relaxed m-0">{{ feature.description }}</p>
            </div>
          }
        </div>
      </div>
    </section>

    <!-- White Label Section -->
    <section class="py-20 bg-[#F7F8FA]">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
        <div appAnimateOnScroll>
          <div class="text-accent text-sm font-mono font-bold mb-4">WHITE LABEL</div>
          <h2 class="text-page-title font-display text-navy mb-4">Your Brand. Our Intelligence.</h2>
          <p class="text-gray-600 font-body mb-6 leading-relaxed">
            Send clients stunning performance reports with your agency logo, colors, and domain.
            They see your brand. You get Cosmisk's AI.
          </p>
          <ul class="space-y-3 list-none p-0">
            @for (point of whiteLabel; track point) {
              <li class="flex items-start gap-2 text-sm font-body text-navy">
                <lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>
                {{ point }}
              </li>
            }
          </ul>
        </div>

        <!-- White label mockup -->
        <div appAnimateOnScroll [aosDelay]="150" class="bg-white rounded-2xl shadow-card border border-divider p-6">
          <div class="flex items-center gap-3 mb-6 pb-4 border-b border-divider">
            <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <span class="text-white font-bold text-sm">YA</span>
            </div>
            <div>
              <p class="text-sm font-body font-bold text-navy m-0">Your Agency</p>
              <p class="text-xs text-gray-500 m-0">Creative Performance Report</p>
            </div>
          </div>
          <div class="space-y-4">
            <div class="bg-[#F7F8FA] rounded-xl p-4">
              <p class="text-xs text-gray-500 font-body m-0 mb-2">REPORT: Nectar Supplements — Feb 2026</p>
              <div class="grid grid-cols-3 gap-3">
                <div class="text-center">
                  <p class="text-lg font-mono font-bold text-navy m-0">4.8x</p>
                  <p class="text-[10px] text-gray-500 m-0">ROAS</p>
                </div>
                <div class="text-center">
                  <p class="text-lg font-mono font-bold text-green-600 m-0">+32%</p>
                  <p class="text-[10px] text-gray-500 m-0">vs. Last Month</p>
                </div>
                <div class="text-center">
                  <p class="text-lg font-mono font-bold text-navy m-0">18</p>
                  <p class="text-[10px] text-gray-500 m-0">Active Ads</p>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 text-xs text-gray-400 justify-center">
              <span>Powered by AI</span>
              <span class="w-1 h-1 rounded-full bg-gray-300"></span>
              <span>yourAgency.com</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ROI Calculator -->
    <section class="py-20 bg-white" id="roi-calculator">
      <div class="max-w-7xl mx-auto px-6">
        <div appAnimateOnScroll class="text-center mb-16">
          <h2 class="text-page-title font-display text-navy mb-4">Calculate Your ROI</h2>
          <p class="text-lg text-gray-600 font-body max-w-2xl mx-auto">
            See how much time and money Cosmisk can save your agency.
          </p>
        </div>

        <div appAnimateOnScroll class="max-w-4xl mx-auto bg-[#F7F8FA] rounded-2xl border border-divider p-8">
          <div class="grid md:grid-cols-2 gap-12">
            <!-- Inputs -->
            <div class="space-y-8">
              <!-- Ad Spend -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm font-body font-semibold text-navy">Monthly Ad Spend</label>
                  <span class="text-sm font-mono font-bold text-accent">{{ formatINR(adSpend()) }}</span>
                </div>
                <input
                  type="range"
                  [min]="100000" [max]="10000000" [step]="100000"
                  [value]="adSpend()"
                  (input)="adSpend.set(+$any($event.target).value)"
                  class="w-full accent-accent" />
                <div class="flex justify-between text-[10px] text-gray-400 font-mono mt-1">
                  <span>1L</span><span>1Cr</span>
                </div>
              </div>

              <!-- Creatives per month -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm font-body font-semibold text-navy">Creatives / Month</label>
                  <span class="text-sm font-mono font-bold text-accent">{{ creativesPerMonth() }}</span>
                </div>
                <input
                  type="range"
                  [min]="5" [max]="200" [step]="5"
                  [value]="creativesPerMonth()"
                  (input)="creativesPerMonth.set(+$any($event.target).value)"
                  class="w-full accent-accent" />
                <div class="flex justify-between text-[10px] text-gray-400 font-mono mt-1">
                  <span>5</span><span>200</span>
                </div>
              </div>

              <!-- Team Size -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm font-body font-semibold text-navy">Team Size</label>
                  <span class="text-sm font-mono font-bold text-accent">{{ teamSize() }}</span>
                </div>
                <input
                  type="range"
                  [min]="1" [max]="30" [step]="1"
                  [value]="teamSize()"
                  (input)="teamSize.set(+$any($event.target).value)"
                  class="w-full accent-accent" />
                <div class="flex justify-between text-[10px] text-gray-400 font-mono mt-1">
                  <span>1</span><span>30</span>
                </div>
              </div>

              <!-- Number of Brands -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm font-body font-semibold text-navy">Number of Brands</label>
                  <span class="text-sm font-mono font-bold text-accent">{{ numBrands() }}</span>
                </div>
                <input
                  type="range"
                  [min]="1" [max]="50" [step]="1"
                  [value]="numBrands()"
                  (input)="numBrands.set(+$any($event.target).value)"
                  class="w-full accent-accent" />
                <div class="flex justify-between text-[10px] text-gray-400 font-mono mt-1">
                  <span>1</span><span>50</span>
                </div>
              </div>
            </div>

            <!-- Results -->
            <div class="flex flex-col justify-center space-y-6">
              <div class="bg-white rounded-xl p-5 border border-divider shadow-card">
                <p class="text-xs text-gray-500 font-body m-0 mb-1">Projected ROAS Improvement</p>
                <p class="text-3xl font-mono font-bold text-green-600 m-0">+{{ roasImprovement() }}%</p>
              </div>
              <div class="bg-white rounded-xl p-5 border border-divider shadow-card">
                <p class="text-xs text-gray-500 font-body m-0 mb-1">Hours Saved / Month</p>
                <p class="text-3xl font-mono font-bold text-accent m-0">{{ hoursSaved() }}h</p>
              </div>
              <div class="bg-white rounded-xl p-5 border border-divider shadow-card">
                <p class="text-xs text-gray-500 font-body m-0 mb-1">Estimated Monthly Savings</p>
                <p class="text-3xl font-mono font-bold text-navy m-0">{{ formatINR(monthlySavings()) }}</p>
              </div>
              <a routerLink="/signup" class="btn-primary text-center no-underline !py-3 hover:shadow-glow hover:scale-[1.02] transition-all duration-300">
                Start Saving Now
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Agency Pricing -->
    <section class="py-20 bg-dark-mesh">
      <div class="max-w-7xl mx-auto px-6 text-center">
        <div appAnimateOnScroll class="mb-12">
          <h2 class="text-page-title font-display text-white mb-4">Agency-Grade Pricing</h2>
          <p class="text-lg text-gray-400 font-body">Volume discounts. Dedicated support. Custom infrastructure.</p>
        </div>

        <div appAnimateOnScroll class="max-w-3xl mx-auto grid md:grid-cols-2 gap-6">
          <!-- Scale Plan -->
          <div class="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 text-left hover:border-white/[0.15] transition-all duration-300">
            <h3 class="text-card-title font-display text-white mb-1">Scale</h3>
            <p class="text-gray-400 text-sm font-body mb-4">For growing agencies</p>
            <div class="mb-6">
              <span class="text-metric-lg font-mono text-white">&#8377;23,999</span>
              <span class="text-sm text-gray-500">/month</span>
            </div>
            <ul class="space-y-2 mb-8 list-none p-0">
              @for (f of scalePlanFeatures; track f) {
                <li class="flex items-center gap-2 text-sm font-body text-gray-300">
                  <lucide-icon name="check" [size]="14" class="text-green-500"></lucide-icon> {{ f }}
                </li>
              }
            </ul>
            <a routerLink="/signup" class="block text-center py-3 rounded-lg font-body font-semibold text-sm bg-white/[0.06] text-white border border-white/[0.15] hover:bg-white/[0.1] no-underline transition-all duration-300">
              Start Free Trial
            </a>
          </div>

          <!-- Enterprise -->
          <div class="bg-white text-navy rounded-2xl p-8 text-left ring-2 ring-accent shadow-glow">
            <div class="mb-2">
              <span class="px-3 py-1 bg-accent/10 text-accent text-xs font-bold rounded-pill">CUSTOM</span>
            </div>
            <h3 class="text-card-title font-display text-navy mb-1">Enterprise</h3>
            <p class="text-gray-500 text-sm font-body mb-4">For large agencies & holding groups</p>
            <div class="mb-6">
              <span class="text-metric-lg font-mono text-navy">Custom</span>
            </div>
            <ul class="space-y-2 mb-8 list-none p-0">
              @for (f of enterpriseFeatures; track f) {
                <li class="flex items-center gap-2 text-sm font-body text-gray-600">
                  <lucide-icon name="check" [size]="14" class="text-green-500"></lucide-icon> {{ f }}
                </li>
              }
            </ul>
            <a routerLink="/contact" class="block text-center py-3 rounded-lg font-body font-semibold text-sm bg-accent text-white hover:bg-accent-hover no-underline transition-all duration-300 hover:shadow-glow">
              Talk to Sales
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="py-24 bg-[#F7F8FA] text-center">
      <div appAnimateOnScroll class="max-w-3xl mx-auto px-6">
        <h2 class="text-page-title font-display text-navy mb-6">Ready to Scale Your Agency?</h2>
        <p class="text-gray-600 font-body mb-8 max-w-lg mx-auto">
          Join 80+ agencies already using Cosmisk to manage multiple brands with fewer people.
        </p>
        <div class="flex flex-wrap gap-4 justify-center">
          <a routerLink="/signup" class="btn-primary !py-3.5 !px-8 !text-base no-underline hover:shadow-glow hover:scale-[1.02] transition-all duration-300">Start Free Trial</a>
          <a routerLink="/contact" class="btn !py-3.5 !px-8 !text-base bg-navy text-white hover:bg-navy-hover no-underline hover:scale-[1.02] transition-all duration-300">
            Schedule a Call
          </a>
        </div>
      </div>
    </section>
  `
})
export default class ForAgenciesComponent {
  adSpend = signal(2000000);
  creativesPerMonth = signal(40);
  teamSize = signal(5);
  numBrands = signal(8);

  agencyStats = [
    { value: '80+', label: 'Agencies onboarded' },
    { value: '1,200+', label: 'Brands managed' },
    { value: '60%', label: 'Less time on reports' },
    { value: '3.4x', label: 'Avg ROAS lift' },
  ];

  mockBrands = [
    { name: 'Nectar', initial: 'N', color: '#6366F1' },
    { name: 'Urban Drape', initial: 'U', color: '#EC4899' },
    { name: 'FreshBase', initial: 'F', color: '#10B981' },
    { name: 'The Skin Co.', initial: 'T', color: '#F59E0B' },
    { name: 'FlexFit', initial: 'F', color: '#3B82F6' },
  ];

  mockKPIs = [
    { label: 'Total Ad Spend', value: '\u20B918.4L', trend: '+12% vs LM' },
    { label: 'Blended ROAS', value: '4.2x', trend: '+0.6x vs LM' },
    { label: 'Active Creatives', value: '142', trend: '+28 this week' },
  ];

  agencyFeatures = [
    { icon: 'layout-grid', title: 'Multi-Brand Cockpit', description: 'Switch between brands instantly. Each brand gets isolated DNA, analytics, and AI insights.', bgClass: 'bg-accent/10', iconClass: 'text-accent' },
    { icon: 'file-text', title: 'White-Label Reports', description: 'Branded PDF reports with your logo, colors, and domain. Send to clients in one click.', bgClass: 'bg-violet-100', iconClass: 'text-violet-600' },
    { icon: 'brain', title: 'Cross-Brand Brain', description: 'Winning DNA patterns from one brand automatically suggested to others. Intelligence that compounds.', bgClass: 'bg-emerald-100', iconClass: 'text-emerald-600' },
    { icon: 'users', title: 'Team Permissions', description: 'Role-based access. Media buyers see their brands, managers see everything, clients see reports.', bgClass: 'bg-amber-100', iconClass: 'text-amber-600' },
    { icon: 'bar-chart-3', title: 'Agency Dashboard', description: 'Aggregate KPIs across all brands. Spot underperformers before clients notice.', bgClass: 'bg-blue-100', iconClass: 'text-blue-600' },
    { icon: 'video', title: 'Scalable UGC Studio', description: 'Produce UGC-style ads for every brand. AI avatars, scripts from DNA, Hindi + English.', bgClass: 'bg-pink-100', iconClass: 'text-pink-600' },
  ];

  whiteLabel = [
    'Custom logo & brand colors on all reports',
    'Your domain (reports.youragency.com)',
    'Client portal with view-only access',
    'Automated weekly/monthly report delivery',
    'Custom report sections and KPI selection',
  ];

  scalePlanFeatures = [
    'Unlimited brands',
    'Agency Command Center',
    'Cross-brand Brain intelligence',
    'White-label reports',
    'Unlimited AI queries',
    'Dedicated CSM',
    'API access',
  ];

  enterpriseFeatures = [
    'Everything in Scale',
    'Custom infrastructure',
    'SSO / SAML authentication',
    'Custom integrations',
    'SLA guarantees',
    'Onboarding & training',
    'Priority support line',
  ];

  roasImprovement(): number {
    const base = 20;
    const spendFactor = Math.min(this.adSpend() / 10000000, 1) * 15;
    const creativeFactor = Math.min(this.creativesPerMonth() / 200, 1) * 10;
    return Math.round(base + spendFactor + creativeFactor);
  }

  hoursSaved(): number {
    const hoursPerCreative = 2;
    const automationRate = 0.7;
    const brandOverhead = this.numBrands() * 3;
    return Math.round(this.creativesPerMonth() * hoursPerCreative * automationRate + brandOverhead);
  }

  monthlySavings(): number {
    const hourlyRate = 800;
    return this.hoursSaved() * hourlyRate;
  }

  formatINR(value: number): string {
    if (value >= 10000000) return '\u20B9' + (value / 10000000).toFixed(1) + 'Cr';
    if (value >= 100000) return '\u20B9' + (value / 100000).toFixed(1) + 'L';
    return '\u20B9' + value.toLocaleString('en-IN');
  }
}
