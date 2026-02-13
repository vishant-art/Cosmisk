import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { InsightCardComponent } from '../../shared/components/insight-card/insight-card.component';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { LakhCrorePipe } from '../../shared/pipes/lakh-crore.pipe';
import { DEMO_DASHBOARD_KPI, DEMO_CREATIVES, DEMO_INSIGHTS, DEMO_CHART_DATA } from '../../shared/data/demo-data';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, KpiCardComponent, InsightCardComponent, DnaBadgeComponent, StatusBadgeComponent, LakhCrorePipe],
  template: `
    <!-- Alert Banner -->
    <div class="bg-red-50 border border-red-200 rounded-card p-4 mb-6 flex items-center justify-between animate-fade-in">
      <div class="flex items-center gap-3">
        <span class="text-lg">⚠️</span>
        <p class="text-sm font-body text-red-800 m-0">
          <strong>3 creatives need attention.</strong> 1 rising star detected.
        </p>
      </div>
      <a routerLink="/app/creative-cockpit" class="text-sm font-body font-semibold text-red-600 hover:underline no-underline">
        View Details →
      </a>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <app-kpi-card
        title="Total Spend"
        [value]="kpi.spend.value"
        [change]="kpi.spend.change"
        changeDisplay="+12.3%"
        [isCurrency]="true"
        [sparkline]="kpi.spend.sparkline" />
      <app-kpi-card
        title="Revenue"
        [value]="kpi.revenue.value"
        [change]="kpi.revenue.change"
        changeDisplay="+18.7%"
        [isCurrency]="true"
        [sparkline]="kpi.revenue.sparkline"
        color="green" />
      <app-kpi-card
        title="ROAS"
        [value]="kpi.roas.value"
        [change]="kpi.roas.change"
        changeDisplay="+0.4x"
        suffix="x"
        [sparkline]="kpi.roas.sparkline"
        [color]="kpi.roas.value >= 3 ? 'green' : kpi.roas.value >= 2 ? 'yellow' : 'red'" />
      <app-kpi-card
        title="Active Creatives"
        [value]="kpi.activeCreatives.value"
        [subtitle]="kpi.activeCreatives.winning + ' winning · ' + kpi.activeCreatives.stable + ' stable · ' + kpi.activeCreatives.fatiguing + ' fatiguing'" />
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

        <!-- Simple Chart Visualization -->
        <div class="h-48 flex items-end gap-2 px-2">
          @for (point of chartData; track point.date) {
            <div class="flex-1 flex flex-col items-center gap-1">
              <div
                class="w-full bg-accent/20 rounded-t-sm transition-all duration-300 hover:bg-accent/40 relative group"
                [style.height.%]="getChartHeight(point)">
                <div class="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-navy text-white text-[10px] font-mono rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {{ activeChartMetric === 'ROAS' ? point.roas + 'x' : (activeChartMetric === 'Spend' ? '₹' + (point.spend / 1000) + 'K' : '₹' + (point.revenue / 1000) + 'K') }}
                </div>
              </div>
              <span class="text-[10px] text-gray-400 font-mono">{{ point.date.split(' ')[1] }}</span>
            </div>
          }
        </div>
      </div>

      <!-- AI Insights -->
      <div class="lg:col-span-2 card">
        <div class="flex items-center gap-2 mb-4">
          <span>✨</span>
          <h3 class="text-card-title font-display text-navy m-0">AI Insights</h3>
        </div>
        <p class="text-xs text-gray-500 font-body mb-4 m-0">Today's Intelligence</p>

        <div class="space-y-3">
          @for (insight of insights; track insight.id) {
            <app-insight-card [insight]="insight" />
          }
        </div>

        <a routerLink="/app/ai-studio" class="block text-center text-sm text-accent font-body font-semibold mt-4 hover:underline no-underline">
          View All Insights →
        </a>
      </div>
    </div>

    <!-- Top Creatives Table -->
    <div class="card mb-8">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-card-title font-display text-navy m-0">Top Performing Creatives</h3>
        <a routerLink="/app/creative-cockpit" class="text-sm text-accent font-body font-semibold hover:underline no-underline">
          View All in Creative Cockpit →
        </a>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-4">
        @for (tab of tableTabs; track tab) {
          <button
            (click)="activeTableTab = tab"
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
              <tr class="border-b border-divider hover:bg-cream/50 transition-colors cursor-pointer">
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
        <a [routerLink]="action.route" class="card !p-6 flex items-start gap-4 hover:-translate-y-0.5 transition-transform no-underline">
          <span class="text-2xl">{{ action.icon }}</span>
          <div>
            <h4 class="text-sm font-body font-semibold text-navy m-0 mb-1">{{ action.title }}</h4>
            <p class="text-xs text-gray-500 font-body m-0">{{ action.description }}</p>
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
  topCreatives = DEMO_CREATIVES.sort((a, b) => b.metrics.roas - a.metrics.roas).slice(0, 5);

  activeChartMetric = 'ROAS';
  chartMetrics = ['ROAS', 'Spend', 'Revenue'];
  activeTableTab = 'ROAS';
  tableTabs = ['ROAS', 'Spend', 'CTR'];

  quickActions = [
    { icon: '🎬', title: 'Create New Brief', description: 'Based on your top performers', route: '/app/director-lab' },
    { icon: '📹', title: 'Generate UGC', description: 'AI avatars ready to shoot', route: '/app/ugc-studio' },
    { icon: '📄', title: 'View Report', description: 'Weekly performance summary', route: '/app/reports' },
  ];

  getChartHeight(point: typeof DEMO_CHART_DATA[0]): number {
    const values = this.chartData.map(p => {
      if (this.activeChartMetric === 'ROAS') return p.roas;
      if (this.activeChartMetric === 'Spend') return p.spend;
      return p.revenue;
    });
    const current = this.activeChartMetric === 'ROAS' ? point.roas :
                    this.activeChartMetric === 'Spend' ? point.spend : point.revenue;
    const max = Math.max(...values);
    const min = Math.min(...values);
    return ((current - min) / (max - min || 1)) * 70 + 30;
  }
}
