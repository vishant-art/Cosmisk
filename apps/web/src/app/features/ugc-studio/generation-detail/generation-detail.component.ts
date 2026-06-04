import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { CreativeStudioService, StudioGeneration } from '../../../core/services/creative-studio.service';
import { OutputGalleryComponent } from '../output-gallery/output-gallery.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-generation-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, OutputGalleryComponent, LoadingSpinnerComponent],
  template: `
    <div class="space-y-6">
      <!-- Back link -->
      <a routerLink="/app/ugc-studio" class="inline-flex items-center gap-1.5 text-sm text-gray-500 font-body hover:text-accent no-underline transition-colors">
        <lucide-icon name="arrow-left" [size]="16"></lucide-icon>
        Back to Creative Studio
      </a>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <app-loading-spinner />
        </div>
      }

      @if (!loading() && generation()) {
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-page-title font-display text-navy m-0">{{ generation()!.brief.brand_name }} — {{ generation()!.brief.product_name }}</h1>
            <p class="text-sm text-gray-500 font-body mt-1 mb-0">
              Generated {{ generation()!.created_at | date:'medium' }}
            </p>
          </div>
          <span class="px-3 py-1 rounded-lg text-xs font-body font-semibold capitalize"
            [ngClass]="{
              'bg-green-50 text-green-700': generation()!.status === 'completed',
              'bg-blue-50 text-blue-700': generation()!.status === 'generating',
              'bg-red-50 text-red-700': generation()!.status === 'failed'
            }">
            @if (generation()!.status === 'generating') {
              <span class="inline-flex items-center gap-1.5">
                <span class="w-3 h-3 border-2 border-blue-400/30 border-t-blue-600 rounded-full animate-spin"></span>
                Generating...
              </span>
            } @else {
              {{ generation()!.status }}
            }
          </span>
        </div>

        <!-- Brief summary -->
        <div class="card !p-5">
          <h3 class="text-sm font-display text-navy m-0 mb-3">Brief</h3>
          <div class="grid md:grid-cols-2 gap-3 text-sm font-body">
            <div>
              <span class="text-gray-400 text-xs">Product</span>
              <p class="text-navy m-0">{{ generation()!.brief.product_description }}</p>
            </div>
            <div>
              <span class="text-gray-400 text-xs">Target Audience</span>
              <p class="text-navy m-0">{{ generation()!.brief.target_audience }}</p>
            </div>
            @if (generation()!.brief.price) {
              <div>
                <span class="text-gray-400 text-xs">Price</span>
                <p class="text-navy m-0">{{ generation()!.brief.price }}</p>
              </div>
            }
            <div>
              <span class="text-gray-400 text-xs">Formats</span>
              <div class="flex gap-1.5 mt-0.5">
                @for (f of generation()!.formats; track f) {
                  <span class="px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-semibold rounded capitalize">{{ f }}</span>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Gallery -->
        @if (generation()!.outputs && generation()!.outputs!.length > 0) {
          <app-output-gallery [outputs]="generation()!.outputs!" />
        }
      }

      @if (!loading() && !generation()) {
        <div class="text-center py-16">
          <p class="text-gray-500 font-body">Generation not found</p>
          <a routerLink="/app/ugc-studio" class="text-accent text-sm font-body hover:underline no-underline mt-2 inline-block">Back to Creative Studio</a>
        </div>
      }
    </div>
  `,
})
export default class GenerationDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private studioService = inject(CreativeStudioService);

  generation = signal<StudioGeneration | null>(null);
  loading = signal(true);
  private pollTimer: any;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('genId');
    if (!id) {
      this.router.navigate(['/app/ugc-studio']);
      return;
    }
    this.fetchGeneration(id);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private fetchGeneration(id: string) {
    this.studioService.getGeneration(id).subscribe({
      next: (res) => {
        this.generation.set(res.generation);
        this.loading.set(false);

        // Poll if still generating
        if (res.generation.status === 'generating' && !this.pollTimer) {
          this.pollTimer = setInterval(() => {
            this.studioService.getGeneration(id).subscribe({
              next: (pollRes) => {
                this.generation.set(pollRes.generation);
                if (pollRes.generation.status !== 'generating') {
                  clearInterval(this.pollTimer);
                  this.pollTimer = null;
                }
              },
            });
          }, 3000);
        }
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }
}
