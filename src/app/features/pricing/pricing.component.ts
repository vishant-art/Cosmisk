import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <section class="py-20 bg-[#F7F8FA]">
      <div class="max-w-7xl mx-auto px-6 text-center mb-16">
        <h1 class="text-hero font-display text-navy mb-4">Simple Pricing. Powerful Intelligence.</h1>
        <p class="text-lg text-gray-600 font-body mb-8">Start free, scale as you grow. No hidden fees.</p>

        <!-- Toggle -->
        <div class="inline-flex items-center gap-3 bg-white rounded-pill p-1 shadow-card">
          <button
            (click)="isAnnual.set(false)"
            class="px-5 py-2 rounded-pill text-sm font-body font-medium transition-all border-0 cursor-pointer"
            [ngClass]="!isAnnual() ? 'bg-accent text-white' : 'bg-transparent text-gray-600 hover:text-navy'">
            Monthly
          </button>
          <button
            (click)="isAnnual.set(true)"
            class="px-5 py-2 rounded-pill text-sm font-body font-medium transition-all border-0 cursor-pointer"
            [ngClass]="isAnnual() ? 'bg-accent text-white' : 'bg-transparent text-gray-600 hover:text-navy'">
            Annual
            <span class="ml-1 text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Save 20%</span>
          </button>
        </div>
      </div>

      <div class="max-w-5xl mx-auto px-6 grid md:grid-cols-3 gap-6 mb-20">
        @for (plan of plans; track plan.name) {
          <div
            class="card !p-8 transition-transform hover:-translate-y-1"
            [class.ring-2]="plan.featured"
            [class.ring-accent]="plan.featured">
            @if (plan.featured) {
              <div class="text-center mb-2">
                <span class="px-3 py-1 bg-accent/10 text-accent text-xs font-bold rounded-pill">MOST POPULAR</span>
              </div>
            }
            <h3 class="text-card-title font-display text-navy text-center mb-1">{{ plan.name }}</h3>
            <div class="text-center mb-6">
              <span class="text-metric-lg font-mono text-navy">{{ isAnnual() ? plan.annualPrice : plan.monthlyPrice }}</span>
              <span class="text-sm text-gray-500">/month</span>
              @if (isAnnual()) {
                <p class="text-xs text-gray-400 m-0 mt-1">billed annually</p>
              }
            </div>
            <ul class="space-y-3 mb-8 list-none p-0">
              @for (f of plan.features; track f) {
                <li class="flex items-start gap-2 text-sm font-body text-gray-600">
                  <lucide-icon name="check" [size]="14" class="text-green-500 mt-0.5 shrink-0"></lucide-icon> {{ f }}
                </li>
              }
            </ul>
            <a
              routerLink="/signup"
              class="block text-center py-3 rounded-lg font-body font-semibold text-sm transition-colors no-underline"
              [ngClass]="plan.featured ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-navy text-white hover:bg-navy-hover'">
              Start Free Trial
            </a>
          </div>
        }
      </div>

      <!-- FAQ -->
      <div class="max-w-3xl mx-auto px-6">
        <h2 class="text-page-title font-display text-navy text-center mb-12">Frequently Asked Questions</h2>
        @for (faq of faqs; track faq.q; let i = $index) {
          <div class="border-b border-divider">
            <button
              (click)="toggleFaq(i)"
              class="w-full flex items-center justify-between py-5 text-left border-0 bg-transparent cursor-pointer">
              <span class="text-sm font-body font-semibold text-navy">{{ faq.q }}</span>
              <span class="text-gray-400 shrink-0 ml-4 transition-transform" [class.rotate-180]="openFaq() === i"><lucide-icon name="chevron-down" [size]="18"></lucide-icon></span>
            </button>
            @if (openFaq() === i) {
              <div class="pb-5 animate-fade-in">
                <p class="text-sm text-gray-600 font-body leading-relaxed m-0">{{ faq.a }}</p>
              </div>
            }
          </div>
        }
      </div>
    </section>
  `
})
export default class PricingComponent {
  isAnnual = signal(false);
  openFaq = signal<number | null>(null);

  plans = [
    {
      name: 'Starter', monthlyPrice: '₹4,999', annualPrice: '₹3,999', featured: false,
      features: ['1 brand', '5 ad accounts', 'Creative Cockpit', 'Basic DNA analysis (Hook only)', '10 AI Oracle queries/day', 'Email support', '1 team member'],
    },
    {
      name: 'Growth', monthlyPrice: '₹14,999', annualPrice: '₹11,999', featured: true,
      features: ['3 brands', 'Unlimited ad accounts', 'Advanced DNA (Hook+Visual+Audio)', 'Director Lab + UGC Studio (50/mo)', '50 AI Oracle queries/day', 'Lighthouse budget pacing', 'Branded reports', '5 team members', 'Priority support'],
    },
    {
      name: 'Scale', monthlyPrice: '₹29,999', annualPrice: '₹23,999', featured: false,
      features: ['Unlimited brands', 'Agency Command Center', 'Cross-brand Brain intelligence', 'UGC Studio (200/mo)', 'Unlimited AI queries', 'White-label reports', 'Advanced attribution', 'Unlimited team members', 'Dedicated CSM', 'API access'],
    },
  ];

  faqs = [
    { q: 'Is there a free trial?', a: 'Yes! 14 days free, no credit card required. You get full access to the Growth plan during your trial.' },
    { q: 'Can I switch plans anytime?', a: 'Yes, pro-rated billing. Upgrade instantly, downgrade at the end of your billing cycle.' },
    { q: 'What happens when my trial ends?', a: 'You\'ll be downgraded to the Starter plan. No data is lost. Upgrade anytime to restore full access.' },
    { q: 'Do you support platforms other than Meta?', a: 'Meta is our primary platform. Google Ads and TikTok support are in beta, planned for Q2 2026.' },
    { q: 'How does the agency plan work?', a: 'The Scale plan includes the Agency Command Center. One login, all brands. White-label reports with your agency branding.' },
    { q: 'What payment methods do you accept?', a: 'Credit/debit cards, UPI, and net banking. All payments are processed in INR.' },
    { q: 'Is my data secure?', a: 'SOC 2 compliance in progress. All data is encrypted at rest and in transit. We request read-only access to your Meta account.' },
    { q: 'Can I get a custom plan?', a: 'Yes! Contact our sales team for 50+ brands or enterprise needs. Custom pricing and dedicated infrastructure available.' },
  ];

  toggleFaq(i: number) {
    this.openFaq.set(this.openFaq() === i ? null : i);
  }
}
