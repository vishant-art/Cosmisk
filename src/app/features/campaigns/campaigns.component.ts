const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { ToastService } from '../../core/services/toast.service';
import { environment } from '../../../environments/environment';

interface Campaign {
  id: string;
  account_id: string | null;
  name: string;
  objective: string | null;
  budget: string | null;
  schedule_start: string | null;
  schedule_end: string | null;
  audience: any;
  placements: string | null;
  creative_ids: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Campaign Builder</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Create and manage Meta ad campaigns</p>
        </div>
        <button (click)="startNewCampaign()" class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
          + New Campaign
        </button>
      </div>

      <!-- Existing Campaigns List -->
      @if (!showBuilder()) {
        @if (loadingCampaigns()) {
          <div class="bg-white rounded-card shadow-card p-6">
            <div class="space-y-3">
              @for (i of [1,2,3]; track i) {
                <div class="animate-pulse flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div class="h-4 bg-gray-200 rounded w-48 mb-2"></div>
                    <div class="h-3 bg-gray-200 rounded w-32"></div>
                  </div>
                  <div class="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              }
            </div>
          </div>
        } @else if (campaigns().length > 0) {
          <div class="bg-white rounded-card shadow-card overflow-hidden">
            <div class="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 class="text-sm font-display text-navy m-0">Your Campaigns</h3>
              <span class="text-xs text-gray-400 font-body">{{ campaigns().length }} campaigns</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs font-body">
                <thead>
                  <tr class="bg-gray-50 text-gray-500">
                    <th class="px-4 py-3 text-left font-semibold">Name</th>
                    <th class="px-4 py-3 text-left font-semibold">Objective</th>
                    <th class="px-4 py-3 text-left font-semibold">Budget</th>
                    <th class="px-4 py-3 text-left font-semibold">Status</th>
                    <th class="px-4 py-3 text-left font-semibold">Updated</th>
                    <th class="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of campaigns(); track c.id) {
                    <tr class="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                      <td class="px-4 py-3 font-medium text-navy">{{ c.name }}</td>
                      <td class="px-4 py-3 text-gray-600 capitalize">{{ c.objective || '—' }}</td>
                      <td class="px-4 py-3 text-gray-600">{{ c.budget ? '₹' + c.budget + '/day' : '—' }}</td>
                      <td class="px-4 py-3">
                        <span class="px-2 py-0.5 rounded-pill text-[10px] font-semibold"
                          [ngClass]="{
                            'bg-green-50 text-green-700': c.status === 'launched',
                            'bg-yellow-50 text-yellow-700': c.status === 'draft',
                            'bg-blue-50 text-blue-700': c.status === 'review'
                          }">
                          {{ c.status }}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-gray-500">{{ c.updated_at | date:'MMM d, y' }}</td>
                      <td class="px-4 py-3 text-right">
                        <button (click)="editCampaign(c)" class="text-accent hover:underline font-semibold mr-3">Edit</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        } @else {
          <div class="bg-white rounded-card shadow-card p-12 text-center">
            <lucide-icon name="megaphone" [size]="32" class="text-gray-300 mx-auto mb-3"></lucide-icon>
            <p class="text-sm text-gray-500 font-body mb-1">No campaigns yet</p>
            <p class="text-xs text-gray-400 font-body">Click "+ New Campaign" to create your first campaign</p>
          </div>
        }
      }

      <!-- Campaign Builder Wizard -->
      @if (showBuilder()) {
        <!-- Step Indicator -->
        <div class="bg-white rounded-card shadow-card p-5">
          <div class="flex items-center">
            @for (s of steps; track s.num) {
              <div class="flex-1 flex items-center">
                <div class="flex items-center gap-2">
                  <span class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-body font-bold"
                    [ngClass]="{
                      'bg-accent text-white': activeStep() === s.num,
                      'bg-green-500 text-white': activeStep() > s.num,
                      'bg-gray-200 text-gray-400': activeStep() < s.num
                    }">
                    @if (activeStep() > s.num) { <lucide-icon name="check" [size]="14"></lucide-icon> } @else { {{ s.num }} }
                  </span>
                  <span class="text-sm font-body whitespace-nowrap"
                    [ngClass]="activeStep() === s.num ? 'text-navy font-semibold' : activeStep() > s.num ? 'text-green-600' : 'text-gray-400'">
                    {{ s.label }}
                  </span>
                </div>
                @if (s.num < 4) {
                  <div class="flex-1 h-0.5 mx-3"
                    [ngClass]="activeStep() > s.num ? 'bg-green-500' : 'bg-gray-200'"></div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Step 1: Campaign Setup -->
        @if (activeStep() === 1) {
          <div class="bg-white rounded-card shadow-card p-6">
            <h3 class="text-base font-display text-navy mb-4 mt-0">Campaign Setup</h3>
            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Campaign Name</label>
                <input [(ngModel)]="campaignName" placeholder="e.g., Collagen Range — March"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Objective</label>
                <select [(ngModel)]="objective" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                  <option value="">Select objective...</option>
                  <option value="conversions">Conversions</option>
                  <option value="traffic">Traffic</option>
                  <option value="awareness">Brand Awareness</option>
                  <option value="reach">Reach</option>
                  <option value="engagement">Engagement</option>
                  <option value="catalog">Catalog Sales</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Daily Budget</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
                  <input [(ngModel)]="budget" type="number" placeholder="50000"
                    class="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
                </div>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Campaign Type</label>
                <select [(ngModel)]="campaignType" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                  <option value="standard">Standard</option>
                  <option value="ab_test">A/B Test</option>
                  <option value="cbo">Campaign Budget Optimization</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Start Date</label>
                <input [(ngModel)]="startDate" type="date"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">End Date (optional)</label>
                <input [(ngModel)]="endDate" type="date"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
              </div>
            </div>

            <div class="mt-4 p-3 bg-accent/5 rounded-lg">
              <div class="flex items-start gap-2">
                <lucide-icon name="lightbulb" [size]="14" class="text-yellow-500 mt-0.5 shrink-0"></lucide-icon>
                @if (aiSuggestionLoading()) {
                  <p class="text-xs font-body text-gray-400 m-0 animate-pulse">Loading AI suggestion...</p>
                } @else {
                  <p class="text-xs font-body text-accent m-0">
                    <strong>AI Suggestion:</strong> {{ aiSuggestion() }}
                  </p>
                }
              </div>
            </div>

            <div class="flex justify-between mt-6">
              <button (click)="cancelBuilder()" class="px-4 py-2 text-gray-500 text-sm font-body">Cancel</button>
              <button
                [disabled]="!campaignName || !objective"
                (click)="goToStep(2)"
                class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed">
                Continue to Audience <lucide-icon name="arrow-right" [size]="14" class="inline-block"></lucide-icon>
              </button>
            </div>
          </div>
        }

        <!-- Locked Steps -->
        @if (activeStep() < 2) {
          @for (s of [steps[1], steps[2], steps[3]]; track s.num) {
            <div class="bg-white rounded-card shadow-card p-6 opacity-50">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-400"><lucide-icon name="lock" [size]="16"></lucide-icon></span>
                <div>
                  <h3 class="text-sm font-body font-semibold text-gray-400 m-0">Step {{ s.num }}: {{ s.label }}</h3>
                  <p class="text-xs text-gray-400 font-body m-0 mt-0.5">Complete Step 1 first</p>
                </div>
              </div>
            </div>
          }
        }

        @if (activeStep() === 2) {
          <div class="bg-white rounded-card shadow-card p-6">
            <h3 class="text-base font-display text-navy mb-4 mt-0">Audience Targeting</h3>
            <div class="grid md:grid-cols-2 gap-4">
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Location</label>
                <input [(ngModel)]="audienceLocation" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Age Range</label>
                <div class="flex gap-2 items-center">
                  <input [(ngModel)]="audienceAgeMin" type="number" class="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm font-body" />
                  <span class="text-xs text-gray-400">to</span>
                  <input [(ngModel)]="audienceAgeMax" type="number" class="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm font-body" />
                </div>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Gender</label>
                <select [(ngModel)]="audienceGender" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body">
                  <option>All</option>
                  <option>Female</option>
                  <option>Male</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Audience Type</label>
                <select [(ngModel)]="audienceType" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body">
                  <option>Lookalike — Purchasers 1%</option>
                  <option>Interest — Health & Wellness</option>
                  <option>Custom — Website Visitors</option>
                  <option>Broad — Open Targeting</option>
                </select>
              </div>
            </div>
            <div class="flex justify-between mt-6">
              <button (click)="activeStep.set(1)" class="px-4 py-2 text-gray-500 text-sm font-body"><lucide-icon name="arrow-left" [size]="14" class="inline-block"></lucide-icon> Back</button>
              <button (click)="goToStep(3)" class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold">Continue to Creatives <lucide-icon name="arrow-right" [size]="14" class="inline-block"></lucide-icon></button>
            </div>
          </div>
        }

        @if (activeStep() === 3) {
          <div class="bg-white rounded-card shadow-card p-6">
            <h3 class="text-base font-display text-navy mb-4 mt-0">Select Creatives</h3>
            <p class="text-xs text-gray-500 font-body mb-4">Choose from your winning creatives or create new ones</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              @for (i of [1,2,3,4,5,6]; track i) {
                <div class="border-2 rounded-lg p-3 cursor-pointer hover:border-accent transition-colors"
                  (click)="toggleCreative(i)"
                  [ngClass]="selectedCreatives().includes(i) ? 'border-accent bg-accent/5' : 'border-gray-200'">
                  <div class="aspect-square bg-gray-100 rounded mb-2 flex items-center justify-center"><lucide-icon name="clapperboard" [size]="24"></lucide-icon></div>
                  <p class="text-xs font-body font-semibold text-navy m-0 truncate">Creative {{ i }}</p>
                  <p class="text-[10px] text-gray-400 font-body m-0">@if (selectedCreatives().includes(i)) { <lucide-icon name="check" [size]="10" class="text-green-500 inline-block"></lucide-icon> Selected } @else { Click to select }</p>
                </div>
              }
            </div>
            <div class="flex justify-between mt-6">
              <button (click)="activeStep.set(2)" class="px-4 py-2 text-gray-500 text-sm font-body"><lucide-icon name="arrow-left" [size]="14" class="inline-block"></lucide-icon> Back</button>
              <button (click)="goToStep(4)" class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold">Review Campaign <lucide-icon name="arrow-right" [size]="14" class="inline-block"></lucide-icon></button>
            </div>
          </div>
        }

        @if (activeStep() === 4) {
          <div class="bg-white rounded-card shadow-card p-6">
            <h3 class="text-base font-display text-navy mb-4 mt-0">Review & Launch</h3>
            <div class="space-y-3">
              <div class="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body">Campaign Name</span>
                <span class="text-xs font-body font-semibold text-navy">{{ campaignName || 'Untitled Campaign' }}</span>
              </div>
              <div class="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body">Objective</span>
                <span class="text-xs font-body font-semibold text-navy capitalize">{{ objective || 'Conversions' }}</span>
              </div>
              <div class="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body">Budget</span>
                <span class="text-xs font-body font-semibold text-navy">₹{{ budget || 50000 }}/day</span>
              </div>
              <div class="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body">Audience</span>
                <span class="text-xs font-body font-semibold text-navy">{{ audienceType }} · {{ audienceLocation }}</span>
              </div>
              <div class="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span class="text-xs text-gray-500 font-body">Creatives</span>
                <span class="text-xs font-body font-semibold text-navy">{{ selectedCreatives().length }} selected</span>
              </div>
              @if (startDate) {
                <div class="flex justify-between p-3 bg-gray-50 rounded-lg">
                  <span class="text-xs text-gray-500 font-body">Schedule</span>
                  <span class="text-xs font-body font-semibold text-navy">{{ startDate }}{{ endDate ? ' — ' + endDate : ' (ongoing)' }}</span>
                </div>
              }
            </div>
            <div class="flex justify-between mt-6">
              <button (click)="activeStep.set(3)" class="px-4 py-2 text-gray-500 text-sm font-body"><lucide-icon name="arrow-left" [size]="14" class="inline-block"></lucide-icon> Back</button>
              <button
                (click)="launchCampaign()"
                [disabled]="launching()"
                class="px-6 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 disabled:opacity-40">
                @if (launching()) {
                  <span class="inline-flex items-center gap-1.5">
                    <span class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Launching...
                  </span>
                } @else {
                  Launch Campaign
                }
              </button>
            </div>
          </div>
        }
      }
    </div>
  `
})
export default class CampaignsComponent implements OnInit {
  private api = inject(ApiService);
  private adAccountService = inject(AdAccountService);
  private toast = inject(ToastService);

  activeStep = signal(1);
  showBuilder = signal(false);
  loadingCampaigns = signal(true);
  launching = signal(false);
  aiSuggestionLoading = signal(false);
  aiSuggestion = signal('Loading suggestion...');
  campaigns = signal<Campaign[]>([]);
  selectedCreatives = signal<number[]>([1, 2, 3]);
  currentCampaignId = signal<string | null>(null);

  steps = [
    { num: 1, label: 'Campaign Setup' },
    { num: 2, label: 'Audience' },
    { num: 3, label: 'Creatives' },
    { num: 4, label: 'Review & Launch' },
  ];

  campaignName = '';
  objective = '';
  budget: number | null = null;
  campaignType = 'standard';
  startDate = '';
  endDate = '';

  // Audience fields
  audienceLocation = 'India';
  audienceAgeMin = 25;
  audienceAgeMax = 45;
  audienceGender = 'All';
  audienceType = 'Lookalike — Purchasers 1%';

  ngOnInit() {
    this.loadCampaigns();
    this.fetchSuggestion();
  }

  private loadCampaigns() {
    this.loadingCampaigns.set(true);
    const acc = this.adAccountService.currentAccount();
    const params: Record<string, string> = {};
    if (acc) params['account_id'] = acc.id;

    this.api.get<any>(environment.CAMPAIGNS_LIST, params).subscribe({
      next: (res) => {
        if (res.success && res.campaigns) {
          this.campaigns.set(res.campaigns);
        }
        this.loadingCampaigns.set(false);
      },
      error: () => {
        this.loadingCampaigns.set(false);
      },
    });
  }

  startNewCampaign() {
    this.resetForm();
    this.currentCampaignId.set(null);
    this.showBuilder.set(true);
    this.activeStep.set(1);
  }

  cancelBuilder() {
    this.showBuilder.set(false);
    this.resetForm();
  }

  editCampaign(c: Campaign) {
    this.currentCampaignId.set(c.id);
    this.campaignName = c.name;
    this.objective = c.objective || '';
    this.budget = c.budget ? parseFloat(c.budget) : null;
    this.startDate = c.schedule_start || '';
    this.endDate = c.schedule_end || '';
    if (c.audience) {
      this.audienceLocation = c.audience.location || 'India';
      this.audienceAgeMin = c.audience.age_min || 25;
      this.audienceAgeMax = c.audience.age_max || 45;
      this.audienceGender = c.audience.gender || 'All';
      this.audienceType = c.audience.type || 'Lookalike — Purchasers 1%';
    }
    if (c.creative_ids?.length) {
      this.selectedCreatives.set(c.creative_ids.map(Number).filter(n => !isNaN(n)));
    }
    this.showBuilder.set(true);
    this.activeStep.set(1);
  }

  goToStep(step: number) {
    this.saveDraft(() => {
      this.activeStep.set(step);
      if (step === 1) {
        this.fetchAiSuggestion();
      }
    });
  }

  toggleCreative(id: number) {
    const current = this.selectedCreatives();
    if (current.includes(id)) {
      this.selectedCreatives.set(current.filter(c => c !== id));
    } else {
      this.selectedCreatives.set([...current, id]);
    }
  }

  private saveDraft(onDone?: () => void) {
    const acc = this.adAccountService.currentAccount();
    const payload: any = {
      name: this.campaignName || 'Untitled Campaign',
      objective: this.objective,
      budget: this.budget ? String(this.budget) : null,
      schedule_start: this.startDate || null,
      schedule_end: this.endDate || null,
      audience: {
        location: this.audienceLocation,
        age_min: this.audienceAgeMin,
        age_max: this.audienceAgeMax,
        gender: this.audienceGender,
        type: this.audienceType,
      },
      creative_ids: this.selectedCreatives().map(String),
      account_id: acc?.id || null,
      status: 'draft',
    };

    if (this.currentCampaignId()) {
      payload.campaign_id = this.currentCampaignId();
      this.api.post<any>(environment.CAMPAIGNS_UPDATE, payload).subscribe({
        next: () => { onDone?.(); },
        error: () => { onDone?.(); },
      });
    } else {
      this.api.post<any>(environment.CAMPAIGNS_CREATE, payload).subscribe({
        next: (res) => {
          if (res.success && res.campaign_id) {
            this.currentCampaignId.set(res.campaign_id);
          }
          onDone?.();
        },
        error: () => { onDone?.(); },
      });
    }
  }

  launchCampaign() {
    if (!this.currentCampaignId()) {
      // Save first, then launch
      this.saveDraft(() => this.doLaunch());
      return;
    }
    this.doLaunch();
  }

  private doLaunch() {
    const campaignId = this.currentCampaignId();
    if (!campaignId) {
      this.toast.error('Error', 'Could not save campaign before launching');
      return;
    }

    this.launching.set(true);
    this.api.post<any>(environment.CAMPAIGNS_LAUNCH, { campaign_id: campaignId }).subscribe({
      next: (res) => {
        this.launching.set(false);
        if (res.success) {
          this.toast.success('Campaign Launched', res.message || 'Your campaign has been marked as launched');
          this.showBuilder.set(false);
          this.resetForm();
          this.loadCampaigns();
        }
      },
      error: (err) => {
        this.launching.set(false);
        this.toast.error('Launch Failed', err?.error?.error || 'Could not create campaign on Meta. Check your ad account permissions.');
      },
    });
  }

  private fetchSuggestion() {
    const acc = this.adAccountService.currentAccount();
    if (!acc) {
      this.aiSuggestion.set('Select an ad account to get a data-driven campaign recommendation.');
      return;
    }

    this.aiSuggestionLoading.set(true);
    this.api.get<any>(environment.CAMPAIGNS_SUGGEST, { account_id: acc.id }).subscribe({
      next: (res) => {
        if (res.suggestion) {
          this.aiSuggestion.set(res.suggestion);
        }
        if (res.recommended) {
          // Pre-fill form with data-driven defaults
          if (!this.objective && res.recommended.objective) this.objective = res.recommended.objective;
          if (!this.budget && res.recommended.budget) this.budget = res.recommended.budget;
          if (res.recommended.campaign_type === 'cbo') this.campaignType = 'cbo';
        }
        this.aiSuggestionLoading.set(false);
      },
      error: () => {
        this.aiSuggestionLoading.set(false);
      },
    });
  }

  private fetchAiSuggestion() {
    // Refresh suggestion when campaign settings change
    this.fetchSuggestion();
  }

  private resetForm() {
    this.campaignName = '';
    this.objective = '';
    this.budget = null;
    this.campaignType = 'standard';
    this.startDate = '';
    this.endDate = '';
    this.audienceLocation = 'India';
    this.audienceAgeMin = 25;
    this.audienceAgeMax = 45;
    this.audienceGender = 'All';
    this.audienceType = 'Lookalike — Purchasers 1%';
    this.selectedCreatives.set([1, 2, 3]);
    this.currentCampaignId.set(null);
    this.activeStep.set(1);
    this.aiSuggestion.set('Loading suggestion...');
    this.fetchSuggestion();
  }
}
