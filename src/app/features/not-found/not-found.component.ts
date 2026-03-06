import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="min-h-screen bg-[#F7F8FA] flex items-center justify-center px-6">
      <div class="text-center max-w-md">
        <div class="text-8xl font-mono font-bold text-accent/20 mb-4">404</div>
        <h1 class="text-2xl font-display text-navy mb-3">Page Not Found</h1>
        <p class="text-gray-500 font-body mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div class="flex items-center justify-center gap-4">
          <a routerLink="/app/dashboard" class="btn-primary !py-2.5 !px-6 no-underline flex items-center gap-2">
            <lucide-icon name="layout-dashboard" [size]="16"></lucide-icon>
            Go to Dashboard
          </a>
          <a routerLink="/" class="btn !py-2.5 !px-6 no-underline text-gray-600 hover:text-navy">
            Home
          </a>
        </div>
      </div>
    </div>
  `
})
export default class NotFoundComponent {}
