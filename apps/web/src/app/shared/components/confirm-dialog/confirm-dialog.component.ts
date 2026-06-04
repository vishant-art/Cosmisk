import { Component, Injectable, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ConfirmConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  visible = signal(false);
  config = signal<ConfirmConfig>({ title: '', message: '' });
  private resolver: ((value: boolean) => void) | null = null;

  confirm(config: ConfirmConfig): Promise<boolean> {
    this.config.set(config);
    this.visible.set(true);
    return new Promise<boolean>(resolve => {
      this.resolver = resolve;
    });
  }

  resolve(value: boolean) {
    this.visible.set(false);
    this.resolver?.(value);
    this.resolver = null;
  }
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (service.visible()) {
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center animate-fade-in" (click)="service.resolve(false)">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-scale-in" (click)="$event.stopPropagation()">
          <div class="p-6">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                [ngClass]="service.config().variant === 'danger' ? 'bg-red-100' : service.config().variant === 'warning' ? 'bg-amber-100' : 'bg-accent/10'">
                <span class="text-lg" [ngClass]="service.config().variant === 'danger' ? 'text-red-600' : service.config().variant === 'warning' ? 'text-amber-600' : 'text-accent'">
                  {{ service.config().variant === 'danger' ? '!' : service.config().variant === 'warning' ? '?' : 'i' }}
                </span>
              </div>
              <div>
                <h3 class="text-sm font-display font-semibold text-navy m-0">{{ service.config().title }}</h3>
                <p class="text-sm text-gray-500 font-body mt-1 mb-0">{{ service.config().message }}</p>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-6 pb-5">
            <button (click)="service.resolve(false)"
              class="px-4 py-2 text-sm font-body font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border-0 bg-transparent cursor-pointer">
              {{ service.config().cancelText || 'Cancel' }}
            </button>
            <button (click)="service.resolve(true)"
              class="px-4 py-2 text-sm font-body font-semibold rounded-lg transition-colors border-0 cursor-pointer"
              [ngClass]="service.config().variant === 'danger'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-accent text-white hover:bg-accent/90'">
              {{ service.config().confirmText || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  constructor(public service: ConfirmDialogService) {}
}
