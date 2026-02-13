import { Component, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { BrandService } from '../../../core/services/brand.service';
import { BrandSwitcherComponent } from '../brand-switcher/brand-switcher.component';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, BrandSwitcherComponent],
  template: `
    <aside
      class="fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300 overflow-hidden"
      [class]="collapsed() ? 'w-[72px]' : 'w-[260px]'"
      [style.background]="'var(--bg-sidebar)'">

      <!-- Logo -->
      <div class="flex items-center h-16 px-4 shrink-0" [class.justify-center]="collapsed()">
        <a routerLink="/app/dashboard" class="flex items-center gap-2 no-underline">
          <span class="text-white font-display font-bold text-xl">C</span>
          @if (!collapsed()) {
            <span class="text-white font-display font-bold text-xl tracking-wide">COSMISK</span>
          }
        </a>
      </div>

      <!-- Brand Switcher -->
      @if (!collapsed()) {
        <div class="px-3 mb-4">
          <app-brand-switcher />
        </div>
      }

      <!-- Navigation Groups -->
      <nav class="flex-1 overflow-y-auto px-2 space-y-4">
        @for (group of navGroups; track group.title) {
          <div>
            @if (!collapsed()) {
              <p class="px-3 mb-1 text-[11px] font-mono font-semibold text-gray-500 uppercase tracking-widest">
                {{ group.title }}
              </p>
            }
            <ul class="space-y-0.5">
              @for (item of group.items; track item.route) {
                <li>
                  <a
                    [routerLink]="item.route"
                    routerLinkActive="sidebar-active"
                    class="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-[var(--bg-sidebar-hover)] transition-all duration-150 group no-underline"
                    [class.justify-center]="collapsed()"
                    [title]="item.label">
                    <span class="text-lg shrink-0" [innerHTML]="getIcon(item.icon)"></span>
                    @if (!collapsed()) {
                      <span class="text-sm font-body font-medium truncate">{{ item.label }}</span>
                    }
                  </a>
                </li>
              }
            </ul>
          </div>
        }
      </nav>

      <!-- Bottom: Settings + Collapse -->
      <div class="px-2 pb-4 mt-auto space-y-1 shrink-0">
        <a
          routerLink="/app/settings"
          routerLinkActive="sidebar-active"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-[var(--bg-sidebar-hover)] transition-all duration-150 no-underline"
          [class.justify-center]="collapsed()">
          <span class="text-lg">&#9881;</span>
          @if (!collapsed()) {
            <span class="text-sm font-body font-medium">Settings</span>
          }
        </a>

        <button
          (click)="toggleCollapse()"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-500 hover:text-white hover:bg-[var(--bg-sidebar-hover)] transition-all duration-150 w-full border-0 bg-transparent cursor-pointer"
          [class.justify-center]="collapsed()">
          <span class="text-lg transition-transform duration-300" [class.rotate-180]="collapsed()">&#9664;</span>
          @if (!collapsed()) {
            <span class="text-sm font-body font-medium">Collapse</span>
          }
        </button>
      </div>
    </aside>

    <!-- Mobile overlay -->
    @if (mobileOpen()) {
      <div class="fixed inset-0 bg-black/60 z-30 lg:hidden" (click)="mobileOpen.set(false)"></div>
    }
  `,
  styles: [`
    :host { display: block; }
    .sidebar-active {
      color: white !important;
      background: var(--bg-sidebar-hover);
      border-left: 3px solid var(--accent);
    }
  `]
})
export class SidebarComponent {
  collapsed = signal(false);
  mobileOpen = signal(false);

  navGroups: NavGroup[] = [
    {
      title: 'Command',
      items: [
        { label: 'Dashboard', icon: 'layout-dashboard', route: '/app/dashboard' },
        { label: 'Creative Cockpit', icon: 'palette', route: '/app/creative-cockpit' },
        { label: 'Director Lab', icon: 'clapperboard', route: '/app/director-lab' },
        { label: 'UGC Studio', icon: 'video', route: '/app/ugc-studio' },
      ]
    },
    {
      title: 'Intelligence',
      items: [
        { label: 'Brain', icon: 'brain', route: '/app/brain' },
        { label: 'Analytics', icon: 'bar-chart', route: '/app/analytics' },
        { label: 'AI Studio', icon: 'message-square', route: '/app/ai-studio' },
        { label: 'Reports', icon: 'file-text', route: '/app/reports' },
      ]
    },
    {
      title: 'Create',
      items: [
        { label: 'Campaign Builder', icon: 'megaphone', route: '/app/campaigns' },
        { label: 'Graphic Studio', icon: 'image', route: '/app/graphic-studio' },
        { label: 'Assets Vault', icon: 'folder-open', route: '/app/assets' },
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
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
      event.preventDefault();
      this.toggleCollapse();
    }
  }

  getIcon(name: string): string {
    const icons: Record<string, string> = {
      'layout-dashboard': '&#9632;',
      'palette': '&#127912;',
      'clapperboard': '&#127916;',
      'video': '&#9654;',
      'brain': '&#129504;',
      'bar-chart': '&#128202;',
      'message-square': '&#128172;',
      'file-text': '&#128196;',
      'megaphone': '&#128227;',
      'image': '&#128444;',
      'folder-open': '&#128194;',
      'bookmark': '&#128278;',
      'gauge': '&#9201;',
      'git-branch': '&#9095;',
      'shield': '&#128737;',
      'workflow': '&#9881;',
    };
    return icons[name] || '&#9679;';
  }
}
