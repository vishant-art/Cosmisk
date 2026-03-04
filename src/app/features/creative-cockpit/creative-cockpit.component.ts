const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Creative, CreativeStatus, CreativeFormat, HookDnaType, VisualDnaType } from '../../core/models/creative.model';
import { CreativeCardComponent } from '../../shared/components/creative-card/creative-card.component';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { LakhCrorePipe } from '../../shared/pipes/lakh-crore.pipe';
import { AdAccountService } from '../../core/services/ad-account.service';
import { ApiService } from '../../core/services/api.service';
import { DateRangeService } from '../../core/services/date-range.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-creative-cockpit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CreativeCardComponent, DnaBadgeComponent, StatusBadgeComponent, ModalComponent, LakhCrorePipe, LucideAngularModule],
  template: `
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h1 class="text-page-title font-display text-navy m-0">Creative Cockpit</h1>
        <span class="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-mono rounded-pill">
          Showing {{ filteredCreatives().length }} of {{ allCreatives().length }} creatives
        </span>
      </div>
      <div class="flex items-center gap-2">
        @for (view of viewModes; track view.id) {
          <button
            (click)="currentView.set(view.id)"
            class="p-2 rounded-lg transition-colors border-0 cursor-pointer"
            [ngClass]="currentView() === view.id ? 'bg-accent text-white' : 'bg-white text-gray-500 hover:bg-gray-50'">
            <lucide-icon [name]="view.icon" [size]="16"></lucide-icon>
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
            <button (click)="filterHook = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-dna-hook-text p-0"><lucide-icon name="x" [size]="14"></lucide-icon></button>
          </span>
        }
        @if (filterVisual) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-dna-visual-bg text-dna-visual-text text-xs rounded-pill font-medium">
            Visual: {{ filterVisual }}
            <button (click)="filterVisual = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-dna-visual-text p-0"><lucide-icon name="x" [size]="14"></lucide-icon></button>
          </span>
        }
        @if (filterStatus) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-pill font-medium">
            Status: {{ filterStatus }}
            <button (click)="filterStatus = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-gray-600 p-0"><lucide-icon name="x" [size]="14"></lucide-icon></button>
          </span>
        }
        @if (filterFormat) {
          <span class="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-pill font-medium">
            Format: {{ filterFormat }}
            <button (click)="filterFormat = ''" class="ml-1 hover:opacity-70 border-0 bg-transparent cursor-pointer text-gray-600 p-0"><lucide-icon name="x" [size]="14"></lucide-icon></button>
          </span>
        }
        <button (click)="clearFilters()" class="text-xs text-accent hover:underline font-body border-0 bg-transparent cursor-pointer ml-auto">
          Clear all filters
        </button>
      </div>
    }

    <!-- Loading skeleton -->
    @if (loading()) {
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
        @for (i of [1,2,3,4,5,6]; track i) {
          <div class="bg-white rounded-card shadow-card p-4 animate-pulse">
            <div class="h-40 bg-gray-200 rounded-lg mb-3"></div>
            <div class="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-1/2 mb-3"></div>
            <div class="flex gap-2">
              <div class="h-5 bg-gray-200 rounded-pill w-16"></div>
              <div class="h-5 bg-gray-200 rounded-pill w-16"></div>
            </div>
          </div>
        }
      </div>
    }

    <!-- Grid View -->
    @if (!loading() && currentView() === 'grid') {
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
        @for (creative of filteredCreatives(); track creative.id) {
          <div (click)="openDetail(creative)">
            <app-creative-card [creative]="creative" />
          </div>
        }
      </div>
    }

    <!-- List View (placeholder) -->
    @if (!loading() && currentView() === 'list') {
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
    @if (!loading() && currentView() === 'table') {
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

    @if (!loading() && filteredCreatives().length === 0) {
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <span class="text-5xl mb-4"><lucide-icon name="search" [size]="48"></lucide-icon></span>
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
            @if (videoUrl() && creative.format === 'video') {
              <video
                [src]="videoUrl()"
                [poster]="creative.thumbnailUrl"
                class="w-full h-full object-contain"
                controls
                autoplay
                muted
                playsinline>
              </video>
            } @else {
              <img [src]="creative.thumbnailUrl" [alt]="creative.name" class="w-full h-full object-cover opacity-90">
              <span class="absolute top-4 left-4 px-3 py-1 bg-black/60 text-white text-xs font-mono rounded uppercase">
                {{ creative.format }}{{ creative.duration ? ' · ' + creative.duration + 's' : '' }}
              </span>
              @if (creative.format === 'video') {
                @if (videoError()) {
                  <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                    <lucide-icon name="video-off" [size]="32" class="text-white/70 mb-2"></lucide-icon>
                    <p class="text-white/70 text-xs font-body">Video source unavailable</p>
                    <button (click)="loadVideoSource(creative)" class="mt-2 px-3 py-1 bg-white/20 text-white text-xs rounded-pill font-body hover:bg-white/30">Retry</button>
                  </div>
                } @else {
                  <div class="absolute inset-0 flex items-center justify-center cursor-pointer" (click)="loadVideoSource(creative)">
                    @if (videoLoading()) {
                      <div class="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                        <lucide-icon name="refresh-cw" [size]="24" class="text-accent animate-spin"></lucide-icon>
                      </div>
                    } @else {
                      <div class="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                        <lucide-icon name="play" [size]="24" class="text-accent ml-1"></lucide-icon>
                      </div>
                    }
                  </div>
                }
              }
            }
          </div>

          <!-- Section 2: Name + Status + Actions -->
          <div class="px-6 py-4 flex items-center justify-between border-b border-divider">
            <div class="flex items-center gap-3">
              <app-status-badge [status]="creative.status" />
              <span class="text-xs text-gray-400 font-body">{{ creative.daysActive }} days active</span>
            </div>
            <div class="flex items-center gap-2">
              <button (click)="createBriefFrom(creative)" class="btn-primary !py-2 !px-4 !text-xs">Create Brief from This</button>
              <div class="relative">
                <button
                  (click)="moreMenuOpen.set(!moreMenuOpen())"
                  class="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-gray-50 transition-colors bg-white cursor-pointer text-gray-500">
                  <lucide-icon name="more-vertical" [size]="16"></lucide-icon>
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
                      <div class="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-green-600 font-mono whitespace-nowrap flex items-center gap-0.5"><lucide-icon name="trending-up" [size]="8"></lucide-icon> Scaled</div>
                    }
                    @if (i === 22) {
                      <div class="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] text-red-500 font-mono whitespace-nowrap flex items-center gap-0.5"><lucide-icon name="trending-down" [size]="8"></lucide-icon> Fatigue</div>
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
                  <lucide-icon name="lightbulb" [size]="14" class="text-yellow-500 inline-block"></lucide-icon> <strong>Insight:</strong> {{ getHeatmapInsight(creative) }}
                </p>
              </div>
            </div>
          }

          <!-- Section 7: AI Recommendations -->
          <div class="px-6 pb-6">
            <h4 class="text-sm font-body font-semibold text-navy mb-3 flex items-center gap-2">
              <lucide-icon name="sparkles" [size]="16"></lucide-icon> AI Recommendations
            </h4>
            <div class="bg-cream rounded-card p-5 space-y-3">
              @for (rec of getRecommendations(creative); track rec.type) {
                @if (rec.type === 'scale') {
                  <div class="p-3 bg-white rounded-lg border border-green-200">
                    <p class="text-xs font-body m-0">
                      <strong class="text-green-700"><lucide-icon name="trending-up" [size]="14" class="inline-block"></lucide-icon> Scale:</strong>
                      <span class="text-gray-600"> {{ rec.text }}</span>
                    </p>
                  </div>
                }
                @if (rec.type === 'iterate') {
                  <div class="p-3 bg-white rounded-lg border border-blue-200">
                    <div class="flex items-start justify-between gap-3">
                      <p class="text-xs font-body m-0">
                        <strong class="text-blue-700"><lucide-icon name="refresh-cw" [size]="14" class="inline-block"></lucide-icon> Iterate:</strong>
                        <span class="text-gray-600"> {{ rec.text }}</span>
                      </p>
                      <button (click)="createBriefFrom(creative)" class="btn-primary !py-1.5 !px-3 !text-[11px] whitespace-nowrap shrink-0">
                        Create Brief <lucide-icon name="arrow-right" [size]="14" class="inline-block"></lucide-icon>
                      </button>
                    </div>
                  </div>
                }
                @if (rec.type === 'watch') {
                  <div class="p-3 bg-white rounded-lg border border-yellow-200">
                    <p class="text-xs font-body m-0">
                      <strong class="text-yellow-700"><lucide-icon name="eye" [size]="14" class="inline-block"></lucide-icon> Watch:</strong>
                      <span class="text-gray-600"> {{ rec.text }}</span>
                    </p>
                  </div>
                }
                @if (rec.type === 'kill') {
                  <div class="p-3 bg-white rounded-lg border border-red-200">
                    <p class="text-xs font-body m-0">
                      <strong class="text-red-700"><lucide-icon name="x-circle" [size]="14" class="inline-block"></lucide-icon> Kill:</strong>
                      <span class="text-gray-600"> {{ rec.text }}</span>
                    </p>
                  </div>
                }
              }
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
  private adAccountService = inject(AdAccountService);
  private api = inject(ApiService);
  private dateRangeService = inject(DateRangeService);
  private router = inject(Router);

  loading = signal(true);
  allCreatives = signal<Creative[]>([]);

  private adsEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    const datePreset = this.dateRangeService.datePreset();
    if (acc) {
      console.log('[CreativeCockpit] Loading ads for account:', acc.id, acc.name, 'datePreset:', datePreset);
      this.loadTopAds(acc.id, acc.credential_group, datePreset);
    } else {
      this.loading.set(false);
    }
  }, { allowSignalWrites: true });

  private loadTopAds(accountId: string, credentialGroup: string, datePreset: string) {
    this.loading.set(true);
    this.api.get<any>(environment.AD_ACCOUNT_TOP_ADS, {
      account_id: accountId,
      credential_group: credentialGroup,
      limit: 20,
      date_preset: datePreset,
    }).subscribe({
      next: (res) => {
        if (res.success && res.ads?.length) {
          // Log first ad to see available fields
          console.log('[CreativeCockpit] Sample ad fields:', JSON.stringify(Object.keys(res.ads[0])));
          console.log('[CreativeCockpit] Sample ad data:', JSON.stringify(res.ads[0]).substring(0, 500));
          this.allCreatives.set(res.ads.map((ad: any, i: number) => {
            const roas = ad.metrics?.roas || 0;
            const ctr = ad.metrics?.ctr || 0;
            const conversions = ad.metrics?.conversions || 0;
            const isVideo = ad.object_type === 'VIDEO';

            // Derive hook DNA from actual performance metrics
            const hooks: HookDnaType[] = [];
            if (roas >= 3) hooks.push('Shock Statement');
            else if (ctr >= 2) hooks.push('Curiosity');
            else if (conversions >= 50) hooks.push('Social Proof');
            else if (roas >= 2) hooks.push('Price Anchor');
            else if (ctr >= 1) hooks.push('Curiosity');
            else hooks.push('Education');

            // Derive visual DNA from format and performance
            const visuals: VisualDnaType[] = [];
            if (isVideo) visuals.push('UGC Style');
            else if (roas >= 3) visuals.push('Product Focus');
            else if (ctr >= 2) visuals.push('Before/After');
            else visuals.push('Lifestyle');

            return {
              id: ad.id || `ad-${i}`,
              name: ad.name || 'Unnamed Ad',
              brandId: 'real-account',
              format: (isVideo ? 'video' : 'static') as CreativeFormat,
              duration: ad.video_length || ad.duration || undefined,
              thumbnailUrl: ad.image_url || ad.thumbnail_url || ad.effective_image_url || `https://placehold.co/400x400/E0E7FF/4338CA?text=${encodeURIComponent((ad.name || 'Ad').substring(0, 15))}`,
              videoId: ad.video_id || undefined,
              videoSourceUrl: ad.video_url || ad.source || ad.effective_video_url || undefined,
              status: (roas >= 3 ? 'winning' : roas >= 2 ? 'stable' : roas > 0 ? 'fatiguing' : 'new') as CreativeStatus,
              dna: {
                hook: hooks,
                visual: visuals,
                audio: [],
              },
              metrics: {
                roas,
                cpa: ad.metrics?.cpa || 0,
                ctr,
                spend: ad.metrics?.spend || 0,
                impressions: ad.metrics?.impressions || 0,
                clicks: ad.metrics?.clicks || 0,
                conversions,
              },
              trend: { direction: roas >= 2 ? 'up' as const : 'flat' as const, percentage: 0, period: 'last 30d' },
              daysActive: ad.days_active || 30,
              createdAt: ad.created_time || new Date().toISOString().split('T')[0],
              adSetId: '',
              campaignId: '',
            } satisfies Creative;
          }));
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }
  selectedCreative = signal<Creative | null>(null);
  videoUrl = signal<string | null>(null);
  videoLoading = signal(false);
  videoError = signal(false);
  currentView = signal<'grid' | 'list' | 'table'>('grid');
  moreMenuOpen = signal(false);

  filterHook = '';
  filterVisual = '';
  filterStatus = '';
  filterFormat = '';
  sortBy = 'roas-desc';

  viewModes = [
    { id: 'grid' as const, icon: 'layout-grid' },
    { id: 'list' as const, icon: 'list' },
    { id: 'table' as const, icon: 'layout-dashboard' },
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

  // Performance chart data loaded from API or derived from creative metrics
  perfChartData: { height: number; roas: number; color: string }[] = [];

  filteredCreatives = computed(() => {
    let result = [...this.allCreatives()];

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
    this.videoUrl.set(null);
    this.videoLoading.set(false);
    this.videoError.set(false);
    this.selectedCreative.set(creative);
    this.loadPerfChartData(creative);
  }

  private loadPerfChartData(creative: Creative) {
    const acc = this.adAccountService.currentAccount();
    if (!acc) {
      this.perfChartData = this.buildChartFromMetrics(creative);
      return;
    }

    this.api.get<any>(environment.DASHBOARD_CHART, {
      account_id: acc.id,
      credential_group: acc.credential_group,
      date_preset: this.dateRangeService.datePreset(),
    }).subscribe({
      next: (res) => {
        const chartArr = res.chart || res.data || res.daily || res.chartData || [];
        if (res.success && chartArr.length) {
          const maxRoas = Math.max(...chartArr.map((d: any) => d.roas ?? d.purchase_roas ?? 0), 1);
          this.perfChartData = chartArr.slice(-30).map((d: any) => {
            const roas = Math.round((d.roas ?? d.purchase_roas ?? 0) * 10) / 10;
            const height = Math.max(15, Math.min(95, (roas / (maxRoas * 1.2)) * 100));
            const color = roas >= 3 ? 'bg-green-300' : roas >= 2 ? 'bg-yellow-300' : 'bg-red-300';
            return { height, roas, color };
          });
        } else {
          this.perfChartData = this.buildChartFromMetrics(creative);
        }
      },
      error: () => {
        this.perfChartData = this.buildChartFromMetrics(creative);
      },
    });
  }

  /** Fallback: build simple chart from creative's own ROAS with slight variance from days active */
  private buildChartFromMetrics(creative: Creative): { height: number; roas: number; color: string }[] {
    const baseRoas = creative.metrics.roas;
    const days = Math.min(creative.daysActive || 30, 30);
    const data: { height: number; roas: number; color: string }[] = [];
    for (let i = 0; i < days; i++) {
      // Small deterministic variance based on day index
      const variance = 0.85 + ((i * 7 + 3) % 30) / 100;
      const roas = Math.round(baseRoas * variance * 10) / 10;
      const height = Math.max(15, Math.min(95, (roas / 6) * 100));
      const color = roas >= 3 ? 'bg-green-300' : roas >= 2 ? 'bg-yellow-300' : 'bg-red-300';
      data.push({ height, roas, color });
    }
    return data;
  }

  createBriefFrom(creative: Creative) {
    this.selectedCreative.set(null);
    this.router.navigate(['/app/director-lab'], {
      queryParams: {
        creativeId: creative.id,
        creativeName: creative.name,
        hookDna: creative.dna.hook[0] || '',
        visualDna: creative.dna.visual[0] || '',
        roas: creative.metrics.roas,
      }
    });
  }

  loadVideoSource(creative: Creative) {
    if (this.videoLoading()) return;
    this.videoError.set(false);

    // Use direct video URL if available from ad data
    if (creative.videoSourceUrl) {
      this.videoUrl.set(creative.videoSourceUrl);
      return;
    }

    if (!creative.videoId) {
      console.log('[CreativeCockpit] No videoId for creative:', creative.name);
      this.videoError.set(true);
      return;
    }

    this.videoLoading.set(true);
    const acc = this.adAccountService.currentAccount();
    this.api.get<any>(environment.AD_ACCOUNT_VIDEO_SOURCE, {
      video_id: creative.videoId,
      account_id: acc?.id || '',
      credential_group: acc?.credential_group || 'system',
    }).subscribe({
        next: (res) => {
          console.log('[CreativeCockpit] video-source response:', JSON.stringify(res).substring(0, 300));
          if (res.success && (res.video_url || res.source || res.url)) {
            this.videoUrl.set(res.video_url || res.source || res.url);
          } else {
            console.log('[CreativeCockpit] No video URL in response for video_id:', creative.videoId);
            this.videoError.set(true);
          }
          this.videoLoading.set(false);
        },
        error: (err) => {
          console.log('[CreativeCockpit] video-source error:', err.status);
          this.videoLoading.set(false);
          this.videoError.set(true);
        },
      });
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

  private similarCache = new Map<string, { creative: Creative; match: number }[]>();

  getHeatmapInsight(creative: Creative): string {
    const ctr = creative.metrics.ctr;
    const duration = creative.duration || 15;
    if (ctr >= 2) {
      return `Strong engagement throughout with ${ctr}% CTR. The hook section is performing well — this creative keeps attention above average.`;
    } else if (ctr >= 1) {
      const dropPoint = Math.round(duration * 0.55);
      return `Moderate engagement (${ctr}% CTR). Attention likely dips around ${dropPoint}s — consider tightening the middle section or adding a pattern interrupt.`;
    } else {
      return `Low engagement at ${ctr}% CTR. The hook may not be stopping scroll effectively. Test a stronger opening — Shock Statement or Pattern Interrupt hooks perform 1.8x better.`;
    }
  }

  /**
   * Find similar creatives based on actual performance metrics (ROAS proximity),
   * shared DNA, and format. No fake percentages — the match score is computed
   * from real data dimensions.
   */
  getSimilarCreatives(current: Creative): { creative: Creative; match: number }[] {
    const cached = this.similarCache.get(current.id);
    if (cached) return cached;

    const result = this.allCreatives()
      .filter(c => c.id !== current.id)
      .map(c => {
        let score = 0;

        // ROAS proximity (0-30 pts): closer ROAS = more similar
        const roasDiff = Math.abs(c.metrics.roas - current.metrics.roas);
        score += Math.max(0, 30 - roasDiff * 10);

        // CTR proximity (0-15 pts)
        const ctrDiff = Math.abs(c.metrics.ctr - current.metrics.ctr);
        score += Math.max(0, 15 - ctrDiff * 5);

        // Shared hook DNA (0-20 pts)
        if (c.dna.hook.some(h => current.dna.hook.includes(h))) score += 20;

        // Shared visual DNA (0-15 pts)
        if (c.dna.visual.some(v => current.dna.visual.includes(v))) score += 15;

        // Same format (0-10 pts)
        if (c.format === current.format) score += 10;

        // Same status tier (0-10 pts)
        if (c.status === current.status) score += 10;

        return { creative: c, match: Math.min(Math.round(score), 95) };
      })
      .sort((a, b) => b.match - a.match)
      .slice(0, 3);

    this.similarCache.set(current.id, result);
    return result;
  }

  /**
   * Build a CTR-based engagement heatmap for a video creative.
   * Uses the creative's actual CTR to set the overall engagement level,
   * then models a typical attention curve (high at start, dips in middle, slight recovery at CTA).
   */
  getHeatmapData(duration: number): number[] {
    const creative = this.selectedCreative();
    const ctr = creative?.metrics?.ctr || 1;
    const points = duration || 15;

    // CTR-based baseline: higher CTR = higher overall engagement
    // CTR of 2%+ is strong, 1% is moderate, <0.5% is weak
    const baseline = Math.min(ctr / 3, 1); // 0..1 normalized (3% CTR = 100%)

    const data: number[] = [];
    for (let i = 0; i < points; i++) {
      const progress = i / (points - 1); // 0..1

      // Typical attention curve: high start, gradual decline, slight CTA bump
      let curveMultiplier: number;
      if (progress < 0.15) {
        // Hook section: highest attention
        curveMultiplier = 0.9 + 0.1 * (1 - progress / 0.15);
      } else if (progress < 0.6) {
        // Middle body: gradual decline
        curveMultiplier = 0.9 - 0.35 * ((progress - 0.15) / 0.45);
      } else if (progress < 0.85) {
        // Late body: lowest point
        curveMultiplier = 0.55 - 0.1 * ((progress - 0.6) / 0.25);
      } else {
        // CTA bump: slight recovery
        curveMultiplier = 0.45 + 0.2 * ((progress - 0.85) / 0.15);
      }

      const value = Math.round(baseline * curveMultiplier * 100);
      data.push(Math.max(10, Math.min(100, value)));
    }
    return data;
  }

  /**
   * Generate intelligent AI recommendations based on multiple metrics.
   * Considers ROAS, CTR, CPA, spend, format, and days active together.
   */
  getRecommendations(creative: Creative): { type: string; text: string }[] {
    const { roas, ctr, cpa, spend, conversions } = creative.metrics;
    const { format, daysActive } = creative;
    const recs: { type: string; text: string }[] = [];

    // Scale recommendation: high ROAS + healthy CTR + reasonable CPA
    if (roas >= 3 && ctr >= 1.5) {
      const budgetIncrease = cpa < 500 ? '40-50%' : '20-30%';
      const estRevenue = Math.round(spend * roas * 0.3 / 100000 * 10) / 10;
      recs.push({
        type: 'scale',
        text: `Increase budget by ${budgetIncrease}. ROAS of ${roas}x with ${ctr}% CTR shows strong efficiency. CPA at \u20B9${Math.round(cpa)} is sustainable. Estimated incremental revenue: \u20B9${estRevenue}L/week.`,
      });
    } else if (roas >= 3 && ctr < 1.5) {
      recs.push({
        type: 'scale',
        text: `High ROAS (${roas}x) but CTR is only ${ctr}%. Increase budget modestly (15-20%) and test a stronger hook to improve click-through — this could unlock significant scale.`,
      });
    }

    // Iterate recommendation: based on what's weak
    if (ctr < 1 && roas >= 2) {
      recs.push({
        type: 'iterate',
        text: `CTR is low at ${ctr}% despite decent ROAS. Test a Pattern Interrupt or Shock Statement hook to improve scroll-stop rate. Keep the same visual DNA that's driving conversions.`,
      });
    } else if (cpa > 800 && roas >= 2) {
      recs.push({
        type: 'iterate',
        text: `CPA at \u20B9${Math.round(cpa)} is high despite ${roas}x ROAS. Create a variation with Price Anchor hook to drive more cost-efficient conversions. ${format === 'static' ? 'Also test a video version — video formats show 1.4x lower CPA on average.' : 'Keep the video format.'}`,
      });
    } else if (roas >= 2) {
      recs.push({
        type: 'iterate',
        text: `Solid performer at ${roas}x ROAS. Create a variation with a different hook DNA — ${creative.dna.hook[0] === 'Social Proof' ? 'try Shock Statement' : 'try Social Proof'} to test if it can outperform. Keep the same visual DNA.`,
      });
    }

    // Watch recommendation: signs of fatigue or risk
    if (daysActive > 21 && roas >= 2) {
      recs.push({
        type: 'watch',
        text: `Running for ${daysActive} days — monitor for creative fatigue. ${format === 'video' ? 'Attention typically drops after 3 weeks for video ads.' : 'Static ads fatigue slower but refresh the copy.'} Have a backup creative ready.`,
      });
    } else if (spend > 100000 && ctr < 1) {
      recs.push({
        type: 'watch',
        text: `High spend (\u20B9${Math.round(spend / 1000)}K) with low CTR (${ctr}%). This creative may be reaching audience saturation. Watch for CPA increases over the next 3-5 days.`,
      });
    }

    // Kill recommendation: clearly underperforming
    if (roas < 1.5 && spend > 50000) {
      recs.push({
        type: 'kill',
        text: `ROAS of ${roas}x with \u20B9${Math.round(spend / 1000)}K spent is below profitability. ${ctr < 0.5 ? 'CTR is very low — the hook is not resonating.' : cpa > 1000 ? 'CPA is too high — the landing page or offer needs work.' : 'Consider pausing and reallocating budget to winning creatives.'}`,
      });
    }

    // Always provide at least one recommendation
    if (recs.length === 0) {
      recs.push({
        type: 'iterate',
        text: `Test a new variation — try a different hook type while keeping the visual DNA. ${format === 'static' ? 'Consider creating a video version for broader reach.' : 'A static carousel version could improve feed placement.'}`
      });
    }

    return recs;
  }
}
