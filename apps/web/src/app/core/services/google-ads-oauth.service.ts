import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

export type GoogleAdsConnectionStatus = 'loading' | 'connected' | 'expired' | 'disconnected';

@Injectable({ providedIn: 'root' })
export class GoogleAdsOAuthService {
  private api = inject(ApiService);

  connectionStatus = signal<GoogleAdsConnectionStatus>('loading');
  customerIds = signal<string[]>([]);
  expiresAt = signal<string | null>(null);

  isConnected = computed(() => this.connectionStatus() === 'connected');
  connectedAccountCount = computed(() => this.customerIds().length);

  constructor() {
    this.checkStatus();
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS') {
          this.customerIds.set(event.data.customerIds || []);
          this.connectionStatus.set('connected');
        }
      });
    }
  }

  checkStatus() {
    this.connectionStatus.set('loading');
    this.api.get<any>(environment.GOOGLE_ADS_STATUS).subscribe({
      next: (res) => {
        if (res.connected) {
          const expired = res.expires_at && new Date(res.expires_at) < new Date();
          this.connectionStatus.set(expired ? 'expired' : 'connected');
          this.customerIds.set(res.customer_ids || []);
          this.expiresAt.set(res.expires_at || null);
        } else {
          this.connectionStatus.set('disconnected');
          this.customerIds.set([]);
        }
      },
      error: () => {
        this.connectionStatus.set('disconnected');
      }
    });
  }

  disconnect() {
    this.api.post<any>(environment.GOOGLE_ADS_DISCONNECT, {}).subscribe({
      next: (res) => {
        if (res.success) {
          this.connectionStatus.set('disconnected');
          this.customerIds.set([]);
          this.expiresAt.set(null);
        }
      }
    });
  }
}
