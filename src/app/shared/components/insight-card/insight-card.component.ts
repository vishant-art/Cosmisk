import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AiInsight } from '../../../core/models/insight.model';

@Component({
  selector: 'app-insight-card',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <div
      class="rounded-card p-4 border-l-4 transition-all duration-200 hover:shadow-card-hover cursor-pointer"
      [ngClass]="cardClasses">
      <div class="flex items-start gap-3">
        <lucide-icon [name]="iconName" [size]="18" [class]="iconClass" class="mt-0.5 shrink-0"></lucide-icon>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-body font-semibold m-0 mb-1" [ngClass]="titleColor">{{ insight.title }}</h4>
          <p class="text-xs text-gray-600 font-body m-0 mb-2 leading-relaxed">{{ insight.description }}</p>
          <a
            [routerLink]="insight.actionRoute"
            class="text-xs font-body font-semibold no-underline hover:underline"
            [ngClass]="linkColor">
            {{ insight.actionLabel }} <lucide-icon name="arrow-right" [size]="12" class="inline-block"></lucide-icon>
          </a>
        </div>
      </div>
    </div>
  `
})
export class InsightCardComponent {
  @Input({ required: true }) insight!: AiInsight;

  get iconName(): string {
    switch (this.insight.priority) {
      case 'alert': return 'alert-triangle';
      case 'positive': return 'check-circle-2';
      case 'pattern': return 'circle-dot';
      case 'info': return 'info';
    }
  }

  get iconClass(): string {
    switch (this.insight.priority) {
      case 'alert': return 'text-yellow-500';
      case 'positive': return 'text-green-500';
      case 'pattern': return 'text-blue-500';
      case 'info': return 'text-gray-500';
    }
  }

  get cardClasses(): string {
    switch (this.insight.priority) {
      case 'alert': return 'bg-red-50 border-red-500';
      case 'positive': return 'bg-green-50 border-green-500';
      case 'pattern': return 'bg-blue-50 border-blue-500';
      case 'info': return 'bg-gray-50 border-gray-400';
    }
  }

  get titleColor(): string {
    switch (this.insight.priority) {
      case 'alert': return 'text-red-800';
      case 'positive': return 'text-green-800';
      case 'pattern': return 'text-blue-800';
      case 'info': return 'text-gray-800';
    }
  }

  get linkColor(): string {
    switch (this.insight.priority) {
      case 'alert': return 'text-red-600';
      case 'positive': return 'text-green-600';
      case 'pattern': return 'text-blue-600';
      case 'info': return 'text-gray-600';
    }
  }
}
