import { Component, signal, HostListener, Output, EventEmitter, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { BrandSwitcherComponent } from '../brand-switcher/brand-switcher.component';
import { AccountSwitcherComponent } from '../account-switcher/account-switcher.component';
import { LucideAngularModule } from 'lucide-angular';
import { AutopilotBadgeService } from '../../../core/services/autopilot-badge.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  pro?: boolean;
  badge?: 'autopilot';
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule, RouterLink, RouterLinkActive, BrandSwitcherComponent,
    AccountSwitcherComponent, LucideAngularModule
  ],
  template: `
    <aside
      class="fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300 overflow-hidden sidebar-shell"
      [class]="collapsed() ? 'w-[72px]' : 'w-[260px]'">

      <!-- Logo -->
      <div class="flex items-center h-16 px-4 shrink-0" [class.justify-center]="collapsed()">
        <a routerLink="/app/dashboard" class="flex items-center gap-2.5 no-underline">
          <div class="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center" style="filter: drop-shadow(0 0 8px rgba(99,102,241,0.4))">
            <lucide-icon name="sparkles" [size]="16" class="text-accent"></lucide-icon>
          </div>
          @if (!collapsed()) {
            <span class="text-white font-display font-bold text-xl tracking-wide">COSMISK</span>
          }
        </a>
      </div>

      <!-- Brand Switcher -->
      @if (!collapsed()) {
        <div class="px-3 mb-2">
          <app-brand-switcher />
        </div>
        <div class="px-3 mb-4">
          <app-account-switcher />
        </div>
      }

      <!-- Navigation Groups -->
      <nav class="flex-1 overflow-y-auto px-2 space-y-1 sidebar-nav">
        @for (group of navGroups; track group.title; let gi = $index) {
          <div>
            @if (gi > 0) {
              <div class="mx-3 my-2 h-px bg-white/[0.06]"></div>
            }
            @if (!collapsed()) {
              <p class="px-3 mb-1 text-[10px] font-mono font-semibold text-gray-500 uppercase tracking-[0.15em]">
                {{ group.title }}
              </p>
            }
            <ul class="space-y-0.5 list-none p-0 m-0">
              @for (item of group.items; track item.route) {
                <li class="relative">
                  <a
                    [routerLink]="item.route"
                    routerLinkActive="sidebar-active"
                    class="sidebar-link flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all duration-150 group no-underline relative"
                    [class.justify-center]="collapsed()"
                    [attr.data-tooltip]="item.label">
                    <lucide-icon [name]="item.icon" [size]="20" [strokeWidth]="1.75" class="shrink-0 sidebar-icon"></lucide-icon>
                    @if (!collapsed()) {
                      <span class="text-sm font-body font-medium truncate">{{ item.label }}</span>
                      @if (item.badge === 'autopilot' && badgeService.unreadCount() > 0) {
                        <span class="ml-auto min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold font-mono bg-red-500 text-white rounded-full leading-none">
                          {{ badgeService.unreadCount() > 99 ? '99+' : badgeService.unreadCount() }}
                        </span>
                      } @else if (item.pro) {
                        <span class="ml-auto px-1.5 py-0.5 text-[9px] font-bold font-mono bg-accent/15 text-accent rounded">PRO</span>
                      }
                    }
                  </a>
                  <!-- Collapsed tooltip -->
                  @if (collapsed()) {
                    <div class="sidebar-tooltip">{{ item.label }}</div>
                  }
                </li>
              }
            </ul>
          </div>
        }
      </nav>

      <!-- Bottom: Settings + Collapse -->
      <div class="px-2 pb-4 mt-auto space-y-1 shrink-0 border-t border-white/[0.06] pt-2">
        <div class="mx-3 mb-2"></div>
        <a
          routerLink="/app/settings"
          routerLinkActive="sidebar-active"
          class="sidebar-link flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all duration-150 no-underline relative"
          [class.justify-center]="collapsed()"
          data-tooltip="Settings">
          <lucide-icon name="settings" [size]="20" [strokeWidth]="1.75" class="shrink-0 sidebar-icon"></lucide-icon>
          @if (!collapsed()) {
            <span class="text-sm font-body font-medium">Settings</span>
          }
        </a>

        <button
          (click)="toggleCollapse()"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all duration-150 w-full border-0 bg-transparent cursor-pointer relative"
          [class.justify-center]="collapsed()"
          data-tooltip="Collapse">
          <lucide-icon
            name="panel-left"
            [size]="20"
            [strokeWidth]="1.75"
            class="shrink-0 transition-transform duration-300"
            [class.rotate-180]="collapsed()">
          </lucide-icon>
          @if (!collapsed()) {
            <span class="text-sm font-body font-medium">Collapse</span>
          }
        </button>
      </div>
    </aside>

    <!-- Mobile overlay -->
    @if (mobileOpen()) {
      <div class="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm" (click)="closeMobile()"></div>
    }
  `,
  styles: [`
    :host { display: block; }

    .sidebar-shell {
      background: linear-gradient(180deg, #0F0F1A 0%, #0C0C14 100%);
    }

    .sidebar-nav::-webkit-scrollbar {
      width: 3px;
    }
    .sidebar-nav::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
    }

    .sidebar-active {
      color: white !important;
      background: rgba(255, 255, 255, 0.08) !important;
      border-left: 3px solid var(--accent);
    }
    .sidebar-active .sidebar-icon {
      color: var(--accent);
    }

    .sidebar-link:not(.sidebar-active):hover .sidebar-icon {
      color: white;
    }

    /* Collapsed tooltips */
    .sidebar-tooltip {
      position: absolute;
      left: calc(100% + 12px);
      top: 50%;
      transform: translateY(-50%);
      padding: 6px 12px;
      background: #1A1A2E;
      color: white;
      font-family: var(--font-body);
      font-size: 12px;
      font-weight: 500;
      border-radius: 6px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .sidebar-tooltip::before {
      content: '';
      position: absolute;
      right: 100%;
      top: 50%;
      transform: translateY(-50%);
      border: 5px solid transparent;
      border-right-color: #1A1A2E;
    }
    li:hover .sidebar-tooltip {
      opacity: 1;
    }
  `]
})
export class SidebarComponent implements OnInit, OnDestroy {
  badgeService = inject(AutopilotBadgeService);
  collapsed = signal(false);
  mobileOpen = signal(false);
  @Output() collapsedChange = new EventEmitter<boolean>();
  private badgeInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.badgeService.refresh();
    this.badgeInterval = setInterval(() => this.badgeService.refresh(), 60_000);
  }

  ngOnDestroy() {
    if (this.badgeInterval) clearInterval(this.badgeInterval);
  }

  navGroups: NavGroup[] = [
    {
      title: 'Command',
      items: [
        { label: 'Dashboard', icon: 'layout-dashboard', route: '/app/dashboard' },
        { label: 'Creative Cockpit', icon: 'palette', route: '/app/creative-cockpit' },
        { label: 'Director Lab', icon: 'clapperboard', route: '/app/director-lab' },
        { label: 'Creative Studio', icon: 'video', route: '/app/ugc-studio' },
        { label: 'Creative Engine', icon: 'rocket', route: '/app/creative-engine' },
      ]
    },
    {
      title: 'Intelligence',
      items: [
        { label: 'Brain', icon: 'brain', route: '/app/brain', pro: true },
        { label: 'Autopilot', icon: 'zap', route: '/app/autopilot', pro: true, badge: 'autopilot' },
        { label: 'Competitor Spy', icon: 'search', route: '/app/competitor-spy', pro: true },
        { label: 'Analytics', icon: 'bar-chart-3', route: '/app/analytics' },
        { label: 'AI Studio', icon: 'sparkles', route: '/app/ai-studio' },
        { label: 'Reports', icon: 'file-text', route: '/app/reports' },
      ]
    },
    {
      title: 'Create',
      items: [
        { label: 'Campaign Builder', icon: 'megaphone', route: '/app/campaigns' },
        { label: 'Graphic Studio', icon: 'image', route: '/app/graphic-studio' },
        { label: 'Assets Vault', icon: 'folder-open', route: '/app/assets' },
        { label: 'Content Bank', icon: 'notebook-pen', route: '/app/content-bank' },
        { label: 'Swipe File', icon: 'bookmark', route: '/app/swipe-file' },
      ]
    },
    {
      title: 'Optimize',
      items: [
        { label: 'Lighthouse', icon: 'gauge', route: '/app/lighthouse' },
        { label: 'Attribution', icon: 'git-branch', route: '/app/attribution' },
        { label: 'Account Audit', icon: 'shield', route: '/app/audit' },
        { label: 'Automations', icon: 'workflow', route: '/app/automations' },
      ]
    },
  ];

  toggleCollapse() {
    this.collapsed.update(v => !v);
    this.collapsedChange.emit(this.collapsed());
  }

  closeMobile() {
    this.mobileOpen.set(false);
  }

  openMobile() {
    this.mobileOpen.set(true);
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
      event.preventDefault();
      this.toggleCollapse();
    }
  }
}
