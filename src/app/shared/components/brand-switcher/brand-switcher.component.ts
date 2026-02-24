import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BrandService } from '../../../core/services/brand.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-brand-switcher',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <div class="relative">
      <button
        (click)="open.set(!open())"
        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-sidebar-hover)] text-white text-sm font-body hover:bg-white/10 transition-colors border-0 cursor-pointer">
        <span class="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold shrink-0">
          {{ brandService.currentBrand().name.charAt(0) }}
        </span>
        <span class="truncate flex-1 text-left">{{ brandService.currentBrand().name }}</span>
        <lucide-icon name="chevron-down" [size]="12" class="text-gray-500"></lucide-icon>
      </button>

      @if (open()) {
        <div class="absolute top-full left-0 right-0 mt-1 bg-navy rounded-lg shadow-dropdown z-50 overflow-hidden border border-white/10">
          <div class="p-2">
            <input
              type="text"
              placeholder="Search brands..."
              class="w-full px-3 py-1.5 bg-white/10 border-0 rounded text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-accent"
              (input)="onSearch($event)">
          </div>
          <div class="max-h-48 overflow-y-auto">
            @for (brand of filteredBrands(); track brand.id) {
              <button
                (click)="selectBrand(brand.id)"
                class="w-full flex items-center gap-2 px-3 py-2 text-gray-300 hover:bg-white/10 hover:text-white text-sm transition-colors border-0 bg-transparent cursor-pointer"
                [class.text-white]="brand.id === brandService.currentBrand().id">
                <span class="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold shrink-0">
                  {{ brand.name.charAt(0) }}
                </span>
                <span class="flex-1 text-left truncate">{{ brand.name }}</span>
                @if (brand.roas != null) {
                  <span
                    class="text-xs font-mono px-1.5 py-0.5 rounded"
                    [class]="getRoasClass(brand.roas)">
                    {{ brand.roas }}x
                  </span>
                }
                @if (brand.alertCount && brand.alertCount > 0) {
                  <span class="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                    {{ brand.alertCount }}
                  </span>
                }
              </button>
            }
          </div>
          <!-- Agency View Link -->
          <div class="border-t border-white/10 p-2">
            <a routerLink="/app/agency"
              (click)="open.set(false)"
              class="flex items-center gap-2 px-3 py-2 text-accent hover:bg-white/10 rounded text-sm font-body font-semibold transition-colors no-underline">
              <lucide-icon name="arrow-left" [size]="14"></lucide-icon>
              <span>Back to Agency View</span>
            </a>
          </div>
        </div>
      }
    </div>
  `
})
export class BrandSwitcherComponent {
  brandService = inject(BrandService);
  open = signal(false);
  searchTerm = signal('');

  filteredBrands = () => {
    const term = this.searchTerm().toLowerCase();
    return this.brandService.allBrands().filter(b =>
      b.name.toLowerCase().includes(term)
    );
  };

  onSearch(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  selectBrand(id: string) {
    this.brandService.switchBrand(id);
    this.open.set(false);
    this.searchTerm.set('');
  }

  getRoasClass(roas: number | undefined): string {
    if (roas != null && roas >= 3) return 'bg-green-900/30 text-green-400';
    if (roas != null && roas >= 2) return 'bg-yellow-900/30 text-yellow-400';
    return 'bg-red-900/30 text-red-400';
  }
}
