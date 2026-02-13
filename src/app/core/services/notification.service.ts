import { Injectable, signal, computed } from '@angular/core';

export interface Notification {
  id: string;
  type: 'alert' | 'positive' | 'info';
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
  actionRoute?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private notifications = signal<Notification[]>([
    {
      id: 'notif-1', type: 'alert',
      title: 'Fatigue Alert: "Collagen Glow-Up" CTR dropped 34%',
      description: 'Your top creative needs attention.',
      read: false, createdAt: '2026-02-13T07:00:00Z',
      actionRoute: '/app/creative-cockpit',
    },
    {
      id: 'notif-2', type: 'positive',
      title: 'New Winner: "₹999 for 30 Days" hit 5.2x ROAS',
      description: 'Consider scaling this creative.',
      read: false, createdAt: '2026-02-13T04:00:00Z',
      actionRoute: '/app/creative-cockpit',
    },
    {
      id: 'notif-3', type: 'info',
      title: 'Weekly Report ready for Nectar Supplements',
      description: 'Your weekly performance report is ready to download.',
      read: false, createdAt: '2026-02-12T09:00:00Z',
      actionRoute: '/app/reports',
    },
  ]);

  allNotifications = this.notifications.asReadonly();
  unreadCount = computed(() => this.notifications().filter(n => !n.read).length);

  markAsRead(id: string) {
    this.notifications.update(list =>
      list.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }

  markAllAsRead() {
    this.notifications.update(list => list.map(n => ({ ...n, read: true })));
  }
}
