import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AutopilotBadgeService } from '../../core/services/autopilot-badge.service';
import { environment } from '../../../environments/environment';

interface AutopilotAlert {
  id: string;
  account_id: string;
  type: string;
  title: string;
  content: string;
  severity: string;
  read: boolean;
  created_at: string;
}

type FilterTab = 'all' | 'unread' | 'critical' | 'warning' | 'success';

@Component({
  selector: 'app-autopilot',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 class="text-2xl font-display font-bold text-navy m-0">Autopilot Alerts</h1>
        <p class="text-sm font-body text-gray-500 mt-1 m-0">
          AI-detected anomalies and opportunities across your ad accounts
        </p>
      </div>
      <div class="flex items-center gap-3">
        @if (unreadCount() > 0) {
          <span class="px-2.5 py-1 text-xs font-bold font-mono bg-accent/10 text-accent rounded-full">
            {{ unreadCount() }} unread
          </span>
        }
        <button
          (click)="markAllRead()"
          [disabled]="unreadCount() === 0"
          class="px-4 py-2 text-sm font-body font-semibold rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer">
          <lucide-icon name="check-check" [size]="16"></lucide-icon>
          Mark all read
        </button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
      @for (tab of filterTabs; track tab.key) {
        <button
          (click)="activeTab.set(tab.key)"
          class="px-4 py-2 text-sm font-body font-medium rounded-lg transition-all cursor-pointer border-0"
          [class]="activeTab() === tab.key
            ? 'bg-white text-navy shadow-sm'
            : 'bg-transparent text-gray-500 hover:text-gray-700'">
          {{ tab.label }}
          @if (tab.key !== 'all' && getTabCount(tab.key) > 0) {
            <span class="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full"
              [class]="tab.key === 'critical' ? 'bg-red-100 text-red-700'
                : tab.key === 'warning' ? 'bg-amber-100 text-amber-700'
                : tab.key === 'success' ? 'bg-emerald-100 text-emerald-700'
                : 'bg-blue-100 text-blue-700'">
              {{ getTabCount(tab.key) }}
            </span>
          }
        </button>
      }
    </div>

    <!-- Loading State -->
    @if (loading()) {
      <div class="space-y-4">
        @for (i of [1,2,3,4]; track i) {
          <div class="bg-white rounded-card shadow-card p-5 animate-pulse">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-gray-200 rounded-xl"></div>
              <div class="flex-1">
                <div class="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
                <div class="h-3 bg-gray-200 rounded w-2/3 mb-2"></div>
                <div class="h-3 bg-gray-200 rounded w-1/4"></div>
              </div>
            </div>
          </div>
        }
      </div>
    } @else if (filteredAlerts().length > 0) {
      <div class="space-y-3">
        @for (alert of filteredAlerts(); track alert.id) {
          <div
            class="bg-white rounded-card shadow-card p-5 border-l-4 transition-all hover:shadow-md"
            [class]="getSeverityBorderClass(alert.severity)"
            [class.opacity-60]="alert.read">
            <div class="flex items-start gap-4">
              <!-- Severity Icon -->
              <div class="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                [class]="getSeverityBgClass(alert.severity)">
                <lucide-icon
                  [name]="getSeverityIcon(alert.severity)"
                  [size]="20"
                  [class]="getSeverityTextClass(alert.severity)">
                </lucide-icon>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-3 mb-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="text-sm font-display font-bold text-navy m-0">{{ alert.title }}</h3>
                    @if (!alert.read) {
                      <span class="w-2 h-2 rounded-full bg-accent shrink-0"></span>
                    }
                  </div>
                  <span class="text-xs font-body text-gray-400 shrink-0 whitespace-nowrap">
                    {{ getRelativeTime(alert.created_at) }}
                  </span>
                </div>

                <p class="text-sm font-body text-gray-600 m-0 mb-2 leading-relaxed">
                  {{ alert.content }}
                </p>

                <div class="flex items-center gap-2 flex-wrap">
                  <!-- Type Badge -->
                  <span class="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-md bg-gray-100 text-gray-600">
                    {{ formatType(alert.type) }}
                  </span>
                  <!-- Severity Badge -->
                  <span class="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-md"
                    [class]="getSeverityBadgeClass(alert.severity)">
                    {{ alert.severity }}
                  </span>
                  <!-- Account -->
                  <span class="text-[11px] font-body text-gray-400">
                    Account: {{ alert.account_id }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="bg-white rounded-card shadow-card p-12 text-center">
        <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <lucide-icon name="bell-off" [size]="28" class="text-gray-400"></lucide-icon>
        </div>
        <h3 class="text-lg font-display font-bold text-navy m-0 mb-2">No alerts found</h3>
        <p class="text-sm font-body text-gray-500 m-0 max-w-sm mx-auto">
          @if (activeTab() === 'all') {
            Autopilot is monitoring your accounts. Alerts will appear here when anomalies or opportunities are detected.
          } @else {
            No {{ activeTab() }} alerts at the moment. Try switching to a different filter.
          }
        </p>
      </div>
    }

    <!-- Error State -->
    @if (error()) {
      <div class="bg-red-50 border border-red-200 rounded-card p-5 mt-4">
        <div class="flex items-center gap-3">
          <lucide-icon name="alert-circle" [size]="20" class="text-red-500"></lucide-icon>
          <p class="text-sm font-body text-red-700 m-0">{{ error() }}</p>
        </div>
      </div>
    }
  `,
})
export default class AutopilotComponent implements OnInit {
  private api = inject(ApiService);
  private badgeService = inject(AutopilotBadgeService);

  alerts = signal<AutopilotAlert[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  activeTab = signal<FilterTab>('all');

  filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'critical', label: 'Critical' },
    { key: 'warning', label: 'Warnings' },
    { key: 'success', label: 'Success' },
  ];

  unreadCount = computed(() => this.alerts().filter(a => !a.read).length);

  filteredAlerts = computed(() => {
    const tab = this.activeTab();
    const all = this.alerts();
    switch (tab) {
      case 'unread': return all.filter(a => !a.read);
      case 'critical': return all.filter(a => a.severity === 'critical');
      case 'warning': return all.filter(a => a.severity === 'warning');
      case 'success': return all.filter(a => a.severity === 'success');
      default: return all;
    }
  });

  ngOnInit() {
    this.fetchAlerts();
  }

  fetchAlerts() {
    this.loading.set(true);
    this.error.set(null);
    this.api.get<{ success: boolean; alerts: AutopilotAlert[]; unread_count: { cnt: number } }>(
      environment.AUTOPILOT_ALERTS
    ).subscribe({
      next: (res) => {
        this.alerts.set(res.alerts ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load alerts. Please try again.');
        this.loading.set(false);
      }
    });
  }

  markAllRead() {
    this.api.post(environment.AUTOPILOT_MARK_READ, { all: true }).subscribe({
      next: () => {
        this.alerts.update(alerts => alerts.map(a => ({ ...a, read: true })));
        this.badgeService.refresh();
      }
    });
  }

  getTabCount(tab: FilterTab): number {
    const all = this.alerts();
    switch (tab) {
      case 'unread': return all.filter(a => !a.read).length;
      case 'critical': return all.filter(a => a.severity === 'critical').length;
      case 'warning': return all.filter(a => a.severity === 'warning').length;
      case 'success': return all.filter(a => a.severity === 'success').length;
      default: return 0;
    }
  }

  getSeverityBorderClass(severity: string): string {
    switch (severity) {
      case 'critical': return 'border-l-red-500';
      case 'warning': return 'border-l-amber-500';
      case 'success': return 'border-l-emerald-500';
      case 'info': return 'border-l-blue-500';
      default: return 'border-l-gray-300';
    }
  }

  getSeverityBgClass(severity: string): string {
    switch (severity) {
      case 'critical': return 'bg-red-50';
      case 'warning': return 'bg-amber-50';
      case 'success': return 'bg-emerald-50';
      case 'info': return 'bg-blue-50';
      default: return 'bg-gray-50';
    }
  }

  getSeverityTextClass(severity: string): string {
    switch (severity) {
      case 'critical': return 'text-red-500';
      case 'warning': return 'text-amber-500';
      case 'success': return 'text-emerald-500';
      case 'info': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  }

  getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return 'alert-triangle';
      case 'warning': return 'alert-circle';
      case 'success': return 'trending-up';
      case 'info': return 'info';
      default: return 'bell';
    }
  }

  getSeverityBadgeClass(severity: string): string {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700';
      case 'warning': return 'bg-amber-100 text-amber-700';
      case 'success': return 'bg-emerald-100 text-emerald-700';
      case 'info': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  formatType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  getRelativeTime(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
}
