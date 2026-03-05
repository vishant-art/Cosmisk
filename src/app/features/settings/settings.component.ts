const _BUILD_VER = '2026-03-05-v1';
import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { MetaOAuthService } from '../../core/services/meta-oauth.service';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-page-title font-display text-navy m-0">Settings</h1>
        <p class="text-sm text-gray-500 font-body mt-1 mb-0">Manage your account, team, and billing</p>
      </div>

      <!-- Tab Navigation -->
      <div class="border-b border-gray-200">
        <div class="flex gap-0 -mb-px overflow-x-auto">
          @for (tab of tabs; track tab.id) {
            <button
              (click)="activeTab.set(tab.id)"
              class="px-4 py-3 text-sm font-body whitespace-nowrap border-b-2 transition-colors"
              [ngClass]="activeTab() === tab.id
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'">
              {{ tab.label }}
            </button>
          }
        </div>
      </div>

      <!-- Profile Tab -->
      @if (activeTab() === 'profile') {
        <div class="grid md:grid-cols-3 gap-6">
          <!-- Avatar Card -->
          <div class="bg-white rounded-card shadow-card p-6 text-center">
            <div class="w-24 h-24 bg-accent/10 rounded-full mx-auto flex items-center justify-center mb-4">
              <lucide-icon name="user" [size]="32"></lucide-icon>
            </div>
            <h3 class="text-sm font-body font-semibold text-navy m-0">{{ profileName }}</h3>
            <p class="text-xs text-gray-500 font-body mt-1 mb-3">{{ profileEmail }}</p>
            <span class="inline-flex px-3 py-1 bg-accent/10 text-accent rounded-pill text-xs font-body font-semibold capitalize">
              {{ billingPlan() }} Plan
            </span>
            <div class="mt-4 pt-4 border-t border-gray-100">
              <button class="text-xs text-accent font-body hover:underline">Change Avatar</button>
            </div>
          </div>

          <!-- Profile Form -->
          <div class="md:col-span-2 space-y-4">
            <div class="bg-white rounded-card shadow-card p-6">
              <h3 class="text-sm font-display text-navy mb-4 mt-0">Personal Information</h3>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Full Name</label>
                  <input [(ngModel)]="profileName" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Email</label>
                  <input [(ngModel)]="profileEmail" type="email" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Phone</label>
                  <input [(ngModel)]="profilePhone" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Role</label>
                  <input value="Owner" disabled class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body bg-gray-50" />
                </div>
              </div>
            </div>

            <div class="bg-white rounded-card shadow-card p-6">
              <h3 class="text-sm font-display text-navy mb-4 mt-0">Preferences</h3>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Timezone</label>
                  <select [(ngModel)]="timezone" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                    <option value="IST">Asia/Kolkata (IST)</option>
                    <option value="UTC">UTC</option>
                    <option value="EST">America/New_York (EST)</option>
                    <option value="PST">America/Los_Angeles (PST)</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Language</label>
                  <select [(ngModel)]="language" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="ta">Tamil</option>
                    <option value="te">Telugu</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Currency</label>
                  <select [(ngModel)]="currency" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Date Format</label>
                  <select [(ngModel)]="dateFormat" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
              <div class="flex justify-end mt-6">
                <button (click)="saveProfile()" class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Connected Accounts Tab -->
      @if (activeTab() === 'accounts') {
        <div class="space-y-4">
          <!-- Meta Business Suite — OAuth -->
          <div class="bg-white rounded-card shadow-card p-5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="w-10 h-10 rounded-full flex items-center justify-center text-xl" style="background-color: #e8f0fe">
                  M
                </span>
                <div>
                  <h3 class="text-sm font-body font-semibold text-navy m-0">Meta Business Suite</h3>
                  @if (metaOAuth.connectionStatus() === 'loading') {
                    <p class="text-xs text-gray-400 font-body m-0 mt-0.5">Checking connection...</p>
                  }
                  @if (metaOAuth.connectionStatus() === 'connected') {
                    <p class="text-xs text-green-600 font-body m-0 mt-0.5">{{ metaOAuth.connectedAccountCount() }} ad account(s) connected as {{ metaOAuth.metaUserName() }}</p>
                  }
                  @if (metaOAuth.connectionStatus() === 'expired') {
                    <p class="text-xs text-amber-600 font-body m-0 mt-0.5">Token expired — please reconnect</p>
                  }
                  @if (metaOAuth.connectionStatus() === 'disconnected') {
                    <p class="text-xs text-gray-500 font-body m-0 mt-0.5">Connect your Meta ad accounts to view performance data</p>
                  }
                </div>
              </div>
              <div class="flex items-center gap-2">
                @if (metaOAuth.connectionStatus() === 'connected') {
                  <button (click)="disconnectMeta()" class="px-4 py-2 rounded-pill text-xs font-body font-semibold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                    Disconnect
                  </button>
                }
                @if (metaOAuth.connectionStatus() === 'disconnected' || metaOAuth.connectionStatus() === 'expired') {
                  <button (click)="connectMeta()" class="px-4 py-2 rounded-pill text-xs font-body font-semibold bg-accent text-white hover:bg-accent/90 transition-colors">
                    {{ metaOAuth.connectionStatus() === 'expired' ? 'Reconnect' : 'Connect' }}
                  </button>
                }
                @if (metaOAuth.connectionStatus() === 'loading') {
                  <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                }
              </div>
            </div>
          </div>

          <!-- Other accounts (static) -->
          @for (account of otherAccounts; track account.name) {
            <div class="bg-white rounded-card shadow-card p-5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="w-10 h-10 rounded-full flex items-center justify-center text-xl" [style.background-color]="account.bg">
                    {{ account.icon }}
                  </span>
                  <div>
                    <h3 class="text-sm font-body font-semibold text-navy m-0">{{ account.name }}</h3>
                    <p class="text-xs text-gray-500 font-body m-0 mt-0.5">{{ account.description }}</p>
                  </div>
                </div>
                @if (account.available) {
                  <button (click)="connectPlatform(account.name)" class="px-4 py-2 rounded-pill text-xs font-body font-semibold bg-accent text-white hover:bg-accent/90 transition-colors">
                    Connect
                  </button>
                } @else {
                  <button class="px-4 py-2 rounded-pill text-xs font-body font-semibold bg-gray-100 text-gray-400 cursor-not-allowed">
                    Coming Soon
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- Team Tab -->
      @if (activeTab() === 'team') {
        <div class="bg-white rounded-card shadow-card p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-display text-navy m-0">Team Members</h3>
            <button class="px-4 py-2 bg-accent text-white rounded-pill text-xs font-body font-semibold hover:bg-accent/90">
              + Invite Member
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead>
                <tr class="border-b border-gray-100">
                  <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase">Member</th>
                  <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase">Role</th>
                  <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase">Status</th>
                  <th class="pb-3 text-xs font-body font-semibold text-gray-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (member of teamMembers; track member.email) {
                  <tr class="border-b border-gray-50">
                    <td class="py-3">
                      <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-body font-bold text-accent">
                          {{ member.name.charAt(0) }}
                        </div>
                        <div>
                          <div class="text-sm font-body font-semibold text-navy">{{ member.name }}</div>
                          <div class="text-xs text-gray-500 font-body">{{ member.email }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3">
                      <span class="px-2 py-0.5 rounded text-xs font-body"
                        [ngClass]="{
                          'bg-purple-100 text-purple-700': member.role === 'Owner',
                          'bg-blue-100 text-blue-700': member.role === 'Admin',
                          'bg-green-100 text-green-700': member.role === 'Media Buyer',
                          'bg-amber-100 text-amber-700': member.role === 'Designer',
                          'bg-gray-100 text-gray-700': member.role === 'Viewer'
                        }">
                        {{ member.role }}
                      </span>
                    </td>
                    <td class="py-3">
                      <span class="text-xs font-body" [ngClass]="member.status === 'Active' ? 'text-green-600' : 'text-amber-600'">
                        {{ member.status }}
                      </span>
                    </td>
                    <td class="py-3 text-right">
                      @if (member.role !== 'Owner') {
                        <button class="text-xs text-gray-400 font-body hover:text-red-500">Remove</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Billing Tab -->
      @if (activeTab() === 'billing') {
        <div class="space-y-4">
          <div class="bg-white rounded-card shadow-card p-6">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-sm font-display text-navy m-0">Current Plan</h3>
                <p class="text-xs text-gray-500 font-body mt-1 mb-0">You're on the <span class="capitalize font-semibold">{{ billingPlan() }}</span> plan</p>
              </div>
              <span class="px-4 py-2 bg-accent/10 text-accent rounded-pill text-xs font-body font-semibold">
                {{ billingStatus() }}
              </span>
            </div>
            <div class="grid md:grid-cols-2 gap-4">
              <div class="p-4 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body block mb-1">Plan</span>
                <span class="text-lg font-display text-navy capitalize">{{ billingPlan() }}</span>
              </div>
              <div class="p-4 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body block mb-1">Member Since</span>
                <span class="text-lg font-display text-navy">{{ billingMemberSince() }}</span>
              </div>
            </div>
          </div>

          <!-- Upgrade Cards -->
          @if (billingPlan() !== 'agency') {
            <div class="grid md:grid-cols-2 gap-4">
              @if (billingPlan() === 'free') {
                <div class="bg-white rounded-card shadow-card p-6 ring-2 ring-accent">
                  <h3 class="text-sm font-display text-navy m-0 mb-1">Pro Plan</h3>
                  <p class="text-2xl font-mono text-navy m-0">$49<span class="text-sm text-gray-500 font-body">/mo</span></p>
                  <ul class="text-xs text-gray-600 font-body mt-3 space-y-1 list-none p-0 mb-4">
                    <li>5 ad accounts</li>
                    <li>Unlimited AI chat</li>
                    <li>50 images + 10 videos/mo</li>
                    <li>Autopilot + Competitor Spy</li>
                  </ul>
                  <button (click)="upgradePlan('pro')" class="w-full py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
                    Upgrade to Pro
                  </button>
                </div>
              }
              <div class="bg-white rounded-card shadow-card p-6">
                <h3 class="text-sm font-display text-navy m-0 mb-1">Agency Plan</h3>
                <p class="text-2xl font-mono text-navy m-0">$149<span class="text-sm text-gray-500 font-body">/mo</span></p>
                <ul class="text-xs text-gray-600 font-body mt-3 space-y-1 list-none p-0 mb-4">
                  <li>Unlimited everything</li>
                  <li>White-label reports</li>
                  <li>Agency Command Center</li>
                  <li>Dedicated CSM</li>
                </ul>
                <button (click)="upgradePlan('agency')" class="w-full py-2 bg-navy text-white rounded-pill text-sm font-body font-semibold hover:bg-navy/90 transition-colors">
                  Upgrade to Agency
                </button>
              </div>
            </div>
          }

          <!-- Manage Subscription -->
          @if (billingPlan() !== 'free') {
            <div class="bg-white rounded-card shadow-card p-6">
              <h3 class="text-sm font-display text-navy mb-3 mt-0">Manage Subscription</h3>
              <p class="text-sm text-gray-500 font-body mb-4">Update payment method, change plan, or cancel.</p>
              <button (click)="manageSubscription()" class="px-5 py-2 border border-gray-200 text-navy rounded-pill text-sm font-body font-semibold hover:bg-gray-50 transition-colors">
                Open Billing Portal
              </button>
            </div>
          }
        </div>
      }

      <!-- Notifications Tab -->
      @if (activeTab() === 'notifications') {
        <div class="bg-white rounded-card shadow-card p-6">
          <h3 class="text-sm font-display text-navy mb-4 mt-0">Notification Preferences</h3>
          <div class="space-y-4">
            @for (pref of notificationPrefs; track pref.label) {
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <h4 class="text-sm font-body font-semibold text-navy m-0">{{ pref.label }}</h4>
                  <p class="text-xs text-gray-500 font-body m-0 mt-0.5">{{ pref.description }}</p>
                </div>
                <div class="flex gap-3">
                  <label class="flex items-center gap-1 text-xs font-body text-gray-600">
                    <input type="checkbox" [(ngModel)]="pref.email" class="rounded" />
                    Email
                  </label>
                  <label class="flex items-center gap-1 text-xs font-body text-gray-600">
                    <input type="checkbox" [(ngModel)]="pref.push" class="rounded" />
                    Push
                  </label>
                </div>
              </div>
            }
          </div>
          <div class="flex justify-end mt-4">
            <button (click)="saveNotifications()" class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
              Save Preferences
            </button>
          </div>
        </div>
      }
    </div>
  `
})
export default class SettingsComponent implements OnInit {
  private toast = inject(ToastService);
  private adAccountService = inject(AdAccountService);
  private api = inject(ApiService);
  metaOAuth = inject(MetaOAuthService);

  activeTab = signal('profile');
  billingPlan = signal('free');
  billingStatus = signal('Active');
  billingMemberSince = signal('—');

  tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'accounts', label: 'Connected Accounts' },
    { id: 'team', label: 'Team' },
    { id: 'billing', label: 'Billing' },
    { id: 'notifications', label: 'Notifications' },
  ];

  // Profile — loaded from localStorage/JWT
  profileName = '';
  profileEmail = '';
  profilePhone = '';
  timezone = 'IST';
  language = 'en';
  currency = 'INR';
  dateFormat = 'DD/MM/YYYY';

  // Other connected accounts (non-Meta)
  otherAccounts = [
    { name: 'Google Ads', icon: 'A', bg: '#fff3e0', description: 'Cross-platform campaign management', available: true },
    { name: 'TikTok Ads', icon: 'T', bg: '#f0f0f0', description: 'TikTok campaign analytics and optimization', available: true },
    { name: 'Google Analytics', icon: 'G', bg: '#fef3e2', description: 'Website analytics and conversion tracking', available: false },
    { name: 'Shopify', icon: 'S', bg: '#e8f5e9', description: 'E-commerce data and product catalog', available: false },
    { name: 'Slack', icon: 'SL', bg: '#f3e5f5', description: 'Team notifications and autopilot alerts', available: false },
  ];

  // Team — populated from JWT
  teamMembers: { name: string; email: string; role: string; status: string }[] = [];

  // Notifications
  notificationPrefs = [
    { label: 'Campaign Alerts', description: 'Budget exhausted, CPA spikes, campaign errors', email: true, push: true },
    { label: 'Creative Performance', description: 'Winner/loser notifications, fatigue alerts', email: true, push: true },
    { label: 'Automation Actions', description: 'When rules are triggered automatically', email: true, push: false },
    { label: 'Weekly Reports', description: 'Performance summary every Monday', email: true, push: false },
    { label: 'Team Activity', description: 'Member joins, role changes, new campaigns', email: false, push: true },
  ];

  ngOnInit() {
    this.loadProfile();
    this.loadNotificationPrefs();
    this.loadBilling();
  }

  private loadProfile() {
    const token = localStorage.getItem('cosmisk_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.profileName = payload.name || payload.sub || '';
        this.profileEmail = payload.email || '';
      } catch { /* ignore bad token */ }
    }
    // Populate team with current user
    this.teamMembers = [
      { name: this.profileName || 'You', email: this.profileEmail || '', role: 'Owner', status: 'Active' },
    ];
    // Load saved preferences
    const prefs = localStorage.getItem('cosmisk_preferences');
    if (prefs) {
      try {
        const p = JSON.parse(prefs);
        this.timezone = p.timezone || 'IST';
        this.language = p.language || 'en';
        this.currency = p.currency || 'INR';
        this.dateFormat = p.dateFormat || 'DD/MM/YYYY';
        this.profilePhone = p.phone || '';
      } catch { /* ignore */ }
    }
  }

  private loadNotificationPrefs() {
    const saved = localStorage.getItem('cosmisk_notification_prefs');
    if (saved) {
      try {
        const arr = JSON.parse(saved) as { label: string; email: boolean; push: boolean }[];
        for (const s of arr) {
          const match = this.notificationPrefs.find(p => p.label === s.label);
          if (match) {
            match.email = s.email;
            match.push = s.push;
          }
        }
      } catch { /* ignore */ }
    }
  }

  private loadBilling() {
    this.api.get<any>(environment.SETTINGS_BILLING).subscribe({
      next: (res) => {
        if (res.billing) {
          this.billingPlan.set(res.billing.plan || 'free');
          this.billingStatus.set(res.billing.status === 'active' ? 'Active' : res.billing.status || 'Active');
          if (res.billing.member_since) {
            const d = new Date(res.billing.member_since);
            this.billingMemberSince.set(d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }));
          }
        }
      },
      error: () => { /* keep defaults */ }
    });
  }

  connectMeta() {
    this.metaOAuth.openOAuthPopup();
  }

  disconnectMeta() {
    this.metaOAuth.disconnect();
    this.toast.info('Disconnected', 'Meta Ads account has been disconnected');
    this.adAccountService.loadAccounts();
  }

  saveProfile() {
    localStorage.setItem('cosmisk_preferences', JSON.stringify({
      timezone: this.timezone,
      language: this.language,
      currency: this.currency,
      dateFormat: this.dateFormat,
      phone: this.profilePhone,
    }));
    this.toast.success('Saved', 'Your preferences have been updated');
  }

  saveNotifications() {
    localStorage.setItem('cosmisk_notification_prefs', JSON.stringify(
      this.notificationPrefs.map(p => ({ label: p.label, email: p.email, push: p.push }))
    ));
    this.toast.success('Saved', 'Notification preferences updated');
  }

  connectPlatform(name: string) {
    const endpointMap: Record<string, string> = {
      'Google Ads': environment.GOOGLE_ADS_OAUTH_URL,
      'TikTok Ads': environment.TIKTOK_ADS_OAUTH_URL,
    };
    const endpoint = endpointMap[name];
    if (!endpoint) return;

    this.api.get<any>(endpoint).subscribe({
      next: (res) => {
        if (res.url) {
          window.location.href = res.url;
        } else {
          this.toast.error('Error', res.error || `${name} integration not yet configured`);
        }
      },
      error: () => {
        this.toast.error('Error', `${name} integration not available yet`);
      }
    });
  }

  upgradePlan(plan: string) {
    this.api.post<any>(environment.BILLING_CREATE_CHECKOUT, { plan, interval: 'monthly' }).subscribe({
      next: (res) => {
        if (res.url) {
          window.location.href = res.url;
        } else {
          this.toast.error('Error', res.error || 'Could not start checkout');
        }
      },
      error: (err) => {
        this.toast.error('Error', err.error?.error || 'Stripe checkout unavailable. Contact support@cosmisk.ai');
      }
    });
  }

  manageSubscription() {
    this.api.post<any>(environment.BILLING_CREATE_PORTAL, {}).subscribe({
      next: (res) => {
        if (res.url) {
          window.location.href = res.url;
        }
      },
      error: () => {
        this.toast.error('Error', 'Could not open billing portal');
      }
    });
  }
}
