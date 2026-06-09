import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-pitch-deck',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  styles: [`
    :host h1, :host h2, :host h3 {
      font-family: 'Playfair Display', serif !important;
    }
    :host .text-gradient {
      display: inline;
      padding-bottom: 4px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }

    /* Aurora blobs */
    .aurora-blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(100px);
      opacity: 0.12;
      pointer-events: none;
    }
    .aurora-1 {
      width: 600px; height: 600px;
      background: radial-gradient(circle, #818CF8, transparent 70%);
      top: -10%; left: -5%;
      animation: aurora-drift-1 12s ease-in-out infinite;
    }
    .aurora-2 {
      width: 500px; height: 500px;
      background: radial-gradient(circle, #A78BFA, transparent 70%);
      bottom: -15%; right: -5%;
      animation: aurora-drift-2 15s ease-in-out infinite;
    }
    .aurora-3 {
      width: 400px; height: 400px;
      background: radial-gradient(circle, #6366F1, transparent 70%);
      top: 30%; right: 20%;
      animation: aurora-drift-3 10s ease-in-out infinite;
    }
    @keyframes aurora-drift-1 {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(40px, 30px); }
    }
    @keyframes aurora-drift-2 {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(-30px, -40px); }
    }
    @keyframes aurora-drift-3 {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(20px, -20px); }
    }

    /* Glass cards */
    .glass-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
    }
    .glass-card-light {
      background: white;
      border: 1px solid rgba(99, 102, 241, 0.12);
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
    }
    .glass-card-light-accent {
      background: white;
      border: 2px solid rgba(99, 102, 241, 0.3);
      border-radius: 16px;
      box-shadow: 0 4px 32px rgba(99, 102, 241, 0.08);
    }

    /* Gradient border card */
    .gradient-border {
      border-radius: 16px;
      padding: 2px;
      background: linear-gradient(135deg, #6366F1, #A78BFA, #6366F1);
    }
    .gradient-border-inner {
      border-radius: 14px;
      padding: 32px;
    }

    /* Big number */
    .big-number {
      font-size: 3.5rem;
      font-weight: 800;
      background: linear-gradient(135deg, #818CF8, #A78BFA);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1;
    }

    /* Slide layout */
    .slide-section {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      padding: 80px 0;
    }

    /* Button glow */
    .btn-glow {
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.4), 0 0 60px rgba(99, 102, 241, 0.1);
      transition: all 0.3s ease;
    }
    .btn-glow:hover {
      box-shadow: 0 0 30px rgba(99, 102, 241, 0.6), 0 0 80px rgba(99, 102, 241, 0.2);
      transform: translateY(-2px);
    }

    /* Flow connector */
    .flow-connector {
      width: 48px; height: 2px;
      background: linear-gradient(90deg, #6366F1, #A78BFA);
      flex-shrink: 0;
    }

    /* Fund bar */
    .fund-bar {
      height: 36px;
      border-radius: 8px;
    }

    /* Tier card */
    .tier-card {
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .tier-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px rgba(99, 102, 241, 0.12);
    }

    /* Matrix dot */
    .matrix-dot {
      width: 14px; height: 14px;
      border-radius: 50%;
      position: absolute;
    }

    @media (max-width: 768px) {
      .big-number { font-size: 2.5rem; }
      .slide-section { padding: 60px 0; }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .animate-spin {
      animation: spin 1s linear infinite;
    }
  `],
  template: `
    <!-- ==================== SLIDE 1: COVER ==================== -->
    <section data-slide class="slide-section bg-dark-mesh">
      <div class="aurora-blob aurora-1"></div>
      <div class="aurora-blob aurora-2"></div>
      <div class="aurora-blob aurora-3"></div>

      <div class="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <div class="mb-8 flex justify-center">
          <div class="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center">
            <lucide-icon name="sparkles" [size]="32" class="text-indigo-400"></lucide-icon>
          </div>
        </div>

        <h1 class="text-6xl md:text-8xl font-bold mb-4">
          <span class="text-gradient">Cosmisk</span>
        </h1>

        <p class="text-base text-indigo-300/70 font-body tracking-wide mb-8">
          The AI operating system for ad creative teams
        </p>

        <p class="text-2xl md:text-3xl text-white font-body font-light mb-3">
          Chat with your ad account.
        </p>
        <p class="text-2xl md:text-3xl text-white font-body font-light mb-4">
          It actually <span class="text-gradient">does the work.</span>
        </p>

        <div class="flex flex-wrap justify-center gap-3 mb-12">
          <span class="text-xs font-body text-gray-400 px-3 py-1 rounded-full border border-white/10">Shopify</span>
          <span class="text-xs font-body text-gray-400 px-3 py-1 rounded-full border border-white/10">Meta Ads</span>
          <span class="text-xs font-body text-gray-400 px-3 py-1 rounded-full border border-white/10">Google Ads</span>
          <span class="text-xs font-body text-gray-400 px-3 py-1 rounded-full border border-white/10">500+ Creators</span>
          <span class="text-xs font-body text-gray-400 px-3 py-1 rounded-full border border-white/10">9 AI Agents</span>
        </div>

        <button
          (click)="downloadPdf()"
          [disabled]="isGeneratingPdf()"
          class="btn-glow inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-accent text-white font-semibold text-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          <ng-container *ngIf="!isGeneratingPdf(); else loadingTpl">
            <lucide-icon name="download" [size]="20"></lucide-icon>
            Download PDF
          </ng-container>
          <ng-template #loadingTpl>
            <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Generating PDF...
          </ng-template>
        </button>

        <div class="mt-20 flex justify-center gap-8 text-gray-500 text-xs tracking-wider uppercase font-body">
          <span>Pre-Seed &middot; $120K</span>
          <span>&middot;</span>
          <span>Confidential</span>
          <span>&middot;</span>
          <span>2026</span>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE 2: THE PROBLEM ==================== -->
    <section data-slide class="slide-section bg-dark-mesh">
      <div class="aurora-blob aurora-2" style="opacity: 0.06;"></div>
      <div class="relative z-10 px-6 max-w-5xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body">The Problem</p>
        <h2 class="text-4xl md:text-5xl font-bold text-white mb-6">
          79% of agencies over-service clients. <span class="text-gradient">The ops are broken.</span>
        </h2>
        <p class="text-gray-400 text-lg mb-12 font-body max-w-3xl">
          DTC brands now need 20-30 creative variations per week. Agencies can't scale fast enough. 39% of CMOs are cutting agency spend. The creative workflow is manual, fragmented, and collapsing.
        </p>

        <div class="grid md:grid-cols-2 gap-6">
          <div *ngFor="let p of problems" class="glass-card p-7 flex gap-5">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                 [style.background]="p.bgColor">
              <lucide-icon [name]="p.icon" [size]="22" [class]="p.iconClass"></lucide-icon>
            </div>
            <div>
              <h3 class="text-lg font-bold text-white mb-2">{{ p.title }}</h3>
              <p class="text-gray-400 text-sm font-body leading-relaxed">{{ p.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE 3: THE SOLUTION ==================== -->
    <section data-slide class="slide-section" style="background: #F7F8FA;">
      <div class="relative z-10 px-6 max-w-5xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body">The Solution</p>
        <h2 class="text-4xl md:text-5xl font-bold text-navy mb-4">
          Just tell it what you need. <span class="text-gradient">It executes.</span>
        </h2>
        <p class="text-gray-500 text-lg mb-12 font-body max-w-2xl">
          One AI platform for agencies and brand owners. Connected to Shopify, Meta Ads, and Google Ads — chat to write scripts, find creators, launch campaigns, and learn what works.
        </p>

        <!-- Hero Use Case: Chat Interface + Live Demo -->
        <div class="grid md:grid-cols-2 gap-8 mb-10">
          <!-- Left: Chat Demo -->
          <div class="glass-card-light-accent p-6">
            <div class="flex items-center gap-2 mb-5">
              <div class="w-3 h-3 rounded-full bg-red-400"></div>
              <div class="w-3 h-3 rounded-full bg-yellow-400"></div>
              <div class="w-3 h-3 rounded-full bg-green-400"></div>
              <span class="ml-2 text-xs text-gray-400 font-body">cosmisk.ai/chat</span>
            </div>
            <div class="space-y-3">
              <div *ngFor="let cmd of chatDemo" class="flex gap-3">
                <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold font-body"
                     [ngClass]="cmd.from === 'user' ? 'bg-accent/20 text-accent' : 'bg-green-100 text-green-700'">
                  {{ cmd.from === 'user' ? 'You' : 'AI' }}
                </div>
                <div class="text-sm font-body leading-relaxed"
                     [ngClass]="cmd.from === 'user' ? 'text-navy font-medium' : 'text-gray-500'">
                  {{ cmd.text }}
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Capability Stack -->
          <div class="space-y-3">
            <div *ngFor="let s of solutions; let i = index" class="glass-card-light p-4 flex items-start gap-4 hover:shadow-lg transition-shadow"
                 [ngClass]="i === 0 ? 'border-2 border-accent/30' : ''">
              <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                   [style.background]="s.bg">
                <lucide-icon [name]="s.icon" [size]="20" [class]="s.iconClass"></lucide-icon>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  <h3 class="text-sm font-bold text-navy">{{ s.title }}</h3>
                  <span *ngIf="s.badge" class="text-[10px] font-bold px-2 py-0.5 rounded-full font-body"
                        [style.background]="s.badgeBg" [style.color]="s.badgeColor">{{ s.badge }}</span>
                </div>
                <p class="text-gray-500 text-xs font-body leading-relaxed">{{ s.desc }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Connected Platforms -->
        <div class="flex items-center justify-center gap-6 mb-10">
          <div class="h-px flex-1 bg-gray-200"></div>
          <div class="flex items-center gap-4">
            <span *ngFor="let p of platforms" class="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 bg-white">
              <lucide-icon [name]="p.icon" [size]="16" class="text-accent"></lucide-icon>
              <span class="text-xs font-bold text-navy font-body">{{ p.name }}</span>
            </span>
          </div>
          <div class="h-px flex-1 bg-gray-200"></div>
        </div>

        <!-- Before / After -->
        <div class="grid md:grid-cols-2 gap-6">
          <div class="glass-card-light p-6 border-l-4" style="border-left-color: #EF4444;">
            <p class="text-sm font-bold text-red-500 uppercase tracking-wider mb-3 font-body">Before Cosmisk</p>
            <ul class="space-y-2">
              <li *ngFor="let b of beforeAfter.before" class="flex items-start gap-2 text-sm text-gray-600 font-body">
                <lucide-icon name="x" [size]="16" class="text-red-400 flex-shrink-0 mt-0.5"></lucide-icon>
                {{ b }}
              </li>
            </ul>
          </div>
          <div class="glass-card-light p-6 border-l-4" style="border-left-color: #6366F1;">
            <p class="text-sm font-bold text-accent uppercase tracking-wider mb-3 font-body">With Cosmisk</p>
            <ul class="space-y-2">
              <li *ngFor="let a of beforeAfter.after" class="flex items-start gap-2 text-sm text-gray-600 font-body">
                <lucide-icon name="check" [size]="16" class="text-accent flex-shrink-0 mt-0.5"></lucide-icon>
                {{ a }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE 4: HOW IT WORKS ==================== -->
    <section data-slide class="slide-section bg-dark-mesh">
      <div class="aurora-blob aurora-1" style="opacity: 0.06;"></div>
      <div class="relative z-10 px-6 max-w-5xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body">How It Works</p>
        <h2 class="text-4xl md:text-5xl font-bold text-white mb-16">
          Four steps. <span class="text-gradient">Near-zero manual work.</span>
        </h2>

        <div class="flex flex-col md:flex-row items-stretch justify-center gap-4">
          <div *ngFor="let step of steps; let i = index; let last = last" class="flex items-center gap-4">
            <div class="glass-card p-6 text-center flex-1" style="min-width: 200px; max-width: 240px;">
              <div class="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white font-bold mx-auto mb-4 font-body">{{ i + 1 }}</div>
              <h3 class="text-lg font-bold text-white mb-2">{{ step.title }}</h3>
              <p class="text-gray-400 text-sm font-body">{{ step.desc }}</p>
            </div>
            <div *ngIf="!last" class="flow-connector hidden md:block"></div>
          </div>
        </div>

        <div class="mt-16 text-center">
          <p class="text-gray-500 font-body text-sm">9 specialized AI agents coordinate behind a single chat interface — connected to Shopify, Meta Ads & Google Ads</p>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE 5: WHY NOW ==================== -->
    <section data-slide class="slide-section" style="background: #F7F8FA;">
      <div class="relative z-10 px-6 max-w-5xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body">Why Now</p>
        <h2 class="text-4xl md:text-5xl font-bold text-navy mb-6">
          Five forces <span class="text-gradient">converging in 2026</span>
        </h2>
        <p class="text-gray-500 text-lg mb-12 font-body max-w-3xl">
          This product wasn't possible 2 years ago. Today, every tailwind is blowing in our direction.
        </p>

        <div class="space-y-5">
          <div *ngFor="let w of whyNowItems" class="glass-card-light p-6 flex items-start gap-5">
            <div class="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              <lucide-icon [name]="w.icon" [size]="22" class="text-accent"></lucide-icon>
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-1">
                <h3 class="text-base font-bold text-navy">{{ w.title }}</h3>
                <span class="text-xs font-bold text-accent font-body px-2 py-0.5 rounded-full bg-accent/10">{{ w.stat }}</span>
              </div>
              <p class="text-gray-500 text-sm font-body">{{ w.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE 6: TRACTION ==================== -->
    <section data-slide class="slide-section" style="background: #F7F8FA;">
      <div class="relative z-10 px-6 max-w-5xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body">Traction</p>
        <h2 class="text-4xl md:text-5xl font-bold text-navy mb-16">
          Built, deployed, <span class="text-gradient">delivering results</span>
        </h2>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          <div *ngFor="let m of tractionMetrics" class="glass-card-light p-6 text-center">
            <p class="big-number mb-1">{{ m.value }}</p>
            <p class="text-gray-500 text-sm font-body font-medium">{{ m.label }}</p>
          </div>
        </div>

        <div class="glass-card-light p-6">
          <h3 class="text-base font-bold text-navy mb-4 font-body">Live in Production</h3>
          <div class="grid md:grid-cols-2 gap-3">
            <div *ngFor="let item of liveFeatures" class="flex items-center gap-2">
              <div class="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <lucide-icon name="check" [size]="12" class="text-green-600"></lucide-icon>
              </div>
              <p class="text-gray-600 text-sm font-body">{{ item }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE 6: MARKET OPPORTUNITY ==================== -->
    <section data-slide class="slide-section bg-dark-mesh">
      <div class="aurora-blob aurora-3" style="opacity: 0.06; top: 10%; left: 60%;"></div>
      <div class="relative z-10 px-6 max-w-5xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body">Market Opportunity</p>
        <h2 class="text-4xl md:text-5xl font-bold text-white mb-16">
          A massive, <span class="text-gradient">underserved</span> market
        </h2>

        <div class="grid md:grid-cols-3 gap-8 mb-10">
          <div class="glass-card p-8 text-center">
            <p class="big-number mb-2" style="font-size: 4rem;">$26B</p>
            <p class="text-sm font-semibold text-white mb-2 font-body">TAM</p>
            <p class="text-gray-400 text-sm font-body">AI in marketing (Precedence Research, 26.7% CAGR)</p>
          </div>
          <div class="glass-card p-8 text-center" style="border: 2px solid rgba(99, 102, 241, 0.3);">
            <p class="big-number mb-2" style="font-size: 4rem;">$7-10B</p>
            <p class="text-sm font-semibold text-white mb-2 font-body">SAM</p>
            <p class="text-gray-400 text-sm font-body">UGC platform market (Fortune BI / Mordor Intelligence, 28% CAGR)</p>
          </div>
          <div class="glass-card p-8 text-center">
            <p class="big-number mb-2" style="font-size: 4rem;">$3.5M</p>
            <p class="text-sm font-semibold text-white mb-2 font-body">SOM (Year 3 ARR)</p>
            <p class="text-gray-400 text-sm font-body">~300 accounts at $600-$1,999/mo blended ACV</p>
          </div>
        </div>

        <!-- Bottom-up math -->
        <div class="glass-card p-6 mb-8">
          <h3 class="text-sm font-bold text-white mb-4 font-body">Bottom-Up Calculation</h3>
          <div class="grid md:grid-cols-4 gap-4 text-center">
            <div>
              <p class="text-2xl font-bold text-indigo-300 font-body">433K</p>
              <p class="text-gray-400 text-xs font-body">Marketing agencies globally (Statista)</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-indigo-300 font-body">4.8M</p>
              <p class="text-gray-400 text-xs font-body">Active Shopify merchants (DemandSage)</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-indigo-300 font-body">$600</p>
              <p class="text-gray-400 text-xs font-body">Blended ARPU/month</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-indigo-300 font-body">~300</p>
              <p class="text-gray-400 text-xs font-body">Year 3 target accounts</p>
            </div>
          </div>
          <p class="text-gray-500 text-xs font-body mt-3 text-center">300 accounts &times; ~$970 blended ARPU &times; 12 months = $3.5M ARR. Less than 0.006% of addressable agencies + brands.</p>
        </div>

        <div class="flex flex-wrap gap-3 justify-center">
          <span *ngFor="let driver of marketDrivers"
            class="px-4 py-2 rounded-full text-sm font-body font-medium text-indigo-300 border border-indigo-500/20"
            style="background: rgba(99, 102, 241, 0.08);">
            {{ driver }}
          </span>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE 7: BUSINESS MODEL ==================== -->
    <section data-slide class="slide-section" style="background: #F7F8FA;">
      <div class="relative z-10 px-6 max-w-5xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body">Business Model</p>
        <h2 class="text-4xl md:text-5xl font-bold text-navy mb-16">
          SaaS + <span class="text-gradient">usage-based</span> pricing
        </h2>

        <div class="grid md:grid-cols-3 gap-6">
          <div *ngFor="let tier of pricingTiers; let i = index"
               class="tier-card p-8"
               [ngClass]="i === 1 ? 'glass-card-light-accent' : 'glass-card-light'">
            <div *ngIf="i === 1" class="text-xs font-bold text-accent uppercase tracking-wider mb-3 font-body">Most Popular</div>
            <h3 class="text-2xl font-bold text-navy mb-1">{{ tier.name }}</h3>
            <p class="text-3xl font-bold text-navy mb-1">{{ tier.price }}</p>
            <p class="text-sm text-gray-400 mb-6 font-body">{{ tier.period }}</p>
            <ul class="space-y-3">
              <li *ngFor="let f of tier.features" class="flex items-start gap-2 text-sm text-gray-600 font-body">
                <lucide-icon name="check" [size]="16" class="text-accent flex-shrink-0 mt-0.5"></lucide-icon>
                {{ f }}
              </li>
            </ul>
          </div>
        </div>

        <p class="mt-6 text-center text-gray-400 text-sm font-body">
          + usage: $0.50/script &middot; $0.10/creator search &middot; Custom enterprise pricing available
        </p>

        <!-- Unit Economics -->
        <div class="mt-10 glass-card-light p-6">
          <h3 class="text-base font-bold text-navy mb-4 font-body">Unit Economics (Projected Year 1)</h3>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div *ngFor="let metric of unitEconomics">
              <p class="text-2xl font-bold text-accent font-body">{{ metric.value }}</p>
              <p class="text-xs text-gray-500 font-body mt-1">{{ metric.label }}</p>
            </div>
          </div>
          <p class="text-xs text-gray-400 font-body mt-4 text-center">LTV assumes $600 blended ARPU, 15% annual churn, 24-mo horizon. CAC blended across content-led inbound ($500) and outbound ($3K). AI inference &lt;$0.02/script.</p>
        </div>

        <!-- Revenue Trajectory -->
        <div class="mt-6 grid md:grid-cols-3 gap-4">
          <div *ngFor="let s of revenueScenarios" class="glass-card-light p-5">
            <p class="text-accent font-bold text-xs uppercase tracking-wider mb-2 font-body">{{ s.stage }}</p>
            <p class="text-2xl font-bold text-navy font-body">{{ s.arr }}</p>
            <p class="text-xs text-gray-500 mb-3 font-body">{{ s.label }}</p>
            <div class="space-y-1">
              <div *ngFor="let line of s.breakdown" class="flex justify-between text-xs font-body">
                <span class="text-gray-400">{{ line.segment }}</span>
                <span class="text-navy font-medium">{{ line.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE: GO-TO-MARKET + EXECUTION ==================== -->
    <section data-slide class="slide-section bg-dark-mesh">
      <div class="aurora-blob aurora-1" style="opacity: 0.06;"></div>
      <div class="relative z-10 px-6 max-w-6xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body">Go-to-Market &amp; Execution</p>
        <h2 class="text-4xl md:text-5xl font-bold text-white mb-4">
          Build in India, <span class="text-gradient">sell to the world</span>
        </h2>
        <p class="text-gray-400 text-lg mb-10 font-body">18-month runway. Three phases. Every dollar mapped to a milestone.</p>

        <div class="space-y-5">
          <div *ngFor="let phase of roadmapPhases" class="glass-card overflow-hidden">
            <!-- Phase header -->
            <div class="px-5 py-3 flex items-center justify-between" style="background: rgba(99, 102, 241, 0.08);">
              <div class="flex items-center gap-3">
                <span class="text-[10px] font-bold text-white uppercase tracking-wider font-body px-2.5 py-1 rounded-full" [style.background]="phase.badgeBg">{{ phase.label }}</span>
                <h3 class="text-sm font-bold text-white font-body">{{ phase.title }}</h3>
              </div>
              <span class="text-xs font-bold text-indigo-300 font-body">{{ phase.budget }}</span>
            </div>
            <!-- Phase columns -->
            <div class="grid md:grid-cols-3 divide-x divide-white/5">
              <div *ngFor="let col of phase.columns" class="p-4">
                <div class="flex items-center gap-2 mb-2">
                  <lucide-icon [name]="col.icon" [size]="14" class="text-accent"></lucide-icon>
                  <p class="text-[10px] font-bold text-accent uppercase tracking-wider font-body">{{ col.heading }}</p>
                </div>
                <ul class="space-y-1.5">
                  <li *ngFor="let item of col.items" class="text-[11px] text-gray-400 font-body">
                    &#8226; {{ item }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Key hires -->
        <div class="mt-6 flex flex-wrap gap-2 justify-center">
          <span class="text-xs font-bold text-gray-500 font-body mr-2">Key Hires:</span>
          <div *ngFor="let hire of keyHires" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10">
            <lucide-icon [name]="hire.icon" [size]="12" class="text-accent"></lucide-icon>
            <span class="text-[11px] font-body text-gray-300">{{ hire.role }}</span>
            <span class="text-[10px] font-body text-gray-500">({{ hire.when }})</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE 9: COMPETITIVE LANDSCAPE ==================== -->
    <section data-slide class="slide-section" style="background: #F7F8FA;">
      <div class="relative z-10 px-6 max-w-6xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body">Competitive Landscape</p>
        <h2 class="text-4xl md:text-5xl font-bold text-navy mb-4">
          $650M+ funded across the space. <span class="text-gradient">Nobody connects it all.</span>
        </h2>
        <p class="text-gray-500 text-lg mb-8 font-body">
          Direct competitors automate one stage. Adjacent players solve one function. Cosmisk is the only platform connecting store data, ad performance, scripts, creators, and learning into one system.
        </p>

        <!-- DIRECT COMPETITORS -->
        <div class="mb-3">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-[10px] font-bold text-white uppercase tracking-wider font-body px-2.5 py-1 rounded-full" style="background: #EF4444;">Direct</span>
            <span class="text-xs text-gray-500 font-body">UGC &amp; creative ops platforms — competing for the same buyer</span>
          </div>
          <div class="grid md:grid-cols-3 gap-3">
            <div *ngFor="let c of directCompetitors" class="glass-card-light p-4 border-l-3" style="border-left: 3px solid #EF4444;">
              <div class="flex items-center justify-between mb-1.5">
                <h3 class="text-sm font-bold text-navy font-body">{{ c.name }}</h3>
                <span class="text-[10px] text-gray-400 font-body">{{ c.funding }}</span>
              </div>
              <p class="text-xs text-gray-500 font-body mb-2">{{ c.does }}</p>
              <div class="flex items-start gap-1.5">
                <lucide-icon name="x" [size]="12" class="text-red-400 flex-shrink-0 mt-0.5"></lucide-icon>
                <p class="text-[11px] text-red-400 font-body font-medium">{{ c.missing }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ADJACENT COMPETITORS -->
        <div class="mb-8">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-[10px] font-bold text-white uppercase tracking-wider font-body px-2.5 py-1 rounded-full" style="background: #F59E0B;">Adjacent</span>
            <span class="text-xs text-gray-500 font-body">Point solutions that overlap with one feature of Cosmisk</span>
          </div>
          <div class="grid md:grid-cols-3 gap-3">
            <div *ngFor="let c of adjacentCompetitors" class="glass-card-light p-4" style="border-left: 3px solid #F59E0B;">
              <div class="flex items-center justify-between mb-1.5">
                <h3 class="text-sm font-bold text-navy font-body">{{ c.name }}</h3>
                <span class="text-[10px] text-gray-400 font-body">{{ c.funding }}</span>
              </div>
              <p class="text-xs text-gray-500 font-body mb-2">{{ c.does }}</p>
              <div class="flex items-start gap-1.5">
                <lucide-icon name="x" [size]="12" class="text-amber-500 flex-shrink-0 mt-0.5"></lucide-icon>
                <p class="text-[11px] text-amber-600 font-body font-medium">{{ c.missing }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Comparison Table -->
        <div class="glass-card-light overflow-hidden mb-8">
          <table class="w-full text-sm font-body">
            <thead>
              <tr class="bg-gray-50">
                <th class="text-left p-3 text-gray-500 font-semibold text-xs">Capability</th>
                <th class="text-center p-3 text-gray-400 font-semibold text-xs">UGC Marketplaces<br/><span class="font-normal">(Insense, Billo)</span></th>
                <th class="text-center p-3 text-gray-400 font-semibold text-xs">Analytics<br/><span class="font-normal">(Triple Whale)</span></th>
                <th class="text-center p-3 text-gray-400 font-semibold text-xs">Creative Intel<br/><span class="font-normal">(Motion, Crux)</span></th>
                <th class="text-center p-3 text-gray-400 font-semibold text-xs">AI Generation<br/><span class="font-normal">(Creatify, Flora)</span></th>
                <th class="text-center p-3 text-accent font-bold text-xs">Cosmisk</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of comparisonRows; let odd = odd" [class]="odd ? 'bg-gray-50/50' : ''">
                <td class="p-3 text-gray-600 font-medium text-xs">{{ row.capability }}</td>
                <td *ngFor="let val of row.values" class="text-center p-3">
                  <lucide-icon *ngIf="val === true" name="check" [size]="16" class="text-green-500 inline-block"></lucide-icon>
                  <lucide-icon *ngIf="val === false" name="x" [size]="16" class="text-gray-300 inline-block"></lucide-icon>
                  <span *ngIf="val !== true && val !== false" class="text-[11px] text-gray-400">{{ val }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Why we win + Defensibility combined -->
        <div class="grid md:grid-cols-2 gap-6">
          <!-- Why we win -->
          <div class="glass-card-light p-5">
            <h3 class="text-sm font-bold text-navy mb-3 font-body">Why We Win</h3>
            <div class="space-y-3">
              <div *ngFor="let adv of advantages" class="flex items-start gap-2">
                <lucide-icon name="check-circle-2" [size]="14" class="text-accent flex-shrink-0 mt-0.5"></lucide-icon>
                <div>
                  <p class="text-xs font-bold text-navy font-body">{{ adv.title }}</p>
                  <p class="text-[11px] text-gray-500 font-body">{{ adv.desc }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Data Moat -->
          <div class="glass-card-light-accent p-5">
            <h3 class="text-sm font-bold text-navy mb-1 font-body">Why This Can't Be Copied</h3>
            <p class="text-[10px] text-gray-400 font-body mb-3">Not a wrapper. A compounding data flywheel.</p>
            <div class="grid grid-cols-2 gap-3">
              <div *ngFor="let moat of dataMotat" class="flex items-start gap-2">
                <div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <lucide-icon [name]="moat.icon" [size]="14" class="text-accent"></lucide-icon>
                </div>
                <div>
                  <h4 class="text-[11px] font-bold text-navy font-body">{{ moat.title }}</h4>
                  <p class="text-[10px] text-gray-500 font-body">{{ moat.desc }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE 10: TEAM ==================== -->
    <section data-slide class="slide-section bg-dark-mesh">
      <div class="aurora-blob aurora-2" style="opacity: 0.06;"></div>
      <div class="relative z-10 px-6 max-w-5xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body">The Team</p>
        <h2 class="text-4xl md:text-5xl font-bold text-white mb-16">
          Built by <span class="text-gradient">operators, not academics</span>
        </h2>

        <div class="grid md:grid-cols-3 gap-8">
          <div *ngFor="let member of teamMembers" class="gradient-border">
            <div class="gradient-border-inner text-center" style="background: #0C0C14;">
              <div class="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-5">
                <lucide-icon name="user" [size]="36" class="text-indigo-400/50"></lucide-icon>
              </div>
              <h3 class="text-xl font-bold text-white mb-1">{{ member.name }}</h3>
              <p class="text-accent text-sm font-semibold mb-3 font-body">{{ member.role }}</p>
              <p class="text-gray-400 text-sm font-body leading-relaxed">{{ member.bio }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== SLIDE 11: THE ASK ==================== -->
    <section data-slide class="slide-section" style="background: #F7F8FA;">
      <div class="relative z-10 px-6 max-w-4xl mx-auto w-full">
        <p class="text-accent font-semibold text-sm tracking-widest uppercase mb-4 font-body text-center">The Ask</p>
        <h2 class="text-4xl md:text-5xl font-bold text-navy mb-4 text-center">
          Raising <span class="text-gradient">$120K</span> Pre-Seed
        </h2>
        <p class="text-gray-500 text-lg mb-12 font-body text-center">At $1.2M pre-money valuation &middot; 18-month runway to $1M ARR &amp; Series A</p>

        <!-- Use of Funds -->
        <div class="glass-card-light p-8 mb-8">
          <h3 class="text-base font-bold text-navy mb-5 font-body">Use of Funds</h3>
          <div class="space-y-4">
            <div *ngFor="let fund of useOfFunds">
              <div class="flex items-center gap-4">
                <span class="text-sm text-gray-500 font-body w-32 flex-shrink-0 text-right">{{ fund.label }}</span>
                <div class="flex-1 bg-gray-100 rounded-lg overflow-hidden h-9">
                  <div class="fund-bar h-full flex items-center px-4"
                       [style.width]="fund.pct + '%'"
                       [style.background]="fund.color">
                    <span class="text-xs font-bold text-white font-body">{{ fund.pct }}%</span>
                  </div>
                </div>
              </div>
              <p class="text-xs text-gray-400 font-body ml-36 mt-1">{{ fund.amount }}</p>
            </div>
          </div>
        </div>

        <!-- Milestones -->
        <div class="glass-card-light p-8 mb-12">
          <h3 class="text-base font-bold text-navy mb-5 font-body">Milestones</h3>
          <div class="grid md:grid-cols-3 gap-6">
            <div *ngFor="let m of milestones" class="text-center">
              <p class="text-accent font-bold text-sm mb-2 font-body">{{ m.time }}</p>
              <p class="text-gray-600 text-sm font-body">{{ m.goal }}</p>
            </div>
          </div>
        </div>

        <!-- CTA -->
        <div class="text-center">
          <h3 class="text-2xl font-bold text-navy mb-3">Let's build the future of creative ops</h3>
          <p class="text-gray-400 font-body mb-8 text-lg">
            vishat&#64;cosmisk.ai &middot; cosmisk.ai
          </p>
          <button
            (click)="downloadPdf()"
            [disabled]="isGeneratingPdf()"
            class="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-accent text-white font-semibold text-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style="box-shadow: 0 4px 24px rgba(99, 102, 241, 0.3);">
            <ng-container *ngIf="!isGeneratingPdf(); else loadingTpl2">
              <lucide-icon name="download" [size]="20"></lucide-icon>
              Download PDF
            </ng-container>
            <ng-template #loadingTpl2>
              <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Generating...
            </ng-template>
          </button>
        </div>
      </div>
    </section>
  `
})
export default class PitchDeckComponent {
  private toast = inject(ToastService);
  isGeneratingPdf = signal(false);

  chatDemo = [
    { from: 'user', text: '"Pause all ads with ROAS below 2x on Meta and Google"' },
    { from: 'ai', text: 'Done. Paused 12 ad sets across Meta (8) and Google (4). Saved $340/day in wasted spend.' },
    { from: 'user', text: '"Write 5 UGC scripts for our top Shopify product"' },
    { from: 'ai', text: 'Pulled your #1 seller (Glow Serum, 2.4K units/mo). Generated 5 scripts using your brand voice DNA. Ready for review.' },
    { from: 'user', text: '"Find 10 skincare creators in the US under 100K followers"' },
    { from: 'ai', text: 'Found 10 creators. Avg engagement 4.2%. Outreach emails drafted. Send now?' },
  ];

  unitEconomics = [
    { value: '$1,500', label: 'Blended CAC' },
    { value: '$14,400', label: 'LTV (24-mo, 15% churn)' },
    { value: '9.6x', label: 'LTV:CAC Ratio' },
    { value: '~80%', label: 'Gross Margin' },
    { value: '~3mo', label: 'Payback Period' },
  ];

  dataMotat = [
    { icon: 'layers', title: 'Proprietary Performance Data', desc: 'Every ad campaign feeds back what works. The AI gets smarter per-brand, per-industry, per-audience.' },
    { icon: 'sparkles', title: 'Brand Voice DNA', desc: 'Unique voice profiles extracted from each brand. Not generic — trained on their specific messaging, tone, and winning patterns.' },
    { icon: 'git-branch', title: '9-Agent Orchestration', desc: '9 specialized agents with 25+ workflows in production. 6+ months of compound engineering that no single model can replicate.' },
    { icon: 'lock', title: 'Switching Cost', desc: 'Integrated into Shopify, Meta, Google Ads. Creator database, brand learnings, historical scripts — all locked in.' },
  ];

  problems = [
    { icon: 'clock', title: 'Teams Waste 350+ Hours on File Ops Alone', desc: 'Searching for assets, recreating lost files, coordinating across tools. Creative teams drown in process work instead of strategy.', bgColor: 'rgba(239, 68, 68, 0.1)', iconClass: 'text-red-400' },
    { icon: 'alert-triangle', title: 'No Performance Feedback Loop', desc: 'Creative decisions are gut-feel. No system connects ad data back to script writing. Same mistakes repeated across 15,384 martech tools.', bgColor: 'rgba(249, 115, 22, 0.1)', iconClass: 'text-orange-400' },
    { icon: 'users', title: '54% of Agencies: "Worst-Ever" Talent Crisis', desc: 'WFA reports 85% of agencies have high talent scarcity. 67% say it blocks growth. You can\'t hire your way out anymore.', bgColor: 'rgba(234, 179, 8, 0.1)', iconClass: 'text-yellow-400' },
    { icon: 'trending-down', title: '39% of CMOs Cutting Agency Spend', desc: 'Gartner 2025: marketing budgets flatlined at 7.7% of revenue. CMOs demand more output with fewer resources. Automation isn\'t optional.', bgColor: 'rgba(168, 85, 247, 0.1)', iconClass: 'text-purple-400' },
  ];

  solutions = [
    { icon: 'message-square', iconClass: 'text-indigo-500', bg: 'rgba(99, 102, 241, 0.1)', title: 'Chat to Execute', desc: '"Pause low-ROAS ads." "Write 5 hooks." It reads your Shopify, Meta & Google data and actually does the work.', badge: 'Core', badgeBg: 'rgba(99, 102, 241, 0.12)', badgeColor: '#6366F1' },
    { icon: 'brain', iconClass: 'text-purple-500', bg: 'rgba(168, 85, 247, 0.1)', title: 'AI Script Engine', desc: 'Writes ad scripts using your brand voice DNA + winning patterns from live ad performance data.', badge: null, badgeBg: '', badgeColor: '' },
    { icon: 'video', iconClass: 'text-pink-500', bg: 'rgba(236, 72, 153, 0.1)', title: 'UGC Production Pipeline', desc: 'Creator scouting, outreach, matching, and delivery management — zero manual coordination.', badge: null, badgeBg: '', badgeColor: '' },
    { icon: 'bar-chart-3', iconClass: 'text-emerald-500', bg: 'rgba(16, 185, 129, 0.1)', title: 'Closed-Loop Learning', desc: 'Every ad campaign feeds back what works. The AI gets smarter per-brand, per-industry, every cycle.', badge: 'Moat', badgeBg: 'rgba(16, 185, 129, 0.12)', badgeColor: '#059669' },
    { icon: 'wand-2', iconClass: 'text-amber-500', bg: 'rgba(245, 158, 11, 0.1)', title: 'Brand Voice DNA', desc: 'Extracts your unique tone, hooks, and messaging patterns. Every output sounds like your brand — at scale.', badge: null, badgeBg: '', badgeColor: '' },
  ];

  platforms = [
    { icon: 'shopping-cart', name: 'Shopify' },
    { icon: 'target', name: 'Meta Ads' },
    { icon: 'globe', name: 'Google Ads' },
  ];

  beforeAfter = {
    before: [
      '3-5 days to research and brief one brand',
      'Manual creator search across Instagram DMs',
      'Scripts written from scratch every time',
      'Switching between Meta Ads Manager, Google Ads, Shopify, and 5 other tools',
      'No idea which creative elements drive ROAS',
    ],
    after: [
      '"Onboard this brand" — done in 30 minutes via chat',
      '"Find creators for skincare" — AI scouts instantly',
      '"Write 5 scripts for my new launch" — generated from ad performance data',
      '"Pause all ads with ROAS under 2x" — executes across Meta + Google instantly',
      '"Show me top-selling Shopify products" — pulls live store data + suggests creatives',
    ],
  };

  steps = [
    { title: 'Connect & Onboard', desc: 'Link Shopify, Meta Ads, Google Ads. AI extracts brand DNA automatically.' },
    { title: 'AI Research', desc: 'Pulls live ad + store data. Analyzes competitors and winning patterns.' },
    { title: 'Create & Produce', desc: 'Scripts generated, creators matched, production managed — via chat.' },
    { title: 'Learn & Optimize', desc: 'Performance data feeds back. System gets smarter every cycle.' },
  ];

  tractionMetrics = [
    { value: '25+', label: 'AI workflows live' },
    { value: '500+', label: 'Creators in DB' },
    { value: '50+', label: 'Scripts generated' },
    { value: '100+', label: 'Hours saved/mo' },
  ];

  liveFeatures = [
    'End-to-end UGC production pipeline',
    'AI script generation with brand voice',
    'Automated creator scouting & outreach',
    'Meta Ads & Google Ads performance sync',
    'Shopify store data integration',
    'Multi-agent orchestration (9 agents)',
    'Closed-loop learning from live ad data',
    'Chat-to-execute interface for all operations',
  ];

  marketDrivers = [
    'Influencer mktg +36% YoY (DemandSage)',
    'AI in marketing 26.7% CAGR (Precedence Research)',
    'Creator economy $250B \u2192 $480B by 2027 (Goldman Sachs)',
    'TikTok ad rev $33B, +40% YoY (Statista)',
    'Global digital ad spend $750B+ (eMarketer)',
  ];

  pricingTiers = [
    {
      name: 'Brand',
      price: '$199',
      period: 'per month',
      features: ['1 brand', '30 scripts/month', 'Chat-to-execute interface', 'Shopify + Meta + Google Ads connected', 'Performance dashboard'],
    },
    {
      name: 'Growth',
      price: '$599',
      period: 'per month',
      features: ['Up to 5 brands', 'Unlimited scripts', 'Creator scouting & outreach', 'All platform integrations', 'Closed-loop learning', 'Priority support'],
    },
    {
      name: 'Agency',
      price: '$1,999',
      period: 'per month',
      features: ['Unlimited brands', 'Unlimited everything', 'White-label options', 'Multi-account Shopify/Meta/Google', 'Dedicated success manager', 'API access'],
    },
  ];

  whyNowItems = [
    { icon: 'zap', title: 'AI costs dropped 99% in 2 years', stat: 'Epoch AI', desc: 'GPT-4-level performance: $36/M tokens (Mar 2023) to $0.30/M with Gemini Flash (2025). Epoch AI found prices fell 40x per year. Creative pipelines that cost $10K/month now cost under $50.' },
    { icon: 'video', title: 'UGC platform spend up 69% YoY', stat: '$7.6B in 2025', desc: 'UGC platforms grew from $4.5B to $7.6B in one year (Whop). Creators offering UGC jumped from 26% to 66% (Collabstr). DTC brands now test 15-20 creative concepts per week.' },
    { icon: 'users', title: 'Creator economy approaching $480B', stat: 'Goldman Sachs', desc: 'Goldman Sachs projects the creator economy will reach $480B by 2027, doubling from $250B. 50M+ creators globally. But the infrastructure is still DMs and spreadsheets.' },
    { icon: 'globe', title: '76% of employers can\'t find talent', stat: 'ManpowerGroup', desc: 'ManpowerGroup 2025: 76% struggle to hire. WFA: 54% of agencies say worst-ever crisis. 84% report data/analytics skill gaps. Creative demand up 3-4x but teams can\'t scale.' },
    { icon: 'bot', title: '40% of enterprise apps will embed AI agents', stat: 'Gartner 2026', desc: 'Gartner predicts 40% of enterprise apps will feature AI agents by end of 2026, up from less than 5% today. Salesforce Agentforce ARR grew 330% YoY. We have 9 agents live.' },
  ];

  revenueScenarios = [
    {
      stage: 'Year 1',
      arr: '$500K',
      label: '~50 customers',
      breakdown: [
        { segment: 'Brand owners (25)', value: '$60K' },
        { segment: 'Growth (15)', value: '$108K' },
        { segment: 'Agencies (10)', value: '$240K' },
        { segment: 'Usage fees', value: '$92K' },
      ],
    },
    {
      stage: 'Year 3',
      arr: '$3.5M',
      label: '~300 customers',
      breakdown: [
        { segment: 'Brand owners (150)', value: '$358K' },
        { segment: 'Growth (100)', value: '$719K' },
        { segment: 'Agencies (50)', value: '$1.2M' },
        { segment: 'Usage fees', value: '$1.2M' },
      ],
    },
    {
      stage: 'Year 5',
      arr: '$15M',
      label: '~1,200 customers',
      breakdown: [
        { segment: 'Brand owners (500)', value: '$1.2M' },
        { segment: 'Growth (400)', value: '$2.9M' },
        { segment: 'Agencies (300)', value: '$7.2M' },
        { segment: 'Usage + enterprise', value: '$3.7M' },
      ],
    },
  ];

  roadmapPhases = [
    {
      label: 'Phase 1',
      title: 'Month 1–6: Validate & Ship',
      budget: '$45K burn',
      headerBg: 'rgba(99, 102, 241, 0.06)',
      badgeBg: '#6366F1',
      titleColor: '#1E1B4B',
      columns: [
        {
          heading: 'Engineering',
          icon: 'workflow',
          items: [
            'Ship self-serve onboarding + chat UI',
            'Shopify integration (products, orders, analytics)',
            'Meta Ads API (read/write — pause, create, report)',
            'Google Ads API (read/write — campaigns, keywords)',
            'Improve AI script engine with brand voice',
            'Build performance dashboard with live ad data',
          ],
        },
        {
          heading: 'Marketing & Sales',
          icon: 'megaphone',
          items: [
            'Launch cosmisk.ai with case study content',
            'Cold outreach to 500 DTC brands + agencies (US, India)',
            'LinkedIn thought leadership (3x/week)',
            'Partner with 3 Shopify app communities',
            'Attend 2 DTC/agency conferences',
          ],
        },
        {
          heading: 'Operations',
          icon: 'settings',
          items: [
            'Onboard 10 paying brands manually',
            'Build 3 case studies with ROAS proof',
            'Set up customer success playbook',
            'Legal — ToS, privacy, DPA for enterprise',
            'SOC 2 Type I preparation',
          ],
        },
      ],
    },
    {
      label: 'Phase 2',
      title: 'Month 7–12: Scale Globally',
      budget: '$50K burn',
      headerBg: 'rgba(129, 140, 248, 0.06)',
      badgeBg: '#818CF8',
      titleColor: '#1E1B4B',
      columns: [
        {
          heading: 'Engineering',
          icon: 'workflow',
          items: [
            'Multi-brand workspace for agencies',
            'White-label mode (custom branding)',
            'Creator marketplace v1 (search + hire)',
            'Advanced reporting (cross-platform ROAS)',
            'TikTok Ads API integration',
            'Webhook API for enterprise clients',
          ],
        },
        {
          heading: 'Marketing & Sales',
          icon: 'megaphone',
          items: [
            'Part-time SDR for US market outbound',
            'Launch Shopify App Store listing',
            'Content engine: SEO + YouTube + newsletter',
            'Referral program for existing clients',
            'Target UK, UAE, SEA agencies',
          ],
        },
        {
          heading: 'Operations',
          icon: 'settings',
          items: [
            'Scale to 30+ clients across 3 countries',
            'Build onboarding automation (zero-touch)',
            'Creator database: 2,000+ verified creators',
            'SOC 2 Type I preparation begins',
            'Monthly product webinars',
          ],
        },
      ],
    },
    {
      label: 'Phase 3',
      title: 'Month 13–18: Series A Ready',
      budget: '$25K burn',
      headerBg: 'rgba(167, 139, 250, 0.06)',
      badgeBg: '#A78BFA',
      titleColor: '#1E1B4B',
      columns: [
        {
          heading: 'Engineering',
          icon: 'workflow',
          items: [
            'Amazon Ads + Klaviyo integrations',
            'AI creative generation (image + video)',
            'Predictive analytics (forecast ad performance)',
            'Enterprise SSO + role-based access',
            'Mobile app (iOS) for approvals',
          ],
        },
        {
          heading: 'Marketing & Sales',
          icon: 'megaphone',
          items: [
            'Founder-led enterprise sales motion',
            'Launch partner program for agencies',
            'Product Hunt launch + PR push',
            'Build inbound pipeline to 50+ leads/mo',
          ],
        },
        {
          heading: 'Operations',
          icon: 'settings',
          items: [
            'Scale to 100+ clients, $80K+ MRR',
            'Prepare Series A data room',
            'Board + advisor setup',
            'Target: $1M ARR run rate',
          ],
        },
      ],
    },
  ];

  keyHires = [
    { icon: 'workflow', role: 'Full-Stack Dev (India)', when: 'Month 1' },
    { icon: 'bot', role: 'AI/ML Engineer (India)', when: 'Month 4' },
    { icon: 'smartphone', role: 'Part-time SDR', when: 'Month 8' },
  ];

  directCompetitors = [
    { name: 'GRIN', funding: '$144M raised', does: 'Creator management platform — discovery, outreach, payments, campaign tracking. ~$1B valuation.', missing: 'No AI scripts, no brand voice, no ad performance feedback loop. A CRM for influencers, not a creative engine.' },
    { name: 'Insense', funding: '$4.9M raised', does: 'UGC marketplace connecting DTC brands with creators. Meta/TikTok whitelisting. ~$5M ARR.', missing: 'Brands write briefs manually. No AI scripts, no brand voice, no Shopify or Google Ads integration.' },
    { name: 'Aspire (AspireIQ)', funding: '$26.4M raised', does: 'Influencer relationship management + UGC sourcing. Discovery, outreach, payments, affiliate tracking.', missing: 'No AI content generation. Has Shopify for seeding but not for ad performance. Template-based outreach.' },
    { name: '#paid', funding: '$22M raised', does: 'Creator marketing — brands post briefs, creators pitch ideas. "Handraise" matching model.', missing: 'Creative ideation is fully manual (creator-pitched). No AI scripts, no performance learning, no ad platform integration.' },
    { name: 'Billo', funding: '$3.7M raised', does: 'Self-serve UGC marketplace. Brands submit product, choose creators, receive videos. $99-$500/video.', missing: 'No creative strategy or scripts. No performance feedback, no Shopify integration. A vending machine for UGC.' },
    { name: 'CreatorIQ', funding: '$80M raised', does: 'Enterprise influencer marketing — discovery, campaign management, measurement, compliance.', missing: 'No ad script writing, no Shopify/Meta integration for performance feedback. Pure measurement and relationship management.' },
  ];

  adjacentCompetitors = [
    { name: 'Smartly.io', funding: '$223M raised', does: 'Enterprise ad automation — dynamic creative templating, campaign management across Meta/Google/TikTok.', missing: 'No UGC creators, no brand voice DNA. Templated creative for enterprise, not AI-native script generation.' },
    { name: 'Motion', funding: '$42M raised', does: 'Creative analytics — tracks which ad creatives perform, identifies winning patterns, reports creative fatigue.', missing: 'Analytics only. Tells you what worked but produces nothing. No scripts, no creators, no production.' },
    { name: 'Triple Whale', funding: '$52.7M raised', does: 'Ecommerce analytics & attribution. Shopify-first dashboard, multi-touch attribution, server-side tracking.', missing: 'Pure analytics. Shows which ads drive revenue but does not help make the ads. No creative production.' },
    { name: 'AdCreative.ai', funding: 'Acq. $38.7M', does: 'AI-generated ad creatives — banners, ad copy variants. Acquired by Appier (Feb 2025).', missing: 'Image/copy only — no video scripts, no UGC, no creators. No brand voice DNA, no closed-loop learning.' },
    { name: 'Foreplay', funding: 'Bootstrapped', does: 'Ad creative swipe file — save ads from Meta/TikTok Ad Library, organize, build briefs. 10M+ ad library.', missing: 'Discovery/research only. Does not write scripts, manage creators, or automate production.' },
    { name: 'Madgicx', funding: '$14.5M raised', does: 'Meta Ads optimization — AI audience targeting, budget pacing, ad automation rules, basic creative tools.', missing: 'Meta-only. Basic templated creative — no UGC scripts, no brand voice, no creator management.' },
  ];

  comparisonRows: { capability: string; values: (boolean | string)[] }[] = [
    { capability: 'Chat-to-Execute Interface',  values: [false, false, false, false, true] },
    { capability: 'AI Script Writing',          values: [false, false, false, 'Partial', true] },
    { capability: 'Brand Voice DNA',            values: [false, false, false, false, true] },
    { capability: 'Creator Scouting & Outreach',values: [true,  false, false, false, true] },
    { capability: 'UGC Production Pipeline',    values: [true,  false, false, false, true] },
    { capability: 'Shopify + Meta + Google Ads',values: [false, 'Shopify', 'Meta only', 'Multi', true] },
    { capability: 'Closed-Loop Learning',       values: [false, false, false, false, true] },
    { capability: 'End-to-End Pipeline',        values: [false, false, false, false, true] },
  ];

  advantages = [
    { title: 'Executes, Not Just Reports', desc: 'GRIN, Motion, Triple Whale show data. Cosmisk actually pauses ads, writes scripts, finds creators — from one chat.' },
    { title: 'Full Pipeline, Not Point Solutions', desc: '$650M+ funded into tools covering 1 stage each. We connect Store Data \u2192 Ad Performance \u2192 Scripts \u2192 Creators \u2192 Delivery \u2192 Learning.' },
    { title: 'AI-Native, Not Bolted On', desc: 'Insense, Aspire, #paid were built pre-LLM. Their AI is a feature. Ours is the architecture \u2014 brand voice DNA, closed-loop learning, 9-agent orchestration.' },
  ];

  teamMembers = [
    { name: 'Vishat Jain', role: 'CEO & Co-Founder', bio: 'Performance marketer who has managed ad spend across Meta + Google for DTC brands. Built Cosmisk\u2019s UGC service arm from zero to paying clients. Leads product vision, sales, and investor relations.' },
    { name: 'Sanskar Saxena', role: 'COO & Co-Founder', bio: 'Operator who built the creator network (500+ creators across 14 verticals) and manages end-to-end client delivery. Runs go-to-market, partnerships, and the outreach engine.' },
    { name: 'Jeet Soni', role: 'CTO & Co-Founder', bio: 'Full-stack engineer who single-handedly built 25+ production AI workflows, 9-agent orchestration system, and the entire Cosmisk platform. Infra, backend, AI \u2014 all one person.' },
  ];

  useOfFunds = [
    { label: 'Engineering', pct: 45, color: '#6366F1', amount: '$54K \u2014 1-2 contract devs (India) + cloud + AI API costs' },
    { label: 'Sales & Growth', pct: 25, color: '#818CF8', amount: '$30K \u2014 LinkedIn ads, content marketing, US outbound, events' },
    { label: 'Operations', pct: 15, color: '#A78BFA', amount: '$18K \u2014 infra, tools, legal, compliance' },
    { label: 'Buffer', pct: 15, color: '#C4B5FD', amount: '$18K \u2014 runway extension, contingency' },
  ];

  milestones = [
    { time: 'Month 1\u20136', goal: '10 paying clients (India + US), $8K MRR, self-serve onboarding live' },
    { time: 'Month 7\u201312', goal: '50 clients, $40K MRR ($500K ARR), 3 case studies with ROAS data' },
    { time: 'Month 13\u201318', goal: '100+ clients, $80K+ MRR (~$1M ARR), Series A ready' },
  ];

  async downloadPdf() {
    this.isGeneratingPdf.set(true);

    try {
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      const W = 1920;
      const H = 1080;

      // Pause all animations for clean capture
      const style = document.createElement('style');
      style.textContent = '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }';
      document.head.appendChild(style);

      // Create offscreen container at exact 16:9 dimensions
      const offscreen = document.createElement('div');
      offscreen.style.cssText = `position:fixed; left:-9999px; top:0; width:${W}px; overflow:hidden; z-index:-1;`;
      document.body.appendChild(offscreen);

      const slides = document.querySelectorAll('[data-slide]');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H] });

      for (let i = 0; i < slides.length; i++) {
        const original = slides[i] as HTMLElement;
        const clone = original.cloneNode(true) as HTMLElement;

        // Force exact slide dimensions
        clone.style.cssText = `width:${W}px; min-height:${H}px; height:${H}px; overflow:hidden; position:relative;`;
        offscreen.innerHTML = '';
        offscreen.appendChild(clone);

        // Let layout settle
        await new Promise(r => setTimeout(r, 150));

        const canvas = await html2canvas(clone, {
          scale: 2,
          useCORS: true,
          backgroundColor: null,
          width: W,
          height: H,
          windowWidth: W,
          windowHeight: H,
        });

        const imgData = canvas.toDataURL('image/png');
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, W, H);
      }

      // Cleanup
      document.body.removeChild(offscreen);
      document.head.removeChild(style);

      pdf.save('Cosmisk-Investor-Deck.pdf');
    } catch (err) {
      console.error('PDF generation failed:', err);
      this.toast.error('PDF Failed', 'Could not generate the PDF. Please try again.');
    } finally {
      this.isGeneratingPdf.set(false);
    }
  }
}
