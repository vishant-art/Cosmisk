const _BUILD_VER = '2026-02-13-v2';
import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
  imports: [CommonModule, FormsModule, RouterLink, CreativeCardComponent, DnaBadgeComponent, StatusBadgeComponent, ModalComponent, LakhCrorePipe],
  template: `
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h1 class="text-page-title font-display text-navy m-0">Creative Cockpit</h1>
        <span class="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-mono rounded-pill">
          Showing {{ filteredCreatives().length }} of 47 creatives
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
    <div class="bg-white rounded-card p-4 shadow-card mb-4 flex flex-wrap gap-3 sticky top-16 z-10">
      <select [(ngModel)]="filterHook" class="input !w-auto !min-w-[150px]">
        <option value="">Hook DNA: All</option>
        @for (hook of hookOptions; track hook) {
          <option [value]="hook">{{ hook }}</option>
        }
      </select>
      <select [(ngModel)]="filterVisual" class="input !w-auto !min-w-[150px]">
        <option value="">Visual DNA: All</option>
        @for (vis of visualOptions; track vis) {
          <option [value]="vis">{{ vis }}</option>
        }
      </select>
      <select [(ngModel)]="filterStatus" class="input !w-auto !min-w-[130px]">
        <option value="">Status: All</option>
        <option value="winning">Winning</option>
        <option value="stable">Stable</option>
        <option value="fatiguing">Fatiguing</option>
        <option value="new">New</option>
      </select>
      <select [(ngModel)]="filterFormat" class="input !w-auto !min-w-[130px]">
        <option value="">Format: All</option>
        <option value="video">Video</option>
        <option value="static">Static</option>
        <option value="carousel">Carousel</option>
      </select>
      <select [(ngModel)]="sortBy" class="input !w-auto !min-w-[160px]">
        @for (sort of sortOptions; track sort.value) {
          <option [value]="sort.value">{{ sort.label }}</option>
        }
      </select>
    </div>

    <!-- Active Filters Pills -->
    @if (hasActiveFilters()) {
      <div class="flex flex-wrap items-center gap-2 mb-4">
        @if (filterHook) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-dna-hook-bg text-dna-hook-text text-xs rounded-pill font-medium">
            Hook: {{ filterHook }}
            <button (click)="filterHook = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-dna-hook-text p-0">&#10005;</button>
          </span>
        }
        @if (filterVisual) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-dna-visual-bg text-dna-visual-text text-xs rounded-pill font-medium">
            Visual: {{ filterVisual }}
            <button (click)="filterVisual = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-dna-visual-text p-0">&#10005;</button>
          </span>
        }
        @if (filterStatus) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-pill font-medium">
            Status: {{ filterStatus }}
            <button (click)="filterStatus = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-gray-600 p-0">&#10005;</button>
          </span>
        }
        @if (filterFormat) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-pill font-medium">
            Format: {{ filterFormat }}
            <button (click)="filterFormat = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-gray-600 p-0">&#10005;</button>
          </span>
        }
        <button (click)="clearFilters()" class="text-xs text-accent hover:underline font-body border-0 bg-transparent cursor-pointer ml-auto">
          Clear all filters
        </button>
      </div>
    }

    <!-- Grid View -->
    @if (currentView() === 'grid') {
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
        @for (creative of filteredCreatives(); track creative.id) {
          <div (click)="openDetail(creative)">
            <app-creative-card [creative]="creative" />
          </div>
        }
      </div>
    }

    <!-- List View (placeholder) -->
    @if (currentView() === 'list') {
      <div class="space-y-3">
        @for (creative of filteredCreatives(); track creative.id) {
          <div
            (click)="openDetail(creative)"
            class="card !p-4 flex items-center gap-4 cursor-pointer hover:-translate-y-0.5 transition-all">
            <img [src]="creative.thumbnailUrl" [alt]="creative.name" class="w-16 h-16 rounded-lg object-cover bg-gray-100">
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-body font-semibold text-navy m-0 truncate">{{ creative.name }}</h3>
              <div class="flex gap-1 mt-1">
                @for (hook of creative.dna.hook; track hook) { <app-dna-badge [label]="hook" type="hook" /> }
                @for (vis of creative.dna.visual.slice(0, 1); track vis) { <app-dna-badge [label]="vis" type="visual" /> }
              </div>
            </div>
            <div class="flex items-center gap-6 text-sm font-mono shrink-0">
              <span [ngClass]="creative.metrics.roas >= 3 ? 'text-green-600' : creative.metrics.roas >= 2 ? 'text-yellow-600' : 'text-red-600'" class="font-bold">{{ creative.metrics.roas }}x</span>
              <span class="text-gray-500">{{ creative.metrics.spend | lakhCrore }}</span>
              <span class="text-gray-500">{{ creative.metrics.ctr }}%</span>
              <app-status-badge [status]="creative.status" />
            </div>
          </div>
        }
      </div>
    }

    <!-- Table View (placeholder) -->
    @if (currentView() === 'table') {
      <div class="card overflow-x-auto">
        <table class="w-full text-sm font-body">
          <thead>
            <tr class="border-b border-divider">
              <th class="text-left py-3 px-3 text-xs text-gray-500 font-medium">#</th>
              <th class="text-left py-3 px-3 text-xs text-gray-500 font-medium">Creative</th>
              <th class="text-left py-3 px-3 text-xs text-gray-500 font-medium">Hook DNA</th>
              <th class="text-left py-3 px-3 text-xs text-gray-500 font-medium">Visual DNA</th>
              <th class="text-right py-3 px-3 text-xs text-gray-500 font-medium">ROAS</th>
              <th class="text-right py-3 px-3 text-xs text-gray-500 font-medium">Spend</th>
              <th class="text-right py-3 px-3 text-xs text-gray-500 font-medium">CTR</th>
              <th class="text-left py-3 px-3 text-xs text-gray-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            @for (creative of filteredCreatives(); track creative.id; let i = $index) {
              <tr class="border-b border-divider hover:bg-cream transition-colors cursor-pointer" (click)="openDetail(creative)">
                <td class="py-3 px-3 text-gray-400 font-mono text-xs">{{ i + 1 }}</td>
                <td class="py-3 px-3">
                  <div class="flex items-center gap-3">
                    <img [src]="creative.thumbnailUrl" [alt]="creative.name" class="w-10 h-10 rounded-lg object-cover bg-gray-100">
                    <span class="font-medium text-navy truncate max-w-[180px]">{{ creative.name }}</span>
                  </div>
                </td>
                <td class="py-3 px-3">@for (h of creative.dna.hook; track h) { <app-dna-badge [label]="h" type="hook" /> }</td>
                <td class="py-3 px-3">@for (v of creative.dna.visual.slice(0,1); track v) { <app-dna-badge [label]="v" type="visual" /> }</td>
                <td class="py-3 px-3 text-right font-mono font-bold" [ngClass]="creative.metrics.roas >= 3 ? 'text-green-600' : creative.metrics.roas >= 2 ? 'text-yellow-600' : 'text-red-600'">{{ creative.metrics.roas }}x</td>
                <td class="py-3 px-3 text-right font-mono text-gray-600">{{ creative.metrics.spend | lakhCrore }}</td>
                <td class="py-3 px-3 text-right font-mono text-gray-600">{{ creative.metrics.ctr }}%</td>
                <td class="py-3 px-3"><app-status-badge [status]="creative.status" /></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (filteredCreatives().length === 0) {
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <span class="text-5xl mb-4">&#128269;</span>
        <h3 class="text-section-title font-display text-navy mb-2">No creatives match your filters</h3>
        <p class="text-sm text-gray-500 font-body mb-4">Try adjusting your filters to see results.</p>
        <button (click)="clearFilters()" class="btn-outline">Clear all filters</button>
      </div>
    }

    <!-- ==================== DETAIL MODAL ==================== -->
    <app-modal [isOpen]="!!selectedCreative()" [title]="selectedCreative()?.name || ''" (close)="selectedCreative.set(null)" maxWidth="900px">
      @if (selectedCreative(); as creative) {
        <div>
          <!-- Section 1: Media -->
          <div class="relative bg-gray-900 overflow-hidden" style="height: 400px;">
            <img [src]="creative.thumbnailUrl" [alt]="creative.name" class="w-full h-full object-cover opacity-90">
            <span class="absolute top-4 left-4 px-3 py-1 bg-black/60 text-white text-xs font-mono rounded uppercase">
              {{ creative.format }}{{ creative.duration ? ' · ' + creative.duration + 's' : '' }}
            </span>
            @if (creative.format === 'video') {
              <div class="absolute inset-0 flex items-center justify-center">
                <div class="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform">
                  <span class="text-2xl ml-1">&#9654;</span>
                </div>
              </div>
            }
          </div>

          <!-- Section 2: Name + Status + Actions -->
          <div class="px-6 py-4 flex items-center justify-between border-b border-divider">
            <div class="flex items-center gap-3">
              <app-status-badge [status]="creative.status" />
              <span class="text-xs text-gray-400 font-body">{{ creative.daysActive }} days active</span>
            </div>
            <div class="flex items-center gap-2">
              <button routerLink="/app/director-lab" class="btn-primary !py-2 !px-4 !text-xs">Create Brief from This</button>
              <div class="relative">
                <button
                  (click)="moreMenuOpen.set(!moreMenuOpen())"
                  class="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-gray-50 transition-colors bg-white cursor-pointer text-gray-500">
                  &#8943;
                </button>
                @if (moreMenuOpen()) {
                  <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-dropdown border border-divider py-1 min-w-[160px] z-50">
                    <button class="w-full text-left px-4 py-2 text-sm font-body hover:bg-cream transition-colors border-0 bg-transparent cursor-pointer">Duplicate DNA</button>
                    <button class="w-full text-left px-4 py-2 text-sm font-body hover:bg-cream transition-colors border-0 bg-transparent cursor-pointer">Archive</button>
                    <button class="w-full text-left px-4 py-2 text-sm font-body hover:bg-cream transition-colors border-0 bg-transparent cursor-pointer">Export</button>
                    <button class="w-full text-left px-4 py-2 text-sm font-body hover:bg-cream transition-colors border-0 bg-transparent cursor-pointer">Copy Link</button>
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- Section 3: DNA Analysis -->
          <div class="p-6 space-y-4">
            <div class="p-4 bg-amber-50 rounded-card border border-amber-200">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-body font-semibold text-dna-hook-text">HOOK DNA</span>
                @for (hook of creative.dna.hook; track hook) {
                  <app-dna-badge [label]="hook" type="hook" />
                }
              </div>
              <p class="text-xs text-gray-600 font-body m-0 leading-relaxed italic bg-white/60 rounded-lg p-3">
                "{{ getHookExplanation(creative.dna.hook[0]) }}"
              </p>
            </div>

            <div class="p-4 bg-blue-50 rounded-card border border-blue-200">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-body font-semibold text-dna-visual-text">VISUAL DNA</span>
                @for (visual of creative.dna.visual; track visual) {
                  <app-dna-badge [label]="visual" type="visual" />
                }
              </div>
              <p class="text-xs text-gray-600 font-body m-0 leading-relaxed italic bg-white/60 rounded-lg p-3">
                "{{ getVisualExplanation(creative.dna.visual) }}"
              </p>
            </div>

            @if (creative.dna.audio.length > 0) {
              <div class="p-4 bg-green-50 rounded-card border border-green-200">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm font-body font-semibold text-dna-audio-text">AUDIO DNA</span>
                  @for (audio of creative.dna.audio; track audio) {
                    <app-dna-badge [label]="audio" type="audio" />
                  }
                </div>
                <p class="text-xs text-gray-600 font-body m-0 leading-relaxed italic bg-white/60 rounded-lg p-3">
                  "{{ getAudioExplanation(creative.dna.audio) }}"
                </p>
              </div>
            }
          </div>

          <!-- Section 4: Metrics -->
          <div class="px-6 pb-6 grid grid-cols-4 gap-4">
            <div class="text-center p-4 bg-cream rounded-lg">
              <p class="text-xs text-gray-500 font-body m-0 mb-1">ROAS</p>
              <p class="text-2xl font-mono font-bold m-0" [ngClass]="creative.metrics.roas >= 3 ? 'text-green-600' : creative.metrics.roas >= 2 ? 'text-yellow-600' : 'text-red-600'">
                {{ creative.metrics.roas }}x
              </p>
            </div>
            <div class="text-center p-4 bg-cream rounded-lg">
              <p class="text-xs text-gray-500 font-body m-0 mb-1">CPA</p>
              <p class="text-2xl font-mono font-bold text-navy m-0">&#8377;{{ creative.metrics.cpa }}</p>
            </div>
            <div class="text-center p-4 bg-cream rounded-lg">
              <p class="text-xs text-gray-500 font-body m-0 mb-1">CTR</p>
              <p class="text-2xl font-mono font-bold text-navy m-0">{{ creative.metrics.ctr }}%</p>
            </div>
            <div class="text-center p-4 bg-cream rounded-lg">
              <p class="text-xs text-gray-500 font-body m-0 mb-1">Spend</p>
              <p class="text-2xl font-mono font-bold text-navy m-0">{{ creative.metrics.spend | lakhCrore }}</p>
            </div>
          </div>

          <!-- Section 5: Performance Chart (30 days) -->
          <div class="px-6 pb-6">
            <h4 class="text-sm font-body font-semibold text-navy mb-3">Performance Over Time</h4>
            <div class="bg-cream rounded-card p-4">
              <div class="relative h-36 flex items-end gap-[3px]">
                @for (val of perfChartData; track val.roas; let i = $index) {
                  <div class="flex-1 relative group">
                    <div
                      class="w-full rounded-t-sm transition-all"
                      [ngClass]="val.color"
                      [style.height.%]="val.height">
                    </div>
                    <!-- Annotation markers -->
                    @if (i === 0) {
                      <div class="absolute -top-5 left-0 text-[8px] text-gray-400 font-mono whitespace-nowrap">Launch</div>
                    }
                    @if (i === 12) {
                      <div class="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-green-600 font-mono whitespace-nowrap">&#8593; Scaled</div>
                    }
                    @if (i === 22) {
                      <div class="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-red-500 font-mono whitespace-nowrap">&#8595; Fatigue</div>
                    }
                    <!-- Tooltip -->
                    <div class="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-navy text-white text-[9px] font-mono rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      Day {{ i + 1 }}: {{ val.roas }}x
                    </div>
                  </div>
                }
              </div>
              <div class="flex justify-between mt-2 text-[10px] text-gray-400 font-mono">
                <span>Day 1</span>
                <span>Day 10</span>
                <span>Day 20</span>
                <span>Day 30</span>
              </div>
            </div>
          </div>

          <!-- Section 6: Frame-by-Frame DNA Map (video only) -->
          @if (creative.format === 'video' && creative.duration) {
            <div class="px-6 pb-6">
              <h4 class="text-sm font-body font-semibold text-navy mb-3">Frame-by-Frame DNA Map</h4>
              <!-- Timeline segments -->
              <div class="flex rounded-lg overflow-hidden h-10">
                <div class="bg-red-400 flex items-center justify-center text-white text-[10px] font-mono leading-tight px-1" style="width: 20%">
                  <div class="text-center">
                    <div class="font-bold">HOOK</div>
                    <div class="opacity-80">{{ creative.dna.hook[0] || 'Hook' }}</div>
                  </div>
                </div>
                <div class="bg-blue-400 flex items-center justify-center text-white text-[10px] font-mono leading-tight px-1" style="width: 33%">
                  <div class="text-center">
                    <div class="font-bold">VISUAL</div>
                    <div class="opacity-80">Product Demo</div>
                  </div>
                </div>
                <div class="bg-green-400 flex items-center justify-center text-white text-[10px] font-mono leading-tight px-1" style="width: 27%">
                  <div class="text-center">
                    <div class="font-bold">PROOF</div>
                    <div class="opacity-80">Before/After</div>
                  </div>
                </div>
                <div class="bg-purple-400 flex items-center justify-center text-white text-[10px] font-mono leading-tight px-1" style="width: 20%">
                  <div class="text-center">
                    <div class="font-bold">CTA</div>
                    <div class="opacity-80">Price Anchor</div>
                  </div>
                </div>
              </div>
              <div class="flex justify-between mt-1 text-[10px] text-gray-400 font-mono">
                <span>0s</span>
                <span>{{ math.round(creative.duration * 0.2) }}s</span>
                <span>{{ math.round(creative.duration * 0.53) }}s</span>
                <span>{{ math.round(creative.duration * 0.8) }}s</span>
                <span>{{ creative.duration }}s</span>
              </div>

              <!-- Attention Heatmap -->
              <h4 class="text-sm font-body font-semibold text-navy mt-5 mb-2">Attention Heatmap</h4>
              <div class="flex gap-[1px] h-7 rounded overflow-hidden">
                @for (val of getHeatmapData(creative.duration); track $index) {
                  <div
                    class="flex-1 transition-all"
                    [style.opacity]="val / 100"
                    [ngClass]="val > 70 ? 'bg-green-500' : val > 40 ? 'bg-yellow-500' : 'bg-red-500'">
                  </div>
                }
              </div>
              <div class="flex justify-between mt-1 mb-2">
                <span class="text-[10px] text-green-600 font-mono">&#9608; High attention</span>
                <span class="text-[10px] text-red-600 font-mono">&#9608; Low attention</span>
              </div>
              <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p class="text-xs text-yellow-800 font-body m-0">
                  &#128161; <strong>Insight:</strong> Attention drops at 8s — consider shortening the proof section or adding a pattern interrupt.
                </p>
              </div>
            </div>
          }

          <!-- Section 7: AI Recommendations -->
          <div class="px-6 pb-6">
            <h4 class="text-sm font-body font-semibold text-navy mb-3 flex items-center gap-2">
              <span>&#10024;</span> AI Recommendations
            </h4>
            <div class="bg-cream rounded-card p-5 space-y-3">
              @if (creative.metrics.roas >= 3) {
                <div class="p-3 bg-white rounded-lg border border-green-200">
                  <p class="text-xs font-body m-0">
                    <strong class="text-green-700">&#128200; Scale:</strong>
                    <span class="text-gray-600"> Increase budget by 30%. This creative has headroom — CPA hasn't risen despite {{ creative.daysActive }}-day run. Estimated incremental revenue: &#8377;2.4L/week.</span>
                  </p>
                </div>
              }
              <div class="p-3 bg-white rounded-lg border border-blue-200">
                <div class="flex items-start justify-between gap-3">
                  <p class="text-xs font-body m-0">
                    <strong class="text-blue-700">&#128260; Iterate:</strong>
                    <span class="text-gray-600"> Create variation with Price Anchor hook — it generates 2.1x higher ROAS in your category. Keep the same visual DNA.</span>
                  </p>
                  <button routerLink="/app/director-lab" class="btn-primary !py-1.5 !px-3 !text-[11px] whitespace-nowrap shrink-0">
                    Create Brief &#8594;
                  </button>
                </div>
              </div>
              <div class="p-3 bg-white rounded-lg border border-yellow-200">
                <p class="text-xs font-body m-0">
                  <strong class="text-yellow-700">&#128064; Watch:</strong>
                  <span class="text-gray-600"> Attention drops at 8s mark. Consider shortening the proof section or testing ASMR audio to maintain engagement through the CTA.</span>
                </p>
              </div>
            </div>
          </div>

          <!-- Section 8: Similar Creatives -->
          <div class="px-6 pb-6">
            <h4 class="text-sm font-body font-semibold text-navy mb-3">Creatives with Similar DNA</h4>
            <div class="flex gap-4 overflow-x-auto pb-2">
              @for (similar of getSimilarCreatives(creative); track similar.creative.id) {
                <div
                  class="shrink-0 w-44 bg-white rounded-card border border-divider overflow-hidden hover:shadow-card transition-shadow cursor-pointer"
                  (click)="openDetail(similar.creative)">
                  <img [src]="similar.creative.thumbnailUrl" [alt]="similar.creative.name" class="w-full h-28 object-cover bg-gray-100">
                  <div class="p-3">
                    <p class="text-xs font-body font-medium text-navy m-0 truncate">{{ similar.creative.name }}</p>
                    <div class="flex items-center justify-between mt-1.5">
                      <span class="text-xs font-mono font-bold" [ngClass]="similar.creative.metrics.roas >= 3 ? 'text-green-600' : 'text-yellow-600'">
                        {{ similar.creative.metrics.roas }}x
                      </span>
                      <span class="text-[10px] font-mono px-1.5 py-0.5 rounded-pill bg-accent/10 text-accent font-semibold">
                        {{ similar.match }}% match
                      </span>
                    </div>
                  </div>
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
  math = Math;

  allCreatives = DEMO_CREATIVES;
  selectedCreative = signal<Creative | null>(null);
  currentView = signal<'grid' | 'list' | 'table'>('grid');
  moreMenuOpen = signal(false);

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

  // 30-day performance chart demo data
  perfChartData = this.generatePerfChart();

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
    this.moreMenuOpen.set(false);
    this.selectedCreative.set(creative);
    this.perfChartData = this.generatePerfChart();
  }

  getHookExplanation(hook: string): string {
    const explanations: Record<string, string> = {
      'Shock Statement': "Opens with 'Your skin is aging 2x faster' — direct confrontation creates urgency. Average scroll-stop time: 1.2s vs 2.8s benchmark.",
      'Price Anchor': 'Leads with ₹999 price point to establish value immediately. Price Anchor hooks generate 2.1x higher ROAS in your category.',
      'Curiosity': "Creates an open loop that compels viewers to keep watching. Curiosity hooks show 18% higher completion rates in this format.",
      'Authority': 'Leverages expert credibility to establish trust within the first 2 seconds. Authority hooks perform 1.6x better for health products.',
      'Personal Story': "First-person narrative creates emotional connection. 'I tried...' format shows 23% higher save rates.",
      'Social Proof': 'Customer testimonial leads with real results. Social Proof hooks generate 1.9x higher trust scores.',
      'Urgency': 'Time-limited offer creates FOMO. Urgency hooks drive 2.3x higher click-through but fatigue 40% faster.',
      'Transformation': 'Before/after visual transformation in first 3 seconds. Stops scroll with dramatic contrast.',
      'Education': 'Informative hook teaches something new. Education hooks drive 1.4x higher engagement but lower immediate conversion.',
      'Direct Interrogation': "Opens with a direct question to the viewer. 'Did you know...' format drives 1.7x higher watch-through.",
    };
    return explanations[hook] || 'This hook type performs well for your target demographic and category.';
  }

  getVisualExplanation(visuals: string[]): string {
    if (visuals.includes('Macro Texture')) return 'Extreme close-up of serum texture with golden-hour warm tones. Macro Texture visuals drive 1.4x higher CTR in beauty/wellness.';
    if (visuals.includes('UGC Style')) return 'Authentic user-generated content aesthetic creates relatability. UGC-style creatives show 1.8x higher trust scores.';
    if (visuals.includes('Text-Heavy')) return 'Bold typography-driven layout with product as hero. Text-Heavy visuals convert 2.1x better for price-led messaging.';
    if (visuals.includes('Before/After')) return 'Side-by-side or sequential transformation visual. Before/After shows 1.6x higher engagement for results-driven products.';
    if (visuals.includes('Product Focus')) return 'Clean product-centric composition with minimal distractions. Product Focus visuals drive strong brand recall.';
    if (visuals.includes('Lifestyle')) return 'Aspirational lifestyle context showing the product in use. Creates emotional connection with target demographic.';
    return 'Dominant visual style creates strong brand recognition. This visual combination shows 1.4x higher CTR in your niche.';
  }

  getAudioExplanation(audio: string[]): string {
    const hasHindi = audio.some(a => a.includes('Hindi'));
    const hasEnglish = audio.some(a => a.includes('English'));
    const hasASMR = audio.includes('ASMR');

    if (hasHindi && audio.includes('Upbeat')) return 'Female Hindi voiceover with upbeat background music. Hindi VO creatives outperform English VO by 1.8x in this market.';
    if (hasHindi && audio.includes('Emotional')) return 'Hindi voiceover with emotional, trust-building tone. Emotional audio increases watch-through by 22%.';
    if (hasASMR) return 'ASMR-style audio creates intimacy and increases attention span by 34%. Best paired with Macro Texture visuals.';
    if (hasEnglish) return 'English voiceover with professional delivery. Works well for premium positioning and metro audiences.';
    return 'Audio combination tested well with target demographic. This style maintains 78% attention through the full creative.';
  }

  getSimilarCreatives(current: Creative): { creative: Creative; match: number }[] {
    return this.allCreatives
      .filter(c => c.id !== current.id)
      .map(c => {
        const hookMatch = c.dna.hook.some(h => current.dna.hook.includes(h)) ? 30 : 0;
        const visualMatch = c.dna.visual.some(v => current.dna.visual.includes(v)) ? 25 : 0;
        const audioMatch = c.dna.audio.some(a => current.dna.audio.includes(a)) ? 15 : 0;
        const formatMatch = c.format === current.format ? 10 : 0;
        const base = 20 + Math.floor(Math.random() * 10);
        return { creative: c, match: Math.min(hookMatch + visualMatch + audioMatch + formatMatch + base, 95) };
      })
      .sort((a, b) => b.match - a.match)
      .slice(0, 3);
  }

  getHeatmapData(duration: number): number[] {
    const points = duration || 15;
    const data: number[] = [];
    for (let i = 0; i < points; i++) {
      if (i < 3) data.push(85 + Math.floor(Math.random() * 15));
      else if (i < points * 0.5) data.push(60 + Math.floor(Math.random() * 30));
      else if (i < points * 0.8) data.push(25 + Math.floor(Math.random() * 35));
      else data.push(55 + Math.floor(Math.random() * 30));
    }
    return data;
  }

  private generatePerfChart(): { height: number; roas: number; color: string }[] {
    const data: { height: number; roas: number; color: string }[] = [];
    for (let i = 0; i < 30; i++) {
      let roas: number;
      if (i < 5) roas = 2.0 + Math.random() * 1.5;
      else if (i < 15) roas = 3.5 + Math.random() * 2.0;
      else if (i < 22) roas = 3.0 + Math.random() * 1.5;
      else roas = 2.0 + Math.random() * 1.0;
      roas = Math.round(roas * 10) / 10;
      const height = Math.max(15, Math.min(95, (roas / 6) * 100));
      const color = roas >= 3 ? 'bg-green-300' : roas >= 2 ? 'bg-yellow-300' : 'bg-red-300';
      data.push({ height, roas, color });
    }
    return data;
  }
}
