import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-attribution',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-4xl mx-auto py-12 text-center">
      <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
        <span class="text-4xl">🔀</span>
      </div>
      <h1 class="text-page-title font-display text-navy mb-3">Attribution</h1>
      <p class="text-gray-600 font-body mb-6 max-w-md mx-auto">Multi-touch attribution analysis</p>
      <span class="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-pill text-sm font-body font-medium">
        Coming Soon
      </span>
      <div class="mt-12 grid md:grid-cols-3 gap-6">
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">🗺️</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Journey Mapping</h3>
          <p class="text-xs text-gray-500 font-body m-0">Visualize full customer journeys from first touch to conversion across channels.</p>
        </div>
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">📊</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Model Comparison</h3>
          <p class="text-xs text-gray-500 font-body m-0">Compare first-touch, last-touch, linear, and data-driven attribution models.</p>
        </div>
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">💡</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Creative Impact</h3>
          <p class="text-xs text-gray-500 font-body m-0">Understand which creatives drive the most value at each funnel stage.</p>
        </div>
      </div>
    </div>
  `
})
export default class AttributionComponent {}
