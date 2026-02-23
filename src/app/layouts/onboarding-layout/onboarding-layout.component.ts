import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-onboarding-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <div class="min-h-screen bg-[#F7F8FA] flex flex-col">
      <!-- Logo -->
      <div class="py-6 px-8">
        <span class="text-accent font-display font-bold text-2xl">COSMISK</span>
      </div>

      <!-- Content -->
      <div class="flex-1 flex items-center justify-center px-4 pb-12">
        <router-outlet />
      </div>
    </div>
  `
})
export class OnboardingLayoutComponent {}
