import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (offline()) {
      <div class="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white py-2 px-4 flex items-center justify-center gap-2 text-sm font-body font-medium animate-slide-down shadow-lg">
        <lucide-icon name="wifi-off" [size]="16"></lucide-icon>
        <span>You're offline. Changes won't be saved until you reconnect.</span>
      </div>
    }
    @if (reconnected()) {
      <div class="fixed top-0 left-0 right-0 z-[100] bg-green-600 text-white py-2 px-4 flex items-center justify-center gap-2 text-sm font-body font-medium animate-slide-down shadow-lg">
        <lucide-icon name="wifi" [size]="16"></lucide-icon>
        <span>Back online!</span>
      </div>
    }
  `,
  styles: [`
    @keyframes slide-down { from { transform: translateY(-100%); } to { transform: translateY(0); } }
    .animate-slide-down { animation: slide-down 0.3s ease-out; }
  `]
})
export class OfflineBannerComponent implements OnInit, OnDestroy {
  offline = signal(false);
  reconnected = signal(false);
  private onlineHandler = () => this.handleOnline();
  private offlineHandler = () => this.handleOffline();

  ngOnInit() {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    if (!navigator.onLine) this.offline.set(true);
  }

  ngOnDestroy() {
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
  }

  private handleOffline() {
    this.reconnected.set(false);
    this.offline.set(true);
  }

  private handleOnline() {
    this.offline.set(false);
    this.reconnected.set(true);
    setTimeout(() => this.reconnected.set(false), 3000);
  }
}
