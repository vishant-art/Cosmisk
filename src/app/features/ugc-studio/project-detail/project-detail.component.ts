import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { UgcService, UgcProjectDetail } from '../../../core/services/ugc.service';
import { ToastService } from '../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, LoadingSpinnerComponent],
  template: `
    <div class="space-y-6 animate-page-enter">
      <!-- Back + Header -->
      <div class="flex items-center gap-3">
        <button (click)="goBack()" class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors border-0 cursor-pointer">
          <lucide-icon name="arrow-left" [size]="16" class="text-gray-600"></lucide-icon>
        </button>
        @if (project()) {
          <div class="flex-1">
            <h1 class="text-page-title font-display text-navy m-0">{{ project()!.brand_name || project()!.name }}</h1>
            <p class="text-sm text-gray-500 font-body mt-0.5 mb-0">
              {{ project()!.concepts.length }} concepts &middot; {{ project()!.scripts.length }} scripts
            </p>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16"><app-loading-spinner /></div>
      }

      @if (!loading() && project()) {
        <!-- Stats -->
        <div class="grid grid-cols-3 gap-4">
          <div class="card !p-4">
            <p class="text-xs text-gray-500 font-body m-0">Concepts</p>
            <p class="text-xl font-mono font-bold text-navy m-0 mt-1">{{ project()!.concepts.length }}</p>
          </div>
          <div class="card !p-4">
            <p class="text-xs text-gray-500 font-body m-0">Approved</p>
            <p class="text-xl font-mono font-bold text-green-600 m-0 mt-1">{{ approvedCount() }}</p>
          </div>
          <div class="card !p-4">
            <p class="text-xs text-gray-500 font-body m-0">Scripts</p>
            <p class="text-xl font-mono font-bold text-accent m-0 mt-1">{{ project()!.scripts.length }}</p>
          </div>
        </div>

        <!-- Concepts Section -->
        @if (project()!.concepts.length > 0) {
          <div class="card">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-card-title font-display text-navy m-0">Concepts</h3>
              <div class="flex gap-2">
                @if (pendingConcepts().length > 0 && selectedConcepts().length > 0) {
                  <button
                    (click)="approveSelected()"
                    [disabled]="approving()"
                    class="px-4 py-2 bg-accent text-white rounded-pill text-xs font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40">
                    {{ approving() ? 'Approving...' : 'Approve Selected (' + selectedConcepts().length + ')' }}
                  </button>
                }
                @if (approvedCount() > 0 && project()!.scripts.length === 0) {
                  <button
                    (click)="generateScripts()"
                    [disabled]="generatingScripts()"
                    class="px-4 py-2 bg-green-600 text-white rounded-pill text-xs font-body font-semibold hover:bg-green-700 transition-colors disabled:opacity-40 inline-flex items-center gap-2">
                    @if (generatingScripts()) {
                      <span class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      Generating Scripts...
                    } @else {
                      <lucide-icon name="sparkles" [size]="14"></lucide-icon>
                      Generate Scripts ({{ approvedCount() }} concepts)
                    }
                  </button>
                }
              </div>
            </div>
            <div class="grid md:grid-cols-2 gap-3">
              @for (concept of project()!.concepts; track concept.id) {
                <div class="border rounded-lg p-4 transition-all"
                  [ngClass]="selectedConcepts().includes(concept.id)
                    ? 'border-accent bg-accent/5'
                    : concept.status === 'approved'
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-gray-100 hover:border-accent/30'">
                  <div class="flex items-start justify-between mb-2">
                    <h4 class="text-sm font-body font-semibold text-navy m-0 flex-1 pr-2">{{ concept.title }}</h4>
                    @if (concept.status === 'pending') {
                      <input type="checkbox"
                        [checked]="selectedConcepts().includes(concept.id)"
                        (change)="toggleConcept(concept.id)"
                        class="ml-2 mt-0.5 accent-accent cursor-pointer" />
                    }
                    @if (concept.status === 'approved') {
                      <span class="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-pill font-medium shrink-0">Approved</span>
                    }
                  </div>
                  <p class="text-xs text-gray-600 font-body m-0 leading-relaxed">{{ concept.description }}</p>
                </div>
              }
            </div>
            @if (pendingConcepts().length > 0) {
              <p class="text-xs text-gray-400 font-body mt-3 mb-0">Select concepts you want, then click Approve. Once approved, generate scripts from them.</p>
            }
          </div>
        }

        <!-- Scripts Section -->
        @if (project()!.scripts.length > 0) {
          <div class="card">
            <h3 class="text-card-title font-display text-navy m-0 mb-4">Generated Scripts</h3>
            <div class="space-y-3">
              @for (script of project()!.scripts; track script.id) {
                <div class="border border-gray-100 rounded-lg overflow-hidden">
                  <div class="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    (click)="toggleScript(script.id)">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                      <div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                        <lucide-icon name="file-text" [size]="16" class="text-accent"></lucide-icon>
                      </div>
                      <p class="text-sm font-body font-semibold text-navy m-0 truncate">{{ script.title }}</p>
                    </div>
                    <lucide-icon [name]="expandedScript() === script.id ? 'chevron-up' : 'chevron-down'" [size]="16" class="text-gray-400 shrink-0"></lucide-icon>
                  </div>
                  @if (expandedScript() === script.id && script.content) {
                    <div class="px-4 pb-4 border-t border-gray-100">
                      <pre class="text-xs font-body text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg mt-3 m-0 leading-relaxed">{{ script.content }}</pre>
                      <div class="flex gap-2 mt-3">
                        <button (click)="copyScript(script.content)" class="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-body text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1">
                          <lucide-icon name="copy" [size]="12"></lucide-icon> Copy
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Visual Generation Section — shows after scripts exist -->
        @if (project()!.scripts.length > 0) {
          <div class="card">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-card-title font-display text-navy m-0">Generate Visuals</h3>
              <span class="px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-body font-semibold rounded-pill">via Creative Engine</span>
            </div>
            <div class="grid md:grid-cols-2 gap-3">
              <button (click)="requestImageGen()"
                class="p-5 border-2 border-dashed border-gray-200 rounded-xl text-center hover:border-accent/40 hover:bg-accent/5 transition-all group">
                <div class="w-12 h-12 mx-auto mb-3 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                  <lucide-icon name="image-plus" [size]="24" class="text-blue-500 group-hover:text-accent"></lucide-icon>
                </div>
                <h4 class="text-sm font-body font-semibold text-navy m-0 mb-1">Generate Static Ads</h4>
                <p class="text-xs text-gray-500 font-body m-0">Create a Creative Sprint to batch-generate static ad images</p>
              </button>
              <button (click)="requestVideoGen()"
                class="p-5 border-2 border-dashed border-gray-200 rounded-xl text-center hover:border-accent/40 hover:bg-accent/5 transition-all group">
                <div class="w-12 h-12 mx-auto mb-3 bg-violet-50 rounded-xl flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                  <lucide-icon name="video" [size]="24" class="text-violet-500 group-hover:text-accent"></lucide-icon>
                </div>
                <h4 class="text-sm font-body font-semibold text-navy m-0 mb-1">Generate AI Videos</h4>
                <p class="text-xs text-gray-500 font-body m-0">Create a Creative Sprint to generate avatar videos from scripts</p>
              </button>
            </div>
          </div>
        }

        <!-- Empty state when concepts are generating -->
        @if (project()!.concepts.length === 0) {
          <div class="card text-center py-12">
            <div class="w-12 h-12 mx-auto mb-4 border-3 border-accent border-t-transparent rounded-full animate-spin"></div>
            <h3 class="text-card-title font-display text-navy mb-2">Generating Concepts...</h3>
            <p class="text-sm text-gray-500 font-body max-w-sm mx-auto">Analyzing your ad performance data and creating data-driven creative concepts.</p>
          </div>
        }
      }

      @if (!loading() && error()) {
        <div class="card text-center py-12">
          <p class="text-sm text-red-500 font-body">Failed to load project details.</p>
          <button (click)="loadProject()" class="px-4 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold mt-4">Retry</button>
        </div>
      }
    </div>
  `
})
export default class ProjectDetailComponent implements OnInit {
  private ugcService = inject(UgcService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  loading = signal(false);
  error = signal(false);
  project = signal<UgcProjectDetail | null>(null);
  selectedConcepts = signal<string[]>([]);
  approving = signal(false);
  generatingScripts = signal(false);
  expandedScript = signal<string | null>(null);

  ngOnInit() {
    this.loadProject();
  }

  loadProject() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.loading.set(true);
    this.error.set(false);
    this.ugcService.getProjectDetail(id).subscribe({
      next: (data) => {
        this.project.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
      },
    });
  }

  pendingConcepts = () => (this.project()?.concepts || []).filter(c => c.status === 'pending');
  approvedCount = () => (this.project()?.concepts || []).filter(c => c.status === 'approved').length;

  toggleConcept(id: string) {
    this.selectedConcepts.update(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  approveSelected() {
    const projectId = this.project()?.id;
    if (!projectId) return;

    this.approving.set(true);
    this.ugcService.approveConcepts(projectId, this.selectedConcepts()).subscribe({
      next: () => {
        this.toast.success('Approved', `${this.selectedConcepts().length} concepts approved`);
        this.selectedConcepts.set([]);
        this.approving.set(false);
        this.loadProject();
      },
      error: () => {
        this.toast.error('Failed', 'Could not approve concepts');
        this.approving.set(false);
      },
    });
  }

  generateScripts() {
    const projectId = this.project()?.id;
    if (!projectId) return;

    this.generatingScripts.set(true);
    this.ugcService.writeScripts(projectId).subscribe({
      next: () => {
        this.toast.success('Scripts Generated', 'AI scripts are ready based on your approved concepts');
        this.generatingScripts.set(false);
        this.loadProject();
      },
      error: () => {
        this.toast.error('Failed', 'Could not generate scripts');
        this.generatingScripts.set(false);
      },
    });
  }

  toggleScript(id: string) {
    this.expandedScript.update(current => current === id ? null : id);
  }

  copyScript(content: string) {
    navigator.clipboard.writeText(content).then(() => {
      this.toast.success('Copied', 'Script copied to clipboard');
    });
  }

  requestImageGen() {
    this.toast.success('Opening Creative Engine', 'Use a Creative Sprint to generate static ad images from your scripts');
    this.router.navigate(['/app/creative-engine']);
  }

  requestVideoGen() {
    this.toast.success('Opening Creative Engine', 'Use a Creative Sprint to generate AI avatar videos from your scripts');
    this.router.navigate(['/app/creative-engine']);
  }

  goBack() {
    this.router.navigate(['/app/ugc-studio']);
  }
}
