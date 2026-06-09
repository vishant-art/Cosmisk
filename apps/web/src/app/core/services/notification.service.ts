import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

export interface Notification {
  id: string;
  type: 'alert' | 'positive' | 'info';
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
  actionRoute?: string;
  severity?: string;
}

const SEVERITY_TO_TYPE: Record<string, Notification['type']> = {
  critical: 'alert',
  warning: 'alert',
  success: 'positive',
  info: 'info',
};

const TYPE_TO_ROUTE: Record<string, string> = {
  roas_decline: '/app/dashboard',
  cpa_spike: '/app/analytics',
  scale_opportunity: '/app/creative-cockpit',
  wasted_spend: '/app/lighthouse',
  creative_fatigue: '/app/creative-cockpit',
};

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = inject(ApiService);
  private notifications = signal<Notification[]>([]);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  allNotifications = this.notifications.asReadonly();
  unreadCount = computed(() => this.notifications().filter(n => !n.read).length);

  /** Fetch alerts from backend. Call on app init and periodically. */
  loadAlerts() {
    this.api.get<any>(environment.AUTOPILOT_ALERTS, { limit: 30 }).subscribe({
      next: (res) => {
        if (res.success && res.alerts) {
          this.notifications.set(res.alerts.map((a: any) => ({
            id: a.id,
            type: SEVERITY_TO_TYPE[a.severity] || 'info',
            title: a.title,
            description: a.content || '',
            read: a.read,
            createdAt: a.created_at,
            severity: a.severity,
            actionRoute: TYPE_TO_ROUTE[a.type] || '/app/dashboard',
          })));
        }
      },
      error: () => {
        // Silently fail — user may not have ad account connected
      },
    });
  }

  /** Start polling every 60s */
  startPolling() {
    this.loadAlerts();
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => this.loadAlerts(), 60_000);
    }
  }

  stopPolling() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  markAsRead(id: string) {
    // Optimistic update
    this.notifications.update(list =>
      list.map(n => n.id === id ? { ...n, read: true } : n)
    );
    this.api.post(environment.AUTOPILOT_MARK_READ, { alert_ids: [id] }).subscribe();
  }

  markAllAsRead() {
    this.notifications.update(list => list.map(n => ({ ...n, read: true })));
    this.api.post(environment.AUTOPILOT_MARK_READ, { mark_all: true }).subscribe();
  }
}
