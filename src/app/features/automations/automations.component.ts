import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-automations',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="max-w-4xl mx-auto py-12 text-center">
      <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
        <span class="text-4xl">⚙️</span>
      </div>
      <h1 class="text-page-title font-display text-navy mb-3">Automations</h1>
      <p class="text-gray-600 font-body mb-6 max-w-md mx-auto">Set rules and triggers for your campaigns</p>
      <span class="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-pill text-sm font-body font-medium">
        Coming Soon
      </span>
      <div class="mt-12 grid md:grid-cols-3 gap-6">
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">🔧</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Rule Builder</h3>
          <p class="text-xs text-gray-500 font-body m-0">Visual rule builder — if CPA exceeds target, pause ad set automatically.</p>
        </div>
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">📈</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Auto-Scaling</h3>
          <p class="text-xs text-gray-500 font-body m-0">Automatically increase budgets on winning campaigns based on ROAS thresholds.</p>
        </div>
        <div class="bg-white rounded-card p-6 shadow-card text-left">
          <span class="text-2xl mb-3 block">📝</span>
          <h3 class="text-sm font-body font-semibold text-navy mb-2">Activity Log</h3>
          <p class="text-xs text-gray-500 font-body m-0">Full audit trail of every automated action taken with one-click undo.</p>
        </div>
      </div>
    </div>
  `
})
export default class AutomationsComponent {}
