const _BUILD_VER = '2026-04-01-v2';
import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { UgcService, UgcProjectSummary } from '../../core/services/ugc.service';
import { CreativeStudioService, UrlAnalysis, StudioGeneration } from '../../core/services/creative-studio.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { OutputGalleryComponent } from './output-gallery/output-gallery.component';

@Component({
  selector: 'app-ugc-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, LoadingSpinnerComponent, OutputGalleryComponent],
  template: `
    <div class="space-y-6">

      <!-- Header -->
      <div>
        <h1 class="text-page-title font-display text-navy m-0">Creative Studio</h1>
        <p class="text-sm text-gray-500 font-body mt-1 mb-0">Paste. Generate. Win.</p>
      </div>

      <!-- 1. Hero: URL Input -->
      <div class="card !p-6 bg-gradient-to-br from-white to-accent/5 border-2 border-accent/10">
        <div class="text-center mb-5">
          <h2 class="text-lg font-display text-navy m-0 mb-1">Paste any product URL and watch the magic</h2>
          <p class="text-xs text-gray-500 font-body m-0">We'll auto-detect your brand, product, price, and audience</p>
        </div>

        <div class="flex gap-3 max-w-2xl mx-auto">
          <div class="relative flex-1">
            <lucide-icon name="link" [size]="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></lucide-icon>
            <input
              [(ngModel)]="urlInput"
              placeholder="https://yourproduct.com/product-page"
              class="input !pl-10 !py-3 text-sm"
              (keydown.enter)="analyzeUrl()"
              [disabled]="analyzing()" />
          </div>
          <button
            (click)="analyzeUrl()"
            [disabled]="!urlInput || analyzing()"
            class="px-5 py-3 bg-accent text-white rounded-xl text-sm font-body font-semibold hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2 whitespace-nowrap">
            @if (analyzing()) {
              <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              Analyzing...
            } @else {
              <lucide-icon name="scan" [size]="16"></lucide-icon>
              Analyze
            }
          </button>
        </div>

        <!-- Analysis Result Preview -->
        @if (analysis()) {
          <div class="mt-5 max-w-2xl mx-auto bg-white rounded-xl border border-gray-100 p-4 animate-fade-in">
            <div class="flex items-center gap-2 mb-3">
              <lucide-icon name="check-circle" [size]="16" class="text-green-500"></lucide-icon>
              <span class="text-xs font-body font-semibold text-green-700">Product detected</span>
            </div>
            <div class="grid md:grid-cols-2 gap-3 text-sm font-body">
              <div>
                <label class="text-[10px] text-gray-400 uppercase tracking-wide block mb-0.5">Brand</label>
                <input [(ngModel)]="brief.brand_name" class="input !py-1.5 text-sm" />
              </div>
              <div>
                <label class="text-[10px] text-gray-400 uppercase tracking-wide block mb-0.5">Product</label>
                <input [(ngModel)]="brief.product_name" class="input !py-1.5 text-sm" />
              </div>
              <div class="md:col-span-2">
                <label class="text-[10px] text-gray-400 uppercase tracking-wide block mb-0.5">Description</label>
                <textarea [(ngModel)]="brief.product_description" rows="2" class="input !py-1.5 text-sm resize-none"></textarea>
              </div>
              <div>
                <label class="text-[10px] text-gray-400 uppercase tracking-wide block mb-0.5">Target Audience</label>
                <input [(ngModel)]="brief.target_audience" class="input !py-1.5 text-sm" />
              </div>
              <div>
                <label class="text-[10px] text-gray-400 uppercase tracking-wide block mb-0.5">Price</label>
                <input [(ngModel)]="brief.price" class="input !py-1.5 text-sm" />
              </div>
            </div>
          </div>
        }
      </div>

      <!-- 2. Format Selector + Generate -->
      @if (analysis() || manualMode()) {
        <div class="card !p-5 animate-fade-in">
          <h3 class="text-sm font-display text-navy m-0 mb-3">Select Formats</h3>
          <div class="flex flex-wrap gap-2 mb-4">
            @for (f of formatOptions; track f.id) {
              <button
                (click)="toggleFormat(f.id)"
                class="px-4 py-2 rounded-xl text-sm font-body font-medium transition-all border-2 inline-flex items-center gap-2"
                [ngClass]="selectedFormats().includes(f.id)
                  ? 'border-accent bg-accent/5 text-accent'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'">
                <lucide-icon [name]="f.icon" [size]="16"></lucide-icon>
                {{ f.label }}
                @if (selectedFormats().includes(f.id)) {
                  <lucide-icon name="check" [size]="14" class="text-accent"></lucide-icon>
                }
              </button>
            }
          </div>
          <div class="flex items-center justify-between">
            <p class="text-xs text-gray-400 font-body m-0">{{ selectedFormats().length }} format(s) selected</p>
            <button
              (click)="generateAll()"
              [disabled]="generating() || selectedFormats().length === 0 || !brief.brand_name || !brief.product_description"
              class="px-6 py-2.5 bg-accent text-white rounded-xl text-sm font-body font-bold hover:bg-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2">
              @if (generating()) {
                <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Generating...
              } @else {
                <lucide-icon name="sparkles" [size]="16"></lucide-icon>
                Generate All
              }
            </button>
          </div>
        </div>
      }

      <!-- Manual Brief Form (when no URL) -->
      @if (!analysis() && !manualMode()) {
        <div class="flex items-center gap-4 max-w-2xl mx-auto">
          <div class="flex-1 border-t border-gray-200"></div>
          <span class="text-xs text-gray-400 font-body">or</span>
          <div class="flex-1 border-t border-gray-200"></div>
        </div>

        <div class="text-center">
          <button (click)="manualMode.set(true)"
            class="px-5 py-2.5 border-2 border-gray-200 text-gray-600 rounded-xl text-sm font-body font-semibold hover:border-accent hover:text-accent transition-all inline-flex items-center gap-2">
            <lucide-icon name="pen-tool" [size]="16"></lucide-icon>
            Generate from Brief
          </button>
        </div>
      }

      <!-- Manual Brief Inline Form -->
      @if (manualMode() && !analysis()) {
        <div class="card !p-5 animate-fade-in max-w-2xl mx-auto">
          <h3 class="text-sm font-display text-navy m-0 mb-4">Creative Brief</h3>
          <div class="grid md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Brand Name *</label>
              <input [(ngModel)]="brief.brand_name" placeholder="e.g., Wheelwash" class="input" />
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Product Name *</label>
              <input [(ngModel)]="brief.product_name" placeholder="e.g., Premium Car Shampoo" class="input" />
            </div>
            <div class="md:col-span-2">
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Product Description *</label>
              <textarea [(ngModel)]="brief.product_description" rows="3" placeholder="What does this product do? What makes it special?" class="input resize-none"></textarea>
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Target Audience *</label>
              <input [(ngModel)]="brief.target_audience" placeholder="Who is this for?" class="input" />
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Price (optional)</label>
              <input [(ngModel)]="brief.price" placeholder="e.g., Rs 999" class="input" />
            </div>
          </div>
          <div class="flex justify-end mt-4">
            <button (click)="manualMode.set(false)" class="px-4 py-2 text-gray-500 text-sm font-body hover:text-gray-700 mr-2">Cancel</button>
          </div>
        </div>
      }

      <!-- 3. Active Generation Output -->
      @if (activeGeneration()) {
        <div class="card !p-5 animate-fade-in">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <h3 class="text-sm font-display text-navy m-0">Generation Output</h3>
              @if (activeGeneration()!.status === 'generating') {
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-body font-medium rounded-lg">
                  <span class="w-2.5 h-2.5 border-2 border-blue-400/30 border-t-blue-600 rounded-full animate-spin"></span>
                  In Progress
                </span>
              } @else if (activeGeneration()!.status === 'completed') {
                <span class="px-2.5 py-1 bg-green-50 text-green-700 text-xs font-body font-medium rounded-lg">Complete</span>
              }
            </div>
            <button (click)="viewFullGeneration(activeGeneration()!.id)"
              class="text-xs text-accent font-body font-semibold hover:underline no-underline">
              View Full Details
            </button>
          </div>
          @if (activeGeneration()!.outputs && activeGeneration()!.outputs!.length > 0) {
            <app-output-gallery [outputs]="activeGeneration()!.outputs!" />
          } @else {
            <div class="text-center py-8">
              <span class="w-8 h-8 border-3 border-accent/20 border-t-accent rounded-full animate-spin inline-block mb-3"></span>
              <p class="text-sm text-gray-500 font-body m-0">Generating your creatives...</p>
            </div>
          }
        </div>
      }

      <!-- 4. Quick Actions + History -->
      <div class="flex flex-wrap gap-3">
        <a routerLink="/app/creative-engine"
          class="px-4 py-2 border border-gray-200 rounded-xl text-xs font-body font-semibold text-gray-600 hover:border-accent hover:text-accent transition-all no-underline inline-flex items-center gap-2">
          <lucide-icon name="rocket" [size]="14"></lucide-icon>
          Import from Sprint
        </a>
      </div>

      <!-- 5. Past Generations -->
      <div class="card">
        <div class="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-sm font-display text-navy m-0">History</h3>
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-400 font-body">{{ generations().length + legacyProjects().length }} total</span>
          </div>
        </div>

        @if (loading()) {
          <div class="flex justify-center py-12">
            <app-loading-spinner />
          </div>
        }

        @if (!loading() && generations().length === 0 && legacyProjects().length === 0) {
          <div class="p-12 text-center">
            <div class="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-accent/10 to-violet-100 rounded-2xl flex items-center justify-center">
              <lucide-icon name="sparkles" [size]="28" class="text-accent/60"></lucide-icon>
            </div>
            <h3 class="text-card-title font-display text-navy mb-1">No creatives yet</h3>
            <p class="text-sm text-gray-500 font-body m-0">Paste a URL above to generate your first batch</p>
          </div>
        }

        @if (!loading()) {
          <div class="divide-y divide-gray-50">
            <!-- New studio generations -->
            @for (gen of generations(); track gen.id) {
              <div class="flex items-center justify-between p-4 hover:bg-cream/50 transition-colors cursor-pointer"
                (click)="viewFullGeneration(gen.id)">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <lucide-icon name="sparkles" [size]="18" class="text-accent"></lucide-icon>
                  </div>
                  <div>
                    <p class="text-sm font-semibold text-navy m-0">{{ gen.brief.brand_name }} — {{ gen.brief.product_name }}</p>
                    <p class="text-xs text-gray-500 font-body m-0">
                      {{ gen.formats.join(', ') }} &middot; {{ gen.created_at | date:'mediumDate' }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="px-2.5 py-1 rounded-lg text-xs font-body font-medium capitalize"
                    [ngClass]="{
                      'bg-green-50 text-green-700': gen.status === 'completed',
                      'bg-blue-50 text-blue-700': gen.status === 'generating',
                      'bg-red-50 text-red-700': gen.status === 'failed'
                    }">{{ gen.status }}</span>
                  <lucide-icon name="chevron-right" [size]="16" class="text-gray-300"></lucide-icon>
                </div>
              </div>
            }

            <!-- Legacy UGC projects -->
            @for (project of legacyProjects(); track project.id) {
              <div class="flex items-center justify-between p-4 hover:bg-cream/50 transition-colors cursor-pointer"
                (click)="viewLegacyProject(project)">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                    <lucide-icon name="video" [size]="18" class="text-violet-600"></lucide-icon>
                  </div>
                  <div>
                    <p class="text-sm font-semibold text-navy m-0">{{ project.brand_name || project.name }}</p>
                    <p class="text-xs text-gray-500 font-body m-0">UGC Project &middot; {{ project.created_at | date:'mediumDate' }}</p>
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
    </div>
  `
})
export default class UgcStudioComponent implements OnInit {
  private toast = inject(ToastService);
  private ugcService = inject(UgcService);
  private studioService = inject(CreativeStudioService);
  private router = inject(Router);

  formatOptions = [
    { id: 'scripts', icon: 'video', label: 'UGC Scripts' },
    { id: 'static', icon: 'image', label: 'Static Ads' },
    { id: 'carousel', icon: 'layers', label: 'Carousel Ads' },
    { id: 'video', icon: 'user', label: 'AI Avatar Video' },
  ];

  // State
  urlInput = '';
  analyzing = signal(false);
  analysis = signal<UrlAnalysis | null>(null);
  manualMode = signal(false);
  selectedFormats = signal<string[]>(['scripts', 'static']);
  generating = signal(false);
  loading = signal(false);
  activeGeneration = signal<StudioGeneration | null>(null);
  generations = signal<StudioGeneration[]>([]);
  legacyProjects = signal<UgcProjectSummary[]>([]);

  brief = {
    brand_name: '',
    product_name: '',
    product_description: '',
    target_audience: '',
    price: '',
  };

  private pollTimer: any;

  ngOnInit() {
    this.fetchHistory();
  }

  analyzeUrl() {
    if (!this.urlInput) return;
    this.analyzing.set(true);
    this.analysis.set(null);

    this.studioService.analyzeUrl(this.urlInput).subscribe({
      next: (res) => {
        this.analyzing.set(false);
        if (res.success && res.analysis) {
          this.analysis.set(res.analysis);
          // Auto-fill brief from analysis
          this.brief.brand_name = res.analysis.brand_name || '';
          this.brief.product_name = res.analysis.product_name || '';
          this.brief.product_description = res.analysis.product_description || '';
          this.brief.target_audience = res.analysis.target_audience || '';
          this.brief.price = res.analysis.price || '';
        }
      },
      error: (err) => {
        this.analyzing.set(false);
        this.toast.error('Analysis Failed', err.error?.error || 'Could not analyze this URL');
      },
    });
  }

  toggleFormat(id: string) {
    const current = this.selectedFormats();
    if (current.includes(id)) {
      this.selectedFormats.set(current.filter(f => f !== id));
    } else {
      this.selectedFormats.set([...current, id]);
    }
  }

  generateAll() {
    if (!this.brief.brand_name || !this.brief.product_description || this.selectedFormats().length === 0) return;
    this.generating.set(true);

    this.studioService.generate(
      {
        brand_name: this.brief.brand_name,
        product_name: this.brief.product_name,
        product_description: this.brief.product_description,
        target_audience: this.brief.target_audience,
        price: this.brief.price || undefined,
      },
      this.selectedFormats(),
    ).subscribe({
      next: (res) => {
        this.generating.set(false);
        if (res.success && res.generation_id) {
          this.toast.success('Generation Started', 'Your creatives are being generated.');
          // Start polling for this generation
          this.pollGeneration(res.generation_id);
        }
      },
      error: (err) => {
        this.generating.set(false);
        this.toast.error('Generation Failed', err.error?.error || 'Please try again');
      },
    });
  }

  private pollGeneration(id: string) {
    this.studioService.getGeneration(id).subscribe({
      next: (res) => {
        this.activeGeneration.set(res.generation);

        if (res.generation.status === 'generating') {
          this.pollTimer = setInterval(() => {
            this.studioService.getGeneration(id).subscribe({
              next: (pollRes) => {
                this.activeGeneration.set(pollRes.generation);
                if (pollRes.generation.status !== 'generating') {
                  clearInterval(this.pollTimer);
                  this.pollTimer = null;
                  this.toast.success('Complete', 'Creative generation finished.');
                  this.fetchHistory();
                }
              },
              error: () => {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
                this.toast.error('Poll Failed', 'Lost connection to generation. Refresh to check status.');
              },
            });
          }, 3000);
        } else {
          this.fetchHistory();
        }
      },
    });
  }

  private fetchHistory() {
    this.loading.set(true);

    // Fetch both new generations and legacy projects
    this.studioService.getGenerations().subscribe({
      next: (res) => {
        this.generations.set(res.generations || []);
      },
      complete: () => this.checkLoadingDone(),
      error: () => this.checkLoadingDone(),
    });

    this.ugcService.getProjects().subscribe({
      next: (data) => {
        this.legacyProjects.set(data.projects || []);
      },
      complete: () => this.checkLoadingDone(),
      error: () => this.checkLoadingDone(),
    });
  }

  private loadCount = 0;
  private checkLoadingDone() {
    this.loadCount++;
    if (this.loadCount >= 2) {
      this.loading.set(false);
      this.loadCount = 0;
    }
  }

  viewFullGeneration(id: string) {
    this.router.navigate(['/app/ugc-studio/gen', id]);
  }

  viewLegacyProject(project: UgcProjectSummary) {
    this.router.navigate(['/app/ugc-studio', project.id]);
  }
}
