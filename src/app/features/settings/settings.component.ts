const _BUILD_VER = '2026-02-13-v2';
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

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
            <span class="inline-flex px-3 py-1 bg-accent/10 text-accent rounded-pill text-xs font-body font-semibold">
              Growth Plan
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
                <button class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
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
          @for (account of connectedAccounts; track account.name) {
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
                <button class="px-4 py-2 rounded-pill text-xs font-body font-semibold transition-colors"
                  [ngClass]="account.connected
                    ? 'border border-green-200 text-green-700 bg-green-50'
                    : 'bg-accent text-white hover:bg-accent/90'">
                  {{ account.connected ? 'Connected' : 'Connect' }}
                </button>
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
                <p class="text-xs text-gray-500 font-body mt-1 mb-0">You're on the Growth plan</p>
              </div>
              <button class="px-4 py-2 bg-accent text-white rounded-pill text-xs font-body font-semibold hover:bg-accent/90">
                Upgrade Plan
              </button>
            </div>
            <div class="grid md:grid-cols-3 gap-4">
              <div class="p-4 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body block mb-1">Monthly Cost</span>
                <span class="text-lg font-display text-navy">₹24,999</span>
              </div>
              <div class="p-4 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body block mb-1">Ad Spend Managed</span>
                <span class="text-lg font-display text-navy">₹8.5L / ₹15L</span>
              </div>
              <div class="p-4 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body block mb-1">Next Billing Date</span>
                <span class="text-lg font-display text-navy">Mar 1, 2024</span>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-card shadow-card p-6">
            <h3 class="text-sm font-display text-navy mb-3 mt-0">Payment Method</h3>
            <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <lucide-icon name="credit-card" [size]="20"></lucide-icon>
              <div>
                <div class="text-sm font-body text-navy">Visa ending in 4242</div>
                <div class="text-xs text-gray-500 font-body">Expires 12/2025</div>
              </div>
              <button class="ml-auto text-xs text-accent font-body hover:underline">Change</button>
            </div>
          </div>
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
                    <input type="checkbox" [checked]="pref.email" class="rounded" />
                    Email
                  </label>
                  <label class="flex items-center gap-1 text-xs font-body text-gray-600">
                    <input type="checkbox" [checked]="pref.push" class="rounded" />
                    Push
                  </label>
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `
})
export default class SettingsComponent {
  activeTab = signal('profile');

  tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'accounts', label: 'Connected Accounts' },
    { id: 'team', label: 'Team' },
    { id: 'billing', label: 'Billing' },
    { id: 'notifications', label: 'Notifications' },
  ];

  // Profile
  profileName = 'Arjun Mehta';
  profileEmail = 'arjun@glowderm.in';
  profilePhone = '+91 98765 43210';
  timezone = 'IST';
  language = 'en';
  currency = 'INR';
  dateFormat = 'DD/MM/YYYY';

  // Connected Accounts
  connectedAccounts = [
    { name: 'Meta Business Suite', icon: '📘', bg: '#e8f0fe', description: 'Ad accounts, pages, and pixel data', connected: true },
    { name: 'Google Analytics', icon: '📊', bg: '#fef3e2', description: 'Website analytics and conversion tracking', connected: true },
    { name: 'Shopify', icon: '🛍️', bg: '#e8f5e9', description: 'E-commerce data and product catalog', connected: true },
    { name: 'Google Ads', icon: '📣', bg: '#fff3e0', description: 'Cross-platform campaign management', connected: false },
    { name: 'Slack', icon: '💬', bg: '#f3e5f5', description: 'Team notifications and alerts', connected: false },
  ];

  // Team
  teamMembers = [
    { name: 'Arjun Mehta', email: 'arjun@glowderm.in', role: 'Owner', status: 'Active' },
    { name: 'Priya Sharma', email: 'priya@glowderm.in', role: 'Admin', status: 'Active' },
    { name: 'Rahul Verma', email: 'rahul@glowderm.in', role: 'Media Buyer', status: 'Active' },
    { name: 'Neha Gupta', email: 'neha@glowderm.in', role: 'Designer', status: 'Active' },
    { name: 'Vikram Singh', email: 'vikram@glowderm.in', role: 'Media Buyer', status: 'Invited' },
    { name: 'Ananya Patel', email: 'ananya@glowderm.in', role: 'Viewer', status: 'Active' },
  ];

  // Notifications
  notificationPrefs = [
    { label: 'Campaign Alerts', description: 'Budget exhausted, CPA spikes, campaign errors', email: true, push: true },
    { label: 'Creative Performance', description: 'Winner/loser notifications, fatigue alerts', email: true, push: true },
    { label: 'Automation Actions', description: 'When rules are triggered automatically', email: true, push: false },
    { label: 'Weekly Reports', description: 'Performance summary every Monday', email: true, push: false },
    { label: 'Team Activity', description: 'Member joins, role changes, new campaigns', email: false, push: true },
  ];
}
