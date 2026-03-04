import { Component, inject, signal, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface CommandItem {
  id: string;
  label: string;
  category: string;
  icon: string;
  route?: string;
  action?: () => void;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open()) {
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] animate-fade-in" (click)="close()"></div>

      <!-- Palette -->
      <div class="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[101] animate-slide-down">
        <div class="bg-white rounded-xl shadow-modal overflow-hidden border border-gray-200">
          <!-- Search Input -->
          <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            <span class="text-gray-400 text-lg">&#128269;</span>
            <input
              #searchInput
              [(ngModel)]="query"
              (input)="onSearch()"
              placeholder="Search pages, actions, or brands..."
              class="flex-1 bg-transparent border-0 outline-none text-sm font-body text-navy placeholder:text-gray-400" />
            <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-400">ESC</kbd>
          </div>

          <!-- Results -->
          <div class="max-h-80 overflow-y-auto">
            @if (filteredItems().length === 0) {
              <div class="p-8 text-center">
                <span class="text-3xl block mb-2 opacity-40">&#128270;</span>
                <p class="text-sm text-gray-400 font-body m-0">No results found</p>
              </div>
            } @else {
              @for (category of categories(); track category) {
                <div class="px-2 pt-2">
                  <span class="px-2 text-[10px] font-body font-semibold text-gray-400 uppercase">{{ category }}</span>
                </div>
                @for (item of getItemsByCategory(category); track item.id) {
                  <button
                    (click)="executeItem(item)"
                    (mouseenter)="activeIndex = getItemIndex(item)"
                    class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-0 bg-transparent cursor-pointer"
                    [ngClass]="activeIndex === getItemIndex(item) ? 'bg-accent/5 text-accent' : 'text-navy hover:bg-gray-50'">
                    <span class="text-lg w-6 text-center">{{ item.icon }}</span>
                    <span class="text-sm font-body">{{ item.label }}</span>
                  </button>
                }
              }
            }
          </div>

          <!-- Footer -->
          <div class="flex items-center gap-4 px-4 py-2 border-t border-gray-100 bg-gray-50">
            <div class="flex items-center gap-1 text-[10px] text-gray-400 font-body">
              <kbd class="px-1 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono">↑</kbd>
              <kbd class="px-1 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono">↓</kbd>
              navigate
            </div>
            <div class="flex items-center gap-1 text-[10px] text-gray-400 font-body">
              <kbd class="px-1 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono">↵</kbd>
              select
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes slide-down {
      from { opacity: 0; transform: translate(-50%, -12px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
    .animate-slide-down {
      animation: slide-down 0.15s ease-out;
    }
  `]
})
export class CommandPaletteComponent {
  private router = inject(Router);

  open = signal(false);
  query = '';
  activeIndex = 0;

  allItems: CommandItem[] = [
    // Pages
    { id: 'nav-dashboard', label: 'Dashboard', category: 'Pages', icon: '&#9632;', route: '/app/dashboard' },
    { id: 'nav-cockpit', label: 'Creative Cockpit', category: 'Pages', icon: '&#127912;', route: '/app/creative-cockpit' },
    { id: 'nav-director', label: 'Director Lab', category: 'Pages', icon: '&#127916;', route: '/app/director-lab' },
    { id: 'nav-ugc', label: 'Creative Studio', category: 'Pages', icon: '&#9654;', route: '/app/ugc-studio' },
    { id: 'nav-brain', label: 'Brain', category: 'Pages', icon: '&#129504;', route: '/app/brain' },
    { id: 'nav-analytics', label: 'Analytics', category: 'Pages', icon: '&#128202;', route: '/app/analytics' },
    { id: 'nav-ai', label: 'AI Studio', category: 'Pages', icon: '&#128172;', route: '/app/ai-studio' },
    { id: 'nav-reports', label: 'Reports', category: 'Pages', icon: '&#128196;', route: '/app/reports' },
    { id: 'nav-campaigns', label: 'Campaign Builder', category: 'Pages', icon: '&#128227;', route: '/app/campaigns' },
    { id: 'nav-graphic', label: 'Graphic Studio', category: 'Pages', icon: '&#128444;', route: '/app/graphic-studio' },
    { id: 'nav-assets', label: 'Assets Vault', category: 'Pages', icon: '&#128194;', route: '/app/assets' },
    { id: 'nav-swipe', label: 'Swipe File', category: 'Pages', icon: '&#128278;', route: '/app/swipe-file' },
    { id: 'nav-lighthouse', label: 'Lighthouse', category: 'Pages', icon: '&#9201;', route: '/app/lighthouse' },
    { id: 'nav-attribution', label: 'Attribution', category: 'Pages', icon: '&#9095;', route: '/app/attribution' },
    { id: 'nav-audit', label: 'Account Audit', category: 'Pages', icon: '&#128737;', route: '/app/audit' },
    { id: 'nav-automations', label: 'Automations', category: 'Pages', icon: '&#9881;', route: '/app/automations' },
    { id: 'nav-settings', label: 'Settings', category: 'Pages', icon: '&#9881;', route: '/app/settings' },
    { id: 'nav-agency', label: 'Agency Command Center', category: 'Pages', icon: '&#127970;', route: '/app/agency' },
    // Actions
    { id: 'act-campaign', label: 'Create New Campaign', category: 'Actions', icon: '&#10133;', route: '/app/campaigns' },
    { id: 'act-creative', label: 'Generate Creative Brief', category: 'Actions', icon: '&#9997;', route: '/app/director-lab' },
    { id: 'act-report', label: 'Generate Report', category: 'Actions', icon: '&#128200;', route: '/app/reports' },
    { id: 'act-audit', label: 'Run Account Audit', category: 'Actions', icon: '&#128737;', route: '/app/audit' },
  ];

  private filteredCache: CommandItem[] = this.allItems;

  filteredItems(): CommandItem[] {
    return this.filteredCache;
  }

  categories(): string[] {
    const cats = new Set(this.filteredCache.map(i => i.category));
    return Array.from(cats);
  }

  getItemsByCategory(category: string): CommandItem[] {
    return this.filteredCache.filter(i => i.category === category);
  }

  getItemIndex(item: CommandItem): number {
    return this.filteredCache.indexOf(item);
  }

  onSearch() {
    const q = this.query.toLowerCase();
    if (!q) {
      this.filteredCache = this.allItems;
    } else {
      this.filteredCache = this.allItems.filter(i =>
        i.label.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
      );
    }
    this.activeIndex = 0;
  }

  executeItem(item: CommandItem) {
    this.close();
    if (item.route) {
      this.router.navigate([item.route]);
    }
    if (item.action) {
      item.action();
    }
  }

  close() {
    this.open.set(false);
    this.query = '';
    this.filteredCache = this.allItems;
    this.activeIndex = 0;
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    // Cmd+K or Ctrl+K to open
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.open.set(!this.open());
      if (!this.open()) {
        this.close();
      }
      return;
    }

    if (!this.open()) return;

    // Escape to close
    if (event.key === 'Escape') {
      this.close();
      return;
    }

    // Arrow navigation
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = Math.min(this.activeIndex + 1, this.filteredCache.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = Math.max(this.activeIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.filteredCache[this.activeIndex];
      if (item) this.executeItem(item);
    }
  }
}
