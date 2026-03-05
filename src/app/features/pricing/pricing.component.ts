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
        <div class="inline-flex items-center gap-3 bg-white rounded-pill p-1 shadow-card" role="radiogroup" aria-label="Billing period">
          <button
            (click)="isAnnual.set(false)"
            role="radio"
            [attr.aria-checked]="!isAnnual()"
            class="px-5 py-2 rounded-pill text-sm font-body font-medium transition-all border-0 cursor-pointer"
            [ngClass]="!isAnnual() ? 'bg-accent text-white' : 'bg-transparent text-gray-600 hover:text-navy'">
            Monthly
          </button>
          <button
            (click)="isAnnual.set(true)"
            role="radio"
            [attr.aria-checked]="isAnnual()"
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
            class="card card-lift !p-8"
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

      <!-- Competitor Comparison -->
      <div class="max-w-5xl mx-auto px-6 mb-20">
        <h2 class="text-page-title font-display text-navy text-center mb-4">See How Cosmisk Compares</h2>
        <p class="text-sm text-gray-500 font-body text-center mb-10">Feature-by-feature comparison with leading ad intelligence tools.</p>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse bg-white rounded-xl shadow-card overflow-hidden text-sm font-body">
            <thead>
              <tr class="border-b border-divider">
                <th class="text-left py-4 px-5 text-navy font-semibold">Feature</th>
                <th class="text-center py-4 px-4 text-accent font-semibold">Cosmisk Pro ($49)</th>
                <th class="text-center py-4 px-4 text-gray-600 font-medium">Madgicx ($44+)</th>
                <th class="text-center py-4 px-4 text-gray-600 font-medium">Adden AI ($60)</th>
                <th class="text-center py-4 px-4 text-gray-600 font-medium">Triple Whale ($129+)</th>
              </tr>
            </thead>
            <tbody>
              @for (row of comparisonRows; track row.feature) {
                <tr class="border-b border-divider last:border-0">
                  <td class="py-3.5 px-5 text-navy font-medium">{{ row.feature }}</td>
                  @for (val of [row.cosmisk, row.madgicx, row.adden, row.tripleWhale]; track $index) {
                    <td class="text-center py-3.5 px-4">
                      @if (val) {
                        <lucide-icon name="check" [size]="18" class="text-green-500 inline-block"></lucide-icon>
                      } @else {
                        <lucide-icon name="x" [size]="18" class="text-gray-300 inline-block"></lucide-icon>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- FAQ -->
      <div class="max-w-3xl mx-auto px-6">
        <h2 class="text-page-title font-display text-navy text-center mb-12">Frequently Asked Questions</h2>
        @for (faq of faqs; track faq.q; let i = $index) {
          <div class="border-b border-divider">
            <button
              (click)="toggleFaq(i)"
              [attr.aria-expanded]="openFaq() === i"
              [attr.aria-controls]="'faq-panel-' + i"
              class="w-full flex items-center justify-between py-5 text-left border-0 bg-transparent cursor-pointer">
              <span class="text-sm font-body font-semibold text-navy">{{ faq.q }}</span>
              <span class="text-gray-400 shrink-0 ml-4 transition-transform" [class.rotate-180]="openFaq() === i"><lucide-icon name="chevron-down" [size]="18"></lucide-icon></span>
            </button>
            @if (openFaq() === i) {
              <div [id]="'faq-panel-' + i" role="region" [attr.aria-label]="faq.q" class="pb-5 animate-fade-in">
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
      name: 'Free', monthlyPrice: '$0', annualPrice: '$0', featured: false,
      features: ['1 ad account', '20 AI chats/day', 'Dashboard & Analytics', 'Basic Reports', 'No image/video generation'],
    },
    {
      name: 'Pro', monthlyPrice: '$49', annualPrice: '$39', featured: true,
      features: ['5 ad accounts', 'Unlimited AI chat', '50 images/month', '10 videos/month', 'Autopilot Alerts', 'Competitor Spy', 'Weekly Strategy Reports', 'Priority Support'],
    },
    {
      name: 'Agency', monthlyPrice: '$149', annualPrice: '$119', featured: false,
      features: ['Unlimited ad accounts', 'Unlimited everything', 'Client reporting', 'White-label reports', 'Agency Command Center', 'Dedicated CSM', 'API Access'],
    },
  ];

  comparisonRows = [
    { feature: 'AI Strategy Chat',     cosmisk: true,  madgicx: false, adden: true,  tripleWhale: false },
    { feature: 'Creative Generation',   cosmisk: true,  madgicx: true,  adden: true,  tripleWhale: false },
    { feature: 'Video Generation',      cosmisk: true,  madgicx: false, adden: false, tripleWhale: false },
    { feature: 'UGC Scripts',           cosmisk: true,  madgicx: false, adden: false, tripleWhale: false },
    { feature: 'Autopilot Alerts',      cosmisk: true,  madgicx: true,  adden: false, tripleWhale: true  },
    { feature: 'Competitor Spy',        cosmisk: true,  madgicx: true,  adden: false, tripleWhale: false },
    { feature: 'Weekly Reports',        cosmisk: true,  madgicx: false, adden: false, tripleWhale: true  },
    { feature: 'Forecasting',           cosmisk: true,  madgicx: false, adden: false, tripleWhale: true  },
  ];

  faqs = [
    { q: 'Is there a free plan?', a: 'Yes! The Free plan includes 1 ad account, 20 AI chats per day, and full dashboard access. No credit card required.' },
    { q: 'Can I switch plans anytime?', a: 'Yes, pro-rated billing. Upgrade instantly, downgrade at the end of your billing cycle.' },
    { q: 'What happens when my trial ends?', a: 'You\'ll be downgraded to the Free plan. No data is lost. Upgrade anytime to restore full access.' },
    { q: 'Do you support platforms other than Meta?', a: 'Meta is our primary platform. Google Ads and TikTok support are in beta, planned for Q2 2026.' },
    { q: 'How does the agency plan work?', a: 'The Agency plan ($149/mo) includes the Agency Command Center. One login, unlimited ad accounts. White-label reports with your agency branding and a dedicated CSM.' },
    { q: 'What payment methods do you accept?', a: 'We accept all major credit and debit cards. Payments are securely processed via Stripe.' },
    { q: 'Is my data secure?', a: 'SOC 2 compliance in progress. All data is encrypted at rest and in transit. We request read-only access to your Meta account.' },
    { q: 'Can I get a custom plan?', a: 'Yes! Contact our sales team for enterprise needs. Custom pricing and dedicated infrastructure available.' },
  ];

  toggleFaq(i: number) {
    this.openFaq.set(this.openFaq() === i ? null : i);
  }
}
