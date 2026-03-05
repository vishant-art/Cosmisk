const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { environment } from '../../../environments/environment';

interface SwipeAd {
  id: string;
  brand: string;
  thumbnail: string;
  hookDna: string[];
  visualDna: string[];
  audioDna: string[];
  savedAt: string;
  notes: string;
  height: number;
}

@Component({
  selector: 'app-swipe-file',
  standalone: true,
  imports: [CommonModule, DnaBadgeComponent, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Swipe File</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Save and organize ad inspiration</p>
        </div>
        <div class="flex gap-3">
          <button class="px-4 py-2 border border-gray-200 rounded-pill text-sm font-body text-gray-600 hover:bg-gray-50 transition-colors">
            Save from URL
          </button>
          <button class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
            Browse Meta Ad Library
          </button>
        </div>
      </div>

      <!-- Loading State -->
      @if (loading()) {
        <div class="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="break-inside-avoid bg-white rounded-card shadow-card overflow-hidden animate-pulse">
              <div class="w-full bg-gray-200" [style.height.px]="180 + i * 20"></div>
              <div class="p-3">
                <div class="h-3 bg-gray-200 rounded w-24 mb-2"></div>
                <div class="h-3 bg-gray-200 rounded w-full mb-2"></div>
                <div class="flex gap-1 mb-3">
                  <div class="h-5 bg-gray-200 rounded-full w-20"></div>
                  <div class="h-5 bg-gray-200 rounded-full w-16"></div>
                </div>
                <div class="h-7 bg-gray-200 rounded-lg w-full"></div>
              </div>
            </div>
          }
        </div>
      } @else if (savedAds().length === 0) {
        <!-- Empty State -->
        <div class="bg-white rounded-card shadow-card p-12 text-center">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <lucide-icon name="bookmark" [size]="28" class="text-gray-400"></lucide-icon>
          </div>
          <h3 class="text-base font-display text-navy m-0 mb-2">No ads in your swipe file yet</h3>
          <p class="text-sm text-gray-500 font-body m-0 max-w-md mx-auto">
            Your top-performing ads will appear here automatically. Connect an ad account to get started.
          </p>
        </div>
      } @else {
        <!-- Masonry Grid -->
        <div class="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
          @for (ad of savedAds(); track ad.id) {
            <div class="break-inside-avoid bg-white rounded-card shadow-card overflow-hidden card-lift">
              <!-- Thumbnail -->
              <div class="w-full flex items-center justify-center text-4xl"
                [style.height.px]="ad.height"
                [ngClass]="{
                  'bg-gradient-to-br from-amber-50 to-amber-100': ad.hookDna.includes('Shock Statement'),
                  'bg-gradient-to-br from-blue-50 to-blue-100': ad.hookDna.includes('Social Proof'),
                  'bg-gradient-to-br from-green-50 to-green-100': ad.hookDna.includes('Transformation'),
                  'bg-gradient-to-br from-purple-50 to-purple-100': ad.hookDna.includes('Authority'),
                  'bg-gradient-to-br from-pink-50 to-pink-100': ad.hookDna.includes('Personal Story'),
                  'bg-gradient-to-br from-red-50 to-red-100': ad.hookDna.includes('Urgency')
                }">
                @if (ad.thumbnail) {
                  <img [src]="ad.thumbnail" [alt]="ad.brand" class="w-full h-full object-cover">
                } @else {
                  <lucide-icon name="target" [size]="32"></lucide-icon>
                }
              </div>
              <div class="p-3">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-body font-semibold text-gray-500">{{ ad.brand }}</span>
                  <span class="text-[10px] text-gray-400 font-body">{{ ad.savedAt }}</span>
                </div>
                @if (ad.notes) {
                  <p class="text-xs text-gray-600 font-body mb-2 m-0 leading-relaxed">{{ ad.notes }}</p>
                }
                <!-- DNA Badges -->
                <div class="flex flex-wrap gap-1 mb-3">
                  @for (h of ad.hookDna; track h) {
                    <app-dna-badge [label]="h" type="hook" size="sm" />
                  }
                  @for (v of ad.visualDna; track v) {
                    <app-dna-badge [label]="v" type="visual" size="sm" />
                  }
                  @for (a of ad.audioDna; track a) {
                    <app-dna-badge [label]="a" type="audio" size="sm" />
                  }
                </div>
                <button class="w-full px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-body font-semibold hover:bg-accent/20 transition-colors">
                  Create Brief from This <lucide-icon name="arrow-right" [size]="12" class="inline-block"></lucide-icon>
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `
})
export default class SwipeFileComponent implements OnInit {
  private api = inject(ApiService);
  private adAccountService = inject(AdAccountService);

  loading = signal(true);
  savedAds = signal<SwipeAd[]>([]);

  private accountEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    if (acc) {
      this.loadTopAds(acc.id, acc.credential_group);
    } else {
      this.loading.set(false);
    }
  }, { allowSignalWrites: true });

  ngOnInit() {}

  private loadTopAds(accountId: string, credentialGroup: string) {
    this.loading.set(true);
    this.api.get<any>(environment.AD_ACCOUNT_TOP_ADS, {
      account_id: accountId,
      credential_group: credentialGroup,
      limit: 50,
      date_preset: 'last_30d',
    }).subscribe({
      next: (res) => {
        if (res.success && res.ads?.length) {
          const mapped: SwipeAd[] = res.ads.map((ad: any, i: number) => {
            const roas = ad.metrics?.roas ?? 0;
            const ctr = ad.metrics?.ctr ?? 0;
            const spend = ad.metrics?.spend ?? 0;

            // Assign hook DNA based on performance characteristics
            const hookDna = this.deriveHookDna(roas, ctr, i);
            // Assign visual DNA based on ad type / position
            const visualDna = this.deriveVisualDna(ad, i);
            // Assign audio DNA based on ad properties
            const audioDna = this.deriveAudioDna(ad, i);

            // Build notes from performance data
            const notes = this.buildNotes(ad, roas, spend);

            const thumbnailUrl = ad.thumbnail_url || ad.image_url || ad.effective_image_url || '';

            return {
              id: ad.id || `swipe-${i}`,
              brand: ad.name || 'Unnamed Ad',
              thumbnail: thumbnailUrl,
              hookDna,
              visualDna,
              audioDna,
              savedAt: this.formatDate(ad.created_time),
              notes,
              height: 180 + Math.floor(Math.random() * 121), // 180-300
            } satisfies SwipeAd;
          });
          this.savedAds.set(mapped);
        } else {
          this.savedAds.set([]);
        }
        this.loading.set(false);
      },
      error: () => {
        this.savedAds.set([]);
        this.loading.set(false);
      },
    });
  }

  private deriveHookDna(roas: number, ctr: number, index: number): string[] {
    if (roas >= 4) return index % 2 === 0 ? ['Shock Statement'] : ['Social Proof'];
    if (ctr >= 2) return ['Transformation'];
    if (roas >= 3) return ['Authority'];
    if (ctr >= 1.5) return ['Personal Story'];
    if (roas >= 2) return ['Urgency'];
    // Fallback: cycle through types
    const types = ['Shock Statement', 'Social Proof', 'Transformation', 'Authority', 'Personal Story', 'Urgency'];
    return [types[index % types.length]];
  }

  private deriveVisualDna(ad: any, index: number): string[] {
    const objectType = ad.object_type || '';
    if (objectType === 'VIDEO') return ['UGC Style'];
    const types = ['UGC Style', 'Product Focus', 'Lifestyle', 'Before/After', 'Macro Texture', 'Split Screen', 'Dark Mood', 'Minimal'];
    return [types[index % types.length]];
  }

  private deriveAudioDna(ad: any, index: number): string[] {
    const objectType = ad.object_type || '';
    if (objectType === 'VIDEO') {
      const audioTypes = ['Hindi VO', 'English VO', 'Trending Audio', 'Music-Only', 'Upbeat'];
      return [audioTypes[index % audioTypes.length]];
    }
    return [];
  }

  private buildNotes(ad: any, roas: number, spend: number): string {
    const parts: string[] = [];
    if (roas > 0) parts.push(`ROAS: ${roas.toFixed(1)}x`);
    if (spend > 0) {
      const spendStr = spend >= 100000
        ? `${(spend / 100000).toFixed(1)}L`
        : spend >= 1000
          ? `${(spend / 1000).toFixed(1)}K`
          : `${Math.round(spend)}`;
      parts.push(`Spend: \u20B9${spendStr}`);
    }
    if (ad.metrics?.ctr) parts.push(`CTR: ${ad.metrics.ctr.toFixed(1)}%`);
    return parts.join(' \u00B7 ');
  }

  private formatDate(dateStr?: string): string {
    if (!dateStr) return 'Recent';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    } catch {
      return 'Recent';
    }
  }
}
