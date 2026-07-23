import { Component, computed, signal, inject, AfterViewChecked, ElementRef, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { CreativeStudioService, StudioGeneration } from '../../../core/services/creative-studio.service';
import { OutputGalleryComponent } from '../output-gallery/output-gallery.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { VideoPlannerComponent } from './video-planner/video-planner.component';
import { DegradeBadgeComponent } from '../shared/degrade-badge.component';

/** A saree-toned gradient placeholder so the preview screen looks populated without a backend. */
const swatch = (a: string, b: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="500" fill="url(#g)"/></svg>`)}`;

/** ponytail: local visual-preview ONLY — sample data for /gen/preview so the run/results/planner
 *  screens are viewable without a backend. Reached only when genId === 'preview'; never a real run. */
const PREVIEW_GEN = {
  id: 'preview', user_id: 'demo', brief: null, formats: ['static'],
  meta_account_id: 'act_demo', status: 'completed', ai_job_id: 'preview-job', cost_cents: 62,
  stage: 'Static ads done',
  progress: [
    'Applying 3 learned finding(s) from past ads',
    'Applying 5 structural pattern(s) from 12 winners vs 5 losers',
    'Pulled 4 winning creative(s) from Meta',
    'Sourced the product from Shopify: Banarasi Silk Saree',
    'Designing the brand kit', 'Brand kit decided',
    "Tore down the winning ad's structure", 'Planned 4 ad concept(s)',
    'Ad 1/4 generated — "The saree she\'ll be asked about all night"',
    'Ad 2/4 rejected by quality gate',
    'Ad 3/4 generated — "Woven in Banaras. Worn where it matters"',
    'Static ads done',
  ],
  outputs: [{
    id: 'o1', generation_id: 'preview', format: 'static', status: 'completed',
    output: [
      { image_url: swatch('#7C3AED', '#DB2777'), aspect_ratio: '4:5', headline: "The saree she'll be asked about all night" },
      { image_url: swatch('#B45309', '#DC2626'), aspect_ratio: '1:1', headline: 'Woven in Banaras. Worn where it matters' },
      { image_url: swatch('#0F766E', '#4F46E5'), aspect_ratio: '9:16', headline: 'Handloom heritage, everyday drape' },
    ],
    output_json: '', score_json: null, cost_cents: 62, error_message: null,
    created_at: '2026-07-22T14:22:00Z', updated_at: '2026-07-22T14:24:00Z',
  }],
  created_at: '2026-07-22T14:22:00Z',
} as unknown as StudioGeneration;
const PREVIEW_JOB = { rejected: ['Loud festive collage — failed legibility', 'Flat-lay with no model'], cost_usd: 0.62, qa_passed: true };

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

      <!-- SCAFFOLDING (uncomment with the /gen/preview handler): sample-data banner
      @if (generation()?.id === 'preview') {
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-body font-semibold">
          <lucide-icon name="eye" [size]="14"></lucide-icon>
          Preview — sample data, not a real run. For layout review only.
        </div>
      }
      -->

      @if (!loading() && generation()) {
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-page-title font-display text-navy m-0">
              @if (generation()!.brief) {
                {{ generation()!.brief!.brand_name }}@if (generation()!.brief!.product_name) { — {{ generation()!.brief!.product_name }} }
              } @else {
                Generated from winning ads
              }
            </h1>
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

        <!-- Brief summary (manual brief) — or the campaign-mode note (generate from winners) -->
        @if (generation()!.brief) {
          <div class="card !p-5">
            <h3 class="text-sm font-display text-navy m-0 mb-3">Brief</h3>
            <div class="grid md:grid-cols-2 gap-3 text-sm font-body">
              <div>
                <span class="text-gray-400 text-xs">Product</span>
                <p class="text-navy m-0">{{ generation()!.brief!.product_description }}</p>
              </div>
              <div>
                <span class="text-gray-400 text-xs">Target Audience</span>
                <p class="text-navy m-0">{{ generation()!.brief!.target_audience }}</p>
              </div>
              @if (generation()!.brief!.price) {
                <div>
                  <span class="text-gray-400 text-xs">Price</span>
                  <p class="text-navy m-0">{{ generation()!.brief!.price }}</p>
                </div>
              }
            </div>
          </div>
        } @else {
          <div class="card !p-5 flex items-center gap-2.5">
            <lucide-icon name="sparkles" [size]="16" class="text-accent"></lucide-icon>
            <p class="text-sm text-gray-600 font-body m-0">Grounded on your winning ads — brand, product and structure were learned from your top performers.</p>
          </div>
        }

        <!-- Gallery -->
        @if (generation()!.outputs && generation()!.outputs!.length > 0) {
          <app-output-gallery [outputs]="generation()!.outputs!" [rejected]="aiJob()?.rejected || []" [costUsd]="costUsd()" />
        }

        <!-- Video: storyboard planner, quote before render. Shown immediately when the run's
             Output choice was Video/Both; otherwise offered behind a $0 reveal. Never auto-renders. -->
        @if (generation()!.status === 'completed') {
          @if (showPlanner()) {
            <app-video-planner [generationId]="generation()!.id" [aiJobId]="generation()!.ai_job_id || ''" />
          } @else {
            <button type="button" (click)="showPlanner.set(true)"
              class="card !p-4 w-full flex items-center justify-center gap-2 text-sm font-body font-semibold text-accent hover:bg-accent/5 transition-colors">
              <lucide-icon name="video" [size]="16"></lucide-icon>
              Plan a UGC video from these concepts &middot; $0 to quote
            </button>
          }
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
  /** Video planner visibility — driven by the entry's Output choice (?plan=video|both). */
  showPlanner = signal(false);
  /** Full ai-layer job — carries rejected[]/cost_usd/qa_passed, none of which live on the generation row. */
  aiJob = signal<any | null>(null);

  ungrounded = computed(() =>
    (this.generation()?.progress ?? []).some(p => /UNGROUNDED|GROUNDING UNAVAILABLE/i.test(p)));

  /** cost_cents on the run record is authoritative (zero extra call); the ai-layer job's cost_usd is the fallback. */
  costUsd = computed(() => {
    const gen = this.generation();
    if (gen?.cost_cents != null) return gen.cost_cents / 100;
    return this.aiJob()?.cost_usd ?? null;
  });

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
    const plan = this.route.snapshot.queryParamMap.get('plan');
    this.showPlanner.set(plan === 'video' || plan === 'both');
    /* SCAFFOLDING — /gen/preview renders sample data with no backend. Uncomment (with the
       banner in the template + PREVIEW_GEN/PREVIEW_JOB below) to walk the screens offline.
    if (id === 'preview') {
      this.generation.set(PREVIEW_GEN);
      this.aiJob.set(PREVIEW_JOB);
      this.showPlanner.set(true);
      this.loading.set(false);
      return;
    }
    */
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
        if (res.generation.ai_job_id) this.fetchAiJob(res.generation.ai_job_id);

        // Poll if still generating
        if (res.generation.status === 'generating' && !this.pollTimer) {
          this.pollTimer = setInterval(() => {
            this.studioService.getGeneration(id).subscribe({
              next: (pollRes) => {
                const wasCompleted = this.generation()?.status === 'completed';
                this.generation.set(pollRes.generation);
                if (pollRes.generation.status !== 'generating') {
                  clearInterval(this.pollTimer);
                  this.pollTimer = null;
                }
                if (!wasCompleted && pollRes.generation.status === 'completed' && pollRes.generation.ai_job_id) {
                  this.fetchAiJob(pollRes.generation.ai_job_id);
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

  private fetchAiJob(aiJobId: string) {
    this.studioService.getVideoJob(aiJobId).subscribe({
      next: (res) => this.aiJob.set(res.job),
      error: () => {},
    });
  }
}
