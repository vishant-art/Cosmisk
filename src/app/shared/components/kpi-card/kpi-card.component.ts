import { Component, Input, OnInit, OnChanges, SimpleChanges, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { LakhCrorePipe } from '../../pipes/lakh-crore.pipe';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, LakhCrorePipe, LucideAngularModule],
  template: `
    <div class="card card-lift glow-on-hover cursor-pointer group relative" (click)="copyValue()" [title]="'Click to copy: ' + title + ' = ' + formattedValue">
      @if (copied()) {
        <div class="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-[10px] font-mono rounded-md animate-fade-in z-10">Copied!</div>
      }
      <div class="flex items-start justify-between mb-3">
        <p class="text-sm text-gray-500 font-body font-medium m-0">{{ title }}</p>
        @if (change !== undefined) {
          <span
            class="text-xs font-mono font-semibold px-2 py-0.5 rounded-pill inline-flex items-center gap-0.5"
            [ngClass]="change >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'">
            @if (change >= 0) { <lucide-icon name="trending-up" [size]="12"></lucide-icon> } @else { <lucide-icon name="trending-down" [size]="12"></lucide-icon> } {{ change >= 0 ? '+' : '' }}{{ changeDisplay }}
          </span>
        }
      </div>

      <div class="mb-3">
        @if (isCurrency) {
          <p class="text-metric-lg font-mono text-navy m-0">{{ displayCurrencyValue() | lakhCrore }}</p>
        } @else {
          <p class="text-metric-lg font-mono text-navy m-0" [ngClass]="valueColor">{{ formattedDisplayValue }}</p>
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
export class KpiCardComponent implements OnInit, OnChanges {
  private toast = inject(ToastService);
  @Input({ required: true }) title = '';
  @Input({ required: true }) value: number = 0;
  @Input() change?: number;
  @Input() changeDisplay = '';
  @Input() isCurrency = false;
  @Input() suffix = '';
  @Input() subtitle = '';
  @Input() sparkline: number[] = [];
  @Input() color: 'default' | 'green' | 'yellow' | 'red' = 'default';

  displayValue = signal(0);
  displayCurrencyValue = signal(0);
  copied = signal(false);
  private animInterval: any;

  ngOnInit() {
    this.animateToValue(this.value);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['value'] && !changes['value'].firstChange) {
      this.animateToValue(this.value);
    }
  }

  private animateToValue(target: number) {
    if (this.animInterval) clearInterval(this.animInterval);
    if (target === 0) {
      this.displayValue.set(0);
      this.displayCurrencyValue.set(0);
      return;
    }
    const duration = 800;
    const steps = 30;
    const startVal = this.displayValue();
    const diff = target - startVal;
    const increment = diff / steps;
    let current = startVal;
    let step = 0;
    this.animInterval = setInterval(() => {
      step++;
      current += increment;
      if (step >= steps) {
        this.displayValue.set(target);
        this.displayCurrencyValue.set(target);
        clearInterval(this.animInterval);
      } else {
        this.displayValue.set(Math.round(current * 10) / 10);
        this.displayCurrencyValue.set(Math.round(current));
      }
    }, duration / steps);
  }

  copyValue() {
    const text = `${this.title}: ${this.formattedValue}`;
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  get formattedValue(): string {
    if (this.suffix) return `${this.value}${this.suffix}`;
    return String(this.value);
  }

  get formattedDisplayValue(): string {
    const val = this.displayValue();
    if (this.suffix) return `${val}${this.suffix}`;
    return String(val);
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
