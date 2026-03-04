import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { AdAccountService } from '../../../core/services/ad-account.service';

@Component({
  selector: 'app-account-switcher',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="relative">
      <button
        (click)="open.set(!open())"
        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.06] text-gray-400 text-xs font-body hover:bg-white/10 transition-colors border-0 cursor-pointer">
        <lucide-icon name="bar-chart-3" [size]="14" class="text-accent shrink-0"></lucide-icon>
        @if (adAccountService.currentAccount(); as acc) {
          <span class="truncate flex-1 text-left">{{ acc.name }}</span>
        } @else if (adAccountService.loading()) {
          <span class="truncate flex-1 text-left text-gray-500">Loading accounts...</span>
        } @else {
          <span class="truncate flex-1 text-left text-gray-500">No ad accounts</span>
        }
        <lucide-icon name="chevron-down" [size]="12" class="text-gray-500 shrink-0"></lucide-icon>
      </button>

      @if (open()) {
        <div class="absolute top-full left-0 right-0 mt-1 bg-[#1A1A2E] rounded-lg shadow-dropdown z-50 overflow-hidden border border-white/10">
          <div class="p-2">
            <input
              type="text"
              placeholder="Search accounts..."
              class="w-full px-3 py-1.5 bg-white/10 border-0 rounded text-white text-xs placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-accent"
              (input)="onSearch($event)">
          </div>
          <div class="max-h-64 overflow-y-auto">
            @for (group of filteredGroups(); track group[0]) {
              <div class="px-3 pt-2 pb-1">
                <span class="text-[9px] font-mono font-semibold text-gray-500 uppercase tracking-wider">{{ group[0] }}</span>
              </div>
              @for (acc of group[1]; track acc.id) {
                <button
                  (click)="selectAccount(acc.id)"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-white/10 hover:text-white text-xs transition-colors border-0 bg-transparent cursor-pointer"
                  [class.text-white]="acc.id === adAccountService.currentAccount()?.id"
                  [style.background]="acc.id === adAccountService.currentAccount()?.id ? 'rgba(255,255,255,0.05)' : ''">
                  <span class="flex-1 text-left truncate">{{ acc.name }}</span>
                  <span class="text-[10px] font-mono text-gray-500">{{ acc.currency }}</span>
                </button>
              }
            }
            @if (filteredGroups().length === 0) {
              <div class="px-3 py-4 text-center text-xs text-gray-500">No accounts found</div>
            }
          </div>
          <div class="border-t border-white/10 px-3 py-2">
            <span class="text-[10px] text-gray-500 font-mono">{{ adAccountService.accountCount() }} accounts</span>
          </div>
        </div>
      }
    </div>
  `
})
export class AccountSwitcherComponent {
  adAccountService = inject(AdAccountService);
  open = signal(false);
  searchTerm = signal('');

  filteredGroups = () => {
    const term = this.searchTerm().toLowerCase();
    return this.adAccountService.groupedAccounts()
      .map(([group, accounts]) => {
        const filtered = accounts.filter(a =>
          a.name.toLowerCase().includes(term) ||
          a.business_name.toLowerCase().includes(term)
        );
        return [group, filtered] as [string, typeof accounts];
      })
      .filter(([, accounts]) => accounts.length > 0);
  };

  onSearch(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  selectAccount(id: string) {
    this.adAccountService.switchAccount(id);
    this.open.set(false);
    this.searchTerm.set('');
  }
}
