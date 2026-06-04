import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-sm"
          (click)="close.emit()">
        </div>

        <!-- Modal content -->
        <div
          class="relative bg-white rounded-modal w-full overflow-hidden animate-fade-in"
          [style.max-width]="maxWidth"
          [style.max-height]="'90vh'"
          style="box-shadow: var(--shadow-modal);">

          <!-- Header -->
          @if (title) {
            <div class="flex items-center justify-between px-6 py-4 border-b border-divider">
              <h2 class="text-section-title font-display m-0">{{ title }}</h2>
              <button
                (click)="close.emit()"
                class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500 border-0 bg-transparent cursor-pointer text-lg">
                ✕
              </button>
            </div>
          }

          <!-- Body (scrollable) -->
          <div class="overflow-y-auto" [style.max-height]="'calc(90vh - 70px)'">
            <ng-content></ng-content>
          </div>
        </div>
      </div>
    }
  `
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() maxWidth = '900px';
  @Output() close = new EventEmitter<void>();
}
