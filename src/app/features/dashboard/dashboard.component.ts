import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { InsightCardComponent } from '../../shared/components/insight-card/insight-card.component';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { LakhCrorePipe } from '../../shared/pipes/lakh-crore.pipe';
import { DEMO_DASHBOARD_KPI, DEMO_CREATIVES, DEMO_INSIGHTS, DEMO_CHART_DATA } from '../../shared/data/demo-data';
import { Creative } from '../../core/models/creative.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, KpiCardComponent, InsightCardComponent, DnaBadgeComponent, StatusBadgeComponent, LakhCrorePipe],
  template: `
    <!-- Alert Banner -->
    @if (!alertDismissed()) {
      <div class="bg-red-50 border border-red-200 rounded-card p-4 mb-6 flex items-center justify-between animate-fade-in">
        <div class="flex items-center gap-3">
          <span class="text-lg">&#9888;&#65039;</span>
          <p class="text-sm font-body text-red-800 m-0">
            <strong>3 creatives need attention.</strong> 1 rising star detected.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <a routerLink="/app/creative-cockpit" [queryParams]="{status: 'fatiguing'}"
            class="text-sm font-body font-semibold text-red-600 hover:underline no-underline whitespace-nowrap">
            View Details &#8594;
          </a>
          <button
            (click)="dismissAlert()"
            class="text-gray-400 hover:text-gray-600 text-sm border-0 bg-transparent cursor-pointer p-1">
            &#10005;
          </button>
        </div>
      </div>
    }

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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

    <!-- Chart + Insights Row -->
    <div class="grid lg:grid-cols-5 gap-6 mb-8">
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

        <!-- Area Chart -->
        <div class="relative h-52 flex items-end gap-0 px-2">
          <!-- Y-axis labels -->
          <div class="absolute left-0 top-0 bottom-6 w-12 flex flex-col justify-between text-[10px] text-gray-400 font-mono">
            <span>{{ getYLabel(1) }}</span>
            <span>{{ getYLabel(0.5) }}</span>
            <span>{{ getYLabel(0) }}</span>
          </div>

          <!-- Chart bars with area fill -->
          <div class="ml-12 flex-1 flex items-end gap-1.5">
            @for (point of chartData; track point.date) {
              <div class="flex-1 flex flex-col items-center gap-1">
                <div class="w-full relative group">
                  <!-- Background bar (spend) -->
                  @if (activeChartMetric === 'ROAS') {
                    <div
                      class="w-full bg-gray-100 rounded-t-sm absolute bottom-0"
                      [style.height.px]="getSpendBarHeight(point)">
                    </div>
                  }
                  <!-- Main bar -->
                  <div
                    class="w-full rounded-t-sm transition-all duration-300 hover:opacity-80 relative"
                    [ngClass]="activeChartMetric === 'ROAS' ? 'bg-accent/30' : activeChartMetric === 'CTR' ? 'bg-blue-200' : activeChartMetric === 'CPA' ? 'bg-yellow-200' : 'bg-accent/20'"
                    [style.height.px]="getChartBarHeight(point)">
                    <!-- Data point dot -->
                    <div class="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white"
                      [ngClass]="activeChartMetric === 'ROAS' ? 'bg-accent' : activeChartMetric === 'CTR' ? 'bg-blue-500' : activeChartMetric === 'CPA' ? 'bg-yellow-500' : 'bg-accent'">
                    </div>
                  </div>
                  <!-- Tooltip -->
                  <div class="absolute -top-16 left-1/2 -translate-x-1/2 px-3 py-2 bg-navy text-white text-[10px] font-mono rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-lg">
                    <div class="font-semibold mb-0.5">{{ point.date }}</div>
                    <div>ROAS: {{ point.roas }}x</div>
                    <div>Spend: &#8377;{{ (point.spend / 100000).toFixed(1) }}L</div>
                    <div>Revenue: &#8377;{{ (point.revenue / 100000).toFixed(1) }}L</div>
                  </div>
                </div>
                <span class="text-[10px] text-gray-400 font-mono mt-1">{{ point.date.split(' ')[1] }}</span>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- AI Insights -->
      <div class="lg:col-span-2 card">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-lg">&#10024;</span>
          <h3 class="text-card-title font-display text-navy m-0">AI Insights</h3>
        </div>
        <p class="text-xs text-gray-500 font-body mb-4 m-0">Today's Intelligence</p>

        <div class="space-y-3">
          @for (insight of insights; track insight.id) {
            <app-insight-card [insight]="insight" />
          }
        </div>

        <a routerLink="/app/ai-studio" class="block text-center text-sm text-accent font-body font-semibold mt-4 hover:underline no-underline">
          View All Insights &#8594;
        </a>
      </div>
    </div>

    <!-- Top Creatives Table -->
    <div class="card mb-8">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-card-title font-display text-navy m-0">Top Performing Creatives</h3>
        <a routerLink="/app/creative-cockpit" class="text-sm text-accent font-body font-semibold hover:underline no-underline">
          View All in Creative Cockpit &#8594;
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

    <!-- Quick Actions -->
    <div class="grid md:grid-cols-3 gap-6">
      @for (action of quickActions; track action.title) {
        <a [routerLink]="action.route" class="card !p-6 flex items-start gap-4 hover:-translate-y-0.5 transition-all no-underline group">
          <span class="text-2xl">{{ action.icon }}</span>
          <div class="flex-1">
            <h4 class="text-sm font-body font-semibold text-navy m-0 mb-1">{{ action.title }}</h4>
            <p class="text-xs text-gray-500 font-body m-0 mb-2">{{ action.description }}</p>
            <span class="text-xs text-accent font-body font-semibold group-hover:underline">Go &#8594;</span>
          </div>
        </a>
      }
    </div>
  `
})
export default class DashboardComponent {
  kpi = DEMO_DASHBOARD_KPI;
  insights = DEMO_INSIGHTS;
  chartData = DEMO_CHART_DATA;
  allCreatives = [...DEMO_CREATIVES];
  topCreatives = this.sortCreatives('ROAS');

  alertDismissed = signal(false);

  activeChartMetric = 'ROAS';
  chartMetrics = ['ROAS', 'CTR', 'CPA', 'Spend'];
  activeTableTab = 'ROAS';
  tableTabs = ['ROAS', 'Spend', 'CTR'];

  quickActions = [
    { icon: '🎬', title: 'Create New Brief', description: 'Based on your top performers', route: '/app/director-lab' },
    { icon: '📹', title: 'Generate UGC', description: 'AI avatars ready to shoot', route: '/app/ugc-studio' },
    { icon: '📄', title: 'View Report', description: 'Weekly performance summary', route: '/app/reports' },
  ];

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

  getChartBarHeight(point: typeof DEMO_CHART_DATA[0]): number {
    const getValue = (p: typeof DEMO_CHART_DATA[0]) => {
      switch (this.activeChartMetric) {
        case 'ROAS': return p.roas;
        case 'CTR': return p.roas * 0.65; // simulated CTR from ROAS ratio
        case 'CPA': return 800 - (p.roas * 100); // inverse — higher ROAS = lower CPA
        case 'Spend': return p.spend;
        default: return p.roas;
      }
    };
    const values = this.chartData.map(getValue);
    const current = getValue(point);
    const max = Math.max(...values);
    const min = Math.min(...values);
    return ((current - min) / (max - min || 1)) * 140 + 30;
  }

  getSpendBarHeight(point: typeof DEMO_CHART_DATA[0]): number {
    const values = this.chartData.map(p => p.spend);
    const max = Math.max(...values);
    const min = Math.min(...values);
    return ((point.spend - min) / (max - min || 1)) * 100 + 20;
  }

  getYLabel(fraction: number): string {
    const getValue = (p: typeof DEMO_CHART_DATA[0]) => {
      switch (this.activeChartMetric) {
        case 'ROAS': return p.roas;
        case 'CTR': return p.roas * 0.65;
        case 'CPA': return 800 - (p.roas * 100);
        case 'Spend': return p.spend;
        default: return p.roas;
      }
    };
    const values = this.chartData.map(getValue);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const val = min + (max - min) * fraction;

    switch (this.activeChartMetric) {
      case 'ROAS': return val.toFixed(1) + 'x';
      case 'CTR': return val.toFixed(1) + '%';
      case 'CPA': return '₹' + Math.round(val);
      case 'Spend': return '₹' + (val / 100000).toFixed(1) + 'L';
      default: return String(val);
    }
  }
}
