const _BUILD_VER = '2026-03-03-v1';
import { Component, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AreaChartComponent } from '../../shared/components/area-chart/area-chart.component';
import { AdAccountService } from '../../core/services/ad-account.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { DateRangeService } from '../../core/services/date-range.service';
import { environment } from '../../../environments/environment';

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
  imports: [CommonModule, FormsModule, LucideAngularModule, AreaChartComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Analytics</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Deep dive into your ad performance</p>
        </div>
        <div class="flex items-center gap-3">
          <select [ngModel]="dateRangeService.datePreset()" (ngModelChange)="onDateRangeChange($event)" class="px-3 py-2 border border-gray-200 rounded-lg text-xs font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
            <option value="last_7d">Last 7 Days</option>
            <option value="last_14d">Last 14 Days</option>
            <option value="last_30d">Last 30 Days</option>
            <option value="this_month">Month to Date</option>
            <option value="last_month">Last Month</option>
          </select>
          <button (click)="exportCsv()" class="px-4 py-2 border border-gray-200 rounded-lg text-xs font-body text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
            <lucide-icon name="download" [size]="14"></lucide-icon>
            Export CSV
          </button>
        </div>
      </div>

      <!-- Row 1: KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        @if (loading()) {
          @for (i of [1,2,3,4]; track i) {
            <div class="bg-white rounded-card shadow-card p-4 animate-pulse">
              <div class="h-3 bg-gray-200 rounded w-20 mb-2"></div>
              <div class="h-6 bg-gray-200 rounded w-24 mb-2"></div>
              <div class="h-3 bg-gray-200 rounded w-16"></div>
            </div>
          }
        } @else {
          @for (kpi of kpis(); track kpi.label) {
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
        }
      </div>

      <!-- Row 2: KPI Cards (continued) -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        @if (loading()) {
          @for (i of [1,2,3,4]; track i) {
            <div class="bg-white rounded-card shadow-card p-4 animate-pulse">
              <div class="h-3 bg-gray-200 rounded w-20 mb-2"></div>
              <div class="h-6 bg-gray-200 rounded w-24 mb-2"></div>
              <div class="h-3 bg-gray-200 rounded w-16"></div>
            </div>
          }
        } @else {
          @for (kpi of kpis2(); track kpi.label) {
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
        }
      </div>

      <!-- Row 3: Performance Chart -->
      <div class="bg-white rounded-card shadow-card p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-display text-navy m-0">Performance Trend</h3>
          <div class="flex bg-gray-100 rounded-pill overflow-hidden">
            @for (tab of chartTabs; track tab) {
              <button
                (click)="activeChartTab.set(tab)"
                class="px-3 py-1 text-xs font-body transition-colors"
                [ngClass]="activeChartTab() === tab ? 'bg-accent text-white' : 'text-gray-500 hover:text-gray-700'">
                {{ tab }}
              </button>
            }
          </div>
        </div>
        @if (loading()) {
          <div class="h-52 animate-pulse bg-gray-100 rounded-lg"></div>
        } @else if (chartUnavailable() || chartData().length === 0) {
          <div class="h-52 flex flex-col items-center justify-center bg-gray-50 rounded-lg border border-gray-100">
            <lucide-icon name="bar-chart-3" [size]="32" class="text-gray-300 mb-2"></lucide-icon>
            <p class="text-sm text-gray-500 font-body m-0 mb-1">Daily trend data not available</p>
            <p class="text-[10px] text-gray-400 font-body m-0">Aggregate KPIs are shown above. Daily breakdowns require the Meta Insights API to return per-day data.</p>
          </div>
        } @else {
          <app-area-chart
            [labels]="analyticsChartLabels()"
            [values]="analyticsChartValues()"
            [label]="activeChartTab()"
            [color]="analyticsChartColor()"
            [suffix]="analyticsChartSuffix()"
            [height]="208" />
        }
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
                <th class="px-4 py-3 text-left font-semibold">{{ activeBreakdownTab === 'By Campaign' ? 'Campaign' : 'Audience' }}</th>
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
              @if (loading()) {
                @for (i of [1,2,3,4,5]; track i) {
                  <tr class="border-t border-gray-50">
                    <td class="px-4 py-3"><div class="h-3 bg-gray-200 rounded w-32 animate-pulse"></div></td>
                    <td class="px-4 py-3"><div class="h-3 bg-gray-200 rounded w-16 ml-auto animate-pulse"></div></td>
                    <td class="px-4 py-3"><div class="h-3 bg-gray-200 rounded w-10 ml-auto animate-pulse"></div></td>
                    <td class="px-4 py-3"><div class="h-3 bg-gray-200 rounded w-14 ml-auto animate-pulse"></div></td>
                    <td class="px-4 py-3"><div class="h-3 bg-gray-200 rounded w-10 ml-auto animate-pulse"></div></td>
                    <td class="px-4 py-3"><div class="h-3 bg-gray-200 rounded w-14 ml-auto animate-pulse"></div></td>
                    <td class="px-4 py-3"><div class="h-3 bg-gray-200 rounded w-10 ml-auto animate-pulse"></div></td>
                    <td class="px-4 py-3"><div class="h-3 bg-gray-200 rounded w-6 ml-auto animate-pulse"></div></td>
                  </tr>
                }
              } @else {
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
                @if (breakdownData().length === 0) {
                  <tr><td colspan="8" class="px-4 py-8 text-center text-gray-400 text-sm">No data available</td></tr>
                }
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
          @if (loading()) {
            <div class="space-y-3">
              @for (i of [1,2,3]; track i) {
                <div class="animate-pulse">
                  <div class="h-3 bg-gray-200 rounded w-40 mb-2"></div>
                  <div class="h-2 bg-gray-100 rounded-full"></div>
                </div>
              }
            </div>
          } @else {
            <div class="space-y-3">
              @for (segment of audienceSegments(); track segment.label) {
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
              @if (audienceSegments().length === 0) {
                <p class="text-xs text-gray-400 text-center py-4">Connect an ad account to see audience data</p>
              }
            </div>
          }
        </div>

        <!-- Unit Economics -->
        <div class="bg-white rounded-card shadow-card p-5">
          <h3 class="text-sm font-display text-navy m-0 mb-4">Unit Economics</h3>
          @if (loading()) {
            <div class="space-y-4">
              @for (i of [1,2,3,4,5]; track i) {
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg animate-pulse">
                  <div>
                    <div class="h-3 bg-gray-200 rounded w-32 mb-2"></div>
                    <div class="h-5 bg-gray-200 rounded w-16"></div>
                  </div>
                  <div class="h-4 bg-gray-200 rounded w-12"></div>
                </div>
              }
            </div>
          } @else {
            <div class="space-y-4">
              @for (metric of unitEconomics(); track metric.label) {
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
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export default class AnalyticsComponent {
  private adAccountService = inject(AdAccountService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  dateRangeService = inject(DateRangeService);

  loading = signal(true);
  activeChartTab = signal('ROAS');
  chartTabs = ['ROAS', 'CTR', 'CPA', 'Spend'];
  breakdownTabs = ['By Campaign', 'By Audience'];
  activeBreakdownTab = 'By Campaign';

  kpis = signal<KpiCard[]>([]);
  kpis2 = signal<KpiCard[]>([]);
  chartData = signal<{ label: string; values: Record<string, number> }[]>([]);
  audienceSegments = signal<{ label: string; roas: number; spend: string; share: number }[]>([]);
  unitEconomics = signal<{ label: string; value: string; change: number }[]>([]);
  breakdownData = signal<BreakdownRow[]>([]);

  private campaignBreakdown: BreakdownRow[] = [];
  private audienceBreakdown: BreakdownRow[] = [];

  private accountEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    const datePreset = this.dateRangeService.datePreset();
    if (acc) {
      this.loadAnalytics(acc.id, acc.credential_group, datePreset);
    } else {
      this.loading.set(false);
    }
  }, { allowSignalWrites: true });

  analyticsChartLabels = computed(() => this.chartData().map(d => d.label));

  analyticsChartValues = computed(() => {
    return this.chartData().map(d => d.values[this.activeChartTab()] || 0);
  });

  analyticsChartColor = computed(() => {
    const colors: Record<string, string> = { ROAS: '#6366F1', CTR: '#3B82F6', CPA: '#F59E0B', Spend: '#10B981' };
    return colors[this.activeChartTab()] || '#6366F1';
  });

  analyticsChartSuffix = computed(() => {
    const suffixes: Record<string, string> = { ROAS: 'x', CTR: '%', CPA: '', Spend: 'K' };
    return suffixes[this.activeChartTab()] || '';
  });

  onDateRangeChange(preset: string) {
    this.dateRangeService.setPreset(preset as any);
  }

  switchBreakdown(tab: string) {
    this.activeBreakdownTab = tab;
    if (tab === 'By Campaign') {
      this.breakdownData.set(this.campaignBreakdown);
    } else {
      this.breakdownData.set(this.audienceBreakdown);
    }
  }

  private formatIndian(n: number): string {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K';
    return '₹' + Math.round(n);
  }

  private formatCount(n: number): string {
    if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(Math.round(n));
  }

  private loadAnalytics(accountId: string, credentialGroup: string, datePreset: string) {
    this.loading.set(true);

    // Load KPIs (primary — known working endpoint)
    this.api.get<any>(environment.AD_ACCOUNT_KPIS, {
      account_id: accountId,
      credential_group: credentialGroup,
      date_preset: datePreset,
    }).subscribe({
      next: (res) => {
        if (res.success && res.kpis) {
          const k = res.kpis;
          this.kpis.set([
            { label: 'Total Spend', value: this.formatIndian(k.spend?.value || 0).replace('₹', ''), prefix: '₹', change: k.spend?.change || 0 },
            { label: 'Blended ROAS', value: String(k.roas?.value?.toFixed(1) || '0'), suffix: 'x', change: k.roas?.change || 0 },
            { label: 'Avg CPA', value: String(Math.round(k.cpa?.value || 0)), prefix: '₹', change: k.cpa?.change || 0 },
            { label: 'Avg CTR', value: String(k.ctr?.value?.toFixed(1) || '0'), suffix: '%', change: k.ctr?.change || 0 },
          ]);
          this.kpis2.set([
            { label: 'Impressions', value: this.formatCount(k.impressions?.value || 0), change: k.impressions?.change || 0 },
            { label: 'Clicks', value: this.formatCount(k.clicks?.value || 0), change: k.clicks?.change || 0 },
            { label: 'Conversions', value: this.formatCount(k.conversions?.value || 0), change: k.conversions?.change || 0 },
            { label: 'Revenue', value: this.formatIndian(k.revenue?.value || 0).replace('₹', ''), prefix: '₹', change: k.revenue?.change || 0 },
          ]);

          // Build unit economics from KPI data
          this.unitEconomics.set([
            { label: 'Cost Per Click', value: this.formatIndian(k.cpc?.value || (k.spend?.value && k.clicks?.value ? k.spend.value / k.clicks.value : 0)), change: k.cpc?.change || 0 },
            { label: 'Cost Per Acquisition', value: this.formatIndian(k.cpa?.value || 0), change: k.cpa?.change || 0 },
            { label: 'Return on Ad Spend', value: (k.roas?.value || 0).toFixed(1) + 'x', change: k.roas?.change || 0 },
            { label: 'Avg Order Value', value: this.formatIndian(k.aov?.value || (k.revenue?.value && k.conversions?.value ? k.revenue.value / k.conversions.value : 0)), change: k.aov?.change || 0 },
          ]);
        }
        this.loading.set(false);
        // Generate chart fallback if chart is still empty after KPIs loaded
        if (this.chartData().length === 0) {
          this.generateChartFromKpis(datePreset);
        }
      },
      error: () => { this.loading.set(false); },
    });

    // Load chart data (reuse dashboard chart endpoint)
    this.api.get<any>(environment.DASHBOARD_CHART, {
      account_id: accountId,
      credential_group: credentialGroup,
      date_preset: datePreset,
    }).subscribe({
      next: (res) => {
        const chartArr = res.chart || res.data || res.daily || res.chartData || [];
        if (res.success && chartArr.length) {
          this.chartData.set(chartArr.map((d: any) => {
            const dateStr = d.date || d.date_start || d.day || '';
            const parts = dateStr.split('-');
            return {
              label: parts.length >= 3 ? `${parts[1]}/${parts[2]}` : dateStr,
              values: {
                ROAS: d.roas ?? d.purchase_roas ?? 0,
                CTR: d.ctr ?? 0,
                CPA: d.cpa ?? d.cost_per_action ?? 0,
                Spend: Math.round((d.spend ?? 0) / 1000),
              },
            };
          }));
        } else {
          this.generateChartFromKpis(datePreset);
        }
      },
      error: () => {
        this.generateChartFromKpis(datePreset);
      },
    });

    // Try analytics/full for breakdowns, fallback to top-ads
    this.api.get<any>(environment.ANALYTICS_FULL, {
      account_id: accountId,
      credential_group: credentialGroup,
      date_preset: datePreset,
    }).subscribe({
      next: (res) => {
        if (res.success) {
          if (res.campaignBreakdown?.length) {
            this.campaignBreakdown = res.campaignBreakdown;
            if (this.activeBreakdownTab === 'By Campaign') this.breakdownData.set(this.campaignBreakdown);
          }
          if (res.audienceBreakdown?.length) {
            this.audienceBreakdown = res.audienceBreakdown;
            if (this.activeBreakdownTab === 'By Audience') this.breakdownData.set(this.audienceBreakdown);
            const totalSpend = res.audienceBreakdown.reduce((s: number, r: any) => s + (parseFloat(String(r.spend).replace(/[₹,LK]/g, '')) || 0), 0);
            this.audienceSegments.set(res.audienceBreakdown.slice(0, 5).map((r: any) => ({
              label: r.label, roas: r.roas, spend: r.spend,
              share: totalSpend > 0 ? Math.round((parseFloat(String(r.spend).replace(/[₹,LK]/g, '')) / totalSpend) * 100) : 0,
            })));
          }
          // If no breakdown data came from analytics/full, build from top-ads
          if (!res.campaignBreakdown?.length && !res.audienceBreakdown?.length) {
            this.buildBreakdownFromTopAds(accountId, credentialGroup, datePreset);
          }
        } else {
          this.buildBreakdownFromTopAds(accountId, credentialGroup, datePreset);
        }
      },
      error: () => {
        this.buildBreakdownFromTopAds(accountId, credentialGroup, datePreset);
      },
    });
  }

  chartUnavailable = signal(false);

  private generateChartFromKpis(_datePreset: string) {
    // Don't fake daily trends from aggregate KPIs — show empty state instead
    this.chartUnavailable.set(true);
  }

  exportCsv() {
    const rows: string[][] = [];
    // Header
    const kpiLabels = [...this.kpis(), ...this.kpis2()].map(k => k.label);
    const breakdown = this.breakdownData();

    if (breakdown.length) {
      const cols = Object.keys(breakdown[0]);
      rows.push(cols);
      for (const row of breakdown) {
        rows.push(cols.map(c => String((row as any)[c] ?? '')));
      }
    } else if (this.chartData().length) {
      const metricKeys = Object.keys(this.chartData()[0]?.values || {});
      rows.push(['Date', ...metricKeys]);
      for (const d of this.chartData()) {
        rows.push([d.label, ...metricKeys.map(k => String(d.values[k] ?? ''))]);
      }
    } else {
      rows.push(['Metric', 'Value', 'Change %']);
      for (const kpi of [...this.kpis(), ...this.kpis2()]) {
        rows.push([kpi.label, `${kpi.prefix ?? ''}${kpi.value}${kpi.suffix ?? ''}`, String(kpi.change)]);
      }
    }

    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cosmisk-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildBreakdownFromTopAds(accountId: string, credentialGroup: string, datePreset: string) {
    this.api.get<any>(environment.AD_ACCOUNT_TOP_ADS, {
      account_id: accountId,
      credential_group: credentialGroup,
      limit: 20,
      date_preset: datePreset,
    }).subscribe({
      next: (res) => {
        if (res.success && res.ads?.length) {
          // Group ads by campaign_name to build campaign breakdown
          const campaignMap = new Map<string, { spend: number; roas: number[]; cpa: number[]; ctr: number[]; impressions: number; conversions: number }>();
          res.ads.forEach((ad: any) => {
            const campName = ad.campaign_name || ad.adset_name || ad.name || 'Unknown Campaign';
            const existing = campaignMap.get(campName) || { spend: 0, roas: [], cpa: [], ctr: [], impressions: 0, conversions: 0 };
            existing.spend += ad.metrics?.spend || 0;
            if (ad.metrics?.roas) existing.roas.push(ad.metrics.roas);
            if (ad.metrics?.cpa) existing.cpa.push(ad.metrics.cpa);
            if (ad.metrics?.ctr) existing.ctr.push(ad.metrics.ctr);
            existing.impressions += ad.metrics?.impressions || 0;
            existing.conversions += ad.metrics?.conversions || 0;
            campaignMap.set(campName, existing);
          });

          const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
          this.campaignBreakdown = Array.from(campaignMap.entries()).map(([name, data]) => ({
            label: name.length > 35 ? name.substring(0, 32) + '...' : name,
            spend: this.formatIndian(data.spend),
            roas: Math.round(avg(data.roas) * 10) / 10,
            cpa: this.formatIndian(avg(data.cpa)),
            ctr: Math.round(avg(data.ctr) * 10) / 10,
            impressions: this.formatCount(data.impressions),
            conversions: data.conversions,
            trend: (avg(data.roas) >= 2 ? 'up' : avg(data.roas) >= 1 ? 'flat' : 'down') as 'up' | 'down' | 'flat',
          })).sort((a, b) => b.roas - a.roas);

          if (this.activeBreakdownTab === 'By Campaign') {
            this.breakdownData.set(this.campaignBreakdown);
          }

          // Build audience segments from top ads data
          const totalSpend = res.ads.reduce((s: number, a: any) => s + (a.metrics?.spend || 0), 0);
          if (totalSpend > 0) {
            // Group by ad format as proxy for audience
            const formatMap = new Map<string, { spend: number; roas: number[] }>();
            res.ads.forEach((ad: any) => {
              const format = ad.object_type === 'VIDEO' ? 'Video Ads' : 'Static Ads';
              const existing = formatMap.get(format) || { spend: 0, roas: [] };
              existing.spend += ad.metrics?.spend || 0;
              if (ad.metrics?.roas) existing.roas.push(ad.metrics.roas);
              formatMap.set(format, existing);
            });
            this.audienceSegments.set(Array.from(formatMap.entries()).map(([label, data]) => ({
              label,
              roas: Math.round(avg(data.roas) * 10) / 10,
              spend: this.formatIndian(data.spend),
              share: Math.round((data.spend / totalSpend) * 100),
            })));
          }
        }
      },
      error: () => this.toast.error('Load Failed', 'Could not load platform breakdown'),
    });
  }
}
