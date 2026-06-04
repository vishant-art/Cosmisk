import { Component, Input, Output, EventEmitter } from '@angular/core';
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
      class="rounded-card p-4 border-l-4 card-lift"
      [ngClass]="cardClasses">
      <div class="flex items-start gap-3">
        <lucide-icon [name]="iconName" [size]="18" [class]="iconClass" class="mt-0.5 shrink-0"></lucide-icon>
        <div class="flex-1 min-w-0">
          <h4 class="text-sm font-body font-semibold m-0 mb-1" [ngClass]="titleColor">{{ insight.title }}</h4>
          <p class="text-xs text-gray-600 font-body m-0 mb-2 leading-relaxed">{{ insight.description }}</p>
          <div class="flex items-center gap-2 flex-wrap">
            @if (insight.actionType && insight.actionType !== 'navigate') {
              <button
                (click)="onAction()"
                class="px-3 py-1 text-xs font-body font-semibold rounded-lg transition-all border-0 cursor-pointer flex items-center gap-1"
                [ngClass]="actionButtonClasses"
                [disabled]="executing">
                <lucide-icon [name]="actionIcon" [size]="12"></lucide-icon>
                {{ executing ? 'Applying...' : insight.actionLabel }}
              </button>
            } @else {
              <a
                [routerLink]="insight.actionRoute"
                class="text-xs font-body font-semibold no-underline hover:underline"
                [ngClass]="linkColor">
                {{ insight.actionLabel }} <lucide-icon name="arrow-right" [size]="12" class="inline-block"></lucide-icon>
              </a>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class InsightCardComponent {
  @Input({ required: true }) insight!: AiInsight;
  @Output() actionClicked = new EventEmitter<AiInsight>();
  executing = false;

  onAction() {
    this.executing = true;
    this.actionClicked.emit(this.insight);
    setTimeout(() => this.executing = false, 3000);
  }

  get actionIcon(): string {
    switch (this.insight.actionType) {
      case 'scale': case 'increase': return 'trending-up';
      case 'pause': return 'pause';
      case 'reduce': return 'trending-down';
      default: return 'zap';
    }
  }

  get actionButtonClasses(): string {
    switch (this.insight.priority) {
      case 'alert': return 'bg-red-600 text-white hover:bg-red-700';
      case 'positive': return 'bg-green-600 text-white hover:bg-green-700';
      case 'pattern': return 'bg-blue-600 text-white hover:bg-blue-700';
      case 'info': return 'bg-gray-600 text-white hover:bg-gray-700';
    }
  }

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
