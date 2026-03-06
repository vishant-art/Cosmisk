const _BUILD_VER = '2026-03-03-v1';
import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { UgcService, UgcProjectSummary } from '../../core/services/ugc.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-ugc-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, LoadingSpinnerComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Creative Studio</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Generate AI-powered ad creatives for any format</p>
        </div>
      </div>

      <!-- Format Selector Cards -->
      @if (!wizardOpen()) {
        <div class="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          @for (format of creativeFormats; track format.id) {
            <button
              (click)="startGeneration(format.id)"
              class="card card-lift glow-on-hover !p-5 text-left border-2 border-transparent cursor-pointer bg-white group"
              [ngClass]="{'!border-accent ring-2 ring-accent/10': selectedFormat() === format.id}">
              <div class="flex items-start gap-4">
                <div class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" [ngClass]="format.bgClass">
                  <lucide-icon [name]="format.icon" [size]="24" [class]="format.iconClass"></lucide-icon>
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="text-sm font-display text-navy m-0 mb-1">{{ format.title }}</h3>
                  <p class="text-xs text-gray-500 font-body m-0 leading-relaxed">{{ format.description }}</p>
                  @if (format.badge) {
                    <span class="inline-block mt-2 px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-body font-semibold rounded-pill">{{ format.badge }}</span>
                  }
                </div>
              </div>
            </button>
          }
        </div>

        <!-- Quick Generate Section -->
        <div class="card !p-6">
          <div class="flex items-center gap-3 mb-4">
            <lucide-icon name="zap" [size]="20" class="text-amber-500"></lucide-icon>
            <h3 class="text-sm font-display text-navy m-0">Quick Generate</h3>
            <span class="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-body font-semibold rounded-pill">Instant</span>
          </div>
          <div class="flex gap-3">
            <input
              [(ngModel)]="quickUrl"
              placeholder="Paste your product or website URL..."
              class="input flex-1"
              (keydown.enter)="quickGenerate()" />
            <button
              (click)="quickGenerate()"
              [disabled]="!quickUrl"
              class="px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-body font-semibold hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2 whitespace-nowrap">
              <lucide-icon name="sparkles" [size]="16"></lucide-icon>
              Generate Scripts
            </button>
          </div>
          <p class="text-xs text-gray-400 font-body mt-2 m-0">We'll analyze your product page and generate 6 ad scripts optimized for conversions</p>
        </div>
      }

      <!-- Generation Brief Builder (when format selected) -->
      @if (wizardOpen()) {
        <div class="bg-white rounded-card shadow-card overflow-hidden">
          <!-- Step indicator -->
          <div class="flex border-b border-gray-100">
            @for (s of wizardSteps; track s.num) {
              <div
                class="flex-1 px-4 py-3 flex items-center gap-2 text-sm font-body transition-colors"
                [ngClass]="{
                  'bg-accent/5 text-accent font-semibold border-b-2 border-accent': wizardStep() === s.num,
                  'text-gray-400': wizardStep() !== s.num && wizardStep() < s.num,
                  'text-green-600': wizardStep() > s.num
                }">
                @if (wizardStep() > s.num) {
                  <span class="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs"><lucide-icon name="check" [size]="12"></lucide-icon></span>
                } @else {
                  <span class="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                    [ngClass]="wizardStep() === s.num ? 'bg-accent text-white' : 'bg-gray-200 text-gray-500'">{{ s.num }}</span>
                }
                {{ s.label }}
              </div>
            }
          </div>

          <!-- Step 1: Brand & Product -->
          @if (wizardStep() === 1) {
            <div class="p-6 space-y-4 animate-fade-in">
              <div class="flex items-center gap-3 mb-2">
                <div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                  <lucide-icon name="building-2" [size]="16" class="text-accent"></lucide-icon>
                </div>
                <div>
                  <h3 class="text-base font-display text-navy m-0">About Your Brand</h3>
                  <p class="text-xs text-gray-500 font-body m-0">We'll extract your brand voice and style automatically</p>
                </div>
              </div>

              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Brand Name *</label>
                  <input [(ngModel)]="brief.brand_name" placeholder="e.g., Wheelwash" class="input" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Website URL</label>
                  <input [(ngModel)]="brief.website_url" placeholder="https://yoursite.com" class="input" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Your Name *</label>
                  <input [(ngModel)]="brief.client_name" placeholder="e.g., Chirag Sharma" class="input" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Email *</label>
                  <input [(ngModel)]="brief.client_email" type="email" placeholder="you@company.com" class="input" />
                </div>
              </div>

              <div class="flex justify-between mt-6">
                <button (click)="cancelWizard()" class="px-4 py-2 text-gray-500 text-sm font-body hover:text-gray-700">
                  Cancel
                </button>
                <button
                  [disabled]="!brief.brand_name || !brief.client_name || !brief.client_email"
                  (click)="wizardStep.set(2)"
                  class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Next Step
                </button>
              </div>
            </div>
          }

          <!-- Step 2: Creative Brief -->
          @if (wizardStep() === 2) {
            <div class="p-6 space-y-4 animate-fade-in">
              <div class="flex items-center gap-3 mb-2">
                <div class="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <lucide-icon name="target" [size]="16" class="text-violet-600"></lucide-icon>
                </div>
                <div>
                  <h3 class="text-base font-display text-navy m-0">Creative Brief</h3>
                  <p class="text-xs text-gray-500 font-body m-0">Tell us what to generate</p>
                </div>
              </div>

              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">What are you promoting? *</label>
                <textarea [(ngModel)]="brief.product_feature" rows="3" placeholder="Describe the product, service, or offer you want ads for..." class="input resize-none"></textarea>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Who is your ideal customer? *</label>
                <textarea [(ngModel)]="brief.target_user" rows="3" placeholder="Age, interests, pain points, what motivates them..." class="input resize-none"></textarea>
              </div>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">How many scripts?</label>
                  <input [(ngModel)]="brief.num_scripts" type="number" min="1" max="20" placeholder="6" class="input" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Competitors (optional)</label>
                  <input [(ngModel)]="brief.competitors" placeholder="e.g., Brand A, Brand B" class="input" />
                </div>
              </div>

              <div class="flex justify-between mt-6">
                <button (click)="wizardStep.set(1)" class="px-4 py-2 text-gray-500 text-sm font-body hover:text-gray-700">
                  Back
                </button>
                <button
                  [disabled]="!brief.product_feature || !brief.target_user"
                  (click)="wizardStep.set(3)"
                  class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Next Step
                </button>
              </div>
            </div>
          }

          <!-- Step 3: Generate -->
          @if (wizardStep() === 3) {
            <div class="p-6 space-y-4 animate-fade-in">
              <div class="flex items-center gap-3 mb-2">
                <div class="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <lucide-icon name="sparkles" [size]="16" class="text-emerald-600"></lucide-icon>
                </div>
                <div>
                  <h3 class="text-base font-display text-navy m-0">Ready to Generate</h3>
                  <p class="text-xs text-gray-500 font-body m-0">Review and launch your AI creative engine</p>
                </div>
              </div>

              <div class="bg-gradient-to-br from-gray-50 to-accent/5 rounded-xl p-5 space-y-3 text-sm font-body">
                <div class="flex justify-between"><span class="text-gray-500">Brand</span><span class="text-navy font-semibold">{{ brief.brand_name }}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Format</span>
                  <span class="text-navy font-semibold">{{ getFormatLabel(selectedFormat()) }}</span>
                </div>
                <div class="flex justify-between"><span class="text-gray-500">Scripts to generate</span><span class="text-navy font-semibold">{{ brief.num_scripts }}</span></div>
                <div class="border-t border-gray-200/60 pt-3">
                  <span class="text-gray-500 block mb-1">Product</span>
                  <span class="text-navy">{{ brief.product_feature }}</span>
                </div>
                <div>
                  <span class="text-gray-500 block mb-1">Target Audience</span>
                  <span class="text-navy">{{ brief.target_user }}</span>
                </div>
              </div>

              <div class="bg-accent/5 border border-accent/20 rounded-xl p-4 flex items-start gap-3">
                <lucide-icon name="brain" [size]="20" class="text-accent mt-0.5 shrink-0"></lucide-icon>
                <div>
                  <p class="text-sm font-body font-semibold text-navy m-0 mb-1">Cosmisk Intelligence Active</p>
                  <p class="text-xs text-gray-500 font-body m-0">Your scripts will be powered by performance learnings from thousands of ad creatives. Brand voice DNA will be auto-extracted.</p>
                </div>
              </div>

              <div class="flex justify-between mt-6">
                <button (click)="wizardStep.set(2)" class="px-4 py-2 text-gray-500 text-sm font-body hover:text-gray-700">
                  Back
                </button>
                <button
                  (click)="submitGeneration()"
                  [disabled]="submitting()"
                  class="px-6 py-2.5 bg-accent text-white rounded-xl text-sm font-body font-bold hover:bg-accent/90 transition-all disabled:opacity-40 inline-flex items-center gap-2">
                  @if (submitting()) {
                    <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Generating...
                  } @else {
                    <lucide-icon name="sparkles" [size]="16"></lucide-icon>
                    Generate Creatives
                  }
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Recent Generations / Your Creations -->
      @if (!wizardOpen()) {
        <div class="card">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 class="text-sm font-display text-navy m-0">Your Creations</h3>
            <div class="flex items-center gap-3">
              <a routerLink="/app/creative-engine" class="text-xs text-accent font-body font-semibold hover:underline no-underline flex items-center gap-1">
                <lucide-icon name="rocket" [size]="12"></lucide-icon>
                Batch Generate in Engine
              </a>
              <span class="text-xs text-gray-400 font-body">{{ projects().length }} batches</span>
            </div>
          </div>

          @if (loading()) {
            <div class="flex justify-center py-12">
              <app-loading-spinner />
            </div>
          }

          @if (!loading() && projects().length === 0) {
            <div class="p-16 text-center">
              <div class="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-accent/10 to-violet-100 rounded-2xl flex items-center justify-center">
                <lucide-icon name="sparkles" [size]="32" class="text-accent/60"></lucide-icon>
              </div>
              <h3 class="text-card-title font-display text-navy mb-2">No creatives yet</h3>
              <p class="text-sm text-gray-500 font-body mb-6 max-w-md mx-auto">Choose a format above or paste a URL to generate your first batch of AI-powered ad creatives</p>
            </div>
          }

          @if (!loading() && projects().length > 0) {
            <div class="divide-y divide-gray-50">
              @for (project of projects(); track project.id) {
                <div
                  class="flex items-center justify-between p-4 hover:bg-cream/50 transition-colors cursor-pointer"
                  (click)="viewProject(project)">
                  <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                      <lucide-icon name="video" [size]="18" class="text-accent"></lucide-icon>
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-navy m-0">{{ project.brand_name || project.name }}</p>
                      <p class="text-xs text-gray-500 font-body m-0">Created {{ project.created_at | date:'mediumDate' }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="px-2.5 py-1 rounded-lg text-xs font-body font-medium capitalize"
                      [ngClass]="{
                        'bg-green-50 text-green-700': project.status === 'delivered',
                        'bg-blue-50 text-blue-700': project.status === 'scripting',
                        'bg-amber-50 text-amber-700': project.status === 'concepts',
                        'bg-violet-50 text-violet-700': project.status === 'onboarding' || project.status === 'research',
                        'bg-gray-100 text-gray-600': !['delivered','scripting','concepts','onboarding','research'].includes(project.status)
                      }">
                      @switch (project.status) {
                        @case ('onboarding') { Generating... }
                        @case ('research') { Analyzing }
                        @case ('concepts') { Concepts Ready }
                        @case ('scripting') { Scripts Ready }
                        @case ('delivered') { Complete }
                        @default { {{ project.status }} }
                      }
                    </span>
                    <lucide-icon name="chevron-right" [size]="16" class="text-gray-300"></lucide-icon>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `
})
export default class UgcStudioComponent implements OnInit {
  private toast = inject(ToastService);
  private ugcService = inject(UgcService);
  private router = inject(Router);

  creativeFormats = [
    { id: 'ugc-video', icon: 'video', title: 'UGC Video Scripts', description: 'AI-generated scripts for creator-driven video ads', badge: 'Most Popular', bgClass: 'bg-violet-100', iconClass: 'text-violet-600' },
    { id: 'static', icon: 'image', title: 'Static Ads', description: 'High-converting display ads and social posts', badge: '', bgClass: 'bg-blue-100', iconClass: 'text-blue-600' },
    { id: 'carousel', icon: 'layers', title: 'Carousel Ads', description: 'Multi-slide story ads for Instagram and Facebook', badge: '', bgClass: 'bg-emerald-100', iconClass: 'text-emerald-600' },
    { id: 'ai-avatar', icon: 'user', title: 'AI Avatar Video', description: 'AI-generated presenters deliver your script', badge: 'Coming Soon', bgClass: 'bg-amber-100', iconClass: 'text-amber-600' },
  ];

  wizardSteps = [
    { num: 1, label: 'Brand' },
    { num: 2, label: 'Brief' },
    { num: 3, label: 'Generate' },
  ];

  selectedFormat = signal<string>('');
  wizardOpen = signal(false);
  wizardStep = signal(1);
  submitting = signal(false);
  loading = signal(false);
  projects = signal<UgcProjectSummary[]>([]);
  quickUrl = '';

  brief = {
    brand_name: '',
    client_name: '',
    client_email: '',
    website_url: '',
    product_feature: '',
    target_user: '',
    brand_voice: '',
    competitors: '',
    num_scripts: 6,
  };

  ngOnInit() {
    this.fetchProjects();
  }

  fetchProjects() {
    this.loading.set(true);
    this.ugcService.getProjects().subscribe({
      next: (data) => {
        this.projects.set(data.projects);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  startGeneration(formatId: string) {
    this.selectedFormat.set(formatId);
    this.wizardOpen.set(true);
    this.wizardStep.set(1);
    this.brief = {
      brand_name: '',
      client_name: '',
      client_email: '',
      website_url: '',
      product_feature: '',
      target_user: '',
      brand_voice: '',
      competitors: '',
      num_scripts: 6,
    };
  }

  quickGenerate() {
    if (!this.quickUrl) return;
    this.selectedFormat.set('ugc-video');
    this.wizardOpen.set(true);
    this.wizardStep.set(1);
    this.brief = {
      brand_name: '',
      client_name: '',
      client_email: '',
      website_url: this.quickUrl,
      product_feature: '',
      target_user: '',
      brand_voice: '',
      competitors: '',
      num_scripts: 6,
    };
  }

  cancelWizard() {
    this.wizardOpen.set(false);
    this.selectedFormat.set('');
  }

  getFormatLabel(id: string): string {
    return this.creativeFormats.find(f => f.id === id)?.title || 'UGC Video Scripts';
  }

  submitGeneration() {
    this.submitting.set(true);
    this.ugcService.onboardProject(this.brief).subscribe({
      next: (res: any) => {
        this.submitting.set(false);
        this.wizardOpen.set(false);
        this.selectedFormat.set('');
        this.toast.success('Generation Started!', 'Your AI creatives are being generated. This usually takes 3-5 minutes.');
        this.fetchProjects();
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error('Generation Failed', err.error?.message || 'Please try again');
      },
    });
  }

  viewProject(project: UgcProjectSummary) {
    this.router.navigate(['/app/ugc-studio', project.id]);
  }
}
