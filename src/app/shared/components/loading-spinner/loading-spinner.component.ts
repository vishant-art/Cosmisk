import { Component } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  template: `
    <div class="flex items-center justify-center p-8">
      <div class="w-8 h-8 border-3 border-gray-200 border-t-accent rounded-full animate-spin"></div>
    </div>
  `,
  styles: [`
    .border-3 { border-width: 3px; }
  `]
})
export class LoadingSpinnerComponent {}
