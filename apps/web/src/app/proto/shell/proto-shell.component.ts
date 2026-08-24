import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ProtoStateService } from '../proto-state.service';

/**
 * PROTOTYPE — Blueprint §17. Slice 1 navigation only.
 *
 * Five items were specified. Two are live in this prototype (Today, Ask Cosmisk).
 * Creatives and Connections are shown but visibly out of scope — they belong to
 * later slices and are not faked.
 */
@Component({
  selector: 'proto-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    <div class="min-h-screen bg-[#F7F8FA] flex">

      <!-- SIDEBAR -->
      <aside class="hidden md:flex w-[236px] shrink-0 bg-gradient-sidebar flex-col fixed inset-y-0 left-0 z-30">
        <div class="px-6 py-6">
          <span class="text-white font-display font-bold text-xl tracking-tight">COSMISK</span>
        </div>

        <!-- brand switcher -->
        <div class="px-4 mb-5">
          <button class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/5
            border border-white/10 cursor-pointer hover:bg-white/[0.08] transition-colors">
            <div class="w-6 h-6 rounded-md bg-accent flex items-center justify-center shrink-0">
              <span class="text-[10px] font-bold text-white">{{ initials() }}</span>
            </div>
            <span class="text-sm text-white font-body truncate flex-1 text-left">{{ state.brand().name }}</span>
            <lucide-icon name="chevron-down" [size]="14" class="text-white/40 shrink-0"></lucide-icon>
          </button>
        </div>

        <nav class="flex-1 px-3 space-y-0.5">
          <a routerLink="/proto/dashboard" routerLinkActive="!bg-white/10 !text-white"
            class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/60 no-underline
            hover:bg-white/5 hover:text-white transition-colors">
            <lucide-icon name="layout-dashboard" [size]="17"></lucide-icon>
            <span class="text-sm font-body font-medium">Today</span>
          </a>

          <a routerLink="/proto/ask" routerLinkActive="!bg-white/10 !text-white"
            class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/60 no-underline
            hover:bg-white/5 hover:text-white transition-colors">
            <lucide-icon name="message-square" [size]="17"></lucide-icon>
            <span class="text-sm font-body font-medium">Ask Cosmisk</span>
          </a>

          <div class="pt-4 pb-1.5 px-3">
            <span class="text-[10px] font-mono uppercase tracking-wider text-white/25">Later slices</span>
          </div>

          @for (item of futureNav; track item.label) {
            <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/25 cursor-not-allowed">
              <lucide-icon [name]="item.icon" [size]="17"></lucide-icon>
              <span class="text-sm font-body font-medium">{{ item.label }}</span>
              <span class="text-[9px] font-mono uppercase tracking-wider ml-auto">Soon</span>
            </div>
          }
        </nav>

        <!-- profile -->
        <div class="px-3 pb-4 pt-3 border-t border-white/10">
          <button (click)="menuOpen.set(!menuOpen())"
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-transparent border-0
            cursor-pointer hover:bg-white/5 transition-colors">
            <div class="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <span class="text-[11px] font-semibold text-white">{{ userInitial() }}</span>
            </div>
            <span class="text-xs text-white/60 font-body truncate flex-1 text-left">{{ state.email() }}</span>
          </button>
          @if (menuOpen()) {
            <button (click)="logout()"
              class="w-full mt-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/60
              bg-transparent border-0 cursor-pointer hover:bg-white/5 text-left">
              <lucide-icon name="arrow-left" [size]="15"></lucide-icon>
              <span class="text-sm font-body">Log out</span>
            </button>
          }
        </div>
      </aside>

      <!-- MAIN -->
      <div class="flex-1 md:ml-[236px] min-w-0 flex flex-col">

        <!-- DEMO BANNER -->
        @if (state.isDemo()) {
          <div class="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center gap-2.5 sticky top-0 z-20">
            <span class="text-[10px] font-mono uppercase tracking-wider text-amber-800
              bg-amber-200/60 px-2 py-0.5 rounded-full shrink-0">Sample account</span>
            <p class="text-xs text-amber-800 font-body m-0 flex-1 min-w-0">
              Nothing here is real data. These numbers belong to a fictional brand.
            </p>
            <a routerLink="/proto/connect"
              class="text-xs font-body font-semibold text-amber-900 no-underline underline
              underline-offset-2 shrink-0">Connect your account</a>
          </div>
        } @else {
          <div class="bg-emerald-50 border-b border-emerald-200 px-5 py-2.5 flex items-center gap-2.5 sticky top-0 z-20">
            <span class="text-[10px] font-mono uppercase tracking-wider text-emerald-800
              bg-emerald-200/60 px-2 py-0.5 rounded-full shrink-0">Prototype</span>
            <p class="text-xs text-emerald-800 font-body m-0 flex-1 min-w-0">
              Showing a "connected" state — the data below is still simulated. No Meta account is linked.
            </p>
          </div>
        }

        <!-- MOBILE NAV -->
        <div class="md:hidden flex items-center gap-1 px-4 py-2.5 bg-[#0C0C14] sticky top-0 z-20">
          <span class="text-white font-display font-bold text-base mr-3">COSMISK</span>
          <a routerLink="/proto/dashboard" routerLinkActive="!bg-white/10 !text-white"
            class="px-3 py-1.5 rounded-lg text-white/60 no-underline text-xs font-body font-medium">Today</a>
          <a routerLink="/proto/ask" routerLinkActive="!bg-white/10 !text-white"
            class="px-3 py-1.5 rounded-lg text-white/60 no-underline text-xs font-body font-medium">Ask</a>
        </div>

        <main class="flex-1 min-w-0">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export default class ProtoShellComponent {
  private router = inject(Router);
  state = inject(ProtoStateService);
  menuOpen = signal(false);

  futureNav = [
    { label: 'Creatives', icon: 'layers' },
    { label: 'Connections', icon: 'plug-zap' },
  ];

  userInitial() {
    return this.state.email().charAt(0).toUpperCase();
  }
  initials() {
    return this.state.brand().name.slice(0, 2).toUpperCase();
  }
  logout() {
    this.state.reset();
    this.router.navigate(['/proto/login']);
  }
}
