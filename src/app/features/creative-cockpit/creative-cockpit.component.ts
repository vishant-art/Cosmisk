import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Creative, CreativeStatus, CreativeFormat, HookDnaType, VisualDnaType } from '../../core/models/creative.model';
import { CreativeCardComponent } from '../../shared/components/creative-card/creative-card.component';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { LakhCrorePipe } from '../../shared/pipes/lakh-crore.pipe';
import { DEMO_CREATIVES } from '../../shared/data/demo-data';

@Component({
  selector: 'app-creative-cockpit',
  standalone: true,
  imports: [CommonModule, FormsModule, CreativeCardComponent, DnaBadgeComponent, StatusBadgeComponent, ModalComponent, LakhCrorePipe],
  template: `
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h1 class="text-page-title font-display text-navy m-0">Creative Cockpit</h1>
        <span class="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-mono rounded-pill">
          {{ filteredCreatives().length }} creatives
        </span>
      </div>
      <div class="flex items-center gap-2">
        @for (view of viewModes; track view.id) {
          <button
            (click)="currentView.set(view.id)"
            class="p-2 rounded-lg transition-colors border-0 cursor-pointer"
            [ngClass]="currentView() === view.id ? 'bg-accent text-white' : 'bg-white text-gray-500 hover:bg-gray-50'">
            {{ view.icon }}
          </button>
        }
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="bg-white rounded-card p-4 shadow-card mb-4 flex flex-wrap gap-3">
      <!-- Hook DNA Filter -->
      <select [(ngModel)]="filterHook" class="input !w-auto !min-w-[150px]">
        <option value="">Hook DNA: All</option>
        @for (hook of hookOptions; track hook) {
          <option [value]="hook">{{ hook }}</option>
        }
      </select>

      <!-- Visual DNA Filter -->
      <select [(ngModel)]="filterVisual" class="input !w-auto !min-w-[150px]">
        <option value="">Visual DNA: All</option>
        @for (vis of visualOptions; track vis) {
          <option [value]="vis">{{ vis }}</option>
        }
      </select>

      <!-- Status Filter -->
      <select [(ngModel)]="filterStatus" class="input !w-auto !min-w-[130px]">
        <option value="">Status: All</option>
        <option value="winning">Winning</option>
        <option value="stable">Stable</option>
        <option value="fatiguing">Fatiguing</option>
        <option value="new">New</option>
      </select>

      <!-- Format Filter -->
      <select [(ngModel)]="filterFormat" class="input !w-auto !min-w-[130px]">
        <option value="">Format: All</option>
        <option value="video">Video</option>
        <option value="static">Static</option>
        <option value="carousel">Carousel</option>
      </select>

      <!-- Sort -->
      <select [(ngModel)]="sortBy" class="input !w-auto !min-w-[160px]">
        @for (sort of sortOptions; track sort.value) {
          <option [value]="sort.value">{{ sort.label }}</option>
        }
      </select>
    </div>

    <!-- Active Filters Pills -->
    @if (hasActiveFilters()) {
      <div class="flex flex-wrap gap-2 mb-4">
        @if (filterHook) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-dna-hook-bg text-dna-hook-text text-xs rounded-pill font-medium">
            Hook: {{ filterHook }}
            <button (click)="filterHook = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-dna-hook-text">✕</button>
          </span>
        }
        @if (filterVisual) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-dna-visual-bg text-dna-visual-text text-xs rounded-pill font-medium">
            Visual: {{ filterVisual }}
            <button (click)="filterVisual = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-dna-visual-text">✕</button>
          </span>
        }
        @if (filterStatus) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-pill font-medium">
            Status: {{ filterStatus }}
            <button (click)="filterStatus = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-gray-600">✕</button>
          </span>
        }
        @if (filterFormat) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-pill font-medium">
            Format: {{ filterFormat }}
            <button (click)="filterFormat = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-gray-600">✕</button>
          </span>
        }
        <button (click)="clearFilters()" class="text-xs text-accent hover:underline font-body border-0 bg-transparent cursor-pointer">
          Clear all filters
        </button>
      </div>
    }

    <!-- Grid View -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      @for (creative of filteredCreatives(); track creative.id) {
        <div (click)="openDetail(creative)">
          <app-creative-card [creative]="creative" />
        </div>
      }
    </div>

    @if (filteredCreatives().length === 0) {
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <span class="text-5xl mb-4">🔍</span>
        <h3 class="text-section-title font-display text-navy mb-2">No creatives match your filters</h3>
        <p class="text-sm text-gray-500 font-body mb-4">Try adjusting your filters to see results.</p>
        <button (click)="clearFilters()" class="btn-outline">Clear all filters</button>
      </div>
    }

    <!-- Detail Modal -->
    <app-modal [isOpen]="!!selectedCreative()" [title]="selectedCreative()?.name || ''" (close)="selectedCreative.set(null)" maxWidth="900px">
      @if (selectedCreative(); as creative) {
        <div>
          <!-- Thumbnail -->
          <div class="aspect-video bg-gray-100 relative overflow-hidden">
            <img [src]="creative.thumbnailUrl" [alt]="creative.name" class="w-full h-full object-cover">
            <span class="absolute top-4 left-4 px-3 py-1 bg-black/60 text-white text-xs font-mono rounded uppercase">
              {{ creative.format }}{{ creative.duration ? ' ' + creative.duration + 's' : '' }}
            </span>
          </div>

          <!-- Status + Actions -->
          <div class="px-6 py-4 flex items-center justify-between border-b border-divider">
            <div class="flex items-center gap-3">
              <app-status-badge [status]="creative.status" />
              <span class="text-xs text-gray-400 font-body">{{ creative.daysActive }} days active</span>
            </div>
            <button class="btn-primary !py-2 !px-4 !text-xs">Create Brief from This</button>
          </div>

          <!-- DNA Analysis -->
          <div class="p-6 space-y-4">
            <!-- Hook DNA -->
            <div class="p-4 bg-dna-hook-bg/30 rounded-card border border-dna-hook-bg">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-body font-semibold text-dna-hook-text">HOOK DNA</span>
                @for (hook of creative.dna.hook; track hook) {
                  <app-dna-badge [label]="hook" type="hook" />
                }
              </div>
              <p class="text-xs text-gray-600 font-body m-0 leading-relaxed">
                @switch (creative.dna.hook[0]) {
                  @case ('Shock Statement') { Opens with a confrontational statement that creates urgency and stops scroll. Average scroll-stop time: 1.2s vs 2.8s benchmark. }
                  @case ('Price Anchor') { Leads with price point to establish value proposition immediately. Price Anchor hooks generate 2.1x higher ROAS in this category. }
                  @case ('Curiosity') { Creates an open loop that compels viewers to keep watching. Curiosity hooks show 18% higher completion rates. }
                  @default { This hook type performs well for your target demographic and category. }
                }
              </p>
            </div>

            <!-- Visual DNA -->
            <div class="p-4 bg-dna-visual-bg/30 rounded-card border border-dna-visual-bg">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-body font-semibold text-dna-visual-text">VISUAL DNA</span>
                @for (visual of creative.dna.visual; track visual) {
                  <app-dna-badge [label]="visual" type="visual" />
                }
              </div>
              <p class="text-xs text-gray-600 font-body m-0 leading-relaxed">
                Dominant visual style creates strong brand recognition. This visual combination shows 1.4x higher CTR in your niche.
              </p>
            </div>

            <!-- Audio DNA -->
            @if (creative.dna.audio.length > 0) {
              <div class="p-4 bg-dna-audio-bg/30 rounded-card border border-dna-audio-bg">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm font-body font-semibold text-dna-audio-text">AUDIO DNA</span>
                  @for (audio of creative.dna.audio; track audio) {
                    <app-dna-badge [label]="audio" type="audio" />
                  }
                </div>
                <p class="text-xs text-gray-600 font-body m-0 leading-relaxed">
                  Audio combination tested well with target demographic. Hindi VO creatives outperform English VO by 1.8x in this market.
                </p>
              </div>
            }
          </div>

          <!-- Metrics -->
          <div class="px-6 pb-4 grid grid-cols-4 gap-4">
            <div class="text-center p-3 bg-cream rounded-lg">
              <p class="text-xs text-gray-500 font-body m-0 mb-1">ROAS</p>
              <p class="text-xl font-mono font-bold m-0" [ngClass]="creative.metrics.roas >= 3 ? 'text-green-600' : creative.metrics.roas >= 2 ? 'text-yellow-600' : 'text-red-600'">
                {{ creative.metrics.roas }}x
              </p>
            </div>
            <div class="text-center p-3 bg-cream rounded-lg">
              <p class="text-xs text-gray-500 font-body m-0 mb-1">CPA</p>
              <p class="text-xl font-mono font-bold text-navy m-0">₹{{ creative.metrics.cpa }}</p>
            </div>
            <div class="text-center p-3 bg-cream rounded-lg">
              <p class="text-xs text-gray-500 font-body m-0 mb-1">CTR</p>
              <p class="text-xl font-mono font-bold text-navy m-0">{{ creative.metrics.ctr }}%</p>
            </div>
            <div class="text-center p-3 bg-cream rounded-lg">
              <p class="text-xs text-gray-500 font-body m-0 mb-1">Spend</p>
              <p class="text-xl font-mono font-bold text-navy m-0">{{ creative.metrics.spend | lakhCrore }}</p>
            </div>
          </div>

          <!-- Frame-by-Frame (video only) -->
          @if (creative.format === 'video' && creative.duration) {
            <div class="px-6 pb-4">
              <h4 class="text-sm font-body font-semibold text-navy mb-3">Frame-by-Frame DNA Map</h4>
              <div class="flex rounded-lg overflow-hidden h-8">
                <div class="bg-red-400 flex items-center justify-center text-white text-[10px] font-mono" style="width: 20%">Hook</div>
                <div class="bg-blue-400 flex items-center justify-center text-white text-[10px] font-mono" style="width: 35%">Visual Demo</div>
                <div class="bg-green-400 flex items-center justify-center text-white text-[10px] font-mono" style="width: 25%">Proof</div>
                <div class="bg-purple-400 flex items-center justify-center text-white text-[10px] font-mono" style="width: 20%">CTA</div>
              </div>
              <div class="flex justify-between mt-1 text-[10px] text-gray-400 font-mono">
                <span>0s</span>
                <span>{{ Math.round(creative.duration * 0.2) }}s</span>
                <span>{{ Math.round(creative.duration * 0.55) }}s</span>
                <span>{{ Math.round(creative.duration * 0.8) }}s</span>
                <span>{{ creative.duration }}s</span>
              </div>

              <!-- Attention Heatmap -->
              <h4 class="text-sm font-body font-semibold text-navy mt-4 mb-2">Attention Heatmap</h4>
              <div class="flex gap-[1px] h-6 rounded overflow-hidden">
                @for (val of getHeatmapData(creative.duration); track $index) {
                  <div
                    class="flex-1 transition-all"
                    [style.opacity]="val / 100"
                    [ngClass]="val > 70 ? 'bg-green-500' : val > 40 ? 'bg-yellow-500' : 'bg-red-500'">
                  </div>
                }
              </div>
              <div class="flex justify-between mt-1">
                <span class="text-[10px] text-green-600 font-mono">High</span>
                <span class="text-[10px] text-red-600 font-mono">Low</span>
              </div>
            </div>
          }

          <!-- AI Recommendations -->
          <div class="px-6 pb-6">
            <h4 class="text-sm font-body font-semibold text-navy mb-3 flex items-center gap-2">
              <span>✨</span> AI Recommendations
            </h4>
            <div class="space-y-3">
              @if (creative.metrics.roas >= 3) {
                <div class="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p class="text-xs font-body m-0"><strong class="text-green-700">📈 Scale:</strong>
                    <span class="text-gray-600"> Increase budget by 30%. This creative has headroom — CPA hasn't risen despite {{ creative.daysActive }}-day run.</span>
                  </p>
                </div>
              }
              <div class="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p class="text-xs font-body m-0"><strong class="text-blue-700">🔄 Iterate:</strong>
                  <span class="text-gray-600"> Create a variation keeping the same visual DNA but testing a different hook type for fresh engagement.</span>
                </p>
              </div>
              @if (creative.status === 'fatiguing') {
                <div class="p-3 bg-red-50 rounded-lg border border-red-100">
                  <p class="text-xs font-body m-0"><strong class="text-red-700">⚠️ Watch:</strong>
                    <span class="text-gray-600"> Performance declining. Consider pausing and shifting budget to winning creatives.</span>
                  </p>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </app-modal>
  `
})
export default class CreativeCockpitComponent {
  Math = Math;

  allCreatives = DEMO_CREATIVES;
  selectedCreative = signal<Creative | null>(null);
  currentView = signal<'grid' | 'list' | 'table'>('grid');

  filterHook = '';
  filterVisual = '';
  filterStatus = '';
  filterFormat = '';
  sortBy = 'roas-desc';

  viewModes = [
    { id: 'grid' as const, icon: '▦' },
    { id: 'list' as const, icon: '☰' },
    { id: 'table' as const, icon: '▤' },
  ];

  hookOptions: HookDnaType[] = ['Shock Statement', 'Price Anchor', 'Authority', 'Personal Story', 'Curiosity', 'Social Proof', 'Urgency', 'Education', 'Transformation', 'Direct Interrogation'];
  visualOptions: VisualDnaType[] = ['Macro Texture', 'Warm Palette', 'Cool Palette', 'UGC Style', 'Product Focus', 'Text-Heavy', 'Lifestyle', 'Before/After', 'Flat Lay', 'Minimal', 'Dark Mood', 'Split Screen'];

  sortOptions = [
    { value: 'roas-desc', label: 'ROAS (High→Low)' },
    { value: 'roas-asc', label: 'ROAS (Low→High)' },
    { value: 'spend-desc', label: 'Spend (High→Low)' },
    { value: 'ctr-desc', label: 'CTR (High→Low)' },
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'days-active', label: 'Days Active' },
  ];

  filteredCreatives = computed(() => {
    let result = [...this.allCreatives];

    if (this.filterHook) {
      result = result.filter(c => c.dna.hook.includes(this.filterHook as HookDnaType));
    }
    if (this.filterVisual) {
      result = result.filter(c => c.dna.visual.includes(this.filterVisual as VisualDnaType));
    }
    if (this.filterStatus) {
      result = result.filter(c => c.status === this.filterStatus);
    }
    if (this.filterFormat) {
      result = result.filter(c => c.format === this.filterFormat);
    }

    switch (this.sortBy) {
      case 'roas-desc': result.sort((a, b) => b.metrics.roas - a.metrics.roas); break;
      case 'roas-asc': result.sort((a, b) => a.metrics.roas - b.metrics.roas); break;
      case 'spend-desc': result.sort((a, b) => b.metrics.spend - a.metrics.spend); break;
      case 'ctr-desc': result.sort((a, b) => b.metrics.ctr - a.metrics.ctr); break;
      case 'newest': result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case 'oldest': result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break;
      case 'days-active': result.sort((a, b) => b.daysActive - a.daysActive); break;
    }

    return result;
  });

  hasActiveFilters(): boolean {
    return !!(this.filterHook || this.filterVisual || this.filterStatus || this.filterFormat);
  }

  clearFilters() {
    this.filterHook = '';
    this.filterVisual = '';
    this.filterStatus = '';
    this.filterFormat = '';
  }

  openDetail(creative: Creative) {
    this.selectedCreative.set(creative);
  }

  getHeatmapData(duration: number): number[] {
    const points = duration || 15;
    return Array.from({ length: points }, (_, i) => {
      if (i < 3) return 85 + Math.random() * 15;
      if (i < points * 0.5) return 60 + Math.random() * 30;
      if (i < points * 0.8) return 30 + Math.random() * 40;
      return 70 + Math.random() * 30;
    });
  }
}
