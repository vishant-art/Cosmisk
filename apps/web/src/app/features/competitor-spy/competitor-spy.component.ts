import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

interface CompetitorAd {
  id: string;
  page_name: string;
  body: string | null;
  headline: string | null;
  snapshot_url: string;
  running_since: string;
  est_spend: string | null;
}

interface CompetitorSpyResponse {
  success: boolean;
  query: string;
  stats: {
    total_ads: number;
    unique_pages: number;
    platforms: string[];
    oldest_ad_date: string;
  };
  analysis: string;
  sample_ads: CompetitorAd[];
}

@Component({
  selector: 'app-competitor-spy',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-page-title font-display text-navy m-0">Competitor Spy</h1>
        <p class="text-sm text-gray-500 font-body mt-1 mb-0">Analyze any brand's active Meta ads and creative strategy</p>
      </div>

      <!-- Search Bar -->
      <div class="bg-white rounded-card shadow-card p-5">
        <form (ngSubmit)="search()" class="flex flex-col sm:flex-row gap-3">
          <div class="flex-1">
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Brand Name</label>
            <div class="relative">
              <lucide-icon name="search" [size]="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></lucide-icon>
              <input
                type="text"
                [(ngModel)]="query"
                name="query"
                placeholder="e.g. Nike, Glossier, Boat..."
                class="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none"
              />
            </div>
          </div>
          <div class="w-full sm:w-36">
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Country</label>
            <select
              [(ngModel)]="country"
              name="country"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
              @for (c of countries; track c.code) {
                <option [value]="c.code">{{ c.label }}</option>
              }
            </select>
          </div>
          <div class="flex items-end">
            <button
              type="submit"
              [disabled]="!query.trim() || loading()"
              class="px-5 py-2 bg-accent text-white rounded-lg text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
              @if (loading()) {
                Analyzing...
              } @else {
                Analyze Ads
              }
            </button>
          </div>
        </form>
      </div>

      <!-- Loading State -->
      @if (loading()) {
        <div class="space-y-4">
          <!-- Stats skeleton -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            @for (i of [1,2,3,4]; track i) {
              <div class="bg-white rounded-card shadow-card p-4 animate-pulse">
                <div class="h-3 bg-gray-200 rounded w-20 mb-2"></div>
                <div class="h-6 bg-gray-200 rounded w-16"></div>
              </div>
            }
          </div>
          <!-- Analysis skeleton -->
          <div class="bg-white rounded-card shadow-card p-5 animate-pulse">
            <div class="h-4 bg-gray-200 rounded w-32 mb-4"></div>
            <div class="space-y-2">
              <div class="h-3 bg-gray-200 rounded w-full"></div>
              <div class="h-3 bg-gray-200 rounded w-5/6"></div>
              <div class="h-3 bg-gray-200 rounded w-4/6"></div>
              <div class="h-3 bg-gray-200 rounded w-full"></div>
              <div class="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
          <!-- Ads grid skeleton -->
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (i of [1,2,3]; track i) {
              <div class="bg-white rounded-card shadow-card p-4 animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-28 mb-3"></div>
                <div class="h-3 bg-gray-200 rounded w-full mb-2"></div>
                <div class="h-3 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div class="h-3 bg-gray-200 rounded w-20"></div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Results -->
      @if (!loading() && result()) {
        <!-- Stats Bar -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-card shadow-card p-4">
            <p class="text-[10px] text-gray-400 font-body uppercase tracking-wide mb-1">Total Ads</p>
            <p class="text-xl font-display text-navy m-0">{{ result()!.stats.total_ads }}</p>
          </div>
          <div class="bg-white rounded-card shadow-card p-4">
            <p class="text-[10px] text-gray-400 font-body uppercase tracking-wide mb-1">Unique Pages</p>
            <p class="text-xl font-display text-navy m-0">{{ result()!.stats.unique_pages }}</p>
          </div>
          <div class="bg-white rounded-card shadow-card p-4">
            <p class="text-[10px] text-gray-400 font-body uppercase tracking-wide mb-1">Platforms</p>
            <p class="text-xl font-display text-navy m-0">{{ result()!.stats.platforms.join(', ') }}</p>
          </div>
          <div class="bg-white rounded-card shadow-card p-4">
            <p class="text-[10px] text-gray-400 font-body uppercase tracking-wide mb-1">Oldest Ad</p>
            <p class="text-xl font-display text-navy m-0">{{ result()!.stats.oldest_ad_date }}</p>
          </div>
        </div>

        <!-- AI Analysis -->
        <div class="bg-white rounded-card shadow-card p-5">
          <div class="flex items-center gap-2 mb-4">
            <lucide-icon name="sparkles" [size]="18" class="text-accent"></lucide-icon>
            <h2 class="text-base font-display text-navy m-0">AI Analysis</h2>
          </div>
          <div class="space-y-3">
            @for (paragraph of analysisParagraphs(); track $index) {
              <p class="text-sm text-gray-700 font-body leading-relaxed m-0">{{ paragraph }}</p>
            }
          </div>
        </div>

        <!-- Sample Ads Grid -->
        <div>
          <h2 class="text-base font-display text-navy mb-3">Sample Ads ({{ result()!.sample_ads.length }})</h2>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (ad of result()!.sample_ads; track ad.id) {
              <div class="bg-white rounded-card shadow-card p-4 flex flex-col">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-sm font-body font-semibold text-navy truncate max-w-[70%]">{{ ad.page_name }}</span>
                  <a [href]="ad.snapshot_url" target="_blank" rel="noopener noreferrer"
                    class="text-accent hover:text-accent/80 transition-colors flex items-center gap-1 text-[10px] font-body font-semibold shrink-0">
                    <lucide-icon name="external-link" [size]="12"></lucide-icon>
                    View Ad
                  </a>
                </div>

                @if (ad.headline) {
                  <p class="text-xs font-body font-semibold text-navy mb-1 m-0">{{ ad.headline }}</p>
                }

                @if (ad.body) {
                  <p class="text-xs text-gray-600 font-body leading-relaxed mb-3 m-0 line-clamp-3">{{ ad.body }}</p>
                } @else {
                  <p class="text-xs text-gray-400 font-body italic mb-3 m-0">No body text available</p>
                }

                <div class="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div class="flex items-center gap-1 text-[10px] text-gray-500 font-body">
                    <lucide-icon name="calendar" [size]="11"></lucide-icon>
                    <span>{{ ad.running_since }}</span>
                  </div>
                  @if (ad.est_spend) {
                    <span class="text-[10px] font-body font-semibold px-2 py-0.5 bg-amber-50 text-amber-700 rounded">
                      {{ ad.est_spend }}
                    </span>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Empty State -->
      @if (!loading() && !result() && !error()) {
        <div class="bg-white rounded-card shadow-card p-12 text-center">
          <lucide-icon name="radar" [size]="48" class="mx-auto mb-3 text-gray-300"></lucide-icon>
          <h3 class="text-sm font-body font-semibold text-navy mb-1">Search for a brand to see their active Meta ads</h3>
          <p class="text-xs text-gray-500 font-body max-w-sm mx-auto m-0">
            Enter a brand name and country to analyze their ad library, creative strategy, and estimated spend.
          </p>
        </div>
      }

      <!-- Error State -->
      @if (!loading() && error()) {
        <div class="bg-white rounded-card shadow-card p-8 text-center">
          <lucide-icon name="alert-triangle" [size]="48" class="mx-auto mb-3 text-red-300"></lucide-icon>
          <h3 class="text-sm font-body font-semibold text-navy mb-1">Something went wrong</h3>
          <p class="text-xs text-gray-500 font-body max-w-sm mx-auto m-0">{{ error() }}</p>
        </div>
      }
    </div>
  `
})
export default class CompetitorSpyComponent {
  private api = inject(ApiService);

  query = '';
  country = 'IN';
  loading = signal(false);
  result = signal<CompetitorSpyResponse | null>(null);
  error = signal<string | null>(null);

  countries = [
    { code: 'IN', label: 'India' },
    { code: 'US', label: 'United States' },
    { code: 'UK', label: 'United Kingdom' },
    { code: 'AU', label: 'Australia' },
    { code: 'CA', label: 'Canada' },
    { code: 'DE', label: 'Germany' },
    { code: 'FR', label: 'France' },
    { code: 'BR', label: 'Brazil' },
    { code: 'AE', label: 'UAE' },
    { code: 'SG', label: 'Singapore' },
  ];

  analysisParagraphs = signal<string[]>([]);

  search() {
    const q = this.query.trim();
    if (!q) return;

    this.loading.set(true);
    this.result.set(null);
    this.error.set(null);
    this.analysisParagraphs.set([]);

    this.api.get<CompetitorSpyResponse>(environment.COMPETITOR_SPY_ANALYZE, {
      query: q,
      country: this.country,
    }).subscribe({
      next: (res) => {
        if (res.success) {
          this.result.set(res);
          this.analysisParagraphs.set(
            res.analysis
              .split('\n')
              .map(p => p.trim())
              .filter(p => p.length > 0)
          );
        } else {
          this.error.set('Analysis failed. Please try a different brand name.');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to analyze brand. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
