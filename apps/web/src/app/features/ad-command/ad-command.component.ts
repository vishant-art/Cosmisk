import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { InsightCardComponent } from '../../shared/components/insight-card/insight-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { LakhCrorePipe } from '../../shared/pipes/lakh-crore.pipe';
import { LucideAngularModule } from 'lucide-angular';
import { AdAccountService } from '../../core/services/ad-account.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { DateRangeService } from '../../core/services/date-range.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

type TabId = 'command' | 'performance' | 'fatigue' | 'briefs';

interface Creative {
  id: string;
  name: string;
  thumbnailUrl?: string;
  format: 'video' | 'image' | 'carousel';
  status: 'scaling' | 'healthy' | 'watch' | 'fatiguing' | 'dead';
  spend: number;
  roas: number;
  ctr: number;
  cpm: number;
  frequency: number;
  impressions: number;
  conversions: number;
  daysActive: number;
}

interface FatigueAlert {
  id: string;
  creativeId: string;
  creativeName: string;
  severity: 'critical' | 'warning';
  reason: string;
  frequency: number;
  ctrDecline: number;
  cpmIncrease: number;
  predictedDeath: string;
}

interface CreativeBrief {
  id: string;
  productName: string;
  productId?: string;
  format: string;
  length?: string;
  hookSuggestion: string;
  ctaSuggestion?: string;
  reasoning: string;
  status: 'pending' | 'in_production' | 'completed';
  createdAt: string;
}

interface CommandSummary {
  brief: string;
  spend: { value: number; change: number; sparkline: number[] };
  roas: { value: number; change: number; sparkline: number[] };
  savings: { value: number; change: number };
  fatigueCount: number;
  winnerCount: number;
  wastedSpend: number;
}

@Component({
  selector: 'app-ad-command',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    KpiCardComponent, InsightCardComponent, StatusBadgeComponent,
    LakhCrorePipe, LucideAngularModule
  ],
  template: `
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-display font-bold text-navy m-0 flex items-center gap-2">
          <lucide-icon name="command" [size]="24" class="text-accent"></lucide-icon>
          Ad Command
        </h1>
        <p class="text-sm text-gray-500 font-body m-0 mt-1">Your daily ad intelligence hub</p>
      </div>
      <div class="flex items-center gap-3">
        <select
          [(ngModel)]="datePreset"
          (ngModelChange)="onDateChange()"
          class="px-3 py-2 text-sm font-body bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20">
          <option value="last_7d">Last 7 days</option>
          <option value="last_14d">Last 14 days</option>
          <option value="last_30d">Last 30 days</option>
        </select>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex items-center gap-1 mb-6 bg-gray-100 rounded-lg p-1 overflow-x-auto">
      @for (tab of tabs; track tab.id) {
        <button
          (click)="activeTab.set(tab.id)"
          class="flex items-center gap-2 px-4 py-2 text-sm font-body font-medium rounded-md transition-all whitespace-nowrap"
          [class.bg-white]="activeTab() === tab.id"
          [class.shadow-sm]="activeTab() === tab.id"
          [class.text-navy]="activeTab() === tab.id"
          [class.text-gray-500]="activeTab() !== tab.id"
          [class.hover:text-gray-700]="activeTab() !== tab.id">
          <lucide-icon [name]="tab.icon" [size]="16"></lucide-icon>
          {{ tab.label }}
          @if (tab.id === 'fatigue' && fatigueAlerts().length > 0) {
            <span class="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full">
              {{ fatigueAlerts().length }}
            </span>
          }
        </button>
      }
    </div>

    <!-- Loading State -->
    @if (loading()) {
      <div class="flex items-center justify-center py-20">
        <div class="flex flex-col items-center gap-3">
          <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-gray-500 font-body">Loading data...</p>
        </div>
      </div>
    }

    <!-- Error State -->
    @if (error() && !loading()) {
      <div class="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
            <lucide-icon name="alert-circle" [size]="16" class="text-red-500"></lucide-icon>
          </div>
          <div>
            <p class="text-sm font-body font-semibold text-red-800 m-0">Failed to load data</p>
            <p class="text-xs font-body text-red-600 m-0 mt-0.5">{{ error() }}</p>
          </div>
        </div>
        <button
          (click)="loadData()"
          class="px-4 py-1.5 text-xs font-body font-semibold rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors cursor-pointer border-0">
          Retry
        </button>
      </div>
    }

    <!-- Tab Content -->
    @if (!loading() && !error()) {
      <!-- Command Center Tab -->
      @if (activeTab() === 'command') {
        <div class="space-y-6">
          <!-- Morning Brief -->
          <div class="card p-6">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 bg-gradient-to-br from-accent to-violet-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-accent/20">
                <lucide-icon name="sparkles" [size]="20" class="text-white"></lucide-icon>
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <h2 class="text-lg font-display font-semibold text-navy m-0">Today's Brief</h2>
                  <span class="px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-mono font-bold rounded">AI</span>
                </div>
                <p class="text-sm text-gray-700 font-body m-0 leading-relaxed whitespace-pre-line">{{ summary()?.brief || 'No brief available yet. Connect your Meta account to get started.' }}</p>
              </div>
            </div>
          </div>

          <!-- KPI Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <app-kpi-card
              title="Ad Spend"
              [value]="summary()?.spend?.value || 0"
              [change]="summary()?.spend?.change || 0"
              [isCurrency]="true"
              [sparkline]="summary()?.spend?.sparkline || []"
              color="default" />
            <app-kpi-card
              title="ROAS"
              [value]="summary()?.roas?.value || 0"
              [change]="summary()?.roas?.change || 0"
              suffix="x"
              [sparkline]="summary()?.roas?.sparkline || []"
              color="green" />
            <app-kpi-card
              title="Savings Found"
              [value]="summary()?.savings?.value || 0"
              [change]="summary()?.savings?.change || 0"
              [isCurrency]="true"
              color="green" />
            <div class="card p-4 flex flex-col justify-between">
              <p class="text-xs text-gray-500 font-body m-0 uppercase tracking-wider">Alert Summary</p>
              <div class="mt-2 space-y-1">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-600 font-body">Fatiguing Ads</span>
                  <span class="text-sm font-display font-bold text-red-500">{{ summary()?.fatigueCount || 0 }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-600 font-body">Winners</span>
                  <span class="text-sm font-display font-bold text-green-500">{{ summary()?.winnerCount || 0 }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-600 font-body">Wasted Spend</span>
                  <span class="text-sm font-display font-bold text-yellow-600">{{ summary()?.wastedSpend || 0 | lakhCrore }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="card p-6">
            <h3 class="text-sm font-display font-semibold text-navy m-0 mb-4">Quick Actions</h3>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                (click)="activeTab.set('fatigue')"
                class="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors border-0 cursor-pointer">
                <lucide-icon name="alert-triangle" [size]="18"></lucide-icon>
                <span class="text-sm font-body font-medium">View Fatiguing</span>
              </button>
              <button
                (click)="activeTab.set('performance')"
                class="flex items-center gap-2 px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors border-0 cursor-pointer">
                <lucide-icon name="trophy" [size]="18"></lucide-icon>
                <span class="text-sm font-body font-medium">See Winners</span>
              </button>
              <button
                (click)="activeTab.set('briefs')"
                class="flex items-center gap-2 px-4 py-3 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors border-0 cursor-pointer">
                <lucide-icon name="file-text" [size]="18"></lucide-icon>
                <span class="text-sm font-body font-medium">Generate Brief</span>
              </button>
              <a
                routerLink="/app/creative-engine"
                class="flex items-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors no-underline">
                <lucide-icon name="rocket" [size]="18"></lucide-icon>
                <span class="text-sm font-body font-medium">Create Ads</span>
              </a>
            </div>
          </div>
        </div>
      }

      <!-- Creative Performance Tab -->
      @if (activeTab() === 'performance') {
        <div class="space-y-6">
          <!-- Filters -->
          <div class="flex flex-wrap items-center gap-3">
            <select
              [(ngModel)]="formatFilter"
              class="px-3 py-2 text-sm font-body bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20">
              <option value="all">All Formats</option>
              <option value="video">Video</option>
              <option value="image">Static</option>
              <option value="carousel">Carousel</option>
            </select>
            <select
              [(ngModel)]="statusFilter"
              class="px-3 py-2 text-sm font-body bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20">
              <option value="all">All Status</option>
              <option value="scaling">Scaling</option>
              <option value="healthy">Healthy</option>
              <option value="watch">Watch</option>
              <option value="fatiguing">Fatiguing</option>
              <option value="dead">Dead</option>
            </select>
            <select
              [(ngModel)]="sortBy"
              class="px-3 py-2 text-sm font-body bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20">
              <option value="roas">Sort by ROAS</option>
              <option value="spend">Sort by Spend</option>
              <option value="ctr">Sort by CTR</option>
              <option value="frequency">Sort by Frequency</option>
            </select>
          </div>

          <!-- Creatives Table -->
          <div class="card overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-body font-semibold text-gray-500 uppercase tracking-wider">#</th>
                    <th class="px-4 py-3 text-left text-xs font-body font-semibold text-gray-500 uppercase tracking-wider">Creative</th>
                    <th class="px-4 py-3 text-left text-xs font-body font-semibold text-gray-500 uppercase tracking-wider">Spend</th>
                    <th class="px-4 py-3 text-left text-xs font-body font-semibold text-gray-500 uppercase tracking-wider">ROAS</th>
                    <th class="px-4 py-3 text-left text-xs font-body font-semibold text-gray-500 uppercase tracking-wider">CTR</th>
                    <th class="px-4 py-3 text-left text-xs font-body font-semibold text-gray-500 uppercase tracking-wider">Freq</th>
                    <th class="px-4 py-3 text-left text-xs font-body font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (creative of filteredCreatives(); track creative.id; let i = $index) {
                    <tr class="hover:bg-gray-50 transition-colors">
                      <td class="px-4 py-3 text-sm font-body text-gray-500">{{ i + 1 }}</td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-3">
                          @if (creative.thumbnailUrl) {
                            <img [src]="creative.thumbnailUrl" class="w-10 h-10 rounded-lg object-cover" />
                          } @else {
                            <div class="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                              <lucide-icon [name]="creative.format === 'video' ? 'video' : 'image'" [size]="16" class="text-gray-400"></lucide-icon>
                            </div>
                          }
                          <div>
                            <p class="text-sm font-body font-medium text-navy m-0 truncate max-w-[200px]">{{ creative.name }}</p>
                            <p class="text-xs font-body text-gray-400 m-0 capitalize">{{ creative.format }} · {{ creative.daysActive }}d</p>
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-sm font-body font-medium text-navy">{{ creative.spend | lakhCrore }}</td>
                      <td class="px-4 py-3">
                        <span class="text-sm font-display font-bold" [class.text-green-600]="creative.roas >= 3" [class.text-yellow-600]="creative.roas >= 1 && creative.roas < 3" [class.text-red-500]="creative.roas < 1">
                          {{ creative.roas.toFixed(1) }}x
                        </span>
                      </td>
                      <td class="px-4 py-3 text-sm font-body text-gray-600">{{ (creative.ctr * 100).toFixed(2) }}%</td>
                      <td class="px-4 py-3">
                        <span class="text-sm font-body" [class.text-red-500]="creative.frequency > 4" [class.text-yellow-600]="creative.frequency > 3" [class.text-gray-600]="creative.frequency <= 3">
                          {{ creative.frequency.toFixed(1) }}
                        </span>
                      </td>
                      <td class="px-4 py-3">
                        <app-status-badge [status]="creative.status" />
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="7" class="px-4 py-12 text-center">
                        <lucide-icon name="inbox" [size]="32" class="text-gray-300 mx-auto mb-2"></lucide-icon>
                        <p class="text-sm text-gray-500 font-body m-0">No creatives found</p>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- AI Insights -->
          @if (performanceInsights().length > 0) {
            <div class="card p-6">
              <h3 class="text-sm font-display font-semibold text-navy m-0 mb-4 flex items-center gap-2">
                <lucide-icon name="lightbulb" [size]="16" class="text-accent"></lucide-icon>
                Performance Insights
              </h3>
              <ul class="space-y-2 list-none p-0 m-0">
                @for (insight of performanceInsights(); track insight) {
                  <li class="flex items-start gap-2 text-sm text-gray-700 font-body">
                    <lucide-icon name="circle-dot" [size]="14" class="text-accent mt-1 shrink-0"></lucide-icon>
                    {{ insight }}
                  </li>
                }
              </ul>
            </div>
          }
        </div>
      }

      <!-- Fatigue Prediction Tab -->
      @if (activeTab() === 'fatigue') {
        <div class="space-y-6">
          <!-- Critical Alerts -->
          @if (criticalAlerts().length > 0) {
            <div>
              <h3 class="text-sm font-display font-semibold text-red-600 m-0 mb-3 flex items-center gap-2">
                <lucide-icon name="alert-circle" [size]="16"></lucide-icon>
                Critical — Replace Now ({{ criticalAlerts().length }})
              </h3>
              <div class="space-y-3">
                @for (alert of criticalAlerts(); track alert.id) {
                  <div class="card p-4 border-l-4 border-red-500">
                    <div class="flex items-start justify-between gap-4">
                      <div>
                        <p class="text-sm font-body font-semibold text-navy m-0">{{ alert.creativeName }}</p>
                        <p class="text-xs text-gray-500 font-body m-0 mt-1">{{ alert.reason }}</p>
                        <div class="flex items-center gap-4 mt-2">
                          <span class="text-xs font-body text-gray-400">Freq: <strong class="text-red-500">{{ alert.frequency.toFixed(1) }}</strong></span>
                          <span class="text-xs font-body text-gray-400">CTR: <strong class="text-red-500">↓{{ alert.ctrDecline.toFixed(0) }}%</strong></span>
                          <span class="text-xs font-body text-gray-400">Death: <strong>{{ alert.predictedDeath }}</strong></span>
                        </div>
                      </div>
                      <button
                        (click)="generateReplacementBrief(alert)"
                        class="px-3 py-1.5 text-xs font-body font-semibold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors border-0 cursor-pointer whitespace-nowrap">
                        Generate Brief
                      </button>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Warning Alerts -->
          @if (warningAlerts().length > 0) {
            <div>
              <h3 class="text-sm font-display font-semibold text-yellow-600 m-0 mb-3 flex items-center gap-2">
                <lucide-icon name="alert-triangle" [size]="16"></lucide-icon>
                Warning — Watch Closely ({{ warningAlerts().length }})
              </h3>
              <div class="space-y-3">
                @for (alert of warningAlerts(); track alert.id) {
                  <div class="card p-4 border-l-4 border-yellow-500">
                    <div class="flex items-start justify-between gap-4">
                      <div>
                        <p class="text-sm font-body font-semibold text-navy m-0">{{ alert.creativeName }}</p>
                        <p class="text-xs text-gray-500 font-body m-0 mt-1">{{ alert.reason }}</p>
                        <div class="flex items-center gap-4 mt-2">
                          <span class="text-xs font-body text-gray-400">Freq: <strong class="text-yellow-600">{{ alert.frequency.toFixed(1) }}</strong></span>
                          @if (alert.ctrDecline > 0) {
                            <span class="text-xs font-body text-gray-400">CTR: <strong class="text-yellow-600">↓{{ alert.ctrDecline.toFixed(0) }}%</strong></span>
                          }
                        </div>
                      </div>
                      <button
                        (click)="activeTab.set('performance')"
                        class="px-3 py-1.5 text-xs font-body font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors bg-white cursor-pointer whitespace-nowrap">
                        View Details
                      </button>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Healthy -->
          <div class="card p-6">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <lucide-icon name="check-circle" [size]="20" class="text-green-600"></lucide-icon>
                </div>
                <div>
                  <p class="text-lg font-display font-bold text-navy m-0">{{ healthyCount() }} Healthy</p>
                  <p class="text-xs text-gray-500 font-body m-0">No action needed</p>
                </div>
              </div>
              <button
                (click)="activeTab.set('performance'); statusFilter = 'healthy'"
                class="px-3 py-1.5 text-xs font-body font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors bg-white cursor-pointer">
                View All
              </button>
            </div>
          </div>

          <!-- Empty State -->
          @if (fatigueAlerts().length === 0) {
            <div class="card p-12 text-center">
              <div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <lucide-icon name="check-circle" [size]="32" class="text-green-600"></lucide-icon>
              </div>
              <h3 class="text-lg font-display font-semibold text-navy m-0 mb-2">All Clear!</h3>
              <p class="text-sm text-gray-500 font-body m-0">No fatiguing ads detected. Your creatives are performing well.</p>
            </div>
          }
        </div>
      }

      <!-- Creative Briefs Tab -->
      @if (activeTab() === 'briefs') {
        <div class="space-y-6">
          <!-- Generate Brief Button -->
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-display font-semibold text-navy m-0">Recommended Briefs</h3>
            <button
              (click)="generateNewBrief()"
              [disabled]="generatingBrief()"
              class="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-body font-semibold rounded-lg hover:bg-accent/90 transition-colors border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              @if (generatingBrief()) {
                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Generating...
              } @else {
                <lucide-icon name="sparkles" [size]="16"></lucide-icon>
                Generate New Brief
              }
            </button>
          </div>

          <!-- Briefs List -->
          <div class="space-y-4">
            @for (brief of briefs(); track brief.id) {
              <div class="card p-6">
                <div class="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div class="flex items-center gap-2 mb-1">
                      <h4 class="text-base font-display font-semibold text-navy m-0">{{ brief.productName }}</h4>
                      <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded uppercase"
                        [class.bg-yellow-100]="brief.status === 'pending'"
                        [class.text-yellow-700]="brief.status === 'pending'"
                        [class.bg-blue-100]="brief.status === 'in_production'"
                        [class.text-blue-700]="brief.status === 'in_production'"
                        [class.bg-green-100]="brief.status === 'completed'"
                        [class.text-green-700]="brief.status === 'completed'">
                        {{ brief.status.replace('_', ' ') }}
                      </span>
                    </div>
                    <p class="text-xs text-gray-400 font-body m-0">Created {{ formatDate(brief.createdAt) }}</p>
                  </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p class="text-xs text-gray-500 font-body m-0 uppercase tracking-wider">Format</p>
                    <p class="text-sm font-body font-medium text-navy m-0 mt-1 capitalize">{{ brief.format }}</p>
                  </div>
                  @if (brief.length) {
                    <div>
                      <p class="text-xs text-gray-500 font-body m-0 uppercase tracking-wider">Length</p>
                      <p class="text-sm font-body font-medium text-navy m-0 mt-1">{{ brief.length }}</p>
                    </div>
                  }
                  <div class="col-span-2">
                    <p class="text-xs text-gray-500 font-body m-0 uppercase tracking-wider">Hook</p>
                    <p class="text-sm font-body font-medium text-navy m-0 mt-1">{{ brief.hookSuggestion }}</p>
                  </div>
                </div>

                <div class="bg-gray-50 rounded-lg p-4">
                  <p class="text-xs text-gray-500 font-body m-0 uppercase tracking-wider mb-2">Why This Brief</p>
                  <p class="text-sm text-gray-700 font-body m-0">{{ brief.reasoning }}</p>
                </div>

                <div class="flex items-center gap-2 mt-4">
                  <button
                    (click)="copyBrief(brief)"
                    class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-body font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors bg-white cursor-pointer">
                    <lucide-icon name="copy" [size]="14"></lucide-icon>
                    Copy
                  </button>
                  <a
                    routerLink="/app/creative-engine"
                    class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-body font-semibold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors no-underline">
                    <lucide-icon name="rocket" [size]="14"></lucide-icon>
                    Send to Production
                  </a>
                </div>
              </div>
            } @empty {
              <div class="card p-12 text-center">
                <lucide-icon name="file-text" [size]="32" class="text-gray-300 mx-auto mb-3"></lucide-icon>
                <h3 class="text-base font-display font-semibold text-navy m-0 mb-2">No Briefs Yet</h3>
                <p class="text-sm text-gray-500 font-body m-0 mb-4">Generate AI-powered creative briefs based on your performance data.</p>
                <button
                  (click)="generateNewBrief()"
                  [disabled]="generatingBrief()"
                  class="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-body font-semibold rounded-lg hover:bg-accent/90 transition-colors border-0 cursor-pointer">
                  <lucide-icon name="sparkles" [size]="16"></lucide-icon>
                  Generate First Brief
                </button>
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
    }
  `]
})
export default class AdCommandComponent implements OnInit {
  private api = inject(ApiService);
  private adAccount = inject(AdAccountService);
  private toast = inject(ToastService);
  private dateRange = inject(DateRangeService);
  private auth = inject(AuthService);

  // State
  loading = signal(true);
  error = signal<string | null>(null);
  activeTab = signal<TabId>('command');
  datePreset = 'last_7d';

  // Filters
  formatFilter = 'all';
  statusFilter = 'all';
  sortBy = 'roas';

  // Data
  summary = signal<CommandSummary | null>(null);
  creatives = signal<Creative[]>([]);
  fatigueAlerts = signal<FatigueAlert[]>([]);
  briefs = signal<CreativeBrief[]>([]);
  generatingBrief = signal(false);

  // Tabs config
  tabs = [
    { id: 'command' as TabId, label: 'Command Center', icon: 'command' },
    { id: 'performance' as TabId, label: 'Creative Performance', icon: 'bar-chart-3' },
    { id: 'fatigue' as TabId, label: 'Fatigue Prediction', icon: 'alert-triangle' },
    { id: 'briefs' as TabId, label: 'Creative Briefs', icon: 'file-text' },
  ];

  // Computed
  filteredCreatives = computed(() => {
    let list = this.creatives();

    // Filter by format
    if (this.formatFilter !== 'all') {
      list = list.filter(c => c.format === this.formatFilter);
    }

    // Filter by status
    if (this.statusFilter !== 'all') {
      list = list.filter(c => c.status === this.statusFilter);
    }

    // Sort
    list = [...list].sort((a, b) => {
      switch (this.sortBy) {
        case 'spend': return b.spend - a.spend;
        case 'ctr': return b.ctr - a.ctr;
        case 'frequency': return b.frequency - a.frequency;
        default: return b.roas - a.roas;
      }
    });

    return list;
  });

  criticalAlerts = computed(() => this.fatigueAlerts().filter(a => a.severity === 'critical'));
  warningAlerts = computed(() => this.fatigueAlerts().filter(a => a.severity === 'warning'));
  healthyCount = computed(() => this.creatives().filter(c => c.status === 'healthy' || c.status === 'scaling').length);

  performanceInsights = computed(() => {
    const creatives = this.creatives();
    if (creatives.length === 0) return [];

    const insights: string[] = [];

    // Calculate format performance
    const videos = creatives.filter(c => c.format === 'video');
    const images = creatives.filter(c => c.format === 'image');
    if (videos.length > 0 && images.length > 0) {
      const avgVideoRoas = videos.reduce((sum, c) => sum + c.roas, 0) / videos.length;
      const avgImageRoas = images.reduce((sum, c) => sum + c.roas, 0) / images.length;
      if (avgVideoRoas > avgImageRoas * 1.5) {
        insights.push(`Video ads outperform static by ${((avgVideoRoas / avgImageRoas - 1) * 100).toFixed(0)}% on ROAS`);
      } else if (avgImageRoas > avgVideoRoas * 1.5) {
        insights.push(`Static ads outperform video by ${((avgImageRoas / avgVideoRoas - 1) * 100).toFixed(0)}% on ROAS`);
      }
    }

    // High frequency warning
    const highFreq = creatives.filter(c => c.frequency > 3.5);
    if (highFreq.length > 0) {
      insights.push(`${highFreq.length} ad(s) have frequency above 3.5 — consider refreshing`);
    }

    // Top performer insight
    const topPerformer = creatives.reduce((best, c) => c.roas > best.roas ? c : best, creatives[0]);
    if (topPerformer && topPerformer.roas > 5) {
      insights.push(`"${topPerformer.name.slice(0, 30)}..." is your top performer at ${topPerformer.roas.toFixed(1)}x ROAS`);
    }

    return insights.slice(0, 4);
  });

  // Account change effect
  private accountEffect = effect(() => {
    const account = this.adAccount.currentAccount();
    if (account) {
      this.loadData();
    }
  });

  ngOnInit() {
    if (this.adAccount.currentAccount()) {
      this.loadData();
    }
  }

  onDateChange() {
    this.loadData();
  }

  loadData() {
    const accountId = this.adAccount.currentAccount()?.id;
    if (!accountId) {
      this.error.set('No ad account selected');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    // Load all data in parallel
    Promise.all([
      this.loadSummary(accountId),
      this.loadCreatives(accountId),
      this.loadFatigue(accountId),
      this.loadBriefs(accountId),
    ])
      .then(() => this.loading.set(false))
      .catch(err => {
        this.error.set(err.message || 'Failed to load data');
        this.loading.set(false);
      });
  }

  private async loadSummary(accountId: string) {
    return new Promise<void>((resolve, reject) => {
      this.api.get<{ success: boolean; data: CommandSummary }>(environment.AD_COMMAND_SUMMARY, {
        account_id: accountId,
        date_preset: this.datePreset
      }).subscribe({
        next: res => {
          if (res.success) {
            this.summary.set(res.data);
          }
          resolve();
        },
        error: err => {
          // Don't fail entirely if summary fails
          console.error('Failed to load summary:', err);
          resolve();
        }
      });
    });
  }

  private async loadCreatives(accountId: string) {
    return new Promise<void>((resolve, reject) => {
      this.api.get<{ success: boolean; data: Creative[] }>(environment.AD_COMMAND_CREATIVES, {
        account_id: accountId,
        date_preset: this.datePreset
      }).subscribe({
        next: res => {
          if (res.success) {
            this.creatives.set(res.data || []);
          }
          resolve();
        },
        error: err => {
          console.error('Failed to load creatives:', err);
          resolve();
        }
      });
    });
  }

  private async loadFatigue(accountId: string) {
    return new Promise<void>((resolve, reject) => {
      this.api.get<{ success: boolean; data: FatigueAlert[] }>(environment.AD_COMMAND_FATIGUE, {
        account_id: accountId
      }).subscribe({
        next: res => {
          if (res.success) {
            this.fatigueAlerts.set(res.data || []);
          }
          resolve();
        },
        error: err => {
          console.error('Failed to load fatigue:', err);
          resolve();
        }
      });
    });
  }

  private async loadBriefs(accountId: string) {
    return new Promise<void>((resolve, reject) => {
      this.api.get<{ success: boolean; data: CreativeBrief[] }>(environment.AD_COMMAND_BRIEFS, {
        account_id: accountId
      }).subscribe({
        next: res => {
          if (res.success) {
            this.briefs.set(res.data || []);
          }
          resolve();
        },
        error: err => {
          console.error('Failed to load briefs:', err);
          resolve();
        }
      });
    });
  }

  generateNewBrief() {
    const accountId = this.adAccount.currentAccount()?.id;
    if (!accountId) return;

    this.generatingBrief.set(true);
    this.api.post<{ success: boolean; data: CreativeBrief }>(environment.AD_COMMAND_GENERATE_BRIEF, {
      account_id: accountId
    }).subscribe({
      next: res => {
        this.generatingBrief.set(false);
        if (res.success && res.data) {
          this.briefs.update(list => [res.data, ...list]);
          this.toast.success('Brief generated successfully!');
          this.activeTab.set('briefs');
        }
      },
      error: err => {
        this.generatingBrief.set(false);
        this.toast.error(err.message || 'Failed to generate brief');
      }
    });
  }

  generateReplacementBrief(alert: FatigueAlert) {
    const accountId = this.adAccount.currentAccount()?.id;
    if (!accountId) return;

    this.generatingBrief.set(true);
    this.api.post<{ success: boolean; data: CreativeBrief }>(environment.AD_COMMAND_GENERATE_BRIEF, {
      account_id: accountId,
      creative_id: alert.creativeId,
      replacement_for: alert.creativeName
    }).subscribe({
      next: res => {
        this.generatingBrief.set(false);
        if (res.success && res.data) {
          this.briefs.update(list => [res.data, ...list]);
          this.toast.success('Replacement brief generated!');
          this.activeTab.set('briefs');
        }
      },
      error: err => {
        this.generatingBrief.set(false);
        this.toast.error(err.message || 'Failed to generate brief');
      }
    });
  }

  copyBrief(brief: CreativeBrief) {
    const text = `Creative Brief: ${brief.productName}
Format: ${brief.format}
${brief.length ? `Length: ${brief.length}` : ''}
Hook: ${brief.hookSuggestion}
${brief.ctaSuggestion ? `CTA: ${brief.ctaSuggestion}` : ''}

Why: ${brief.reasoning}`;

    navigator.clipboard.writeText(text).then(() => {
      this.toast.success('Brief copied to clipboard!');
    });
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}
