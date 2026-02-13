import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Creative } from '../../../core/models/creative.model';
import { DnaBadgeComponent } from '../dna-badge/dna-badge.component';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';
import { LakhCrorePipe } from '../../pipes/lakh-crore.pipe';

@Component({
  selector: 'app-creative-card',
  standalone: true,
  imports: [CommonModule, DnaBadgeComponent, StatusBadgeComponent, LakhCrorePipe],
  template: `
    <div class="card !p-0 overflow-hidden cursor-pointer group hover:-translate-y-1 transition-all duration-200">
      <!-- Thumbnail -->
      <div class="relative aspect-square bg-gray-100 overflow-hidden">
        <img
          [src]="creative.thumbnailUrl"
          [alt]="creative.name"
          class="w-full h-full object-cover"
          loading="lazy">

        <!-- Format Badge -->
        <span class="absolute top-3 left-3 px-2 py-0.5 bg-black/60 text-white text-[10px] font-mono rounded uppercase">
          {{ creative.format }}
          @if (creative.duration) {
            <span> {{ creative.duration }}s</span>
          }
        </span>

        <!-- Status Dot -->
        <span
          class="absolute top-3 right-3 w-3 h-3 rounded-full border-2 border-white"
          [ngClass]="statusDotClass"
          [class.pulse-dot]="creative.status === 'winning' || creative.status === 'fatiguing'">
        </span>

        <!-- Hover Overlay -->
        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <span class="btn-primary !py-2 !px-4 !text-xs">View Details</span>
        </div>
      </div>

      <!-- Info -->
      <div class="p-4">
        <h3 class="text-sm font-body font-semibold text-navy m-0 mb-2 truncate">{{ creative.name }}</h3>

        <!-- DNA Badges -->
        <div class="flex flex-wrap gap-1 mb-3">
          @for (hook of creative.dna.hook; track hook) {
            <app-dna-badge [label]="hook" type="hook" />
          }
          @for (visual of creative.dna.visual.slice(0, 2); track visual) {
            <app-dna-badge [label]="visual" type="visual" />
          }
          @for (audio of creative.dna.audio.slice(0, 1); track audio) {
            <app-dna-badge [label]="audio" type="audio" />
          }
        </div>

        <!-- Metrics -->
        <div class="flex items-center justify-between text-xs font-mono">
          <span [ngClass]="roasColor" class="font-bold">{{ creative.metrics.roas }}x</span>
          <span class="text-gray-500">{{ creative.metrics.spend | lakhCrore }}</span>
          <span class="text-gray-500">{{ creative.metrics.ctr }}%</span>
        </div>

        <!-- Trend -->
        <div class="mt-2 flex items-center gap-1">
          <span class="text-xs" [ngClass]="trendColor">
            {{ trendArrow }} {{ creative.trend.percentage }}%
          </span>
          <span class="text-[11px] text-gray-400">{{ creative.trend.period }}</span>
        </div>
      </div>
    </div>
  `
})
export class CreativeCardComponent {
  @Input({ required: true }) creative!: Creative;

  get statusDotClass(): string {
    switch (this.creative.status) {
      case 'winning': return 'bg-green-500';
      case 'stable': return 'bg-gray-400';
      case 'fatiguing': return 'bg-red-500';
      case 'new': return 'bg-blue-500';
    }
  }

  get roasColor(): string {
    const roas = this.creative.metrics.roas;
    if (roas >= 3) return 'text-green-600';
    if (roas >= 2) return 'text-yellow-600';
    return 'text-red-600';
  }

  get trendColor(): string {
    switch (this.creative.trend.direction) {
      case 'up': return 'text-green-600';
      case 'down': return 'text-red-600';
      case 'flat': return 'text-gray-500';
    }
  }

  get trendArrow(): string {
    switch (this.creative.trend.direction) {
      case 'up': return '↑';
      case 'down': return '↓';
      case 'flat': return '→';
    }
  }
}
