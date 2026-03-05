const _BUILD_VER = '2026-03-03-v1';
import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { BrandService } from '../../core/services/brand.service';

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
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Creative intelligence across all your brands</p>
        </div>
        <div class="flex gap-3">
          <button class="px-4 py-2 border border-gray-200 rounded-pill text-sm font-body text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2">
            <lucide-icon name="download" [size]="14"></lucide-icon>
            Export Reports
          </button>
          <button class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors flex items-center gap-2">
            <lucide-icon name="plus" [size]="16"></lucide-icon>
            Add Brand
          </button>
        </div>
      </div>

      <!-- Agency Performance Summary -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="bg-white rounded-card shadow-card p-4">
          <div class="flex items-center gap-2 mb-1">
            <lucide-icon name="building-2" [size]="14" class="text-gray-400"></lucide-icon>
            <span class="text-xs text-gray-500 font-body">Brands</span>
          </div>
          <div class="text-2xl font-display text-navy">{{ totalBrands() }}</div>
          <span class="text-[10px] text-gray-400 font-body">{{ activeBrands() }} active</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <div class="flex items-center gap-2 mb-1">
            <lucide-icon name="indian-rupee" [size]="14" class="text-gray-400"></lucide-icon>
            <span class="text-xs text-gray-500 font-body">Total Ad Spend</span>
          </div>
          <div class="text-2xl font-display text-navy">{{ formatCurrency(totalSpend()) }}</div>
          <span class="text-[10px] text-green-600 font-body font-semibold">+14.2% vs last month</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <div class="flex items-center gap-2 mb-1">
            <lucide-icon name="trending-up" [size]="14" class="text-gray-400"></lucide-icon>
            <span class="text-xs text-gray-500 font-body">Avg. ROAS</span>
          </div>
          <div class="text-2xl font-display" [ngClass]="avgRoas() >= 3 ? 'text-green-600' : avgRoas() >= 2 ? 'text-amber-600' : 'text-red-600'">{{ avgRoas().toFixed(1) }}x</div>
          <span class="text-[10px] text-green-600 font-body font-semibold">+0.3 vs last month</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <div class="flex items-center gap-2 mb-1">
            <lucide-icon name="sparkles" [size]="14" class="text-gray-400"></lucide-icon>
            <span class="text-xs text-gray-500 font-body">Creatives Generated</span>
          </div>
          <div class="text-2xl font-display text-navy">{{ totalCreatives() }}</div>
          <span class="text-[10px] text-gray-400 font-body">this month</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <div class="flex items-center gap-2 mb-1">
            <lucide-icon name="brain" [size]="14" class="text-gray-400"></lucide-icon>
            <span class="text-xs text-gray-500 font-body">AI Learnings</span>
          </div>
          <div class="text-2xl font-display text-accent">{{ totalLearnings }}</div>
          <span class="text-[10px] text-gray-400 font-body">patterns discovered</span>
        </div>
      </div>

      <!-- AI Insights Banner -->
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

      <!-- Brand Cards Grid -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-display text-navy m-0">Your Brands</h3>
          <div class="flex gap-1">
            @for (filter of brandFilters; track filter) {
              <button
                (click)="activeBrandFilter = filter"
                class="px-2.5 py-1 rounded-pill text-[10px] font-body font-medium transition-all border-0 cursor-pointer"
                [ngClass]="activeBrandFilter === filter ? 'bg-accent text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'">
                {{ filter }}
              </button>
            }
          </div>
        </div>
        <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          @for (brand of filteredBrands(); track brand.id) {
            <div class="bg-white rounded-card shadow-card p-5 card-lift cursor-pointer group"
              (click)="switchToBrand(brand.id)">
              <!-- Brand Header -->
              <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-display font-bold text-sm"
                    [style.background-color]="getBrandColor(brand.id)">
                    {{ brand.name.charAt(0) }}
                  </div>
                  <div>
                    <h3 class="text-sm font-body font-semibold text-navy m-0">{{ brand.name }}</h3>
                    <span class="text-[10px] text-gray-400 font-body">{{ brand.category }}</span>
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-body font-semibold"
                  [ngClass]="{
                    'bg-green-100 text-green-700': brand.status === 'active',
                    'bg-amber-100 text-amber-700': brand.status === 'warning',
                    'bg-gray-100 text-gray-500': brand.status === 'paused'
                  }">
                  {{ brand.status }}
                </span>
              </div>

              <!-- Performance Metrics -->
              <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-gray-50 rounded-lg p-2.5">
                  <span class="text-[10px] text-gray-400 font-body block mb-0.5">ROAS</span>
                  <span class="text-base font-display font-bold" [ngClass]="(brand.roas ?? 0) >= 3 ? 'text-green-600' : (brand.roas ?? 0) >= 2 ? 'text-amber-600' : 'text-red-600'">
                    {{ brand.roas ?? 0 }}x
                  </span>
                </div>
                <div class="bg-gray-50 rounded-lg p-2.5">
                  <span class="text-[10px] text-gray-400 font-body block mb-0.5">Spend</span>
                  <span class="text-sm font-body font-semibold text-navy">{{ formatCurrency(brand.monthlySpend ?? 0) }}</span>
                </div>
                <div class="bg-gray-50 rounded-lg p-2.5">
                  <span class="text-[10px] text-gray-400 font-body block mb-0.5">Creatives</span>
                  <span class="text-sm font-body font-semibold text-navy">{{ brand.activeCreatives ?? 0 }}</span>
                </div>
              </div>

              <!-- AI Health Score -->
              <div class="flex items-center gap-3 mb-3">
                <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all bg-gradient-to-r from-accent to-violet-400"
                    [style.width.%]="getAiScore(brand)"></div>
                </div>
                <span class="text-[10px] font-mono font-bold" [ngClass]="getAiScore(brand) >= 70 ? 'text-green-600' : getAiScore(brand) >= 40 ? 'text-amber-600' : 'text-red-600'">
                  {{ getAiScore(brand) }}%
                </span>
              </div>

              <!-- Card Footer -->
              <div class="flex items-center justify-between pt-3 border-t border-gray-100">
                <div class="flex gap-1.5">
                  <button class="px-2 py-1 bg-accent/5 text-accent rounded text-[10px] font-body font-semibold hover:bg-accent/10 transition-colors border-0 cursor-pointer"
                    (click)="$event.stopPropagation()">
                    <lucide-icon name="sparkles" [size]="10" class="inline-block mr-0.5"></lucide-icon> Generate
                  </button>
                  <button class="px-2 py-1 bg-gray-50 text-gray-500 rounded text-[10px] font-body font-semibold hover:bg-gray-100 transition-colors border-0 cursor-pointer"
                    (click)="$event.stopPropagation()">
                    <lucide-icon name="bar-chart-3" [size]="10" class="inline-block mr-0.5"></lucide-icon> Analyze
                  </button>
                </div>
                <span class="text-[10px] text-accent font-body font-semibold group-hover:underline flex items-center gap-1">
                  Open <lucide-icon name="arrow-right" [size]="10"></lucide-icon>
                </span>
              </div>
            </div>
          }
        </div>
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
          @for (member of teamMembers; track member.name) {
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
export default class AgencyCommandCenterComponent {
  private brandService = inject(BrandService);

  brands = this.brandService.allBrands;

  activeBrandFilter = 'All';
  brandFilters = ['All', 'Active', 'Warning', 'Paused'];

  totalBrands = computed(() => this.brands().length);
  activeBrands = computed(() => this.brands().filter(b => b.status === 'active').length);
  totalSpend = computed(() => this.brands().reduce((sum, b) => sum + (b.monthlySpend ?? 0), 0));
  avgRoas = computed(() => {
    const brands = this.brands();
    if (brands.length === 0) return 0;
    return brands.reduce((sum, b) => sum + (b.roas ?? 0), 0) / brands.length;
  });
  totalCreatives = computed(() => this.brands().reduce((sum, b) => sum + (b.activeCreatives ?? 0), 0));
  totalAlerts = computed(() => this.brands().reduce((sum, b) => sum + (b.alertCount ?? 0), 0));
  totalLearnings = 68;

  filteredBrands = computed(() => {
    if (this.activeBrandFilter === 'All') return this.brands();
    return this.brands().filter(b => b.status === this.activeBrandFilter.toLowerCase());
  });

  quickActions = [
    { icon: 'sparkles', label: 'Generate Creatives', sub: 'All brands', route: '/app/ugc-studio', bgClass: 'bg-violet-100', iconClass: 'text-violet-600' },
    { icon: 'shield', label: 'Run Audits', sub: 'Account health', route: '/app/audit', bgClass: 'bg-blue-100', iconClass: 'text-blue-600' },
    { icon: 'file-text', label: 'Weekly Reports', sub: 'Auto-generated', route: '/app/reports', bgClass: 'bg-emerald-100', iconClass: 'text-emerald-600' },
    { icon: 'brain', label: 'AI Insights', sub: 'Cross-brand', route: '/app/brain', bgClass: 'bg-amber-100', iconClass: 'text-amber-600' },
  ];

  teamMembers = [
    { name: 'Arjun M.', role: 'Owner', color: '#6366f1', load: 45 },
    { name: 'Priya S.', role: 'Admin', color: '#ec4899', load: 62 },
    { name: 'Rahul V.', role: 'Media Buyer', color: '#f59e0b', load: 78 },
    { name: 'Neha G.', role: 'Designer', color: '#10b981', load: 55 },
    { name: 'Vikram S.', role: 'Media Buyer', color: '#3b82f6', load: 83 },
    { name: 'Ananya P.', role: 'Viewer', color: '#8b5cf6', load: 30 },
  ];

  private brandColors: Record<string, string> = {
    'brand-001': '#6366f1',
    'brand-002': '#ec4899',
    'brand-003': '#f59e0b',
    'brand-004': '#ef4444',
    'brand-005': '#10b981',
    'brand-006': '#3b82f6',
  };

  getBrandColor(id: string): string {
    return this.brandColors[id] ?? '#6366f1';
  }

  getAiScore(brand: any): number {
    const roas = brand.roas ?? 0;
    const creatives = brand.activeCreatives ?? 0;
    return Math.min(100, Math.round((roas / 5) * 50 + (creatives / 20) * 50));
  }

  switchToBrand(id: string) {
    this.brandService.switchBrand(id);
  }

  formatCurrency(value: number): string {
    if (value >= 10000000) return '₹' + (value / 10000000).toFixed(1) + 'Cr';
    if (value >= 100000) return '₹' + (value / 100000).toFixed(1) + 'L';
    if (value >= 1000) return '₹' + (value / 1000).toFixed(0) + 'K';
    return '₹' + value;
  }
}
