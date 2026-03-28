import { Component, signal, OnInit, OnDestroy, AfterViewInit, ElementRef, NgZone, inject, ViewChild, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
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

    /* === Animated Product Showcases === */

    /* Card fly-in for cockpit grid */
    .card-fly-in {
      opacity: 0;
      transform: translateY(24px) scale(0.95);
      animation: card-fly-in 0.5s ease-out forwards;
    }
    @keyframes card-fly-in {
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Sparkline bar grow */
    .bar-grow {
      transform-origin: bottom;
      animation: bar-grow 0.6s ease-out forwards;
      transform: scaleY(0);
    }
    @keyframes bar-grow {
      to { transform: scaleY(1); }
    }

    /* ROAS badge pop */
    .roas-badge-pop {
      animation: roas-pop 0.3s ease-out forwards;
      opacity: 0; transform: scale(0.6);
    }
    @keyframes roas-pop {
      to { opacity: 1; transform: scale(1); }
    }

    /* Chat message slide-in */
    .chat-msg-in {
      opacity: 0;
      transform: translateY(12px);
      animation: chat-msg-in 0.4s ease-out forwards;
    }
    @keyframes chat-msg-in {
      to { opacity: 1; transform: translateY(0); }
    }

    /* Type-text cursor blink */
    .type-cursor::after {
      content: '|';
      animation: cursor-blink 0.7s step-end infinite;
      color: #6366F1;
      font-weight: bold;
    }
    @keyframes cursor-blink {
      50% { opacity: 0; }
    }

    /* Metric glow */
    .metric-glow {
      animation: metric-glow 2s ease-in-out infinite;
    }
    @keyframes metric-glow {
      0%, 100% { text-shadow: 0 0 8px rgba(99, 102, 241, 0.3); }
      50% { text-shadow: 0 0 20px rgba(99, 102, 241, 0.6); }
    }

    /* ROAS highlight in chat */
    .roas-highlight {
      color: #6366F1;
      font-weight: 700;
      text-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
    }

    /* Action button slide-in */
    .action-btn-in {
      opacity: 0;
      transform: translateX(-8px);
      animation: action-btn-in 0.3s ease-out forwards;
    }
    @keyframes action-btn-in {
      to { opacity: 1; transform: translateX(0); }
    }

    /* KPI card animate in */
    .kpi-card-in {
      opacity: 0;
      transform: translateY(20px);
      animation: kpi-card-in 0.6s ease-out forwards;
    }
    @keyframes kpi-card-in {
      to { opacity: 1; transform: translateY(0); }
    }

    /* KPI glow bg */
    .kpi-glow {
      position: relative;
    }
    .kpi-glow::before {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 20px;
      background: radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%);
      z-index: -1;
      animation: kpi-bg-glow 3s ease-in-out infinite;
    }
    @keyframes kpi-bg-glow {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }

    /* Change badge pulse */
    .change-pulse {
      animation: change-pulse 2s ease-in-out infinite;
    }
    @keyframes change-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.3); }
      50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
    }

    /* Big counter section */
    .counter-glow {
      text-shadow: 0 0 30px rgba(99, 102, 241, 0.3);
    }

    /* Feature Showcase */
    .feature-showcase-inner {
      will-change: auto;
    }
    .feature-showcase-inner [class*="showcase-"] {
      transition: opacity 0.4s ease, transform 0.4s ease;
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .feature-showcase-inner [class*="showcase-"] {
        transition: none !important;
      }
      .card-fly-in, .bar-grow, .roas-badge-pop, .chat-msg-in,
      .action-btn-in, .kpi-card-in, .change-pulse, .metric-glow {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
      .type-cursor::after { animation: none !important; }
      .kpi-glow::before { animation: none !important; }
    }
  `],
  template: `
    <!-- ============================================================ -->
    <!-- SECTION 1: Hero (Dark) with Aurora                           -->
    <!-- ============================================================ -->
    <section class="relative overflow-hidden bg-dark-mesh py-24 lg:py-36 -mt-[72px] pt-[calc(6rem+72px)] lg:pt-[calc(9rem+72px)]">
      <div class="aurora-blob aurora-1"></div>
      <div class="aurora-blob aurora-2"></div>
      <div class="aurora-blob aurora-3"></div>

      <div class="relative z-10 max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <div class="inline-flex items-center gap-2 px-4 py-1.5 bg-white/[0.06] border border-white/[0.1] rounded-pill text-indigo-300 text-sm font-body font-semibold mb-6">
            <lucide-icon name="zap" [size]="14"></lucide-icon> AI-POWERED CREATIVE INTELLIGENCE
          </div>
          <h1 class="text-hero font-display text-white mb-6">
            Decode Why Ads Work.
            <span class="text-gradient">Generate What Works Next.</span>
          </h1>
          <p class="text-lg text-gray-400 font-body mb-8 max-w-lg leading-relaxed">
            One person + Cosmisk = the creative output of an entire agency team.
          </p>
          <div class="flex flex-wrap gap-4 mb-6">
            <a routerLink="/signup" class="btn-primary !py-3.5 !px-8 !text-base no-underline hover:shadow-glow hover:scale-[1.02] transition-all duration-300">Start Free Trial</a>
            <a routerLink="/score" class="btn !py-3.5 !px-8 !text-base bg-white/[0.06] border border-white/[0.15] text-white hover:bg-white/[0.1] hover:scale-[1.02] transition-all duration-300 no-underline flex items-center gap-2" aria-label="Try free creative score">
              <lucide-icon name="target" [size]="16"></lucide-icon> Score Your Ad Free
            </a>
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
            100+ creative patterns &nbsp;&middot;&nbsp; 6 AI agents working 24/7 &nbsp;&middot;&nbsp; 10+ creative formats &nbsp;&middot;&nbsp; &lt; 60s UGC generation
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

    <!-- ============================================================ -->
    <!-- SECTION 2: Logo Wall (light marquee)                         -->
    <!-- ============================================================ -->
    <section class="py-16 bg-white border-t border-b border-gray-200 overflow-hidden">
      <div class="max-w-5xl mx-auto px-6 text-center mb-8">
        <p class="text-xs text-gray-400 font-body font-medium uppercase tracking-[0.2em] mb-0">Built for brands and agencies in these categories</p>
      </div>
      <div class="marquee-track">
        @for (logo of marqueeLogos; track $index) {
          <div class="flex items-center gap-8 px-4">
            <span class="font-mono font-bold text-gray-300 tracking-wider text-lg whitespace-nowrap select-none">{{ logo }}</span>
            <span class="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0"></span>
          </div>
        }
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- SECTION 3: Problem -> Solution (KEPT)                        -->
    <!-- ============================================================ -->
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

    <!-- ============================================================ -->
    <!-- SECTION 4: How It Works (Redesigned with numbered steps)     -->
    <!-- ============================================================ -->
    <section class="py-20 bg-white">
      <div appAnimateOnScroll class="max-w-7xl mx-auto px-6 text-center mb-16">
        <h2 class="text-page-title font-display text-navy mb-4">How It Works</h2>
        <p class="text-lg text-gray-600 font-body">Five steps from data to 100+ winning creatives</p>
      </div>
      <div class="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-6">
        @for (step of howItWorksSteps; track step.num; let i = $index) {
          <div appAnimateOnScroll [aosDelay]="i * 100" class="relative text-center p-6">
            <div class="absolute inset-0 flex items-start justify-center pointer-events-none">
              <span class="text-6xl font-mono font-bold text-accent/[0.06] leading-none mt-2">{{ step.num }}</span>
            </div>
            <div class="relative z-10 flex flex-col items-center">
              <div class="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                <lucide-icon [name]="step.icon" [size]="22" class="text-accent"></lucide-icon>
              </div>
              <h3 class="text-card-title font-display text-navy mb-2">{{ step.title }}</h3>
              <p class="text-xs text-gray-600 font-body leading-relaxed max-w-[200px]">{{ step.desc }}</p>
            </div>
          </div>
        }
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- SECTION 5: DNA Scanner (KEPT)                                -->
    <!-- ============================================================ -->
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

    <!-- ============================================================ -->
    <!-- SECTIONS 6-9: Pinned Feature Showcase (Desktop)               -->
    <!-- ============================================================ -->
    <section class="hidden lg:block bg-[#F7F8FA]">
      <div #featureShowcase class="feature-showcase" style="height: 600vh">
        <div class="feature-showcase-inner sticky top-0 h-screen flex items-center overflow-hidden">
          <div class="max-w-7xl mx-auto px-6 w-full">
            <!-- Progress Indicator (fixed left edge) -->
            <div class="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col items-center z-20">
              <div class="relative flex flex-col items-center">
                <!-- Track line background -->
                <div class="absolute top-2 bottom-2 w-0.5 bg-gray-200 rounded-full"></div>
                <!-- Track line fill -->
                <div #progressFill class="absolute top-2 w-0.5 bg-accent rounded-full transition-none" style="height: 0%"></div>
                @for (feat of showcaseFeatures; track feat.key; let i = $index) {
                  <div class="relative flex items-center gap-2 py-5">
                    <div #progressDot
                      class="w-2.5 h-2.5 rounded-full border-2 transition-all duration-300 z-10 flex-shrink-0"
                      [class]="activeShowcaseIndex() === i ? 'bg-accent border-accent scale-150' : 'bg-white border-gray-300'">
                    </div>
                  </div>
                }
              </div>
            </div>

            <div class="grid lg:grid-cols-2 gap-12 items-center">

              <!-- Text Panel (left col) -->
              <div class="relative min-h-[320px]">
                @for (feat of showcaseFeatures; track feat.key; let i = $index) {
                  <div #showcaseText
                    class="absolute inset-0 flex flex-col justify-center"
                    [style.opacity]="activeShowcaseIndex() === i ? 1 : 0"
                    [style.transform]="activeShowcaseIndex() === i ? 'translateY(0)' : (activeShowcaseIndex() > i ? 'translateY(-30px)' : 'translateY(30px)')">
                    <span class="font-mono text-xs font-bold uppercase tracking-[0.2em] text-accent mb-4 block">{{ feat.label }}</span>
                    <h2 class="text-page-title font-display text-navy mb-4">{{ feat.heading }}</h2>
                    <p class="text-gray-600 font-body mb-6 leading-relaxed">{{ feat.desc }}</p>
                    <ul class="space-y-3 list-none p-0">
                      @for (bullet of feat.bullets; track bullet) {
                        <li class="flex items-start gap-2 text-sm font-body text-navy">
                          <lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>
                          {{ bullet }}
                        </li>
                      }
                    </ul>
                  </div>
                }
              </div>

              <!-- Mockup Panel (right col) -->
              <div class="relative min-h-[380px]">
                <!-- Creative Engine Mockup -->
                <div #showcaseMockup class="absolute inset-0 flex items-center justify-center transition-none" style="opacity: 0">
                  <div class="bg-white rounded-2xl p-6 shadow-card border border-divider w-full">
                    <div class="bg-[#F7F8FA] rounded-xl p-4 space-y-3">
                      <div class="flex items-center justify-between mb-2">
                        <span class="text-[10px] font-mono font-bold text-accent">SPRINT #4 — GENERATING</span>
                        <span class="px-2 py-0.5 bg-green-100 text-green-700 text-[8px] font-medium rounded-pill">78/120 done</span>
                      </div>
                      <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full bg-accent rounded-full" style="width: 65%"></div>
                      </div>
                      <div class="grid grid-cols-3 gap-2">
                        <div class="bg-white rounded-lg p-2 shadow-sm border border-gray-100 text-center">
                          <span class="text-[8px] text-gray-400 font-body block">UGC Videos</span>
                          <span class="text-sm font-mono font-bold text-accent">30</span>
                        </div>
                        <div class="bg-white rounded-lg p-2 shadow-sm border border-gray-100 text-center">
                          <span class="text-[8px] text-gray-400 font-body block">Static Ads</span>
                          <span class="text-sm font-mono font-bold text-accent">45</span>
                        </div>
                        <div class="bg-white rounded-lg p-2 shadow-sm border border-gray-100 text-center">
                          <span class="text-[8px] text-gray-400 font-body block">Carousels</span>
                          <span class="text-sm font-mono font-bold text-accent">15</span>
                        </div>
                      </div>
                      <div class="bg-white rounded-lg p-2 shadow-sm border border-gray-100">
                        <div class="flex items-center gap-2">
                          <span class="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-[8px]">92</span>
                          <div class="flex-1">
                            <span class="text-[9px] font-body text-navy block">UGC: Hindi Shock Statement + Macro Texture</span>
                            <span class="text-[8px] text-gray-400">Win probability: 92%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Cockpit Mockup -->
                <div #showcaseMockup class="absolute inset-0 flex items-center justify-center transition-none" style="opacity: 0">
                  <div class="bg-white rounded-2xl p-6 shadow-card border border-divider w-full">
                    <div class="bg-[#F7F8FA] rounded-xl p-4">
                      <div class="flex gap-1.5 mb-3">
                        <span class="px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-medium rounded-pill">All</span>
                        <span class="px-2 py-0.5 bg-gray-200 text-gray-500 text-[10px] font-medium rounded-pill">Active</span>
                        <span class="px-2 py-0.5 bg-gray-200 text-gray-500 text-[10px] font-medium rounded-pill">Top 10%</span>
                      </div>
                      <div class="grid grid-cols-3 gap-2">
                        @for (c of cockpitMockCards; track c.roas; let i = $index) {
                          <div class="bg-white rounded-lg p-2 shadow-sm border border-gray-100 showcase-cockpit-card" [style.animation-delay]="(i * 80) + 'ms'">
                            <div class="aspect-square rounded bg-gradient-to-br mb-1.5" [class]="c.bg"></div>
                            <div class="flex flex-wrap gap-0.5 mb-1">
                              @for (t of c.tags; track t; let ti = $index) {
                                <span class="px-1 py-0.5 text-[7px] font-medium rounded"
                                  [class]="ti === 0 ? 'bg-amber-100 text-amber-700' : ti === 1 ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'">{{ t }}</span>
                              }
                            </div>
                            <div class="flex items-center justify-between">
                              <span class="text-[9px] font-mono font-bold"
                                [class]="(+c.roas) >= 3 ? 'text-green-600' : (+c.roas) < 1 ? 'text-red-500' : 'text-gray-600'">{{ c.roas }}x</span>
                              <div class="sparkline">
                                @for (h of c.spark; track $index) {
                                  <div class="sparkline-bar" [style.height.px]="h"></div>
                                }
                              </div>
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Competitor Intelligence Mockup -->
                <div #showcaseMockup class="absolute inset-0 flex items-center justify-center transition-none" style="opacity: 0">
                  <div class="bg-white rounded-2xl p-6 shadow-card border border-divider w-full">
                    <div class="bg-[#F7F8FA] rounded-xl p-4 space-y-3">
                      <div class="flex items-center justify-between mb-1">
                        <span class="text-[10px] font-mono font-bold text-red-500">COMPETITOR SPY</span>
                        <span class="text-[8px] text-gray-400">Meta Ad Library</span>
                      </div>
                      <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                        <div class="flex items-center justify-between mb-2">
                          <span class="text-[10px] font-body font-semibold text-navy">Mamaearth</span>
                          <span class="text-[8px] text-gray-400">42 active ads</span>
                        </div>
                        <div class="flex flex-wrap gap-1 mb-2">
                          <span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[7px] font-medium rounded">Price Hook 68%</span>
                          <span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[7px] font-medium rounded">UGC Style 45%</span>
                          <span class="px-1.5 py-0.5 bg-green-100 text-green-700 text-[7px] font-medium rounded">Hindi VO 52%</span>
                        </div>
                        <div class="text-[8px] text-gray-500">Top hook: "Sirf 3 din mein results" running 45 days</div>
                      </div>
                      <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                        <div class="flex items-center justify-between mb-2">
                          <span class="text-[10px] font-body font-semibold text-navy">WOW Skin Science</span>
                          <span class="text-[8px] text-gray-400">28 active ads</span>
                        </div>
                        <div class="flex flex-wrap gap-1">
                          <span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[7px] font-medium rounded">Authority 55%</span>
                          <span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[7px] font-medium rounded">Before/After 40%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Director Lab Mockup -->
                <div #showcaseMockup class="absolute inset-0 flex items-center justify-center transition-none" style="opacity: 0">
                  <div class="bg-white rounded-2xl p-6 shadow-card border border-divider w-full">
                    <div class="bg-[#F7F8FA] rounded-xl p-4 space-y-3">
                      <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                        <p class="text-[10px] text-gray-400 font-body mb-1.5">DNA INPUTS</p>
                        <div class="flex flex-wrap gap-1 mb-2">
                          <span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-medium rounded showcase-director-tag">Shock Statement</span>
                          <span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[8px] font-medium rounded showcase-director-tag">Macro Texture</span>
                          <span class="px-1.5 py-0.5 bg-green-100 text-green-700 text-[8px] font-medium rounded showcase-director-tag">Hindi VO</span>
                        </div>
                        <button class="w-full py-1.5 bg-accent text-white text-[10px] font-semibold rounded border-0 cursor-default showcase-director-btn">Generate Brief</button>
                      </div>
                      <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-100 showcase-director-preview">
                        <p class="text-[10px] text-gray-400 font-body mb-1">PREVIEW</p>
                        <div class="h-20 bg-gradient-to-br from-accent/5 to-blue-50 rounded flex items-center justify-center">
                          <span class="text-[10px] text-accent font-medium">Brief: "Kya aapko pata hai..."</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- UGC Studio Mockup -->
                <div #showcaseMockup class="absolute inset-0 flex items-center justify-center transition-none" style="opacity: 0">
                  <div class="bg-white rounded-2xl p-6 shadow-card border border-divider w-full">
                    <div class="bg-[#F7F8FA] rounded-xl p-4 space-y-3">
                      <div class="flex gap-2 items-center mb-1">
                        @for (avatar of ['A', 'R', 'S', 'P']; track avatar) {
                          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-violet-500 flex items-center justify-center text-white text-xs font-bold showcase-ugc-avatar">{{ avatar }}</div>
                        }
                        <span class="text-[10px] text-gray-400 font-body ml-1">+8 more</span>
                      </div>
                      <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-100 showcase-ugc-script">
                        <p class="text-[10px] text-gray-400 font-body mb-1">SCRIPT</p>
                        <div class="space-y-1">
                          <div class="h-2 bg-gray-200 rounded w-full"></div>
                          <div class="h-2 bg-gray-200 rounded w-4/5"></div>
                          <div class="h-2 bg-gray-200 rounded w-3/5"></div>
                        </div>
                      </div>
                      <div class="bg-white rounded-lg p-3 shadow-sm border border-gray-100 showcase-ugc-video">
                        <p class="text-[10px] text-gray-400 font-body mb-1">VIDEO PREVIEW</p>
                        <div class="aspect-video bg-dark rounded flex items-center justify-center">
                          <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                            <lucide-icon name="play" [size]="14" class="text-white"></lucide-icon>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- AI Oracle Mockup -->
                <div #showcaseMockup class="absolute inset-0 flex items-center justify-center transition-none" style="opacity: 0">
                  <div class="bg-white rounded-2xl p-6 shadow-card border border-divider w-full">
                    <div class="bg-[#F7F8FA] rounded-xl p-4 space-y-2 min-h-[200px]">
                      <div class="flex justify-end showcase-oracle-msg">
                        <div class="bg-accent text-white px-3 py-1.5 rounded-xl rounded-br-sm text-[11px] max-w-[75%]">Why did my ROAS drop this week?</div>
                      </div>
                      <div class="flex justify-start showcase-oracle-msg">
                        <div class="bg-white px-3 py-2 rounded-xl rounded-bl-sm text-[11px] text-navy max-w-[80%] shadow-sm border border-gray-100">
                          <p class="m-0 mb-1">Your ROAS dropped 18% because 3 top creatives fatigued. Their Hook DNA (Shock Statement) hit frequency cap.</p>
                          <div class="flex gap-1 mt-1.5 showcase-oracle-actions">
                            <span class="px-1.5 py-0.5 bg-accent/10 text-accent text-[8px] rounded font-medium cursor-default">Iterate Hooks</span>
                            <span class="px-1.5 py-0.5 bg-red-50 text-red-500 text-[8px] rounded font-medium cursor-default">Kill Fatigued</span>
                            <span class="px-1.5 py-0.5 bg-green-50 text-green-600 text-[8px] rounded font-medium cursor-default">Scale Winners</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Mobile: Original stacked sections -->
    <div class="lg:hidden">
      <!-- Creative Engine -->
      <section class="py-20 bg-white">
        <div class="max-w-7xl mx-auto px-6">
          <div appAnimateOnScroll class="grid gap-8 items-center">
            <div>
              <span class="font-mono text-xs font-bold uppercase tracking-[0.2em] text-accent mb-4 block">CREATIVE ENGINE</span>
              <h2 class="text-page-title font-display text-navy mb-4">Generate 100+ winning creatives per sprint</h2>
              <p class="text-gray-600 font-body mb-6 leading-relaxed">The full creative workflow: Learn from your data, plan with AI, batch-generate across 10 formats, review with predicted scores, publish to Meta.</p>
              <ul class="space-y-3 list-none p-0">
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>AI plans your sprint from actual ad performance data</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>UGC, statics, carousels, podcasts, skits, demos</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Win probability scoring before you spend a rupee</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Every creative is data-backed, never random</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      <!-- Section 6: Cockpit -->
      <section class="py-20 bg-[#F7F8FA]">
        <div class="max-w-7xl mx-auto px-6">
          <div appAnimateOnScroll class="grid gap-8 items-center">
            <div>
              <span class="font-mono text-xs font-bold uppercase tracking-[0.2em] text-accent mb-4 block">CREATIVE COCKPIT</span>
              <h2 class="text-page-title font-display text-navy mb-4">See all your creatives with their DNA</h2>
              <p class="text-gray-600 font-body mb-6 leading-relaxed">Every creative tagged with its unique DNA fingerprint. Filter, sort, and spot winning patterns at a glance.</p>
              <ul class="space-y-3 list-none p-0">
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Grid view with DNA badges on every creative</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Filter by Hook, Visual, Audio DNA types</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Instant ROAS/CTR/CPA metrics</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Frame-by-frame DNA analysis for videos</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      <!-- Competitor Intelligence -->
      <section class="py-20 bg-white">
        <div class="max-w-7xl mx-auto px-6">
          <div appAnimateOnScroll class="grid gap-8 items-center">
            <div>
              <span class="font-mono text-xs font-bold uppercase tracking-[0.2em] text-accent mb-4 block">COMPETITOR INTELLIGENCE</span>
              <h2 class="text-page-title font-display text-navy mb-4">See what your competitors are running</h2>
              <p class="text-gray-600 font-body mb-6 leading-relaxed">Automatically pull competitor ads from Meta Ad Library. AI analyzes their hooks, spend patterns, and creative strategies so you stay ahead.</p>
              <ul class="space-y-3 list-none p-0">
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Auto-fetch competitor ads from Meta Ad Library</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>AI analyzes messaging patterns and CTAs</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Long-running ads flagged as likely profitable</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Competitor insights feed into your sprint plan</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      <!-- Section 7: Director Lab -->
      <section class="py-20 bg-[#F7F8FA]">
        <div class="max-w-7xl mx-auto px-6">
          <div appAnimateOnScroll class="grid gap-8 items-center">
            <div>
              <span class="font-mono text-xs font-bold uppercase tracking-[0.2em] text-accent mb-4 block">DIRECTOR LAB</span>
              <h2 class="text-page-title font-display text-navy mb-4">Generate briefs from winning DNA</h2>
              <p class="text-gray-600 font-body mb-6 leading-relaxed">AI creates data-backed creative briefs using your top-performing DNA patterns.</p>
              <ul class="space-y-3 list-none p-0">
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>AI-generated briefs from winning patterns</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Static + video variations in minutes</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Publish directly to Meta Ads Manager</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Pre-filled with your top-performing DNA</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      <!-- Section 8: UGC Studio -->
      <section class="py-20 bg-[#F7F8FA]">
        <div class="max-w-7xl mx-auto px-6">
          <div appAnimateOnScroll class="grid gap-8 items-center">
            <div>
              <span class="font-mono text-xs font-bold uppercase tracking-[0.2em] text-accent mb-4 block">CREATIVE STUDIO</span>
              <h2 class="text-page-title font-display text-navy mb-4">Script to UGC video in under a minute</h2>
              <p class="text-gray-600 font-body mb-6 leading-relaxed">Create UGC-style ad videos using AI avatars. No human creators, no 3-week turnarounds.</p>
              <ul class="space-y-3 list-none p-0">
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>12+ diverse AI avatars</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>AI script generation from DNA patterns</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Hindi + English voiceover support</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Direct publish to Meta campaigns</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      <!-- Section 9: AI Oracle -->
      <section class="py-20 bg-white">
        <div class="max-w-7xl mx-auto px-6">
          <div appAnimateOnScroll class="grid gap-8 items-center">
            <div>
              <span class="font-mono text-xs font-bold uppercase tracking-[0.2em] text-accent mb-4 block">AI ORACLE</span>
              <h2 class="text-page-title font-display text-navy mb-4">Ask anything about your ads</h2>
              <p class="text-gray-600 font-body mb-6 leading-relaxed">Natural language queries, data-backed answers.</p>
              <ul class="space-y-3 list-none p-0">
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>"Why did my ROAS drop this week?"</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Answers with specific creative data</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Inline action buttons (scale, kill, iterate)</li>
                <li class="flex items-start gap-2 text-sm font-body text-navy"><lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5"></lucide-icon>Streaming AI responses in real-time</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ============================================================ -->
    <!-- SECTION 10: Comparison Table (KEPT)                          -->
    <!-- ============================================================ -->
    <section class="py-20 bg-[#F7F8FA]">
      <div appAnimateOnScroll class="max-w-4xl mx-auto px-6">
        <div class="text-center mb-12">
          <h2 class="text-page-title font-display text-navy mb-4">Cosmisk vs. The Old Way</h2>
          <p class="text-lg text-gray-600 font-body">See why performance marketers switch from spreadsheets and gut feeling.</p>
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

    <!-- ============================================================ -->
    <!-- SECTION 11: Results / KPI Demo (dark)                        -->
    <!-- ============================================================ -->
    <section class="py-20 bg-dark-mesh">
      <div class="max-w-7xl mx-auto px-6 text-center mb-12">
        <span class="font-mono text-xs font-bold uppercase tracking-[0.2em] text-accent mb-4 block">CAPABILITIES</span>
        <h2 class="text-page-title font-display text-white mb-4">What Your AI Strategist Delivers</h2>
      </div>
      <div id="kpi-demo" class="max-w-5xl mx-auto px-6 grid md:grid-cols-3 gap-6">
        <!-- KPI Card 1: Watchdog Runs -->
        @if (kpiCardCount() >= 1) {
          <div class="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 text-center kpi-card-in kpi-glow" style="animation-delay: 0ms">
            <p class="text-4xl font-mono font-bold text-white mb-2 metric-glow">{{ kpiCountValues()[0] }}</p>
            <p class="text-sm text-gray-400 font-body mb-3">Autonomous agent runs completed</p>
            <div class="inline-flex items-center gap-1 px-2 py-1 bg-accent/10 border border-accent/20 rounded-pill change-pulse">
              <span class="text-[10px] text-accent font-mono font-bold">Live &amp; running</span>
            </div>
            <div class="flex justify-center mt-3 sparkline" style="height: 24px">
              @for (h of [4, 7, 5, 10, 8, 14, 12, 18, 16, 22]; track $index) {
                <div class="sparkline-bar" [class.bar-grow]="kpiBarsGrown()" [style.height.px]="h" [style.animation-delay]="($index * 40) + 'ms'" style="width: 4px; margin: 0 1px;"></div>
              }
            </div>
          </div>
        }
        <!-- KPI Card 2: Brands Connected -->
        @if (kpiCardCount() >= 2) {
          <div class="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 text-center kpi-card-in kpi-glow" style="animation-delay: 200ms">
            <p class="text-4xl font-mono font-bold text-white mb-2 metric-glow">{{ kpiCountValues()[1] }}</p>
            <p class="text-sm text-gray-400 font-body mb-3">Ad accounts analyzed</p>
            <div class="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-pill change-pulse">
              <span class="text-[10px] text-green-400 font-mono font-bold">Cross-brand intelligence</span>
            </div>
            <div class="flex justify-center mt-3 sparkline" style="height: 24px">
              @for (h of [6, 8, 10, 12, 14, 16, 18, 19, 20, 22]; track $index) {
                <div class="sparkline-bar" [class.bar-grow]="kpiBarsGrown()" [style.height.px]="h" [style.animation-delay]="($index * 40) + 'ms'" style="width: 4px; margin: 0 1px; background: #22C55E;"></div>
              }
            </div>
          </div>
        }
        <!-- KPI Card 3: DNA Patterns -->
        @if (kpiCardCount() >= 3) {
          <div class="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8 text-center kpi-card-in kpi-glow" style="animation-delay: 400ms">
            <p class="text-4xl font-mono font-bold text-white mb-2 metric-glow">{{ kpiCountValues()[2] }}+</p>
            <p class="text-sm text-gray-400 font-body mb-3">Creative DNA patterns decoded</p>
            <div class="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-pill change-pulse">
              <span class="text-[10px] text-purple-400 font-mono font-bold">Hook + Visual + Audio</span>
            </div>
            <div class="flex justify-center mt-3 sparkline" style="height: 24px">
              @for (h of [6, 8, 7, 11, 10, 14, 13, 17, 19, 22]; track $index) {
                <div class="sparkline-bar" [class.bar-grow]="kpiBarsGrown()" [style.height.px]="h" [style.animation-delay]="($index * 40) + 'ms'" style="width: 4px; margin: 0 1px; background: #A78BFA;"></div>
              }
            </div>
          </div>
        }
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- SECTION 12: Integrations (expanded to 3x3)                   -->
    <!-- ============================================================ -->
    <section class="py-20 bg-white">
      <div class="max-w-7xl mx-auto px-6">
        <div appAnimateOnScroll class="text-center mb-16">
          <h2 class="text-page-title font-display text-navy mb-4">Connects With Your Stack</h2>
          <p class="text-lg text-gray-600 font-body max-w-2xl mx-auto">
            Cosmisk plugs into the platforms you already use. One-click setup, real-time sync.
          </p>
        </div>

        <div appAnimateOnScroll class="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          @for (integration of integrations; track integration.name; let i = $index) {
            <div class="bg-[#F7F8FA] rounded-2xl border border-gray-100 p-5 flex flex-col items-center gap-3 hover:border-accent/20 hover:shadow-card transition-all duration-300">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center text-lg" [ngClass]="integration.bgClass">
                {{ integration.emoji }}
              </div>
              <p class="text-xs font-body font-semibold text-navy m-0 text-center">{{ integration.name }}</p>
              <div class="flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full" [ngClass]="integration.connected ? 'bg-green-400' : 'bg-amber-400'"></span>
                <span class="text-[10px] font-body" [ngClass]="integration.connected ? 'text-green-600' : 'text-amber-600'">
                  {{ integration.connected ? 'Connected' : 'Coming Soon' }}
                </span>
              </div>
            </div>
          }
        </div>
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- SECTION 12.5: Big Results Counter (dark)                     -->
    <!-- ============================================================ -->
    <section id="big-counter" class="py-20 bg-dark-mesh">
      <div class="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        <div>
          <p class="text-3xl lg:text-4xl font-mono font-bold text-white mb-2 counter-glow">
            @if (bigCounterStarted()) {
              <span [appCountUp]="'100+'" [countDuration]="2000">0</span>
            } @else {
              <span>0</span>
            }
          </p>
          <p class="text-sm text-gray-400 font-body">Creative patterns detected</p>
        </div>
        <div>
          <p class="text-3xl lg:text-4xl font-mono font-bold text-white mb-2 counter-glow">
            @if (bigCounterStarted()) {
              <span [appCountUp]="'6'" [countDuration]="2000">0</span>
            } @else {
              <span>0</span>
            }
          </p>
          <p class="text-sm text-gray-400 font-body">AI agents working 24/7</p>
        </div>
        <div>
          <p class="text-3xl lg:text-4xl font-mono font-bold text-white mb-2 counter-glow">
            @if (bigCounterStarted()) {
              <span [appCountUp]="'10+'" [countDuration]="2000">0</span>
            } @else {
              <span>0</span>
            }
          </p>
          <p class="text-sm text-gray-400 font-body">Creative formats supported</p>
        </div>
        <div>
          <p class="text-3xl lg:text-4xl font-mono font-bold text-white mb-2 counter-glow">
            @if (bigCounterStarted()) {
              <span [appCountUp]="'&lt;60s'" [countDuration]="2000">0</span>
            } @else {
              <span>0</span>
            }
          </p>
          <p class="text-sm text-gray-400 font-body">UGC ad generation time</p>
        </div>
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- SECTION 13: What You Get                                    -->
    <!-- ============================================================ -->
    <section class="py-20 bg-[#F7F8FA]">
      <div class="max-w-7xl mx-auto px-6">
        <div appAnimateOnScroll class="text-center mb-16">
          <h2 class="text-page-title font-display text-navy mb-4">What One Person Can Do With Cosmisk</h2>
          <p class="text-gray-600 font-body max-w-2xl mx-auto">Every feature is live. No mocks. No coming-soon. Connect your Meta account and start in 5 minutes.</p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          @for (cap of capabilities; track cap.title) {
            <div class="card !p-8 hover:border-accent/20 hover:shadow-card-hover transition-all duration-300">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4" [class]="cap.iconBg">
                <lucide-icon [name]="cap.icon" [size]="24" [class]="cap.iconColor"></lucide-icon>
              </div>
              <h3 class="text-lg font-display text-navy mb-2">{{ cap.title }}</h3>
              <p class="text-gray-600 font-body text-sm leading-relaxed mb-4">{{ cap.desc }}</p>
              <span class="text-xs font-mono text-accent font-bold">{{ cap.stat }}</span>
            </div>
          }
        </div>
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- SECTION 14: Pricing (KEPT)                                   -->
    <!-- ============================================================ -->
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

    <!-- ============================================================ -->
    <!-- SECTION 15: FAQ (NEW)                                        -->
    <!-- ============================================================ -->
    <section class="py-20 bg-[#F7F8FA]">
      <div class="max-w-3xl mx-auto px-6">
        <div class="text-center mb-12">
          <h2 class="text-page-title font-display text-navy mb-4">Frequently Asked Questions</h2>
        </div>
        <div class="space-y-0">
          @for (faq of faqs; track faq.q; let i = $index) {
            <div class="border-b border-gray-200">
              <button
                (click)="toggleFaq(i)"
                class="w-full flex items-center justify-between py-5 px-1 bg-transparent border-0 cursor-pointer text-left">
                <span class="text-base font-body font-semibold text-navy">{{ faq.q }}</span>
                <lucide-icon
                  [name]="openFaq() === i ? 'chevron-up' : 'chevron-down'"
                  [size]="18"
                  class="text-gray-400 flex-shrink-0 ml-4">
                </lucide-icon>
              </button>
              @if (openFaq() === i) {
                <div class="pb-5 px-1">
                  <p class="text-sm text-gray-600 font-body leading-relaxed m-0">{{ faq.a }}</p>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- SECTION 16: Final CTA (KEPT)                                 -->
    <!-- ============================================================ -->
    <section class="py-24 bg-dark-mesh text-center">
      <div appAnimateOnScroll class="max-w-3xl mx-auto px-6">
        <h2 class="text-page-title lg:text-hero font-display text-white mb-6">
          Your Ads Have a DNA.<br><span class="text-gradient">Let's Decode It.</span>
        </h2>
        <a routerLink="/signup" class="btn-primary !py-4 !px-10 !text-lg no-underline hover:shadow-glow hover:scale-[1.03] transition-all duration-300">Start Free Trial</a>
        <p class="text-sm text-gray-500 font-body mt-4">No credit card &middot; 14-day free trial &middot; Cancel anytime</p>
      </div>
    </section>

    <!-- ============================================================ -->
    <!-- Demo Modal (KEPT)                                            -->
    <!-- ============================================================ -->
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
            <p class="text-sm text-gray-500 font-body">Experience the platform live. Connect your Meta Ads account and see real insights in under 60 seconds.</p>
          </div>
          <div class="aspect-video bg-gradient-to-br from-navy to-accent/80 rounded-xl mb-6 flex items-center justify-center border border-gray-200">
            <a routerLink="/login" class="text-center no-underline group">
              <div class="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-3 group-hover:bg-white/30 transition-colors">
                <lucide-icon name="play" [size]="32" class="text-white ml-1"></lucide-icon>
              </div>
              <p class="text-sm text-white/80 font-body m-0">Try it live</p>
            </a>
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
export default class LandingComponent implements OnInit, OnDestroy, AfterViewInit {
  private el = inject(ElementRef);
  private zone = inject(NgZone);

  // Feature Showcase refs
  @ViewChild('featureShowcase') featureShowcaseRef!: ElementRef;
  @ViewChild('progressFill') progressFillRef!: ElementRef;
  @ViewChildren('progressDot') progressDots!: QueryList<ElementRef>;
  @ViewChildren('showcaseText') showcaseTexts!: QueryList<ElementRef>;
  @ViewChildren('showcaseMockup') showcaseMockups!: QueryList<ElementRef>;

  activeShowcaseIndex = signal(0);
  private showcaseCleanup: (() => void) | null = null;

  showcaseFeatures = [
    {
      key: 'engine',
      label: 'CREATIVE ENGINE',
      heading: 'Generate 100+ winning creatives per sprint',
      desc: 'The full creative workflow: Learn from your data, plan with AI, batch-generate across 10 formats, review with predicted scores, publish to Meta.',
      bullets: ['AI plans your sprint from actual ad performance data', 'UGC, statics, carousels, podcasts, skits, demos', 'Win probability scoring before you spend a rupee', 'Every creative is data-backed, never random'],
    },
    {
      key: 'cockpit',
      label: 'CREATIVE COCKPIT',
      heading: 'See all your creatives with their DNA',
      desc: 'Every creative tagged with its unique DNA fingerprint. Filter, sort, and spot winning patterns at a glance.',
      bullets: ['Grid view with DNA badges on every creative', 'Filter by Hook, Visual, Audio DNA types', 'Instant ROAS/CTR/CPA metrics', 'Frame-by-frame DNA analysis for videos'],
    },
    {
      key: 'spy',
      label: 'COMPETITOR INTELLIGENCE',
      heading: 'See what your competitors are running',
      desc: 'Automatically pull competitor ads from Meta Ad Library. AI analyzes their hooks, spend patterns, and creative strategies so you stay ahead.',
      bullets: ['Auto-fetch competitor ads from Meta Ad Library', 'AI analyzes messaging patterns and CTAs', 'Long-running ads flagged as likely profitable', 'Competitor insights feed into your sprint plan'],
    },
    {
      key: 'director',
      label: 'DIRECTOR LAB',
      heading: 'Generate briefs from winning DNA',
      desc: 'AI creates data-backed creative briefs using your top-performing DNA patterns. Approve with one click and publish.',
      bullets: ['AI-generated briefs from winning patterns', 'Static + video variations in minutes', 'Publish directly to Meta Ads Manager', 'Pre-filled with your top-performing DNA'],
    },
    {
      key: 'ugc',
      label: 'CREATIVE STUDIO',
      heading: 'Script to UGC video in under a minute',
      desc: 'Create UGC-style ad videos using AI avatars. No human creators, no 3-week turnarounds. Just proven DNA-backed content.',
      bullets: ['12+ diverse AI avatars', 'AI script generation from DNA patterns', 'Hindi + English voiceover support', 'Direct publish to Meta campaigns'],
    },
    {
      key: 'oracle',
      label: 'AI ORACLE',
      heading: 'Ask anything about your ads',
      desc: 'Natural language queries, data-backed answers. No more digging through dashboards to find out what went wrong.',
      bullets: ['"Why did my ROAS drop this week?"', 'Answers with specific creative data', 'Inline action buttons (scale, kill, iterate)', 'Streaming AI responses in real-time'],
    },
  ];

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

  // FAQ state
  openFaq = signal<number | null>(null);

  // === Animated Showcase State ===

  // AI Chat Demo (Section 9)
  chatStarted = signal(false);
  chatStep = signal(0); // 0=nothing, 1=user msg, 2=typing, 3=response typing, 4=response done, 5=actions
  chatTypedText = signal('');
  private chatTimeouts: ReturnType<typeof setTimeout>[] = [];
  private chatLoopTimeout?: ReturnType<typeof setTimeout>;

  // Cockpit Demo (Section 6)
  cockpitStarted = signal(false);
  cockpitCardCount = signal(0);
  cockpitTagStep = signal(0);
  cockpitBarsGrown = signal(false);
  private cockpitTimeouts: ReturnType<typeof setTimeout>[] = [];
  private cockpitLoopTimeout?: ReturnType<typeof setTimeout>;

  // KPI Demo (Section 11)
  kpiStarted = signal(false);
  kpiCardCount = signal(0);
  kpiCountValues = signal([0, 0, 0]);
  kpiBarsGrown = signal(false);
  private kpiTimeouts: ReturnType<typeof setTimeout>[] = [];
  private kpiFrameId?: number;

  // Big Results Counter
  bigCounterStarted = signal(false);

  private observers: IntersectionObserver[] = [];

  toggleFaq(index: number) {
    this.openFaq.set(this.openFaq() === index ? null : index);
  }

  ngOnInit() {
    this.carouselInterval = setInterval(() => {
      this.testimonialPage.set((this.testimonialPage() + 1) % 2);
    }, 6000);
  }

  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
      this.setupDemoObservers();
      this.setupFeatureShowcase();
    });
  }

  ngOnDestroy() {
    if (this.carouselInterval) clearInterval(this.carouselInterval);
    this.scanTimeouts.forEach(t => clearTimeout(t));
    this.chatTimeouts.forEach(t => clearTimeout(t));
    if (this.chatLoopTimeout) clearTimeout(this.chatLoopTimeout);
    this.cockpitTimeouts.forEach(t => clearTimeout(t));
    if (this.cockpitLoopTimeout) clearTimeout(this.cockpitLoopTimeout);
    this.kpiTimeouts.forEach(t => clearTimeout(t));
    if (this.kpiFrameId) cancelAnimationFrame(this.kpiFrameId);
    this.observers.forEach(o => o.disconnect());
    if (this.showcaseCleanup) this.showcaseCleanup();
  }

  private async setupFeatureShowcase() {
    // Skip on mobile (< 1024px) or reduced motion
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 1024) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Show all features visible with no animation
      if (this.showcaseMockups) {
        this.showcaseMockups.forEach((m, i) => {
          if (i === 0) m.nativeElement.style.opacity = '1';
        });
      }
      return;
    }

    const showcaseEl = this.featureShowcaseRef?.nativeElement;
    if (!showcaseEl) return;

    const { gsap } = await import('gsap');
    const { ScrollTrigger } = await import('gsap/ScrollTrigger');
    gsap.registerPlugin(ScrollTrigger);

    const mockups = this.showcaseMockups.toArray().map(m => m.nativeElement);
    const texts = this.showcaseTexts.toArray().map(t => t.nativeElement);
    const progressFill = this.progressFillRef?.nativeElement;
    const featureCount = this.showcaseFeatures.length;

    // Set initial state: first feature visible
    if (mockups[0]) gsap.set(mockups[0], { opacity: 1 });
    if (texts[0]) gsap.set(texts[0], { opacity: 1, y: 0 });

    // Hide all others
    for (let i = 1; i < featureCount; i++) {
      if (mockups[i]) gsap.set(mockups[i], { opacity: 0 });
      if (texts[i]) gsap.set(texts[i], { opacity: 0, y: 30 });
    }

    const st = ScrollTrigger.create({
      trigger: showcaseEl,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0,
      onUpdate: (self) => {
        const progress = self.progress; // 0 to 1
        const rawIndex = progress * featureCount;
        const activeIndex = Math.min(Math.floor(rawIndex), featureCount - 1);
        const localProgress = rawIndex - activeIndex; // 0-1 within each feature

        // Update active index for progress dots
        this.zone.run(() => this.activeShowcaseIndex.set(activeIndex));

        // Update progress fill line
        if (progressFill) {
          progressFill.style.height = `${progress * 100}%`;
        }

        // Show/hide mockups and texts
        for (let i = 0; i < featureCount; i++) {
          if (i === activeIndex) {
            // Active feature: fade in, then start fading out at end of its section
            const fadeOutStart = 0.7; // start fading at 70% through this feature's section
            let opacity = 1;
            let textY = 0;

            if (localProgress > fadeOutStart && activeIndex < featureCount - 1) {
              const fadeProgress = (localProgress - fadeOutStart) / (1 - fadeOutStart);
              opacity = 1 - fadeProgress;
              textY = -30 * fadeProgress;
            }

            if (mockups[i]) mockups[i].style.opacity = String(opacity);
            if (texts[i]) {
              texts[i].style.opacity = String(opacity);
              texts[i].style.transform = `translateY(${textY}px)`;
            }
          } else if (i === activeIndex + 1 && localProgress > 0.7) {
            // Next feature: start fading in
            const fadeProgress = (localProgress - 0.7) / 0.3;
            if (mockups[i]) mockups[i].style.opacity = String(fadeProgress);
            if (texts[i]) {
              texts[i].style.opacity = String(fadeProgress);
              texts[i].style.transform = `translateY(${30 * (1 - fadeProgress)}px)`;
            }
          } else {
            // Inactive: hidden
            if (mockups[i]) mockups[i].style.opacity = '0';
            if (texts[i]) {
              texts[i].style.opacity = '0';
              texts[i].style.transform = i < activeIndex ? 'translateY(-30px)' : 'translateY(30px)';
            }
          }
        }
      },
    });

    this.showcaseCleanup = () => {
      st.kill();
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }

  private setupDemoObservers() {
    const root = this.el.nativeElement as HTMLElement;

    // Chat demo observer
    const chatEl = root.querySelector('#chat-demo');
    if (chatEl) {
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !this.chatStarted()) {
          this.zone.run(() => this.startChatDemo());
        }
      }, { threshold: 0.3 });
      obs.observe(chatEl);
      this.observers.push(obs);
    }

    // Cockpit demo observer
    const cockpitEl = root.querySelector('#cockpit-demo');
    if (cockpitEl) {
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !this.cockpitStarted()) {
          this.zone.run(() => this.startCockpitDemo());
        }
      }, { threshold: 0.3 });
      obs.observe(cockpitEl);
      this.observers.push(obs);
    }

    // KPI demo observer
    const kpiEl = root.querySelector('#kpi-demo');
    if (kpiEl) {
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !this.kpiStarted()) {
          this.zone.run(() => this.startKpiDemo());
        }
      }, { threshold: 0.3 });
      obs.observe(kpiEl);
      this.observers.push(obs);
    }

    // Big counter observer
    const counterEl = root.querySelector('#big-counter');
    if (counterEl) {
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !this.bigCounterStarted()) {
          this.zone.run(() => this.bigCounterStarted.set(true));
        }
      }, { threshold: 0.3 });
      obs.observe(counterEl);
      this.observers.push(obs);
    }
  }

  // --- Chat Demo ---
  private readonly chatFullResponse = 'Your ROAS dropped 18% because 3 top creatives fatigued. Their Hook DNA (Shock Statement) hit frequency cap.';

  startChatDemo() {
    this.chatStarted.set(true);
    this.chatStep.set(0);
    this.chatTypedText.set('');
    this.chatTimeouts.forEach(t => clearTimeout(t));
    this.chatTimeouts = [];

    // Step 1: User message appears
    this.chatTimeouts.push(setTimeout(() => this.chatStep.set(1), 300));
    // Step 2: Typing indicator
    this.chatTimeouts.push(setTimeout(() => this.chatStep.set(2), 1200));
    // Step 3: Start typing response
    this.chatTimeouts.push(setTimeout(() => {
      this.chatStep.set(3);
      this.typeResponse(0);
    }, 2200));
  }

  private typeResponse(index: number) {
    if (index > this.chatFullResponse.length) {
      this.chatStep.set(4);
      // Step 5: Action buttons
      this.chatTimeouts.push(setTimeout(() => this.chatStep.set(5), 400));
      // Auto-loop after 4s
      this.chatLoopTimeout = setTimeout(() => {
        this.chatStarted.set(false);
        this.chatStep.set(0);
        this.chatTypedText.set('');
        setTimeout(() => this.startChatDemo(), 500);
      }, 4000);
      return;
    }
    this.chatTypedText.set(this.chatFullResponse.slice(0, index));
    this.chatTimeouts.push(setTimeout(() => this.typeResponse(index + 2), 30));
  }

  // --- Cockpit Demo ---
  startCockpitDemo() {
    this.cockpitStarted.set(true);
    this.cockpitCardCount.set(0);
    this.cockpitTagStep.set(0);
    this.cockpitBarsGrown.set(false);
    this.cockpitTimeouts.forEach(t => clearTimeout(t));
    this.cockpitTimeouts = [];

    // Stagger cards in
    for (let i = 1; i <= 6; i++) {
      this.cockpitTimeouts.push(setTimeout(() => this.cockpitCardCount.set(i), i * 100));
    }
    // Then tags pop in
    this.cockpitTimeouts.push(setTimeout(() => this.cockpitTagStep.set(1), 800));  // Hook
    this.cockpitTimeouts.push(setTimeout(() => this.cockpitTagStep.set(2), 1100)); // Visual
    this.cockpitTimeouts.push(setTimeout(() => this.cockpitTagStep.set(3), 1400)); // Audio
    // Then bars grow
    this.cockpitTimeouts.push(setTimeout(() => this.cockpitBarsGrown.set(true), 1600));
    // Auto-loop
    this.cockpitLoopTimeout = setTimeout(() => {
      this.cockpitStarted.set(false);
      setTimeout(() => this.startCockpitDemo(), 500);
    }, 6000);
  }

  // --- KPI Demo ---
  startKpiDemo() {
    this.kpiStarted.set(true);
    this.kpiCardCount.set(0);
    this.kpiCountValues.set([0, 0, 0]);
    this.kpiBarsGrown.set(false);
    this.kpiTimeouts.forEach(t => clearTimeout(t));
    this.kpiTimeouts = [];

    // Stagger KPI cards
    for (let i = 1; i <= 3; i++) {
      this.kpiTimeouts.push(setTimeout(() => this.kpiCardCount.set(i), i * 200));
    }
    // Count up after cards are in
    this.kpiTimeouts.push(setTimeout(() => this.animateKpiCountUp(), 800));
    // Bars grow
    this.kpiTimeouts.push(setTimeout(() => this.kpiBarsGrown.set(true), 2200));
  }

  private animateKpiCountUp() {
    const targets = [294, 29, 100];
    const duration = 1200;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      this.zone.run(() => {
        this.kpiCountValues.set([
          Math.round(eased * targets[0]),
          Math.round(eased * targets[1]),
          Math.round(eased * targets[2]),
        ]);
      });
      if (progress < 1) {
        this.kpiFrameId = requestAnimationFrame(animate);
      }
    };
    this.kpiFrameId = requestAnimationFrame(animate);
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

  private http = inject(HttpClient);

  submitHeroEmail() {
    if (this.heroEmail.includes('@')) {
      this.heroSubmitted.set(true);
      this.http.post(`${environment.API_BASE_URL}/leads/capture`, { email: this.heroEmail, source: 'hero' }).subscribe();
    }
  }

  submitDemoEmail() {
    if (this.demoEmail.includes('@')) {
      this.demoSubmitted.set(true);
      this.http.post(`${environment.API_BASE_URL}/leads/capture`, { email: this.demoEmail, source: 'demo' }).subscribe();
    }
  }

  // Logo wall brands
  brandLogos = ['FASHION', 'BEAUTY', 'HEALTH', 'ELECTRONICS', 'FOOD & BEV', 'HOME DECOR', 'JEWELRY', 'FRAGRANCES', 'FITNESS', 'SKINCARE', 'SUPPLEMENTS', 'ACCESSORIES'];
  marqueeLogos = [...this.brandLogos, ...this.brandLogos];

  // How It Works steps
  howItWorksSteps = [
    { num: '01', icon: 'zap', title: 'Learn', desc: 'Connect ad accounts. AI extracts Creative DNA and benchmarks from every ad.' },
    { num: '02', icon: 'brain', title: 'Strategize', desc: 'AI plans your sprint: 40% remake winners, 30% proven DNA combos, 30% fresh angles.' },
    { num: '03', icon: 'sparkles', title: 'Generate', desc: 'Batch-generate 100+ creatives: UGC videos, statics, carousels, podcast clips.' },
    { num: '04', icon: 'check-circle', title: 'Review', desc: 'AI scores every creative before launch. Approve winners, reject the rest.' },
    { num: '05', icon: 'trending-up', title: 'Learn Again', desc: 'Track performance. Results feed the next sprint. Every cycle gets smarter.' },
  ];

  // Case studies — removed (were aspirational)
  caseStudies: { metric: string; desc: string; brand: string; person: string }[] = [];

  // FAQ data
  faqs = [
    { q: 'Is there a free trial?', a: 'Yes! 14 days free, no credit card required. Full access to the Growth plan during your trial.' },
    { q: 'What ad platforms do you support?', a: 'Meta Ads is our primary platform with full DNA analysis. Google Ads and TikTok support are in beta.' },
    { q: 'Is my ad account data secure?', a: 'We request read-only access only. All data is encrypted at rest and in transit. SOC 2 compliance in progress.' },
    { q: 'How does the agency plan work?', a: 'The Scale plan includes the Agency Command Center \u2014 one login, all brands, white-label reports with your branding.' },
    { q: 'Can I switch plans later?', a: 'Yes, upgrade instantly or downgrade at end of billing cycle. Pro-rated billing for upgrades.' },
    { q: 'What makes Cosmisk different from other analytics tools?', a: 'Traditional tools show metrics. Cosmisk extracts Creative DNA \u2014 the specific hooks, visuals, and audio patterns that drive performance.' },
    { q: 'Do you support Hindi content analysis?', a: 'Yes! Full Hindi voiceover detection, script analysis, and DNA extraction for regional content.' },
    { q: 'Can I get a custom enterprise plan?', a: 'Absolutely. Contact us for 50+ brands, custom infrastructure, and dedicated support.' },
  ];

  mockCreatives = [
    { name: 'c1', emoji: '\uD83D\uDCF1', thumbBg: 'bg-gradient-to-br from-amber-900/30 to-amber-700/20', roas: 4.8, tags: [{ label: 'Shock', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'Macro', cls: 'bg-blue-500/20 text-blue-300' }], spark: [4, 8, 6, 12, 10, 14, 11] },
    { name: 'c2', emoji: '\uD83C\uDFA5', thumbBg: 'bg-gradient-to-br from-blue-900/30 to-blue-700/20', roas: 3.2, tags: [{ label: 'Curiosity', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'UGC', cls: 'bg-blue-500/20 text-blue-300' }], spark: [6, 5, 9, 7, 11, 8, 10] },
    { name: 'c3', emoji: '\uD83D\uDED2', thumbBg: 'bg-gradient-to-br from-emerald-900/30 to-emerald-700/20', roas: 5.1, tags: [{ label: 'Price', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'Hindi', cls: 'bg-emerald-500/20 text-emerald-300' }], spark: [3, 7, 5, 10, 14, 12, 16] },
    { name: 'c4', emoji: '\uD83C\uDF1F', thumbBg: 'bg-gradient-to-br from-violet-900/30 to-violet-700/20', roas: 2.4, tags: [{ label: 'Authority', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'Warm', cls: 'bg-blue-500/20 text-blue-300' }], spark: [8, 6, 4, 5, 3, 6, 4] },
    { name: 'c5', emoji: '\uD83D\uDE80', thumbBg: 'bg-gradient-to-br from-pink-900/30 to-pink-700/20', roas: 3.9, tags: [{ label: 'Social', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'ASMR', cls: 'bg-emerald-500/20 text-emerald-300' }], spark: [5, 9, 11, 8, 13, 10, 12] },
    { name: 'c6', emoji: '\uD83D\uDCA1', thumbBg: 'bg-gradient-to-br from-cyan-900/30 to-cyan-700/20', roas: 4.3, tags: [{ label: 'Demo', cls: 'bg-amber-500/20 text-amber-300' }, { label: 'Upbeat', cls: 'bg-emerald-500/20 text-emerald-300' }], spark: [7, 10, 8, 14, 11, 15, 13] },
  ];

  cockpitMockCards = [
    { bg: 'from-amber-50 to-orange-50', tags: ['Shock', 'Macro'], roas: '4.8', ctr: '3.2', spark: [4, 8, 6, 12, 10, 14, 11] },
    { bg: 'from-blue-50 to-indigo-50', tags: ['Curiosity', 'UGC'], roas: '3.2', ctr: '2.8', spark: [6, 5, 9, 7, 11, 8, 10] },
    { bg: 'from-green-50 to-emerald-50', tags: ['Price', 'Hindi'], roas: '5.1', ctr: '4.1', spark: [3, 7, 5, 10, 14, 12, 16] },
    { bg: 'from-violet-50 to-purple-50', tags: ['Authority'], roas: '2.4', ctr: '1.9', spark: [8, 6, 4, 5, 3, 6, 4] },
    { bg: 'from-pink-50 to-rose-50', tags: ['Social', 'ASMR'], roas: '3.9', ctr: '3.0', spark: [5, 9, 11, 8, 13, 10, 12] },
    { bg: 'from-cyan-50 to-teal-50', tags: ['Demo', 'Upbeat'], roas: '4.3', ctr: '3.5', spark: [7, 10, 8, 14, 11, 15, 13] },
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

  integrations = [
    { name: 'Meta Ads', emoji: '\uD83D\uDFE6', bgClass: 'bg-blue-100', connected: true },
    { name: 'Google Ads', emoji: '\uD83D\uDD0D', bgClass: 'bg-red-50', connected: true },
    { name: 'TikTok Ads', emoji: '\uD83C\uDFB5', bgClass: 'bg-gray-100', connected: false },
    { name: 'Shopify', emoji: '\uD83D\uDED2', bgClass: 'bg-green-50', connected: true },
    { name: 'Google Analytics', emoji: '\uD83D\uDCCA', bgClass: 'bg-amber-50', connected: true },
    { name: 'Slack', emoji: '\uD83D\uDCAC', bgClass: 'bg-purple-50', connected: true },
    { name: 'Google Sheets', emoji: '\uD83D\uDCCA', bgClass: 'bg-emerald-50', connected: true },
    { name: 'Google Drive', emoji: '\uD83D\uDCC1', bgClass: 'bg-amber-50', connected: true },
    { name: 'Razorpay', emoji: '\uD83D\uDCB3', bgClass: 'bg-blue-50', connected: true },
  ];

  comparisonRows = [
    { feature: 'Creative analysis time', manual: '2-4 hours', cosmisk: 'Under 30 seconds' },
    { feature: 'Pattern detection', manual: 'Gut feeling', cosmisk: 'AI-powered DNA' },
    { feature: 'Batch creative generation', manual: '1-2 ads/day', cosmisk: '100+ per sprint' },
    { feature: 'Competitor monitoring', manual: 'Manual Ad Library browsing', cosmisk: 'Auto-fetch + AI analysis' },
    { feature: 'Algorithm awareness', manual: 'None', cosmisk: 'Andromeda, PMax, TikTok' },
    { feature: 'UGC production', manual: '5-7 day turnaround', cosmisk: 'Script to video in <1 min' },
    { feature: 'Pre-launch scoring', manual: 'Launch and pray', cosmisk: 'Win probability per creative' },
    { feature: 'Multi-brand management', manual: 'Separate logins', cosmisk: 'One cockpit' },
    { feature: 'Creative fatigue alerts', manual: 'Missed until ROAS drops', cosmisk: 'Real-time AI alerts' },
  ];

  plans = [
    {
      name: 'Solo', price: '\u20B92,499', annualPrice: '\u20B91,899', featured: false,
      features: ['3 ad accounts', 'Unlimited AI chats', '30 images / 5 videos', '100 creatives/month', '10 autopilot rules', '5 competitors', 'PDF reports'],
    },
    {
      name: 'Growth', price: '\u20B95,999', annualPrice: '\u20B94,499', featured: true,
      features: ['10 ad accounts', 'Unlimited AI + generation', '100 images / 20 videos', '500 creatives/month', 'Unlimited autopilot', '15 competitors', 'Branded reports'],
    },
    {
      name: 'Agency', price: '\u20B912,999', annualPrice: '\u20B99,999', featured: false,
      features: ['Unlimited accounts', 'Unlimited everything', 'Agency Command Center', 'White-label reports', 'API access', 'Dedicated CSM'],
    },
  ];

  capabilities = [
    {
      icon: 'brain', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600',
      title: 'Creative DNA Analysis',
      desc: 'Upload any ad. AI extracts hook type, visual style, audio pattern, CTA structure across 100+ pattern dimensions.',
      stat: '100+ patterns across 7 categories',
    },
    {
      icon: 'bot', iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
      title: 'Autonomous Ad Watchdog',
      desc: 'AI agent monitors your Meta campaigns 24/7, spots fatigue and opportunity, recommends budget shifts with reasoning.',
      stat: '294 autonomous runs completed',
    },
    {
      icon: 'video', iconBg: 'bg-pink-100', iconColor: 'text-pink-600',
      title: 'UGC Studio',
      desc: 'Generate UGC video ads with AI avatars, voiceovers, and scripts — from brief to publishable creative in under a minute.',
      stat: '10+ formats: UGC, static, carousel, podcast',
    },
    {
      icon: 'target', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600',
      title: 'Sprint Planner',
      desc: 'AI plans your creative sprint: 40% remake winners, 30% proven DNA combos, 30% fresh angles. Then generates them all.',
      stat: 'Claude Opus strategy + Sonnet scripts',
    },
    {
      icon: 'shield', iconBg: 'bg-blue-100', iconColor: 'text-blue-600',
      title: 'Autopilot Rules Engine',
      desc: 'Set CPA/ROAS triggers that auto-pause, adjust budgets, or alert via Slack. Real Meta API writes, not mock actions.',
      stat: 'Live Meta budget changes + Slack alerts',
    },
    {
      icon: 'bell-ring', iconBg: 'bg-violet-100', iconColor: 'text-violet-600',
      title: 'Morning Briefing',
      desc: 'Wake up to a strategic briefing synthesized from watchdog findings, autopilot actions, and Meta performance data.',
      stat: 'Daily at 7 AM IST via Slack',
    },
  ];
}
