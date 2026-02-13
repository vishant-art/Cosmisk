const _BUILD_VER = '2026-02-13-v2';
import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/services/toast.service';

interface DnaPattern {
  id: string;
  name: string;
  description: string;
  brands: string[];
  confidence: number;
  sampleSize: number;
  avgRoas: number;
  type: 'hook' | 'visual' | 'audio';
}

interface Competitor {
  name: string;
  logo: string;
  category: string;
  topHooks: { label: string; roas: number }[];
  topVisuals: { label: string; roas: number }[];
  trends: string[];
  adSpendEstimate: string;
}

@Component({
  selector: 'app-brain',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-page-title font-display text-navy m-0">Brain</h1>
        <p class="text-sm text-gray-500 font-body mt-1 mb-0">Cross-brand creative intelligence and competitive insights</p>
      </div>

      <!-- Section 1: Cross-Brand DNA Patterns -->
      <div>
        <h2 class="text-base font-display text-navy mb-3">Cross-Brand DNA Patterns</h2>
        <p class="text-xs text-gray-500 font-body mb-4">Patterns discovered across all your managed brands</p>
        <div class="grid md:grid-cols-2 gap-4">
          @for (pattern of patterns; track pattern.id) {
            <div class="bg-white rounded-card shadow-card p-5 border-l-4 transition-all hover:shadow-card-hover"
              [ngClass]="{
                'border-amber-500': pattern.type === 'hook',
                'border-blue-500': pattern.type === 'visual',
                'border-green-500': pattern.type === 'audio'
              }">
              <div class="flex items-start justify-between mb-2">
                <div>
                  <span class="text-[10px] font-body font-semibold uppercase px-1.5 py-0.5 rounded"
                    [ngClass]="{
                      'bg-amber-100 text-amber-700': pattern.type === 'hook',
                      'bg-blue-100 text-blue-700': pattern.type === 'visual',
                      'bg-green-100 text-green-700': pattern.type === 'audio'
                    }">
                    {{ pattern.type }}
                  </span>
                  <h3 class="text-sm font-body font-semibold text-navy mt-1.5 mb-0">{{ pattern.name }}</h3>
                </div>
                <div class="text-right">
                  <span class="text-lg font-display text-navy">{{ pattern.confidence }}%</span>
                  <span class="text-[10px] text-gray-400 font-body block">confidence</span>
                </div>
              </div>
              <p class="text-xs text-gray-600 font-body mb-3 leading-relaxed">{{ pattern.description }}</p>
              <div class="flex items-center gap-2 mb-3">
                <span class="text-[10px] text-gray-400 font-body">Brands:</span>
                @for (brand of pattern.brands; track brand) {
                  <span class="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-body">{{ brand }}</span>
                }
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4 text-[10px] text-gray-500 font-body">
                  <span>{{ pattern.sampleSize }} creatives analyzed</span>
                  <span>Avg ROAS: <strong class="text-navy">{{ pattern.avgRoas }}x</strong></span>
                </div>
                <button
                  (click)="applyPattern(pattern)"
                  class="px-3 py-1 bg-accent text-white rounded-pill text-[10px] font-body font-semibold hover:bg-accent/90 transition-colors">
                  Apply to Brief
                </button>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Section 2: Compare Brands -->
      <div class="bg-white rounded-card shadow-card p-5">
        <h2 class="text-base font-display text-navy mb-3 mt-0">Compare Brands</h2>
        <div class="flex flex-wrap gap-3 mb-4">
          <div>
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Select Brands</label>
            <div class="flex flex-wrap gap-2">
              @for (brand of allBrands; track brand) {
                <button
                  (click)="toggleBrand(brand)"
                  class="px-3 py-1 rounded-pill text-xs font-body transition-colors"
                  [ngClass]="selectedBrands().includes(brand) ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
                  {{ brand }}
                </button>
              }
            </div>
          </div>
          <div class="ml-auto">
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Metric</label>
            <select [(ngModel)]="compareMetric" class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
              <option value="roas">ROAS</option>
              <option value="cpa">CPA</option>
              <option value="ctr">CTR</option>
              <option value="spend">Ad Spend</option>
            </select>
          </div>
        </div>
        <!-- Bar chart placeholder -->
        <div class="h-56 border border-gray-100 rounded-lg p-4 flex items-end gap-6 justify-center">
          @for (brand of selectedBrands(); track brand) {
            <div class="flex flex-col items-center gap-2">
              <div class="w-16 rounded-t transition-all"
                [style.height.px]="getBrandMetric(brand) * 40"
                [ngClass]="{
                  'bg-accent': brand === 'OZiva',
                  'bg-blue-500': brand === 'WOW Skin Science',
                  'bg-green-500': brand === 'Plum Goodness',
                  'bg-amber-500': brand === 'The Man Company',
                  'bg-purple-500': brand === 'mCaffeine'
                }">
              </div>
              <span class="text-xs font-body font-semibold text-navy">{{ getBrandMetric(brand) }}{{ compareMetric === 'roas' ? 'x' : compareMetric === 'ctr' ? '%' : compareMetric === 'cpa' ? '' : 'L' }}</span>
              <span class="text-[10px] text-gray-500 font-body text-center max-w-[80px] truncate">{{ brand }}</span>
            </div>
          }
          @if (selectedBrands().length === 0) {
            <p class="text-sm text-gray-400 font-body">Select brands to compare</p>
          }
        </div>
      </div>

      <!-- Section 3: Competitor Watch -->
      <div>
        <h2 class="text-base font-display text-navy mb-3">Competitor Watch</h2>
        <p class="text-xs text-gray-500 font-body mb-4">Track competitor creative strategies and trends</p>
        <div class="grid md:grid-cols-3 gap-4">
          @for (comp of competitors; track comp.name) {
            <div class="bg-white rounded-card shadow-card p-5 hover:shadow-card-hover transition-all">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                  [ngClass]="{
                    'bg-orange-100': comp.name === 'WOW Skin Science',
                    'bg-green-100': comp.name === 'OZiva',
                    'bg-blue-100': comp.name === 'The Man Company'
                  }">
                  {{ comp.logo }}
                </div>
                <div>
                  <h3 class="text-sm font-body font-semibold text-navy m-0">{{ comp.name }}</h3>
                  <span class="text-[10px] text-gray-500 font-body">{{ comp.category }} · Est. {{ comp.adSpendEstimate }}/mo</span>
                </div>
              </div>

              <div class="mb-3">
                <span class="text-[10px] font-body font-semibold text-gray-500 uppercase block mb-1">Top Hooks</span>
                @for (hook of comp.topHooks; track hook.label) {
                  <div class="flex items-center justify-between py-1">
                    <span class="text-xs font-body text-gray-700">{{ hook.label }}</span>
                    <span class="text-xs font-body font-semibold"
                      [ngClass]="hook.roas >= 4 ? 'text-green-600' : 'text-navy'">{{ hook.roas }}x</span>
                  </div>
                }
              </div>

              <div class="mb-3">
                <span class="text-[10px] font-body font-semibold text-gray-500 uppercase block mb-1">Top Visuals</span>
                @for (vis of comp.topVisuals; track vis.label) {
                  <div class="flex items-center justify-between py-1">
                    <span class="text-xs font-body text-gray-700">{{ vis.label }}</span>
                    <span class="text-xs font-body font-semibold"
                      [ngClass]="vis.roas >= 4 ? 'text-green-600' : 'text-navy'">{{ vis.roas }}x</span>
                  </div>
                }
              </div>

              <div>
                <span class="text-[10px] font-body font-semibold text-gray-500 uppercase block mb-1">Trends</span>
                <div class="flex flex-wrap gap-1">
                  @for (trend of comp.trends; track trend) {
                    <span class="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-pill font-body">{{ trend }}</span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export default class BrainComponent {
  private toast = inject(ToastService);

  compareMetric = 'roas';
  selectedBrands = signal<string[]>(['OZiva', 'WOW Skin Science', 'Plum Goodness']);
  allBrands = ['OZiva', 'WOW Skin Science', 'Plum Goodness', 'The Man Company', 'mCaffeine'];

  patterns: DnaPattern[] = [
    {
      id: 'p-1',
      name: 'Shock Statement + UGC Style',
      description: 'Opening with a bold claim in UGC format delivers 38% higher ROAS across skincare brands. The authenticity of UGC combined with a disrupting hook creates maximum stopping power in feed.',
      brands: ['OZiva', 'Plum', 'WOW'],
      confidence: 92,
      sampleSize: 847,
      avgRoas: 4.8,
      type: 'hook',
    },
    {
      id: 'p-2',
      name: 'Hindi VO + Emotional Tone',
      description: 'Hindi voiceover with emotional undertone outperforms English VO by 2.1x in metro markets for health & beauty. Particularly effective for female 25-44 demographic.',
      brands: ['OZiva', 'WOW', 'Man Co.'],
      confidence: 88,
      sampleSize: 623,
      avgRoas: 4.2,
      type: 'audio',
    },
    {
      id: 'p-3',
      name: 'Before/After with Macro Shots',
      description: 'Combining transformation imagery with close-up product texture shots drives 45% higher add-to-cart rates. Works best for skincare and supplement categories.',
      brands: ['Plum', 'OZiva'],
      confidence: 85,
      sampleSize: 412,
      avgRoas: 4.5,
      type: 'visual',
    },
    {
      id: 'p-4',
      name: 'Price Anchor in First 3 Seconds',
      description: 'Leading with price comparison ("₹2999 vs ₹999") captures price-sensitive audiences immediately. Highest impact during sale events and for value-pack bundles.',
      brands: ['WOW', 'mCaffeine', 'Plum'],
      confidence: 81,
      sampleSize: 534,
      avgRoas: 4.1,
      type: 'hook',
    },
  ];

  competitors: Competitor[] = [
    {
      name: 'WOW Skin Science',
      logo: '🧴',
      category: 'Skincare',
      adSpendEstimate: '₹85L',
      topHooks: [
        { label: 'Ingredient Focus', roas: 4.2 },
        { label: 'Celebrity Endorsement', roas: 3.8 },
      ],
      topVisuals: [
        { label: 'Product Hero Shot', roas: 4.0 },
        { label: 'Before/After', roas: 3.6 },
      ],
      trends: ['Increasing UGC', 'Hindi-first', 'Reel-heavy'],
    },
    {
      name: 'OZiva',
      logo: '🌿',
      category: 'Health & Wellness',
      adSpendEstimate: '₹62L',
      topHooks: [
        { label: 'Transformation Story', roas: 4.5 },
        { label: 'Doctor Recommendation', roas: 4.1 },
      ],
      topVisuals: [
        { label: 'Lifestyle UGC', roas: 4.3 },
        { label: 'Infographic Style', roas: 3.4 },
      ],
      trends: ['Science-backed claims', 'Protein range push', 'Regional languages'],
    },
    {
      name: 'The Man Company',
      logo: '🧔',
      category: 'Men\'s Grooming',
      adSpendEstimate: '₹45L',
      topHooks: [
        { label: 'Humor / Relatable', roas: 3.9 },
        { label: 'Gift for Him', roas: 3.5 },
      ],
      topVisuals: [
        { label: 'Dark Mood Product', roas: 3.7 },
        { label: 'Flat Lay Premium', roas: 3.3 },
      ],
      trends: ['Premium positioning', 'Gift season focus', 'Instagram-first'],
    },
  ];

  private brandMetrics: Record<string, Record<string, number>> = {
    'OZiva': { roas: 4.2, cpa: 285, ctr: 2.8, spend: 8.5 },
    'WOW Skin Science': { roas: 3.8, cpa: 340, ctr: 2.4, spend: 12.1 },
    'Plum Goodness': { roas: 4.5, cpa: 255, ctr: 3.1, spend: 6.2 },
    'The Man Company': { roas: 3.2, cpa: 420, ctr: 1.9, spend: 4.5 },
    'mCaffeine': { roas: 3.6, cpa: 365, ctr: 2.2, spend: 5.8 },
  };

  toggleBrand(brand: string) {
    this.selectedBrands.update(brands => {
      if (brands.includes(brand)) return brands.filter(b => b !== brand);
      return [...brands, brand];
    });
  }

  getBrandMetric(brand: string): number {
    return this.brandMetrics[brand]?.[this.compareMetric] ?? 0;
  }

  applyPattern(pattern: DnaPattern) {
    this.toast.success('Pattern Applied', `"${pattern.name}" added to your next brief in Director Lab`);
  }
}
