import { Component, input, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { FeedbackService } from '../../../core/services/feedback.service';
import { resolveAssetUrl } from '../../../core/services/creative-studio.service';

@Component({
  selector: 'app-output-gallery',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <!-- Format Filter Chips -->
    <div class="flex items-center gap-2 mb-4">
      @for (f of filterOptions; track f.value) {
        <button
          (click)="activeFilter = f.value"
          class="px-3 py-1.5 rounded-lg text-xs font-body font-medium transition-colors"
          [ngClass]="activeFilter === f.value
            ? 'bg-accent text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
          {{ f.label }}
        </button>
      }
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
              @for (script of scriptsOf(out); track $index) {
                <div class="card !p-4 group hover:shadow-md transition-shadow relative">
                  <div class="flex items-start justify-between mb-2">
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
                </div>
              }
            }
          }

          @case ('static') {
            @if (out.status === 'completed' && out.output) {
              @for (img of out.output; track $index) {
                <div class="card !p-2 group hover:shadow-md transition-shadow">
                  @if (img.image_url) {
                    <img [src]="asset(img.thumb_url || img.image_url)" [alt]="img.aspect_ratio"
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
                      <a [href]="asset(img.image_url)" target="_blank" download
                        class="text-[10px] text-accent font-body font-semibold hover:underline no-underline">
                        Download
                      </a>
                    }
                  </div>
                  @if (img.headline) {
                    <p (click)="copyText(img.headline)" title="Click to copy"
                      class="text-[11px] text-navy font-body m-0 mt-1 px-1 cursor-pointer hover:text-accent transition-colors line-clamp-2">
                      {{ img.headline }}
                    </p>
                  }
                </div>
              }
            }
          }

          @case ('carousel') {
            @if (out.status === 'completed' && out.output) {
              @for (slide of out.output; track $index) {
                <div class="card !p-2 group hover:shadow-md transition-shadow">
                  @if (slide.image_url) {
                    <img [src]="asset(slide.thumb_url || slide.image_url)" [alt]="'Slide ' + slide.slide_number"
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

        <!-- Feedback: thumbs on a completed output (study data) -->
        @if (out.status === 'completed') {
          <div class="flex gap-2 mt-1 ml-1 text-gray-400">
            <button type="button" (click)="rateOutput(out.id, 1)" [disabled]="!!rated()[out.id]"
                    [class.text-green-600]="rated()[out.id] === 1" class="hover:text-green-600 disabled:opacity-100"
                    aria-label="Good">
              <lucide-icon name="thumbs-up" [size]="14"></lucide-icon>
            </button>
            <button type="button" (click)="rateOutput(out.id, -1)" [disabled]="!!rated()[out.id]"
                    [class.text-red-500]="rated()[out.id] === -1" class="hover:text-red-500 disabled:opacity-100"
                    aria-label="Poor">
              <lucide-icon name="thumbs-down" [size]="14"></lucide-icon>
            </button>
          </div>
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

    <!-- Evidence-forward footer: rejected concepts + run cost (spec §6.1) — proud, not hidden -->
    @if (rejected().length > 0) {
      <div class="mt-4">
        <button type="button" (click)="rejectedExpanded = !rejectedExpanded"
          class="flex items-center gap-1 text-xs font-body text-gray-500 hover:text-navy transition-colors">
          <lucide-icon name="info" [size]="12"></lucide-icon>
          We rejected {{ rejected().length }} concept{{ rejected().length > 1 ? 's' : '' }} that failed QA
          <span>{{ rejectedExpanded ? '▾' : '▸' }}</span>
        </button>
        @if (rejectedExpanded) {
          <ul class="mt-1.5 ml-5 space-y-0.5 list-disc">
            @for (title of rejected(); track title) {
              <li class="text-xs text-gray-500 font-body">{{ title }}</li>
            }
          </ul>
        }
      </div>
    }
    @if (costUsd() != null) {
      <p class="text-xs text-gray-400 font-body mt-2 mb-0">Run cost: {{ '$' + costUsd()!.toFixed(2) }} (estimate)</p>
    }
  `,
})
export class OutputGalleryComponent {
  outputs = input.required<any[]>();
  rejected = input<string[]>([]);
  costUsd = input<number | null>(null);
  rejectedExpanded = false;
  private feedback = inject(FeedbackService);
  rated = signal<Record<string, -1 | 1>>({});

  rateOutput(outputId: string, rating: -1 | 1): void {
    if (this.rated()[outputId]) return;
    this.feedback.rate('creative', outputId, rating).subscribe({ error: () => {} });
    this.rated.update((r) => ({ ...r, [outputId]: rating }));
  }
  regenerate = output<{ format: string; outputId: string }>();

  filterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Scripts', value: 'scripts' },
    { label: 'Static', value: 'static' },
    { label: 'Carousel', value: 'carousel' },
    { label: 'Video', value: 'video' },
  ];

  activeFilter = 'all';

  filteredOutputs() {
    const outs = this.outputs();
    if (this.activeFilter === 'all') return outs;
    return outs.filter(o => o.format === this.activeFilter);
  }

  scriptsOf(out: any): any[] {
    return Array.isArray(out.output) ? out.output : [];
  }

  copyText(text: string) {
    navigator.clipboard.writeText(text);
  }

  /** Resolve an asset proxy path against the api base (302→R2 in prod, byte-proxy in dev/sim). */
  asset(u: string): string { return resolveAssetUrl(u); }
}
