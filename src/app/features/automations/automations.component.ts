const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, inject, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AdAccountService } from '../../core/services/ad-account.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { environment } from '../../../environments/environment';

interface AutomationRule {
  id: string;
  name: string;
  status: 'active' | 'paused';
  condition: string;
  action: string;
  lastTriggered: string;
  triggerCount: number;
}

interface ActivityLogEntry {
  type: string;
  message: string;
  time: string;
  context?: string;
  suggestedAction?: string;
}

@Component({
  selector: 'app-automations',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
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

      <!-- Quick Templates -->
      @if (!showBuilder() && rules().length === 0) {
        <div class="bg-white rounded-card shadow-card p-5">
          <div class="flex items-center gap-2 mb-4">
            <lucide-icon name="zap" [size]="16" class="text-amber-500"></lucide-icon>
            <h3 class="text-sm font-display text-navy m-0">Quick Start Templates</h3>
          </div>
          <p class="text-xs text-gray-500 font-body mb-4 m-0">One-click setup for common automation rules used by top performers.</p>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            @for (tpl of templates; track tpl.name) {
              <button (click)="applyTemplate(tpl)"
                class="text-left p-4 border border-gray-200 rounded-xl hover:border-accent/50 hover:bg-accent/5 transition-all group">
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center" [ngClass]="tpl.bgClass">
                    <lucide-icon [name]="tpl.icon" [size]="16" [class]="tpl.iconClass"></lucide-icon>
                  </div>
                  <span class="text-sm font-body font-semibold text-navy group-hover:text-accent">{{ tpl.name }}</span>
                </div>
                <p class="text-xs text-gray-500 font-body m-0 mb-2">{{ tpl.description }}</p>
                <div class="flex gap-1.5 flex-wrap">
                  <span class="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-body">IF {{ tpl.conditionLabel }}</span>
                  <span class="px-2 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-body">THEN {{ tpl.actionLabel }}</span>
                </div>
              </button>
            }
          </div>
        </div>
      }

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
                  <!-- duplicate action not yet supported by Meta API integration -->
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
              <button (click)="createRule()"
                [disabled]="saving()"
                class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 disabled:opacity-50">
                {{ saving() ? 'Creating...' : 'Create Rule' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Summary Stats -->
      <div class="grid grid-cols-3 gap-4">
        @if (loading()) {
          @for (i of [1,2,3]; track i) {
            <div class="bg-white rounded-card shadow-card p-4 text-center animate-pulse">
              <div class="h-7 bg-gray-200 rounded w-10 mx-auto mb-2"></div>
              <div class="h-3 bg-gray-100 rounded w-20 mx-auto"></div>
            </div>
          }
        } @else {
          <div class="bg-white rounded-card shadow-card p-4 text-center">
            <div class="text-2xl font-display text-navy">{{ rules().length }}</div>
            <span class="text-xs text-gray-500 font-body">Total Rules</span>
          </div>
          <div class="bg-white rounded-card shadow-card p-4 text-center">
            <div class="text-2xl font-display text-green-600">{{ activeCount() }}</div>
            <span class="text-xs text-gray-500 font-body">Active</span>
          </div>
          <div class="bg-white rounded-card shadow-card p-4 text-center">
            <div class="text-2xl font-display text-navy">{{ totalTriggers() }}</div>
            <span class="text-xs text-gray-500 font-body">Total Triggers (30d)</span>
          </div>
        }
      </div>

      <!-- Active Rules -->
      <div class="space-y-3">
        @if (loading()) {
          @for (i of [1,2,3]; track i) {
            <div class="bg-white rounded-card shadow-card p-5 animate-pulse">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="h-4 bg-gray-200 rounded w-48 mb-3"></div>
                  <div class="flex gap-2 mb-3">
                    <div class="h-6 bg-amber-50 rounded w-32"></div>
                    <div class="h-6 bg-green-50 rounded w-28"></div>
                  </div>
                  <div class="h-3 bg-gray-100 rounded w-40"></div>
                </div>
                <div class="flex gap-2">
                  <div class="h-7 bg-gray-100 rounded w-14"></div>
                  <div class="h-7 bg-gray-100 rounded w-10"></div>
                </div>
              </div>
            </div>
          }
        } @else {
          @for (rule of rules(); track rule.id) {
            <div class="bg-white rounded-card shadow-card p-5 card-lift">
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
                    <lucide-icon name="arrow-right" [size]="12" class="text-gray-300 self-center"></lucide-icon>
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
                  <button (click)="toggleRule(rule)"
                    class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-body text-gray-600 hover:bg-gray-50">
                    {{ rule.status === 'active' ? 'Pause' : 'Resume' }}
                  </button>
                  <button (click)="deleteRule(rule.id)"
                    class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-body text-gray-600 hover:bg-gray-50">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          }
          @if (rules().length === 0) {
            <div class="bg-white rounded-card shadow-card p-8 text-center">
              <lucide-icon name="zap" [size]="40" class="text-gray-300 mx-auto mb-3"></lucide-icon>
              <p class="text-sm text-gray-400 font-body">No automation rules yet. Create one to get started.</p>
            </div>
          }
        }
      </div>

      <!-- Activity Log -->
      <div class="bg-white rounded-card shadow-card p-5">
        <h3 class="text-sm font-display text-navy mb-4 mt-0">Recent Activity</h3>
        @if (activityLoading()) {
          <div class="space-y-2">
            @for (i of [1,2,3]; track i) {
              <div class="flex items-center gap-3 p-2 animate-pulse">
                <div class="w-8 h-8 rounded-full bg-gray-100 shrink-0"></div>
                <div class="flex-1">
                  <div class="h-3 bg-gray-200 rounded w-3/4 mb-1"></div>
                  <div class="h-2 bg-gray-100 rounded w-20"></div>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="space-y-2">
            @for (log of activityLog(); track $index) {
              <div class="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                <span class="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                  [ngClass]="log.type === 'pause' ? 'bg-red-100' : log.type === 'budget' ? 'bg-amber-100' : 'bg-blue-100'">
                  @if (log.type === 'pause') { <lucide-icon name="pause" [size]="16"></lucide-icon> } @else if (log.type === 'budget') { <lucide-icon name="dollar-sign" [size]="16"></lucide-icon> } @else { <lucide-icon name="bell" [size]="16"></lucide-icon> }
                </span>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-body text-navy m-0">{{ log.message }}</p>
                  @if (log.context) {
                    <p class="text-[10px] text-gray-500 font-body m-0 mt-0.5">{{ log.context }}</p>
                  }
                  @if (log.suggestedAction) {
                    <p class="text-[10px] text-accent font-body font-semibold m-0 mt-0.5">{{ log.suggestedAction }}</p>
                  }
                  <span class="text-[10px] text-gray-400 font-body">{{ log.time }}</span>
                </div>
              </div>
            }
            @if (activityLog().length === 0) {
              <p class="text-xs text-gray-400 text-center py-4 font-body">No recent activity</p>
            }
          </div>
        }
      </div>
    </div>
  `
})
export default class AutomationsComponent {
  private adAccountService = inject(AdAccountService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);

  loading = signal(true);
  activityLoading = signal(true);
  saving = signal(false);
  showBuilder = signal(false);

  newRuleName = '';
  conditionMetric = '';
  conditionOperator = '';
  conditionValue = '';
  actionType = '';
  actionScope = '';
  selectedFreq = 'Every 6 hours';
  frequencies = ['Every hour', 'Every 6 hours', 'Every 12 hours', 'Daily'];

  rules = signal<AutomationRule[]>([]);
  activityLog = signal<ActivityLogEntry[]>([]);

  templates = [
    {
      name: 'Pause High CPA',
      description: 'Auto-pause ads where CPA exceeds 2x your target.',
      icon: 'pause',
      bgClass: 'bg-red-100',
      iconClass: 'text-red-600',
      conditionLabel: 'CPA > 2x target',
      actionLabel: 'Pause ad set',
      metric: 'cpa',
      operator: 'gt',
      value: '500',
      action: 'pause',
      scope: 'adset',
    },
    {
      name: 'Scale Winners',
      description: 'Increase budget for ads with ROAS above 3x.',
      icon: 'trending-up',
      bgClass: 'bg-green-100',
      iconClass: 'text-green-600',
      conditionLabel: 'ROAS > 3x',
      actionLabel: 'Increase budget 15%',
      metric: 'roas',
      operator: 'gt',
      value: '3',
      action: 'increase_budget',
      scope: 'adset',
    },
    {
      name: 'Fatigue Alert',
      description: 'Get notified when CTR drops below 0.5%.',
      icon: 'bell',
      bgClass: 'bg-amber-100',
      iconClass: 'text-amber-600',
      conditionLabel: 'CTR < 0.5%',
      actionLabel: 'Send notification',
      metric: 'ctr',
      operator: 'lt',
      value: '0.5',
      action: 'notify',
      scope: 'ad',
    },
    {
      name: 'Budget Guard',
      description: 'Cap daily spend and reduce budget if overspending.',
      icon: 'shield',
      bgClass: 'bg-blue-100',
      iconClass: 'text-blue-600',
      conditionLabel: 'Daily Spend > limit',
      actionLabel: 'Reduce budget 20%',
      metric: 'spend',
      operator: 'gt',
      value: '5000',
      action: 'reduce_budget',
      scope: 'campaign',
    },
    {
      name: 'Frequency Cap',
      description: 'Pause ads when frequency gets too high (ad fatigue).',
      icon: 'repeat',
      bgClass: 'bg-violet-100',
      iconClass: 'text-violet-600',
      conditionLabel: 'Frequency > 3',
      actionLabel: 'Pause ad set',
      metric: 'frequency',
      operator: 'gt',
      value: '3',
      action: 'pause',
      scope: 'adset',
    },
    {
      name: 'CPM Watchdog',
      description: 'Alert when CPM spikes above threshold.',
      icon: 'eye',
      bgClass: 'bg-pink-100',
      iconClass: 'text-pink-600',
      conditionLabel: 'CPM > threshold',
      actionLabel: 'Send notification',
      metric: 'cpm',
      operator: 'gt',
      value: '200',
      action: 'notify',
      scope: 'campaign',
    },
  ];

  activeCount = computed(() => this.rules().filter(r => r.status === 'active').length);
  totalTriggers = computed(() => this.rules().reduce((sum, r) => sum + r.triggerCount, 0));

  private accountEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    if (acc) {
      this.loadAutomations();
      this.loadActivity(acc.id);
    } else {
      this.loading.set(false);
      this.activityLoading.set(false);
    }
  }, { allowSignalWrites: true });

  private loadAutomations() {
    this.loading.set(true);
    this.api.get<any>(environment.AUTOMATIONS_LIST).subscribe({
      next: (res) => {
        if (res.success && res.automations) {
          this.rules.set(res.automations);
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Error', 'Failed to load automation rules. Please try again.');
      },
    });
  }

  private loadActivity(accountId: string) {
    this.activityLoading.set(true);
    setTimeout(() => { if (this.activityLoading()) this.activityLoading.set(false); }, 8000);
    this.api.get<any>(environment.AUTOMATIONS_ACTIVITY, {
      account_id: accountId,
    }).subscribe({
      next: (res) => {
        if (res.success && res.activity) {
          this.activityLog.set(res.activity);
        }
        this.activityLoading.set(false);
      },
      error: () => {
        this.activityLoading.set(false);
        this.toast.error('Error', 'Failed to load activity log. Please try again.');
      },
    });
  }

  createRule() {
    if (!this.newRuleName || !this.conditionMetric || !this.actionType) return;

    this.saving.set(true);
    const acc = this.adAccountService.currentAccount();

    this.api.post<any>(environment.AUTOMATIONS_CREATE, {
      name: this.newRuleName,
      trigger_type: this.conditionMetric,
      trigger_value: {
        operator: this.conditionOperator,
        value: this.conditionValue,
      },
      action_type: this.actionType,
      action_value: {
        scope: this.actionScope,
        frequency: this.selectedFreq,
      },
      account_id: acc?.id || null,
    }).subscribe({
      next: (res) => {
        if (res.success && res.automation) {
          this.rules.set([res.automation, ...this.rules()]);
          this.resetBuilder();
          this.toast.success('Rule Created', 'Automation rule is now active.');
        }
        this.saving.set(false);
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('Error', 'Failed to create rule. Please try again.');
      },
    });
  }

  toggleRule(rule: AutomationRule) {
    const newStatus = rule.status === 'active' ? false : true;

    this.api.put<any>(environment.AUTOMATIONS_UPDATE, {
      id: rule.id,
      is_active: newStatus,
    }).subscribe({
      next: (res) => {
        if (res.success && res.automation) {
          this.rules.set(
            this.rules().map(r => r.id === rule.id ? res.automation : r)
          );
          this.toast.success('Updated', `Rule ${newStatus ? 'activated' : 'paused'}.`);
        }
      },
      error: () => {
        this.toast.error('Error', 'Failed to update rule. Please try again.');
      },
    });
  }

  async deleteRule(id: string) {
    const ok = await this.confirmDialog.confirm({
      title: 'Delete Automation Rule?',
      message: 'This rule will be permanently removed and cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    this.api.delete<any>(`${environment.AUTOMATIONS_DELETE}?id=${id}`).subscribe({
      next: (res) => {
        if (res.success) {
          this.rules.set(this.rules().filter(r => r.id !== id));
          this.toast.success('Deleted', 'Automation rule removed.');
        }
      },
      error: () => {
        this.toast.error('Error', 'Failed to delete rule. Please try again.');
      },
    });
  }

  applyTemplate(tpl: typeof this.templates[0]) {
    this.newRuleName = tpl.name;
    this.conditionMetric = tpl.metric;
    this.conditionOperator = tpl.operator;
    this.conditionValue = tpl.value;
    this.actionType = tpl.action;
    this.actionScope = tpl.scope;
    this.showBuilder.set(true);
  }

  private resetBuilder() {
    this.showBuilder.set(false);
    this.newRuleName = '';
    this.conditionMetric = '';
    this.conditionOperator = '';
    this.conditionValue = '';
    this.actionType = '';
    this.actionScope = '';
    this.selectedFreq = 'Every 6 hours';
  }
}
