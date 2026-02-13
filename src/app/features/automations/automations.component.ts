const _BUILD_VER = '2026-02-13-v2';
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface AutomationRule {
  id: string;
  name: string;
  status: 'active' | 'paused';
  condition: string;
  action: string;
  lastTriggered: string;
  triggerCount: number;
}

@Component({
  selector: 'app-automations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Automations</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Set rules and triggers for your campaigns</p>
        </div>
        <button
          (click)="showBuilder.set(!showBuilder())"
          class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
          {{ showBuilder() ? 'Cancel' : '+ Create New Rule' }}
        </button>
      </div>

      <!-- Rule Builder -->
      @if (showBuilder()) {
        <div class="bg-white rounded-card shadow-card p-6">
          <h3 class="text-base font-display text-navy mb-4 mt-0">New Automation Rule</h3>
          <div class="space-y-4">
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Rule Name</label>
              <input [(ngModel)]="newRuleName" placeholder="e.g., Pause high CPA ads"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
            </div>

            <!-- IF Condition -->
            <div class="p-4 bg-amber-50 rounded-lg">
              <span class="text-xs font-body font-bold text-amber-700 uppercase block mb-3">IF</span>
              <div class="grid md:grid-cols-3 gap-3">
                <select [(ngModel)]="conditionMetric" class="px-3 py-2 border border-amber-200 rounded-lg text-sm font-body bg-white">
                  <option value="">Select metric...</option>
                  <option value="cpa">CPA</option>
                  <option value="roas">ROAS</option>
                  <option value="ctr">CTR</option>
                  <option value="spend">Daily Spend</option>
                  <option value="frequency">Frequency</option>
                  <option value="cpm">CPM</option>
                </select>
                <select [(ngModel)]="conditionOperator" class="px-3 py-2 border border-amber-200 rounded-lg text-sm font-body bg-white">
                  <option value="">Select condition...</option>
                  <option value="gt">is greater than</option>
                  <option value="lt">is less than</option>
                  <option value="eq">equals</option>
                  <option value="gte">is at least</option>
                  <option value="lte">is at most</option>
                </select>
                <input [(ngModel)]="conditionValue" placeholder="Value (e.g., 500)"
                  class="px-3 py-2 border border-amber-200 rounded-lg text-sm font-body bg-white" />
              </div>
            </div>

            <!-- THEN Action -->
            <div class="p-4 bg-green-50 rounded-lg">
              <span class="text-xs font-body font-bold text-green-700 uppercase block mb-3">THEN</span>
              <div class="grid md:grid-cols-2 gap-3">
                <select [(ngModel)]="actionType" class="px-3 py-2 border border-green-200 rounded-lg text-sm font-body bg-white">
                  <option value="">Select action...</option>
                  <option value="pause">Pause ad set</option>
                  <option value="reduce_budget">Reduce budget by %</option>
                  <option value="increase_budget">Increase budget by %</option>
                  <option value="notify">Send notification</option>
                  <option value="duplicate">Duplicate & modify</option>
                </select>
                <select [(ngModel)]="actionScope" class="px-3 py-2 border border-green-200 rounded-lg text-sm font-body bg-white">
                  <option value="">Apply to...</option>
                  <option value="ad">Specific ad</option>
                  <option value="adset">Ad set</option>
                  <option value="campaign">Campaign</option>
                  <option value="all">All matching</option>
                </select>
              </div>
            </div>

            <!-- Check frequency -->
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Check Frequency</label>
              <div class="flex gap-2">
                @for (freq of frequencies; track freq) {
                  <button
                    (click)="selectedFreq = freq"
                    class="px-3 py-1.5 rounded-pill text-xs font-body border transition-colors"
                    [ngClass]="selectedFreq === freq ? 'bg-accent text-white border-accent' : 'border-gray-200 text-gray-600 hover:border-accent/50'">
                    {{ freq }}
                  </button>
                }
              </div>
            </div>

            <div class="flex justify-end gap-3 pt-2">
              <button (click)="showBuilder.set(false)" class="px-4 py-2 text-gray-500 text-sm font-body">Cancel</button>
              <button class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90">
                Create Rule
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Summary Stats -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-white rounded-card shadow-card p-4 text-center">
          <div class="text-2xl font-display text-navy">{{ rules.length }}</div>
          <span class="text-xs text-gray-500 font-body">Total Rules</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4 text-center">
          <div class="text-2xl font-display text-green-600">{{ activeCount }}</div>
          <span class="text-xs text-gray-500 font-body">Active</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4 text-center">
          <div class="text-2xl font-display text-navy">{{ totalTriggers }}</div>
          <span class="text-xs text-gray-500 font-body">Total Triggers (30d)</span>
        </div>
      </div>

      <!-- Active Rules -->
      <div class="space-y-3">
        @for (rule of rules; track rule.id) {
          <div class="bg-white rounded-card shadow-card p-5 hover:shadow-card-hover transition-all">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <h3 class="text-sm font-body font-semibold text-navy m-0">{{ rule.name }}</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-body font-semibold"
                    [ngClass]="rule.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">
                    {{ rule.status === 'active' ? 'Active' : 'Paused' }}
                  </span>
                </div>
                <div class="flex flex-wrap gap-2 mb-2">
                  <span class="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs font-body">
                    IF {{ rule.condition }}
                  </span>
                  <span class="text-gray-300 text-xs self-center">→</span>
                  <span class="px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-body">
                    THEN {{ rule.action }}
                  </span>
                </div>
                <div class="flex gap-4 text-xs text-gray-500 font-body">
                  <span>Last triggered: {{ rule.lastTriggered }}</span>
                  <span>{{ rule.triggerCount }} triggers (30d)</span>
                </div>
              </div>
              <div class="flex gap-2 shrink-0">
                <button class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-body text-gray-600 hover:bg-gray-50">
                  {{ rule.status === 'active' ? 'Pause' : 'Resume' }}
                </button>
                <button class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-body text-gray-600 hover:bg-gray-50">
                  Edit
                </button>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Activity Log -->
      <div class="bg-white rounded-card shadow-card p-5">
        <h3 class="text-sm font-display text-navy mb-4 mt-0">Recent Activity</h3>
        <div class="space-y-2">
          @for (log of activityLog; track log.time) {
            <div class="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
              <span class="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                [ngClass]="log.type === 'pause' ? 'bg-red-100' : log.type === 'budget' ? 'bg-amber-100' : 'bg-blue-100'">
                {{ log.type === 'pause' ? '⏸️' : log.type === 'budget' ? '💰' : '🔔' }}
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-body text-navy m-0">{{ log.message }}</p>
                <span class="text-[10px] text-gray-400 font-body">{{ log.time }}</span>
              </div>
              <button class="text-xs text-accent font-body hover:underline shrink-0">Undo</button>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export default class AutomationsComponent {
  showBuilder = signal(false);

  newRuleName = '';
  conditionMetric = '';
  conditionOperator = '';
  conditionValue = '';
  actionType = '';
  actionScope = '';
  selectedFreq = 'Every 6 hours';
  frequencies = ['Every hour', 'Every 6 hours', 'Every 12 hours', 'Daily'];

  rules: AutomationRule[] = [
    {
      id: 'r-1', name: 'Pause High CPA Ads', status: 'active',
      condition: 'CPA > ₹500 for 3 consecutive days',
      action: 'Pause ad set + notify team',
      lastTriggered: '2 hours ago', triggerCount: 12
    },
    {
      id: 'r-2', name: 'Scale Winning Creatives', status: 'active',
      condition: 'ROAS > 4x and spend > ₹5,000',
      action: 'Increase budget by 20%',
      lastTriggered: 'Yesterday', triggerCount: 8
    },
    {
      id: 'r-3', name: 'Creative Fatigue Alert', status: 'active',
      condition: 'CTR drops >30% over 7 days',
      action: 'Send notification + suggest refresh',
      lastTriggered: '3 days ago', triggerCount: 5
    },
  ];

  activityLog = [
    { type: 'pause', message: 'Paused "Summer Sale Banner" — CPA hit ₹680 (3-day avg)', time: '2 hours ago' },
    { type: 'budget', message: 'Increased "Collagen Glow-Up" budget to ₹62,000/day (+20%)', time: 'Yesterday, 6:00 PM' },
    { type: 'notify', message: 'Alert: "Before/After Carousel" CTR dropped 34% this week', time: '3 days ago' },
    { type: 'budget', message: 'Increased "UGC Priya" budget to ₹48,000/day (+20%)', time: '4 days ago' },
    { type: 'pause', message: 'Paused "Valentine Offer" — CPA hit ₹720 (3-day avg)', time: '5 days ago' },
  ];

  get activeCount(): number { return this.rules.filter(r => r.status === 'active').length; }
  get totalTriggers(): number { return this.rules.reduce((sum, r) => sum + r.triggerCount, 0); }
}
