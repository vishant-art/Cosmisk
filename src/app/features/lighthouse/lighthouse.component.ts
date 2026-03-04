const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { DateRangeService } from '../../core/services/date-range.service';
import { environment } from '../../../environments/environment';

interface Campaign {
  name: string;
  budget: string;
  spent: string;
  spentPct: number;
  paceStatus: 'On Track' | 'Ahead' | 'Behind' | 'Critical';
  roas: number;
  recommendation: string;
}

@Component({
  selector: 'app-lighthouse',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-page-title font-display text-navy m-0">Lighthouse</h1>
        <p class="text-sm text-gray-500 font-body mt-1 mb-0">Budget pacing and spend optimization</p>
      </div>

      @if (loading()) {
        <!-- Loading State -->
        <div class="bg-white rounded-card shadow-card p-6 animate-pulse">
          <div class="h-4 bg-gray-200 rounded w-48 mb-4"></div>
          <div class="h-8 bg-gray-200 rounded-full w-full mb-4"></div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            @for (i of [1,2,3,4]; track i) {
              <div class="bg-gray-50 rounded-lg p-3">
                <div class="h-2 bg-gray-200 rounded w-16 mb-2"></div>
                <div class="h-5 bg-gray-200 rounded w-20"></div>
              </div>
            }
          </div>
        </div>
        <div class="bg-white rounded-card shadow-card overflow-hidden animate-pulse">
          <div class="p-4 border-b border-gray-100">
            <div class="h-4 bg-gray-200 rounded w-36"></div>
          </div>
          <div class="p-4 space-y-3">
            @for (i of [1,2,3]; track i) {
              <div class="h-10 bg-gray-100 rounded w-full"></div>
            }
          </div>
        </div>
      } @else {
        <!-- Monthly Budget Overview -->
        <div class="bg-white rounded-card shadow-card p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-display text-navy m-0">Monthly Budget Progress</h2>
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 rounded-full"
                [ngClass]="{
                  'bg-green-500': overallStatus === 'ON TRACK',
                  'bg-blue-500': overallStatus === 'AHEAD',
                  'bg-amber-500': overallStatus === 'BEHIND',
                  'bg-red-500': overallStatus === 'CRITICAL'
                }"></span>
              <span class="text-sm font-body font-semibold"
                [ngClass]="{
                  'text-green-600': overallStatus === 'ON TRACK',
                  'text-blue-600': overallStatus === 'AHEAD',
                  'text-amber-600': overallStatus === 'BEHIND',
                  'text-red-600': overallStatus === 'CRITICAL'
                }">
                {{ overallStatus }}
              </span>
            </div>
          </div>

          <!-- Budget bar -->
          <div class="mb-4">
            <div class="flex justify-between text-xs font-body text-gray-500 mb-1">
              <span>\u20B90</span>
              <span>Budget: \u20B9{{ totalBudget }}L</span>
            </div>
            <div class="relative h-8 bg-gray-100 rounded-full overflow-hidden">
              <!-- Spend progress -->
              <div class="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                [ngClass]="{
                  'bg-green-500': overallStatus === 'ON TRACK',
                  'bg-blue-500': overallStatus === 'AHEAD',
                  'bg-amber-500': overallStatus === 'BEHIND',
                  'bg-red-500': overallStatus === 'CRITICAL'
                }"
                [style.width.%]="spendProgress">
              </div>
              <!-- Time elapsed marker -->
              <div class="absolute inset-y-0 w-0.5 bg-navy/60 z-10"
                [style.left.%]="timeElapsed">
                <div class="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-body text-navy whitespace-nowrap">
                  Day {{ currentDay }}/{{ totalDays }}
                </div>
              </div>
            </div>
            <div class="flex justify-between mt-2">
              <div class="text-xs font-body">
                <span class="text-gray-500">Spent: </span>
                <span class="font-semibold text-navy">\u20B9{{ totalSpent }}L</span>
                <span class="text-gray-400"> ({{ spendProgress }}%)</span>
              </div>
              <div class="text-xs font-body">
                <span class="text-gray-500">Remaining: </span>
                <span class="font-semibold text-navy">\u20B9{{ remaining }}L</span>
              </div>
            </div>
          </div>

          <!-- Status metrics -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div class="bg-gray-50 rounded-lg p-3">
              <span class="text-[10px] text-gray-500 font-body uppercase">Daily Budget</span>
              <div class="text-lg font-display text-navy mt-0.5">\u20B9{{ dailyBudget }}K</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-3">
              <span class="text-[10px] text-gray-500 font-body uppercase">Avg Daily Spend</span>
              <div class="text-lg font-display text-navy mt-0.5">\u20B9{{ avgDailySpend }}K</div>
            </div>
            <div class="bg-gray-50 rounded-lg p-3">
              <span class="text-[10px] text-gray-500 font-body uppercase">Projected EOM</span>
              <div class="text-lg font-display mt-0.5"
                [ngClass]="projectedEom > totalBudget * 100 ? 'text-amber-600' : 'text-navy'">
                \u20B9{{ projectedEom / 100 }}L
              </div>
            </div>
            <div class="bg-gray-50 rounded-lg p-3">
              <span class="text-[10px] text-gray-500 font-body uppercase">Utilization</span>
              <div class="text-lg font-display mt-0.5"
                [ngClass]="utilization >= 90 && utilization <= 105 ? 'text-green-600' : 'text-amber-600'">
                {{ utilization }}%
              </div>
            </div>
          </div>

          <!-- AI Recommendation -->
          <div class="mt-4 p-4 rounded-lg border-l-4"
            [ngClass]="{
              'bg-green-50 border-green-500': overallStatus === 'ON TRACK',
              'bg-blue-50 border-blue-500': overallStatus === 'AHEAD',
              'bg-amber-50 border-amber-500': overallStatus === 'BEHIND',
              'bg-red-50 border-red-500': overallStatus === 'CRITICAL'
            }">
            <div class="flex items-start gap-2">
              <lucide-icon name="lightbulb" [size]="14" class="text-yellow-500 mt-0.5 shrink-0"></lucide-icon>
              <div>
                <h4 class="text-xs font-body font-semibold m-0 mb-1"
                  [ngClass]="{
                    'text-green-800': overallStatus === 'ON TRACK',
                    'text-blue-800': overallStatus === 'AHEAD',
                    'text-amber-800': overallStatus === 'BEHIND',
                    'text-red-800': overallStatus === 'CRITICAL'
                  }">
                  AI Recommendation
                </h4>
                <p class="text-xs font-body m-0 leading-relaxed"
                  [ngClass]="{
                    'text-green-700': overallStatus === 'ON TRACK',
                    'text-blue-700': overallStatus === 'AHEAD',
                    'text-amber-700': overallStatus === 'BEHIND',
                    'text-red-700': overallStatus === 'CRITICAL'
                  }">
                  {{ aiRecommendation }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Campaign-Level Pacing Table -->
        <div class="bg-white rounded-card shadow-card overflow-hidden">
          <div class="p-4 border-b border-gray-100">
            <h2 class="text-base font-display text-navy m-0">Campaign Pacing</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs font-body">
              <thead>
                <tr class="bg-gray-50 text-gray-500">
                  <th class="px-4 py-3 text-left font-semibold">Campaign</th>
                  <th class="px-4 py-3 text-right font-semibold">Budget</th>
                  <th class="px-4 py-3 text-right font-semibold">Spent</th>
                  <th class="px-4 py-3 text-center font-semibold">Pace</th>
                  <th class="px-4 py-3 text-left font-semibold w-40">Progress</th>
                  <th class="px-4 py-3 text-right font-semibold">ROAS</th>
                  <th class="px-4 py-3 text-left font-semibold">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                @for (campaign of campaigns; track campaign.name) {
                  <tr class="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3 font-medium text-navy">{{ campaign.name }}</td>
                    <td class="px-4 py-3 text-right text-gray-600">{{ campaign.budget }}</td>
                    <td class="px-4 py-3 text-right text-gray-600">{{ campaign.spent }}</td>
                    <td class="px-4 py-3 text-center">
                      <span class="px-2 py-0.5 rounded-pill text-[10px] font-semibold"
                        [ngClass]="{
                          'bg-green-50 text-green-700': campaign.paceStatus === 'On Track',
                          'bg-blue-50 text-blue-700': campaign.paceStatus === 'Ahead',
                          'bg-amber-50 text-amber-700': campaign.paceStatus === 'Behind',
                          'bg-red-50 text-red-700': campaign.paceStatus === 'Critical'
                        }">
                        {{ campaign.paceStatus }}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div class="h-full rounded-full transition-all"
                          [ngClass]="{
                            'bg-green-500': campaign.paceStatus === 'On Track',
                            'bg-blue-500': campaign.paceStatus === 'Ahead',
                            'bg-amber-500': campaign.paceStatus === 'Behind',
                            'bg-red-500': campaign.paceStatus === 'Critical'
                          }"
                          [style.width.%]="campaign.spentPct"></div>
                      </div>
                      <span class="text-[10px] text-gray-400 font-body">{{ campaign.spentPct }}%</span>
                    </td>
                    <td class="px-4 py-3 text-right font-semibold"
                      [ngClass]="campaign.roas >= 4 ? 'text-green-600' : campaign.roas >= 3 ? 'text-navy' : 'text-red-600'">
                      {{ campaign.roas }}x
                    </td>
                    <td class="px-4 py-3 text-gray-600 max-w-[200px]">{{ campaign.recommendation }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `
})
export default class LighthouseComponent implements OnInit {
  private api = inject(ApiService);
  private adAccountService = inject(AdAccountService);
  private dateRangeService = inject(DateRangeService);

  loading = signal(true);

  // Budget overview values (in Lakhs)
  totalBudget = 0;
  totalSpent = 0;
  remaining = 0;
  currentDay = 1;
  totalDays = 30;
  timeElapsed = 0;
  spendProgress = 0;
  dailyBudget = 0;
  avgDailySpend = 0;
  projectedEom = 0;
  utilization = 0;

  campaigns: Campaign[] = [];

  private accountEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    const datePreset = this.dateRangeService.datePreset();
    if (acc) {
      this.loadCampaignData(acc.id, acc.credential_group, datePreset);
    } else {
      this.loading.set(false);
    }
  }, { allowSignalWrites: true });

  ngOnInit() {}

  get overallStatus(): 'ON TRACK' | 'AHEAD' | 'BEHIND' | 'CRITICAL' {
    if (this.timeElapsed === 0) return 'ON TRACK';
    const ratio = this.spendProgress / this.timeElapsed;
    if (ratio >= 0.95 && ratio <= 1.05) return 'ON TRACK';
    if (ratio > 1.05) return 'AHEAD';
    if (ratio >= 0.8) return 'BEHIND';
    return 'CRITICAL';
  }

  get aiRecommendation(): string {
    if (this.campaigns.length === 0) {
      return 'Connect an ad account to get budget pacing insights and AI-powered recommendations.';
    }
    const topCampaign = [...this.campaigns].sort((a, b) => b.roas - a.roas)[0];
    const lowCampaign = [...this.campaigns].sort((a, b) => a.roas - b.roas)[0];
    switch (this.overallStatus) {
      case 'ON TRACK':
        return `Your spend is well-paced for this period. Continue current budget allocation. Consider scaling "${topCampaign?.name}" (${topCampaign?.roas}x ROAS) by 10-15% to maximize remaining budget efficiency.`;
      case 'AHEAD':
        return `You're spending faster than planned. Consider reducing daily budgets by 10% on lower-performing campaigns like "${lowCampaign?.name}" to avoid overspend. Redirect surplus to "${topCampaign?.name}" which has the highest ROAS.`;
      case 'BEHIND':
        return `You're under-pacing. Increase daily budgets on top performers like "${topCampaign?.name}" by 15-20%. Consider launching new creatives from Director Lab to increase eligible auction inventory.`;
      case 'CRITICAL':
        return 'Spend is critically behind target. Immediate action needed: increase all campaign budgets by 25%, expand audience targeting, and activate backup creatives from your asset library.';
    }
  }

  private loadCampaignData(accountId: string, credentialGroup: string, datePreset: string) {
    this.loading.set(true);
    this.api.get<any>(environment.ANALYTICS_FULL, {
      account_id: accountId,
      credential_group: credentialGroup,
      date_preset: datePreset,
    }).subscribe({
      next: (res) => {
        if (res.success && res.campaignBreakdown?.length) {
          this.processCampaignData(res.campaignBreakdown, datePreset);
        } else {
          this.campaigns = [];
          this.resetBudgetMetrics();
        }
        this.loading.set(false);
      },
      error: () => {
        this.campaigns = [];
        this.resetBudgetMetrics();
        this.loading.set(false);
      },
    });
  }

  private processCampaignData(
    breakdown: Array<{ label: string; spend: number; roas: number; cpa: number; ctr: number; impressions: number; conversions: number }>,
    datePreset: string,
  ) {
    // Calculate total spend across all campaigns
    const totalSpendRaw = breakdown.reduce((sum, c) => sum + (c.spend || 0), 0);

    // Determine days in period
    const days = this.daysFromPreset(datePreset);
    const now = new Date();
    const dayOfMonth = now.getDate();

    // Estimate monthly budget: project spend across full month
    // Assume current spend rate extrapolated to totalDays
    this.totalDays = days;
    this.currentDay = Math.min(dayOfMonth, days);

    // Estimate total budget as 1.15x of projected spend (reasonable assumption without explicit budget data)
    const dailySpendRate = totalSpendRaw / Math.max(this.currentDay, 1);
    const estimatedMonthlyBudget = dailySpendRate * this.totalDays * 1.15;

    // Convert to Lakhs (1L = 100,000)
    this.totalBudget = Math.round((estimatedMonthlyBudget / 100000) * 10) / 10;
    this.totalSpent = Math.round((totalSpendRaw / 100000) * 10) / 10;
    this.remaining = Math.round((this.totalBudget - this.totalSpent) * 10) / 10;
    if (this.remaining < 0) this.remaining = 0;

    this.timeElapsed = Math.round((this.currentDay / this.totalDays) * 100);
    this.spendProgress = this.totalBudget > 0 ? Math.round((this.totalSpent / this.totalBudget) * 100) : 0;
    this.dailyBudget = Math.round((this.totalBudget * 100000) / this.totalDays / 1000);
    this.avgDailySpend = this.currentDay > 0 ? Math.round((this.totalSpent * 100000) / this.currentDay / 1000) : 0;
    this.projectedEom = Math.round(this.avgDailySpend * this.totalDays);
    this.utilization = this.timeElapsed > 0 ? Math.round((this.spendProgress / this.timeElapsed) * 100) : 0;

    // Map campaigns
    this.campaigns = breakdown.map(c => {
      const campSpend = c.spend || 0;
      const campBudget = campSpend * 1.15; // estimated budget
      const campSpentPct = campBudget > 0 ? Math.round((campSpend / campBudget) * 100) : 0;

      // Determine pace status from spend percentage vs time elapsed
      const ratio = this.timeElapsed > 0 ? campSpentPct / this.timeElapsed : 1;
      let paceStatus: 'On Track' | 'Ahead' | 'Behind' | 'Critical';
      if (ratio >= 0.95 && ratio <= 1.05) paceStatus = 'On Track';
      else if (ratio > 1.05) paceStatus = 'Ahead';
      else if (ratio >= 0.8) paceStatus = 'Behind';
      else paceStatus = 'Critical';

      const roas = Math.round((c.roas || 0) * 10) / 10;

      return {
        name: c.label || 'Unknown Campaign',
        budget: this.formatCurrency(campBudget),
        spent: this.formatCurrency(campSpend),
        spentPct: campSpentPct,
        paceStatus,
        roas,
        recommendation: this.generateRecommendation(paceStatus, roas, c.label),
      };
    });

    // Sort: highest ROAS first
    this.campaigns.sort((a, b) => b.roas - a.roas);
  }

  private generateRecommendation(pace: string, roas: number, name: string): string {
    if (pace === 'Critical' && roas < 2) return 'Review targeting; consider pausing low CTR ad sets';
    if (pace === 'Critical') return 'Increase budget by 25% to catch up on pacing';
    if (pace === 'Behind' && roas >= 3) return 'Expand audience; increase daily budget by 15-20%';
    if (pace === 'Behind') return 'Expand audience; add lookalike 2-5%';
    if (pace === 'Ahead' && roas >= 4) return 'Performing well, maintain pace or scale further';
    if (pace === 'Ahead') return 'Reduce daily budget by 10% to avoid overspend';
    if (roas >= 4) return 'Scale top ad sets by 15%';
    if (roas >= 3) return 'Performing well, maintain pace';
    return 'Monitor performance closely; test new creatives';
  }

  private formatCurrency(amount: number): string {
    if (amount >= 100000) {
      return `\u20B9${(amount / 100000).toFixed(1)}L`;
    }
    if (amount >= 1000) {
      return `\u20B9${(amount / 1000).toFixed(1)}K`;
    }
    return `\u20B9${Math.round(amount)}`;
  }

  private daysFromPreset(preset: string): number {
    if (preset.includes('7')) return 7;
    if (preset.includes('14')) return 14;
    if (preset.includes('30')) return 30;
    if (preset === 'this_month') {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    }
    if (preset === 'last_month') {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    }
    return 30;
  }

  private resetBudgetMetrics() {
    this.totalBudget = 0;
    this.totalSpent = 0;
    this.remaining = 0;
    this.currentDay = 1;
    this.totalDays = 30;
    this.timeElapsed = 0;
    this.spendProgress = 0;
    this.dailyBudget = 0;
    this.avgDailySpend = 0;
    this.projectedEom = 0;
    this.utilization = 0;
  }
}
