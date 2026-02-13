import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LakhCrorePipe } from '../../pipes/lakh-crore.pipe';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, LakhCrorePipe],
  template: `
    <div class="card cursor-pointer hover:-translate-y-0.5 group">
      <div class="flex items-start justify-between mb-3">
        <p class="text-sm text-gray-500 font-body font-medium m-0">{{ title }}</p>
        @if (change !== undefined) {
          <span
            class="text-xs font-mono font-semibold px-2 py-0.5 rounded-pill"
            [ngClass]="change >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'">
            {{ change >= 0 ? '↑' : '↓' }} {{ change >= 0 ? '+' : '' }}{{ changeDisplay }}
          </span>
        }
      </div>

      <div class="mb-3">
        @if (isCurrency) {
          <p class="text-metric-lg font-mono text-navy m-0">{{ value | lakhCrore }}</p>
        } @else {
          <p class="text-metric-lg font-mono text-navy m-0" [ngClass]="valueColor">{{ formattedValue }}</p>
        }
      </div>

      <!-- Sparkline -->
      @if (sparkline.length > 0) {
        <div class="h-8 flex items-end gap-[2px]">
          @for (point of normalizedSparkline; track $index) {
            <div
              class="flex-1 rounded-t-sm transition-all duration-300 group-hover:opacity-80"
              [style.height.%]="point"
              [ngClass]="sparklineColor">
            </div>
          }
        </div>
      }

      @if (subtitle) {
        <p class="text-xs text-gray-500 font-body mt-2 m-0">{{ subtitle }}</p>
      }
    </div>
  `
})
export class KpiCardComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) value: number = 0;
  @Input() change?: number;
  @Input() changeDisplay = '';
  @Input() isCurrency = false;
  @Input() suffix = '';
  @Input() subtitle = '';
  @Input() sparkline: number[] = [];
  @Input() color: 'default' | 'green' | 'yellow' | 'red' = 'default';

  get formattedValue(): string {
    if (this.suffix) return `${this.value}${this.suffix}`;
    return String(this.value);
  }

  get valueColor(): string {
    switch (this.color) {
      case 'green': return 'text-green-600';
      case 'yellow': return 'text-yellow-600';
      case 'red': return 'text-red-600';
      default: return 'text-navy';
    }
  }

  get sparklineColor(): string {
    switch (this.color) {
      case 'green': return 'bg-green-200';
      case 'yellow': return 'bg-yellow-200';
      case 'red': return 'bg-red-200';
      default: return 'bg-accent/20';
    }
  }

  get normalizedSparkline(): number[] {
    if (this.sparkline.length === 0) return [];
    const max = Math.max(...this.sparkline);
    const min = Math.min(...this.sparkline);
    const range = max - min || 1;
    return this.sparkline.map(v => ((v - min) / range) * 80 + 20);
  }
}
