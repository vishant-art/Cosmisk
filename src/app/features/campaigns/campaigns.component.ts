import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-4xl mx-auto py-12 text-center">
      <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
        <span class="text-4xl">🚀</span>
      </div>
      <h1 class="text-page-title font-display text-navy mb-3">Campaign Builder</h1>
      <p class="text-gray-600 font-body mb-6 max-w-md mx-auto">Create and manage Meta ad campaigns</p>
      <span class="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-pill text-sm font-body font-medium">
        Coming Soon
      </span>
      <div class="mt-12 grid md:grid-cols-3 gap-6">
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">⚡</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Quick Launch</h3>
          <p class="text-xs text-gray-500 font-body m-0">Build and launch Meta campaigns in minutes with AI-suggested structure.</p>
        </div>
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">🧪</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">A/B Testing</h3>
          <p class="text-xs text-gray-500 font-body m-0">Automated creative testing frameworks with statistical significance tracking.</p>
        </div>
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">📦</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Bulk Operations</h3>
          <p class="text-xs text-gray-500 font-body m-0">Duplicate, edit, and manage campaigns in bulk across multiple ad accounts.</p>
        </div>
      </div>
    </div>
  `
})
export default class CampaignsComponent {}
