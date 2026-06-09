import { Component, input, output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { CreativeScore } from '../../../core/services/creative-studio.service';

@Component({
  selector: 'app-output-gallery',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <!-- Format Filter Chips -->
    <div class="flex items-center gap-2 mb-4">
      @for (f of filterOptions; track f.value) {
        <button
          (click)="activeFilter = f.value; activeSortByScore = false"
          class="px-3 py-1.5 rounded-lg text-xs font-body font-medium transition-colors"
          [ngClass]="activeFilter === f.value
            ? 'bg-accent text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
          {{ f.label }}
        </button>
      }
      <!-- Top Scored chip -->
      <button
        (click)="activeSortByScore = !activeSortByScore"
        class="px-3 py-1.5 rounded-lg text-xs font-body font-medium transition-colors"
        [ngClass]="activeSortByScore
          ? 'bg-emerald-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
        Top Scored
      </button>
    </div>

    <!-- Outputs Grid -->
    @if (filteredOutputs().length === 0) {
      <div class="text-center py-12">
        <div class="w-16 h-16 mx-auto mb-3 bg-gray-100 rounded-2xl flex items-center justify-center">
          <lucide-icon name="package-open" [size]="28" class="text-gray-400"></lucide-icon>
        </div>
        <p class="text-sm text-gray-500 font-body">No outputs yet for this filter</p>
      </div>
    }

    <div class="grid gap-4" [ngClass]="activeFilter === 'scripts' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'">
      @for (out of filteredOutputs(); track out.id) {
        @switch (out.format) {
          @case ('scripts') {
            @if (out.status === 'completed' && out.output) {
              @for (script of getSortedScripts(out); track $index) {
                <div class="card !p-4 group hover:shadow-md transition-shadow relative">
                  <!-- Score Badge -->
                  @if (script.score) {
                    <button
                      (click)="toggleScoreDetail(out.id + '-' + $index)"
                      class="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-body font-bold cursor-pointer transition-all hover:scale-105"
                      [ngClass]="getScoreBadgeClass(script.score.total)">
                      <lucide-icon name="zap" [size]="12"></lucide-icon>
                      {{ script.score.total }}
                    </button>
                  }

                  <div class="flex items-start justify-between mb-2 pr-14">
                    <span class="px-2 py-0.5 bg-violet-50 text-violet-700 text-[10px] font-body font-semibold rounded-md">Script {{ $index + 1 }}</span>
                    <button (click)="copyText(script.hook + '\\n' + script.body + '\\n' + script.cta)"
                      class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded">
                      <lucide-icon name="copy" [size]="14" class="text-gray-400"></lucide-icon>
                    </button>
                  </div>
                  <h4 class="text-sm font-display text-navy m-0 mb-2">{{ script.title }}</h4>
                  <div class="space-y-1.5">
                    <p class="text-xs text-gray-500 font-body m-0">
                      <span class="font-semibold text-amber-600">Hook:</span> {{ script.hook }}
                    </p>
                    <p class="text-xs text-gray-500 font-body m-0 line-clamp-3">{{ script.body }}</p>
                    <p class="text-xs text-gray-500 font-body m-0">
                      <span class="font-semibold text-green-600">CTA:</span> {{ script.cta }}
                    </p>
                  </div>
                  @if (script.visual_notes) {
                    <p class="text-[10px] text-gray-400 font-body mt-2 m-0 italic">{{ script.visual_notes }}</p>
                  }

                  <!-- Score Detail Panel (expandable) -->
                  @if (script.score && expandedScoreId === out.id + '-' + $index) {
                    <div class="mt-3 pt-3 border-t border-gray-100 space-y-2 animate-in">
                      <!-- 5 Dimension Bars -->
                      @for (dim of getDimensionList(script.score); track dim.key) {
                        <div>
                          <div class="flex items-center justify-between mb-0.5">
                            <span class="text-[10px] font-body text-gray-500">{{ dim.label }}</span>
                            <span class="text-[10px] font-body font-semibold" [ngClass]="dim.score >= 14 ? 'text-emerald-600' : dim.score >= 8 ? 'text-amber-600' : 'text-red-500'">{{ dim.score }}/20</span>
                          </div>
                          <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all duration-500"
                              [style.width.%]="dim.score * 5"
                              [ngClass]="dim.score >= 14 ? 'bg-emerald-500' : dim.score >= 8 ? 'bg-amber-500' : 'bg-red-400'">
                            </div>
                          </div>
                          <p class="text-[9px] text-gray-400 font-body m-0 mt-0.5">{{ dim.detail }}</p>
                        </div>
                      }

                      <!-- Matched Patterns -->
                      @if (script.score.matchedPatterns.length > 0) {
                        <div class="flex flex-wrap gap-1 mt-2">
                          @for (p of script.score.matchedPatterns.slice(0, 5); track p) {
                            <span class="px-1.5 py-0.5 bg-violet-50 text-violet-600 text-[9px] font-body rounded">{{ p }}</span>
                          }
                        </div>
                      }

                      <!-- Confidence + ROAS Range -->
                      <div class="flex items-center gap-3 mt-2">
                        <span class="text-[10px] font-body px-1.5 py-0.5 rounded"
                          [ngClass]="script.score.confidence === 'high' ? 'bg-emerald-50 text-emerald-700' : script.score.confidence === 'moderate' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'">
                          {{ script.score.confidence }} confidence
                        </span>
                        @if (script.score.predictedRoasRange) {
                          <span class="text-[10px] font-body text-gray-500">
                            ROAS: {{ script.score.predictedRoasRange.p25 }}x - {{ script.score.predictedRoasRange.p75 }}x
                          </span>
                        }
                      </div>

                      <!-- Top Insight -->
                      <p class="text-[10px] text-gray-600 font-body m-0 mt-1 italic">{{ script.score.topInsight }}</p>

                      <!-- Warnings -->
                      @for (w of script.score.warnings; track w) {
                        <p class="text-[9px] text-amber-600 font-body m-0 flex items-center gap-1">
                          <lucide-icon name="alert-triangle" [size]="10"></lucide-icon> {{ w }}
                        </p>
                      }
                    </div>
                  }
                </div>
              }
            }
          }

          @case ('static') {
            @if (out.status === 'completed' && out.output) {
              <!-- Score badge for static set -->
              @if (getFormatScore(out)) {
                <div class="col-span-full mb-1">
                  <button (click)="toggleScoreDetail('static-' + out.id)"
                    class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-body font-bold cursor-pointer transition-all hover:scale-[1.02]"
                    [ngClass]="getScoreBadgeClass(getFormatScore(out)!.total)">
                    <lucide-icon name="zap" [size]="14"></lucide-icon>
                    Static Ads Score: {{ getFormatScore(out)!.total }}/100
                  </button>
                  @if (expandedScoreId === 'static-' + out.id) {
                    <div class="mt-2 p-3 bg-white rounded-lg border border-gray-100 space-y-2">
                      @for (dim of getDimensionList(getFormatScore(out)!); track dim.key) {
                        <div class="flex items-center gap-3">
                          <span class="text-[10px] font-body text-gray-500 w-24">{{ dim.label }}</span>
                          <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div class="h-full rounded-full"
                              [style.width.%]="dim.score * 5"
                              [ngClass]="dim.score >= 14 ? 'bg-emerald-500' : dim.score >= 8 ? 'bg-amber-500' : 'bg-red-400'">
                            </div>
                          </div>
                          <span class="text-[10px] font-body font-semibold w-8 text-right" [ngClass]="dim.score >= 14 ? 'text-emerald-600' : dim.score >= 8 ? 'text-amber-600' : 'text-red-500'">{{ dim.score }}</span>
                        </div>
                      }
                      <p class="text-[10px] text-gray-500 font-body m-0 mt-1 italic">{{ getFormatScore(out)!.topInsight }}</p>
                    </div>
                  }
                </div>
              }
              @for (img of out.output; track $index) {
                <div class="card !p-2 group hover:shadow-md transition-shadow">
                  @if (img.image_url) {
                    <img [src]="img.image_url" [alt]="img.aspect_ratio"
                      class="w-full rounded-lg mb-2 bg-gray-100" loading="lazy" />
                  } @else if (img.status === 'processing') {
                    <div class="w-full aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center">
                      <div class="text-center">
                        <span class="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block mb-1"></span>
                        <p class="text-[10px] text-gray-400 font-body m-0">Processing...</p>
                      </div>
                    </div>
                  } @else {
                    <div class="w-full aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center">
                      <lucide-icon name="image-off" [size]="24" class="text-gray-300"></lucide-icon>
                    </div>
                  }
                  <div class="flex items-center justify-between px-1">
                    <span class="text-[10px] text-gray-400 font-body">{{ img.aspect_ratio }}</span>
                    @if (img.image_url) {
                      <a [href]="img.image_url" target="_blank" download
                        class="text-[10px] text-accent font-body font-semibold hover:underline no-underline">
                        Download
                      </a>
                    }
                  </div>
                </div>
              }
            }
          }

          @case ('carousel') {
            @if (out.status === 'completed' && out.output) {
              <!-- Score badge for carousel set -->
              @if (getFormatScore(out)) {
                <div class="col-span-full mb-1">
                  <button (click)="toggleScoreDetail('carousel-' + out.id)"
                    class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-body font-bold cursor-pointer transition-all hover:scale-[1.02]"
                    [ngClass]="getScoreBadgeClass(getFormatScore(out)!.total)">
                    <lucide-icon name="zap" [size]="14"></lucide-icon>
                    Carousel Score: {{ getFormatScore(out)!.total }}/100
                  </button>
                  @if (expandedScoreId === 'carousel-' + out.id) {
                    <div class="mt-2 p-3 bg-white rounded-lg border border-gray-100 space-y-2">
                      @for (dim of getDimensionList(getFormatScore(out)!); track dim.key) {
                        <div class="flex items-center gap-3">
                          <span class="text-[10px] font-body text-gray-500 w-24">{{ dim.label }}</span>
                          <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div class="h-full rounded-full"
                              [style.width.%]="dim.score * 5"
                              [ngClass]="dim.score >= 14 ? 'bg-emerald-500' : dim.score >= 8 ? 'bg-amber-500' : 'bg-red-400'">
                            </div>
                          </div>
                          <span class="text-[10px] font-body font-semibold w-8 text-right" [ngClass]="dim.score >= 14 ? 'text-emerald-600' : dim.score >= 8 ? 'text-amber-600' : 'text-red-500'">{{ dim.score }}</span>
                        </div>
                      }
                      <p class="text-[10px] text-gray-500 font-body m-0 mt-1 italic">{{ getFormatScore(out)!.topInsight }}</p>
                    </div>
                  }
                </div>
              }
              @for (slide of out.output; track $index) {
                <div class="card !p-2 group hover:shadow-md transition-shadow">
                  @if (slide.image_url) {
                    <img [src]="slide.image_url" [alt]="'Slide ' + slide.slide_number"
                      class="w-full rounded-lg mb-2 bg-gray-100" loading="lazy" />
                  } @else if (slide.status === 'processing') {
                    <div class="w-full aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center">
                      <span class="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block"></span>
                    </div>
                  } @else {
                    <div class="w-full aspect-square bg-gray-100 rounded-lg mb-2 flex items-center justify-center">
                      <lucide-icon name="image-off" [size]="24" class="text-gray-300"></lucide-icon>
                    </div>
                  }
                  <span class="text-[10px] text-gray-400 font-body px-1">Slide {{ slide.slide_number }}</span>
                </div>
              }
            }
          }

          @case ('video') {
            <div class="card !p-4 col-span-full">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <lucide-icon name="video" [size]="20" class="text-amber-600"></lucide-icon>
                </div>
                <div>
                  <p class="text-sm font-display text-navy m-0">AI Avatar Video</p>
                  @if (out.status === 'pending') {
                    <p class="text-xs text-gray-500 font-body m-0">{{ out.output?.message || 'Video generation is available through the UGC Studio pipeline.' }}</p>
                  } @else if (out.status === 'failed') {
                    <p class="text-xs text-red-500 font-body m-0">{{ out.error_message }}</p>
                  }
                </div>
              </div>
            </div>
          }
        }

        <!-- Error state for any format -->
        @if (out.status === 'failed' && out.format !== 'video') {
          <div class="card !p-4 border border-red-100">
            <div class="flex items-center gap-2 mb-1">
              <lucide-icon name="alert-circle" [size]="14" class="text-red-500"></lucide-icon>
              <span class="text-xs font-body font-semibold text-red-600 capitalize">{{ out.format }} Failed</span>
            </div>
            <p class="text-xs text-gray-500 font-body m-0">{{ out.error_message || 'Generation failed. Please try again.' }}</p>
          </div>
        }
      }
    </div>
  `,
})
export class OutputGalleryComponent {
  outputs = input.required<any[]>();
  regenerate = output<{ format: string; outputId: string }>();

  filterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Scripts', value: 'scripts' },
    { label: 'Static', value: 'static' },
    { label: 'Carousel', value: 'carousel' },
    { label: 'Video', value: 'video' },
  ];

  activeFilter = 'all';
  activeSortByScore = false;
  expandedScoreId: string | null = null;

  filteredOutputs() {
    const outs = this.outputs();
    if (this.activeFilter === 'all') return outs;
    return outs.filter(o => o.format === this.activeFilter);
  }

  getSortedScripts(out: any): any[] {
    if (!out.output || !Array.isArray(out.output)) return [];
    if (!this.activeSortByScore) return out.output;
    return [...out.output].sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));
  }

  getFormatScore(out: any): CreativeScore | null {
    if (out.score_json && Array.isArray(out.score_json) && out.score_json.length > 0) {
      return out.score_json[0];
    }
    return null;
  }

  getScoreBadgeClass(score: number): Record<string, boolean> {
    return {
      'bg-emerald-100 text-emerald-700': score >= 80,
      'bg-amber-100 text-amber-700': score >= 60 && score < 80,
      'bg-red-100 text-red-600': score < 60,
    };
  }

  getDimensionList(score: CreativeScore): Array<{ key: string; label: string; score: number; detail: string }> {
    const d = score.dimensions;
    return [
      { key: 'patternMatch', label: d.patternMatch.label, score: d.patternMatch.score, detail: d.patternMatch.detail },
      { key: 'hookQuality', label: d.hookQuality.label, score: d.hookQuality.score, detail: d.hookQuality.detail },
      { key: 'formatSignal', label: d.formatSignal.label, score: d.formatSignal.score, detail: d.formatSignal.detail },
      { key: 'dataConfidence', label: d.dataConfidence.label, score: d.dataConfidence.score, detail: d.dataConfidence.detail },
      { key: 'novelty', label: d.novelty.label, score: d.novelty.score, detail: d.novelty.detail },
    ];
  }

  toggleScoreDetail(id: string) {
    this.expandedScoreId = this.expandedScoreId === id ? null : id;
  }

  copyText(text: string) {
    navigator.clipboard.writeText(text);
  }
}
