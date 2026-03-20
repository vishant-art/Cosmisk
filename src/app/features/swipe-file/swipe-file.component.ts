const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';
import { ToastService } from '../../core/services/toast.service';
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
  persisted?: boolean;       // true if saved to backend
  sourceAdId?: string;       // original Meta ad id if applicable
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
          <button (click)="saveFromUrl()" class="px-4 py-2 border border-gray-200 rounded-pill text-sm font-body text-gray-600 hover:bg-gray-50 transition-colors">
            Save from URL
          </button>
          <button (click)="browseAdLibrary()" class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
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
                <div class="flex gap-2">
                  @if (!ad.persisted) {
                    <button (click)="saveAd(ad)" class="flex-1 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-body font-semibold hover:bg-green-100 transition-colors">
                      Save <lucide-icon name="bookmark" [size]="12" class="inline-block"></lucide-icon>
                    </button>
                  } @else {
                    <button (click)="removeAd(ad)" class="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-body font-semibold hover:bg-red-100 transition-colors">
                      <lucide-icon name="trash-2" [size]="12" class="inline-block"></lucide-icon>
                    </button>
                  }
                  <button (click)="createBriefFrom(ad)" class="flex-1 px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-body font-semibold hover:bg-accent/20 transition-colors">
                    Create Brief <lucide-icon name="arrow-right" [size]="12" class="inline-block"></lucide-icon>
                  </button>
                </div>
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
  private router = inject(Router);
  private toast = inject(ToastService);

  loading = signal(true);
  savedAds = signal<SwipeAd[]>([]);

  /** Set of persisted swipe-file IDs (backend ids) for dedup */
  private persistedIds = new Set<string>();
  /** Set of source_ad_id values already saved, to mark Meta ads */
  private savedAdIds = new Set<string>();

  private loadingTimeout: ReturnType<typeof setTimeout> | null = null;

  private accountEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    if (acc) {
      this.loadPersistedThenTopAds(acc.id, acc.credential_group);
    } else {
      this.loadPersistedOnly();
    }
  }, { allowSignalWrites: true });

  ngOnInit() {}

  private startLoadingTimeout() {
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
    this.loadingTimeout = setTimeout(() => {
      if (this.loading()) this.loading.set(false);
    }, 8000);
  }

  /** Load persisted items from backend, then overlay live Meta top ads */
  private loadPersistedThenTopAds(accountId: string, credentialGroup: string) {
    this.loading.set(true);
    this.startLoadingTimeout();

    // First load persisted items
    this.api.get<any>(environment.SWIPE_FILE_LIST).subscribe({
      next: (res) => {
        const persisted: SwipeAd[] = [];
        if (res.success && res.items?.length) {
          for (const item of res.items) {
            this.persistedIds.add(item.id);
            if (item.sourceAdId) this.savedAdIds.add(item.sourceAdId);

            const hashCode = (item.id).split('').reduce((a: number, c: string) => ((a << 5) - a) + c.charCodeAt(0), 0);
            persisted.push({
              id: item.id,
              brand: item.brand,
              thumbnail: item.thumbnail,
              hookDna: item.hookDna || [],
              visualDna: item.visualDna || [],
              audioDna: item.audioDna || [],
              savedAt: this.formatDate(item.savedAt),
              notes: item.notes,
              height: 180 + (Math.abs(hashCode) % 121),
              persisted: true,
              sourceAdId: item.sourceAdId || undefined,
            });
          }
        }

        // Then load live Meta ads
        this.api.get<any>(environment.AD_ACCOUNT_TOP_ADS, {
          account_id: accountId,
          credential_group: credentialGroup,
          limit: 50,
          date_preset: 'last_30d',
        }).subscribe({
          next: (metaRes) => {
            const liveAds: SwipeAd[] = [];
            if (metaRes.success && metaRes.ads?.length) {
              for (let i = 0; i < metaRes.ads.length; i++) {
                const ad = metaRes.ads[i];
                const adId = ad.id || `swipe-${i}`;

                // Skip if already persisted
                if (this.savedAdIds.has(adId)) continue;

                const roas = ad.metrics?.roas ?? 0;
                const spend = ad.metrics?.spend ?? 0;
                const objectType = ad.object_type || '';
                const hookDna: string[] = [];
                const visualDna: string[] = objectType === 'VIDEO' ? ['Video'] : objectType === 'CAROUSEL' ? ['Carousel'] : ['Static'];
                const audioDna: string[] = objectType === 'VIDEO' ? ['Has Audio'] : [];
                const notes = this.buildNotes(ad, roas, spend);
                const thumbnailUrl = ad.thumbnail_url || ad.image_url || ad.effective_image_url || '';
                const hashCode = adId.split('').reduce((a: number, c: string) => ((a << 5) - a) + c.charCodeAt(0), 0);

                liveAds.push({
                  id: adId,
                  brand: ad.name || 'Unnamed Ad',
                  thumbnail: thumbnailUrl,
                  hookDna,
                  visualDna,
                  audioDna,
                  savedAt: this.formatDate(ad.created_time),
                  notes,
                  height: 180 + (Math.abs(hashCode) % 121),
                  persisted: false,
                  sourceAdId: adId,
                });
              }
            }

            // Persisted items first, then live unsaved ads
            this.savedAds.set([...persisted, ...liveAds]);
            this.loading.set(false);
          },
          error: () => {
            // Still show persisted items even if Meta fetch fails
            this.savedAds.set(persisted);
            this.loading.set(false);
          },
        });
      },
      error: () => {
        // Fall back to just loading Meta ads if backend fails
        this.loadTopAdsOnly(accountId, credentialGroup);
      },
    });
  }

  /** Load only persisted items (no ad account connected) */
  private loadPersistedOnly() {
    this.loading.set(true);
    this.api.get<any>(environment.SWIPE_FILE_LIST).subscribe({
      next: (res) => {
        if (res.success && res.items?.length) {
          const mapped: SwipeAd[] = res.items.map((item: any) => {
            const hashCode = (item.id).split('').reduce((a: number, c: string) => ((a << 5) - a) + c.charCodeAt(0), 0);
            return {
              id: item.id,
              brand: item.brand,
              thumbnail: item.thumbnail,
              hookDna: item.hookDna || [],
              visualDna: item.visualDna || [],
              audioDna: item.audioDna || [],
              savedAt: this.formatDate(item.savedAt),
              notes: item.notes,
              height: 180 + (Math.abs(hashCode) % 121),
              persisted: true,
              sourceAdId: item.sourceAdId || undefined,
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

  /** Fallback: load only Meta top ads without persistence layer */
  private loadTopAdsOnly(accountId: string, credentialGroup: string) {
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
            const spend = ad.metrics?.spend ?? 0;
            const objectType = ad.object_type || '';
            const hookDna: string[] = [];
            const visualDna: string[] = objectType === 'VIDEO' ? ['Video'] : objectType === 'CAROUSEL' ? ['Carousel'] : ['Static'];
            const audioDna: string[] = objectType === 'VIDEO' ? ['Has Audio'] : [];
            const notes = this.buildNotes(ad, roas, spend);
            const thumbnailUrl = ad.thumbnail_url || ad.image_url || ad.effective_image_url || '';
            const hashCode = (ad.id || `swipe-${i}`).split('').reduce((a: number, c: string) => ((a << 5) - a) + c.charCodeAt(0), 0);

            return {
              id: ad.id || `swipe-${i}`,
              brand: ad.name || 'Unnamed Ad',
              thumbnail: thumbnailUrl,
              hookDna,
              visualDna,
              audioDna,
              savedAt: this.formatDate(ad.created_time),
              notes,
              height: 180 + (Math.abs(hashCode) % 121),
              persisted: false,
              sourceAdId: ad.id || undefined,
            } satisfies SwipeAd;
          });
          this.savedAds.set(mapped);
        } else {
          this.savedAds.set([]);
        }
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Error', 'Failed to load your swipe file. Please try again.');
        this.savedAds.set([]);
        this.loading.set(false);
      },
    });
  }

  /** Save an ad from the live feed to the backend */
  saveAd(ad: SwipeAd) {
    this.api.post<any>(environment.SWIPE_FILE_SAVE, {
      brand: ad.brand,
      thumbnail: ad.thumbnail,
      hookDna: ad.hookDna,
      visualDna: ad.visualDna,
      audioDna: ad.audioDna,
      notes: ad.notes,
      sourceAdId: ad.sourceAdId || ad.id,
    }).subscribe({
      next: (res) => {
        if (res.success) {
          // Update the ad in place to mark as persisted
          this.savedAds.update(ads => ads.map(a =>
            a.id === ad.id ? { ...a, id: res.id, persisted: true } : a
          ));
          this.persistedIds.add(res.id);
          if (ad.sourceAdId) this.savedAdIds.add(ad.sourceAdId);
          this.toast.success('Saved', 'Ad saved to your swipe file');
        }
      },
      error: () => {
        this.toast.error('Error', 'Failed to save ad. Please try again.');
      },
    });
  }

  /** Remove a persisted ad from the backend */
  removeAd(ad: SwipeAd) {
    this.api.delete<any>(`${environment.SWIPE_FILE_DELETE}/${ad.id}`).subscribe({
      next: (res) => {
        if (res.success) {
          this.savedAds.update(ads => ads.filter(a => a.id !== ad.id));
          this.persistedIds.delete(ad.id);
          if (ad.sourceAdId) this.savedAdIds.delete(ad.sourceAdId);
          this.toast.success('Removed', 'Ad removed from your swipe file');
        }
      },
      error: () => {
        this.toast.error('Error', 'Failed to remove ad. Please try again.');
      },
    });
  }

  saveFromUrl() {
    const url = prompt('Enter the ad URL to save:');
    if (!url) return;
    this.toast.info('Saving', 'Saving ad from URL...');

    const thumbnail = url.match(/\.(jpg|jpeg|png|gif|webp)/i) ? url : '';

    this.api.post<any>(environment.SWIPE_FILE_SAVE, {
      brand: 'Saved from URL',
      thumbnail,
      hookDna: [],
      visualDna: ['Saved'],
      audioDna: [],
      notes: `Source: ${url}`,
      sourceUrl: url,
    }).subscribe({
      next: (res) => {
        if (res.success) {
          const newAd: SwipeAd = {
            id: res.id,
            brand: 'Saved from URL',
            thumbnail,
            hookDna: [],
            visualDna: ['Saved'],
            audioDna: [],
            savedAt: new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
            notes: `Source: ${url}`,
            height: 220,
            persisted: true,
          };
          this.savedAds.update(ads => [newAd, ...ads]);
          this.persistedIds.add(res.id);
          this.toast.success('Saved', 'Ad added to your swipe file');
        }
      },
      error: () => {
        this.toast.error('Error', 'Failed to save ad. Please try again.');
      },
    });
  }

  browseAdLibrary() {
    this.router.navigate(['/app/competitor-spy']);
  }

  createBriefFrom(ad: SwipeAd) {
    this.router.navigate(['/app/director-lab'], {
      queryParams: {
        creativeId: ad.id,
        hookDna: ad.hookDna[0] || '',
        visualDna: ad.visualDna[0] || '',
      },
    });
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
