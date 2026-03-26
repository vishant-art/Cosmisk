const _BUILD_VER = '2026-03-26-v1';
import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { environment } from '../../../environments/environment';

interface TrendResult {
  direction: 'improving' | 'declining' | 'stable';
  pctChange: number;
  label: string;
}

interface AccountHealth {
  accountId: string;
  accountName: string;
  businessName: string;
  currency: string;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  conversions: number;
  roasTrend: TrendResult;
  cpaTrend: TrendResult;
  spendTrend: TrendResult;
  healthScore: number;
  healthGrade: 'green' | 'yellow' | 'red';
  healthFactors: any;
  healthSummary: string;
  daysSinceNewCreative: number | null;
  recentAlertCount: number;
  pendingDecisions: number;
}

interface PortfolioSummary {
  totalSpend: number;
  totalRevenue: number;
  avgRoas: number;
  totalAccounts: number;
  needsAttention: number;
  avgHealthScore: number;
}

@Component({
  selector: 'app-agency-command-center',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Agency Command Center</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Client health scores across all ad accounts</p>
        </div>
        <div class="flex gap-3">
          <button (click)="goToReports()" class="px-4 py-2 border border-gray-200 rounded-pill text-sm font-body text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2 cursor-pointer">
            <lucide-icon name="download" [size]="14"></lucide-icon>
            Export Reports
          </button>
          <button (click)="refresh()" [disabled]="loading()" class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors flex items-center gap-2 cursor-pointer border-0 disabled:opacity-50">
            <lucide-icon name="refresh-cw" [size]="16" [class]="loading() ? 'animate-spin' : ''"></lucide-icon>
            Refresh
          </button>
        </div>
      </div>

      <!-- Loading State -->
      @if (loading()) {
        <!-- Portfolio KPI Skeleton -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="bg-white rounded-card shadow-card p-4 animate-pulse">
              <div class="h-3 bg-gray-200 rounded w-20 mb-2"></div>
              <div class="h-7 bg-gray-200 rounded w-16 mb-1"></div>
              <div class="h-2 bg-gray-100 rounded w-12"></div>
            </div>
          }
        </div>
        <!-- Card Skeletons -->
        <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="bg-white rounded-card shadow-card p-5 animate-pulse">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-xl bg-gray-200"></div>
                <div>
                  <div class="h-4 bg-gray-200 rounded w-32 mb-1"></div>
                  <div class="h-3 bg-gray-100 rounded w-20"></div>
                </div>
              </div>
              <div class="h-2 bg-gray-200 rounded-full w-full mb-3"></div>
              <div class="grid grid-cols-3 gap-3 mb-3">
                <div class="bg-gray-50 rounded-lg p-2.5 h-14"></div>
                <div class="bg-gray-50 rounded-lg p-2.5 h-14"></div>
                <div class="bg-gray-50 rounded-lg p-2.5 h-14"></div>
              </div>
              <div class="h-3 bg-gray-100 rounded w-48"></div>
            </div>
          }
        </div>
      }

      <!-- Error State -->
      @if (error() && !loading()) {
        <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <lucide-icon name="alert-circle" [size]="24" class="text-red-400 mx-auto mb-2"></lucide-icon>
          <p class="text-sm text-red-600 font-body m-0">{{ error() }}</p>
          <button (click)="refresh()" class="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-body font-semibold border-0 cursor-pointer hover:bg-red-200 transition-colors">
            Try Again
          </button>
        </div>
      }

      <!-- Empty State (no Meta connected) -->
      @if (!loading() && !error() && portfolio() && portfolio()!.totalAccounts === 0) {
        <div class="bg-white rounded-card shadow-card p-12 text-center">
          <div class="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
            <lucide-icon name="link" [size]="28" class="text-accent"></lucide-icon>
          </div>
          <h3 class="text-lg font-display text-navy mb-2 m-0">No Ad Accounts Connected</h3>
          <p class="text-sm text-gray-500 font-body mb-4 m-0">Connect your Meta Ads account to see client health scores.</p>
          <a routerLink="/app/settings" class="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold no-underline hover:bg-accent/90 transition-colors">
            <lucide-icon name="settings" [size]="16"></lucide-icon>
            Connect Meta
          </a>
        </div>
      }

      <!-- Data Loaded -->
      @if (!loading() && !error() && portfolio() && portfolio()!.totalAccounts > 0) {
        <!-- Portfolio KPI Strip -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div class="bg-white rounded-card shadow-card p-4">
            <div class="flex items-center gap-2 mb-1">
              <lucide-icon name="building-2" [size]="14" class="text-gray-400"></lucide-icon>
              <span class="text-xs text-gray-500 font-body">Accounts</span>
            </div>
            <div class="text-2xl font-display text-navy">{{ portfolio()!.totalAccounts }}</div>
            <span class="text-[10px] font-body" [ngClass]="portfolio()!.needsAttention > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'">
              {{ portfolio()!.needsAttention }} need{{ portfolio()!.needsAttention === 1 ? 's' : '' }} attention
            </span>
          </div>
          <div class="bg-white rounded-card shadow-card p-4">
            <div class="flex items-center gap-2 mb-1">
              <lucide-icon name="indian-rupee" [size]="14" class="text-gray-400"></lucide-icon>
              <span class="text-xs text-gray-500 font-body">Total Spend (7d)</span>
            </div>
            <div class="text-2xl font-display text-navy">{{ formatCurrency(portfolio()!.totalSpend) }}</div>
          </div>
          <div class="bg-white rounded-card shadow-card p-4">
            <div class="flex items-center gap-2 mb-1">
              <lucide-icon name="trending-up" [size]="14" class="text-gray-400"></lucide-icon>
              <span class="text-xs text-gray-500 font-body">Avg. ROAS</span>
            </div>
            <div class="text-2xl font-display" [ngClass]="portfolio()!.avgRoas >= 3 ? 'text-green-600' : portfolio()!.avgRoas >= 2 ? 'text-amber-600' : 'text-red-600'">
              {{ portfolio()!.avgRoas.toFixed(1) }}x
            </div>
          </div>
          <div class="bg-white rounded-card shadow-card p-4">
            <div class="flex items-center gap-2 mb-1">
              <lucide-icon name="heart-pulse" [size]="14" class="text-gray-400"></lucide-icon>
              <span class="text-xs text-gray-500 font-body">Avg. Health</span>
            </div>
            <div class="text-2xl font-display" [ngClass]="portfolio()!.avgHealthScore >= 80 ? 'text-green-600' : portfolio()!.avgHealthScore >= 50 ? 'text-amber-600' : 'text-red-600'">
              {{ portfolio()!.avgHealthScore }}
            </div>
          </div>
          <div class="bg-white rounded-card shadow-card p-4">
            <div class="flex items-center gap-2 mb-1">
              <lucide-icon name="alert-triangle" [size]="14" class="text-gray-400"></lucide-icon>
              <span class="text-xs text-gray-500 font-body">Needs Attention</span>
            </div>
            <div class="text-2xl font-display" [ngClass]="portfolio()!.needsAttention > 0 ? 'text-red-600' : 'text-green-600'">
              {{ portfolio()!.needsAttention }}
            </div>
          </div>
        </div>

        <!-- Cross-Brand Intelligence Banner -->
        <div class="relative overflow-hidden bg-gradient-to-r from-[#1e1b4b] via-[#312e81] to-[#4338ca] rounded-xl p-5">
          <div class="absolute inset-0 opacity-10">
            <div class="absolute top-2 right-8 w-40 h-40 bg-white rounded-full blur-3xl"></div>
          </div>
          <div class="relative z-10 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <lucide-icon name="sparkles" [size]="20" class="text-white"></lucide-icon>
              </div>
              <div>
                <h3 class="text-sm font-body font-semibold text-white m-0">Cross-Brand Intelligence</h3>
                <p class="text-xs text-indigo-200 font-body m-0 mt-0.5">
                  "Hook styles using fear/urgency are performing 2.4x better across your D2C brands this week. Consider applying to Wellness and Auto Care verticals."
                </p>
              </div>
            </div>
            <a routerLink="/app/brain" class="shrink-0 px-4 py-2 bg-white/10 text-white border border-white/20 rounded-lg text-xs font-body font-semibold hover:bg-white/20 transition-colors no-underline flex items-center gap-1.5">
              View All
              <lucide-icon name="arrow-right" [size]="12"></lucide-icon>
            </a>
          </div>
        </div>

        <!-- Sort/Filter Bar -->
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex gap-1">
            @for (grade of gradeFilters; track grade.value) {
              <button
                (click)="filterGrade.set(grade.value)"
                class="px-3 py-1.5 rounded-pill text-xs font-body font-medium transition-all border-0 cursor-pointer flex items-center gap-1.5"
                [ngClass]="filterGrade() === grade.value ? 'bg-accent text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'">
                @if (grade.dot) {
                  <span class="w-2 h-2 rounded-full" [ngClass]="grade.dot"></span>
                }
                {{ grade.label }}
                @if (grade.value !== 'all') {
                  <span class="text-[10px] opacity-70">({{ gradeCount(grade.value) }})</span>
                }
              </button>
            }
          </div>
          <select
            [value]="sortBy()"
            (change)="sortBy.set($any($event.target).value)"
            class="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-body text-gray-600 bg-white cursor-pointer">
            <option value="health">Sort by Health</option>
            <option value="spend">Sort by Spend</option>
            <option value="roas">Sort by ROAS</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>

        <!-- Account Health Cards -->
        <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          @for (account of filteredAccounts(); track account.accountId) {
            <div class="bg-white rounded-card shadow-card p-5 card-lift cursor-pointer group"
              (click)="drillDown(account)">
              <!-- Account Header -->
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-display font-bold text-sm"
                    [ngClass]="{
                      'bg-green-500': account.healthGrade === 'green',
                      'bg-amber-500': account.healthGrade === 'yellow',
                      'bg-red-500': account.healthGrade === 'red'
                    }">
                    {{ account.accountName.charAt(0).toUpperCase() }}
                  </div>
                  <div>
                    <h3 class="text-sm font-body font-semibold text-navy m-0">{{ account.accountName }}</h3>
                    <span class="text-[10px] text-gray-400 font-body">{{ account.businessName || account.accountId }}</span>
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-body font-bold"
                  [ngClass]="{
                    'bg-green-100 text-green-700': account.healthGrade === 'green',
                    'bg-amber-100 text-amber-700': account.healthGrade === 'yellow',
                    'bg-red-100 text-red-700': account.healthGrade === 'red'
                  }">
                  {{ account.healthScore }}/100
                </span>
              </div>

              <!-- Health Score Bar -->
              <div class="flex items-center gap-2 mb-4">
                <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all"
                    [ngClass]="{
                      'bg-green-500': account.healthGrade === 'green',
                      'bg-amber-500': account.healthGrade === 'yellow',
                      'bg-red-500': account.healthGrade === 'red'
                    }"
                    [style.width.%]="account.healthScore"></div>
                </div>
              </div>

              <!-- KPI Tiles -->
              <div class="grid grid-cols-3 gap-3 mb-3">
                <div class="bg-gray-50 rounded-lg p-2.5">
                  <span class="text-[10px] text-gray-400 font-body block mb-0.5">ROAS</span>
                  <span class="text-base font-display font-bold" [ngClass]="account.roas >= 3 ? 'text-green-600' : account.roas >= 2 ? 'text-amber-600' : 'text-red-600'">
                    {{ account.roas }}x
                  </span>
                  <span class="text-[10px] block font-body" [ngClass]="account.roasTrend.direction === 'improving' ? 'text-green-600' : account.roasTrend.direction === 'declining' ? 'text-red-600' : 'text-gray-400'">
                    {{ trendArrow(account.roasTrend) }} {{ Math.abs(account.roasTrend.pctChange) }}%
                  </span>
                </div>
                <div class="bg-gray-50 rounded-lg p-2.5">
                  <span class="text-[10px] text-gray-400 font-body block mb-0.5">CPA</span>
                  <span class="text-sm font-body font-semibold text-navy">{{ formatCurrency(account.cpa) }}</span>
                  <span class="text-[10px] block font-body" [ngClass]="account.cpaTrend.direction === 'declining' ? 'text-green-600' : account.cpaTrend.direction === 'improving' ? 'text-red-600' : 'text-gray-400'">
                    {{ trendArrow(account.cpaTrend) }} {{ Math.abs(account.cpaTrend.pctChange) }}%
                  </span>
                </div>
                <div class="bg-gray-50 rounded-lg p-2.5">
                  <span class="text-[10px] text-gray-400 font-body block mb-0.5">Spend</span>
                  <span class="text-sm font-body font-semibold text-navy">{{ formatCurrency(account.spend) }}</span>
                </div>
              </div>

              <!-- Health Summary -->
              <p class="text-[11px] text-gray-500 font-body m-0 mb-3 line-clamp-1">{{ account.healthSummary }}</p>

              <!-- Card Footer -->
              <div class="flex items-center justify-between pt-3 border-t border-gray-100">
                <div class="flex gap-2 text-[10px] text-gray-400 font-body">
                  @if (account.recentAlertCount > 0) {
                    <span class="text-amber-600">{{ account.recentAlertCount }} alert{{ account.recentAlertCount > 1 ? 's' : '' }}</span>
                  }
                  @if (account.pendingDecisions > 0) {
                    <span class="text-accent">{{ account.pendingDecisions }} pending</span>
                  }
                </div>
                <span class="text-[10px] text-accent font-body font-semibold group-hover:underline flex items-center gap-1">
                  View Dashboard <lucide-icon name="arrow-right" [size]="10"></lucide-icon>
                </span>
              </div>
            </div>
          }
        </div>

        @if (filteredAccounts().length === 0) {
          <div class="text-center py-8 text-sm text-gray-400 font-body">
            No accounts match the selected filter.
          </div>
        }
      }

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        @for (action of quickActions; track action.label) {
          <a [routerLink]="action.route" class="bg-white rounded-card shadow-card p-4 card-lift glow-on-hover cursor-pointer no-underline group flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" [ngClass]="action.bgClass">
              <lucide-icon [name]="action.icon" [size]="18" [class]="action.iconClass"></lucide-icon>
            </div>
            <div>
              <span class="text-sm font-body font-semibold text-navy block">{{ action.label }}</span>
              <span class="text-[10px] text-gray-400 font-body">{{ action.sub }}</span>
            </div>
          </a>
        }
      </div>

      <!-- Team Capacity -->
      <div class="bg-white rounded-card shadow-card p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <lucide-icon name="users" [size]="16" class="text-gray-400"></lucide-icon>
            <h3 class="text-sm font-display text-navy m-0">Team Capacity</h3>
          </div>
          <a routerLink="/app/settings" class="text-xs text-accent font-body hover:underline no-underline flex items-center gap-1">
            Manage <lucide-icon name="arrow-right" [size]="12"></lucide-icon>
          </a>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
          @for (member of teamMembers(); track member.name) {
            <div class="text-center group">
              <div class="w-10 h-10 rounded-xl mx-auto flex items-center justify-center text-sm font-body font-bold text-white mb-1.5 transition-transform group-hover:scale-105"
                [style.background-color]="member.color">
                {{ member.name.charAt(0) }}
              </div>
              <div class="text-xs font-body font-semibold text-navy truncate">{{ member.name }}</div>
              <div class="text-[10px] text-gray-400 font-body">{{ member.role }}</div>
              <div class="text-[10px] font-mono mt-0.5" [ngClass]="member.load <= 60 ? 'text-green-600' : member.load <= 80 ? 'text-amber-600' : 'text-red-600'">{{ member.load }}% load</div>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export default class AgencyCommandCenterComponent implements OnInit {
  private api = inject(ApiService);
  private adAccountService = inject(AdAccountService);
  private router = inject(Router);
  private toast = inject(ToastService);

  Math = Math;

  loading = signal(true);
  error = signal<string | null>(null);
  portfolio = signal<PortfolioSummary | null>(null);
  accountHealths = signal<AccountHealth[]>([]);
  sortBy = signal<'health' | 'spend' | 'roas' | 'name'>('health');
  filterGrade = signal<'all' | 'green' | 'yellow' | 'red'>('all');

  teamMembers = signal<{ name: string; role: string; color: string; load: number }[]>([]);

  gradeFilters = [
    { label: 'All', value: 'all' as const, dot: '' },
    { label: 'Green', value: 'green' as const, dot: 'bg-green-500' },
    { label: 'Yellow', value: 'yellow' as const, dot: 'bg-amber-500' },
    { label: 'Red', value: 'red' as const, dot: 'bg-red-500' },
  ];

  filteredAccounts = computed(() => {
    let accounts = this.accountHealths();
    const grade = this.filterGrade();
    if (grade !== 'all') {
      accounts = accounts.filter(a => a.healthGrade === grade);
    }
    const sort = this.sortBy();
    return [...accounts].sort((a, b) => {
      switch (sort) {
        case 'health': return b.healthScore - a.healthScore;
        case 'spend': return b.spend - a.spend;
        case 'roas': return b.roas - a.roas;
        case 'name': return a.accountName.localeCompare(b.accountName);
        default: return 0;
      }
    });
  });

  quickActions = [
    { icon: 'sparkles', label: 'Generate Creatives', sub: 'All brands', route: '/app/creative-engine', bgClass: 'bg-violet-100', iconClass: 'text-violet-600' },
    { icon: 'shield', label: 'Run Audits', sub: 'Account health', route: '/app/audit', bgClass: 'bg-blue-100', iconClass: 'text-blue-600' },
    { icon: 'file-text', label: 'Weekly Reports', sub: 'Auto-generated', route: '/app/reports', bgClass: 'bg-emerald-100', iconClass: 'text-emerald-600' },
    { icon: 'brain', label: 'AI Insights', sub: 'Cross-brand', route: '/app/brain', bgClass: 'bg-amber-100', iconClass: 'text-amber-600' },
  ];

  private memberColors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

  ngOnInit() {
    this.loadPortfolioHealth();
    this.loadTeamMembers();
  }

  refresh() {
    this.loadPortfolioHealth();
  }

  gradeCount(grade: string): number {
    return this.accountHealths().filter(a => a.healthGrade === grade).length;
  }

  drillDown(account: AccountHealth) {
    this.adAccountService.switchAccount(account.accountId);
    this.router.navigate(['/app/dashboard']);
  }

  trendArrow(trend: TrendResult): string {
    return trend.direction === 'improving' ? '\u2191' : trend.direction === 'declining' ? '\u2193' : '\u2192';
  }

  goToReports() {
    this.router.navigate(['/app/reports']);
  }

  formatCurrency(value: number): string {
    if (value >= 10000000) return '\u20B9' + (value / 10000000).toFixed(1) + 'Cr';
    if (value >= 100000) return '\u20B9' + (value / 100000).toFixed(1) + 'L';
    if (value >= 1000) return '\u20B9' + (value / 1000).toFixed(0) + 'K';
    return '\u20B9' + value;
  }

  private loadPortfolioHealth() {
    this.loading.set(true);
    this.error.set(null);
    this.api.get<any>(environment.AD_ACCOUNT_PORTFOLIO_HEALTH).subscribe({
      next: (res) => {
        if (res.success && res.portfolio) {
          this.portfolio.set(res.portfolio);
          this.accountHealths.set(res.accounts || []);
        } else if (res.meta_connected === false) {
          this.portfolio.set({ totalSpend: 0, totalRevenue: 0, avgRoas: 0, totalAccounts: 0, needsAttention: 0, avgHealthScore: 0 });
          this.accountHealths.set([]);
        } else {
          this.error.set('Failed to load portfolio data.');
        }
        this.loading.set(false);
      },
      error: (err: any) => {
        this.error.set(err?.error?.error || 'Failed to load portfolio health. Please try again.');
        this.loading.set(false);
      },
    });
  }

  private loadTeamMembers() {
    this.api.get<any>(environment.TEAM_MEMBERS).subscribe({
      next: (res) => {
        if (res.members?.length) {
          this.teamMembers.set(res.members.map((m: any, i: number) => ({
            name: m.name || m.email?.split('@')[0] || 'Member',
            role: m.role || 'viewer',
            color: this.memberColors[i % this.memberColors.length],
            load: 0,
          })));
        }
      },
      error: (err: any) => console.error('Failed to load team members:', err),
    });
  }
}
