import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, RelativeTimePipe],
  template: `
    <header class="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-md border-b border-divider flex items-center justify-between px-8">
      <!-- Left: Title -->
      <div class="flex items-center gap-3">
        <button class="lg:hidden p-2 hover:bg-gray-100 rounded-lg border-0 bg-transparent cursor-pointer" (click)="onMenuToggle()">
          <span class="text-xl">&#9776;</span>
        </button>
        <div>
          <h1 class="text-page-title font-display text-navy m-0">{{ title }}</h1>
          @if (subtitle) {
            <p class="text-sm text-gray-500 font-body m-0">{{ subtitle }}</p>
          }
        </div>
      </div>

      <!-- Right: Actions -->
      <div class="flex items-center gap-3">
        <!-- Date Range Picker -->
        <div class="relative">
          <button
            (click)="datePickerOpen.set(!datePickerOpen())"
            class="btn-secondary !py-1.5 !px-3 !text-xs flex items-center gap-1.5">
            <span>&#128197;</span>
            {{ selectedRange }}
            <span class="text-gray-400">&#9660;</span>
          </button>
          @if (datePickerOpen()) {
            <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-dropdown border border-divider py-1 min-w-[180px] z-50">
              @for (range of dateRanges; track range) {
                <button
                  (click)="selectRange(range)"
                  class="w-full text-left px-4 py-2 text-sm font-body hover:bg-cream transition-colors border-0 bg-transparent cursor-pointer"
                  [class.text-accent]="range === selectedRange"
                  [class.font-semibold]="range === selectedRange">
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
            <span class="text-xl">&#128276;</span>
            @if (notificationService.unreadCount() > 0) {
              <span class="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {{ notificationService.unreadCount() }}
              </span>
            }
          </button>

          @if (notifOpen()) {
            <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-dropdown border border-divider w-[380px] z-50 overflow-hidden">
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
                    (click)="handleNotifClick(notif.actionRoute)">
                    <span class="shrink-0 mt-0.5"
                      [ngClass]="notif.type === 'alert' ? 'text-red-500' : notif.type === 'positive' ? 'text-green-500' : 'text-blue-500'">
                      {{ notif.type === 'alert' ? '🔴' : notif.type === 'positive' ? '🟢' : '🔵' }}
                    </span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-body font-medium text-navy m-0 truncate">{{ notif.title }}</p>
                      <p class="text-xs text-gray-500 m-0 mt-0.5">{{ notif.createdAt | relativeTime }}</p>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- User Avatar -->
        <div class="relative">
          <button
            (click)="userMenuOpen.set(!userMenuOpen())"
            class="w-9 h-9 rounded-full bg-accent text-white font-bold text-sm flex items-center justify-center border-0 cursor-pointer hover:ring-2 hover:ring-accent/30 transition-all">
            {{ getUserInitials() }}
          </button>

          @if (userMenuOpen()) {
            <div class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-dropdown border border-divider w-56 z-50 overflow-hidden">
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
export class TopbarComponent {
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  private router = inject(Router);

  title = 'Dashboard';
  subtitle = '';

  datePickerOpen = signal(false);
  notifOpen = signal(false);
  userMenuOpen = signal(false);

  selectedRange = 'Last 7 Days';
  dateRanges = ['Today', 'Yesterday', 'Last 7 Days', 'Last 14 Days', 'Last 30 Days', 'This Month', 'Last Month'];

  selectRange(range: string) {
    this.selectedRange = range;
    this.datePickerOpen.set(false);
  }

  getUserInitials(): string {
    const name = this.authService.user()?.name || 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  handleNotifClick(route?: string) {
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
