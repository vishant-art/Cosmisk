const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { InsightCardComponent } from '../../shared/components/insight-card/insight-card.component';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { AreaChartComponent } from '../../shared/components/area-chart/area-chart.component';
import { LakhCrorePipe } from '../../shared/pipes/lakh-crore.pipe';
import { Creative, CreativeFormat, CreativeStatus, HookDnaType, VisualDnaType } from '../../core/models/creative.model';
import { AiInsight } from '../../core/models/insight.model';
import { LucideAngularModule } from 'lucide-angular';
import { AdAccountService } from '../../core/services/ad-account.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { CreativeEngineService } from '../../core/services/creative-engine.service';
import { DateRangeService } from '../../core/services/date-range.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, KpiCardComponent, InsightCardComponent, DnaBadgeComponent, StatusBadgeComponent, AreaChartComponent, LakhCrorePipe, LucideAngularModule],
  template: `
    <!-- Hero: Generate Creative Assets -->
    <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4338ca] p-8 mb-8">
      <div class="absolute inset-0 opacity-10">
        <div class="absolute top-4 right-8 w-64 h-64 bg-white rounded-full blur-3xl"></div>
        <div class="absolute bottom-4 left-12 w-48 h-48 bg-accent rounded-full blur-3xl"></div>
      </div>
      <div class="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h2 class="text-2xl md:text-3xl font-display text-white m-0 mb-2">What will you create today?</h2>
          <p class="text-sm text-indigo-200 font-body m-0 max-w-lg">
            Generate ad scripts, video concepts, static creatives, and carousels — all powered by your brand's performance intelligence.
          </p>
        </div>
        <div class="flex flex-col sm:flex-row gap-3">
          <a routerLink="/app/creative-engine"
            class="px-6 py-3 bg-white text-[#312e81] rounded-xl text-sm font-body font-bold hover:bg-indigo-50 transition-all no-underline flex items-center gap-2 shadow-lg">
            <lucide-icon name="rocket" [size]="18"></lucide-icon>
            Creative Engine
          </a>
          <a routerLink="/app/ugc-studio"
            class="px-6 py-3 bg-white/10 text-white border border-white/20 rounded-xl text-sm font-body font-semibold hover:bg-white/20 transition-all no-underline flex items-center gap-2 backdrop-blur-sm">
            <lucide-icon name="sparkles" [size]="18"></lucide-icon>
            Generate Ads
          </a>
          <a routerLink="/app/director-lab"
            class="px-6 py-3 bg-white/10 text-white border border-white/20 rounded-xl text-sm font-body font-semibold hover:bg-white/20 transition-all no-underline flex items-center gap-2 backdrop-blur-sm">
            <lucide-icon name="wand-2" [size]="18"></lucide-icon>
            Create Brief
          </a>
        </div>
      </div>
    </div>

    <!-- Active Sprints Widget -->
    @if (activeSprints().length > 0) {
      <div class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <lucide-icon name="rocket" [size]="16" class="text-accent"></lucide-icon>
            <h3 class="text-sm font-display font-semibold text-navy m-0">Active Sprints</h3>
          </div>
          <a routerLink="/app/creative-engine" class="text-xs text-accent font-body hover:underline no-underline">View All</a>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          @for (sprint of activeSprints(); track sprint.id) {
            <a [routerLink]="'/app/creative-engine/' + sprint.id" class="no-underline">
              <div class="bg-white rounded-xl shadow-card p-4 hover:shadow-md transition-shadow">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-body font-semibold text-navy truncate max-w-[180px]">{{ sprint.name }}</span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-body font-medium"
                    [ngClass]="{
                      'bg-blue-100 text-blue-700': sprint.status === 'generating',
                      'bg-amber-100 text-amber-700': sprint.status === 'planning' || sprint.status === 'approved',
                      'bg-green-100 text-green-700': sprint.status === 'reviewing',
                      'bg-gray-100 text-gray-600': sprint.status === 'analyzing'
                    }">
                    {{ sprint.status }}
                  </span>
                </div>
                <div class="w-full bg-gray-100 rounded-full h-1.5 mb-2">
                  <div class="bg-accent rounded-full h-1.5 transition-all"
                    [style.width.%]="sprint.total_creatives > 0 ? (sprint.completed_creatives / sprint.total_creatives * 100) : 0">
                  </div>
                </div>
                <div class="flex items-center justify-between text-xs text-gray-500 font-body">
                  <span>{{ sprint.completed_creatives }}/{{ sprint.total_creatives }} done</span>
                  @if (sprint.actual_cost_cents > 0) {
                    <span>{{ '$' + (sprint.actual_cost_cents / 100).toFixed(2) }}</span>
                  }
                </div>
              </div>
            </a>
          }
        </div>
      </div>
    }

    <!-- Smart Action Cards -->
    @if (!loading() && smartActions().length > 0) {
      <div class="mb-8">
        <div class="flex items-center gap-2 mb-3">
          <lucide-icon name="lightbulb" [size]="16" class="text-amber-500"></lucide-icon>
          <h3 class="text-sm font-display font-semibold text-navy m-0">Recommended Actions</h3>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          @for (action of smartActions(); track action.id) {
            <a [routerLink]="action.route" class="no-underline">
              <div class="bg-white rounded-xl border-l-4 shadow-card p-4 hover:shadow-md transition-shadow"
                [style.border-left-color]="action.color">
                <div class="flex items-start gap-3">
                  <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" [style.background-color]="action.color + '15'">
                    <lucide-icon [name]="action.icon" [size]="18" [style.color]="action.color"></lucide-icon>
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-body font-semibold text-navy m-0 mb-0.5">{{ action.title }}</p>
                    <p class="text-xs text-gray-500 font-body m-0 leading-relaxed">{{ action.description }}</p>
                  </div>
                </div>
              </div>
            </a>
          }
        </div>
      </div>
    }

    <!-- Performance KPIs -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      @if (loading()) {
        @for (i of [1,2,3,4]; track i) {
          <div class="bg-white rounded-card shadow-card p-5 animate-pulse">
            <div class="h-3 bg-gray-200 rounded w-20 mb-3"></div>
            <div class="h-6 bg-gray-200 rounded w-28 mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-16"></div>
          </div>
        }
      } @else {
        <a routerLink="/app/analytics" class="no-underline">
          <app-kpi-card
            title="Total Spend"
            [value]="kpi().spend.value"
            [change]="kpi().spend.change"
            [changeDisplay]="formatChange(kpi().spend.change, '%')"
            [isCurrency]="true"
            [sparkline]="kpi().spend.sparkline" />
        </a>
        <a routerLink="/app/analytics" class="no-underline">
          <app-kpi-card
            title="Revenue"
            [value]="kpi().revenue.value"
            [change]="kpi().revenue.change"
            [changeDisplay]="formatChange(kpi().revenue.change, '%')"
            [isCurrency]="true"
            [sparkline]="kpi().revenue.sparkline"
            color="green" />
        </a>
        <a routerLink="/app/creative-cockpit" class="no-underline">
          <app-kpi-card
            title="ROAS"
            [value]="kpi().roas.value"
            [change]="kpi().roas.change"
            [changeDisplay]="formatChange(kpi().roas.change, 'x')"
            suffix="x"
            [sparkline]="kpi().roas.sparkline"
            [color]="kpi().roas.value >= 3 ? 'green' : kpi().roas.value >= 2 ? 'yellow' : 'red'" />
        </a>
        <a routerLink="/app/creative-cockpit" class="no-underline">
          <app-kpi-card
            title="Active Creatives"
            [value]="kpi().activeCreatives.value"
            [subtitle]="kpi().activeCreatives.winning + ' winning · ' + kpi().activeCreatives.stable + ' stable · ' + kpi().activeCreatives.fatiguing + ' fatiguing'" />
        </a>
      }
    </div>

    <!-- Chart + AI Insights Row -->
    <div class="grid lg:grid-cols-5 gap-6 mb-8">
      <!-- Performance Chart -->
      <div class="lg:col-span-3 card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-card-title font-display text-navy m-0">Performance Trend</h3>
          <div class="flex gap-1">
            @for (metric of chartMetrics; track metric) {
              <button
                (click)="activeChartMetric.set(metric)"
                class="px-3 py-1 rounded-pill text-xs font-body font-medium transition-all border-0 cursor-pointer"
                [ngClass]="activeChartMetric() === metric ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
                {{ metric }}
              </button>
            }
          </div>
        </div>

        @if (chartData().length > 0) {
          <app-area-chart
            [labels]="chartLabels()"
            [values]="chartValues()"
            [label]="activeChartMetric()"
            [color]="chartColor()"
            [suffix]="chartSuffix()"
            [height]="208" />
        } @else {
          <div class="flex flex-col items-center justify-center h-52 text-center">
            <lucide-icon name="bar-chart-3" [size]="28" class="text-gray-300 mb-2"></lucide-icon>
            <p class="text-sm text-gray-400 font-body m-0">No chart data available for this period</p>
            <p class="text-xs text-gray-300 font-body m-0 mt-1">Data will appear once your ads start running</p>
          </div>
        }
      </div>

      <!-- AI Insights -->
      <div class="lg:col-span-2 card">
        <div class="flex items-center gap-2 mb-4">
          <lucide-icon name="sparkles" [size]="18" class="text-accent"></lucide-icon>
          <h3 class="text-card-title font-display text-navy m-0">AI Insights</h3>
        </div>
        <p class="text-xs text-gray-500 font-body mb-4 m-0 flex items-center gap-2">Today's Intelligence <span class="live-dot"></span></p>

        @if (insightsLoading()) {
          <div class="space-y-3">
            @for (i of [1,2,3]; track i) {
              <div class="animate-pulse p-3 bg-gray-50 rounded-lg">
                <div class="h-3 bg-gray-200 rounded w-24 mb-2"></div>
                <div class="h-3 bg-gray-200 rounded w-full"></div>
              </div>
            }
          </div>
        } @else {
          <div class="space-y-3">
            @for (insight of insights(); track insight.id) {
              <app-insight-card [insight]="insight" />
            }
            @if (insights().length === 0) {
              <p class="text-xs text-gray-400 font-body text-center py-4">Connect an ad account to see insights</p>
            }
          </div>
        }

        <a routerLink="/app/ai-studio" class="block text-center text-sm text-accent font-body font-semibold mt-4 hover:underline no-underline">
          Ask Cosmisk AI <lucide-icon name="arrow-right" [size]="14" class="inline-block ml-1"></lucide-icon>
        </a>
      </div>
    </div>

    <!-- Top Performing Creatives -->
    <div class="card mb-8">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-card-title font-display text-navy m-0">Top Performing Creatives</h3>
        <a routerLink="/app/creative-cockpit" class="text-sm text-accent font-body font-semibold hover:underline no-underline">
          View All <lucide-icon name="arrow-right" [size]="14" class="inline-block ml-1"></lucide-icon>
        </a>
      </div>

      <div class="flex gap-1 mb-4">
        @for (tab of tableTabs; track tab) {
          <button
            (click)="switchTableTab(tab)"
            class="px-3 py-1.5 rounded-pill text-xs font-body font-medium transition-all border-0 cursor-pointer"
            [ngClass]="activeTableTab === tab ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
            By {{ tab }}
          </button>
        }
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm font-body">
          <thead>
            <tr class="border-b border-divider">
              <th class="text-left py-3 px-2 text-xs text-gray-500 font-medium">#</th>
              <th class="text-left py-3 px-2 text-xs text-gray-500 font-medium">Creative</th>
              <th class="text-left py-3 px-2 text-xs text-gray-500 font-medium">Hook DNA</th>
              <th class="text-left py-3 px-2 text-xs text-gray-500 font-medium">Visual DNA</th>
              <th class="text-right py-3 px-2 text-xs text-gray-500 font-medium">ROAS</th>
              <th class="text-right py-3 px-2 text-xs text-gray-500 font-medium">Spend</th>
              <th class="text-right py-3 px-2 text-xs text-gray-500 font-medium">CTR</th>
              <th class="text-left py-3 px-2 text-xs text-gray-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            @if (topCreatives.length === 0) {
              <tr>
                <td colspan="8" class="py-12 text-center">
                  <lucide-icon name="image" [size]="32" class="text-gray-300 mx-auto mb-3"></lucide-icon>
                  <p class="text-sm text-gray-500 font-medium mb-1">No creatives found</p>
                  <p class="text-xs text-gray-400">Connect an ad account and run campaigns to see your top-performing creatives here.</p>
                </td>
              </tr>
            } @else {
              @for (creative of topCreatives; track creative.id; let i = $index) {
                <tr
                  class="border-b border-divider row-hover transition-colors cursor-pointer"
                  (click)="onCreativeClick(creative)">
                  <td class="py-3 px-2 text-gray-400 font-mono text-xs">{{ i + 1 }}</td>
                  <td class="py-3 px-2">
                    <div class="flex items-center gap-3">
                      <img [src]="creative.thumbnailUrl" [alt]="creative.name" class="w-10 h-10 rounded-lg object-cover bg-gray-100">
                      <span class="font-medium text-navy truncate max-w-[160px]">{{ creative.name }}</span>
                    </div>
                  </td>
                  <td class="py-3 px-2">
                    @for (hook of creative.dna.hook; track hook) {
                      <app-dna-badge [label]="hook" type="hook" />
                    }
                  </td>
                  <td class="py-3 px-2">
                    @for (visual of creative.dna.visual.slice(0, 1); track visual) {
                      <app-dna-badge [label]="visual" type="visual" />
                    }
                  </td>
                  <td class="py-3 px-2 text-right font-mono font-bold" [ngClass]="creative.metrics.roas >= 3 ? 'text-green-600' : creative.metrics.roas >= 2 ? 'text-yellow-600' : 'text-red-600'">
                    {{ creative.metrics.roas }}x
                  </td>
                  <td class="py-3 px-2 text-right font-mono text-gray-600">{{ creative.metrics.spend | lakhCrore }}</td>
                  <td class="py-3 px-2 text-right font-mono text-gray-600">{{ creative.metrics.ctr }}%</td>
                  <td class="py-3 px-2">
                    <app-status-badge [status]="creative.status" />
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Creative Intelligence Actions -->
    <div class="grid md:grid-cols-4 gap-5">
      @for (action of quickActions; track action.title) {
        <a [routerLink]="action.route" class="card card-lift glow-on-hover !p-5 flex flex-col items-center text-center no-underline group">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mb-3"
            [ngClass]="action.bgClass">
            <lucide-icon [name]="action.icon" [size]="22" [class]="action.iconClass"></lucide-icon>
          </div>
          <h4 class="text-sm font-body font-semibold text-navy m-0 mb-1">{{ action.title }}</h4>
          <p class="text-xs text-gray-500 font-body m-0">{{ action.description }}</p>
        </a>
      }
    </div>
  `
})
export default class DashboardComponent implements OnInit {
  private adAccountService = inject(AdAccountService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private engineService = inject(CreativeEngineService);
  private dateRangeService = inject(DateRangeService);
  private router = inject(Router);

  loading = signal(true);
  insightsLoading = signal(true);
  activeSprints = signal<any[]>([]);
  private loadingTimeout: ReturnType<typeof setTimeout> | null = null;

  kpi = signal({
    spend: { value: 0, change: 0, sparkline: [] as number[] },
    revenue: { value: 0, change: 0, sparkline: [] as number[] },
    roas: { value: 0, change: 0, sparkline: [] as number[] },
    activeCreatives: { value: 0, winning: 0, stable: 0, fatiguing: 0 },
  });

  insights = signal<AiInsight[]>([]);
  chartData = signal<{ date: string; roas: number; spend: number; revenue: number; ctr: number; cpa: number }[]>([]);
  allCreatives = signal<Creative[]>([]);
  topCreatives: Creative[] = [];

  activeChartMetric = signal('ROAS');
  chartMetrics = ['ROAS', 'CTR', 'CPA', 'Spend'];
  activeTableTab = 'ROAS';
  tableTabs = ['ROAS', 'Spend', 'CTR'];

  private accountEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    const datePreset = this.dateRangeService.datePreset();
    if (acc) {
      this.loadKpis(acc.id, acc.credential_group, datePreset);
      this.loadTopAds(acc.id, acc.credential_group, datePreset);
      this.loadChartData(acc.id, acc.credential_group, datePreset);
      this.loadInsights(acc.id, acc.credential_group);
    } else {
      this.loading.set(false);
      this.insightsLoading.set(false);
    }
  }, { allowSignalWrites: true });

  quickActions = [
    { icon: 'rocket', title: 'Creative Engine', description: 'Batch generate 100+ creatives', route: '/app/creative-engine', bgClass: 'bg-indigo-100', iconClass: 'text-indigo-600' },
    { icon: 'video', title: 'UGC Scripts', description: 'AI-powered ad scripts', route: '/app/ugc-studio', bgClass: 'bg-violet-100', iconClass: 'text-violet-600' },
    { icon: 'image', title: 'Static Ads', description: 'Graphics & carousels', route: '/app/graphic-studio', bgClass: 'bg-blue-100', iconClass: 'text-blue-600' },
    { icon: 'brain', title: 'Ask AI', description: 'What\'s working?', route: '/app/ai-studio', bgClass: 'bg-amber-100', iconClass: 'text-amber-600' },
  ];

  smartActions = computed(() => {
    const actions: { id: string; title: string; description: string; icon: string; color: string; route: string; priority: number }[] = [];
    const k = this.kpi();
    const creatives = this.allCreatives();
    const sprints = this.activeSprints();

    // 1. Fatiguing ads need replacement
    if (k.activeCreatives.fatiguing > 0) {
      actions.push({
        id: 'fatigue',
        title: `${k.activeCreatives.fatiguing} ad${k.activeCreatives.fatiguing > 1 ? 's' : ''} fatiguing`,
        description: `Create fresh creatives to replace underperformers before CPA rises.`,
        icon: 'alert-triangle',
        color: '#F59E0B',
        route: '/app/creative-engine',
        priority: 10,
      });
    }

    // 2. Winning format to double down on
    if (creatives.length >= 3) {
      const formatMap = new Map<string, { count: number; totalRoas: number }>();
      for (const c of creatives) {
        const fmt = c.format || 'unknown';
        const existing = formatMap.get(fmt) || { count: 0, totalRoas: 0 };
        existing.count++;
        existing.totalRoas += c.metrics.roas;
        formatMap.set(fmt, existing);
      }
      let bestFormat = '';
      let bestAvgRoas = 0;
      for (const [fmt, data] of formatMap) {
        const avg = data.totalRoas / data.count;
        if (avg > bestAvgRoas && data.count >= 2) {
          bestFormat = fmt;
          bestAvgRoas = avg;
        }
      }
      if (bestFormat && bestAvgRoas > k.roas.value) {
        actions.push({
          id: 'scale-format',
          title: `Scale ${bestFormat} ads`,
          description: `${bestFormat} format averages ${bestAvgRoas.toFixed(1)}x ROAS — above your account average. Create more.`,
          icon: 'trending-up',
          color: '#10B981',
          route: '/app/creative-engine',
          priority: 8,
        });
      }
    }

    // 3. ROAS dropping
    if (k.roas.change < -10) {
      actions.push({
        id: 'roas-drop',
        title: 'ROAS declined ' + Math.abs(k.roas.change).toFixed(0) + '%',
        description: 'Review your creative mix and consider testing new angles. Check Brain for pattern insights.',
        icon: 'arrow-down-right',
        color: '#EF4444',
        route: '/app/brain',
        priority: 9,
      });
    }

    // 4. No active sprints — suggest starting one
    if (sprints.length === 0 && creatives.length > 0) {
      actions.push({
        id: 'start-sprint',
        title: 'Start a Creative Sprint',
        description: 'You have ad data but no active sprints. Let Cosmisk analyze your account and generate optimized creatives.',
        icon: 'rocket',
        color: '#6366F1',
        route: '/app/creative-engine',
        priority: 5,
      });
    }

    // 5. Content bank empty
    if (creatives.length >= 0) {
      actions.push({
        id: 'content',
        title: 'Generate weekly content',
        description: '21 pieces of platform-specific content in one click — Instagram, LinkedIn, Twitter.',
        icon: 'notebook-pen',
        color: '#8B5CF6',
        route: '/app/content-bank',
        priority: 2,
      });
    }

    // 6. High ROAS + low spend = opportunity
    const underSpentWinners = creatives.filter(c => c.metrics.roas >= 3 && c.metrics.spend < k.spend.value * 0.1);
    if (underSpentWinners.length > 0) {
      actions.push({
        id: 'scale-winner',
        title: `${underSpentWinners.length} hidden gem${underSpentWinners.length > 1 ? 's' : ''}`,
        description: `High-ROAS ads with low spend — scale these before competitors catch on.`,
        icon: 'gem',
        color: '#0EA5E9',
        route: '/app/creative-cockpit',
        priority: 7,
      });
    }

    // Sort by priority, take top 3
    return actions.sort((a, b) => b.priority - a.priority).slice(0, 3);
  });

  chartLabels = computed(() => this.chartData().map(d => {
    const parts = d.date.split('-');
    return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : d.date;
  }));

  chartValues = computed(() => {
    return this.chartData().map(d => {
      switch (this.activeChartMetric()) {
        case 'ROAS': return d.roas;
        case 'CTR': return d.ctr;
        case 'CPA': return d.cpa;
        case 'Spend': return Math.round(d.spend / 1000);
        default: return d.roas;
      }
    });
  });

  chartColor = computed(() => {
    const colors: Record<string, string> = { ROAS: '#6366F1', CTR: '#3B82F6', CPA: '#F59E0B', Spend: '#10B981' };
    return colors[this.activeChartMetric()] || '#6366F1';
  });

  chartSuffix = computed(() => {
    const suffixes: Record<string, string> = { ROAS: 'x', CTR: '%', CPA: '', Spend: 'K' };
    return suffixes[this.activeChartMetric()] || '';
  });

  ngOnInit() {
    this.loadActiveSprints();
  }

  private loadActiveSprints() {
    this.engineService.getSprints().subscribe({
      next: (res: any) => {
        if (res.success && res.sprints) {
          const active = res.sprints.filter((s: any) =>
            ['analyzing', 'planning', 'approved', 'generating', 'reviewing'].includes(s.status)
          ).slice(0, 3);
          this.activeSprints.set(active);
        }
      },
      error: () => this.toast.error('Load Failed', 'Could not load sprints'),
    });
  }

  formatChange(change: number, suffix: string): string {
    return (change >= 0 ? '+' : '') + change.toFixed(1) + suffix;
  }

  private loadKpis(accountId: string, credentialGroup: string, datePreset: string) {
    this.loading.set(true);
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
    this.loadingTimeout = setTimeout(() => {
      if (this.loading()) this.loading.set(false);
      if (this.insightsLoading()) this.insightsLoading.set(false);
    }, 8000);
    this.api.get<any>(environment.AD_ACCOUNT_KPIS, {
      account_id: accountId,
      credential_group: credentialGroup,
      date_preset: datePreset,
    }).subscribe({
      next: (res) => {
        if (res.success && res.kpis) {
          const k = res.kpis;
          this.kpi.set({
            spend: { value: k.spend?.value || 0, change: k.spend?.change || 0, sparkline: k.spend?.sparkline || [k.spend?.value || 0] },
            revenue: { value: k.revenue?.value || 0, change: k.revenue?.change || 0, sparkline: k.revenue?.sparkline || [k.revenue?.value || 0] },
            roas: { value: k.roas?.value || 0, change: k.roas?.change || 0, sparkline: k.roas?.sparkline || [k.roas?.value || 0] },
            activeCreatives: { value: this.allCreatives().length, winning: 0, stable: 0, fatiguing: 0 },
          });
        }
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
  }

  private loadChartData(accountId: string, credentialGroup: string, datePreset: string) {
    this.api.get<any>(environment.DASHBOARD_CHART, {
      account_id: accountId,
      credential_group: credentialGroup,
      date_preset: datePreset,
    }).subscribe({
      next: (res) => {
        const chartArr = res.chart || res.data || res.daily || res.chartData || [];
        if (res.success && chartArr.length) {
          this.chartData.set(chartArr.map((d: any) => ({
            date: d.date || d.date_start || d.day || '',
            roas: d.roas ?? d.purchase_roas ?? 0,
            spend: d.spend ?? 0,
            revenue: d.revenue ?? d.purchase_value ?? 0,
            ctr: d.ctr ?? 0,
            cpa: d.cpa ?? d.cost_per_action ?? 0,
          })));
        } else {
          // No chart data returned — leave empty to show empty state
          this.chartData.set([]);
        }
      },
      error: () => {
        this.chartData.set([]);
      },
    });
  }

  private loadInsights(accountId: string, credentialGroup: string) {
    this.insightsLoading.set(true);
    this.api.get<any>(environment.DASHBOARD_INSIGHTS, {
      account_id: accountId,
      credential_group: credentialGroup,
    }).subscribe({
      next: (res) => {
        if (res.success && res.insights?.length) {
          this.insights.set(res.insights.map((ins: any) => ({
            id: ins.id || 'ins-' + Math.random().toString(36).slice(2),
            priority: ins.priority || 'info',
            title: ins.title || '',
            description: ins.description || '',
            actionLabel: ins.actionLabel || 'View',
            actionRoute: ins.actionRoute || '/app/analytics',
            createdAt: ins.createdAt || new Date().toISOString(),
          })));
        }
        this.insightsLoading.set(false);
      },
      error: () => { this.insightsLoading.set(false); },
    });
  }

  private loadTopAds(accountId: string, credentialGroup: string, datePreset: string) {
    this.api.get<any>(environment.AD_ACCOUNT_TOP_ADS, {
      account_id: accountId,
      credential_group: credentialGroup,
      limit: 10,
      date_preset: datePreset,
    }).subscribe({
      next: (res) => {
        if (res.success && res.ads?.length) {
          const creatives = res.ads.map((ad: any, i: number) => {
            const roas = ad.metrics?.roas || 0;
            return {
              id: ad.id || `ad-${i}`,
              name: ad.name || 'Unnamed Ad',
              brandId: 'real-account',
              format: (ad.object_type === 'VIDEO' ? 'video' : 'static') as CreativeFormat,
              duration: ad.video_length || ad.duration || undefined,
              thumbnailUrl: ad.image_url || ad.thumbnail_url || ad.effective_image_url || `https://placehold.co/400x400/E0E7FF/4338CA?text=${encodeURIComponent((ad.name || 'Ad').substring(0, 15))}`,
              videoId: ad.video_id || undefined,
              videoSourceUrl: ad.video_url || ad.source || ad.effective_video_url || undefined,
              status: (roas >= 3 ? 'winning' : roas >= 2 ? 'stable' : roas > 0 ? 'fatiguing' : 'new') as CreativeStatus,
              dna: {
                hook: [] as HookDnaType[],
                visual: [] as VisualDnaType[],
                audio: [],
              },
              metrics: { roas, cpa: ad.metrics?.cpa || 0, ctr: ad.metrics?.ctr || 0, spend: ad.metrics?.spend || 0, impressions: ad.metrics?.impressions || 0, clicks: ad.metrics?.clicks || 0, conversions: ad.metrics?.conversions || 0 },
              trend: { direction: roas >= 2 ? 'up' as const : 'flat' as const, percentage: 0, period: 'last 30d' },
              daysActive: ad.days_active || 30,
              createdAt: ad.created_time || new Date().toISOString().split('T')[0],
              adSetId: '',
              campaignId: '',
            } satisfies Creative;
          });
          this.allCreatives.set(creatives);
          this.topCreatives = this.sortCreatives(this.activeTableTab);
          // Fetch real DNA from Claude batch analysis
          this.loadDna(accountId, creatives);
          // Update active creatives count in KPIs
          const winning = creatives.filter((c: Creative) => c.status === 'winning').length;
          const stable = creatives.filter((c: Creative) => c.status === 'stable').length;
          const fatiguing = creatives.filter((c: Creative) => c.status === 'fatiguing').length;
          this.kpi.update(k => ({
            ...k,
            activeCreatives: { value: creatives.length, winning, stable, fatiguing },
          }));
        }
      },
      error: () => this.toast.error('Load Failed', 'Could not load creative DNA'),
    });
  }

  switchTableTab(tab: string) {
    this.activeTableTab = tab;
    this.topCreatives = this.sortCreatives(tab);
  }

  private sortCreatives(by: string): Creative[] {
    const sorted = [...this.allCreatives()];
    switch (by) {
      case 'ROAS': sorted.sort((a, b) => b.metrics.roas - a.metrics.roas); break;
      case 'Spend': sorted.sort((a, b) => b.metrics.spend - a.metrics.spend); break;
      case 'CTR': sorted.sort((a, b) => b.metrics.ctr - a.metrics.ctr); break;
    }
    return sorted.slice(0, 5);
  }

  private loadDna(accountId: string, creatives: Creative[]) {
    const ads = creatives.map(c => ({
      id: c.id, name: c.name, format: c.format,
      roas: c.metrics.roas, ctr: c.metrics.ctr, cpa: c.metrics.cpa,
      spend: c.metrics.spend, conversions: c.metrics.conversions,
    }));
    this.api.post<any>(environment.CREATIVES_BATCH_DNA, { account_id: accountId, ads }).subscribe({
      next: (res) => {
        if (res.success && res.dna) {
          this.allCreatives.update(current =>
            current.map(c => {
              const dna = res.dna[c.id];
              if (!dna) return c;
              return { ...c, dna: { hook: (dna.hook || []) as HookDnaType[], visual: (dna.visual || []) as VisualDnaType[], audio: dna.audio || [] } };
            })
          );
          this.topCreatives = this.sortCreatives(this.activeTableTab);
        }
      },
    });
  }

  onCreativeClick(creative: Creative) {
    this.router.navigate(['/app/creative-cockpit'], { queryParams: { ad: creative.id } });
  }

}
