const _BUILD_VER = '2026-02-13-v2';
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-page-title font-display text-navy m-0">Lighthouse</h1>
        <p class="text-sm text-gray-500 font-body mt-1 mb-0">Budget pacing and spend optimization</p>
      </div>

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
            <span>₹0</span>
            <span>Budget: ₹{{ totalBudget }}L</span>
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
              <span class="font-semibold text-navy">₹{{ totalSpent }}L</span>
              <span class="text-gray-400"> ({{ spendProgress }}%)</span>
            </div>
            <div class="text-xs font-body">
              <span class="text-gray-500">Remaining: </span>
              <span class="font-semibold text-navy">₹{{ remaining }}L</span>
            </div>
          </div>
        </div>

        <!-- Status metrics -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div class="bg-gray-50 rounded-lg p-3">
            <span class="text-[10px] text-gray-500 font-body uppercase">Daily Budget</span>
            <div class="text-lg font-display text-navy mt-0.5">₹{{ dailyBudget }}K</div>
          </div>
          <div class="bg-gray-50 rounded-lg p-3">
            <span class="text-[10px] text-gray-500 font-body uppercase">Avg Daily Spend</span>
            <div class="text-lg font-display text-navy mt-0.5">₹{{ avgDailySpend }}K</div>
          </div>
          <div class="bg-gray-50 rounded-lg p-3">
            <span class="text-[10px] text-gray-500 font-body uppercase">Projected EOM</span>
            <div class="text-lg font-display mt-0.5"
              [ngClass]="projectedEom > totalBudget * 100 ? 'text-amber-600' : 'text-navy'">
              ₹{{ projectedEom / 100 }}L
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
            <span class="text-sm mt-0.5">💡</span>
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
    </div>
  `
})
export default class LighthouseComponent {
  totalBudget = 15;
  totalSpent = 8.4;
  remaining = +(this.totalBudget - this.totalSpent).toFixed(1);
  currentDay = 13;
  totalDays = 28;
  timeElapsed = Math.round((this.currentDay / this.totalDays) * 100);
  spendProgress = Math.round((this.totalSpent / this.totalBudget) * 100);
  dailyBudget = Math.round((this.totalBudget * 100000) / this.totalDays / 1000);
  avgDailySpend = Math.round((this.totalSpent * 100000) / this.currentDay / 1000);
  projectedEom = Math.round(this.avgDailySpend * this.totalDays);
  utilization = Math.round((this.spendProgress / this.timeElapsed) * 100);

  get overallStatus(): 'ON TRACK' | 'AHEAD' | 'BEHIND' | 'CRITICAL' {
    const ratio = this.spendProgress / this.timeElapsed;
    if (ratio >= 0.95 && ratio <= 1.05) return 'ON TRACK';
    if (ratio > 1.05) return 'AHEAD';
    if (ratio >= 0.8) return 'BEHIND';
    return 'CRITICAL';
  }

  get aiRecommendation(): string {
    switch (this.overallStatus) {
      case 'ON TRACK':
        return 'Your spend is well-paced for this month. Continue current budget allocation. Consider scaling winning creatives (ROAS > 4x) by 10-15% to maximize remaining budget efficiency.';
      case 'AHEAD':
        return 'You\'re spending faster than planned. Consider reducing daily budgets by 10% on lower-performing campaigns to avoid overspend. Redirect surplus to Retargeting which has the highest ROAS.';
      case 'BEHIND':
        return 'You\'re under-pacing by ~16%. Increase daily budgets on top 3 winning creatives by 15-20%. Consider launching 2-3 new creatives from Director Lab to increase eligible auction inventory.';
      case 'CRITICAL':
        return 'Spend is critically behind target. Immediate action needed: increase all campaign budgets by 25%, expand audience targeting, and activate backup creatives from your asset library.';
    }
  }

  campaigns: Campaign[] = [
    {
      name: 'Collagen Range — Feb',
      budget: '₹5.0L',
      spent: '₹3.1L',
      spentPct: 62,
      paceStatus: 'On Track',
      roas: 4.6,
      recommendation: 'Scale top 2 ad sets by 15%',
    },
    {
      name: 'Vitamin C Launch',
      budget: '₹3.5L',
      spent: '₹2.4L',
      spentPct: 69,
      paceStatus: 'Ahead',
      roas: 3.9,
      recommendation: 'Reduce daily budget by ₹2K',
    },
    {
      name: 'Bundle Offers',
      budget: '₹3.0L',
      spent: '₹1.2L',
      spentPct: 40,
      paceStatus: 'Behind',
      roas: 3.5,
      recommendation: 'Expand audience; add lookalike 2-5%',
    },
    {
      name: 'Retargeting — Cart',
      budget: '₹2.0L',
      spent: '₹1.1L',
      spentPct: 55,
      paceStatus: 'On Track',
      roas: 5.2,
      recommendation: 'Performing well, maintain pace',
    },
    {
      name: 'Brand Awareness',
      budget: '₹1.5L',
      spent: '₹0.6L',
      spentPct: 40,
      paceStatus: 'Behind',
      roas: 1.8,
      recommendation: 'Review targeting; consider pausing low CTR ad sets',
    },
  ];
}
