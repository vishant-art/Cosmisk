import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { DateRangeService, DatePreset } from '../../../core/services/date-range.service';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [
    CommonModule, RouterLink, RelativeTimePipe,
    LucideAngularModule
  ],
  template: `
    <header class="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-xl border-b border-divider flex items-center justify-between px-8">
      <!-- Left: Title + Breadcrumb -->
      <div class="flex items-center gap-3">
        <button class="lg:hidden p-2 hover:bg-gray-100 rounded-lg border-0 bg-transparent cursor-pointer" (click)="onMenuToggle()">
          <lucide-icon name="menu" [size]="20" class="text-gray-600"></lucide-icon>
        </button>
        <div>
          <h1 class="text-page-title font-display text-navy m-0">{{ pageTitle }}</h1>
          @if (breadcrumb) {
            <p class="text-xs text-gray-400 font-body m-0 mt-0.5">{{ breadcrumb }}</p>
          }
        </div>
      </div>

      <!-- Right: Actions -->
      <div class="flex items-center gap-2">
        <!-- Search Hint -->
        <button class="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-sm text-gray-400 font-body hover:bg-gray-100 transition-colors border border-gray-100 cursor-pointer">
          <lucide-icon name="search" [size]="15" class="text-gray-400"></lucide-icon>
          <span>Search...</span>
          <kbd class="ml-2 px-1.5 py-0.5 bg-white rounded text-[10px] font-mono text-gray-400 border border-gray-200 shadow-sm">&#8984;K</kbd>
        </button>

        <!-- Date Range Picker -->
        <div class="relative">
          <button
            (click)="datePickerOpen.set(!datePickerOpen())"
            class="btn-secondary !py-1.5 !px-3 !text-xs flex items-center gap-1.5">
            <lucide-icon name="calendar" [size]="14" class="text-gray-500"></lucide-icon>
            {{ selectedRange() }}
            <lucide-icon name="chevron-down" [size]="12" class="text-gray-400"></lucide-icon>
          </button>
          @if (datePickerOpen()) {
            <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-dropdown border border-divider py-1 min-w-[180px] z-50 animate-scale-in">
              @for (range of dateRanges; track range) {
                <button
                  (click)="selectRange(range)"
                  class="w-full text-left px-4 py-2 text-sm font-body hover:bg-cream transition-colors border-0 bg-transparent cursor-pointer"
                  [class.text-accent]="range === selectedRange()"
                  [class.font-semibold]="range === selectedRange()">
                  {{ range }}
                </button>
              }
            </div>
          }
        </div>

        <!-- Notifications -->
        <div class="relative">
          <button
            (click)="notifOpen.set(!notifOpen())"
            class="relative p-2 hover:bg-gray-100 rounded-lg transition-colors border-0 bg-transparent cursor-pointer">
            <lucide-icon name="bell" [size]="20" class="text-gray-600"></lucide-icon>
            @if (notificationService.unreadCount() > 0) {
              <span class="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {{ notificationService.unreadCount() }}
              </span>
            }
          </button>

          @if (notifOpen()) {
            <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-dropdown border border-divider w-[380px] z-50 overflow-hidden animate-scale-in">
              <div class="flex items-center justify-between px-4 py-3 border-b border-divider">
                <h3 class="text-sm font-semibold font-body m-0">Notifications</h3>
                <button
                  (click)="notificationService.markAllAsRead()"
                  class="text-xs text-accent hover:underline border-0 bg-transparent cursor-pointer">
                  Mark all as read
                </button>
              </div>
              <div class="max-h-80 overflow-y-auto">
                @for (notif of notificationService.allNotifications(); track notif.id) {
                  <div
                    class="flex gap-3 px-4 py-3 border-b border-divider hover:bg-cream transition-colors cursor-pointer"
                    [class.bg-cream]="!notif.read"
                    (click)="handleNotifClick(notif.id, notif.actionRoute)">
                    <span class="shrink-0 mt-0.5">
                      @if (notif.type === 'alert') {
                        <lucide-icon name="alert-circle" [size]="16" class="text-red-500"></lucide-icon>
                      } @else if (notif.type === 'positive') {
                        <lucide-icon name="check-circle-2" [size]="16" class="text-green-500"></lucide-icon>
                      } @else {
                        <lucide-icon name="info" [size]="16" class="text-blue-500"></lucide-icon>
                      }
                    </span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-body font-medium text-navy m-0 truncate">{{ notif.title }}</p>
                      <p class="text-xs text-gray-500 m-0 mt-0.5">{{ notif.createdAt | relativeTime }}</p>
                    </div>
                  </div>
                }
              </div>
              <a routerLink="/app/autopilot" class="block text-center text-xs text-accent font-body font-semibold py-2.5 hover:bg-cream transition-colors no-underline border-t border-divider">
                View All Notifications
              </a>
            </div>
          }
        </div>

        <!-- User Avatar -->
        <div class="relative">
          <button
            (click)="userMenuOpen.set(!userMenuOpen())"
            class="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent-hover text-white font-bold text-sm flex items-center justify-center border-0 cursor-pointer hover:ring-2 hover:ring-accent/30 transition-all shadow-sm">
            {{ getUserInitials() }}
          </button>

          @if (userMenuOpen()) {
            <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-dropdown border border-divider w-56 z-50 overflow-hidden animate-scale-in">
              <div class="px-4 py-3 border-b border-divider">
                <p class="text-sm font-semibold font-body m-0">{{ authService.user()?.name }}</p>
                <p class="text-xs text-gray-500 m-0 mt-0.5">{{ authService.user()?.email }}</p>
              </div>
              <div class="py-1">
                <button (click)="navigate('/app/settings')" class="w-full text-left px-4 py-2 text-sm font-body hover:bg-cream transition-colors border-0 bg-transparent cursor-pointer">Profile</button>
                <button (click)="navigate('/app/settings')" class="w-full text-left px-4 py-2 text-sm font-body hover:bg-cream transition-colors border-0 bg-transparent cursor-pointer">Settings</button>
              </div>
              <div class="border-t border-divider py-1">
                <button (click)="logout()" class="w-full text-left px-4 py-2 text-sm font-body text-red-500 hover:bg-red-50 transition-colors border-0 bg-transparent cursor-pointer">Log Out</button>
              </div>
            </div>
          }
        </div>
      </div>
    </header>
  `
})
export class TopbarComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  private dateRangeService = inject(DateRangeService);
  private router = inject(Router);
  private routerSub: any;

  pageTitle = 'Dashboard';
  breadcrumb = '';

  datePickerOpen = signal(false);
  notifOpen = signal(false);
  userMenuOpen = signal(false);

  selectedRange = computed(() => this.dateRangeService.displayLabel());
  dateRanges = ['Today', 'Yesterday', 'Last 7 Days', 'Last 14 Days', 'Last 30 Days', 'This Month', 'Last Month'];

  private labelToPreset: Record<string, DatePreset> = {
    'Today': 'today',
    'Yesterday': 'yesterday',
    'Last 7 Days': 'last_7d',
    'Last 14 Days': 'last_14d',
    'Last 30 Days': 'last_30d',
    'This Month': 'this_month',
    'Last Month': 'last_month',
  };

  private routeTitles: Record<string, { title: string; breadcrumb?: string }> = {
    '/app/dashboard': { title: 'Dashboard' },
    '/app/creative-cockpit': { title: 'Creative Cockpit', breadcrumb: 'Command' },
    '/app/director-lab': { title: 'Director Lab', breadcrumb: 'Command' },
    '/app/ugc-studio': { title: 'Creative Studio', breadcrumb: 'Command' },
    '/app/brain': { title: 'Brain', breadcrumb: 'Intelligence' },
    '/app/analytics': { title: 'Analytics', breadcrumb: 'Intelligence' },
    '/app/ai-studio': { title: 'AI Studio', breadcrumb: 'Intelligence' },
    '/app/reports': { title: 'Reports', breadcrumb: 'Intelligence' },
    '/app/campaigns': { title: 'Campaign Builder', breadcrumb: 'Create' },
    '/app/graphic-studio': { title: 'Graphic Studio', breadcrumb: 'Create' },
    '/app/assets': { title: 'Assets Vault', breadcrumb: 'Create' },
    '/app/swipe-file': { title: 'Swipe File', breadcrumb: 'Create' },
    '/app/lighthouse': { title: 'Lighthouse', breadcrumb: 'Optimize' },
    '/app/attribution': { title: 'Attribution', breadcrumb: 'Optimize' },
    '/app/audit': { title: 'Account Audit', breadcrumb: 'Optimize' },
    '/app/automations': { title: 'Automations', breadcrumb: 'Optimize' },
    '/app/creative-engine': { title: 'Creative Engine', breadcrumb: 'Command' },
    '/app/autopilot': { title: 'Autopilot', breadcrumb: 'Intelligence' },
    '/app/competitor-spy': { title: 'Competitor Spy', breadcrumb: 'Intelligence' },
    '/app/content-bank': { title: 'Content Bank', breadcrumb: 'Create' },
    '/app/settings': { title: 'Settings' },
    '/app/agency': { title: 'Agency Command Center' },
  };

  ngOnInit() {
    this.updateTitle(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => this.updateTitle(e.urlAfterRedirects || e.url));

    // Start polling real autopilot alerts
    this.notificationService.startPolling();
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
    this.notificationService.stopPolling();
  }

  private updateTitle(url: string) {
    const base = url.split('?')[0];
    const match = this.routeTitles[base];
    this.pageTitle = match?.title || 'Dashboard';
    this.breadcrumb = match?.breadcrumb || '';
  }

  selectRange(range: string) {
    const preset = this.labelToPreset[range];
    if (preset) {
      this.dateRangeService.setPreset(preset);
    }
    this.datePickerOpen.set(false);
  }

  getUserInitials(): string {
    const name = this.authService.user()?.name || 'U';
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  handleNotifClick(id: string, route?: string) {
    this.notificationService.markAsRead(id);
    this.notifOpen.set(false);
    if (route) this.router.navigate([route]);
  }

  navigate(route: string) {
    this.userMenuOpen.set(false);
    this.router.navigate([route]);
  }

  logout() {
    this.userMenuOpen.set(false);
    this.authService.logout();
  }

  onMenuToggle() {
    // Emit event for mobile sidebar toggle
  }
}
