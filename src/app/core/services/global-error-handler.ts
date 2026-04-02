import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private toast = inject(ToastService);
  private lastErrorTime = 0;

  handleError(error: any): void {
    // Debounce — max 1 error toast per 5 seconds
    const now = Date.now();
    if (now - this.lastErrorTime < 5000) return;
    this.lastErrorTime = now;

    // Ignore HTTP errors (handled by interceptor) and navigation cancellations
    if (error?.rejection?.status || error?.status) return;
    if (error?.message?.includes('NavigationCancel')) return;

    console.error('[Cosmisk Error]', error);

    // Chunk loading failures (lazy route deploy mismatch)
    if (error?.message?.includes('ChunkLoadError') || error?.message?.includes('Loading chunk')) {
      this.toast.warning('Update Available', 'A new version is available. Refreshing...');
      setTimeout(() => window.location.reload(), 1500);
      return;
    }

    this.toast.error('Unexpected Error', 'Something went wrong. Try refreshing the page.');
  }
}
