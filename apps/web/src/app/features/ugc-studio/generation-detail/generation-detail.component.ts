import { Component, computed, signal, inject, AfterViewChecked, ElementRef, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { CreativeStudioService, StudioGeneration } from '../../../core/services/creative-studio.service';
import { OutputGalleryComponent } from '../output-gallery/output-gallery.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { VideoPlannerComponent } from './video-planner/video-planner.component';
import { DegradeBadgeComponent } from '../shared/degrade-badge.component';

/** Static-track milestone rail — a small fixed set of human-named phases (spec §5), not a state machine. */
const MILESTONES: { label: string; match: RegExp }[] = [
  { label: 'Learn the brand', match: /brand/i },
  { label: 'Tear down your ads', match: /tear.?down|teardown|winner|competitor/i },
  { label: 'Write concepts', match: /concept/i },
  { label: 'Render', match: /render|image|generat/i },
  { label: 'Compose & QA', match: /composit|qa|compose/i },
];

@Component({
  selector: 'app-generation-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, OutputGalleryComponent, LoadingSpinnerComponent, VideoPlannerComponent, DegradeBadgeComponent],
  template: `
    <div class="space-y-6">
      <!-- Back link -->
      <a routerLink="/app/ugc-studio" class="inline-flex items-center gap-1.5 text-sm text-gray-500 font-body hover:text-accent no-underline transition-colors">
        <lucide-icon name="arrow-left" [size]="16"></lucide-icon>
        Back to Creative Studio
      </a>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <app-loading-spinner />
        </div>
      }

      @if (!loading() && generation()) {
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-page-title font-display text-navy m-0">{{ generation()!.brief.brand_name }} — {{ generation()!.brief.product_name }}</h1>
            <p class="text-sm text-gray-500 font-body mt-1 mb-0">
              Generated {{ generation()!.created_at | date:'medium' }}
            </p>
            @if (ungrounded()) {
              <div class="mt-2">
                <app-degrade-badge text="Ungrounded — no Meta account" detail="This run was not conditioned on your real Meta winners. Reconnect Meta in Settings." />
              </div>
            }
          </div>
          <span class="px-3 py-1 rounded-lg text-xs font-body font-semibold capitalize"
            [ngClass]="{
              'bg-green-50 text-green-700': generation()!.status === 'completed',
              'bg-blue-50 text-blue-700': generation()!.status === 'generating',
              'bg-red-50 text-red-700': generation()!.status === 'failed'
            }">
            @if (generation()!.status === 'generating') {
              <span class="inline-flex items-center gap-1.5">
                <span class="w-3 h-3 border-2 border-blue-400/30 border-t-blue-600 rounded-full animate-spin"></span>
                {{ generation()!.stage || 'Generating...' }}
              </span>
            } @else {
              {{ generation()!.status }}
            }
          </span>
        </div>

        <!-- Milestone rail + verbatim activity feed (run in progress, or the failed-run report) -->
        @if (generation()!.status === 'generating' || generation()!.status === 'failed') {
          <div class="card !p-5 space-y-4">
            <div class="flex flex-wrap gap-2">
              @for (m of milestones(); track m.label) {
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-body"
                  [ngClass]="{
                    'bg-green-50 text-green-700': m.state === 'done',
                    'bg-accent/10 text-accent font-semibold': m.state === 'active',
                    'bg-gray-50 text-gray-400': m.state === 'pending'
                  }">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0"
                    [ngClass]="{
                      'bg-green-500': m.state === 'done',
                      'bg-accent animate-pulse': m.state === 'active',
                      'bg-gray-300': m.state === 'pending'
                    }"></span>
                  {{ m.label }}
                </div>
              }
            </div>

            <div>
              <h4 class="text-xs font-display text-navy uppercase tracking-wide m-0 mb-2">Activity</h4>
              <div #feedEl class="bg-navy rounded-lg p-3 max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed text-cream/90">
                @for (line of generation()!.progress ?? []; track $index) {
                  <div class="whitespace-pre-wrap break-words"><span class="text-cream/40">{{ ($index + 1).toString().padStart(2, '0') }}</span>&nbsp; {{ line }}</div>
                }
                @if (generation()!.status === 'failed' && generation()!.error_message) {
                  <div class="text-red-400 font-semibold whitespace-pre-wrap break-words">{{ generation()!.error_message }}</div>
                }
                @if (generation()!.status === 'generating') {
                  <span class="inline-block w-2 h-3 bg-cream/70 animate-pulse align-text-bottom"></span>
                }
              </div>
            </div>

            @if (generation()!.status === 'failed') {
              <a routerLink="/app/ugc-studio" class="inline-flex items-center gap-1 text-sm font-body font-semibold text-accent hover:underline no-underline">
                Retry →
              </a>
            }
          </div>
        }

        <!-- Brief summary -->
        <div class="card !p-5">
          <h3 class="text-sm font-display text-navy m-0 mb-3">Brief</h3>
          <div class="grid md:grid-cols-2 gap-3 text-sm font-body">
            <div>
              <span class="text-gray-400 text-xs">Product</span>
              <p class="text-navy m-0">{{ generation()!.brief.product_description }}</p>
            </div>
            <div>
              <span class="text-gray-400 text-xs">Target Audience</span>
              <p class="text-navy m-0">{{ generation()!.brief.target_audience }}</p>
            </div>
            @if (generation()!.brief.price) {
              <div>
                <span class="text-gray-400 text-xs">Price</span>
                <p class="text-navy m-0">{{ generation()!.brief.price }}</p>
              </div>
            }
            <div>
              <span class="text-gray-400 text-xs">Formats</span>
              <div class="flex gap-1.5 mt-0.5">
                @for (f of generation()!.formats; track f) {
                  <span class="px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-semibold rounded capitalize">{{ f }}</span>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Gallery -->
        @if (generation()!.outputs && generation()!.outputs!.length > 0) {
          <app-output-gallery [outputs]="generation()!.outputs!" />
        }

        <!-- Video: storyboard planner, quote before render -->
        @if (generation()!.status === 'completed') {
          <app-video-planner [generationId]="generation()!.id" />
        }
      }

      @if (!loading() && !generation()) {
        <div class="text-center py-16">
          <p class="text-gray-500 font-body">Generation not found</p>
          <a routerLink="/app/ugc-studio" class="text-accent text-sm font-body hover:underline no-underline mt-2 inline-block">Back to Creative Studio</a>
        </div>
      }
    </div>
  `,
})
export default class GenerationDetailComponent implements OnInit, OnDestroy, AfterViewChecked {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private studioService = inject(CreativeStudioService);

  @ViewChild('feedEl') private feedEl?: ElementRef<HTMLDivElement>;

  generation = signal<StudioGeneration | null>(null);
  loading = signal(true);

  ungrounded = computed(() =>
    (this.generation()?.progress ?? []).some(p => /UNGROUNDED|GROUNDING UNAVAILABLE/i.test(p)));

  milestones = computed(() => {
    const stage = this.generation()?.stage ?? '';
    let active = 0;
    MILESTONES.forEach((m, i) => { if (m.match.test(stage)) active = i; });
    return MILESTONES.map((m, i) => ({
      label: m.label,
      state: i < active ? 'done' : i === active ? 'active' : 'pending',
    }));
  });
  private pollTimer: any;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('genId');
    if (!id) {
      this.router.navigate(['/app/ugc-studio']);
      return;
    }
    this.fetchGeneration(id);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  ngAfterViewChecked() {
    // Auto-scroll the verbatim activity feed to the newest line (spec §5).
    if (this.feedEl) {
      const el = this.feedEl.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  private fetchGeneration(id: string) {
    this.studioService.getGeneration(id).subscribe({
      next: (res) => {
        this.generation.set(res.generation);
        this.loading.set(false);

        // Poll if still generating
        if (res.generation.status === 'generating' && !this.pollTimer) {
          this.pollTimer = setInterval(() => {
            this.studioService.getGeneration(id).subscribe({
              next: (pollRes) => {
                this.generation.set(pollRes.generation);
                if (pollRes.generation.status !== 'generating') {
                  clearInterval(this.pollTimer);
                  this.pollTimer = null;
                }
              },
            });
          }, 3000);
        }
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }
}
