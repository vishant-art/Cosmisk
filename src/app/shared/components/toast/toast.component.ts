import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-[380px]">
      @for (toast of toastService.activeToasts(); track toast.id) {
        <div
          class="flex items-start gap-3 p-4 bg-white rounded-card border-l-4 animate-slide-in"
          [ngClass]="getBorderClass(toast.type)"
          style="box-shadow: var(--shadow-dropdown);">
          <span class="text-lg mt-0.5">{{ getIcon(toast.type) }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-body font-semibold text-navy m-0">{{ toast.title }}</p>
            @if (toast.message) {
              <p class="text-xs text-gray-500 font-body m-0 mt-0.5">{{ toast.message }}</p>
            }
          </div>
          <button
            (click)="toastService.dismiss(toast.id)"
            class="text-gray-400 hover:text-gray-600 text-sm border-0 bg-transparent cursor-pointer p-0">
            ✕
          </button>
        </div>
      }
    </div>
  `
})
export class ToastComponent {
  toastService = inject(ToastService);

  getBorderClass(type: Toast['type']): string {
    switch (type) {
      case 'success': return 'border-green-500';
      case 'error': return 'border-red-500';
      case 'warning': return 'border-yellow-500';
      case 'info': return 'border-blue-500';
    }
  }

  getIcon(type: Toast['type']): string {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      case 'info': return 'ℹ';
    }
  }
}
