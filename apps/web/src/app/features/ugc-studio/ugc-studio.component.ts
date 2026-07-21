const _BUILD_VER = '2026-04-01-v2';
import { Component, signal, computed, effect, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { UgcService, UgcProjectSummary } from '../../core/services/ugc.service';
import { CreativeStudioService, StudioGeneration } from '../../core/services/creative-studio.service';
import { MetaOAuthService } from '../../core/services/meta-oauth.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { DegradeBadgeComponent } from './shared/degrade-badge.component';

@Component({
  selector: 'app-ugc-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, LoadingSpinnerComponent, DegradeBadgeComponent],
  template: `
    <div class="space-y-6">

      <!-- Top bar: brand + grounding -->
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Creative Studio</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Brand: Pratap Sons</p>
        </div>
        <div class="flex items-center gap-2">
          @if (metaOAuth.isConnected()) {
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-[11px] font-body font-semibold">
              <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Meta: grounded
            </span>
          } @else {
            <app-degrade-badge
              text="Ungrounded — no Meta account"
              detail="This run won't be conditioned on your real Meta winners. Connect Meta in Settings." />
          }
        </div>
      </div>

      <!-- Zone A: brief-first setup -->
      <div class="card !p-6">
        <h2 class="text-lg font-display text-navy m-0 mb-1">New run</h2>
        <p class="text-xs text-gray-500 font-body m-0 mb-4">Brief &rarr; concepts (~$0.60&ndash;0.81) &rarr; optional UGC video (quoted first).</p>

        <div class="grid md:grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Brand name *</label>
            <input [(ngModel)]="brief.brand_name" placeholder="e.g., Wheelwash" class="input" />
          </div>
          <div>
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Product name *</label>
            <input [(ngModel)]="brief.product_name" placeholder="e.g., Premium Car Shampoo" class="input" />
          </div>
          <div class="md:col-span-2">
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Product description *</label>
            <textarea [(ngModel)]="brief.product_description" rows="3" placeholder="What does this product do? What makes it special?" class="input resize-none"></textarea>
          </div>
          <div>
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Target audience *</label>
            <input [(ngModel)]="brief.target_audience" placeholder="Who is this for?" class="input" />
          </div>
          <div>
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Price (optional)</label>
            <input [(ngModel)]="brief.price" placeholder="e.g., Rs 999" class="input" />
          </div>
          <div class="md:col-span-2">
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Key features (optional, comma-separated)</label>
            <input [(ngModel)]="brief.key_features" placeholder="e.g., waterless, pH-neutral, 500ml" class="input" />
          </div>
          <div class="md:col-span-2">
            <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Direction</label>
            <p class="text-[11px] text-gray-400 font-body m-0 mb-1">Art guide, free text &mdash; steers every concept.</p>
            <input [(ngModel)]="direction" placeholder='e.g. "tall blonde woman, golden-hour rooftop, warm"' class="input" />
          </div>
        </div>

        <div class="mt-4">
          <label class="text-xs font-body font-semibold text-gray-700 block mb-1.5">Formats</label>
          <div class="flex flex-wrap gap-2">
            @for (f of formatOptions; track f.id) {
              <button
                type="button"
                (click)="toggleFormat(f.id)"
                class="px-4 py-2 rounded-xl text-sm font-body font-medium transition-all border-2 inline-flex items-center gap-2"
                [ngClass]="selectedFormats().includes(f.id)
                  ? 'border-accent bg-accent/5 text-accent'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'">
                {{ f.label }}
                @if (selectedFormats().includes(f.id)) {
                  <lucide-icon name="check" [size]="14" class="text-accent"></lucide-icon>
                }
              </button>
            }
          </div>
        </div>


        <p class="text-[11px] text-gray-400 font-body m-0 mt-4">
          Grounding (on by default): Meta winners + losers, Shopify bestseller, brand kit &mdash; see status pill above.
        </p>

        <div class="flex items-center justify-between mt-4">
          <p class="text-xs text-gray-400 font-body m-0">{{ selectedFormats().length }} format(s) selected</p>
          <button
            (click)="generateAll()"
            [disabled]="generating() || selectedFormats().length === 0 || !brief.brand_name || !brief.product_description"
            class="px-6 py-2.5 bg-accent text-white rounded-xl text-sm font-body font-bold hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2">
            @if (generating()) {
              <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              Generating...
            } @else {
              <lucide-icon name="sparkles" [size]="16"></lucide-icon>
              Generate concepts &middot; ~$0.60&ndash;0.81
            }
          </button>
        </div>
      </div>

      <!-- History -->
      <div class="card">
        <div class="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-sm font-display text-navy m-0">History</h3>
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-400 font-body">{{ generations().length + legacyProjects().length }} total</span>
          </div>
        </div>

        @if (loading()) {
          <div class="flex justify-center py-12">
            <app-loading-spinner />
          </div>
        }

        @if (!loading() && generations().length === 0 && legacyProjects().length === 0) {
          <div class="p-12 text-center">
            <div class="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-accent/10 to-violet-100 rounded-2xl flex items-center justify-center">
              <lucide-icon name="sparkles" [size]="28" class="text-accent/60"></lucide-icon>
            </div>
            <h3 class="text-card-title font-display text-navy mb-1">No runs yet</h3>
            <p class="text-sm text-gray-500 font-body m-0">Fill in the brief above to generate your first batch</p>
          </div>
        }

        @if (!loading()) {
          <div class="divide-y divide-gray-50">
            <!-- New studio generations -->
            @for (gen of generations(); track gen.id) {
              <div class="flex items-center justify-between p-4 hover:bg-cream/50 transition-colors cursor-pointer"
                (click)="viewFullGeneration(gen.id)">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <lucide-icon name="sparkles" [size]="18" class="text-accent"></lucide-icon>
                  </div>
                  <div>
                    <p class="text-sm font-semibold text-navy m-0">{{ gen.brief.brand_name }} — {{ gen.brief.product_name }}</p>
                    <p class="text-xs text-gray-500 font-body m-0">
                      {{ gen.formats.join(', ') }} &middot; {{ gen.created_at | date:'mediumDate' }}
                    </p>
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

            <!-- Legacy UGC projects -->
            @for (project of legacyProjects(); track project.id) {
              <div class="flex items-center justify-between p-4 hover:bg-cream/50 transition-colors cursor-pointer"
                (click)="viewLegacyProject(project)">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                    <lucide-icon name="video" [size]="18" class="text-violet-600"></lucide-icon>
                  </div>
                  <div>
                    <p class="text-sm font-semibold text-navy m-0">{{ project.brand_name || project.name }}</p>
                    <p class="text-xs text-gray-500 font-body m-0">UGC Project &middot; {{ project.created_at | date:'mediumDate' }}</p>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="px-2.5 py-1 rounded-lg text-xs font-body font-medium capitalize"
                    [ngClass]="{
                      'bg-green-50 text-green-700': project.status === 'delivered',
                      'bg-blue-50 text-blue-700': project.status === 'scripting',
                      'bg-amber-50 text-amber-700': project.status === 'concepts',
                      'bg-violet-50 text-violet-700': project.status === 'onboarding' || project.status === 'research',
                      'bg-gray-100 text-gray-600': !['delivered','scripting','concepts','onboarding','research'].includes(project.status)
                    }">
                    @switch (project.status) {
                      @case ('onboarding') { Generating... }
                      @case ('research') { Analyzing }
                      @case ('concepts') { Concepts Ready }
                      @case ('scripting') { Scripts Ready }
                      @case ('delivered') { Complete }
                      @default { {{ project.status }} }
                    }
                  </span>
                  <lucide-icon name="chevron-right" [size]="16" class="text-gray-300"></lucide-icon>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- What this account has proven -->
      <div class="card !p-6">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 class="text-sm font-display text-navy m-0">What this account has proven</h3>
            <p class="text-[11px] text-gray-400 font-body m-0 mt-0.5">Learned from published, stamped ads &mdash; not a guess.</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              (click)="harvest()"
              [disabled]="!metaAccountId() || harvesting()"
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

        @if (!metaAccountId() || (!prior()?.brief && !graph()?.brief)) {
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
    </div>
  `
})
export default class UgcStudioComponent implements OnInit {
  private toast = inject(ToastService);
  private ugcService = inject(UgcService);
  private studioService = inject(CreativeStudioService);
  private router = inject(Router);
  metaOAuth = inject(MetaOAuthService);
  private adAccountService = inject(AdAccountService);

  formatOptions = [
    { id: '1:1', label: '1:1' }, { id: '4:5', label: '4:5' },
    { id: '9:16', label: '9:16' }, { id: '16:9', label: '16:9' },
  ];

  // State
  direction = '';
  metaAccountId = computed(() => this.adAccountService.currentAccount()?.id ?? null);
  selectedFormats = signal<string[]>(['1:1', '4:5', '9:16']);
  generating = signal(false);
  loading = signal(false);
  generations = signal<StudioGeneration[]>([]);
  legacyProjects = signal<UgcProjectSummary[]>([]);

  // History loop: what this account has proven (prior + graph) + harvest
  prior = signal<any | null>(null);
  graph = signal<any | null>(null);
  harvesting = signal(false);
  harvestResult = signal('');

  // Accounts load async (AdAccountService fetches on app start), so re-fetch whenever the
  // resolved account id changes rather than once at ngOnInit — otherwise a still-loading
  // account silently leaves the panel on the empty state forever.
  private proofEffect = effect(() => {
    this.metaAccountId();
    this.fetchProven();
  }, { allowSignalWrites: true });

  brief = {
    brand_name: '',
    product_name: '',
    product_description: '',
    target_audience: '',
    price: '',
    key_features: '',
  };

  ngOnInit() {
    this.fetchHistory();
  }

  toggleFormat(id: string) {
    const current = this.selectedFormats();
    if (current.includes(id)) {
      this.selectedFormats.set(current.filter(f => f !== id));
    } else {
      this.selectedFormats.set([...current, id]);
    }
  }

  generateAll() {
    if (!this.brief.brand_name || !this.brief.product_description || this.selectedFormats().length === 0) return;
    this.generating.set(true);
    this.studioService.generate(
      { brand_name: this.brief.brand_name, product_name: this.brief.product_name,
        product_description: this.brief.product_description, target_audience: this.brief.target_audience,
        price: this.brief.price || undefined,
        key_features: this.brief.key_features ? this.brief.key_features.split(',').map(s => s.trim()).filter(Boolean) : undefined },
      this.selectedFormats(),
      { direction: this.direction || undefined, metaAccountId: this.metaAccountId() || undefined },
    ).subscribe({
      next: (res) => {
        this.generating.set(false);
        if (res.success && res.generation_id) this.router.navigate(['/app/ugc-studio/gen', res.generation_id]);
      },
      error: (err) => { this.generating.set(false); this.toast.error('Generation Failed', err.error?.error || 'Please try again'); },
    });
  }

  private fetchHistory() {
    this.loading.set(true);

    // Fetch both new generations and legacy projects
    this.studioService.getGenerations().subscribe({
      next: (res) => {
        this.generations.set(res.generations || []);
      },
      complete: () => this.checkLoadingDone(),
      error: () => this.checkLoadingDone(),
    });

    this.ugcService.getProjects().subscribe({
      next: (data) => {
        this.legacyProjects.set(data.projects || []);
      },
      complete: () => this.checkLoadingDone(),
      error: () => this.checkLoadingDone(),
    });
  }

  private loadCount = 0;
  private checkLoadingDone() {
    this.loadCount++;
    if (this.loadCount >= 2) {
      this.loading.set(false);
      this.loadCount = 0;
    }
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

  viewFullGeneration(id: string) {
    this.router.navigate(['/app/ugc-studio/gen', id]);
  }

  viewLegacyProject(project: UgcProjectSummary) {
    this.router.navigate(['/app/ugc-studio', project.id]);
  }
}
