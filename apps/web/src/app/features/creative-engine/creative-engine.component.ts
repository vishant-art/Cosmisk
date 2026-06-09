import { Component, inject, signal, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { CreativeEngineService } from '../../core/services/creative-engine.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { ToastService } from '../../core/services/toast.service';
import type {
  Sprint, SprintStatus, AccountSnapshot, SprintPlan,
  SprintProgress, CreativeJob, SprintPlanItem, SprintTemplate,
  EngineAnalytics, FormatWinRate, CostTrend,
} from '../../core/models/creative-engine.model';
import { getFormatMeta } from '../../core/models/creative-engine.model';

@Component({
  selector: 'app-creative-engine',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-display font-bold text-gray-900">Creative Engine</h1>
          <p class="text-sm text-gray-500 mt-1">Generate and test 100+ creatives/day, powered by your ad data</p>
        </div>
        <button
          (click)="startNewSprint()"
          [disabled]="analyzing() || !adAccountService.currentAccount()"
          class="px-5 py-2.5 bg-accent text-white rounded-xl font-medium text-sm hover:bg-accent/90 transition disabled:opacity-50 flex items-center gap-2">
          <lucide-icon name="rocket" [size]="16"></lucide-icon>
          New Sprint
        </button>
      </div>

      <!-- Usage Summary -->
      @if (usage()) {
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="bg-white rounded-xl border border-gray-200 p-3">
            <p class="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">This Month</p>
            <p class="text-lg font-bold text-gray-900">{{ usage()!.this_month.generations }} <span class="text-xs font-normal text-gray-400">generations</span></p>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-3">
            <p class="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Month Cost</p>
            <p class="text-lg font-bold text-gray-900">{{ (usage()!.this_month.cost_cents / 100) | number:'1.2-2' }} <span class="text-xs font-normal text-gray-400">USD</span></p>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-3">
            <p class="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Total Sprints</p>
            <p class="text-lg font-bold text-gray-900">{{ usage()!.sprints }}</p>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-3">
            <p class="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Providers</p>
            <p class="text-lg font-bold text-gray-900">{{ getConfiguredProviderCount() }} <span class="text-xs font-normal text-gray-400">/ 7 active</span></p>
          </div>
        </div>
      }

      <!-- Sprint Templates (quick start) -->
      @if (showTemplates() && templates().length > 0) {
        <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2">
              <lucide-icon name="layout-template" [size]="18" class="text-accent"></lucide-icon>
              Quick Start Templates
            </h2>
            <button (click)="showTemplates.set(false)" class="text-xs text-gray-400 hover:text-gray-600">Hide</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            @for (tpl of templates(); track tpl.id) {
              <div
                class="border border-gray-200 rounded-xl p-4 hover:border-accent/40 hover:shadow-sm transition cursor-pointer"
                (click)="useTemplate(tpl)">
                <h3 class="text-sm font-semibold text-gray-900 mb-1">{{ tpl.name }}</h3>
                <p class="text-xs text-gray-500 leading-relaxed mb-3">{{ tpl.description }}</p>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-400">{{ tpl.suggested_creatives }} creatives</span>
                  <span class="text-xs text-gray-400">~{{ (tpl.suggested_budget_cents / 100) | number:'1.0-0' }} USD</span>
                </div>
                <div class="flex flex-wrap gap-1 mt-2">
                  @for (fmt of tpl.focus_formats.slice(0, 3); track fmt) {
                    <span class="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-[10px]">{{ getFormatLabel(fmt) }}</span>
                  }
                  @if (tpl.focus_formats.length > 3) {
                    <span class="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">+{{ tpl.focus_formats.length - 3 }}</span>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Analytics Dashboard -->
      @if (analytics()) {
        <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2">
              <lucide-icon name="bar-chart-2" [size]="18" class="text-accent"></lucide-icon>
              Sprint Analytics
            </h2>
            <span class="text-xs text-gray-400">{{ analytics()!.total_sprints }} sprints &middot; {{ analytics()!.total_assets }} assets</span>
          </div>

          <!-- Format Win Rates -->
          @if (analytics()!.format_win_rates.length > 0) {
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Format Performance</h3>
            <div class="space-y-2 mb-6">
              @for (fmt of analytics()!.format_win_rates; track fmt.format) {
                <div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                  <span class="text-sm font-medium text-gray-900 w-36 truncate">{{ getFormatLabel(fmt.format) }}</span>
                  <div class="flex-1">
                    <div class="w-full bg-gray-200 rounded-full h-1.5">
                      <div class="bg-accent rounded-full h-1.5 transition-all"
                        [style.width.%]="getFormatBarWidth(fmt)"></div>
                    </div>
                  </div>
                  <span class="text-xs text-gray-500 w-16 text-right">{{ fmt.total_assets }} assets</span>
                  @if (fmt.avg_actual_roas > 0) {
                    <span class="text-xs font-medium w-16 text-right"
                      [class]="fmt.avg_actual_roas >= 2 ? 'text-green-600' : 'text-gray-600'">
                      {{ fmt.avg_actual_roas }}x
                    </span>
                  } @else {
                    <span class="text-xs text-gray-400 w-16 text-right">--</span>
                  }
                </div>
              }
            </div>
          }

          <!-- Cost Trends -->
          @if (analytics()!.cost_trends.length > 0) {
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Cost Per Sprint</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              @for (trend of analytics()!.cost_trends.slice(-4); track trend.sprint_id) {
                <div class="bg-gray-50 rounded-xl p-3">
                  <p class="text-xs text-gray-500 truncate mb-0.5">{{ trend.name }}</p>
                  <p class="text-sm font-bold text-gray-900">{{ (trend.actual_cents / 100) | number:'1.2-2' }}</p>
                  <p class="text-[10px]" [class]="trend.efficiency_pct > 0 ? 'text-green-600' : 'text-red-500'">
                    {{ trend.efficiency_pct > 0 ? trend.efficiency_pct + '% under budget' : Math.abs(trend.efficiency_pct) + '% over budget' }}
                  </p>
                </div>
              }
            </div>
          }

          <!-- Prediction Accuracy -->
          @if (analytics()!.prediction_accuracy) {
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">AI Prediction Accuracy</h3>
            <div class="bg-gray-50 rounded-xl p-4 mb-6">
              <div class="flex items-center gap-6">
                <div>
                  <p class="text-xs text-gray-500">High-predicted avg ROAS</p>
                  <p class="text-lg font-bold text-green-600">{{ analytics()!.prediction_accuracy!.top_predicted_avg_roas }}x</p>
                </div>
                <div class="text-gray-300">vs</div>
                <div>
                  <p class="text-xs text-gray-500">Low-predicted avg ROAS</p>
                  <p class="text-lg font-bold text-gray-600">{{ analytics()!.prediction_accuracy!.bottom_predicted_avg_roas }}x</p>
                </div>
                <div class="ml-auto text-right">
                  <p class="text-xs text-gray-500">Lift</p>
                  <p class="text-lg font-bold" [class]="analytics()!.prediction_accuracy!.prediction_useful ? 'text-green-600' : 'text-red-500'">
                    {{ analytics()!.prediction_accuracy!.lift_pct }}%
                  </p>
                </div>
              </div>
              <p class="text-xs text-gray-400 mt-2">Based on {{ analytics()!.prediction_accuracy!.total_compared }} tracked creatives</p>
            </div>
          }

          <!-- Winning DNA -->
          @if (analytics()!.winning_dna.length > 0) {
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Winning Hook Patterns</h3>
            <div class="flex flex-wrap gap-2">
              @for (dna of analytics()!.winning_dna.slice(0, 6); track dna.hook_combo) {
                <div class="px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
                  <span class="text-xs font-medium text-violet-800">{{ dna.hook_combo }}</span>
                  <span class="text-[10px] text-violet-500 ml-1">{{ dna.avg_roas }}x ROAS ({{ dna.count }})</span>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- No account connected -->
      @if (!adAccountService.currentAccount()) {
        <div class="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <lucide-icon name="link" [size]="48" class="text-gray-300 mx-auto mb-4"></lucide-icon>
          <h3 class="text-lg font-semibold text-gray-700 mb-2">Connect an Ad Account</h3>
          <p class="text-sm text-gray-500">Connect your Meta ad account to start creating data-backed creatives.</p>
        </div>
      }

      <!-- Analyzing State -->
      @if (analyzing()) {
        <div class="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div class="w-12 h-12 border-3 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-4"></div>
          <h3 class="text-lg font-semibold text-gray-700 mb-2">Analyzing Your Ad Account</h3>
          <p class="text-sm text-gray-500">Fetching top performers, benchmarks, and fatigue signals...</p>
        </div>
      }

      <!-- Snapshot Review (after analyze, before plan) -->
      @if (snapshot() && !currentPlan()) {
        <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <lucide-icon name="search" [size]="20" class="text-accent"></lucide-icon>
            Account Analysis
          </h2>

          <!-- Benchmarks -->
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div class="bg-gray-50 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">Total Spend</p>
              <p class="text-lg font-bold text-gray-900">{{ snapshot()!.benchmarks.totalSpend | number:'1.0-0' }}</p>
            </div>
            <div class="bg-gray-50 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">Avg ROAS</p>
              <p class="text-lg font-bold text-gray-900">{{ snapshot()!.benchmarks.avgRoas }}x</p>
            </div>
            <div class="bg-gray-50 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">Avg CTR</p>
              <p class="text-lg font-bold text-gray-900">{{ snapshot()!.benchmarks.avgCtr }}%</p>
            </div>
            <div class="bg-gray-50 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">Avg CPA</p>
              <p class="text-lg font-bold text-gray-900">{{ snapshot()!.benchmarks.avgCpa | number:'1.0-2' }}</p>
            </div>
            <div class="bg-gray-50 rounded-xl p-4">
              <p class="text-xs text-gray-500 mb-1">Active Ads</p>
              <p class="text-lg font-bold text-gray-900">{{ snapshot()!.topAds.length }}</p>
            </div>
          </div>

          <!-- Top Performers -->
          <h3 class="text-sm font-semibold text-gray-700 mb-3">Top Performers</h3>
          <div class="space-y-2 mb-6 max-h-60 overflow-y-auto">
            @for (ad of snapshot()!.topAds.slice(0, 10); track ad.id) {
              <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                @if (ad.thumbnail_url) {
                  <img [src]="ad.thumbnail_url" class="w-10 h-10 rounded object-cover" />
                } @else {
                  <div class="w-10 h-10 rounded bg-gray-200 flex items-center justify-center">
                    <lucide-icon name="image" [size]="16" class="text-gray-400"></lucide-icon>
                  </div>
                }
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 truncate">{{ ad.name }}</p>
                  <p class="text-xs text-gray-500">{{ ad.format }} &middot; {{ ad.days_active }}d active</p>
                </div>
                <div class="text-right">
                  <p class="text-sm font-bold" [class]="ad.roas >= 2 ? 'text-green-600' : ad.roas >= 1 ? 'text-yellow-600' : 'text-red-500'">
                    {{ ad.roas }}x ROAS
                  </p>
                  <p class="text-xs text-gray-500">{{ ad.spend | number:'1.0-0' }} spend</p>
                </div>
              </div>
            }
          </div>

          <!-- Fatigue Signals -->
          @if (snapshot()!.fatigueSignals.length > 0) {
            <h3 class="text-sm font-semibold text-gray-700 mb-2">Fatigue Signals</h3>
            <div class="space-y-2 mb-6">
              @for (signal of snapshot()!.fatigueSignals; track signal) {
                <div class="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <lucide-icon name="alert-triangle" [size]="16" class="text-amber-500 mt-0.5 shrink-0"></lucide-icon>
                  <p class="text-sm text-amber-800">{{ signal }}</p>
                </div>
              }
            </div>
          }

          <!-- Sprint Name + Generate Plan -->
          <div class="flex items-center gap-3 pt-4 border-t border-gray-100">
            <input
              [(ngModel)]="sprintName"
              placeholder="Sprint name (e.g., March Week 1)"
              class="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
            <button
              (click)="generatePlan()"
              [disabled]="planLoading()"
              class="px-5 py-2.5 bg-accent text-white rounded-xl font-medium text-sm hover:bg-accent/90 transition disabled:opacity-50 flex items-center gap-2">
              @if (planLoading()) {
                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              }
              Generate Plan
            </button>
          </div>
        </div>
      }

      <!-- Plan Review -->
      @if (currentPlan() && planSprintId()) {
        <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <lucide-icon name="clipboard-list" [size]="20" class="text-accent"></lucide-icon>
              Sprint Plan
            </h2>
            <div class="text-sm text-gray-500">
              {{ currentPlan()!.totalCreatives }} creatives &middot;
              Est. {{ (currentPlan()!.totalEstimatedCents / 100) | number:'1.2-2' }} {{ adAccountService.currentAccount()?.currency || 'USD' }}
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            @for (item of currentPlan()!.items; track item.format) {
              <div class="border border-gray-200 rounded-xl p-4">
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <lucide-icon [name]="getFormatIcon(item.format)" [size]="18" class="text-accent"></lucide-icon>
                  </div>
                  <div>
                    <p class="text-sm font-semibold text-gray-900">{{ getFormatLabel(item.format) }}</p>
                    <p class="text-xs text-gray-500">{{ item.count }} creatives &middot; {{ (item.estimated_cost_cents / 100) | number:'1.2-2' }}</p>
                  </div>
                </div>
                <p class="text-xs text-gray-600 leading-relaxed">{{ item.rationale }}</p>
              </div>
            }
          </div>

          <div class="flex items-center gap-3">
            <button
              (click)="approvePlan()"
              [disabled]="approving()"
              class="px-5 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2">
              <lucide-icon name="check" [size]="16"></lucide-icon>
              Approve & Create Jobs
            </button>
            <button
              (click)="resetFlow()"
              class="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition">
              Cancel
            </button>
          </div>
        </div>
      }

      <!-- Sprint List -->
      @if (!analyzing() && !snapshot() && sprints().length > 0) {
        <div class="space-y-4">
          @for (sprint of sprints(); track sprint.id) {
            <div
              class="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-sm transition cursor-pointer"
              (click)="viewSprint(sprint)">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-base font-semibold text-gray-900">{{ sprint.name }}</h3>
                  <p class="text-xs text-gray-500 mt-1">
                    {{ sprint.total_creatives }} creatives &middot;
                    Created {{ sprint.created_at | date:'mediumDate' }}
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  @if (sprint.status === 'generating') {
                    <div class="flex items-center gap-2">
                      <div class="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin"></div>
                      <span class="text-xs text-accent font-medium">{{ sprint.completed_creatives }}/{{ sprint.total_creatives }}</span>
                    </div>
                  }
                  <span class="px-3 py-1 rounded-full text-xs font-medium"
                    [class]="getStatusClass(sprint.status)">
                    {{ sprint.status }}
                  </span>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Empty State -->
      @if (!analyzing() && !snapshot() && sprints().length === 0 && adAccountService.currentAccount()) {
        <div class="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <lucide-icon name="rocket" [size]="48" class="text-gray-300 mx-auto mb-4"></lucide-icon>
          <h3 class="text-lg font-semibold text-gray-700 mb-2">No Sprints Yet</h3>
          <p class="text-sm text-gray-500 mb-6">Start your first Creative Sprint to generate data-backed ad creatives at scale.</p>
          <button
            (click)="startNewSprint()"
            class="px-5 py-2.5 bg-accent text-white rounded-xl font-medium text-sm hover:bg-accent/90 transition">
            Start First Sprint
          </button>
        </div>
      }
    </div>
  `,
})
export default class CreativeEngineComponent implements OnInit {
  private engineService = inject(CreativeEngineService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  adAccountService = inject(AdAccountService);
  briefContext = signal<{ name?: string; hook?: string; hookDna?: string; visualDna?: string; format?: string; audience?: string; product?: string } | null>(null);

  sprints = this.engineService.sprints;
  analyzing = this.engineService.analyzing;
  planLoading = signal(false);
  approving = signal(false);
  usage = signal<any>(null);
  templates = signal<SprintTemplate[]>([]);
  showTemplates = signal(true);
  analytics = signal<EngineAnalytics | null>(null);

  snapshot = signal<AccountSnapshot | null>(null);
  currentPlan = signal<SprintPlan | null>(null);
  planSprintId = signal<string | null>(null);
  sprintName = '';
  Math = Math;

  private accountEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    if (acc) {
      this.engineService.loadSprints();
    }
  }, { allowSignalWrites: true });

  ngOnInit() {
    this.engineService.loadSprints();
    this.loadUsage();
    this.loadTemplates();
    this.loadAnalytics();

    // Handle Director Lab context via query params
    this.route.queryParams.subscribe(params => {
      if (params['briefName'] || params['hook'] || params['hookDna']) {
        this.briefContext.set({
          name: params['briefName'],
          hook: params['hook'],
          hookDna: params['hookDna'],
          visualDna: params['visualDna'],
          format: params['format'],
          audience: params['audience'],
          product: params['product'],
        });
        this.sprintName = params['briefName'] ? `Sprint: ${params['briefName']}` : '';
        // Auto-start sprint creation
        this.showTemplates.set(false);
        this.toast.info('Brief Imported', 'Director Lab brief context loaded. Click "New Sprint" to create.');
      }
    });
  }

  loadUsage() {
    this.engineService.getUsage().subscribe({
      next: (res) => {
        if (res.success) this.usage.set(res.usage);
      },
      error: () => this.toast.error('Load Failed', 'Could not load usage data.'),
    });
  }

  getConfiguredProviderCount(): number {
    const u = this.usage();
    if (!u?.providers) return 0;
    return Object.values(u.providers).filter(Boolean).length;
  }

  loadTemplates() {
    this.engineService.getTemplates().subscribe({
      next: (res) => {
        if (res.success) this.templates.set(res.templates);
      },
      error: () => {},
    });
  }

  loadAnalytics() {
    this.engineService.getAnalytics().subscribe({
      next: (res) => {
        if (res.success) this.analytics.set(res.analytics);
      },
      error: () => {},
    });
  }

  useTemplate(tpl: SprintTemplate) {
    const acc = this.adAccountService.currentAccount();
    if (!acc) return;

    this.analyzing.set(true);
    this.snapshot.set(null);
    this.currentPlan.set(null);
    this.planSprintId.set(null);
    this.sprintName = tpl.name;
    this.showTemplates.set(false);

    this.engineService.analyze(acc.id, acc.credential_group, acc.currency).subscribe({
      next: (res) => {
        this.analyzing.set(false);
        if (res.success) {
          this.snapshot.set(res.snapshot);
          // Auto-generate plan with template preferences
          this.planLoading.set(true);
          this.engineService.generatePlan(
            res.snapshot,
            {
              account_id: acc.id,
              currency: acc.currency || 'INR',
              target_formats: tpl.focus_formats,
              total_creatives: tpl.suggested_creatives,
              budget_cents: tpl.suggested_budget_cents,
            },
            tpl.name,
          ).subscribe({
            next: (planRes) => {
              this.planLoading.set(false);
              if (planRes.success) {
                this.currentPlan.set(planRes.plan);
                this.planSprintId.set(planRes.sprint_id);
                this.engineService.loadSprints();
              }
            },
            error: (err) => {
              this.planLoading.set(false);
              this.toast.error('Plan Failed', err.error?.error || 'Could not generate plan');
            },
          });
        }
      },
      error: (err) => {
        this.analyzing.set(false);
        this.toast.error('Analysis Failed', err.error?.error || 'Could not analyze account');
      },
    });
  }

  getFormatBarWidth(fmt: FormatWinRate): number {
    const maxAssets = Math.max(...this.analytics()!.format_win_rates.map(f => f.total_assets), 1);
    return (fmt.total_assets / maxAssets) * 100;
  }

  startNewSprint() {
    const acc = this.adAccountService.currentAccount();
    if (!acc) return;

    this.analyzing.set(true);
    this.snapshot.set(null);
    this.currentPlan.set(null);
    this.planSprintId.set(null);

    // Preserve brief name from Director Lab if available
    const ctx = this.briefContext();
    if (!ctx?.name) this.sprintName = '';

    this.engineService.analyze(acc.id, acc.credential_group, acc.currency).subscribe({
      next: (res) => {
        this.analyzing.set(false);
        if (res.success) {
          this.snapshot.set(res.snapshot);
          this.sprintName = ctx?.name
            ? `Sprint: ${ctx.name}`
            : `Sprint ${new Date().toLocaleDateString()}`;
        }
      },
      error: (err) => {
        this.analyzing.set(false);
        this.toast.error('Analysis Failed', err.error?.error || 'Could not analyze account');
      },
    });
  }

  generatePlan() {
    const snap = this.snapshot();
    if (!snap) return;
    const acc = this.adAccountService.currentAccount();
    const ctx = this.briefContext();

    const preferences: Record<string, any> = {
      account_id: acc?.id,
      currency: acc?.currency || 'INR',
    };

    // Pass Director Lab context if available
    if (ctx) {
      if (ctx.hookDna) preferences['preferred_hook_dna'] = ctx.hookDna;
      if (ctx.visualDna) preferences['preferred_visual_dna'] = ctx.visualDna;
      if (ctx.format) preferences['preferred_format'] = ctx.format;
      if (ctx.audience) preferences['target_audience'] = ctx.audience;
      if (ctx.product) preferences['product_focus'] = ctx.product;
      if (ctx.hook) preferences['hook_text'] = ctx.hook;
    }

    this.planLoading.set(true);
    this.engineService.generatePlan(
      snap,
      preferences,
      this.sprintName || `Sprint ${new Date().toLocaleDateString()}`,
    ).subscribe({
      next: (res) => {
        this.planLoading.set(false);
        if (res.success) {
          this.currentPlan.set(res.plan);
          this.planSprintId.set(res.sprint_id);
          this.engineService.loadSprints();
        }
      },
      error: (err) => {
        this.planLoading.set(false);
        this.toast.error('Plan Failed', err.error?.error || 'Could not generate plan');
      },
    });
  }

  approvePlan() {
    const sprintId = this.planSprintId();
    if (!sprintId) return;

    this.approving.set(true);
    this.engineService.approveSprint(sprintId).subscribe({
      next: (res) => {
        this.approving.set(false);
        if (res.success) {
          this.toast.success('Sprint Approved', `${res.jobs_created} jobs created and ready for generation.`);
          this.resetFlow();
          this.engineService.loadSprints();
        }
      },
      error: (err) => {
        this.approving.set(false);
        this.toast.error('Approval Failed', err.error?.error || 'Could not approve sprint');
      },
    });
  }

  resetFlow() {
    this.snapshot.set(null);
    this.currentPlan.set(null);
    this.planSprintId.set(null);
    this.sprintName = '';
  }

  viewSprint(sprint: Sprint) {
    this.router.navigate(['/app/creative-engine', sprint.id]);
  }

  getFormatLabel(format: string): string {
    return getFormatMeta(format).label;
  }

  getFormatIcon(format: string): string {
    return getFormatMeta(format).icon;
  }

  getStatusClass(status: SprintStatus): string {
    const map: Record<string, string> = {
      analyzing: 'bg-blue-50 text-blue-700',
      planning: 'bg-purple-50 text-purple-700',
      approved: 'bg-indigo-50 text-indigo-700',
      generating: 'bg-amber-50 text-amber-700',
      reviewing: 'bg-cyan-50 text-cyan-700',
      published: 'bg-green-50 text-green-700',
      archived: 'bg-gray-100 text-gray-600',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  }
}
