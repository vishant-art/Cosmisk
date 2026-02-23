const _BUILD_VER = '2026-02-13-v2';
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

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
        <button class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
          + New Campaign
        </button>
      </div>

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
              <p class="text-xs font-body text-accent m-0">
                <strong>AI Suggestion:</strong> Based on your top creatives, "Conversions" with CBO will deliver optimal results. Recommended budget: ₹45,000/day.
              </p>
            </div>
          </div>

          <div class="flex justify-end mt-6">
            <button
              [disabled]="!campaignName || !objective"
              (click)="activeStep.set(2)"
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
              <input value="India" disabled class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body bg-gray-50" />
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Age Range</label>
              <div class="flex gap-2 items-center">
                <input value="25" type="number" class="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm font-body" />
                <span class="text-xs text-gray-400">to</span>
                <input value="45" type="number" class="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm font-body" />
              </div>
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Gender</label>
              <select class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body">
                <option>All</option>
                <option>Female</option>
                <option>Male</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Audience Type</label>
              <select class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body">
                <option>Lookalike — Purchasers 1%</option>
                <option>Interest — Health & Wellness</option>
                <option>Custom — Website Visitors</option>
                <option>Broad — Open Targeting</option>
              </select>
            </div>
          </div>
          <div class="flex justify-between mt-6">
            <button (click)="activeStep.set(1)" class="px-4 py-2 text-gray-500 text-sm font-body"><lucide-icon name="arrow-left" [size]="14" class="inline-block"></lucide-icon> Back</button>
            <button (click)="activeStep.set(3)" class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold">Continue to Creatives <lucide-icon name="arrow-right" [size]="14" class="inline-block"></lucide-icon></button>
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
                [ngClass]="i <= 3 ? 'border-accent bg-accent/5' : 'border-gray-200'">
                <div class="aspect-square bg-gray-100 rounded mb-2 flex items-center justify-center"><lucide-icon name="clapperboard" [size]="24"></lucide-icon></div>
                <p class="text-xs font-body font-semibold text-navy m-0 truncate">Creative {{ i }}</p>
                <p class="text-[10px] text-gray-400 font-body m-0">@if (i <= 3) { <lucide-icon name="check" [size]="10" class="text-green-500 inline-block"></lucide-icon> Selected } @else { Click to select }</p>
              </div>
            }
          </div>
          <div class="flex justify-between mt-6">
            <button (click)="activeStep.set(2)" class="px-4 py-2 text-gray-500 text-sm font-body"><lucide-icon name="arrow-left" [size]="14" class="inline-block"></lucide-icon> Back</button>
            <button (click)="activeStep.set(4)" class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold">Review Campaign <lucide-icon name="arrow-right" [size]="14" class="inline-block"></lucide-icon></button>
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
              <span class="text-xs font-body font-semibold text-navy">{{ objective || 'Conversions' }}</span>
            </div>
            <div class="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span class="text-xs text-gray-500 font-body">Budget</span>
              <span class="text-xs font-body font-semibold text-navy">₹{{ budget || 50000 }}/day</span>
            </div>
            <div class="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span class="text-xs text-gray-500 font-body">Creatives</span>
              <span class="text-xs font-body font-semibold text-navy">3 selected</span>
            </div>
          </div>
          <div class="flex justify-between mt-6">
            <button (click)="activeStep.set(3)" class="px-4 py-2 text-gray-500 text-sm font-body"><lucide-icon name="arrow-left" [size]="14" class="inline-block"></lucide-icon> Back</button>
            <button class="px-6 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90">
              Launch Campaign
            </button>
          </div>
        </div>
      }
    </div>
  `
})
export default class CampaignsComponent {
  activeStep = signal(1);
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
}
