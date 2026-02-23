const _BUILD_VER = '2026-02-13-v2';
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

interface KpiCard {
  label: string;
  value: string;
  change: number;
  prefix?: string;
  suffix?: string;
}

interface BreakdownRow {
  label: string;
  spend: string;
  roas: number;
  cpa: string;
  ctr: number;
  impressions: string;
  conversions: number;
  trend: 'up' | 'down' | 'flat';
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Analytics</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Deep dive into your ad performance</p>
        </div>
        <div class="flex items-center gap-3">
          <select [(ngModel)]="dateRange" class="px-3 py-2 border border-gray-200 rounded-lg text-xs font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="mtd">Month to Date</option>
          </select>
          <button class="px-4 py-2 border border-gray-200 rounded-lg text-xs font-body text-gray-600 hover:bg-gray-50">
            Export CSV
          </button>
        </div>
      </div>

      <!-- Row 1: KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        @for (kpi of kpis; track kpi.label) {
          <div class="bg-white rounded-card shadow-card p-4">
            <span class="text-xs text-gray-500 font-body">{{ kpi.label }}</span>
            <div class="text-xl font-display text-navy mt-1">{{ kpi.prefix ?? '' }}{{ kpi.value }}{{ kpi.suffix ?? '' }}</div>
            <div class="flex items-center gap-1 mt-1">
              <span class="text-xs font-body font-semibold inline-flex items-center gap-0.5"
                [ngClass]="kpi.change >= 0 ? 'text-green-600' : 'text-red-600'">
                @if (kpi.change >= 0) { <lucide-icon name="trending-up" [size]="12"></lucide-icon> } @else { <lucide-icon name="trending-down" [size]="12"></lucide-icon> } {{ kpi.change >= 0 ? kpi.change : -kpi.change }}%
              </span>
              <span class="text-[10px] text-gray-400 font-body">vs prev period</span>
            </div>
          </div>
        }
      </div>

      <!-- Row 2: KPI Cards (continued) -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        @for (kpi of kpis2; track kpi.label) {
          <div class="bg-white rounded-card shadow-card p-4">
            <span class="text-xs text-gray-500 font-body">{{ kpi.label }}</span>
            <div class="text-xl font-display text-navy mt-1">{{ kpi.prefix ?? '' }}{{ kpi.value }}{{ kpi.suffix ?? '' }}</div>
            <div class="flex items-center gap-1 mt-1">
              <span class="text-xs font-body font-semibold inline-flex items-center gap-0.5"
                [ngClass]="kpi.change >= 0 ? 'text-green-600' : 'text-red-600'">
                @if (kpi.change >= 0) { <lucide-icon name="trending-up" [size]="12"></lucide-icon> } @else { <lucide-icon name="trending-down" [size]="12"></lucide-icon> } {{ kpi.change >= 0 ? kpi.change : -kpi.change }}%
              </span>
              <span class="text-[10px] text-gray-400 font-body">vs prev period</span>
            </div>
          </div>
        }
      </div>

      <!-- Row 3: Performance Chart -->
      <div class="bg-white rounded-card shadow-card p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-display text-navy m-0">Performance Trend</h3>
          <div class="flex bg-gray-100 rounded-pill overflow-hidden">
            @for (tab of chartTabs; track tab) {
              <button
                (click)="activeChartTab = tab"
                class="px-3 py-1 text-xs font-body transition-colors"
                [ngClass]="activeChartTab === tab ? 'bg-accent text-white' : 'text-gray-500 hover:text-gray-700'">
                {{ tab }}
              </button>
            }
          </div>
        </div>
        <!-- Chart -->
        <div class="flex items-end gap-1 h-52 border-b border-l border-gray-100 pl-8 pb-1 relative">
          <!-- Y axis labels -->
          @for (label of getYAxisLabels(); track label) {
            <span class="absolute left-0 text-[10px] text-gray-400 font-body"
              [style.bottom.px]="label.pos">{{ label.text }}</span>
          }
          @for (bar of chartData; track bar.label) {
            <div class="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div class="w-full max-w-[24px] rounded-t transition-all group-hover:opacity-80"
                [ngClass]="activeChartTab === 'ROAS' ? 'bg-accent' : activeChartTab === 'CTR' ? 'bg-blue-500' : activeChartTab === 'CPA' ? 'bg-amber-500' : 'bg-purple-500'"
                [style.height.%]="bar.values[activeChartTab] / maxChartVal * 100">
              </div>
              <!-- Tooltip -->
              <div class="absolute -top-8 bg-navy text-white text-[10px] font-body px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                {{ activeChartTab === 'Spend' ? '₹' : '' }}{{ bar.values[activeChartTab] }}{{ activeChartTab === 'ROAS' ? 'x' : activeChartTab === 'CTR' ? '%' : activeChartTab === 'CPA' ? '' : 'K' }}
              </div>
              @if (bar.label.endsWith('1') || bar.label.endsWith('5') || bar.label.endsWith('0')) {
                <span class="text-[9px] text-gray-400 font-body mt-1">{{ bar.label }}</span>
              }
            </div>
          }
        </div>
      </div>

      <!-- Row 4: Breakdown Table -->
      <div class="bg-white rounded-card shadow-card overflow-hidden">
        <div class="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-sm font-display text-navy m-0">Performance Breakdown</h3>
          <div class="flex bg-gray-100 rounded-pill overflow-hidden">
            @for (tab of breakdownTabs; track tab) {
              <button
                (click)="switchBreakdown(tab)"
                class="px-3 py-1 text-xs font-body transition-colors"
                [ngClass]="activeBreakdownTab === tab ? 'bg-accent text-white' : 'text-gray-500 hover:text-gray-700'">
                {{ tab }}
              </button>
            }
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs font-body">
            <thead>
              <tr class="bg-gray-50 text-gray-500">
                <th class="px-4 py-3 text-left font-semibold">{{ activeBreakdownTab === 'By Hook DNA' ? 'Hook Type' : activeBreakdownTab === 'By Visual DNA' ? 'Visual Type' : activeBreakdownTab === 'By Campaign' ? 'Campaign' : 'Audience' }}</th>
                <th class="px-4 py-3 text-right font-semibold">Spend</th>
                <th class="px-4 py-3 text-right font-semibold">ROAS</th>
                <th class="px-4 py-3 text-right font-semibold">CPA</th>
                <th class="px-4 py-3 text-right font-semibold">CTR</th>
                <th class="px-4 py-3 text-right font-semibold">Impressions</th>
                <th class="px-4 py-3 text-right font-semibold">Conv.</th>
                <th class="px-4 py-3 text-right font-semibold">Trend</th>
              </tr>
            </thead>
            <tbody>
              @for (row of breakdownData(); track row.label) {
                <tr class="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 font-medium text-navy">{{ row.label }}</td>
                  <td class="px-4 py-3 text-right text-gray-600">{{ row.spend }}</td>
                  <td class="px-4 py-3 text-right font-semibold"
                    [ngClass]="row.roas >= 4 ? 'text-green-600' : row.roas >= 3 ? 'text-navy' : 'text-red-600'">
                    {{ row.roas }}x
                  </td>
                  <td class="px-4 py-3 text-right text-gray-600">{{ row.cpa }}</td>
                  <td class="px-4 py-3 text-right text-gray-600">{{ row.ctr }}%</td>
                  <td class="px-4 py-3 text-right text-gray-600">{{ row.impressions }}</td>
                  <td class="px-4 py-3 text-right text-gray-600">{{ row.conversions }}</td>
                  <td class="px-4 py-3 text-right">
                    <span class="text-xs font-semibold"
                      [ngClass]="row.trend === 'up' ? 'text-green-600' : row.trend === 'down' ? 'text-red-600' : 'text-gray-400'">
                      @if (row.trend === 'up') { <lucide-icon name="trending-up" [size]="14"></lucide-icon> } @else if (row.trend === 'down') { <lucide-icon name="trending-down" [size]="14"></lucide-icon> } @else { <lucide-icon name="arrow-right" [size]="14"></lucide-icon> }
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Row 5: Audience Insights + Unit Economics -->
      <div class="grid md:grid-cols-2 gap-6">
        <!-- Audience Insights -->
        <div class="bg-white rounded-card shadow-card p-5">
          <h3 class="text-sm font-display text-navy m-0 mb-4">Audience Insights</h3>
          <div class="space-y-3">
            @for (segment of audienceSegments; track segment.label) {
              <div>
                <div class="flex justify-between mb-1">
                  <span class="text-xs font-body text-gray-700">{{ segment.label }}</span>
                  <span class="text-xs font-body font-semibold text-navy">{{ segment.roas }}x ROAS</span>
                </div>
                <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all"
                    [ngClass]="segment.roas >= 4 ? 'bg-green-500' : segment.roas >= 3 ? 'bg-accent' : 'bg-amber-400'"
                    [style.width.%]="(segment.roas / 5.5) * 100"></div>
                </div>
                <div class="flex justify-between mt-0.5">
                  <span class="text-[10px] text-gray-400 font-body">{{ segment.spend }} spent</span>
                  <span class="text-[10px] text-gray-400 font-body">{{ segment.share }}% of budget</span>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Unit Economics -->
        <div class="bg-white rounded-card shadow-card p-5">
          <h3 class="text-sm font-display text-navy m-0 mb-4">Unit Economics</h3>
          <div class="space-y-4">
            @for (metric of unitEconomics; track metric.label) {
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span class="text-xs font-body text-gray-500 block">{{ metric.label }}</span>
                  <span class="text-lg font-display text-navy">{{ metric.value }}</span>
                </div>
                <div class="text-right">
                  <span class="text-xs font-body font-semibold flex items-center justify-end gap-0.5"
                    [ngClass]="metric.change >= 0 ? 'text-green-600' : 'text-red-600'">
                    @if (metric.change >= 0) { <lucide-icon name="trending-up" [size]="12"></lucide-icon> } @else { <lucide-icon name="trending-down" [size]="12"></lucide-icon> } {{ metric.change >= 0 ? metric.change : -metric.change }}%
                  </span>
                  <span class="text-[10px] text-gray-400 font-body">{{ metric.benchmark }}</span>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export default class AnalyticsComponent {
  dateRange = '30d';
  activeChartTab = 'ROAS';
  chartTabs = ['ROAS', 'CTR', 'CPA', 'Spend'];
  breakdownTabs = ['By Hook DNA', 'By Visual DNA', 'By Campaign', 'By Audience'];
  activeBreakdownTab = 'By Hook DNA';

  kpis: KpiCard[] = [
    { label: 'Total Spend', value: '12.4L', prefix: '₹', change: 8 },
    { label: 'Blended ROAS', value: '3.8', suffix: 'x', change: 12 },
    { label: 'Avg CPA', value: '312', prefix: '₹', change: -6 },
    { label: 'Avg CTR', value: '2.4', suffix: '%', change: 15 },
  ];

  kpis2: KpiCard[] = [
    { label: 'Impressions', value: '24.8L', change: 22 },
    { label: 'Clicks', value: '59.5K', change: 18 },
    { label: 'Conversions', value: '3,975', change: 14 },
    { label: 'Revenue', value: '47.1L', prefix: '₹', change: 21 },
  ];

  chartData = this.generateChartData();
  maxChartVal = 0;

  audienceSegments = [
    { label: 'Women 25-34, Metro Cities', roas: 4.6, spend: '₹3.8L', share: 31 },
    { label: 'Women 35-44, Health Interest', roas: 4.1, spend: '₹2.9L', share: 23 },
    { label: 'Men 25-34, Fitness', roas: 3.5, spend: '₹2.1L', share: 17 },
    { label: 'Women 18-24, Beauty', roas: 3.1, spend: '₹1.8L', share: 15 },
    { label: 'All Genders 45+, Wellness', roas: 2.8, spend: '₹1.8L', share: 14 },
  ];

  unitEconomics = [
    { label: 'Customer Acquisition Cost', value: '₹312', change: -6, benchmark: 'Industry: ₹380' },
    { label: 'Revenue per Click', value: '₹79', change: 8, benchmark: 'Industry: ₹62' },
    { label: 'Cost per Mille (CPM)', value: '₹142', change: 3, benchmark: 'Industry: ₹165' },
    { label: 'Click-to-Purchase Rate', value: '6.7%', change: 11, benchmark: 'Industry: 4.8%' },
    { label: 'Avg Order Value', value: '₹1,850', change: 5, benchmark: 'Industry: ₹1,420' },
  ];

  breakdownData = signal<BreakdownRow[]>(this.getHookBreakdown());

  constructor() {
    this.maxChartVal = Math.max(...this.chartData.map(d => Math.max(d.values['ROAS'], d.values['CTR'], d.values['CPA'] / 100, d.values['Spend'])));
  }

  private generateChartData() {
    const data: { label: string; values: Record<string, number> }[] = [];
    for (let i = 1; i <= 30; i++) {
      data.push({
        label: String(i),
        values: {
          ROAS: +(3 + Math.random() * 2).toFixed(1),
          CTR: +(1.5 + Math.random() * 1.5).toFixed(1),
          CPA: Math.round(250 + Math.random() * 150),
          Spend: Math.round(30 + Math.random() * 30),
        }
      });
    }
    this.maxChartVal = Math.max(...data.map(d => {
      return Math.max(d.values['ROAS'], d.values['CTR'], d.values['CPA'], d.values['Spend']);
    }));
    return data;
  }

  getYAxisLabels(): { text: string; pos: number }[] {
    const max = this.maxChartVal;
    return [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      text: this.activeChartTab === 'ROAS' ? `${(max * pct).toFixed(1)}x` :
            this.activeChartTab === 'CTR' ? `${(max * pct).toFixed(1)}%` :
            this.activeChartTab === 'CPA' ? `₹${Math.round(max * pct)}` :
            `₹${Math.round(max * pct)}K`,
      pos: Math.round(pct * 200),
    }));
  }

  switchBreakdown(tab: string) {
    this.activeBreakdownTab = tab;
    switch (tab) {
      case 'By Hook DNA': this.breakdownData.set(this.getHookBreakdown()); break;
      case 'By Visual DNA': this.breakdownData.set(this.getVisualBreakdown()); break;
      case 'By Campaign': this.breakdownData.set(this.getCampaignBreakdown()); break;
      case 'By Audience': this.breakdownData.set(this.getAudienceBreakdown()); break;
    }
  }

  private getHookBreakdown(): BreakdownRow[] {
    return [
      { label: 'Shock Statement', spend: '₹3.2L', roas: 4.8, cpa: '₹245', ctr: 3.1, impressions: '8.2L', conversions: 1306, trend: 'up' },
      { label: 'Price Anchor', spend: '₹2.8L', roas: 4.2, cpa: '₹280', ctr: 2.8, impressions: '7.1L', conversions: 1000, trend: 'up' },
      { label: 'Social Proof', spend: '₹2.1L', roas: 3.9, cpa: '₹295', ctr: 2.5, impressions: '5.8L', conversions: 712, trend: 'flat' },
      { label: 'Curiosity', spend: '₹1.9L', roas: 3.5, cpa: '₹340', ctr: 2.2, impressions: '5.1L', conversions: 559, trend: 'down' },
      { label: 'Authority', spend: '₹1.4L', roas: 3.1, cpa: '₹380', ctr: 1.9, impressions: '3.6L', conversions: 368, trend: 'flat' },
      { label: 'Urgency', spend: '₹1.0L', roas: 2.8, cpa: '₹410', ctr: 1.7, impressions: '2.0L', conversions: 244, trend: 'down' },
    ];
  }

  private getVisualBreakdown(): BreakdownRow[] {
    return [
      { label: 'UGC Style', spend: '₹3.5L', roas: 4.5, cpa: '₹260', ctr: 3.0, impressions: '9.0L', conversions: 1346, trend: 'up' },
      { label: 'Before/After', spend: '₹2.5L', roas: 4.1, cpa: '₹290', ctr: 2.7, impressions: '6.5L', conversions: 862, trend: 'up' },
      { label: 'Macro Texture', spend: '₹2.2L', roas: 3.8, cpa: '₹310', ctr: 2.4, impressions: '5.2L', conversions: 710, trend: 'flat' },
      { label: 'Lifestyle', spend: '₹2.0L', roas: 3.4, cpa: '₹345', ctr: 2.1, impressions: '4.8L', conversions: 580, trend: 'flat' },
      { label: 'Product Focus', spend: '₹1.2L', roas: 3.0, cpa: '₹390', ctr: 1.8, impressions: '2.8L', conversions: 308, trend: 'down' },
      { label: 'Text-Heavy', spend: '₹1.0L', roas: 2.6, cpa: '₹435', ctr: 1.5, impressions: '1.5L', conversions: 230, trend: 'down' },
    ];
  }

  private getCampaignBreakdown(): BreakdownRow[] {
    return [
      { label: 'Collagen Range — Feb', spend: '₹4.2L', roas: 4.6, cpa: '₹255', ctr: 3.2, impressions: '10.5L', conversions: 1647, trend: 'up' },
      { label: 'Vitamin C Launch', spend: '₹3.1L', roas: 3.9, cpa: '₹305', ctr: 2.6, impressions: '7.8L', conversions: 1016, trend: 'up' },
      { label: 'Bundle Offers', spend: '₹2.8L', roas: 3.5, cpa: '₹330', ctr: 2.3, impressions: '6.2L', conversions: 848, trend: 'flat' },
      { label: 'Retargeting — Cart', spend: '₹1.5L', roas: 5.2, cpa: '₹180', ctr: 4.1, impressions: '2.1L', conversions: 833, trend: 'up' },
      { label: 'Brand Awareness', spend: '₹0.8L', roas: 1.8, cpa: '₹520', ctr: 1.2, impressions: '4.2L', conversions: 154, trend: 'flat' },
    ];
  }

  private getAudienceBreakdown(): BreakdownRow[] {
    return [
      { label: 'Women 25-34, Metro', spend: '₹3.8L', roas: 4.6, cpa: '₹245', ctr: 3.1, impressions: '9.5L', conversions: 1551, trend: 'up' },
      { label: 'Women 35-44, Health', spend: '₹2.9L', roas: 4.1, cpa: '₹285', ctr: 2.7, impressions: '7.2L', conversions: 1018, trend: 'up' },
      { label: 'Men 25-34, Fitness', spend: '₹2.1L', roas: 3.5, cpa: '₹335', ctr: 2.3, impressions: '5.0L', conversions: 627, trend: 'flat' },
      { label: 'Women 18-24, Beauty', spend: '₹1.8L', roas: 3.1, cpa: '₹375', ctr: 2.0, impressions: '4.5L', conversions: 480, trend: 'down' },
      { label: 'All 45+, Wellness', spend: '₹1.8L', roas: 2.8, cpa: '₹420', ctr: 1.6, impressions: '3.6L', conversions: 429, trend: 'flat' },
    ];
  }
}
