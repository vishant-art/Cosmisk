import { Component, signal, computed, effect, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { CreativeStudioService, StudioGeneration } from '../../core/services/creative-studio.service';
import { MetaOAuthService } from '../../core/services/meta-oauth.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { DegradeBadgeComponent } from './shared/degrade-badge.component';

type OutputType = 'static' | 'video' | 'both';

@Component({
  selector: 'app-ugc-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, LoadingSpinnerComponent, DegradeBadgeComponent],
  template: `
    <div class="space-y-6">

      <!-- Top bar -->
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Creative Studio</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Ad concepts built from your winning ads.</p>
        </div>
        @if (grounded()) {
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-[11px] font-body font-semibold">
            <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Meta: grounded
          </span>
        } @else {
          <app-degrade-badge
            text="Ungrounded — no Meta account"
            detail="Concepts are built from your winning ads, so a connected Meta account is required. Connect Meta in Settings." />
        }
      </div>

      <!-- Making from winning ads -->
      <div class="card !p-6">
        <div class="flex items-center gap-2 mb-1">
          <lucide-icon name="sparkles" [size]="18" class="text-accent"></lucide-icon>
          <h2 class="text-lg font-display text-navy m-0">Making from winning ads</h2>
        </div>
        <p class="text-xs text-gray-500 font-body m-0 mb-4">
          The pipeline grounds on your top-performing ads automatically — brand, product and structure are learned from
          your winners. No brief to fill in.
        </p>

        <!-- Additional directions (optional) -->
        <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Additional directions <span class="text-gray-400 font-normal">— optional</span></label>
        <input [(ngModel)]="direction"
          placeholder='e.g. "golden-hour rooftop, warm tones, one model, festive mood"'
          class="input" />

        <!-- Output -->
        <label class="text-xs font-body font-semibold text-gray-700 block mb-1.5 mt-4">Output</label>
        <div class="grid grid-cols-3 gap-2">
          @for (o of outputOptions; track o.id) {
            <button type="button" (click)="outputType.set(o.id)"
              class="text-left px-3 py-2.5 rounded-xl border-2 transition-all"
              [ngClass]="outputType() === o.id ? 'border-accent bg-accent/5' : 'border-gray-200 hover:border-gray-300'">
              <div class="text-sm font-body font-semibold" [ngClass]="outputType() === o.id ? 'text-accent' : 'text-navy'">{{ o.label }}</div>
              <div class="text-[11px] text-gray-500 font-body mt-0.5">{{ o.desc }}</div>
            </button>
          }
        </div>
        @if (outputType() !== 'static') {
          <p class="text-[11px] text-gray-400 font-body m-0 mt-2">
            Statics generate first; the UGC video is planned and <b>quoted before you pay</b> on the next screen.
          </p>
        }

        <div class="flex items-center justify-between mt-5">
          @if (!grounded()) {
            <p class="text-xs text-amber-600 font-body m-0">Connect Meta to generate from winners.</p>
          } @else {
            <span></span>
          }
          <button
            (click)="generateFromWinners()"
            [disabled]="!grounded() || generating()"
            class="px-6 py-2.5 bg-accent text-white rounded-xl text-sm font-body font-bold hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2">
            @if (generating()) {
              <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              Generating...
            } @else {
              <lucide-icon name="sparkles" [size]="16"></lucide-icon>
              Generate from winners &middot; ~$0.60&ndash;0.81
            }
          </button>
        </div>
      </div>

      <!-- History -->
      <div class="card">
        <div class="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-sm font-display text-navy m-0">History</h3>
          <span class="text-xs text-gray-400 font-body">{{ generations().length }} run{{ generations().length === 1 ? '' : 's' }}</span>
        </div>

        @if (loading()) {
          <div class="flex justify-center py-12"><app-loading-spinner /></div>
        }

        @if (!loading() && generations().length === 0) {
          <div class="p-12 text-center">
            <div class="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-accent/10 to-violet-100 rounded-2xl flex items-center justify-center">
              <lucide-icon name="sparkles" [size]="28" class="text-accent/60"></lucide-icon>
            </div>
            <h3 class="text-card-title font-display text-navy mb-1">No runs yet</h3>
            <p class="text-sm text-gray-500 font-body m-0 mb-3">Generate from your winning ads to see runs here</p>
            <button type="button" (click)="viewPreview()"
              class="text-xs font-body font-semibold text-accent hover:underline inline-flex items-center gap-1">
              <lucide-icon name="eye" [size]="13"></lucide-icon>
              Preview the results & video screens (sample) →
            </button>
          </div>
        }

        @if (!loading() && generations().length > 0) {
          <div class="divide-y divide-gray-50">
            @for (gen of visibleGenerations(); track gen.id) {
              <div class="flex items-center justify-between p-4 hover:bg-cream/50 transition-colors cursor-pointer"
                (click)="viewGeneration(gen.id)">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <lucide-icon name="sparkles" [size]="18" class="text-accent"></lucide-icon>
                  </div>
                  <div>
                    <p class="text-sm font-semibold text-navy m-0">{{ runTitle(gen) }}</p>
                    <p class="text-xs text-gray-500 font-body m-0">{{ gen.created_at | date:'mediumDate' }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="px-2.5 py-1 rounded-lg text-xs font-body font-medium capitalize"
                    [ngClass]="{
                      'bg-green-50 text-green-700': gen.status === 'completed',
                      'bg-blue-50 text-blue-700': gen.status === 'generating',
                      'bg-red-50 text-red-700': gen.status === 'failed'
                    }">{{ gen.status }}</span>
                  <lucide-icon name="chevron-right" [size]="16" class="text-gray-300"></lucide-icon>
                </div>
              </div>
            }
          </div>
          @if (generations().length > historyCap) {
            <button type="button" (click)="historyExpanded.set(!historyExpanded())"
              class="w-full p-3 text-xs font-body text-gray-500 hover:text-navy transition-colors border-t border-gray-50">
              {{ historyExpanded() ? 'Show fewer' : 'See all ' + generations().length + ' runs' }}
            </button>
          }
        }
      </div>

      <!-- What this account has proven (collapsed by default) -->
      <div class="card !p-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <button type="button" (click)="provenExpanded.set(!provenExpanded())"
            class="flex items-center gap-1.5 text-left">
            <lucide-icon [name]="provenExpanded() ? 'chevron-down' : 'chevron-right'" [size]="16" class="text-gray-400"></lucide-icon>
            <div>
              <h3 class="text-sm font-display text-navy m-0">What this account has proven</h3>
              <p class="text-[11px] text-gray-400 font-body m-0 mt-0.5">Learned from published, stamped ads — not a guess.</p>
            </div>
          </button>
          <div class="flex items-center gap-2">
            <button
              (click)="harvest()"
              [disabled]="!grounded() || harvesting()"
              class="px-4 py-2 bg-navy text-white rounded-xl text-xs font-body font-semibold hover:bg-navy/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
              @if (harvesting()) {
                <span class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Harvesting...
              } @else {
                <lucide-icon name="refresh-cw" [size]="14"></lucide-icon>
                Harvest results
              }
            </button>
            @if (harvestResult()) {
              <span class="text-xs font-body text-gray-500">{{ harvestResult() }}</span>
            }
          </div>
        </div>

        @if (provenExpanded()) {
          <div class="mt-4">
            @if (!grounded() || (!prior()?.brief && !graph()?.brief)) {
              <app-degrade-badge
                tone="neutral"
                text="New account — no prior yet"
                detail="Publish and stamp ads to start building proof." />
            } @else {
              <div class="grid md:grid-cols-2 gap-4">
                @if (prior()?.brief) {
                  <div>
                    <p class="text-xs font-body font-semibold text-gray-700 m-0 mb-1.5">Proven</p>
                    <div class="text-xs font-body text-gray-600 whitespace-pre-line leading-relaxed">{{ prior().brief }}</div>
                  </div>
                }
                @if (graph()?.brief) {
                  <div>
                    <p class="text-xs font-body font-semibold text-gray-700 m-0 mb-1.5">Structural correlations</p>
                    <div class="text-xs font-body text-gray-600 whitespace-pre-line leading-relaxed">{{ graph().brief }}</div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `
})
export default class UgcStudioComponent implements OnInit {
  private toast = inject(ToastService);
  private studioService = inject(CreativeStudioService);
  private router = inject(Router);
  private metaOAuth = inject(MetaOAuthService);
  private adAccountService = inject(AdAccountService);

  outputOptions: { id: OutputType; label: string; desc: string }[] = [
    { id: 'static', label: 'Static', desc: 'Image concepts' },
    { id: 'video', label: 'Video', desc: 'A UGC clip' },
    { id: 'both', label: 'Both', desc: 'Statics + clip' },
  ];

  direction = '';
  outputType = signal<OutputType>('both');
  metaAccountId = computed(() => this.adAccountService.currentAccount()?.id ?? null);
  /** Grounding needs a connected (not expired) Meta account — the only source of winners/brand/product. */
  grounded = computed(() => this.metaOAuth.isConnected() && !!this.metaAccountId());

  generating = signal(false);
  loading = signal(false);
  generations = signal<StudioGeneration[]>([]);
  historyCap = 5;
  historyExpanded = signal(false);
  visibleGenerations = computed(() =>
    this.historyExpanded() ? this.generations() : this.generations().slice(0, this.historyCap));

  // History loop: what this account has proven (prior + graph) + harvest
  prior = signal<any | null>(null);
  graph = signal<any | null>(null);
  provenExpanded = signal(false);
  harvesting = signal(false);
  harvestResult = signal('');

  // Accounts load async; re-fetch the proven panel whenever the resolved account id changes.
  private proofEffect = effect(() => {
    this.metaAccountId();
    this.fetchProven();
  }, { allowSignalWrites: true });

  ngOnInit() {
    this.fetchHistory();
  }

  runTitle(gen: StudioGeneration): string {
    return gen.brief?.brand_name
      ? `${gen.brief.brand_name}${gen.brief.product_name ? ' — ' + gen.brief.product_name : ''}`
      : 'Winners run';
  }

  generateFromWinners() {
    if (!this.grounded() || this.generating()) return;
    this.generating.set(true);
    // Brief-less "generate from winners" — one 'static' output row carries the multi-aspect
    // concept images the pipeline produces; the Output choice rides along as video intent.
    this.studioService.generate(null, ['static'], {
      metaAccountId: this.metaAccountId() || undefined,
      direction: this.direction || undefined,
    }).subscribe({
      next: (res) => {
        this.generating.set(false);
        if (res.success && res.generation_id) {
          this.router.navigate(['/app/ugc-studio/gen', res.generation_id], { queryParams: { plan: this.outputType() } });
        }
      },
      error: (err) => { this.generating.set(false); this.toast.error('Generation failed', err.error?.error || 'Please try again'); },
    });
  }

  private fetchHistory() {
    this.loading.set(true);
    this.studioService.getGenerations().subscribe({
      next: (res) => { this.generations.set(res.generations || []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  private fetchProven() {
    const acct = this.metaAccountId();
    if (!acct) return;
    this.studioService.getPrior(acct).subscribe({ next: r => this.prior.set(r.prior), error: () => {} });
    this.studioService.getGraph(acct).subscribe({ next: r => this.graph.set(r.graph), error: () => {} });
  }

  harvest() {
    const acct = this.metaAccountId();
    if (!acct) return;
    this.harvesting.set(true);
    this.studioService.learn(acct).subscribe({
      next: (r) => {
        this.harvesting.set(false);
        this.harvestResult.set(r.result?.brief ? 'Prior updated.' : 'No new outcomes cleared the bar.');
        this.fetchProven();
      },
      error: (e) => { this.harvesting.set(false); this.harvestResult.set(e?.error?.error || 'Harvest failed.'); },
    });
  }

  viewGeneration(id: string) {
    this.router.navigate(['/app/ugc-studio/gen', id]);
  }

  /** Local visual-preview: sample run/results/planner screens (no backend). Marked "sample" in the UI. */
  viewPreview() {
    this.router.navigate(['/app/ugc-studio/gen/preview'], { queryParams: { plan: 'both' } });
  }
}
