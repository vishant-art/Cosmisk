import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div class="w-20 h-20 bg-cream rounded-full flex items-center justify-center mb-6">
        <span class="text-4xl">{{ icon }}</span>
      </div>
      <h3 class="text-section-title font-display text-navy mb-2 m-0">{{ title }}</h3>
      <p class="text-sm text-gray-500 font-body max-w-md mb-6 m-0">{{ description }}</p>
      @if (actionLabel) {
        <button class="btn-primary">{{ actionLabel }}</button>
      }
    </div>
  `
})
export class EmptyStateComponent {
  @Input() icon = '📭';
  @Input({ required: true }) title = '';
  @Input() description = '';
  @Input() actionLabel = '';
}
