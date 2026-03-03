const _BUILD_VER = '2026-02-23-v2';
import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { InsightCardComponent } from '../../shared/components/insight-card/insight-card.component';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { AreaChartComponent } from '../../shared/components/area-chart/area-chart.component';
import { LakhCrorePipe } from '../../shared/pipes/lakh-crore.pipe';
import { DEMO_DASHBOARD_KPI, DEMO_CREATIVES, DEMO_INSIGHTS, DEMO_CHART_DATA } from '../../shared/data/demo-data';
import { Creative } from '../../core/models/creative.model';
import { UgcService, DashboardKpis, UgcProjectSummary } from '../../core/services/ugc.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, KpiCardComponent, InsightCardComponent, DnaBadgeComponent, StatusBadgeComponent, AreaChartComponent, LakhCrorePipe, LucideAngularModule],
  template: `
    <!-- Welcome Header -->
    <div class="mb-6">
      <h2 class="text-section-title font-display text-navy">Good morning</h2>
      <p class="text-sm text-gray-500 font-body mt-1">Here's your creative intelligence summary</p>
    </div>

    <!-- Alert Banner (preview) -->
    @if (!alertDismissed()) {
      <div class="bg-gray-50 border border-gray-200 rounded-card p-4 mb-6 flex items-center justify-between animate-fade-in opacity-60">
        <div class="flex items-center gap-3">
          <lucide-icon name="alert-triangle" [size]="18" class="text-gray-400"></lucide-icon>
          <p class="text-sm font-body text-gray-500 m-0">
            <strong>Creative alerts will appear here</strong> once Meta Ads is connected.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <a routerLink="/app/creative-cockpit" [queryParams]="{status: 'fatiguing'}"
            class="text-sm font-body font-semibold text-red-600 hover:underline no-underline whitespace-nowrap">
            View Details <lucide-icon name="arrow-right" [size]="14" class="inline-block ml-1"></lucide-icon>
          </a>
          <button
            (click)="dismissAlert()"
            class="text-gray-400 hover:text-gray-600 text-sm border-0 bg-transparent cursor-pointer p-1">
            <lucide-icon name="x" [size]="14"></lucide-icon>
          </button>
        </div>
      </div>
    }

    <!-- UGC Pipeline KPIs (from real data) -->
    @if (pipelineKpis()) {
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <a routerLink="/app/ugc-studio" class="no-underline">
          <app-kpi-card
            title="UGC Projects"
            [value]="pipelineKpis()!.projects.total"
            subtitle="Active pipeline projects" />
        </a>
        <a routerLink="/app/ugc-studio" class="no-underline">
          <app-kpi-card
            title="Concepts"
            [value]="pipelineKpis()!.concepts.total"
            [subtitle]="pipelineKpis()!.concepts.approved + ' approved · ' + pipelineKpis()!.concepts.pending + ' pending'"
            color="green" />
        </a>
        <a routerLink="/app/ugc-studio" class="no-underline">
          <app-kpi-card
            title="Scripts"
            [value]="pipelineKpis()!.scripts.total"
            [subtitle]="pipelineKpis()!.scripts.delivered + ' delivered · ' + pipelineKpis()!.scripts.in_review + ' in review'" />
        </a>
        <a routerLink="/app/ugc-studio" class="no-underline">
          <app-kpi-card
            title="Delivery Rate"
            [value]="deliveryRate()"
            suffix="%"
            [color]="deliveryRate() >= 80 ? 'green' : deliveryRate() >= 50 ? 'yellow' : 'red'" />
        </a>
      </div>
    }

    <!-- Ad Performance KPI Cards (preview — connects to Meta Ads) -->
    <div class="flex items-center gap-2 mb-3">
      <h3 class="text-sm font-display text-gray-400 m-0">Ad Performance</h3>
      <span class="px-2 py-0.5 bg-gray-100 text-gray-400 text-[10px] font-body font-medium rounded-pill">Preview</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 opacity-60">
      <a routerLink="/app/analytics" class="no-underline">
        <app-kpi-card
          title="Total Spend"
          [value]="kpi.spend.value"
          [change]="kpi.spend.change"
          changeDisplay="+12.3%"
          [isCurrency]="true"
          [sparkline]="kpi.spend.sparkline" />
      </a>
      <a routerLink="/app/analytics" class="no-underline">
        <app-kpi-card
          title="Revenue"
          [value]="kpi.revenue.value"
          [change]="kpi.revenue.change"
          changeDisplay="+18.7%"
          [isCurrency]="true"
          [sparkline]="kpi.revenue.sparkline"
          color="green" />
      </a>
      <a routerLink="/app/creative-cockpit" class="no-underline">
        <app-kpi-card
          title="ROAS"
          [value]="kpi.roas.value"
          [change]="kpi.roas.change"
          changeDisplay="+0.4x"
          suffix="x"
          [sparkline]="kpi.roas.sparkline"
          [color]="kpi.roas.value >= 3 ? 'green' : kpi.roas.value >= 2 ? 'yellow' : 'red'" />
      </a>
      <a routerLink="/app/creative-cockpit" class="no-underline">
        <app-kpi-card
          title="Active Creatives"
          [value]="kpi.activeCreatives.value"
          [subtitle]="kpi.activeCreatives.winning + ' winning · ' + kpi.activeCreatives.stable + ' stable · ' + kpi.activeCreatives.fatiguing + ' fatiguing'" />
      </a>
    </div>

    <!-- Chart + Insights Row (preview — connects to Meta Ads) -->
    <div class="grid lg:grid-cols-5 gap-6 mb-8 opacity-60">
      <!-- Performance Chart -->
      <div class="lg:col-span-3 card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-card-title font-display text-navy m-0">Performance Trend</h3>
          <div class="flex gap-1">
            @for (metric of chartMetrics; track metric) {
              <button
                (click)="activeChartMetric = metric"
                class="px-3 py-1 rounded-pill text-xs font-body font-medium transition-all border-0 cursor-pointer"
                [ngClass]="activeChartMetric === metric ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
                {{ metric }}
              </button>
            }
          </div>
        </div>

        <app-area-chart
          [labels]="chartLabels"
          [values]="chartValues()"
          [label]="activeChartMetric"
          [color]="chartColor()"
          [suffix]="chartSuffix()"
          [height]="208" />
      </div>

      <!-- AI Insights -->
      <div class="lg:col-span-2 card">
        <div class="flex items-center gap-2 mb-4">
          <lucide-icon name="sparkles" [size]="18" class="text-accent"></lucide-icon>
          <h3 class="text-card-title font-display text-navy m-0">AI Insights</h3>
        </div>
        <p class="text-xs text-gray-500 font-body mb-4 m-0 flex items-center gap-2">Today's Intelligence <span class="live-dot"></span></p>

        <div class="space-y-3">
          @for (insight of insights; track insight.id) {
            <app-insight-card [insight]="insight" />
          }
        </div>

        <a routerLink="/app/ai-studio" class="block text-center text-sm text-accent font-body font-semibold mt-4 hover:underline no-underline">
          View All Insights <lucide-icon name="arrow-right" [size]="14" class="inline-block ml-1"></lucide-icon>
        </a>
      </div>
    </div>

    <!-- Top Creatives Table (preview) -->
    <div class="card mb-8 opacity-60">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-card-title font-display text-navy m-0">Top Performing Creatives</h3>
        <a routerLink="/app/creative-cockpit" class="text-sm text-accent font-body font-semibold hover:underline no-underline">
          View All in Creative Cockpit <lucide-icon name="arrow-right" [size]="14" class="inline-block ml-1"></lucide-icon>
        </a>
      </div>

      <!-- Tabs -->
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

      <!-- Table -->
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
            @for (creative of topCreatives; track creative.id; let i = $index) {
              <tr
                class="border-b border-divider hover:bg-cream transition-colors cursor-pointer"
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
          </tbody>
        </table>
      </div>
    </div>

    <!-- Recent UGC Projects -->
    <div class="card mb-8">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-card-title font-display text-navy m-0">Recent UGC Projects</h3>
        <a routerLink="/app/ugc-studio" class="text-sm text-accent font-body font-semibold hover:underline no-underline flex items-center gap-1">
          View All <lucide-icon name="arrow-right" [size]="14"></lucide-icon>
        </a>
      </div>
      @if (recentProjects().length > 0) {
        <div class="space-y-2">
          @for (project of recentProjects(); track project.id) {
            <a [routerLink]="['/app/ugc-studio', project.id]"
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-accent/5 transition-colors no-underline">
              <div>
                <p class="text-sm font-semibold text-navy m-0">{{ project.brand_name }}</p>
                <p class="text-xs text-gray-500 m-0">{{ project.client_code }} &middot; {{ project.num_scripts }} scripts</p>
              </div>
              <span class="px-2 py-0.5 rounded-pill text-xs font-medium"
                [ngClass]="project.status === 'Delivered' || project.status === 'Complete' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'">
                {{ project.status }}
              </span>
            </a>
          }
        </div>
      } @else {
        <p class="text-sm text-gray-500">No UGC projects yet.</p>
      }
    </div>

    <!-- Quick Actions -->
    <div class="grid md:grid-cols-3 gap-6">
      @for (action of quickActions; track action.title) {
        <a [routerLink]="action.route" class="card !p-6 flex items-start gap-4 hover:-translate-y-0.5 transition-all no-underline group">
          <div class="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
            <lucide-icon [name]="action.icon" [size]="24" class="text-accent"></lucide-icon>
          </div>
          <div class="flex-1">
            <h4 class="text-sm font-body font-semibold text-navy m-0 mb-1">{{ action.title }}</h4>
            <p class="text-xs text-gray-500 font-body m-0 mb-2">{{ action.description }}</p>
            <span class="text-xs text-accent font-body font-semibold group-hover:underline flex items-center gap-1">Go <lucide-icon name="arrow-right" [size]="14"></lucide-icon></span>
          </div>
        </a>
      }
    </div>
  `
})
export default class DashboardComponent implements OnInit {
  private ugcService = inject(UgcService);

  kpi = DEMO_DASHBOARD_KPI;
  insights = DEMO_INSIGHTS;
  chartData = DEMO_CHART_DATA;
  allCreatives = [...DEMO_CREATIVES];
  topCreatives = this.sortCreatives('ROAS');

  alertDismissed = signal(false);
  pipelineKpis = signal<DashboardKpis | null>(null);

  activeChartMetric = 'ROAS';
  chartMetrics = ['ROAS', 'CTR', 'CPA', 'Spend'];
  activeTableTab = 'ROAS';
  tableTabs = ['ROAS', 'Spend', 'CTR'];

  quickActions = [
    { icon: 'clapperboard', title: 'Create New Brief', description: 'Based on your top performers', route: '/app/director-lab' },
    { icon: 'video', title: 'Generate UGC', description: 'AI avatars ready to shoot', route: '/app/ugc-studio' },
    { icon: 'file-text', title: 'View Report', description: 'Weekly performance summary', route: '/app/reports' },
  ];

  recentProjects = signal<UgcProjectSummary[]>([]);
  deliveryRate = signal(0);

  chartLabels = this.chartData.map(d => d.date.split(' ')[1]);

  chartValues = computed(() => {
    return this.chartData.map(d => {
      switch (this.activeChartMetric) {
        case 'ROAS': return d.roas;
        case 'CTR': return +(d.roas * 0.65).toFixed(1);
        case 'CPA': return Math.round(800 - (d.roas * 100));
        case 'Spend': return Math.round(d.spend / 1000);
        default: return d.roas;
      }
    });
  });

  chartColor = computed(() => {
    const colors: Record<string, string> = { ROAS: '#6366F1', CTR: '#3B82F6', CPA: '#F59E0B', Spend: '#10B981' };
    return colors[this.activeChartMetric] || '#6366F1';
  });

  chartSuffix = computed(() => {
    const suffixes: Record<string, string> = { ROAS: 'x', CTR: '%', CPA: '', Spend: 'K' };
    return suffixes[this.activeChartMetric] || '';
  });

  ngOnInit() {
    this.ugcService.getDashboardKpis().subscribe({
      next: (data) => {
        this.pipelineKpis.set(data);
        const total = data.scripts.total || 1;
        this.deliveryRate.set(Math.round((data.scripts.delivered / total) * 100));
      },
      error: () => {},
    });

    this.ugcService.getProjects().subscribe({
      next: (data) => this.recentProjects.set(data.projects.slice(0, 5)),
      error: () => {},
    });
  }

  dismissAlert() {
    this.alertDismissed.set(true);
  }

  switchTableTab(tab: string) {
    this.activeTableTab = tab;
    this.topCreatives = this.sortCreatives(tab);
  }

  private sortCreatives(by: string): Creative[] {
    const sorted = [...this.allCreatives];
    switch (by) {
      case 'ROAS': sorted.sort((a, b) => b.metrics.roas - a.metrics.roas); break;
      case 'Spend': sorted.sort((a, b) => b.metrics.spend - a.metrics.spend); break;
      case 'CTR': sorted.sort((a, b) => b.metrics.ctr - a.metrics.ctr); break;
    }
    return sorted.slice(0, 5);
  }

  onCreativeClick(creative: Creative) {
    console.log('Creative clicked:', creative.id, creative.name);
  }

}
