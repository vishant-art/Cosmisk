import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { DnaBadgeComponent } from '../../shared/components/dna-badge/dna-badge.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { ToastService } from '../../core/services/toast.service';
import { DEMO_CREATIVES } from '../../shared/data/demo-data';

@Component({
  selector: 'app-director-lab',
  standalone: true,
  imports: [CommonModule, FormsModule, DnaBadgeComponent, ModalComponent, LucideAngularModule],
  template: `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-page-title font-display text-navy m-0">Director Lab</h1>
      <span class="text-xs text-gray-400 font-mono">Briefs generated: 246</span>
    </div>

    <div class="grid lg:grid-cols-5 gap-6">
      <!-- LEFT PANEL: Brief Configuration (40%) -->
      <div class="lg:col-span-2">
        <div class="card sticky top-20">
          <h3 class="text-card-title font-display text-navy m-0 mb-5">Creative Brief Generator</h3>

          <!-- Base creative selector -->
          <div class="mb-4">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Base this brief on:</label>
            <select [(ngModel)]="baseCreativeId" class="input">
              <option value="">Select a creative...</option>
              @for (c of creatives; track c.id) {
                <option [value]="c.id">{{ c.name }} ({{ c.metrics.roas }}x ROAS)</option>
              }
            </select>
          </div>

          <!-- Winning patterns -->
          <div class="mb-4">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Or use winning patterns:</label>
            <div class="space-y-2 max-h-32 overflow-y-auto">
              @for (pattern of winningPatterns; track pattern.label) {
                <label class="flex items-center gap-2 text-sm font-body text-gray-600 cursor-pointer">
                  <input type="checkbox" [(ngModel)]="pattern.checked" class="rounded border-border text-accent">
                  <app-dna-badge [label]="pattern.label" [type]="pattern.type" />
                  <span class="text-[10px] text-gray-400 font-mono">{{ pattern.roas }}x avg</span>
                </label>
              }
            </div>
          </div>

          <!-- Output format -->
          <div class="mb-4">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Output format:</label>
            <div class="flex gap-2">
              @for (fmt of formats; track fmt) {
                <button
                  (click)="selectedFormat = fmt"
                  class="px-4 py-2 rounded-lg text-sm font-body font-medium border transition-all cursor-pointer"
                  [ngClass]="selectedFormat === fmt ? 'bg-accent text-white border-accent' : 'bg-white text-gray-600 border-border hover:border-gray-300'">
                  {{ fmt }}
                </button>
              }
            </div>
          </div>

          <!-- Target audience -->
          <div class="mb-4">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Target audience:</label>
            <input type="text" [(ngModel)]="targetAudience" class="input" placeholder="e.g. Women 25-45, health-conscious">
          </div>

          <!-- Product focus -->
          <div class="mb-4">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Product focus:</label>
            <input type="text" [(ngModel)]="productFocus" class="input" placeholder="e.g. Marine Collagen Powder">
          </div>

          <!-- Tone -->
          <div class="mb-5">
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Tone:</label>
            <div class="flex flex-wrap gap-1.5">
              @for (tone of tones; track tone.label) {
                <button
                  (click)="tone.selected = !tone.selected"
                  class="px-3 py-1 rounded-pill text-xs font-body font-medium transition-all border cursor-pointer"
                  [ngClass]="tone.selected ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-border hover:border-gray-300'">
                  {{ tone.label }}
                </button>
              }
            </div>
          </div>

          <!-- Generate button -->
          <button
            (click)="generateBrief()"
            class="btn-primary w-full !py-3"
            [disabled]="generating()">
            @if (generating()) {
              <span class="inline-flex items-center gap-2">
                <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Generating...
              </span>
            } @else {
              Generate Creative Brief
            }
          </button>
        </div>
      </div>

      <!-- RIGHT PANEL: Generated Output (60%) -->
      <div class="lg:col-span-3">
        <!-- Empty state -->
        @if (!briefGenerated() && !generating()) {
          <div class="card flex flex-col items-center justify-center py-20 text-center">
            <div class="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
              <lucide-icon name="file-text" [size]="48"></lucide-icon>
            </div>
            <h3 class="text-section-title font-display text-navy mb-2">No brief generated yet</h3>
            <p class="text-sm text-gray-500 font-body max-w-sm">Configure your brief on the left and click "Generate" to create AI-powered creative briefs based on your winning DNA patterns.</p>
          </div>
        }

        <!-- Loading state -->
        @if (generating()) {
          <div class="card flex flex-col items-center justify-center py-20 text-center">
            <div class="w-24 h-24 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="sparkles" [size]="48" class="pulse-dot"></lucide-icon>
            </div>
            <h3 class="text-section-title font-display text-navy mb-2">Generating your brief...</h3>
            <p class="text-sm text-gray-500 font-body mb-4">Analyzing DNA patterns and creating optimized concepts.</p>
            <div class="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-full bg-accent rounded-full transition-all duration-500" [style.width.%]="genProgress()"></div>
            </div>
          </div>
        }

        <!-- Generated brief -->
        @if (briefGenerated() && !generating()) {
          <div class="space-y-6">
            <!-- Brief card -->
            <div class="card">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <span class="text-[10px] font-mono text-gray-400 uppercase tracking-wider">Brief #CB-0247</span>
                  <h3 class="text-section-title font-display text-navy m-0 mt-0.5">{{ brief.conceptName }}</h3>
                </div>
                <div class="flex gap-1.5">
                  <app-dna-badge [label]="brief.hookDna" type="hook" />
                  <app-dna-badge [label]="brief.visualDna" type="visual" />
                </div>
              </div>

              <!-- Hook -->
              <div class="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-xs font-body font-bold text-dna-hook-text uppercase">Hook Script</span>
                  <app-dna-badge [label]="brief.hookDna" type="hook" />
                </div>
                <p class="text-sm font-body text-navy m-0 leading-relaxed italic">"{{ brief.hookScript }}"</p>
              </div>

              <!-- Visual Direction -->
              <div class="mb-4">
                <h4 class="text-xs font-body font-bold text-gray-500 uppercase tracking-wider mb-2">Visual Direction</h4>
                <div class="space-y-2">
                  @for (scene of brief.scenes; track scene.time) {
                    <div class="flex gap-3 p-3 bg-gray-50 rounded-lg">
                      <span class="text-[10px] font-mono text-gray-400 shrink-0 pt-0.5">{{ scene.time }}</span>
                      <p class="text-xs font-body text-gray-700 m-0">{{ scene.description }}</p>
                    </div>
                  }
                </div>
              </div>

              <!-- Audio Direction -->
              <div class="mb-4">
                <h4 class="text-xs font-body font-bold text-gray-500 uppercase tracking-wider mb-2">Audio Direction</h4>
                <div class="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p class="text-xs font-body text-gray-700 m-0">{{ brief.audioDirection }}</p>
                </div>
              </div>

              <!-- CTA -->
              <div>
                <h4 class="text-xs font-body font-bold text-gray-500 uppercase tracking-wider mb-2">Call-to-Action</h4>
                <div class="p-3 bg-accent/5 rounded-lg border border-accent/20">
                  <p class="text-sm font-body font-semibold text-accent m-0">"{{ brief.cta }}"</p>
                </div>
              </div>
            </div>

            <!-- Variation cards -->
            <div>
              <h3 class="text-card-title font-display text-navy mb-4">Generated Variations</h3>
              <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                @for (variation of variations; track variation.id) {
                  <div class="card !p-0 overflow-hidden">
                    <!-- Thumbnail placeholder -->
                    <div class="aspect-square flex items-center justify-center"
                      [ngClass]="variation.format === 'video' ? 'bg-blue-50' : 'bg-amber-50'">
                      <div class="text-center">
                        <span class="text-4xl block mb-2">@if (variation.format === 'video') { <lucide-icon name="video" [size]="32"></lucide-icon> } @else { <lucide-icon name="image" [size]="32"></lucide-icon> }</span>
                        <span class="text-[10px] font-mono text-gray-400 uppercase">{{ variation.format }} {{ variation.format === 'video' ? '15s' : '1080x1080' }}</span>
                      </div>
                    </div>
                    <div class="p-3">
                      <p class="text-xs font-body font-semibold text-navy m-0 mb-2 truncate">{{ variation.name }}</p>
                      <div class="flex items-center gap-2 mb-3">
                        <label class="flex items-center gap-1.5 text-xs font-body text-gray-500 cursor-pointer">
                          <input type="checkbox" [(ngModel)]="variation.approved" class="rounded border-border text-accent">
                          Approve
                        </label>
                      </div>
                      <div class="flex gap-1.5">
                        <button class="flex-1 py-1.5 text-[11px] font-body font-medium rounded-lg border border-border bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">Edit</button>
                        <button class="flex-1 py-1.5 text-[11px] font-body font-medium rounded-lg border border-border bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">Regen</button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Bottom actions -->
            <div class="card flex items-center justify-between">
              <div class="flex gap-2">
                <button class="btn-secondary !py-2 !px-4 !text-xs">Preview All</button>
                <button class="btn-secondary !py-2 !px-4 !text-xs" [disabled]="approvedCount() === 0">
                  Approve Selected ({{ approvedCount() }})
                </button>
              </div>
              <button (click)="publishModalOpen.set(true)" class="btn-primary !py-2 !px-5 !text-sm">
                Publish to Meta <lucide-icon name="arrow-right" [size]="14" class="inline-block"></lucide-icon>
              </button>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Publish to Meta Modal -->
    <app-modal [isOpen]="publishModalOpen()" title="Publish to Meta" (close)="publishModalOpen.set(false)" maxWidth="500px">
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-body font-medium text-navy mb-1">Ad Account</label>
          <select [(ngModel)]="publishAdAccount" class="input">
            <option value="acc-1">Nectar Supplements — Main</option>
            <option value="acc-2">Nectar Supplements — Retargeting</option>
            <option value="acc-3">Nectar Supplements — Testing</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-body font-medium text-navy mb-1">Campaign</label>
          <select [(ngModel)]="publishCampaign" class="input">
            <option value="camp-1">Collagen — Prospecting</option>
            <option value="camp-2">Collagen — Retargeting</option>
            <option value="camp-3">Summer Sale 2026</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-body font-medium text-navy mb-1">Ad Set</label>
          <select [(ngModel)]="publishAdSet" class="input">
            <option value="as-1">Women 25-45 — Interest</option>
            <option value="as-2">Women 25-45 — Lookalike</option>
            <option value="as-3">Broad — Auto</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-body font-medium text-navy mb-1">Daily Budget</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">&#8377;</span>
            <input type="text" [(ngModel)]="publishBudget" class="input !pl-8" placeholder="10,000">
          </div>
        </div>
        <div class="pt-2">
          <button (click)="publishToMeta()" class="btn-primary w-full !py-3" [disabled]="publishing()">
            @if (publishing()) {
              <span class="inline-flex items-center gap-2">
                <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Publishing...
              </span>
            } @else {
              Publish {{ approvedCount() }} Creative{{ approvedCount() > 1 ? 's' : '' }} to Meta
            }
          </button>
        </div>
      </div>
    </app-modal>
  `
})
export default class DirectorLabComponent {
  private toast = inject(ToastService);

  creatives = DEMO_CREATIVES;
  baseCreativeId = '';
  selectedFormat = 'Video';
  formats = ['Static', 'Video', 'Both'];
  targetAudience = 'Women 25-45, health-conscious, metro cities';
  productFocus = 'Marine Collagen Powder';

  winningPatterns = [
    { label: 'Shock Statement', type: 'hook' as const, roas: 4.8, checked: true },
    { label: 'Price Anchor', type: 'hook' as const, roas: 5.2, checked: true },
    { label: 'Curiosity', type: 'hook' as const, roas: 4.2, checked: false },
    { label: 'UGC Style', type: 'visual' as const, roas: 4.0, checked: true },
    { label: 'Macro Texture', type: 'visual' as const, roas: 4.8, checked: false },
    { label: 'Hindi VO', type: 'audio' as const, roas: 4.1, checked: true },
  ];

  tones = [
    { label: 'Urgent', selected: true },
    { label: 'Aspirational', selected: false },
    { label: 'Educational', selected: true },
    { label: 'Playful', selected: false },
    { label: 'Premium', selected: false },
    { label: 'Emotional', selected: false },
    { label: 'Bold', selected: true },
    { label: 'Conversational', selected: false },
  ];

  generating = signal(false);
  genProgress = signal(0);
  briefGenerated = signal(false);

  brief = {
    conceptName: 'Collagen Glow-Up v2 — Price Anchor',
    hookDna: 'Price Anchor',
    visualDna: 'UGC Style',
    hookScript: "Your skin loses 1% collagen every year after 25. For just ₹33/day, you can reverse it. Here's proof from 10,000+ women.",
    scenes: [
      { time: '0-3s', description: 'HOOK: Bold text overlay "₹33/day" on dark background, zoom into price with urgency animation' },
      { time: '3-8s', description: 'VISUAL: UGC-style testimonial — real woman showing before/after skin texture with warm lighting' },
      { time: '8-12s', description: 'PROOF: Split screen showing collagen powder dissolving in water + scientific diagram of collagen absorption' },
      { time: '12-15s', description: 'CTA: Product pack shot with "Shop Now — ₹999 for 30 Days" overlay, swipe-up arrow animation' },
    ],
    audioDirection: 'Female Hindi voiceover, conversational and confident tone. Background: upbeat lo-fi music that builds subtly. Sound effect: gentle "ding" on price reveal.',
    cta: 'Shop Now — ₹999 for 30 Days of Glow',
  };

  variations = [
    { id: 'v1', name: 'Price Anchor — UGC Style', format: 'static', approved: false },
    { id: 'v2', name: 'Price Anchor — Minimal', format: 'static', approved: false },
    { id: 'v3', name: 'Price Anchor — Text-Heavy', format: 'static', approved: false },
    { id: 'v4', name: 'Price Anchor — Hindi VO', format: 'video', approved: false },
    { id: 'v5', name: 'Price Anchor — ASMR', format: 'video', approved: false },
  ];

  publishModalOpen = signal(false);
  publishing = signal(false);
  publishAdAccount = 'acc-1';
  publishCampaign = 'camp-1';
  publishAdSet = 'as-1';
  publishBudget = '10,000';

  approvedCount = signal(0);

  generateBrief() {
    this.generating.set(true);
    this.briefGenerated.set(false);
    this.genProgress.set(0);

    const interval = setInterval(() => {
      this.genProgress.update(v => Math.min(v + Math.random() * 15 + 5, 95));
    }, 300);

    setTimeout(() => {
      clearInterval(interval);
      this.genProgress.set(100);
      setTimeout(() => {
        this.generating.set(false);
        this.briefGenerated.set(true);
        this.variations.forEach(v => v.approved = false);
        this.updateApprovedCount();
      }, 300);
    }, 3000);
  }

  updateApprovedCount() {
    this.approvedCount.set(this.variations.filter(v => v.approved).length);
  }

  publishToMeta() {
    this.updateApprovedCount();
    this.publishing.set(true);
    setTimeout(() => {
      this.publishing.set(false);
      this.publishModalOpen.set(false);
      this.toast.success('Published to Meta!', `${this.approvedCount()} creatives are now live.`);
    }, 2000);
  }
}
