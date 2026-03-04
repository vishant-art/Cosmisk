import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

export type MetaConnectionStatus = 'loading' | 'connected' | 'expired' | 'disconnected';

@Injectable({ providedIn: 'root' })
export class MetaOAuthService {
  private api = inject(ApiService);

  connectionStatus = signal<MetaConnectionStatus>('loading');
  connectedAccountCount = signal(0);
  metaUserName = signal('');
  expiresAt = signal<string | null>(null);

  isConnected = computed(() => this.connectionStatus() === 'connected');

  constructor() {
    this.checkStatus();
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'META_OAUTH_SUCCESS') {
          this.connectedAccountCount.set(event.data.accountCount || 0);
          this.connectionStatus.set('connected');
        }
      });
    }
  }

  checkStatus() {
    this.connectionStatus.set('loading');
    this.api.get<any>(environment.AUTH_META_STATUS).subscribe({
      next: (res) => {
        if (res.connected) {
          this.connectionStatus.set(res.status === 'expired' ? 'expired' : 'connected');
          this.connectedAccountCount.set(res.accountCount || 0);
          this.metaUserName.set(res.metaUserName || '');
          this.expiresAt.set(res.expiresAt || null);
        } else {
          this.connectionStatus.set('disconnected');
          this.connectedAccountCount.set(0);
        }
      },
      error: () => {
        this.connectionStatus.set('disconnected');
      }
    });
  }

  openOAuthPopup() {
    const redirectUri = `${window.location.origin}/app/settings/meta-callback`;
    const state = localStorage.getItem('cosmisk_token') || '';
    const url = `https://www.facebook.com/v22.0/dialog/oauth`
      + `?client_id=${environment.META_APP_ID}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&scope=ads_read,ads_management,business_management,pages_read_engagement`
      + `&response_type=code`
      + `&state=${encodeURIComponent(state)}`;

    const w = 600, h = 700;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    window.open(url, 'meta_oauth', `width=${w},height=${h},left=${left},top=${top}`);
  }

  disconnect() {
    this.api.post<any>(environment.AUTH_META_DISCONNECT, {}).subscribe({
      next: (res) => {
        if (res.success) {
          this.connectionStatus.set('disconnected');
          this.connectedAccountCount.set(0);
          this.metaUserName.set('');
        }
      }
    });
  }
}
