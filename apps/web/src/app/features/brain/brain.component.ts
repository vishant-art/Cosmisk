const _BUILD_VER = '2026-03-03-v1';
import { Component, signal, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { environment } from '../../../environments/environment';

interface DnaPattern {
  id: string;
  name: string;
  description: string;
  brands: string[];
  confidence: number;
  sampleSize: number;
  avgRoas: number;
  type: 'performance' | 'efficiency' | 'spend' | 'info';
  insights?: string[];
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
  imports: [CommonModule, FormsModule, LucideAngularModule],
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

        @if (loading()) {
          <div class="grid md:grid-cols-2 gap-4">
            @for (i of [1,2,3,4]; track i) {
              <div class="bg-white rounded-card shadow-card p-5 animate-pulse border-l-4 border-gray-200">
                <div class="flex items-start justify-between mb-2">
                  <div>
                    <div class="h-4 bg-gray-200 rounded w-12 mb-2"></div>
                    <div class="h-4 bg-gray-200 rounded w-40"></div>
                  </div>
                  <div class="h-6 bg-gray-200 rounded w-12"></div>
                </div>
                <div class="h-3 bg-gray-200 rounded w-full mb-2"></div>
                <div class="h-3 bg-gray-200 rounded w-3/4 mb-3"></div>
                <div class="flex gap-2">
                  <div class="h-5 bg-gray-200 rounded w-16"></div>
                  <div class="h-5 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="grid md:grid-cols-2 gap-4">
            @for (pattern of patterns(); track pattern.id) {
              <div class="bg-white rounded-card shadow-card p-5 border-l-4 card-lift"
                [ngClass]="{
                  'border-amber-500': pattern.type === 'performance',
                  'border-blue-500': pattern.type === 'efficiency',
                  'border-red-500': pattern.type === 'spend',
                  'border-green-500': pattern.type === 'info'
                }">
                <div class="flex items-start justify-between mb-2">
                  <div>
                    <span class="text-[10px] font-body font-semibold uppercase px-1.5 py-0.5 rounded"
                      [ngClass]="{
                        'bg-amber-100 text-amber-700': pattern.type === 'performance',
                        'bg-blue-100 text-blue-700': pattern.type === 'efficiency',
                        'bg-red-100 text-red-700': pattern.type === 'spend',
                        'bg-green-100 text-green-700': pattern.type === 'info'
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
                <p class="text-xs text-gray-600 font-body mb-2 leading-relaxed">{{ pattern.description }}</p>
                @if (pattern.insights?.length) {
                  <ul class="list-none p-0 m-0 mb-3 space-y-1">
                    @for (insight of pattern.insights!.slice(0, 3); track insight) {
                      <li class="flex items-start gap-1.5 text-[11px] text-gray-500 font-body">
                        <lucide-icon name="arrow-right" [size]="10" class="text-accent mt-0.5 flex-shrink-0"></lucide-icon>
                        {{ insight }}
                      </li>
                    }
                  </ul>
                }
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
            @if (patterns().length === 0) {
              <div class="col-span-2 text-center py-12 text-gray-400">
                <lucide-icon name="brain" [size]="48" class="mx-auto mb-3 opacity-30"></lucide-icon>
                <p class="text-sm font-body">No patterns discovered yet. Run more campaigns to build intelligence.</p>
              </div>
            }
          </div>
        }
      </div>

      <!-- Section 2: Compare Brands -->
      <div class="bg-white rounded-card shadow-card p-5">
        <h2 class="text-base font-display text-navy mb-3 mt-0">Compare Brands</h2>
        <div class="flex flex-wrap gap-3 mb-4">
          <div>
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Select Brands</label>
            <div class="flex flex-wrap gap-2">
              @for (brand of allBrands(); track brand) {
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
        <!-- Brand comparison chart -->
        <div class="h-56 border border-gray-100 rounded-lg p-4 flex items-end gap-6 justify-center">
          @for (brand of selectedBrands(); track brand) {
            <div class="flex flex-col items-center gap-2">
              <div class="w-16 rounded-t transition-all bg-accent"
                [style.height.px]="getBrandMetric(brand) * 40">
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
        <div class="bg-white rounded-card shadow-card p-8 text-center">
          <lucide-icon name="search" [size]="48" class="mx-auto mb-3 text-gray-300"></lucide-icon>
          <h3 class="text-sm font-body font-semibold text-navy mb-1">Connect Ad Library Scanner</h3>
          <p class="text-xs text-gray-500 font-body max-w-sm mx-auto">Enable the Ad Library Scanner workflow to automatically track competitor creative strategies and trends.</p>
        </div>
      </div>
    </div>
  `
})
export default class BrainComponent implements OnInit {
  private toast = inject(ToastService);
  private api = inject(ApiService);
  private adAccountService = inject(AdAccountService);

  loading = signal(true);
  compareMetric = 'roas';
  selectedBrands = signal<string[]>([]);
  allBrands = signal<string[]>([]);
  patterns = signal<DnaPattern[]>([]);
  private allPatterns: DnaPattern[] = [];
  private brandMetrics: Record<string, Record<string, number>> = {};

  ngOnInit() {
    this.loadPatterns();
  }

  private loadPatterns() {
    this.loading.set(true);
    const acc = this.adAccountService.currentAccount();
    this.api.get<any>(environment.BRAIN_PATTERNS, acc ? {
      account_id: acc.id,
      credential_group: acc.credential_group,
    } : {}).subscribe({
      next: (res) => {
        if (res.success) {
          if (res.patterns?.length) {
            this.allPatterns = res.patterns;
            // Filter patterns to those containing the current account brand
            const accName = acc?.name?.toLowerCase() || '';
            const filtered = accName
              ? res.patterns.filter((p: DnaPattern) =>
                  p.brands.some(b => b.toLowerCase().includes(accName) || accName.includes(b.toLowerCase())))
              : res.patterns;
            this.patterns.set(filtered.length > 0 ? filtered : res.patterns);
          }
          if (res.brands?.length) {
            this.allBrands.set(res.brands);
            // Pre-select the current account's brand
            const accName = acc?.name?.toLowerCase() || '';
            const matchedBrand = res.brands.find((b: string) =>
              b.toLowerCase().includes(accName) || accName.includes(b.toLowerCase()));
            this.selectedBrands.set(matchedBrand ? [matchedBrand] : res.brands.slice(0, 1));
          }
          if (res.brandMetrics) {
            this.brandMetrics = res.brandMetrics;
          }
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Error', 'Failed to load brain patterns. Please try again.');
      },
    });
  }

  toggleBrand(brand: string) {
    this.selectedBrands.update(brands => {
      if (brands.includes(brand)) return brands.filter(b => b !== brand);
      return [...brands, brand];
    });
  }

  getBrandMetric(brand: string): number {
    return this.brandMetrics[brand]?.[this.compareMetric] ?? 0;
  }

  private router = inject(Router);

  applyPattern(pattern: DnaPattern) {
    this.router.navigate(['/app/director-lab'], {
      queryParams: {
        patternName: pattern.name,
        patternType: pattern.type,
      },
    });
  }
}
