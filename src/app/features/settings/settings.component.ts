const _BUILD_VER = '2026-03-05-v1';
import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { MetaOAuthService } from '../../core/services/meta-oauth.service';
import { GoogleAdsOAuthService } from '../../core/services/google-ads-oauth.service';
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
              <span class="text-xs text-gray-400 font-body">Account ID: {{ profileEmail.split('@')[0] || '—' }}</span>
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

          <!-- Google Ads — OAuth -->
          <div class="bg-white rounded-card shadow-card p-5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="w-10 h-10 rounded-full flex items-center justify-center text-xl" style="background-color: #fff3e0">
                  A
                </span>
                <div>
                  <h3 class="text-sm font-body font-semibold text-navy m-0">Google Ads</h3>
                  @if (googleAdsOAuth.connectionStatus() === 'loading') {
                    <p class="text-xs text-gray-400 font-body m-0 mt-0.5">Checking connection...</p>
                  }
                  @if (googleAdsOAuth.connectionStatus() === 'connected') {
                    <p class="text-xs text-green-600 font-body m-0 mt-0.5">{{ googleAdsOAuth.connectedAccountCount() }} customer ID(s) connected</p>
                  }
                  @if (googleAdsOAuth.connectionStatus() === 'expired') {
                    <p class="text-xs text-amber-600 font-body m-0 mt-0.5">Token expired — please reconnect</p>
                  }
                  @if (googleAdsOAuth.connectionStatus() === 'disconnected') {
                    <p class="text-xs text-gray-500 font-body m-0 mt-0.5">Cross-platform campaign management</p>
                  }
                </div>
              </div>
              <div class="flex items-center gap-2">
                @if (googleAdsOAuth.connectionStatus() === 'connected') {
                  <button (click)="disconnectGoogleAds()" class="px-4 py-2 rounded-pill text-xs font-body font-semibold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
                    Disconnect
                  </button>
                }
                @if (googleAdsOAuth.connectionStatus() === 'disconnected' || googleAdsOAuth.connectionStatus() === 'expired') {
                  <button (click)="connectPlatform('Google Ads')" class="px-4 py-2 rounded-pill text-xs font-body font-semibold bg-accent text-white hover:bg-accent/90 transition-colors">
                    {{ googleAdsOAuth.connectionStatus() === 'expired' ? 'Reconnect' : 'Connect' }}
                  </button>
                }
                @if (googleAdsOAuth.connectionStatus() === 'loading') {
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
        <div class="space-y-4">
          <!-- Invite Form -->
          <div class="bg-white rounded-card shadow-card p-5">
            <h3 class="text-sm font-display text-navy m-0 mb-3">Invite Team Member</h3>
            <div class="flex flex-wrap gap-3 items-end">
              <div class="flex-1 min-w-[200px]">
                <label class="text-xs text-gray-500 font-body block mb-1">Email</label>
                <input type="email" [(ngModel)]="inviteEmail" placeholder="colleague@agency.com"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/30">
              </div>
              <div class="w-40">
                <label class="text-xs text-gray-500 font-body block mb-1">Role</label>
                <select [(ngModel)]="inviteRole"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/30">
                  <option value="admin">Admin</option>
                  <option value="media_buyer">Media Buyer</option>
                  <option value="designer">Designer</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <button (click)="inviteMember()" [disabled]="inviting || !inviteEmail"
                class="px-4 py-2 bg-accent text-white rounded-lg text-sm font-body font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors">
                {{ inviting ? 'Sending...' : 'Send Invite' }}
              </button>
            </div>
          </div>

          <!-- Members Table -->
          <div class="bg-white rounded-card shadow-card p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-display text-navy m-0">Team Members</h3>
              <span class="text-xs text-gray-400 font-body">{{ teamMembers.length }} member{{ teamMembers.length !== 1 ? 's' : '' }}</span>
            </div>

            @if (teamLoading) {
              <div class="flex items-center justify-center py-8 gap-2">
                <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                <span class="text-sm text-gray-500 font-body">Loading team...</span>
              </div>
            } @else if (teamMembers.length <= 1) {
              <div class="text-center py-8">
                <div class="w-12 h-12 bg-gray-100 rounded-full mx-auto flex items-center justify-center mb-3">
                  <lucide-icon name="users" [size]="20" class="text-gray-400"></lucide-icon>
                </div>
                <p class="text-sm text-gray-500 font-body m-0">No team members yet</p>
                <p class="text-xs text-gray-400 font-body mt-1 m-0">Invite your first team member above to get started</p>
              </div>
            } @else {
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
                    @for (member of teamMembers; track member.id) {
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
                          @if (member.role === 'Owner') {
                            <span class="px-2 py-0.5 rounded text-xs font-body bg-purple-100 text-purple-700">Owner</span>
                          } @else if (member.status !== 'Revoked') {
                            <select [ngModel]="member.roleKey" (ngModelChange)="changeRole(member, $event)"
                              class="px-2 py-0.5 rounded text-xs font-body border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-accent/30">
                              <option value="admin">Admin</option>
                              <option value="media_buyer">Media Buyer</option>
                              <option value="designer">Designer</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          } @else {
                            <span class="px-2 py-0.5 rounded text-xs font-body bg-gray-100 text-gray-500">{{ member.role }}</span>
                          }
                        </td>
                        <td class="py-3">
                          <span class="inline-flex items-center gap-1 text-xs font-body" [ngClass]="{
                            'text-green-600': member.status === 'Active',
                            'text-amber-600': member.status === 'Pending',
                            'text-red-500': member.status === 'Revoked'
                          }">
                            <span class="w-1.5 h-1.5 rounded-full" [ngClass]="{
                              'bg-green-500': member.status === 'Active',
                              'bg-amber-500': member.status === 'Pending',
                              'bg-red-400': member.status === 'Revoked'
                            }"></span>
                            {{ member.status }}
                          </span>
                        </td>
                        <td class="py-3 text-right">
                          @if (member.role !== 'Owner') {
                            <div class="flex items-center gap-2 justify-end">
                              @if (member.status === 'Pending') {
                                <button (click)="resendInvite(member)"
                                  class="text-xs text-accent font-body hover:underline">Resend</button>
                              }
                              @if (member.status !== 'Revoked') {
                                <button (click)="removeMember(member)"
                                  class="text-xs text-red-500 font-body hover:underline">Remove</button>
                              }
                            </div>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
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
              <div class="flex items-center gap-2">
                @if (billingTrialEnds()) {
                  <span class="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-pill text-xs font-body font-semibold">
                    Trial ends {{ billingTrialEnds() }}
                  </span>
                }
                <span class="px-4 py-2 bg-accent/10 text-accent rounded-pill text-xs font-body font-semibold">
                  {{ billingStatus() }}
                </span>
              </div>
            </div>
            <div class="grid md:grid-cols-3 gap-4">
              <div class="p-4 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body block mb-1">Plan</span>
                <span class="text-lg font-display text-navy capitalize">{{ billingPlan() }}</span>
              </div>
              <div class="p-4 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body block mb-1">Gateway</span>
                <span class="text-lg font-display text-navy capitalize">{{ billingGateway() }}</span>
              </div>
              <div class="p-4 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body block mb-1">Member Since</span>
                <span class="text-lg font-display text-navy">{{ billingMemberSince() }}</span>
              </div>
            </div>
          </div>

          <!-- Upgrade Cards (4 tiers) -->
          @if (billingPlan() !== 'agency') {
            <div class="grid md:grid-cols-3 gap-4">
              @for (card of upgradeCards(); track card.id) {
                <div class="bg-white rounded-card shadow-card p-6" [class.ring-2]="card.featured" [class.ring-accent]="card.featured">
                  <h3 class="text-sm font-display text-navy m-0 mb-1">{{ card.name }}</h3>
                  <p class="text-2xl font-mono text-navy m-0">
                    {{ currency === 'INR' ? '\u20B9' : '$' }}{{ (currency === 'INR' ? card.inr : card.usd).toLocaleString() }}
                    <span class="text-sm text-gray-500 font-body">/mo</span>
                  </p>
                  <ul class="text-xs text-gray-600 font-body mt-3 space-y-1 list-none p-0 mb-4">
                    @for (f of card.highlights; track f) {
                      <li>{{ f }}</li>
                    }
                  </ul>
                  <button
                    (click)="upgradePlan(card.id)"
                    class="w-full py-2 rounded-pill text-sm font-body font-semibold transition-colors"
                    [ngClass]="card.featured ? 'bg-accent text-white hover:bg-accent/90' : 'bg-navy text-white hover:bg-navy/90'">
                    {{ billingPlan() === 'free' ? 'Start 14-Day Trial' : 'Upgrade to ' + card.name }}
                  </button>
                </div>
              }
            </div>
          }

          <!-- Manage Subscription -->
          @if (billingPlan() !== 'free') {
            <div class="bg-white rounded-card shadow-card p-6">
              <h3 class="text-sm font-display text-navy mb-3 mt-0">Manage Subscription</h3>
              <p class="text-sm text-gray-500 font-body mb-4">Update payment method, change plan, or cancel.</p>
              <div class="flex gap-3">
                @if (billingGateway() === 'stripe') {
                  <button (click)="manageSubscription()" class="px-5 py-2 border border-gray-200 text-navy rounded-pill text-sm font-body font-semibold hover:bg-gray-50 transition-colors">
                    Open Billing Portal
                  </button>
                }
                <button (click)="cancelSubscription()" class="px-5 py-2 border border-red-200 text-red-600 rounded-pill text-sm font-body font-semibold hover:bg-red-50 transition-colors">
                  Cancel Subscription
                </button>
              </div>
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
  googleAdsOAuth = inject(GoogleAdsOAuthService);

  activeTab = signal('profile');
  billingPlan = signal('free');
  billingStatus = signal('Active');
  billingMemberSince = signal('—');
  billingGateway = signal('—');
  billingTrialEnds = signal('');

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
    { name: 'TikTok Ads', icon: 'T', bg: '#f0f0f0', description: 'TikTok campaign analytics and optimization', available: true },
    { name: 'Google Analytics', icon: 'G', bg: '#fef3e2', description: 'Website analytics and conversion tracking', available: false },
    { name: 'Shopify', icon: 'S', bg: '#e8f5e9', description: 'E-commerce data and product catalog', available: false },
    { name: 'Slack', icon: 'SL', bg: '#f3e5f5', description: 'Team notifications and autopilot alerts', available: false },
  ];

  // Team — loaded from API
  teamMembers: { id: string; name: string; email: string; role: string; roleKey: string; status: string }[] = [];
  teamLoading = false;
  inviteEmail = '';
  inviteRole = 'viewer';
  inviting = false;

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
    // Set initial values from JWT token (fast, avoids blank flash)
    const token = localStorage.getItem('cosmisk_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.profileName = payload.name || payload.sub || '';
        this.profileEmail = payload.email || '';
      } catch { /* ignore bad token */ }
    }
    this.loadTeam();

    // Fetch full profile from server (authoritative source for all fields)
    this.api.get<any>(environment.SETTINGS_PROFILE).subscribe({
      next: (res) => {
        if (res.success && res.profile) {
          const p = res.profile;
          this.profileName = p.name || this.profileName;
          this.profileEmail = p.email || this.profileEmail;
          this.profilePhone = p.phone || '';
          this.timezone = p.timezone || 'IST';
          this.language = p.language || 'en';
          this.currency = p.currency || 'INR';
          this.dateFormat = p.date_format || 'DD/MM/YYYY';
          // Load notification preferences from server (overrides localStorage)
          if (p.notification_preferences) {
            try {
              const prefs = typeof p.notification_preferences === 'string'
                ? JSON.parse(p.notification_preferences)
                : p.notification_preferences;
              if (Array.isArray(prefs)) {
                for (const s of prefs) {
                  const match = this.notificationPrefs.find(np => np.label === s.label);
                  if (match) { match.email = s.email; match.push = s.push; }
                }
              }
            } catch { /* ignore bad JSON */ }
          }
        }
      },
      error: () => { /* keep JWT defaults on network failure */ }
    });
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
    this.api.get<any>(environment.BILLING_STATUS).subscribe({
      next: (res) => {
        if (res.plan) {
          this.billingPlan.set(res.plan || 'free');
        }
        if (res.subscription) {
          this.billingStatus.set(res.subscription.status === 'active' ? 'Active' : res.subscription.status === 'trialing' ? 'Trial' : res.subscription.status || 'Active');
          this.billingGateway.set(res.subscription.gateway || '—');
          if (res.subscription.trial_ends_at) {
            const d = new Date(res.subscription.trial_ends_at);
            this.billingTrialEnds.set(d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }));
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
    if (!confirm('Disconnect Meta Ads? You will lose access to all ad account data until you reconnect.')) return;
    this.metaOAuth.disconnect();
    this.toast.info('Disconnected', 'Meta Ads account has been disconnected');
    this.adAccountService.loadAccounts();
  }

  disconnectGoogleAds() {
    if (!confirm('Disconnect Google Ads? You will lose access to all Google Ads data until you reconnect.')) return;
    this.googleAdsOAuth.disconnect();
    this.toast.info('Disconnected', 'Google Ads account has been disconnected');
  }

  saveProfile() {
    // Save all profile fields to server
    this.api.post<any>(environment.SETTINGS_PROFILE, {
      name: this.profileName,
      email: this.profileEmail,
      phone: this.profilePhone,
      timezone: this.timezone,
      language: this.language,
      currency: this.currency,
      date_format: this.dateFormat,
    }).subscribe({
      next: (res) => {
        if (res.success) {
          // Update JWT if server returns new token
          if (res.token) {
            localStorage.setItem('cosmisk_token', res.token);
          }
          this.toast.success('Saved', 'Your profile has been updated');
        }
      },
      error: () => {
        this.toast.error('Save Failed', 'Could not save profile to server. Preferences saved locally only.');
      },
    });
  }

  saveNotifications() {
    const prefs = this.notificationPrefs.map(p => ({ label: p.label, email: p.email, push: p.push }));
    // Persist to server
    this.api.post<any>(environment.SETTINGS_PROFILE, {
      notification_preferences: JSON.stringify(prefs),
    }).subscribe({
      next: () => {
        localStorage.setItem('cosmisk_notification_prefs', JSON.stringify(prefs));
        this.toast.success('Saved', 'Notification preferences updated');
      },
      error: () => {
        localStorage.setItem('cosmisk_notification_prefs', JSON.stringify(prefs));
        this.toast.success('Saved', 'Preferences saved locally');
      },
    });
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

  upgradeCards() {
    const current = this.billingPlan();
    const allCards = [
      { id: 'solo', name: 'Solo', inr: 2499, usd: 29, featured: false, highlights: ['3 ad accounts', 'Unlimited AI chat', '30 images + 5 videos/mo', '10 autopilot rules'] },
      { id: 'growth', name: 'Growth', inr: 5999, usd: 69, featured: true, highlights: ['10 ad accounts', '100 images + 20 videos/mo', 'Unlimited autopilot', 'Branded reports'] },
      { id: 'agency', name: 'Agency', inr: 12999, usd: 149, featured: false, highlights: ['Unlimited everything', 'White-label reports', 'Agency Command Center', 'API Access'] },
    ];
    // Only show cards for plans higher than current
    const order = ['free', 'solo', 'growth', 'agency'];
    const currentIdx = order.indexOf(current);
    return allCards.filter(c => order.indexOf(c.id) > currentIdx);
  }

  upgradePlan(plan: string) {
    const gateway = this.currency === 'INR' ? 'razorpay' : 'stripe';

    this.api.post<any>(environment.BILLING_CREATE_CHECKOUT, { plan, interval: 'monthly', gateway }).subscribe({
      next: (res) => {
        if (res.gateway === 'razorpay' && res.subscription_id) {
          // Open Razorpay modal
          const rzp = new (window as any).Razorpay({
            key: res.razorpay_key || (environment as any).RAZORPAY_KEY_ID,
            subscription_id: res.subscription_id,
            name: 'Cosmisk',
            description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan - Monthly`,
            handler: (response: any) => {
              this.verifyRazorpayPayment(response, plan);
            },
            modal: {
              ondismiss: () => {
                this.toast.info('Cancelled', 'Payment was cancelled');
              },
            },
            theme: { color: '#6366F1' },
          });
          rzp.open();
        } else if (res.url) {
          // Stripe redirect
          window.location.href = res.url;
        } else {
          this.toast.error('Error', res.error || 'Could not start checkout');
        }
      },
      error: (err) => {
        this.toast.error('Error', err.error?.error || 'Checkout unavailable. Contact support@cosmisk.ai');
      }
    });
  }

  private verifyRazorpayPayment(response: any, plan: string) {
    this.api.post<any>(environment.BILLING_VERIFY_PAYMENT, {
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_subscription_id: response.razorpay_subscription_id,
      razorpay_signature: response.razorpay_signature,
      plan,
    }).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success('Upgraded', `You're now on the ${plan} plan!`);
          this.loadBilling();
        } else {
          this.toast.error('Error', res.error || 'Payment verification failed');
        }
      },
      error: () => {
        this.toast.error('Error', 'Payment verification failed. Contact support@cosmisk.ai');
      }
    });
  }

  manageSubscription() {
    this.api.post<any>(environment.BILLING_CREATE_PORTAL, {}).subscribe({
      next: (res) => {
        if (res.gateway === 'razorpay') {
          this.toast.info('Manage In-App', 'Use the cancel button below to manage your Razorpay subscription');
        } else if (res.url) {
          window.location.href = res.url;
        }
      },
      error: () => {
        this.toast.error('Error', 'Could not open billing portal');
      }
    });
  }

  cancelSubscription() {
    if (!confirm('Are you sure you want to cancel your subscription? You will be downgraded to the Free plan.')) return;

    this.api.post<any>(environment.BILLING_CANCEL, {}).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success('Cancelled', 'Your subscription has been cancelled');
          this.loadBilling();
        }
      },
      error: () => {
        this.toast.error('Error', 'Could not cancel subscription');
      }
    });
  }

  private loadTeam() {
    this.teamLoading = true;
    this.api.get<any>(environment.TEAM_MEMBERS).subscribe({
      next: (res) => {
        if (res.success && res.members) {
          this.teamMembers = res.members.map((m: any) => ({
            id: m.id,
            name: m.name || m.email.split('@')[0],
            email: m.email,
            role: this.formatRole(m.role),
            roleKey: m.role,
            status: m.status === 'active' ? 'Active' : m.status === 'pending' ? 'Pending' : 'Revoked',
          }));
        }
        this.teamLoading = false;
      },
      error: () => {
        // Fallback to JWT-based owner row
        this.teamMembers = [
          { id: '', name: this.profileName || 'You', email: this.profileEmail || '', role: 'Owner', roleKey: 'owner', status: 'Active' },
        ];
        this.teamLoading = false;
      },
    });
  }

  private formatRole(role: string): string {
    const map: Record<string, string> = {
      owner: 'Owner', admin: 'Admin', media_buyer: 'Media Buyer',
      designer: 'Designer', viewer: 'Viewer',
    };
    return map[role] || role;
  }

  inviteMember() {
    if (!this.inviteEmail || !this.inviteEmail.includes('@')) return;
    this.inviting = true;
    this.api.post<any>(environment.TEAM_INVITE, {
      email: this.inviteEmail,
      role: this.inviteRole,
    }).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success('Invited', res.message || `Invitation sent to ${this.inviteEmail}`);
          this.inviteEmail = '';
          this.inviteRole = 'viewer';
          this.loadTeam();
        } else {
          this.toast.error('Error', res.error || 'Could not send invite');
        }
        this.inviting = false;
      },
      error: (err) => {
        this.toast.error('Error', err.error?.error || 'Could not send invite');
        this.inviting = false;
      },
    });
  }

  removeMember(member: { id: string; name: string }) {
    if (!confirm(`Remove ${member.name} from your team?`)) return;
    this.api.delete<any>(`${environment.TEAM_MEMBERS}/${member.id}`).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success('Removed', `${member.name} has been removed from the team`);
          this.loadTeam();
        } else {
          this.toast.error('Error', res.error || 'Could not remove member');
        }
      },
      error: (err) => this.toast.error('Error', err.error?.error || 'Could not remove member'),
    });
  }

  changeRole(member: { id: string; name: string; roleKey: string }, newRole: string) {
    this.api.put<any>(`${environment.TEAM_MEMBERS}/${member.id}/role`, { role: newRole }).subscribe({
      next: (res) => {
        if (res.success) {
          member.roleKey = newRole;
          member.name; // keep reference
          this.toast.success('Updated', `${member.name}'s role updated to ${this.formatRole(newRole)}`);
          this.loadTeam();
        } else {
          this.toast.error('Error', res.error || 'Could not update role');
        }
      },
      error: (err) => this.toast.error('Error', err.error?.error || 'Could not update role'),
    });
  }

  resendInvite(member: { id: string; email: string }) {
    this.api.post<any>(`${environment.TEAM_RESEND}/${member.id}`, {}).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success('Resent', `Invitation resent to ${member.email}`);
        } else {
          this.toast.error('Error', res.error || 'Could not resend invite');
        }
      },
      error: (err) => this.toast.error('Error', err.error?.error || 'Could not resend invite'),
    });
  }
}
