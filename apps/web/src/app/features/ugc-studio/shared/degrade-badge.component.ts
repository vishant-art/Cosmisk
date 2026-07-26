import { Component, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-degrade-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button" (click)="open.set(!open())"
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-body font-semibold"
      [ngClass]="tone() === 'neutral' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'">
      <span class="w-1.5 h-1.5 rounded-full" [ngClass]="tone() === 'neutral' ? 'bg-gray-400' : 'bg-amber-500'"></span>
      {{ text() }}
    </button>
    @if (open() && detail()) {
      <span class="block text-[10px] text-gray-500 font-body mt-0.5 max-w-xs">{{ detail() }}</span>
    }
  `,
})
export class DegradeBadgeComponent {
  text = input.required<string>();
  tone = input<'amber' | 'neutral'>('amber');
  detail = input<string>('');
  open = signal(false);
}
