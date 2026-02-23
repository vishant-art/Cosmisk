import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';
import { CountUpDirective } from '../../shared/directives/count-up.directive';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LucideAngularModule, AnimateOnScrollDirective, CountUpDirective],
  styles: [`
    :host h1, :host h2, :host h3 {
      font-family: 'Playfair Display', serif !important;
    }
    .marquee-track {
      display: flex;
      width: max-content;
      animation: marquee 30s linear infinite;
    }
    .marquee-track:hover {
      animation-play-state: paused;
    }
    /* Aurora blobs */
    .aurora-blob {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.15;
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
    .pulse-ring {
      animation: pulse-ring 2s ease-in-out infinite;
    }
    @keyframes pulse-ring {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
      50% { opacity: 0.8; box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
    }
    .sparkline {
      display: flex; align-items: flex-end; gap: 1px; height: 16px;
    }
    .sparkline-bar {
      width: 3px; border-radius: 1px; background: #6366F1; opacity: 0.6;
    }
    .typing-dot { animation: typing-bounce 1.4s infinite; }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing-bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-4px); }
    }
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      animation: fade-in 0.2s ease-out;
    }
    .modal-panel {
      background: #fff; border-radius: 16px; max-width: 560px; width: 90%;
      padding: 32px; position: relative;
      animation: scale-in 0.2s ease-out;
    }
    /* DNA Scanner */
    .dna-scan-line {
      position: absolute; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, transparent, #6366F1, transparent);
      animation: scan-sweep 3s ease-in-out infinite;
    }
    @keyframes scan-sweep {
      0% { top: 0; opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { top: 100%; opacity: 0; }
    }
    .dna-tag-reveal {
      animation: dna-pop 0.4s ease-out forwards;
      opacity: 0;
    }
    @keyframes dna-pop {
      from { opacity: 0; transform: scale(0.8) translateY(4px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    /* Testimonial carousel */
    .testimonial-track {
      transition: transform 0.5s ease-in-out;
    }
    .carousel-dot {
      transition: all 0.3s;
    }
    .carousel-dot-active {
      width: 24px;
      border-radius: 10px;
    }
  `],
  template: `
    <!-- Hero Section (Dark) with Aurora -->
    <section class="relative overflow-hidden bg-dark-mesh py-24 lg:py-36 -mt-[72px] pt-[calc(6rem+72px)] lg:pt-[calc(9rem+72px)]">
      <div class="aurora-blob aurora-1"></div>
      <div class="aurora-blob aurora-2"></div>
      <div class="aurora-blob aurora-3"></div>

      <div class="relative z-10 max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <div class="inline-flex items-center gap-2 px-4 py-1.5 bg-white/[0.06] border border-white/[0.1] rounded-pill text-indigo-300 text-sm font-body font-semibold mb-6">
            <lucide-icon name="zap" [size]="14"></lucide-icon> THE ANTI-DASHBOARD
          </div>
          <h1 class="text-hero font-display text-white mb-6">
            The AI Creative Strategist That Knows
            <span class="text-gradient">Why Your Ads Work</span>
          </h1>
          <p class="text-lg text-gray-400 font-body mb-8 max-w-lg leading-relaxed">
            Cosmisk decodes your Creative DNA, powers your entire UGC pipeline, and manages multiple brands from one cockpit
            -- so you stop guessing and start scaling what actually converts.
          </p>
          <div class="flex flex-wrap gap-4 mb-6">
            <a routerLink="/signup" class="btn-primary !py-3.5 !px-8 !text-base no-underline hover:shadow-glow hover:scale-[1.02] transition-all duration-300">Start Free Trial</a>
            <button (click)="showDemo.set(true)" class="btn !py-3.5 !px-8 !text-base bg-white/[0.06] border border-white/[0.15] text-white hover:bg-white/[0.1] hover:scale-[1.02] transition-all duration-300" aria-label="Watch product demo">
              <lucide-icon name="play" [size]="16"></lucide-icon> Watch Demo
            </button>
          </div>

          <!-- Email Capture -->
          @if (!heroSubmitted()) {
            <form (submit)="submitHeroEmail(); $event.preventDefault()" class="flex gap-2 max-w-md mb-4">
              <label for="hero-email" class="sr-only">Work email</label>
              <input
                id="hero-email"
                type="email"
                [(ngModel)]="heroEmail"
                name="heroEmail"
                placeholder="Enter your work email"
                required
                class="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white text-sm font-body placeholder:text-gray-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all" />
              <button
                type="submit"
                class="btn-primary !py-2.5 !px-5 !text-sm whitespace-nowrap hover:scale-[1.02] transition-all duration-300">
                Get Early Access
              </button>
            </form>
          } @else {
            <div class="flex items-center gap-2 max-w-md mb-4 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20" role="status">
              <lucide-icon name="check-circle" [size]="16" class="text-green-400"></lucide-icon>
              <span class="text-sm text-green-300 font-body">You're on the list! We'll be in touch soon.</span>
            </div>
          }

          <p class="text-sm text-gray-500 font-body">
            Trusted by <strong class="text-white">500+</strong> e-commerce brands &nbsp;&middot;&nbsp; &#8377;250Cr+ ad spend analyzed
          </p>
        </div>

        <!-- Realistic Hero Dashboard Mockup -->
        <div class="relative hidden lg:block">
          <div class="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden backdrop-blur-sm transform lg:rotate-1 lg:translate-x-4">
            <div class="flex items-center justify-between px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.06]">
              <div class="flex items-center gap-2">
                <span class="text-xs font-display font-bold text-white/80">COSMISK</span>
                <span class="text-[10px] text-gray-500 font-body">/ Creative Cockpit</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-green-400 pulse-ring"></span>
                <span class="text-[10px] text-green-400 font-mono">Analyzing...</span>
              </div>
            </div>
            <div class="px-4 pt-3 pb-2 flex gap-1.5 overflow-hidden">
              <span class="px-2 py-0.5 bg-accent/20 text-accent text-[9px] font-medium rounded-pill border border-accent/30">All DNA</span>
              <span class="px-2 py-0.5 bg-white/[0.06] text-gray-400 text-[9px] font-medium rounded-pill">Hook</span>
              <span class="px-2 py-0.5 bg-white/[0.06] text-gray-400 text-[9px] font-medium rounded-pill">Visual</span>
              <span class="px-2 py-0.5 bg-white/[0.06] text-gray-400 text-[9px] font-medium rounded-pill">Audio</span>
              <span class="px-2 py-0.5 bg-white/[0.06] text-gray-400 text-[9px] font-medium rounded-pill">ROAS > 3x</span>
            </div>
            <div class="px-4 pb-4 grid grid-cols-3 gap-2">
              @for (card of mockCreatives; track card.name) {
                <div class="bg-white/[0.04] rounded-lg border border-white/[0.06] p-2.5 hover:bg-white/[0.06] transition-colors">
                  <div class="aspect-[4/3] rounded mb-2 flex items-center justify-center text-lg" [class]="card.thumbBg">{{ card.emoji }}</div>
                  <div class="flex flex-wrap gap-0.5 mb-1.5">
                    @for (tag of card.tags; track tag.label) {
                      <span class="px-1 py-0.5 text-[7px] font-medium rounded" [class]="tag.cls">{{ tag.label }}</span>
                    }
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-[9px] font-mono font-bold" [class]="card.roas >= 3 ? 'text-green-400' : 'text-white/70'">{{ card.roas }}x</span>
                    <div class="sparkline">
                      @for (h of card.spark; track $index) {
                        <div class="sparkline-bar" [style.height.px]="h"></div>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
          <div class="absolute -top-4 -left-4 bg-white/[0.08] border border-white/[0.1] rounded-xl backdrop-blur-sm px-3 py-2 flex items-center gap-2 animate-float stagger-1">
            <div class="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <lucide-icon name="zap" [size]="16" class="text-amber-300"></lucide-icon>
            </div>
            <span class="text-xs font-body font-semibold text-white">Hook DNA</span>
          </div>
          <div class="absolute -bottom-2 -left-6 bg-white/[0.08] border border-white/[0.1] rounded-xl backdrop-blur-sm px-3 py-2 flex items-center gap-2 animate-float stagger-2">
            <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <lucide-icon name="eye" [size]="16" class="text-blue-300"></lucide-icon>
            </div>
            <span class="text-xs font-body font-semibold text-white">Visual DNA</span>
          </div>
          <div class="absolute -bottom-4 -right-2 bg-white/[0.08] border border-white/[0.1] rounded-xl backdrop-blur-sm px-3 py-2 flex items-center gap-2 animate-float stagger-3">
            <div class="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <lucide-icon name="music" [size]="16" class="text-emerald-300"></lucide-icon>
            </div>
            <span class="text-xs font-body font-semibold text-white">Audio DNA</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Marquee Stats Bar with Count-Up -->
    <section class="bg-dark py-8 border-t border-white/[0.04] overflow-hidden">
      <div class="marquee-track">
        @for (stat of marqueeStats; track $index) {
          <div class="flex items-center gap-8 px-8">
            <div class="text-center min-w-[140px]">
              <p class="text-2xl font-mono font-bold text-white m-0 mb-0.5" [appCountUp]="stat.value">{{ stat.value }}</p>
              <p class="text-sm text-gray-500 font-body m-0">{{ stat.label }}</p>
            </div>
            <span class="w-1 h-1 rounded-full bg-gray-600"></span>
          </div>
        }
      </div>
    </section>

    <!-- Social Proof / Logo Wall -->
    <section class="py-12 bg-[#F7F8FA] border-b border-gray-200">
      <div class="max-w-5xl mx-auto px-6 text-center">
        <p class="text-xs text-gray-400 font-body font-medium uppercase tracking-widest mb-6">Trusted by leading D2C & e-commerce brands</p>
        <div class="flex flex-wrap justify-center items-center gap-x-10 gap-y-4">
          @for (logo of brandLogos; track logo) {
            <span class="text-lg font-display font-bold text-gray-300 tracking-wide select-none hover:text-gray-500 transition-colors duration-300">{{ logo }}</span>
          }
        </div>
      </div>
    </section>

    <!-- Problem -> Solution -->
    <section class="py-20 bg-[#F7F8FA]">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16">
        <div appAnimateOnScroll class="p-8 bg-gray-100 rounded-2xl border border-gray-200 hover:shadow-card-hover transition-shadow duration-300">
          <div class="text-red-500 text-sm font-mono font-bold mb-4">THE PROBLEM</div>
          <h2 class="text-page-title font-display text-navy mb-4">Dashboards show numbers. Not answers.</h2>
          <p class="text-gray-600 font-body leading-relaxed">
            Your media buyer says "ROAS dropped 20% this week." But <em>why</em>? Was it the hook? The visual style?
            The audience? Traditional dashboards can't tell you. You're left guessing.
          </p>
          <div class="mt-6 space-y-3">
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <lucide-icon name="x" [size]="14" class="text-red-400"></lucide-icon>
              No insight into creative performance drivers
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <lucide-icon name="x" [size]="14" class="text-red-400"></lucide-icon>
              Manual analysis takes hours per creative
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <lucide-icon name="x" [size]="14" class="text-red-400"></lucide-icon>
              Winning patterns lost across campaigns
            </div>
          </div>
        </div>

        <div appAnimateOnScroll [aosDelay]="150" class="p-8 bg-white rounded-2xl border border-accent/20 shadow-card hover:shadow-glow transition-shadow duration-300">
          <div class="text-accent text-sm font-mono font-bold mb-4">THE COSMISK WAY</div>
          <h2 class="text-page-title font-display text-navy mb-4">Extract Creative DNA. Know exactly why.</h2>
          <p class="text-gray-600 font-body leading-relaxed">
            Cosmisk uses AI to decode every ad into its fundamental DNA -- the hook that stops the scroll,
            the visuals that hold attention, the audio that drives action.
          </p>
          <div class="mt-6 space-y-3">
            <div class="flex items-center gap-2 text-sm text-navy">
              <lucide-icon name="check" [size]="14" class="text-green-500"></lucide-icon>
              AI-powered Hook, Visual & Audio DNA extraction
            </div>
            <div class="flex items-center gap-2 text-sm text-navy">
              <lucide-icon name="check" [size]="14" class="text-green-500"></lucide-icon>
              Instant creative analysis in seconds
            </div>
            <div class="flex items-center gap-2 text-sm text-navy">
              <lucide-icon name="check" [size]="14" class="text-green-500"></lucide-icon>
              Cross-brand pattern intelligence
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How It Works -->
    <section class="py-20 bg-white">
      <div appAnimateOnScroll class="max-w-7xl mx-auto px-6 text-center mb-16">
        <h2 class="text-page-title font-display text-navy mb-4">How It Works</h2>
        <p class="text-lg text-gray-600 font-body">Three steps to creative intelligence</p>
      </div>
      <div class="max-w-4xl mx-auto px-6">
        <div class="flex flex-col md:flex-row items-center justify-between gap-4">
          <div appAnimateOnScroll class="flex flex-col items-center text-center flex-1">
            <div class="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <lucide-icon name="zap" [size]="28" class="text-accent"></lucide-icon>
            </div>
            <h3 class="text-card-title font-display text-navy mb-1">Connect</h3>
            <p class="text-sm text-gray-600 font-body max-w-[180px]">Link your Meta ad accounts in one click</p>
          </div>
          <div class="hidden md:block flex-1 max-w-[80px] border-t-2 border-dashed border-gray-300 mt-[-24px]"></div>
          <div appAnimateOnScroll [aosDelay]="150" class="flex flex-col items-center text-center flex-1">
            <div class="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <lucide-icon name="brain" [size]="28" class="text-accent"></lucide-icon>
            </div>
            <h3 class="text-card-title font-display text-navy mb-1">Analyze</h3>
            <p class="text-sm text-gray-600 font-body max-w-[180px]">AI extracts Creative DNA from every ad</p>
          </div>
          <div class="hidden md:block flex-1 max-w-[80px] border-t-2 border-dashed border-gray-300 mt-[-24px]"></div>
          <div appAnimateOnScroll [aosDelay]="300" class="flex flex-col items-center text-center flex-1">
            <div class="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <lucide-icon name="sparkles" [size]="28" class="text-accent"></lucide-icon>
            </div>
            <h3 class="text-card-title font-display text-navy mb-1">Create</h3>
            <p class="text-sm text-gray-600 font-body max-w-[180px]">Generate winning creatives from proven DNA</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Interactive DNA Scanner Demo -->
    <section class="py-20 bg-[#F7F8FA]">
      <div appAnimateOnScroll class="max-w-7xl mx-auto px-6 text-center mb-16">
        <h2 class="text-page-title font-display text-navy mb-4">Every Ad Has a DNA</h2>
        <p class="text-lg text-gray-600 font-body max-w-2xl mx-auto">
          Watch Cosmisk scan and decode a sample ad into its three core DNA strands in real time.
        </p>
      </div>

      <div appAnimateOnScroll class="max-w-4xl mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-8 items-center">
          <!-- Sample Ad Preview with Scanner -->
          <div class="relative bg-white rounded-2xl shadow-card border border-divider overflow-hidden">
            <div class="aspect-[4/5] bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 flex flex-col items-center justify-center p-8 relative">
              <!-- Scan line overlay -->
              @if (dnaScanning()) {
                <div class="dna-scan-line"></div>
              }
              <div class="text-4xl mb-4">&#x1F9B4;</div>
              <p class="text-sm font-mono text-navy/60 text-center mb-2">Sample Ad: "Skin Repair Serum"</p>
              <div class="w-32 h-1 bg-gray-200 rounded mb-2"></div>
              <div class="w-24 h-1 bg-gray-200 rounded mb-4"></div>
              <div class="px-4 py-1.5 bg-navy text-white text-xs font-semibold rounded">Shop Now - 40% Off</div>
            </div>
            @if (!dnaScanning() && !dnaRevealed()) {
              <button
                (click)="startDnaScan()"
                class="absolute inset-0 flex items-center justify-center bg-navy/40 cursor-pointer border-0 transition-opacity hover:bg-navy/50"
                aria-label="Start DNA scan demo">
                <div class="bg-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-2">
                  <lucide-icon name="scan" [size]="18" class="text-accent"></lucide-icon>
                  <span class="text-sm font-body font-semibold text-navy">Scan Creative DNA</span>
                </div>
              </button>
            }
          </div>

          <!-- DNA Results Panel -->
          <div class="space-y-4">
            @for (dna of dnaCards; track dna.title; let i = $index) {
              <div
                class="p-5 rounded-xl border transition-all duration-300"
                [class]="dnaRevealed() && dnaRevealStep() > i ? 'bg-white shadow-card border-divider dna-tag-reveal' : 'bg-gray-100 border-gray-200 opacity-40'"
                [style.animation-delay]="(i * 600) + 'ms'">
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center" [ngClass]="dna.bgClass">
                    <lucide-icon [name]="dna.iconName" [size]="20" [ngClass]="dna.iconClass"></lucide-icon>
                  </div>
                  <div>
                    <h3 class="text-sm font-display font-semibold text-navy m-0">{{ dna.title }}</h3>
                    <p class="text-xs text-gray-500 m-0">{{ dna.description }}</p>
                  </div>
                </div>
                @if (dnaRevealed() && dnaRevealStep() > i) {
                  <div class="flex flex-wrap gap-1.5 mt-2">
                    @for (tag of dna.tags; track tag) {
                      <span class="px-2.5 py-1 text-xs rounded-pill font-medium" [ngClass]="dna.tagClass">{{ tag }}</span>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    </section>

    <!-- Feature Showcase -->
    <section class="py-20 bg-white">
      <div class="max-w-7xl mx-auto px-6">
        <div appAnimateOnScroll class="text-center mb-16">
          <h2 class="text-page-title font-display text-navy mb-4">Powerful Features, Simple Experience</h2>
          <p class="text-lg text-gray-600 font-body max-w-2xl mx-auto">
            From analysis to creation to publishing -- everything your creative team needs.
          </p>
        </div>

        <!-- Tabs with ARIA -->
        <div appAnimateOnScroll class="flex justify-center gap-2 mb-12 flex-wrap" role="tablist" aria-label="Feature tabs">
          @for (tab of featureTabs; track tab.id; let i = $index) {
            <button
              (click)="activeTab = i"
              (keydown.arrowRight)="activeTab = (activeTab + 1) % featureTabs.length"
              (keydown.arrowLeft)="activeTab = (activeTab - 1 + featureTabs.length) % featureTabs.length"
              role="tab"
              [attr.aria-selected]="activeTab === i"
              [attr.aria-controls]="'tabpanel-' + tab.id"
              [id]="'tab-' + tab.id"
              class="px-5 py-2.5 rounded-pill text-sm font-body font-medium transition-all duration-300 border-0 cursor-pointer"
              [ngClass]="activeTab === i ? 'bg-accent text-white scale-105 shadow-glow' : 'bg-white text-navy hover:bg-gray-50 hover:scale-[1.02]'">
              {{ tab.title }}
            </button>
          }
        </div>

        <!-- Tab Content -->
        <div
          class="grid lg:grid-cols-2 gap-12 items-center"
          role="tabpanel"
          [id]="'tabpanel-' + featureTabs[activeTab].id"
          [attr.aria-labelledby]="'tab-' + featureTabs[activeTab].id">
          <div class="animate-fade-in">
            <h3 class="text-section-title font-display text-navy mb-4">{{ featureTabs[activeTab].title }}</h3>
            <p class="text-gray-600 font-body mb-6 leading-relaxed">{{ featureTabs[activeTab].description }}</p>
            <ul class="space-y-3 list-none p-0">
              @for (point of featureTabs[activeTab].points; track point) {
                <li class="flex items-start gap-2 text-sm font-body text-navy">
                  <lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>
                  {{ point }}
                </li>
              }
            </ul>
          </div>

          <div class="bg-white rounded-2xl p-6 shadow-card border border-divider">
            @switch (featureTabs[activeTab].id) {
              @case ('cockpit') {
                <div class="bg-[#F7F8FA] rounded-xl p-4">
                  <div class="flex gap-1.5 mb-3">
                    <span class="px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-medium rounded-pill">All</span>
                    <span class="px-2 py-0.5 bg-gray-200 text-gray-500 text-[10px] font-medium rounded-pill">Active</span>
                    <span class="px-2 py-0.5 bg-gray-200 text-gray-500 text-[10px] font-medium rounded-pill">Top 10%</span>
                  </div>
                  <div class="grid grid-cols-3 gap-2">
                    @for (c of cockpitMockCards; track c.roas) {
                      <div class="bg-white rounded-lg p-2 shadow-sm border border-gray-100">
                        <div class="aspect-square rounded bg-gradient-to-br mb-1.5" [class]="c.bg"></div>
                        <div class="flex flex-wrap gap-0.5 mb-1">
                          @for (t of c.tags; track t) {
                            <span class="px-1 py-0.5 bg-amber-100 text-amber-700 text-[7px] font-medium rounded">{{ t }}</span>
                          }
                        </div>
                        <div class="flex items-center justify-between">
                          <span class="text-[9px] font-mono font-bold text-green-600">{{ c.roas }}x</span>
                          <span class="text-[9px] font-mono text-gray-400">{{ c.ctr }}%</span>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
              @case ('director') {
                <div class="bg-[#F7F8FA] rounded-xl p-4 space-y-3">
                  <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                    <p class="text-[10px] text-gray-400 font-body mb-1.5">DNA INPUTS</p>
                    <div class="flex flex-wrap gap-1 mb-2">
                      <span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-medium rounded">Shock Statement</span>
                      <span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[8px] font-medium rounded">Macro Texture</span>
                      <span class="px-1.5 py-0.5 bg-green-100 text-green-700 text-[8px] font-medium rounded">Hindi VO</span>
                    </div>
                    <button class="w-full py-1.5 bg-accent text-white text-[10px] font-semibold rounded border-0 cursor-default">Generate Brief</button>
                  </div>
                  <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                    <p class="text-[10px] text-gray-400 font-body mb-1">PREVIEW</p>
                    <div class="h-20 bg-gradient-to-br from-accent/5 to-blue-50 rounded flex items-center justify-center">
                      <span class="text-[10px] text-accent font-medium">Brief: "Kya aapko pata hai..."</span>
                    </div>
                  </div>
                </div>
              }
              @case ('ugc') {
                <div class="bg-[#F7F8FA] rounded-xl p-4 space-y-3">
                  <div class="flex gap-2 items-center mb-1">
                    @for (avatar of ['A', 'R', 'S', 'P']; track avatar) {
                      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-violet-500 flex items-center justify-center text-white text-xs font-bold">{{ avatar }}</div>
                    }
                    <span class="text-[10px] text-gray-400 font-body ml-1">+8 more</span>
                  </div>
                  <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                    <p class="text-[10px] text-gray-400 font-body mb-1">SCRIPT</p>
                    <div class="space-y-1">
                      <div class="h-2 bg-gray-200 rounded w-full"></div>
                      <div class="h-2 bg-gray-200 rounded w-4/5"></div>
                      <div class="h-2 bg-gray-200 rounded w-3/5"></div>
                    </div>
                  </div>
                  <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                    <p class="text-[10px] text-gray-400 font-body mb-1">VIDEO PREVIEW</p>
                    <div class="aspect-video bg-dark rounded flex items-center justify-center">
                      <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        <lucide-icon name="play" [size]="14" class="text-white"></lucide-icon>
                      </div>
                    </div>
                  </div>
                </div>
              }
              @case ('oracle') {
                <div class="bg-[#F7F8FA] rounded-xl p-4 space-y-2">
                  <div class="flex justify-end">
                    <div class="bg-accent text-white px-3 py-1.5 rounded-xl rounded-br-sm text-[11px] max-w-[75%]">Why did my ROAS drop this week?</div>
                  </div>
                  <div class="flex justify-start">
                    <div class="bg-white px-3 py-2 rounded-xl rounded-bl-sm text-[11px] text-navy max-w-[80%] shadow-sm border border-gray-100">
                      <p class="m-0 mb-1">Your ROAS dropped <strong>18%</strong> because 3 top creatives fatigued. Their <strong>Hook DNA</strong> (Shock Statement) hit frequency cap.</p>
                      <div class="flex gap-1 mt-1.5">
                        <span class="px-1.5 py-0.5 bg-accent/10 text-accent text-[8px] rounded font-medium cursor-default">Iterate Hooks</span>
                        <span class="px-1.5 py-0.5 bg-red-50 text-red-500 text-[8px] rounded font-medium cursor-default">Kill Fatigued</span>
                        <span class="px-1.5 py-0.5 bg-green-50 text-green-600 text-[8px] rounded font-medium cursor-default">Scale Winners</span>
                      </div>
                    </div>
                  </div>
                  <div class="flex justify-start">
                    <div class="bg-white px-3 py-2 rounded-xl rounded-bl-sm shadow-sm border border-gray-100 flex gap-1 items-center">
                      <div class="w-1.5 h-1.5 rounded-full bg-gray-400 typing-dot"></div>
                      <div class="w-1.5 h-1.5 rounded-full bg-gray-400 typing-dot"></div>
                      <div class="w-1.5 h-1.5 rounded-full bg-gray-400 typing-dot"></div>
                    </div>
                  </div>
                </div>
              }
            }
          </div>
        </div>
      </div>
    </section>

    <!-- Cosmisk vs. Manual Comparison Table -->
    <section class="py-20 bg-[#F7F8FA]">
      <div appAnimateOnScroll class="max-w-4xl mx-auto px-6">
        <div class="text-center mb-12">
          <h2 class="text-page-title font-display text-navy mb-4">Cosmisk vs. Doing It Manually</h2>
          <p class="text-lg text-gray-600 font-body">See why teams switch from spreadsheets and gut feeling.</p>
        </div>

        <div class="bg-white rounded-2xl shadow-card border border-divider overflow-hidden">
          <!-- Header -->
          <div class="grid grid-cols-3 bg-[#F7F8FA] border-b border-divider">
            <div class="p-4 text-sm font-body font-semibold text-gray-500">Capability</div>
            <div class="p-4 text-sm font-body font-semibold text-gray-400 text-center">Manual</div>
            <div class="p-4 text-sm font-body font-semibold text-accent text-center">Cosmisk</div>
          </div>
          <!-- Rows -->
          @for (row of comparisonRows; track row.feature) {
            <div class="grid grid-cols-3 border-b border-divider last:border-0 hover:bg-accent/[0.02] transition-colors">
              <div class="p-4 text-sm font-body text-navy">{{ row.feature }}</div>
              <div class="p-4 flex items-center justify-center">
                <span class="text-sm text-gray-400">{{ row.manual }}</span>
              </div>
              <div class="p-4 flex items-center justify-center gap-1.5">
                <lucide-icon name="check" [size]="14" class="text-green-500"></lucide-icon>
                <span class="text-sm text-navy font-medium">{{ row.cosmisk }}</span>
              </div>
            </div>
          }
        </div>
      </div>
    </section>

    <!-- Pricing Preview (Dark) -->
    <section class="py-20 bg-dark-mesh">
      <div appAnimateOnScroll class="max-w-7xl mx-auto px-6 text-center mb-12">
        <h2 class="text-page-title font-display text-white mb-4">Simple Pricing. Powerful Intelligence.</h2>
        <p class="text-lg text-gray-400 font-body mb-8">Start free, scale as you grow.</p>

        <div class="inline-flex items-center gap-3 bg-white/[0.06] rounded-pill px-2 py-1.5 border border-white/[0.08]" role="radiogroup" aria-label="Billing period">
          <button
            (click)="annual.set(false)"
            role="radio"
            [attr.aria-checked]="!annual()"
            class="px-4 py-1.5 rounded-pill text-sm font-body font-medium border-0 cursor-pointer transition-all duration-300"
            [ngClass]="!annual() ? 'bg-white text-navy' : 'bg-transparent text-white/70 hover:text-white'">
            Monthly
          </button>
          <button
            (click)="annual.set(true)"
            role="radio"
            [attr.aria-checked]="annual()"
            class="px-4 py-1.5 rounded-pill text-sm font-body font-medium border-0 cursor-pointer transition-all duration-300"
            [ngClass]="annual() ? 'bg-white text-navy' : 'bg-transparent text-white/70 hover:text-white'">
            Annual
            <span class="ml-1 px-1.5 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded-pill">Save 20%</span>
          </button>
        </div>
      </div>

      <div class="max-w-5xl mx-auto px-6 grid md:grid-cols-3 gap-6">
        @for (plan of plans; track plan.name; let i = $index) {
          <div
            appAnimateOnScroll [aosDelay]="i * 100"
            class="rounded-2xl p-8 transition-all duration-300 hover:-translate-y-2"
            [ngClass]="plan.featured ? 'bg-white text-navy ring-2 ring-accent shadow-glow hover:shadow-glow-lg' : 'bg-white/[0.03] text-white border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.05]'">
            @if (plan.featured) {
              <div class="text-center mb-2">
                <span class="px-3 py-1 bg-accent/10 text-accent text-xs font-bold rounded-pill">MOST POPULAR</span>
              </div>
            }
            <h3 class="text-card-title font-display mb-1 text-center" [ngClass]="plan.featured ? 'text-navy' : 'text-white'">{{ plan.name }}</h3>
            <div class="text-center mb-6">
              <span class="text-metric-lg font-mono" [ngClass]="plan.featured ? 'text-navy' : 'text-white'">
                {{ annual() ? plan.annualPrice : plan.price }}
              </span>
              <span class="text-sm" [ngClass]="plan.featured ? 'text-gray-500' : 'text-gray-400'">/month</span>
              @if (annual()) {
                <div class="text-xs text-gray-400 mt-1">billed annually</div>
              }
            </div>
            <ul class="space-y-2 mb-8 list-none p-0">
              @for (f of plan.features; track f) {
                <li class="flex items-center gap-2 text-sm font-body" [ngClass]="plan.featured ? 'text-gray-600' : 'text-gray-300'">
                  <lucide-icon name="check" [size]="14" class="text-green-500"></lucide-icon>
                  {{ f }}
                </li>
              }
            </ul>
            <a
              [routerLink]="'/signup'"
              class="block text-center py-3 rounded-lg font-body font-semibold text-sm transition-all duration-300 no-underline hover:scale-[1.02]"
              [ngClass]="plan.featured ? 'bg-accent text-white hover:bg-accent-hover hover:shadow-glow' : 'bg-white/[0.06] text-white border border-white/[0.15] hover:bg-white/[0.1]'">
              Start Free Trial
            </a>
          </div>
        }
      </div>
    </section>

    <!-- Testimonials Carousel -->
    <section class="py-20 bg-[#F7F8FA]">
      <div class="max-w-7xl mx-auto px-6">
        <div appAnimateOnScroll class="text-center mb-16">
          <h2 class="text-page-title font-display text-navy mb-4">Loved by Performance Marketers</h2>
        </div>

        <!-- Carousel container -->
        <div class="relative overflow-hidden">
          <div class="testimonial-track flex" [style.transform]="'translateX(-' + (testimonialPage() * 100) + '%)'">
            <!-- Page 1: first 3 -->
            <div class="min-w-full grid md:grid-cols-3 gap-8 px-1">
              @for (t of testimonials.slice(0, 3); track t.name; let i = $index) {
                <div class="card !p-8 hover:border-accent/20 hover:shadow-card-hover transition-all duration-300">
                  <!-- Star rating -->
                  <div class="flex gap-0.5 mb-3">
                    @for (s of [1,2,3,4,5]; track s) {
                      <lucide-icon name="star" [size]="14" class="text-amber-400" style="fill: #FBBF24;"></lucide-icon>
                    }
                  </div>
                  <p class="text-gray-600 font-body text-sm italic mb-6 leading-relaxed">"{{ t.quote }}"</p>
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" [style.background]="t.gradient">
                      {{ t.initials }}
                    </div>
                    <div>
                      <p class="text-sm font-body font-semibold text-navy m-0">{{ t.name }}</p>
                      <p class="text-xs text-gray-500 m-0">{{ t.role }}</p>
                    </div>
                  </div>
                  @if (t.metric) {
                    <div class="mt-4 pt-4 border-t border-divider">
                      <span class="text-xs font-mono text-accent font-bold">{{ t.metric }}</span>
                    </div>
                  }
                </div>
              }
            </div>
            <!-- Page 2: next 3 -->
            <div class="min-w-full grid md:grid-cols-3 gap-8 px-1">
              @for (t of testimonials.slice(3, 6); track t.name; let i = $index) {
                <div class="card !p-8 hover:border-accent/20 hover:shadow-card-hover transition-all duration-300">
                  <div class="flex gap-0.5 mb-3">
                    @for (s of [1,2,3,4,5]; track s) {
                      <lucide-icon name="star" [size]="14" class="text-amber-400" style="fill: #FBBF24;"></lucide-icon>
                    }
                  </div>
                  <p class="text-gray-600 font-body text-sm italic mb-6 leading-relaxed">"{{ t.quote }}"</p>
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" [style.background]="t.gradient">
                      {{ t.initials }}
                    </div>
                    <div>
                      <p class="text-sm font-body font-semibold text-navy m-0">{{ t.name }}</p>
                      <p class="text-xs text-gray-500 m-0">{{ t.role }}</p>
                    </div>
                  </div>
                  @if (t.metric) {
                    <div class="mt-4 pt-4 border-t border-divider">
                      <span class="text-xs font-mono text-accent font-bold">{{ t.metric }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Carousel dots -->
          <div class="flex justify-center gap-2 mt-8">
            @for (page of [0, 1]; track page) {
              <button
                (click)="testimonialPage.set(page)"
                class="h-2 rounded-full border-0 cursor-pointer transition-all duration-300 carousel-dot"
                [ngClass]="testimonialPage() === page ? 'bg-accent w-6 carousel-dot-active' : 'bg-gray-300 w-2 hover:bg-gray-400'"
                [attr.aria-label]="'Testimonials page ' + (page + 1)"
                [attr.aria-current]="testimonialPage() === page ? 'true' : null">
              </button>
            }
          </div>
        </div>
      </div>
    </section>

    <!-- Final CTA (Dark) -->
    <section class="py-24 bg-dark-mesh text-center">
      <div appAnimateOnScroll class="max-w-3xl mx-auto px-6">
        <h2 class="text-page-title lg:text-hero font-display text-white mb-6">
          Your Ads Have a DNA.<br><span class="text-gradient">Let's Decode It.</span>
        </h2>
        <a routerLink="/signup" class="btn-primary !py-4 !px-10 !text-lg no-underline hover:shadow-glow hover:scale-[1.03] transition-all duration-300">Start Free Trial</a>
        <p class="text-sm text-gray-500 font-body mt-4">No credit card &middot; 14-day free trial &middot; Cancel anytime</p>
      </div>
    </section>

    <!-- Demo Modal -->
    @if (showDemo()) {
      <div class="modal-backdrop" (click)="showDemo.set(false)" role="dialog" aria-modal="true" aria-label="Watch demo">
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <button (click)="showDemo.set(false)" class="absolute top-4 right-4 p-1 bg-transparent border-0 cursor-pointer text-gray-400 hover:text-navy transition-colors" aria-label="Close modal">
            <lucide-icon name="x" [size]="20"></lucide-icon>
          </button>
          <div class="text-center mb-6">
            <div class="w-12 h-12 mx-auto rounded-xl bg-accent/10 flex items-center justify-center mb-3">
              <lucide-icon name="play" [size]="24" class="text-accent"></lucide-icon>
            </div>
            <h3 class="text-section-title font-display text-navy mb-2">See Cosmisk in Action</h3>
            <p class="text-sm text-gray-500 font-body">Our product demo is coming soon. Get notified when it's ready.</p>
          </div>
          <div class="aspect-video bg-[#F7F8FA] rounded-xl mb-6 flex items-center justify-center border border-gray-200">
            <div class="text-center">
              <lucide-icon name="video" [size]="32" class="text-gray-300 mb-2"></lucide-icon>
              <p class="text-sm text-gray-400 font-body m-0">Demo video coming soon</p>
            </div>
          </div>
          @if (!demoSubmitted()) {
            <form (submit)="submitDemoEmail(); $event.preventDefault()" class="flex gap-2">
              <label for="demo-email" class="sr-only">Email for demo notification</label>
              <input
                id="demo-email"
                type="email"
                [(ngModel)]="demoEmail"
                name="demoEmail"
                placeholder="Enter your email"
                required
                class="input flex-1" />
              <button type="submit" class="btn-primary !px-5 whitespace-nowrap">Notify Me</button>
            </form>
          } @else {
            <div class="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-200" role="status">
              <lucide-icon name="check-circle" [size]="16" class="text-green-500"></lucide-icon>
              <span class="text-sm text-green-700 font-body">Got it! We'll notify you when the demo is live.</span>
            </div>
          }
        </div>
      </div>
    }
  `
})
export default class LandingComponent implements OnInit, OnDestroy {
  activeTab = 0;
  annual = signal(false);
  showDemo = signal(false);
  heroEmail = '';
  heroSubmitted = signal(false);
  demoEmail = '';
  demoSubmitted = signal(false);
  testimonialPage = signal(0);
  private carouselInterval?: ReturnType<typeof setInterval>;

  // DNA Scanner state
  dnaScanning = signal(false);
  dnaRevealed = signal(false);
  dnaRevealStep = signal(0);
  private scanTimeouts: ReturnType<typeof setTimeout>[] = [];

  ngOnInit() {
    this.carouselInterval = setInterval(() => {
      this.testimonialPage.set((this.testimonialPage() + 1) % 2);
    }, 6000);
  }

  ngOnDestroy() {
    if (this.carouselInterval) clearInterval(this.carouselInterval);
    this.scanTimeouts.forEach(t => clearTimeout(t));
  }

  startDnaScan() {
    this.dnaScanning.set(true);
    this.dnaRevealed.set(false);
    this.dnaRevealStep.set(0);

    // After 1s start revealing DNA strands one by one
    this.scanTimeouts.push(setTimeout(() => {
      this.dnaRevealed.set(true);
      this.dnaRevealStep.set(1);
    }, 1000));
    this.scanTimeouts.push(setTimeout(() => this.dnaRevealStep.set(2), 1600));
    this.scanTimeouts.push(setTimeout(() => {
      this.dnaRevealStep.set(3);
      this.dnaScanning.set(false);
    }, 2200));
  }

  submitHeroEmail() {
    if (this.heroEmail.includes('@')) {
      this.heroSubmitted.set(true);
    }
  }

  submitDemoEmail() {
    if (this.demoEmail.includes('@')) {
      this.demoSubmitted.set(true);
    }
  }

  brandLogos = ['Nectar', 'Urban Drape', 'FreshBase', 'The Skin Co.', 'Dhan Foods', 'FlexFit', 'MintLeaf', 'PurePlay'];

  stats = [
    { value: '\u20B9250Cr+', label: 'Ad Spend Analyzed' },
    { value: '3.2x', label: 'Avg ROAS Improvement' },
    { value: '500+', label: 'Brands Trust Cosmisk' },
    { value: '<20min', label: 'Data to Creative Brief' },
  ];

  marqueeStats = [...this.stats, ...this.stats];

  mockCreatives = [
    { name: 'c1', emoji: '\uD83D\uDCF1', thumbBg: 'bg-gradient-to-br from-amber-900/30 to-amber-700/20', roas: 4.8, tags: [{ label: 'Shock', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'Macro', cls: 'bg-blue-500/20 text-blue-300' }], spark: [4, 8, 6, 12, 10, 14, 11] },
    { name: 'c2', emoji: '\uD83C\uDFA5', thumbBg: 'bg-gradient-to-br from-blue-900/30 to-blue-700/20', roas: 3.2, tags: [{ label: 'Curiosity', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'UGC', cls: 'bg-blue-500/20 text-blue-300' }], spark: [6, 5, 9, 7, 11, 8, 10] },
    { name: 'c3', emoji: '\uD83D\uDED2', thumbBg: 'bg-gradient-to-br from-emerald-900/30 to-emerald-700/20', roas: 5.1, tags: [{ label: 'Price', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'Hindi', cls: 'bg-emerald-500/20 text-emerald-300' }], spark: [3, 7, 5, 10, 14, 12, 16] },
    { name: 'c4', emoji: '\uD83C\uDF1F', thumbBg: 'bg-gradient-to-br from-violet-900/30 to-violet-700/20', roas: 2.4, tags: [{ label: 'Authority', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'Warm', cls: 'bg-blue-500/20 text-blue-300' }], spark: [8, 6, 4, 5, 3, 6, 4] },
    { name: 'c5', emoji: '\uD83D\uDE80', thumbBg: 'bg-gradient-to-br from-pink-900/30 to-pink-700/20', roas: 3.9, tags: [{ label: 'Social', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'ASMR', cls: 'bg-emerald-500/20 text-emerald-300' }], spark: [5, 9, 11, 8, 13, 10, 12] },
    { name: 'c6', emoji: '\uD83D\uDCA1', thumbBg: 'bg-gradient-to-br from-cyan-900/30 to-cyan-700/20', roas: 4.3, tags: [{ label: 'Demo', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'Upbeat', cls: 'bg-emerald-500/20 text-emerald-300' }], spark: [7, 10, 8, 14, 11, 15, 13] },
  ];

  cockpitMockCards = [
    { bg: 'from-amber-50 to-orange-50', tags: ['Shock', 'Macro'], roas: '4.8', ctr: '3.2' },
    { bg: 'from-blue-50 to-indigo-50', tags: ['Curiosity', 'UGC'], roas: '3.2', ctr: '2.8' },
    { bg: 'from-green-50 to-emerald-50', tags: ['Price', 'Hindi'], roas: '5.1', ctr: '4.1' },
    { bg: 'from-violet-50 to-purple-50', tags: ['Authority'], roas: '2.4', ctr: '1.9' },
    { bg: 'from-pink-50 to-rose-50', tags: ['Social', 'ASMR'], roas: '3.9', ctr: '3.0' },
    { bg: 'from-cyan-50 to-teal-50', tags: ['Demo', 'Upbeat'], roas: '4.3', ctr: '3.5' },
  ];

  dnaCards = [
    {
      title: 'Hook DNA', iconName: 'zap', iconClass: 'text-dna-hook-text',
      bgClass: 'bg-dna-hook-bg',
      tagClass: 'bg-dna-hook-bg text-dna-hook-text',
      description: 'The opening that stops the scroll. Is it a shock statement, a price anchor, or social proof?',
      tags: ['Shock Statement', 'Price Anchor', 'Curiosity', 'Authority'],
    },
    {
      title: 'Visual DNA', iconName: 'eye', iconClass: 'text-dna-visual-text',
      bgClass: 'bg-dna-visual-bg',
      tagClass: 'bg-dna-visual-bg text-dna-visual-text',
      description: 'The visual language that holds attention. Macro textures, warm palettes, UGC style, or product-focused.',
      tags: ['Macro Texture', 'Warm Palette', 'UGC Style', 'Product Focus'],
    },
    {
      title: 'Audio DNA', iconName: 'music', iconClass: 'text-dna-audio-text',
      bgClass: 'bg-dna-audio-bg',
      tagClass: 'bg-dna-audio-bg text-dna-audio-text',
      description: 'The audio signature that drives emotion. Hindi voiceover, ASMR, upbeat music, or trending sounds.',
      tags: ['Hindi VO', 'Upbeat', 'ASMR', 'Emotional'],
    },
  ];

  featureTabs = [
    {
      id: 'cockpit', title: 'Creative Cockpit',
      description: 'See all your creatives with their DNA at a glance. Filter by hook type, visual style, status, and more.',
      points: ['Grid view with DNA badges on every creative', 'Filter by Hook, Visual, Audio DNA types', 'Instant ROAS/CTR/CPA metrics', 'Frame-by-frame DNA analysis for videos'],
    },
    {
      id: 'director', title: 'Director Lab',
      description: 'Generate creative briefs based on winning DNA patterns. AI creates the concept, you approve and publish.',
      points: ['AI-generated briefs from winning patterns', 'Static + video variations in minutes', 'Publish directly to Meta Ads Manager', 'Pre-filled with your top-performing DNA'],
    },
    {
      id: 'ugc', title: 'UGC Studio',
      description: 'Create UGC-style ad videos using AI avatars. No human creators needed. Script to video in under a minute.',
      points: ['12+ diverse AI avatars', 'AI script generation from DNA patterns', 'Hindi + English voiceover support', 'Direct publish to Meta campaigns'],
    },
    {
      id: 'oracle', title: 'AI Oracle',
      description: 'Ask anything about your ads in natural language. Get data-backed answers with actionable recommendations.',
      points: ['"Why did my ROAS drop this week?"', 'Answers with specific creative data', 'Inline action buttons (scale, kill, iterate)', 'Streaming AI responses in real-time'],
    },
  ];

  comparisonRows = [
    { feature: 'Creative analysis time', manual: '2-4 hours', cosmisk: 'Under 30 seconds' },
    { feature: 'Pattern detection', manual: 'Gut feeling', cosmisk: 'AI-powered DNA' },
    { feature: 'Brief generation', manual: '45 min per brief', cosmisk: '1-click from DNA' },
    { feature: 'UGC production', manual: '5-7 day turnaround', cosmisk: 'Script to video in <1 min' },
    { feature: 'Multi-brand management', manual: 'Separate logins', cosmisk: 'One cockpit' },
    { feature: 'Creative fatigue alerts', manual: 'Missed until ROAS drops', cosmisk: 'Real-time AI alerts' },
    { feature: 'Cross-brand intelligence', manual: 'Not possible', cosmisk: 'Brain auto-syncs patterns' },
  ];

  plans = [
    {
      name: 'Starter', price: '\u20B94,999', annualPrice: '\u20B93,999', featured: false,
      features: ['1 brand', '5 ad accounts', 'Creative Cockpit', 'Basic DNA (Hook only)', '10 AI queries/day'],
    },
    {
      name: 'Growth', price: '\u20B914,999', annualPrice: '\u20B911,999', featured: true,
      features: ['3 brands', 'Unlimited accounts', 'Full DNA analysis', 'Director Lab + UGC Studio', '50 AI queries/day', 'Lighthouse pacing'],
    },
    {
      name: 'Scale', price: '\u20B929,999', annualPrice: '\u20B923,999', featured: false,
      features: ['Unlimited brands', 'Agency Command Center', 'Cross-brand Brain', 'White-label reports', 'Unlimited AI queries', 'Dedicated CSM'],
    },
  ];

  testimonials = [
    {
      quote: 'Cosmisk changed how we think about creative. We went from guessing to knowing exactly why our best ads work.',
      name: 'Rajesh Gupta', initials: 'RG', role: 'Founder, Nectar Supplements',
      metric: '4.8x ROAS \u2192 from 2.1x in 3 months',
      gradient: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
    },
    {
      quote: 'Managing 35 brands became 10x easier. The Creative DNA concept is brilliant \u2014 our clients love the reports.',
      name: 'Priya Sharma', initials: 'PS', role: 'CEO, AdScale Agency',
      metric: '35 brands managed with 4-person team',
      gradient: 'linear-gradient(135deg, #EC4899, #F43F5E)',
    },
    {
      quote: 'We reduced our creative production time by 60% using Director Lab and UGC Studio. Game changer for D2C.',
      name: 'Amit Patel', initials: 'AP', role: 'CMO, Urban Drape',
      metric: '60% faster creative production',
      gradient: 'linear-gradient(135deg, #10B981, #14B8A6)',
    },
    {
      quote: 'The AI Oracle predicted which hooks would fatigue before they did. Saved us lakhs in wasted spend.',
      name: 'Neha Verma', initials: 'NV', role: 'Performance Lead, FreshBase',
      metric: '\u20B912L saved in 1 month',
      gradient: 'linear-gradient(135deg, #F59E0B, #F97316)',
    },
    {
      quote: 'Cross-brand Brain is magic. Winning patterns from our skincare brand auto-applied to supplements. Both saw ROAS lift.',
      name: 'Karan Mehta', initials: 'KM', role: 'Founder, The Skin Co.',
      metric: '2 brands, shared DNA intelligence',
      gradient: 'linear-gradient(135deg, #3B82F6, #6366F1)',
    },
    {
      quote: 'UGC Studio replaced our 3-week creator pipeline. We now ship 10 UGC ads per week with AI avatars.',
      name: 'Simran Kaur', initials: 'SK', role: 'Growth Manager, FlexFit',
      metric: '10 UGC ads/week (was 2/month)',
      gradient: 'linear-gradient(135deg, #8B5CF6, #A855F7)',
    },
  ];
}
