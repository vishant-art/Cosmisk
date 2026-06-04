import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-meta-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div class="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        @if (loading) {
          <div class="animate-spin w-10 h-10 border-4 border-accent border-t-transparent rounded-full mx-auto mb-4"></div>
          <h2 class="text-lg font-display text-navy mb-2">Connecting Meta Ads...</h2>
          <p class="text-sm text-gray-500 font-body">Exchanging authorization code for access token</p>
        }
        @if (success) {
          <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 class="text-lg font-display text-navy mb-2">Connected!</h2>
          <p class="text-sm text-gray-500 font-body mb-4">{{ accountCount }} ad account(s) linked successfully.</p>
          <p class="text-xs text-gray-400 font-body">This window will close automatically...</p>
        }
        @if (error) {
          <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <h2 class="text-lg font-display text-navy mb-2">Connection Failed</h2>
          <p class="text-sm text-red-500 font-body mb-4">{{ errorMessage }}</p>
          <button (click)="closeWindow()" class="px-5 py-2 bg-accent text-white rounded-full text-sm font-body font-semibold hover:bg-accent/90">
            Close Window
          </button>
        }
      </div>
    </div>
  `
})
export default class MetaCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  loading = true;
  success = false;
  error = false;
  errorMessage = '';
  accountCount = 0;

  ngOnInit() {
    const code = this.route.snapshot.queryParamMap.get('code');
    const state = this.route.snapshot.queryParamMap.get('state');
    const fbError = this.route.snapshot.queryParamMap.get('error');

    if (fbError) {
      this.showError(this.route.snapshot.queryParamMap.get('error_description') || 'User denied access');
      return;
    }

    if (!code) {
      this.showError('No authorization code received from Facebook');
      return;
    }

    const redirectUri = `${window.location.origin}/app/settings/meta-callback`;

    this.api.post<any>(environment.AUTH_META_OAUTH_EXCHANGE, {
      code,
      redirect_uri: redirectUri
    }).subscribe({
      next: (res) => {
        if (res.success) {
          this.loading = false;
          this.success = true;
          this.accountCount = res.accountCount || 0;
          if (window.opener) {
            window.opener.postMessage({
              type: 'META_OAUTH_SUCCESS',
              accountCount: this.accountCount
            }, window.location.origin);
          }
          setTimeout(() => window.close(), 2000);
        } else {
          this.showError(res.error || 'Token exchange failed');
        }
      },
      error: (err) => {
        this.showError(err.error?.error || err.message || 'Token exchange request failed');
      }
    });
  }

  private showError(msg: string) {
    this.loading = false;
    this.error = true;
    this.errorMessage = msg;
  }

  closeWindow() {
    window.close();
  }
}
