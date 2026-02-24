const _BUILD_VER = '2026-02-13-v2';
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
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Agency Command Center</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Manage all brands from one dashboard</p>
        </div>
        <div class="flex gap-3">
          <button class="px-4 py-2 border border-gray-200 rounded-pill text-sm font-body text-gray-600 hover:bg-gray-50 transition-colors">
            Export All Reports
          </button>
          <button class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
            + Add Brand
          </button>
        </div>
      </div>

      <!-- Agency Summary Bar -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="bg-white rounded-card shadow-card p-4">
          <span class="text-xs text-gray-500 font-body">Total Brands</span>
          <div class="text-2xl font-display text-navy mt-1">{{ totalBrands() }}</div>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <span class="text-xs text-gray-500 font-body">Total Ad Spend</span>
          <div class="text-2xl font-display text-navy mt-1">{{ formatCurrency(totalSpend()) }}</div>
          <span class="text-xs text-green-600 font-body">+14.2%</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <span class="text-xs text-gray-500 font-body">Avg. ROAS</span>
          <div class="text-2xl font-display text-navy mt-1">{{ avgRoas().toFixed(1) }}x</div>
          <span class="text-xs text-green-600 font-body">+0.3</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <span class="text-xs text-gray-500 font-body">Active Campaigns</span>
          <div class="text-2xl font-display text-navy mt-1">{{ totalCampaigns() }}</div>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <span class="text-xs text-gray-500 font-body">Total Alerts</span>
          <div class="text-2xl font-display mt-1" [ngClass]="totalAlerts() > 0 ? 'text-red-600' : 'text-green-600'">{{ totalAlerts() }}</div>
        </div>
      </div>

      <!-- Bulk Actions -->
      <div class="bg-white rounded-card shadow-card p-4">
        <div class="flex items-center justify-between">
          <span class="text-sm font-body font-semibold text-navy">Quick Actions</span>
          <div class="flex gap-2">
            <button class="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-body font-semibold hover:bg-accent/20 transition-colors">
              Generate All Audits
            </button>
            <button class="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-body font-semibold hover:bg-accent/20 transition-colors">
              Pause Fatiguing Creatives
            </button>
            <button class="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-body font-semibold hover:bg-accent/20 transition-colors">
              Rebalance Budgets
            </button>
          </div>
        </div>
      </div>

      <!-- Brand Cards Grid -->
      <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        @for (brand of brands(); track brand.id) {
          <div class="bg-white rounded-card shadow-card p-5 hover:shadow-card-hover transition-all cursor-pointer"
            (click)="switchToBrand(brand.id)">
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-display font-bold"
                  [style.background-color]="getBrandColor(brand.id)">
                  {{ brand.name.charAt(0) }}
                </div>
                <div>
                  <h3 class="text-sm font-body font-semibold text-navy m-0">{{ brand.name }}</h3>
                  <span class="text-xs text-gray-400 font-body">{{ brand.category }}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-body font-semibold"
                  [ngClass]="{
                    'bg-green-100 text-green-700': brand.status === 'active',
                    'bg-amber-100 text-amber-700': brand.status === 'warning',
                    'bg-gray-100 text-gray-500': brand.status === 'paused'
                  }">
                  {{ brand.status }}
                </span>
                @if (brand.alertCount && brand.alertCount > 0) {
                  <span class="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                    {{ brand.alertCount }}
                  </span>
                }
              </div>
            </div>

            <!-- Metrics -->
            <div class="grid grid-cols-3 gap-3 mb-3">
              <div>
                <span class="text-[10px] text-gray-500 font-body block">Monthly Spend</span>
                <span class="text-sm font-body font-semibold text-navy">{{ formatCurrency(brand.monthlySpend ?? 0) }}</span>
              </div>
              <div>
                <span class="text-[10px] text-gray-500 font-body block">ROAS</span>
                <span class="text-sm font-body font-semibold" [ngClass]="(brand.roas ?? 0) >= 3 ? 'text-green-600' : (brand.roas ?? 0) >= 2 ? 'text-amber-600' : 'text-red-600'">
                  {{ brand.roas ?? 0 }}x
                </span>
              </div>
              <div>
                <span class="text-[10px] text-gray-500 font-body block">Campaigns</span>
                <span class="text-sm font-body font-semibold text-navy">{{ brand.activeCampaigns ?? 0 }}</span>
              </div>
            </div>

            <!-- ROAS Bar -->
            <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div class="h-full rounded-full transition-all"
                [ngClass]="{
                  'bg-green-500': (brand.roas ?? 0) >= 3,
                  'bg-amber-500': (brand.roas ?? 0) >= 2 && (brand.roas ?? 0) < 3,
                  'bg-red-500': (brand.roas ?? 0) < 2
                }"
                [style.width.%]="((brand.roas ?? 0) / 5) * 100"></div>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-400 font-body">{{ brand.activeCreatives ?? 0 }} creatives</span>
              <span class="text-xs text-accent font-body font-semibold hover:underline">
                Open Dashboard <lucide-icon name="arrow-right" [size]="12" class="inline-block"></lucide-icon>
              </span>
            </div>
          </div>
        }
      </div>

      <!-- Team Overview -->
      <div class="bg-white rounded-card shadow-card p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-display text-navy m-0">Team Overview</h3>
          <a routerLink="/app/settings" class="text-xs text-accent font-body hover:underline no-underline">Manage Team <lucide-icon name="arrow-right" [size]="12" class="inline-block"></lucide-icon></a>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
          @for (member of teamMembers; track member.name) {
            <div class="text-center">
              <div class="w-10 h-10 rounded-full mx-auto flex items-center justify-center text-sm font-body font-bold text-white mb-1"
                [style.background-color]="member.color">
                {{ member.name.charAt(0) }}
              </div>
              <div class="text-xs font-body font-semibold text-navy truncate">{{ member.name }}</div>
              <div class="text-[10px] text-gray-400 font-body">{{ member.role }}</div>
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

  totalBrands = computed(() => this.brands().length);
  totalSpend = computed(() => this.brands().reduce((sum, b) => sum + (b.monthlySpend ?? 0), 0));
  avgRoas = computed(() => {
    const brands = this.brands();
    return brands.reduce((sum, b) => sum + (b.roas ?? 0), 0) / brands.length;
  });
  totalCampaigns = computed(() => this.brands().reduce((sum, b) => sum + (b.activeCampaigns ?? 0), 0));
  totalAlerts = computed(() => this.brands().reduce((sum, b) => sum + (b.alertCount ?? 0), 0));

  teamMembers = [
    { name: 'Arjun M.', role: 'Owner', color: '#6366f1' },
    { name: 'Priya S.', role: 'Admin', color: '#ec4899' },
    { name: 'Rahul V.', role: 'Media Buyer', color: '#f59e0b' },
    { name: 'Neha G.', role: 'Designer', color: '#10b981' },
    { name: 'Vikram S.', role: 'Media Buyer', color: '#3b82f6' },
    { name: 'Ananya P.', role: 'Viewer', color: '#8b5cf6' },
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
