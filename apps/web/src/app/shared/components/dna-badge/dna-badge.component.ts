import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dna-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center px-2.5 py-0.5 rounded-pill text-xs font-body font-medium whitespace-nowrap"
      [ngClass]="badgeClass">
      {{ label }}
    </span>
  `
})
export class DnaBadgeComponent {
  @Input({ required: true }) label = '';
  @Input({ required: true }) type: 'hook' | 'visual' | 'audio' = 'hook';

  get badgeClass(): string {
    switch (this.type) {
      case 'hook': return 'bg-dna-hook-bg text-dna-hook-text';
      case 'visual': return 'bg-dna-visual-bg text-dna-visual-text';
      case 'audio': return 'bg-dna-audio-bg text-dna-audio-text';
    }
  }
}
