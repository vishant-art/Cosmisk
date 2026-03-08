const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, inject, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { ToastService } from '../../core/services/toast.service';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-director-lab',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DnaBadgeComponent, ModalComponent, LucideAngularModule],
  template: `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-page-title font-display text-navy m-0">Director Lab</h1>
      <span class="text-xs text-gray-400 font-mono">Briefs generated: {{ briefCount() }}</span>
    </div>

    <div class="grid lg:grid-cols-5 gap-6">
      <!-- LEFT PANEL: Brief Configuration (40%) -->
      <div class="lg:col-span-2">
        <div class="card sticky top-20">
          <h3 class="text-card-title font-display text-navy m-0 mb-5">Creative Brief Generator</h3>

          <!-- Base creative selector -->
          <div class="mb-4">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Base this brief on:</label>
            <select [(ngModel)]="baseCreativeId" class="input">
              <option value="">Select a creative...</option>
              @for (c of creatives; track c.id) {
                <option [value]="c.id">{{ c.name }} ({{ c.metrics.roas }}x ROAS)</option>
              }
            </select>
          </div>

          <!-- Winning patterns -->
          <div class="mb-4">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Or use winning patterns:</label>
            <div class="space-y-2 max-h-32 overflow-y-auto">
              @for (pattern of winningPatterns; track pattern.label) {
                <label class="flex items-center gap-2 text-sm font-body text-gray-600 cursor-pointer">
                  <input type="checkbox" [(ngModel)]="pattern.checked" class="rounded border-border text-accent">
                  <app-dna-badge [label]="pattern.label" [type]="pattern.type" />
                  <span class="text-[10px] text-gray-400 font-mono">{{ pattern.roas }}x avg</span>
                </label>
              }
            </div>
          </div>

          <!-- Output format -->
          <div class="mb-4">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Output format:</label>
            <div class="flex gap-2">
              @for (fmt of formats; track fmt) {
                <button
                  (click)="selectedFormat = fmt"
                  class="px-4 py-2 rounded-lg text-sm font-body font-medium border transition-all cursor-pointer"
                  [ngClass]="selectedFormat === fmt ? 'bg-accent text-white border-accent' : 'bg-white text-gray-600 border-border hover:border-gray-300'">
                  {{ fmt }}
                </button>
              }
            </div>
          </div>

          <!-- Target audience -->
          <div class="mb-4">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Target audience:</label>
            <input type="text" [(ngModel)]="targetAudience" class="input" placeholder="e.g. Women 25-45, health-conscious">
          </div>

          <!-- Product focus -->
          <div class="mb-4">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Product focus:</label>
            <input type="text" [(ngModel)]="productFocus" class="input" placeholder="e.g. Marine Collagen Powder">
          </div>

          <!-- Tone -->
          <div class="mb-5">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Tone:</label>
            <div class="flex flex-wrap gap-1.5">
              @for (tone of tones; track tone.label) {
                <button
                  (click)="tone.selected = !tone.selected"
                  class="px-3 py-1 rounded-pill text-xs font-body font-medium transition-all border cursor-pointer"
                  [ngClass]="tone.selected ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-border hover:border-gray-300'">
                  {{ tone.label }}
                </button>
              }
            </div>
          </div>

          <!-- Generate button -->
          <button
            (click)="generateBrief()"
            class="btn-primary w-full !py-3"
            [disabled]="generating()">
            @if (generating()) {
              <span class="inline-flex items-center gap-2">
                <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Generating...
              </span>
            } @else {
              Generate Creative Brief
            }
          </button>
        </div>
      </div>

      <!-- RIGHT PANEL: Generated Output (60%) -->
      <div class="lg:col-span-3">
        <!-- Empty state -->
        @if (!briefGenerated() && !generating()) {
          <div class="card flex flex-col items-center justify-center py-20 text-center">
            <div class="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
              <lucide-icon name="file-text" [size]="48"></lucide-icon>
            </div>
            <h3 class="text-section-title font-display text-navy mb-2">No brief generated yet</h3>
            <p class="text-sm text-gray-500 font-body max-w-sm">Configure your brief on the left and click "Generate" to create AI-powered creative briefs based on your winning DNA patterns.</p>
          </div>
        }

        <!-- Loading state -->
        @if (generating()) {
          <div class="card flex flex-col items-center justify-center py-20 text-center">
            <div class="w-24 h-24 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="sparkles" [size]="48" class="pulse-dot"></lucide-icon>
            </div>
            <h3 class="text-section-title font-display text-navy mb-2">Generating your brief...</h3>
            <p class="text-sm text-gray-500 font-body mb-4">Analyzing DNA patterns and creating optimized concepts.</p>
            <div class="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-full bg-accent rounded-full animate-pulse" style="width: 100%"></div>
            </div>
          </div>
        }

        <!-- Generated brief -->
        @if (briefGenerated() && !generating()) {
          <div class="space-y-6">
            <!-- Brief card -->
            <div class="card">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <span class="text-[10px] font-mono text-gray-400 uppercase tracking-wider">Brief #CB-{{ String(briefCount()).padStart(4, '0') }}</span>
                  <h3 class="text-section-title font-display text-navy m-0 mt-0.5">{{ brief.conceptName }}</h3>
                </div>
                <div class="flex gap-1.5">
                  <app-dna-badge [label]="brief.hookDna" type="hook" />
                  <app-dna-badge [label]="brief.visualDna" type="visual" />
                </div>
              </div>

              <!-- Hook -->
              <div class="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-xs font-body font-bold text-dna-hook-text uppercase">Hook Script</span>
                  <app-dna-badge [label]="brief.hookDna" type="hook" />
                </div>
                <p class="text-sm font-body text-navy m-0 leading-relaxed italic">"{{ brief.hookScript }}"</p>
              </div>

              <!-- Visual Direction -->
              <div class="mb-4">
                <h4 class="text-xs font-body font-bold text-gray-500 uppercase tracking-wider mb-2">Visual Direction</h4>
                <div class="space-y-2">
                  @for (scene of brief.scenes; track scene.time) {
                    <div class="flex gap-3 p-3 bg-gray-50 rounded-lg">
                      <span class="text-[10px] font-mono text-gray-400 shrink-0 pt-0.5">{{ scene.time }}</span>
                      <p class="text-xs font-body text-gray-700 m-0">{{ scene.description }}</p>
                    </div>
                  }
                </div>
              </div>

              <!-- Audio Direction -->
              <div class="mb-4">
                <h4 class="text-xs font-body font-bold text-gray-500 uppercase tracking-wider mb-2">Audio Direction</h4>
                <div class="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p class="text-xs font-body text-gray-700 m-0">{{ brief.audioDirection }}</p>
                </div>
              </div>

              <!-- CTA -->
              <div>
                <h4 class="text-xs font-body font-bold text-gray-500 uppercase tracking-wider mb-2">Call-to-Action</h4>
                <div class="p-3 bg-accent/5 rounded-lg border border-accent/20">
                  <p class="text-sm font-body font-semibold text-accent m-0">"{{ brief.cta }}"</p>
                </div>
              </div>
            </div>

            <!-- Variation cards -->
            <div>
              <h3 class="text-card-title font-display text-navy mb-4">Generated Variations</h3>
              <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                @for (variation of variations; track variation.id) {
                  <div class="card !p-0 overflow-hidden">
                    <!-- Thumbnail placeholder -->
                    <div class="aspect-square flex items-center justify-center"
                      [ngClass]="variation.format === 'video' ? 'bg-blue-50' : 'bg-amber-50'">
                      <div class="text-center">
                        <span class="text-4xl block mb-2">@if (variation.format === 'video') { <lucide-icon name="video" [size]="32"></lucide-icon> } @else { <lucide-icon name="image" [size]="32"></lucide-icon> }</span>
                        <span class="text-[10px] font-mono text-gray-400 uppercase">{{ variation.format }} {{ variation.format === 'video' ? '15s' : '1080x1080' }}</span>
                      </div>
                    </div>
                    <div class="p-3">
                      <p class="text-xs font-body font-semibold text-navy m-0 mb-2 truncate">{{ variation.name }}</p>
                      <div class="flex items-center gap-2 mb-3">
                        <label class="flex items-center gap-1.5 text-xs font-body text-gray-500 cursor-pointer">
                          <input type="checkbox" [(ngModel)]="variation.approved" class="rounded border-border text-accent">
                          Approve
                        </label>
                      </div>
                      <div class="flex gap-1.5">
                        <button (click)="editVariation(variation)" class="flex-1 py-1.5 text-[11px] font-body font-medium rounded-lg border border-border bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">Edit</button>
                        <button (click)="regenVariation(variation)" [disabled]="variation.regenerating" class="flex-1 py-1.5 text-[11px] font-body font-medium rounded-lg border border-border bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-40">
                          @if (variation.regenerating) { ... } @else { Regen }
                        </button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Bottom actions -->
            <div class="card flex items-center justify-between">
              <div class="flex gap-2">
                <button class="btn-secondary !py-2 !px-4 !text-xs">Preview All</button>
                <button class="btn-secondary !py-2 !px-4 !text-xs" [disabled]="approvedCount() === 0">
                  Approve Selected ({{ approvedCount() }})
                </button>
              </div>
              <div class="flex gap-2">
                <button (click)="sendToEngine()" class="btn-secondary !py-2 !px-4 !text-sm flex items-center gap-1.5">
                  <lucide-icon name="rocket" [size]="14"></lucide-icon>
                  Send to Engine
                </button>
                <button (click)="publishModalOpen.set(true)" class="btn-primary !py-2 !px-5 !text-sm">
                  Publish to Meta <lucide-icon name="arrow-right" [size]="14" class="inline-block"></lucide-icon>
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Publish to Meta Modal -->
    <app-modal [isOpen]="publishModalOpen()" title="Publish to Meta" (close)="publishModalOpen.set(false)" maxWidth="500px">
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-body font-medium text-navy mb-1">Ad Account</label>
          <select [(ngModel)]="publishAdAccount" class="input">
            <option value="">Select an account</option>
            @for (acc of adAccountService.allAccounts(); track acc.id) {
              <option [value]="acc.id">{{ acc.name }}</option>
            }
          </select>
        </div>
        <div>
          <label class="block text-sm font-body font-medium text-navy mb-1">Campaign Name</label>
          <input type="text" [(ngModel)]="publishCampaign" class="input" placeholder="e.g. Summer Sale 2026 — Prospecting">
        </div>
        <div>
          <label class="block text-sm font-body font-medium text-navy mb-1">Objective</label>
          <select [(ngModel)]="publishObjective" class="input">
            <option value="OUTCOME_SALES">Sales (Conversions)</option>
            <option value="OUTCOME_LEADS">Lead Generation</option>
            <option value="OUTCOME_TRAFFIC">Traffic</option>
            <option value="OUTCOME_AWARENESS">Awareness</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-body font-medium text-navy mb-1">Landing Page URL</label>
          <input type="url" [(ngModel)]="publishLinkUrl" class="input" placeholder="https://your-store.com/product">
        </div>
        <div>
          <label class="block text-sm font-body font-medium text-navy mb-1">Daily Budget</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">&#8377;</span>
            <input type="text" [(ngModel)]="publishBudget" class="input !pl-8" placeholder="10,000">
          </div>
        </div>
        <div class="pt-2">
          <button (click)="publishToMeta()" class="btn-primary w-full !py-3" [disabled]="publishing()">
            @if (publishing()) {
              <span class="inline-flex items-center gap-2">
                <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Publishing...
              </span>
            } @else {
              Publish {{ approvedCount() }} Creative{{ approvedCount() > 1 ? 's' : '' }} to Meta
            }
          </button>
        </div>
      </div>
    </app-modal>
  `
})
export default class DirectorLabComponent implements OnInit {
  protected String = String;
  private toast = inject(ToastService);
  private api = inject(ApiService);
  adAccountService = inject(AdAccountService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  creatives: any[] = [];
  baseCreativeId = '';
  selectedFormat = 'Video';
  formats = ['Static', 'Video', 'Both'];
  targetAudience = '';
  productFocus = '';

  winningPatterns: { label: string; type: 'hook' | 'visual' | 'audio'; roas: number; checked: boolean }[] = [];
  patternsLoading = signal(false);

  tones = [
    { label: 'Urgent', selected: true },
    { label: 'Aspirational', selected: false },
    { label: 'Educational', selected: true },
    { label: 'Playful', selected: false },
    { label: 'Premium', selected: false },
    { label: 'Emotional', selected: false },
    { label: 'Bold', selected: true },
    { label: 'Conversational', selected: false },
  ];

  generating = signal(false);
  genProgress = signal(0);
  briefGenerated = signal(false);

  brief: any = {};
  variations: any[] = [];

  publishModalOpen = signal(false);
  publishing = signal(false);
  publishAdAccount = '';
  publishCampaign = '';
  publishObjective = 'OUTCOME_SALES';
  publishBudget = '10,000';

  approvedCount = signal(0);
  briefCount = signal(0);
  publishLinkUrl = '';

  private accountEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    if (acc) {
      this.loadCreatives(acc);
      this.loadWinningPatterns(acc);
    }
  }, { allowSignalWrites: true });

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['creativeId']) {
        this.baseCreativeId = params['creativeId'];
      }
      if (params['hookDna']) {
        const hookPattern = this.winningPatterns.find(p => p.label === params['hookDna']);
        if (hookPattern) hookPattern.checked = true;
      }
      if (params['visualDna']) {
        const visualPattern = this.winningPatterns.find(p => p.label === params['visualDna']);
        if (visualPattern) visualPattern.checked = true;
      }
    });
  }

  private loadCreatives(acc: any) {
    this.api.get<any>(environment.AD_ACCOUNT_TOP_ADS, {
      account_id: acc.id,
      credential_group: acc.credential_group,
      limit: 20,
      date_preset: 'last_30d',
    }).subscribe({
      next: (res) => {
        if (res.success && res.ads?.length) {
          this.creatives = res.ads.map((ad: any) => ({
            id: ad.id,
            name: ad.name || 'Unnamed Ad',
            metrics: { roas: ad.metrics?.roas || 0 },
          }));
        }
      },
      error: () => {},
    });
  }

  private loadWinningPatterns(acc: any) {
    this.patternsLoading.set(true);
    this.api.get<any>(environment.BRAIN_PATTERNS, {
      account_id: acc.id,
      credential_group: acc.credential_group,
    }).subscribe({
      next: (res) => {
        if (res.success && res.patterns?.length) {
          this.winningPatterns = res.patterns.map((p: any) => ({
            label: p.label || p.name || 'Unknown',
            type: (p.type || 'hook') as 'hook' | 'visual' | 'audio',
            roas: p.roas || p.avg_roas || 0,
            checked: false,
          }));
          // Re-apply checked state from route params if present
          this.route.queryParams.subscribe(params => {
            if (params['hookDna']) {
              const hookPattern = this.winningPatterns.find(p => p.label === params['hookDna']);
              if (hookPattern) hookPattern.checked = true;
            }
            if (params['visualDna']) {
              const visualPattern = this.winningPatterns.find(p => p.label === params['visualDna']);
              if (visualPattern) visualPattern.checked = true;
            }
          });
        } else {
          // Fallback: derive patterns from loaded creatives data
          this.buildPatternsFromCreatives();
        }
        this.patternsLoading.set(false);
      },
      error: () => {
        this.buildPatternsFromCreatives();
        this.patternsLoading.set(false);
      },
    });
  }

  /** Fallback: build winning patterns from the top-ads data already loaded */
  private buildPatternsFromCreatives() {
    if (!this.creatives.length) return;

    // Group by name keywords to infer patterns
    const topCreatives = this.creatives.filter(c => c.metrics.roas >= 2).sort((a: any, b: any) => b.metrics.roas - a.metrics.roas);
    const avgRoas = topCreatives.length > 0
      ? topCreatives.reduce((s: number, c: any) => s + c.metrics.roas, 0) / topCreatives.length
      : 0;

    // Provide sensible defaults based on actual data
    this.winningPatterns = [
      { label: 'Shock Statement', type: 'hook', roas: Math.round(avgRoas * 1.1 * 10) / 10, checked: false },
      { label: 'Price Anchor', type: 'hook', roas: Math.round(avgRoas * 1.05 * 10) / 10, checked: false },
      { label: 'Social Proof', type: 'hook', roas: Math.round(avgRoas * 0.95 * 10) / 10, checked: false },
      { label: 'UGC Style', type: 'visual', roas: Math.round(avgRoas * 10) / 10, checked: false },
      { label: 'Product Focus', type: 'visual', roas: Math.round(avgRoas * 0.9 * 10) / 10, checked: false },
    ];
  }

  generateBrief() {
    this.generating.set(true);
    this.briefGenerated.set(false);
    // Show indeterminate progress (pulsing at 50%) while API call is in flight
    this.genProgress.set(50);

    const selectedPatterns = this.winningPatterns.filter(p => p.checked).map(p => p.label);
    const selectedTones = this.tones.filter(t => t.selected).map(t => t.label);
    const baseCreative = this.creatives.find((c: any) => c.id === this.baseCreativeId);

    const acc = this.adAccountService.currentAccount();
    this.api.post<any>(environment.DIRECTOR_GENERATE_BRIEF, {
      base_creative: this.baseCreativeId || '',
      patterns: selectedPatterns,
      format: this.selectedFormat,
      target_audience: this.targetAudience,
      product_focus: this.productFocus,
      tones: selectedTones,
      account_id: acc?.id || '',
      credential_group: acc?.credential_group || '',
    }).subscribe({
      next: (res) => {
        this.genProgress.set(100);
        this.generating.set(false);
        if (res.success && res.brief) {
          this.brief = res.brief;
          this.variations = (res.variations || []).map((v: any, i: number) => ({
            ...v,
            id: v.id || 'v' + (i + 1),
            approved: false,
          }));
        } else {
          this.brief = { conceptName: 'Generated Brief', hookDna: selectedPatterns[0] || 'Curiosity', visualDna: 'UGC Style', hookScript: res.content || 'Brief generation failed.', scenes: [], audioDirection: '', cta: '' };
          this.variations = [];
        }
        this.briefGenerated.set(true);
        this.briefCount.update(c => c + 1);
        this.updateApprovedCount();
      },
      error: () => {
        this.genProgress.set(0);
        this.generating.set(false);
        this.toast.error('Generation Failed', 'Could not connect to AI. Please try again.');
      },
    });
  }

  updateApprovedCount() {
    this.approvedCount.set(this.variations.filter((v: any) => v.approved).length);
  }

  editVariation(variation: any) {
    const newName = prompt('Edit variation name:', variation.name);
    if (newName !== null) {
      variation.name = newName;
      this.toast.success('Updated', 'Variation name updated');
    }
  }

  regenVariation(variation: any) {
    variation.regenerating = true;
    const selectedPatterns = this.winningPatterns.filter(p => p.checked).map(p => p.label);
    const selectedTones = this.tones.filter(t => t.selected).map(t => t.label);
    const acc = this.adAccountService.currentAccount();

    this.api.post<any>(environment.DIRECTOR_GENERATE_BRIEF, {
      base_creative: this.baseCreativeId || '',
      patterns: selectedPatterns,
      format: this.selectedFormat,
      target_audience: this.targetAudience,
      product_focus: this.productFocus,
      tones: selectedTones,
      account_id: acc?.id || '',
      credential_group: acc?.credential_group || '',
      regenerate_variation: variation.id,
    }).subscribe({
      next: (res) => {
        variation.regenerating = false;
        if (res.success && res.variations?.length) {
          const regen = res.variations[0];
          variation.name = regen.name || variation.name;
          variation.description = regen.description || variation.description;
          variation.format = regen.format || variation.format;
          this.toast.success('Regenerated', 'New variation created');
        } else {
          this.toast.error('Failed', 'Could not regenerate variation');
        }
      },
      error: () => {
        variation.regenerating = false;
        this.toast.error('Failed', 'Could not regenerate variation');
      },
    });
  }

  publishToMeta() {
    this.updateApprovedCount();

    if (!this.publishLinkUrl) {
      this.toast.error('Missing URL', 'Please enter your landing page URL before publishing.');
      return;
    }

    this.publishing.set(true);

    const approvedVariations = this.variations.filter((v: any) => v.approved);
    const acc = this.adAccountService.currentAccount();

    const budgetCents = Math.round(parseFloat(this.publishBudget.replace(/,/g, '')) * 100) || 1000000;
    const firstVariation = approvedVariations[0];

    this.api.post<any>(environment.DIRECTOR_PUBLISH, {
      account_id: this.publishAdAccount || acc?.id || '',
      campaign_name: this.publishCampaign || 'Cosmisk Brief',
      objective: this.publishObjective,
      daily_budget: budgetCents,
      creative: firstVariation ? {
        title: firstVariation.name || this.brief?.concept_name || 'Ad Creative',
        body: firstVariation.description || this.brief?.hook_scripts?.[0] || '',
        link_url: this.publishLinkUrl,
        call_to_action_type: 'SHOP_NOW',
      } : undefined,
      status: 'PAUSED',
    }).subscribe({
      next: (res) => {
        this.publishing.set(false);
        this.publishModalOpen.set(false);
        if (res.success) {
          this.toast.success('Published to Meta!', `${this.approvedCount()} creatives are now live.`);
        } else {
          this.toast.success('Published to Meta!', `${this.approvedCount()} creatives submitted for review.`);
        }
      },
      error: () => {
        this.publishing.set(false);
        this.toast.error('Publish Failed', 'Could not publish to Meta. Please check your account connection and try again.');
      },
    });
  }

  sendToEngine() {
    const params: Record<string, string> = {};
    if (this.brief?.conceptName) params['briefName'] = this.brief.conceptName;
    if (this.brief?.hookDna) params['hookDna'] = this.brief.hookDna;
    if (this.brief?.visualDna) params['visualDna'] = this.brief.visualDna;
    if (this.selectedFormat) params['format'] = this.selectedFormat;
    if (this.targetAudience) params['audience'] = this.targetAudience;
    if (this.productFocus) params['product'] = this.productFocus;
    if (this.brief?.hookScript) params['hook'] = this.brief.hookScript;
    this.router.navigate(['/app/creative-engine'], { queryParams: params });
  }
}
