import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <!-- Hero Section -->
    <section class="relative overflow-hidden bg-cream py-20 lg:py-32">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div class="inline-flex items-center gap-2 px-4 py-1.5 bg-accent/10 rounded-pill text-accent text-sm font-body font-semibold mb-6">
            ⚡ THE ANTI-DASHBOARD
          </div>
          <h1 class="text-hero font-display text-navy mb-6">
            Stop Staring at Dashboards.<br>
            Start <span class="text-accent relative">Understanding
              <span class="absolute bottom-1 left-0 w-full h-1 bg-accent/30 rounded"></span>
            </span> Your Ads.
          </h1>
          <p class="text-lg text-gray-600 font-body mb-8 max-w-lg leading-relaxed">
            Cosmisk extracts the Creative DNA from your winning Meta ads — Hook DNA, Visual DNA, Audio DNA —
            so you know exactly <strong>why</strong> your ads work, not just that they do.
          </p>
          <div class="flex flex-wrap gap-4 mb-8">
            <a routerLink="/signup" class="btn-primary !py-3.5 !px-8 !text-base no-underline">Start Free Trial</a>
            <button class="btn-outline !py-3.5 !px-8 !text-base">Watch Demo</button>
          </div>
          <p class="text-sm text-gray-500 font-body">
            Trusted by <strong class="text-navy">500+</strong> e-commerce brands &nbsp;·&nbsp; ₹250Cr+ ad spend analyzed
          </p>
        </div>

        <!-- Mockup -->
        <div class="relative">
          <div class="bg-white rounded-2xl shadow-card-hover p-4 transform lg:rotate-1 lg:translate-x-4">
            <div class="bg-cream rounded-xl p-6 space-y-4">
              <div class="flex gap-3">
                <div class="flex-1 bg-white rounded-card p-4 shadow-card">
                  <p class="text-xs text-gray-500 font-body m-0">ROAS</p>
                  <p class="text-2xl font-mono font-bold text-green-600 m-0">4.8x</p>
                </div>
                <div class="flex-1 bg-white rounded-card p-4 shadow-card">
                  <p class="text-xs text-gray-500 font-body m-0">Spend</p>
                  <p class="text-2xl font-mono font-bold text-navy m-0">₹3.2L</p>
                </div>
              </div>
              <div class="bg-white rounded-card p-4 shadow-card">
                <p class="text-xs text-gray-500 font-body m-0 mb-2">Creative DNA</p>
                <div class="flex flex-wrap gap-1.5">
                  <span class="px-2.5 py-1 bg-dna-hook-bg text-dna-hook-text text-xs rounded-pill font-medium">Shock Statement</span>
                  <span class="px-2.5 py-1 bg-dna-visual-bg text-dna-visual-text text-xs rounded-pill font-medium">Macro Texture</span>
                  <span class="px-2.5 py-1 bg-dna-visual-bg text-dna-visual-text text-xs rounded-pill font-medium">Warm Palette</span>
                  <span class="px-2.5 py-1 bg-dna-audio-bg text-dna-audio-text text-xs rounded-pill font-medium">Hindi VO</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Social Proof Bar -->
    <section class="bg-navy py-10">
      <div class="max-w-7xl mx-auto px-6 grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
        @for (stat of stats; track stat.label) {
          <div>
            <p class="text-3xl lg:text-4xl font-mono font-bold text-white m-0 mb-1">{{ stat.value }}</p>
            <p class="text-sm text-gray-400 font-body m-0">{{ stat.label }}</p>
          </div>
        }
      </div>
    </section>

    <!-- Problem → Solution -->
    <section class="py-20 bg-cream">
      <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16">
        <div class="p-8 bg-gray-100 rounded-2xl border border-gray-200">
          <div class="text-red-500 text-sm font-mono font-bold mb-4">THE PROBLEM</div>
          <h2 class="text-page-title font-display text-navy mb-4">Dashboards show numbers. Not answers.</h2>
          <p class="text-gray-600 font-body leading-relaxed">
            Your media buyer says "ROAS dropped 20% this week." But <em>why</em>? Was it the hook? The visual style?
            The audience? Traditional dashboards can't tell you. You're left guessing.
          </p>
          <div class="mt-6 space-y-3">
            <div class="flex items-center gap-2 text-sm text-gray-500"><span class="text-red-400">✕</span> No insight into creative performance drivers</div>
            <div class="flex items-center gap-2 text-sm text-gray-500"><span class="text-red-400">✕</span> Manual analysis takes hours per creative</div>
            <div class="flex items-center gap-2 text-sm text-gray-500"><span class="text-red-400">✕</span> Winning patterns lost across campaigns</div>
          </div>
        </div>

        <div class="p-8 bg-white rounded-2xl border border-accent/20 shadow-card">
          <div class="text-accent text-sm font-mono font-bold mb-4">THE COSMISK WAY</div>
          <h2 class="text-page-title font-display text-navy mb-4">Extract Creative DNA. Know exactly why.</h2>
          <p class="text-gray-600 font-body leading-relaxed">
            Cosmisk uses AI to decode every ad into its fundamental DNA — the hook that stops the scroll,
            the visuals that hold attention, the audio that drives action.
          </p>
          <div class="mt-6 space-y-3">
            <div class="flex items-center gap-2 text-sm text-navy"><span class="text-green-500">✓</span> AI-powered Hook, Visual & Audio DNA extraction</div>
            <div class="flex items-center gap-2 text-sm text-navy"><span class="text-green-500">✓</span> Instant creative analysis in seconds</div>
            <div class="flex items-center gap-2 text-sm text-navy"><span class="text-green-500">✓</span> Cross-brand pattern intelligence</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Creative DNA Explanation -->
    <section class="py-20 bg-white">
      <div class="max-w-7xl mx-auto px-6 text-center mb-16">
        <h2 class="text-page-title font-display text-navy mb-4">Every Ad Has a DNA</h2>
        <p class="text-lg text-gray-600 font-body max-w-2xl mx-auto">
          Cosmisk breaks down each creative into three core DNA strands that determine its performance.
        </p>
      </div>

      <div class="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-8">
        @for (dna of dnaCards; track dna.title) {
          <div class="card !p-8 text-center hover:-translate-y-1 transition-transform">
            <div class="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" [ngClass]="dna.bgClass">
              <span class="text-3xl">{{ dna.icon }}</span>
            </div>
            <h3 class="text-card-title font-display text-navy mb-2">{{ dna.title }}</h3>
            <p class="text-sm text-gray-600 font-body mb-4 leading-relaxed">{{ dna.description }}</p>
            <div class="flex flex-wrap justify-center gap-1.5">
              @for (tag of dna.tags; track tag) {
                <span class="px-2.5 py-1 text-xs rounded-pill font-medium" [ngClass]="dna.tagClass">{{ tag }}</span>
              }
            </div>
          </div>
        }
      </div>
    </section>

    <!-- Feature Showcase -->
    <section class="py-20 bg-cream">
      <div class="max-w-7xl mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-page-title font-display text-navy mb-4">Powerful Features, Simple Experience</h2>
          <p class="text-lg text-gray-600 font-body max-w-2xl mx-auto">
            From analysis to creation to publishing — everything your creative team needs.
          </p>
        </div>

        <!-- Tabs -->
        <div class="flex justify-center gap-2 mb-12 flex-wrap">
          @for (tab of featureTabs; track tab.id; let i = $index) {
            <button
              (click)="activeTab = i"
              class="px-5 py-2.5 rounded-pill text-sm font-body font-medium transition-all border-0 cursor-pointer"
              [ngClass]="activeTab === i ? 'bg-accent text-white' : 'bg-white text-navy hover:bg-gray-50'">
              {{ tab.title }}
            </button>
          }
        </div>

        <!-- Tab Content -->
        <div class="grid lg:grid-cols-2 gap-12 items-center">
          <div class="animate-fade-in">
            <h3 class="text-section-title font-display text-navy mb-4">{{ featureTabs[activeTab].title }}</h3>
            <p class="text-gray-600 font-body mb-6 leading-relaxed">{{ featureTabs[activeTab].description }}</p>
            <ul class="space-y-3 list-none p-0">
              @for (point of featureTabs[activeTab].points; track point) {
                <li class="flex items-start gap-2 text-sm font-body text-navy">
                  <span class="text-green-500 mt-0.5">✓</span>
                  {{ point }}
                </li>
              }
            </ul>
          </div>
          <div class="bg-white rounded-2xl p-8 shadow-card">
            <div class="aspect-video bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm font-body">
              {{ featureTabs[activeTab].title }} Preview
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Preview -->
    <section class="py-20 bg-navy">
      <div class="max-w-7xl mx-auto px-6 text-center mb-16">
        <h2 class="text-page-title font-display text-white mb-4">Simple Pricing. Powerful Intelligence.</h2>
        <p class="text-lg text-gray-400 font-body">Start free, scale as you grow.</p>
      </div>

      <div class="max-w-5xl mx-auto px-6 grid md:grid-cols-3 gap-6">
        @for (plan of plans; track plan.name) {
          <div
            class="rounded-2xl p-8 transition-transform hover:-translate-y-1"
            [ngClass]="plan.featured ? 'bg-white text-navy ring-2 ring-accent' : 'bg-white/5 text-white border border-white/10'">
            @if (plan.featured) {
              <div class="text-center mb-2">
                <span class="px-3 py-1 bg-accent/10 text-accent text-xs font-bold rounded-pill">MOST POPULAR</span>
              </div>
            }
            <h3 class="text-card-title font-display mb-1 text-center" [ngClass]="plan.featured ? 'text-navy' : 'text-white'">{{ plan.name }}</h3>
            <div class="text-center mb-6">
              <span class="text-metric-lg font-mono" [ngClass]="plan.featured ? 'text-navy' : 'text-white'">{{ plan.price }}</span>
              <span class="text-sm" [ngClass]="plan.featured ? 'text-gray-500' : 'text-gray-400'">/month</span>
            </div>
            <ul class="space-y-2 mb-8 list-none p-0">
              @for (f of plan.features; track f) {
                <li class="flex items-center gap-2 text-sm font-body" [ngClass]="plan.featured ? 'text-gray-600' : 'text-gray-300'">
                  <span class="text-green-500">✓</span> {{ f }}
                </li>
              }
            </ul>
            <a
              [routerLink]="'/signup'"
              class="block text-center py-3 rounded-lg font-body font-semibold text-sm transition-colors no-underline"
              [ngClass]="plan.featured ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-white/10 text-white hover:bg-white/20'">
              Start Free Trial
            </a>
          </div>
        }
      </div>
    </section>

    <!-- Testimonials -->
    <section class="py-20 bg-cream">
      <div class="max-w-7xl mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-page-title font-display text-navy mb-4">Loved by Performance Marketers</h2>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          @for (t of testimonials; track t.name) {
            <div class="card !p-8">
              <p class="text-gray-600 font-body text-sm italic mb-6 leading-relaxed">"{{ t.quote }}"</p>
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-sm">
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
    </section>

    <!-- Final CTA -->
    <section class="py-24 bg-white text-center">
      <div class="max-w-3xl mx-auto px-6">
        <h2 class="text-page-title lg:text-hero font-display text-navy mb-6">
          Your Ads Have a DNA.<br>Let's Decode It.
        </h2>
        <div class="flex flex-wrap justify-center gap-4 mb-4">
          <a routerLink="/signup" class="btn-primary !py-4 !px-10 !text-lg no-underline">Start Free Trial</a>
          <button (click)="downloadPitchDeck()" class="btn-outline !py-4 !px-10 !text-lg cursor-pointer">Download Pitch Deck</button>
        </div>
        <p class="text-sm text-gray-500 font-body mt-4">No credit card · 14-day free trial · Cancel anytime</p>
      </div>
    </section>
  `
})
export default class LandingComponent {
  activeTab = 0;

  downloadPitchDeck() {
    import('../pitch-deck/pitch-deck-pdf').then(({ PITCH_DECK_PDF_BASE64 }) => {
      const byteChars = atob(PITCH_DECK_PDF_BASE64);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Cosmisk-Pitch-Deck.pdf';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  stats = [
    { value: '₹250Cr+', label: 'Ad Spend Analyzed' },
    { value: '3.2x', label: 'Avg ROAS Improvement' },
    { value: '500+', label: 'Brands Trust Cosmisk' },
    { value: '<20min', label: 'Data to Creative Brief' },
  ];

  dnaCards = [
    {
      title: 'Hook DNA', icon: '🎣',
      bgClass: 'bg-dna-hook-bg',
      tagClass: 'bg-dna-hook-bg text-dna-hook-text',
      description: 'The opening that stops the scroll. Is it a shock statement, a price anchor, or social proof?',
      tags: ['Shock Statement', 'Price Anchor', 'Curiosity', 'Authority'],
    },
    {
      title: 'Visual DNA', icon: '🎨',
      bgClass: 'bg-dna-visual-bg',
      tagClass: 'bg-dna-visual-bg text-dna-visual-text',
      description: 'The visual language that holds attention. Macro textures, warm palettes, UGC style, or product-focused.',
      tags: ['Macro Texture', 'Warm Palette', 'UGC Style', 'Product Focus'],
    },
    {
      title: 'Audio DNA', icon: '🎵',
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

  plans = [
    {
      name: 'Starter', price: '₹4,999', featured: false,
      features: ['1 brand', '5 ad accounts', 'Creative Cockpit', 'Basic DNA (Hook only)', '10 AI queries/day'],
    },
    {
      name: 'Growth', price: '₹14,999', featured: true,
      features: ['3 brands', 'Unlimited accounts', 'Full DNA analysis', 'Director Lab + UGC Studio', '50 AI queries/day', 'Lighthouse pacing'],
    },
    {
      name: 'Scale', price: '₹29,999', featured: false,
      features: ['Unlimited brands', 'Agency Command Center', 'Cross-brand Brain', 'White-label reports', 'Unlimited AI queries', 'Dedicated CSM'],
    },
  ];

  testimonials = [
    {
      quote: 'Cosmisk changed how we think about creative. We went from guessing to knowing exactly why our best ads work.',
      name: 'Rajesh Gupta', initials: 'RG', role: 'Founder, Nectar Supplements', metric: '4.8x ROAS → from 2.1x in 3 months',
    },
    {
      quote: 'Managing 35 brands became 10x easier. The Creative DNA concept is brilliant — our clients love the reports.',
      name: 'Priya Sharma', initials: 'PS', role: 'CEO, AdScale Agency', metric: '35 brands managed with 4-person team',
    },
    {
      quote: 'We reduced our creative production time by 60% using Director Lab and UGC Studio. Game changer for D2C.',
      name: 'Amit Patel', initials: 'AP', role: 'CMO, Urban Drape', metric: '60% faster creative production',
    },
  ];
}
