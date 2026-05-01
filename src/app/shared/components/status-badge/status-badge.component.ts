import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CreativeStatus } from '../../../core/models/creative.model';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center gap-1.5 text-xs font-body font-medium">
      <span
        class="w-2 h-2 rounded-full shrink-0"
        [ngClass]="dotClass"
        [class.pulse-dot]="status === 'winning' || status === 'fatiguing'">
      </span>
      <span [ngClass]="textClass">{{ label }}</span>
    </span>
  `
})
export class StatusBadgeComponent {
  @Input({ required: true }) status: CreativeStatus = 'stable';

  get label(): string {
    return this.status.charAt(0).toUpperCase() + this.status.slice(1);
  }

  get dotClass(): string {
    switch (this.status) {
      case 'winning':
      case 'scaling': return 'bg-green-500';
      case 'stable':
      case 'healthy': return 'bg-gray-400';
      case 'fatiguing': return 'bg-red-500';
      case 'new': return 'bg-blue-500';
      case 'watch': return 'bg-yellow-500';
      case 'dead': return 'bg-red-700';
      default: return 'bg-gray-400';
    }
  }

  get textClass(): string {
    switch (this.status) {
      case 'winning':
      case 'scaling': return 'text-green-700';
      case 'stable':
      case 'healthy': return 'text-gray-600';
      case 'fatiguing': return 'text-red-600';
      case 'new': return 'text-blue-600';
      case 'watch': return 'text-yellow-600';
      case 'dead': return 'text-red-800';
      default: return 'text-gray-600';
    }
  }
}
