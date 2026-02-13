const _BUILD_VER = '2026-02-13-v2';
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ConversionPath {
  id: string;
  steps: { channel: string; icon: string }[];
  conversions: number;
  revenue: string;
  percentage: number;
}

interface AttributionRow {
  creative: string;
  firstTouch: number;
  lastTouch: number;
  linear: number;
  timeDecay: number;
  dataDriven: number;
  conversions: number;
  revenue: string;
}

@Component({
  selector: 'app-attribution',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Attribution</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Multi-touch attribution analysis across creatives</p>
        </div>
        <div class="flex gap-3">
          <select class="px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
            <option>Last 30 days</option>
            <option>Last 14 days</option>
            <option>Last 7 days</option>
            <option>Last 90 days</option>
          </select>
          <button class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
            Export Report
          </button>
        </div>
      </div>

      <!-- Attribution Model Selector -->
      <div class="bg-white rounded-card shadow-card p-5">
        <h3 class="text-sm font-display text-navy mb-3 mt-0">Attribution Model</h3>
        <div class="flex flex-wrap gap-2">
          @for (model of models; track model.id) {
            <button
              (click)="activeModel.set(model.id)"
              class="px-4 py-2 rounded-pill text-sm font-body transition-all border"
              [ngClass]="activeModel() === model.id
                ? 'bg-accent text-white border-accent'
                : 'bg-white text-gray-600 border-gray-200 hover:border-accent/50'">
              {{ model.name }}
            </button>
          }
        </div>
        <p class="text-xs text-gray-500 font-body mt-3 mb-0">{{ getActiveModelDescription() }}</p>
      </div>

      <!-- KPI Summary -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        @for (kpi of kpis; track kpi.label) {
          <div class="bg-white rounded-card shadow-card p-4">
            <span class="text-xs text-gray-500 font-body">{{ kpi.label }}</span>
            <div class="text-xl font-display text-navy mt-1">{{ kpi.value }}</div>
            <span class="text-xs font-body" [ngClass]="kpi.trend.startsWith('+') ? 'text-green-600' : 'text-red-600'">
              {{ kpi.trend }}
            </span>
          </div>
        }
      </div>

      <!-- Conversion Paths -->
      <div class="bg-white rounded-card shadow-card p-5">
        <h3 class="text-sm font-display text-navy mb-4 mt-0">Top Conversion Paths</h3>
        <div class="space-y-3">
          @for (path of conversionPaths; track path.id) {
            <div class="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
              <div class="flex items-center gap-1 flex-1 min-w-0">
                @for (step of path.steps; track $index) {
                  <div class="flex items-center gap-1">
                    <span class="px-2 py-1 bg-white rounded text-xs font-body text-navy whitespace-nowrap shadow-sm">
                      {{ step.icon }} {{ step.channel }}
                    </span>
                    @if ($index < path.steps.length - 1) {
                      <span class="text-gray-300 text-xs">→</span>
                    }
                  </div>
                }
              </div>
              <div class="text-right shrink-0">
                <div class="text-sm font-body font-semibold text-navy">{{ path.conversions }} conv.</div>
                <div class="text-xs text-gray-500 font-body">{{ path.revenue }}</div>
              </div>
              <div class="w-20 shrink-0">
                <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div class="h-full bg-accent rounded-full" [style.width.%]="path.percentage"></div>
                </div>
                <span class="text-[10px] text-gray-400 font-body">{{ path.percentage }}%</span>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Creative-Level Attribution Table -->
      <div class="bg-white rounded-card shadow-card p-5">
        <h3 class="text-sm font-display text-navy mb-4 mt-0">Creative-Level Attribution</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead>
              <tr class="border-b border-gray-100">
                <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase">Creative</th>
                <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase text-right">First Touch</th>
                <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase text-right">Last Touch</th>
                <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase text-right">Linear</th>
                <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase text-right">Time Decay</th>
                <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase text-right">Data-Driven</th>
                <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase text-right">Conversions</th>
                <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              @for (row of attributionData; track row.creative) {
                <tr class="border-b border-gray-50 hover:bg-gray-50/50">
                  <td class="py-3 text-sm font-body text-navy font-semibold">{{ row.creative }}</td>
                  <td class="py-3 text-sm font-body text-right" [ngClass]="activeModel() === 'first' ? 'text-accent font-semibold' : 'text-gray-600'">{{ row.firstTouch }}%</td>
                  <td class="py-3 text-sm font-body text-right" [ngClass]="activeModel() === 'last' ? 'text-accent font-semibold' : 'text-gray-600'">{{ row.lastTouch }}%</td>
                  <td class="py-3 text-sm font-body text-right" [ngClass]="activeModel() === 'linear' ? 'text-accent font-semibold' : 'text-gray-600'">{{ row.linear }}%</td>
                  <td class="py-3 text-sm font-body text-right" [ngClass]="activeModel() === 'time' ? 'text-accent font-semibold' : 'text-gray-600'">{{ row.timeDecay }}%</td>
                  <td class="py-3 text-sm font-body text-right" [ngClass]="activeModel() === 'data' ? 'text-accent font-semibold' : 'text-gray-600'">{{ row.dataDriven }}%</td>
                  <td class="py-3 text-sm font-body text-right text-navy">{{ row.conversions }}</td>
                  <td class="py-3 text-sm font-body text-right text-navy font-semibold">{{ row.revenue }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export default class AttributionComponent {
  activeModel = signal('data');

  models = [
    { id: 'first', name: 'First Touch', description: 'Gives 100% credit to the first interaction a customer has before converting.' },
    { id: 'last', name: 'Last Touch', description: 'Gives 100% credit to the final interaction before conversion.' },
    { id: 'linear', name: 'Linear', description: 'Distributes credit equally across all touchpoints in the conversion path.' },
    { id: 'time', name: 'Time Decay', description: 'Gives more credit to touchpoints closer in time to the conversion event.' },
    { id: 'data', name: 'Data-Driven', description: 'Uses AI to analyze actual conversion patterns and allocate credit based on incremental impact.' },
  ];

  kpis = [
    { label: 'Total Conversions', value: '2,847', trend: '+12.3%' },
    { label: 'Attributed Revenue', value: '₹48.2L', trend: '+18.7%' },
    { label: 'Avg. Touchpoints', value: '3.4', trend: '-0.2' },
    { label: 'Avg. Time to Convert', value: '4.2 days', trend: '-0.8 days' },
  ];

  conversionPaths: ConversionPath[] = [
    { id: 'p-1', steps: [{ channel: 'Meta Ad', icon: '📱' }, { channel: 'Website Visit', icon: '🌐' }, { channel: 'Retarget Ad', icon: '🔄' }, { channel: 'Purchase', icon: '🛒' }], conversions: 842, revenue: '₹14.2L', percentage: 100 },
    { id: 'p-2', steps: [{ channel: 'Meta Ad', icon: '📱' }, { channel: 'Direct Purchase', icon: '🛒' }], conversions: 634, revenue: '₹10.8L', percentage: 75 },
    { id: 'p-3', steps: [{ channel: 'Reel Ad', icon: '🎬' }, { channel: 'Profile Visit', icon: '👤' }, { channel: 'Website', icon: '🌐' }, { channel: 'Purchase', icon: '🛒' }], conversions: 428, revenue: '₹7.1L', percentage: 51 },
  ];

  attributionData: AttributionRow[] = [
    { creative: 'Collagen Glow-Up Reel', firstTouch: 28, lastTouch: 18, linear: 22, timeDecay: 20, dataDriven: 25, conversions: 712, revenue: '₹12.1L' },
    { creative: 'Before/After Carousel', firstTouch: 15, lastTouch: 24, linear: 19, timeDecay: 22, dataDriven: 21, conversions: 584, revenue: '₹9.8L' },
    { creative: 'UGC Priya Testimonial', firstTouch: 22, lastTouch: 12, linear: 18, timeDecay: 15, dataDriven: 19, conversions: 463, revenue: '₹7.9L' },
    { creative: 'Flash Sale Banner', firstTouch: 8, lastTouch: 32, linear: 16, timeDecay: 24, dataDriven: 14, conversions: 398, revenue: '₹6.7L' },
    { creative: 'Dermat Recommends Ad', firstTouch: 18, lastTouch: 8, linear: 14, timeDecay: 12, dataDriven: 13, conversions: 356, revenue: '₹6.1L' },
    { creative: 'Product Unboxing Reel', firstTouch: 9, lastTouch: 6, linear: 11, timeDecay: 7, dataDriven: 8, conversions: 334, revenue: '₹5.6L' },
  ];

  getActiveModelDescription(): string {
    return this.models.find(m => m.id === this.activeModel())?.description ?? '';
  }
}
