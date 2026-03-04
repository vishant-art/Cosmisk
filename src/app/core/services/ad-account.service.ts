import { Injectable, signal, computed, inject } from '@angular/core';
import { AdAccount } from '../models/ad-account.model';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

interface AdAccountsApiResponse {
  success: boolean;
  accounts: AdAccount[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class AdAccountService {
  private api = inject(ApiService);
  private _accounts = signal<AdAccount[]>([]);
  private _currentAccount = signal<AdAccount | null>(null);
  private _loading = signal(false);

  allAccounts = this._accounts.asReadonly();
  currentAccount = this._currentAccount.asReadonly();
  loading = this._loading.asReadonly();
  accountCount = computed(() => this._accounts().length);

  /** Accounts grouped by business_name */
  groupedAccounts = computed(() => {
    const groups: Record<string, AdAccount[]> = {};
    for (const acc of this._accounts()) {
      const key = acc.business_name || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(acc);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  });

  constructor() {
    this.loadAccounts();
  }

  loadAccounts() {
    this._loading.set(true);
    this.api.get<AdAccountsApiResponse>(environment.AD_ACCOUNTS_LIST, { limit: 100 }).subscribe({
      next: (res) => {
        if (res.success && res.accounts?.length) {
          this._accounts.set(res.accounts);
          // Restore from localStorage or use first
          const savedId = localStorage.getItem('cosmisk_ad_account');
          const saved = savedId ? res.accounts.find(a => a.id === savedId) : null;
          this._currentAccount.set(saved || res.accounts[0]);
        }
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  switchAccount(accountId: string) {
    const acc = this._accounts().find(a => a.id === accountId);
    if (acc) {
      this._currentAccount.set(acc);
      localStorage.setItem('cosmisk_ad_account', acc.id);
    }
  }
}
