import { Component, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  template: `
    <!-- Fixed Header -->
    <header
      class="fixed top-0 left-0 right-0 z-50 h-[72px] transition-all duration-300"
      [ngClass]="scrolled() ? 'bg-[#0C0C14]/80 backdrop-blur-xl border-b border-white/[0.06]' : 'bg-transparent'">
      <div class="max-w-7xl mx-auto h-full px-6 flex items-center justify-between">
        <!-- Logo -->
        <a routerLink="/" class="flex items-center gap-2 no-underline">
          <span class="text-white font-display font-bold text-2xl">COSMISK</span>
        </a>

        <!-- Nav (desktop) -->
        <nav class="hidden md:flex items-center gap-8">
          <a routerLink="/" class="text-sm font-body font-medium text-gray-400 hover:text-white no-underline transition-colors">Product</a>
          <a routerLink="/pricing" class="text-sm font-body font-medium text-gray-400 hover:text-white no-underline transition-colors">Pricing</a>
          <a class="text-sm font-body font-medium text-gray-400 hover:text-white no-underline transition-colors cursor-pointer">
            For Agencies
            <span class="ml-1 px-1.5 py-0.5 bg-accent/20 text-accent text-[10px] font-bold rounded">NEW</span>
          </a>
        </nav>

        <!-- Auth buttons -->
        <div class="flex items-center gap-3">
          <a routerLink="/login" class="btn-ghost !text-sm !text-gray-400 hover:!text-white no-underline hidden sm:inline-flex">Log In</a>
          <a routerLink="/signup" class="btn-primary !text-sm no-underline">Start Free Trial</a>
        </div>
      </div>
    </header>

    <!-- Page content -->
    <main class="pt-[72px]">
      <router-outlet />
    </main>

    <!-- Footer -->
    <footer class="bg-[#0C0C14] text-white py-16">
      <div class="max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <!-- Brand -->
          <div>
            <h3 class="font-display font-bold text-xl mb-4">COSMISK</h3>
            <p class="text-gray-400 text-sm font-body mb-4">AI-powered creative intelligence for Meta advertisers.</p>
          </div>

          <!-- Product -->
          <div>
            <h4 class="font-body font-semibold text-sm mb-4 text-gray-300">Product</h4>
            <ul class="space-y-2 list-none p-0">
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">Creative Cockpit</a></li>
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">Director Lab</a></li>
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">UGC Studio</a></li>
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">AI Oracle</a></li>
            </ul>
          </div>

          <!-- Resources -->
          <div>
            <h4 class="font-body font-semibold text-sm mb-4 text-gray-300">Resources</h4>
            <ul class="space-y-2 list-none p-0">
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">Blog</a></li>
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">Case Studies</a></li>
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">Help Center</a></li>
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">API Docs</a></li>
            </ul>
          </div>

          <!-- Company -->
          <div>
            <h4 class="font-body font-semibold text-sm mb-4 text-gray-300">Company</h4>
            <ul class="space-y-2 list-none p-0">
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">About</a></li>
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">Careers</a></li>
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">Privacy Policy</a></li>
              <li><a class="text-gray-400 text-sm hover:text-white no-underline transition-colors cursor-pointer">Terms of Service</a></li>
            </ul>
          </div>
        </div>

        <div class="border-t border-white/[0.06] pt-8 text-center">
          <p class="text-gray-500 text-sm font-body">&copy; 2026 Cosmisk. Made in India</p>
        </div>
      </div>
    </footer>
  `
})
export class PublicLayoutComponent {
  scrolled = signal(false);

  @HostListener('window:scroll')
  onScroll() {
    this.scrolled.set(window.scrollY > 20);
  }
}
