const _BUILD_VER = '2026-02-13-v2';
import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';

interface AuditCategory {
  name: string;
  score: number;
  icon: string;
  status: 'pass' | 'warning' | 'fail';
  description: string;
  recommendation: string;
  details: string[];
}

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Account Audit</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Comprehensive ad account health check</p>
        </div>
        <div class="flex gap-3">
          <button
            (click)="generateFullReport()"
            class="px-4 py-2 border border-accent text-accent rounded-pill text-sm font-body font-semibold hover:bg-accent/5 transition-colors">
            Generate Full Audit Report
          </button>
          <button
            (click)="fixIssues()"
            [disabled]="fixing()"
            class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40">
            @if (fixing()) {
              <span class="inline-flex items-center gap-1.5">
                <span class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Fixing...
              </span>
            } @else {
              Fix Issues Automatically
            }
          </button>
        </div>
      </div>

      <!-- Overall Health Score -->
      <div class="bg-white rounded-card shadow-card p-6">
        <div class="flex items-center gap-8">
          <!-- Circular gauge -->
          <div class="relative w-40 h-40 shrink-0">
            <svg class="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <!-- Background circle -->
              <circle cx="60" cy="60" r="52" fill="none" stroke="#f3f4f6" stroke-width="12" />
              <!-- Score arc -->
              <circle cx="60" cy="60" r="52" fill="none"
                [attr.stroke]="overallScore >= 80 ? '#22c55e' : overallScore >= 60 ? '#f59e0b' : '#ef4444'"
                stroke-width="12"
                stroke-linecap="round"
                [attr.stroke-dasharray]="scoreCircumference"
                [attr.stroke-dashoffset]="scoreDashOffset" />
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-3xl font-display"
                [ngClass]="overallScore >= 80 ? 'text-green-600' : overallScore >= 60 ? 'text-amber-600' : 'text-red-600'">
                {{ overallScore }}
              </span>
              <span class="text-xs text-gray-400 font-body">/100</span>
            </div>
          </div>
          <div class="flex-1">
            <h2 class="text-lg font-display text-navy m-0 mb-1">Overall Health Score</h2>
            <p class="text-sm text-gray-500 font-body mb-3">
              @if (overallScore >= 80) {
                Your account is in good health. A few optimizations could push performance higher.
              } @else if (overallScore >= 60) {
                Your account has some areas that need attention. Addressing warnings could improve ROAS by 15-25%.
              } @else {
                Your account needs significant attention. Multiple issues are impacting performance.
              }
            </p>
            <div class="flex gap-6 text-xs font-body">
              <div>
                <span class="text-green-600 font-semibold">{{ passCount }}</span>
                <span class="text-gray-500"> passed</span>
              </div>
              <div>
                <span class="text-amber-600 font-semibold">{{ warningCount }}</span>
                <span class="text-gray-500"> warnings</span>
              </div>
              <div>
                <span class="text-red-600 font-semibold">{{ failCount }}</span>
                <span class="text-gray-500"> failed</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Audit Categories -->
      <div class="grid md:grid-cols-2 gap-4">
        @for (cat of categories; track cat.name) {
          <div class="bg-white rounded-card shadow-card p-5 hover:shadow-card-hover transition-all cursor-pointer"
            (click)="toggleExpand(cat.name)">
            <div class="flex items-start gap-3">
              <!-- Status icon -->
              <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                [ngClass]="{
                  'bg-green-100': cat.status === 'pass',
                  'bg-amber-100': cat.status === 'warning',
                  'bg-red-100': cat.status === 'fail'
                }">
                <span class="text-lg">
                  @if (cat.status === 'pass') { <lucide-icon name="check-circle-2" [size]="20" class="text-green-500"></lucide-icon> }
                  @else if (cat.status === 'warning') { <lucide-icon name="alert-triangle" [size]="20" class="text-yellow-500"></lucide-icon> }
                  @else { <lucide-icon name="x-circle" [size]="20" class="text-red-500"></lucide-icon> }
                </span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-1">
                  <h3 class="text-sm font-body font-semibold text-navy m-0">{{ cat.name }}</h3>
                  <div class="flex items-center gap-2">
                    <span class="text-lg font-display"
                      [ngClass]="cat.score >= 80 ? 'text-green-600' : cat.score >= 60 ? 'text-amber-600' : 'text-red-600'">
                      {{ cat.score }}
                    </span>
                    <span class="text-[10px] text-gray-400 font-body">/100</span>
                  </div>
                </div>
                <!-- Score bar -->
                <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div class="h-full rounded-full transition-all"
                    [ngClass]="{
                      'bg-green-500': cat.score >= 80,
                      'bg-amber-500': cat.score >= 60 && cat.score < 80,
                      'bg-red-500': cat.score < 60
                    }"
                    [style.width.%]="cat.score"></div>
                </div>
                <p class="text-xs text-gray-600 font-body m-0 leading-relaxed">{{ cat.description }}</p>

                <!-- Expanded details -->
                @if (expandedCategory() === cat.name) {
                  <div class="mt-3 pt-3 border-t border-gray-100">
                    <div class="mb-3">
                      <span class="text-[10px] font-body font-semibold text-gray-500 uppercase block mb-1">Issues Found</span>
                      <ul class="m-0 pl-4 space-y-1">
                        @for (detail of cat.details; track detail) {
                          <li class="text-xs text-gray-600 font-body">{{ detail }}</li>
                        }
                      </ul>
                    </div>
                    <div class="p-3 rounded-lg"
                      [ngClass]="cat.status === 'pass' ? 'bg-green-50' : cat.status === 'warning' ? 'bg-amber-50' : 'bg-red-50'">
                      <span class="text-[10px] font-body font-semibold uppercase block mb-1"
                        [ngClass]="cat.status === 'pass' ? 'text-green-700' : cat.status === 'warning' ? 'text-amber-700' : 'text-red-700'">
                        Recommendation
                      </span>
                      <p class="text-xs font-body m-0 leading-relaxed"
                        [ngClass]="cat.status === 'pass' ? 'text-green-700' : cat.status === 'warning' ? 'text-amber-700' : 'text-red-700'">
                        {{ cat.recommendation }}
                      </p>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `
})
export default class AuditComponent {
  private toast = inject(ToastService);

  fixing = signal(false);
  expandedCategory = signal<string | null>(null);

  overallScore = 74;

  private readonly radius = 52;
  scoreCircumference = 2 * Math.PI * this.radius;
  scoreDashOffset = this.scoreCircumference - (this.overallScore / 100) * this.scoreCircumference;

  categories: AuditCategory[] = [
    {
      name: 'Account Structure',
      score: 85,
      icon: '🏗️',
      status: 'pass',
      description: 'Campaign and ad set organization follows best practices with proper naming conventions.',
      recommendation: 'Consider consolidating 2 overlapping ad sets in "Bundle Offers" campaign to reduce audience fragmentation.',
      details: [
        '5 active campaigns with clear naming conventions',
        '18 ad sets with proper budget allocation',
        '2 ad sets have >70% audience overlap (minor)',
        'Campaign objectives correctly mapped to funnel stages',
      ],
    },
    {
      name: 'Creative Health',
      score: 68,
      icon: '🎨',
      status: 'warning',
      description: '3 creatives showing fatigue signals. Ad variety is below recommended threshold.',
      recommendation: 'Use Director Lab to generate 5-8 new creative variations. Focus on winning DNA patterns (Shock Statement + UGC). Pause "Summer Sale Banner" immediately.',
      details: [
        '3 creatives with declining CTR (fatigue signal)',
        'Only 12 active creatives vs 20+ recommended',
        '67% video, 33% static — consider adding carousels',
        'Average creative age: 18 days (refresh recommended at 14)',
      ],
    },
    {
      name: 'Audience Targeting',
      score: 82,
      icon: '🎯',
      status: 'pass',
      description: 'Audience targeting is well-segmented with appropriate exclusions in place.',
      recommendation: 'Test expanding lookalike audiences from 1% to 2-3% for "Collagen Range" campaign. Add interest-based exclusions for "Brand Awareness" to reduce wasted spend.',
      details: [
        'Lookalike audiences based on purchasers (good)',
        'Proper exclusions between prospecting and retargeting',
        'Interest targeting in top of funnel is somewhat broad',
        'Custom audience refresh: 3 days ago (adequate)',
      ],
    },
    {
      name: 'Budget Allocation',
      score: 65,
      icon: '💰',
      status: 'warning',
      description: 'Budget distribution doesn\'t fully align with ROAS performance. Some misallocation detected.',
      recommendation: 'Reallocate 20% of "Brand Awareness" budget to "Retargeting — Cart" (5.2x ROAS). "Bundle Offers" should get 15% more budget based on CPA efficiency.',
      details: [
        '"Retargeting — Cart" has highest ROAS but only 13% of budget',
        '"Brand Awareness" consumes 10% budget with 1.8x ROAS',
        'No automated rules for budget reallocation',
        'Daily budget caps are static — consider CBO migration',
      ],
    },
    {
      name: 'Bidding Strategy',
      score: 78,
      icon: '🔨',
      status: 'pass',
      description: 'Bidding strategies are appropriate for campaign objectives. Minor optimizations possible.',
      recommendation: 'Switch "Vitamin C Launch" from lowest cost to cost cap (₹350 target CPA) to improve efficiency. Enable campaign budget optimization for "Collagen Range".',
      details: [
        '3 campaigns on Lowest Cost (acceptable for scale)',
        '1 campaign on Cost Cap (good for efficiency)',
        '"Brand Awareness" using Reach objective (correct)',
        'No bid cap experimentation in last 30 days',
      ],
    },
    {
      name: 'Creative Diversity',
      score: 52,
      icon: '🌈',
      status: 'fail',
      description: 'Low creative diversity. Over-reliance on few formats and DNA types.',
      recommendation: 'Urgently create 8-10 new creatives with diverse DNA combinations. Add carousel format (0% currently). Test 3 new hook types: Curiosity, Authority, Personal Story.',
      details: [
        'Only 2 hook types used across 67% of creatives',
        '0 carousel creatives (missing format entirely)',
        'Audio DNA limited to Hindi VO and Music-Only',
        'Visual styles concentrated on UGC (58%) — low variety',
      ],
    },
  ];

  get passCount(): number { return this.categories.filter(c => c.status === 'pass').length; }
  get warningCount(): number { return this.categories.filter(c => c.status === 'warning').length; }
  get failCount(): number { return this.categories.filter(c => c.status === 'fail').length; }

  toggleExpand(name: string) {
    this.expandedCategory.set(this.expandedCategory() === name ? null : name);
  }

  generateFullReport() {
    this.toast.info('Generating Report', 'Full audit report will be ready in your Reports section');
  }

  fixIssues() {
    this.fixing.set(true);
    setTimeout(() => {
      this.fixing.set(false);
      this.toast.success('Issues Fixed', '4 automatic optimizations applied: paused fatiguing creatives, adjusted budgets, updated bid strategies');
    }, 3000);
  }
}
