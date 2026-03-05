import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AutopilotBadgeService {
  private api = inject(ApiService);
  unreadCount = signal(0);

  refresh() {
    this.api.get<{ success: boolean; count: number }>(
      environment.AUTOPILOT_UNREAD_COUNT
    ).subscribe({
      next: (res) => this.unreadCount.set(res.count ?? 0),
      error: () => this.unreadCount.set(0),
    });
  }
}
