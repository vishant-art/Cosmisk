import { Component, signal, ViewChild, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { Subscription } from 'rxjs';
import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { TopbarComponent } from '../../shared/components/topbar/topbar.component';
import { ToastComponent } from '../../shared/components/toast/toast.component';
import { CommandPaletteComponent } from '../../shared/components/command-palette/command-palette.component';
import { WelcomeTourComponent } from '../../shared/components/welcome-tour/welcome-tour.component';
import { WhatsNewComponent } from '../../shared/components/whats-new/whats-new.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ScrollTopComponent } from '../../shared/components/scroll-top/scroll-top.component';
import { LucideAngularModule } from 'lucide-angular';
import { AdAccountService } from '../../core/services/ad-account.service';

@Component({
  selector: 'app-app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, TopbarComponent, ToastComponent, CommandPaletteComponent, WelcomeTourComponent, WhatsNewComponent, ConfirmDialogComponent, ScrollTopComponent, LucideAngularModule],
  template: `
    <div class="min-h-screen bg-[#F7F8FA] pb-7">
      <!-- Route Loading Bar -->
      @if (navigating()) {
        <div class="fixed top-0 left-0 right-0 z-50 h-[3px]">
          <div class="h-full bg-gradient-to-r from-accent via-violet-400 to-accent rounded-r-full animate-loading-bar"></div>
        </div>
      }

      <app-sidebar #sidebar (collapsedChange)="sidebarCollapsed.set($event)" />

      <div class="transition-all duration-300 max-lg:!ml-0"
        [style.margin-left.px]="sidebarCollapsed() ? 72 : 260">
        <app-topbar (menuToggle)="sidebar.openMobile()" />

        <main class="p-4 md:p-8">
          <div class="route-animate" [attr.data-route]="routeKey">
            <router-outlet (activate)="onRouteActivate()" />
          </div>
        </main>
      </div>

      <!-- System Status Bar -->
      <div class="fixed bottom-0 left-0 right-0 h-7 bg-[#0F0F1A] border-t border-white/[0.06] flex items-center justify-between px-4 z-30 transition-all duration-300 max-lg:!pl-4"
        [style.padding-left.px]="sidebarCollapsed() ? 80 : 268">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>
            <span class="text-[10px] font-mono text-gray-500">Connected</span>
          </div>
          @if (adAccountService.currentAccount(); as acc) {
            <div class="flex items-center gap-1.5">
              <lucide-icon name="building-2" [size]="10" class="text-gray-600"></lucide-icon>
              <span class="text-[10px] font-mono text-gray-500 truncate max-w-[200px]">{{ acc.name }}</span>
            </div>
          }
          <div class="flex items-center gap-1.5">
            <lucide-icon name="bot" [size]="10" class="text-gray-600"></lucide-icon>
            <span class="text-[10px] font-mono text-gray-500">6 agents active</span>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-1 text-[10px] font-mono text-gray-600">
            <kbd class="px-1 py-0.5 bg-white/[0.06] rounded text-[9px] border border-white/[0.08]">&#8984;K</kbd>
            <span>Command</span>
          </div>
          <div class="flex items-center gap-1 text-[10px] font-mono text-gray-600">
            <kbd class="px-1 py-0.5 bg-white/[0.06] rounded text-[9px] border border-white/[0.08]">?</kbd>
            <span>Shortcuts</span>
          </div>
          <span class="text-[9px] font-mono text-gray-700">v1.4.0</span>
        </div>
      </div>

      <app-toast />
      <app-command-palette />
      <app-welcome-tour />
      <app-whats-new #whatsNew />
      <app-confirm-dialog />
      <app-scroll-top />
    </div>
  `
})
export class AppLayoutComponent implements OnInit, OnDestroy {
  @ViewChild(WelcomeTourComponent) tour!: WelcomeTourComponent;
  @ViewChild('whatsNew') whatsNew!: WhatsNewComponent;
  private router = inject(Router);
  adAccountService = inject(AdAccountService);

  sidebarCollapsed = signal(false);
  navigating = signal(false);
  routeKey = 0;
  private routerSub!: Subscription;

  ngOnInit() {
    if (!localStorage.getItem('cosmisk_tour_seen')) {
      setTimeout(() => this.tour?.show(), 800);
    } else {
      // Only show changelog if tour is already seen
      setTimeout(() => this.whatsNew?.checkAndShow(), 1200);
    }

    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.navigating.set(true);
      } else if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.navigating.set(false);
      }
    });
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
  }

  onRouteActivate() {
    this.routeKey++;
  }
}
