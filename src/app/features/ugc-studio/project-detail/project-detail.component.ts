import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { UgcService, UgcProjectDetail, UgcConcept, UgcScript } from '../../../core/services/ugc.service';
import { ToastService } from '../../../core/services/toast.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, LoadingSpinnerComponent],
  template: `
    <div class="space-y-6 animate-page-enter">
      <!-- Back + Header -->
      <div class="flex items-center gap-3">
        <button (click)="goBack()" class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors border-0 cursor-pointer">
          <lucide-icon name="arrow-left" [size]="16" class="text-gray-600"></lucide-icon>
        </button>
        @if (project()) {
          <div class="flex-1">
            <h1 class="text-page-title font-display text-navy m-0">{{ project()!.project.brand_name }}</h1>
            <p class="text-sm text-gray-500 font-body mt-0.5 mb-0">
              {{ project()!.project.client_code }} &middot;
              <span class="px-2 py-0.5 rounded-pill text-xs font-medium"
                [ngClass]="statusBadgeClass(project()!.project.status)">
                {{ project()!.project.status }}
              </span>
            </p>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <app-loading-spinner />
        </div>
      }

      @if (!loading() && project()) {
        <!-- Pipeline Stepper -->
        <div class="card !p-5">
          <h3 class="text-sm font-display text-navy m-0 mb-4">Pipeline Progress</h3>
          <div class="flex items-center">
            @for (phase of pipelinePhases; track phase; let i = $index) {
              <div class="flex items-center" [class.flex-1]="i < pipelinePhases.length - 1">
                <div class="flex flex-col items-center">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-colors"
                    [ngClass]="i <= currentPhaseIndex() ? 'bg-accent text-white' : 'bg-gray-200 text-gray-500'">
                    @if (i < currentPhaseIndex()) {
                      <lucide-icon name="check" [size]="14"></lucide-icon>
                    } @else {
                      {{ i + 1 }}
                    }
                  </div>
                  <span class="text-[10px] font-body mt-1 whitespace-nowrap"
                    [ngClass]="i <= currentPhaseIndex() ? 'text-accent font-semibold' : 'text-gray-400'">
                    {{ phase }}
                  </span>
                </div>
                @if (i < pipelinePhases.length - 1) {
                  <div class="flex-1 h-0.5 mx-2 mt-[-16px]"
                    [ngClass]="i < currentPhaseIndex() ? 'bg-accent' : 'bg-gray-200'"></div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Project Info -->
        <div class="grid md:grid-cols-3 gap-4">
          <div class="card !p-4">
            <p class="text-xs text-gray-500 font-body m-0">Scripts Requested</p>
            <p class="text-xl font-mono font-bold text-navy m-0 mt-1">{{ project()!.project.num_scripts }}</p>
          </div>
          <div class="card !p-4">
            <p class="text-xs text-gray-500 font-body m-0">Concepts Generated</p>
            <p class="text-xl font-mono font-bold text-navy m-0 mt-1">{{ project()!.project.concepts.length }}</p>
          </div>
          <div class="card !p-4">
            <p class="text-xs text-gray-500 font-body m-0">Scripts Written</p>
            <p class="text-xl font-mono font-bold text-navy m-0 mt-1">{{ project()!.project.scripts.length }}</p>
          </div>
        </div>

        <!-- Concepts Section -->
        @if (project()!.project.concepts.length > 0) {
          <div class="card">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-card-title font-display text-navy m-0">Concepts</h3>
              @if (pendingConcepts().length > 0 && selectedConcepts().length > 0) {
                <button
                  (click)="approveSelected()"
                  [disabled]="approving()"
                  class="px-4 py-2 bg-accent text-white rounded-pill text-xs font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40">
                  @if (approving()) {
                    Approving...
                  } @else {
                    Approve Selected ({{ selectedConcepts().length }})
                  }
                </button>
              }
            </div>
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              @for (concept of project()!.project.concepts; track concept.id) {
                <div class="border border-gray-100 rounded-lg p-4 hover:border-accent/30 transition-colors"
                  [ngClass]="selectedConcepts().includes(concept.id) ? 'border-accent/50 bg-accent/5' : ''">
                  <div class="flex items-start justify-between mb-2">
                    <h4 class="text-sm font-body font-semibold text-navy m-0 flex-1">{{ concept.title }}</h4>
                    @if (concept.status === 'Pending' || concept.status === 'pending') {
                      <input type="checkbox"
                        [checked]="selectedConcepts().includes(concept.id)"
                        (change)="toggleConcept(concept.id)"
                        class="ml-2 mt-0.5 accent-accent cursor-pointer" />
                    }
                  </div>
                  <p class="text-xs text-gray-500 font-body m-0 mb-2">{{ concept.angle }}</p>
                  <div class="flex items-center gap-2 flex-wrap">
                    @if (concept.hook_type) {
                      <span class="px-2 py-0.5 bg-dna-hook-bg text-dna-hook-text text-[10px] rounded-pill font-medium">{{ concept.hook_type }}</span>
                    }
                    @if (concept.virality_score) {
                      <span class="text-[10px] font-mono text-gray-400">Score: {{ concept.virality_score }}</span>
                    }
                    <span class="px-2 py-0.5 rounded-pill text-[10px] font-medium ml-auto"
                      [ngClass]="statusBadgeClass(concept.status)">
                      {{ concept.status }}
                    </span>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- Scripts Section -->
        @if (project()!.project.scripts.length > 0) {
          <div class="card">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-card-title font-display text-navy m-0">Scripts</h3>
              <div class="flex gap-2">
                @if (canDeliver()) {
                  <button
                    (click)="deliverScripts()"
                    [disabled]="delivering()"
                    class="px-4 py-2 bg-green-600 text-white rounded-pill text-xs font-body font-semibold hover:bg-green-700 transition-colors disabled:opacity-40">
                    {{ delivering() ? 'Delivering...' : 'Approve Delivery' }}
                  </button>
                }
                @if (canSendToClient()) {
                  <button
                    (click)="sendToClient()"
                    [disabled]="sendingToClient()"
                    class="px-4 py-2 bg-accent text-white rounded-pill text-xs font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40">
                    {{ sendingToClient() ? 'Sending...' : 'Send to Client' }}
                  </button>
                }
              </div>
            </div>
            <div class="space-y-2">
              @for (script of project()!.project.scripts; track script.id) {
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div class="flex items-center gap-3 flex-1 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <lucide-icon name="file-text" [size]="16" class="text-accent"></lucide-icon>
                    </div>
                    <div class="min-w-0">
                      <p class="text-sm font-body font-medium text-navy m-0 truncate">{{ script.title }}</p>
                      <span class="px-2 py-0.5 rounded-pill text-[10px] font-medium"
                        [ngClass]="statusBadgeClass(script.overall_status)">
                        {{ script.overall_status }}
                      </span>
                    </div>
                  </div>
                  @if (script.google_doc_url) {
                    <a [href]="script.google_doc_url" target="_blank" rel="noopener"
                      class="text-xs text-accent font-body font-semibold hover:underline no-underline flex items-center gap-1 shrink-0 ml-3">
                      Open Doc <lucide-icon name="external-link" [size]="12"></lucide-icon>
                    </a>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Empty states -->
        @if (project()!.project.concepts.length === 0 && project()!.project.scripts.length === 0) {
          <div class="card text-center py-12">
            <div class="w-16 h-16 mx-auto mb-4 bg-accent/5 rounded-2xl flex items-center justify-center">
              <lucide-icon name="clock" [size]="28" class="text-accent/40"></lucide-icon>
            </div>
            <h3 class="text-card-title font-display text-navy mb-2">Pipeline In Progress</h3>
            <p class="text-sm text-gray-500 font-body max-w-sm mx-auto">Research and concept generation is underway. Concepts will appear here once the AI completes analysis.</p>
          </div>
        }
      }

      @if (!loading() && error()) {
        <div class="card text-center py-12">
          <p class="text-sm text-red-500 font-body">Failed to load project details. Please try again.</p>
          <button (click)="loadProject()" class="btn-primary mt-4">Retry</button>
        </div>
      }
    </div>
  `
})
export default class ProjectDetailComponent implements OnInit, OnDestroy {
  private ugcService = inject(UgcService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private refreshInterval?: ReturnType<typeof setInterval>;

  loading = signal(false);
  error = signal(false);
  project = signal<UgcProjectDetail | null>(null);
  selectedConcepts = signal<string[]>([]);
  approving = signal(false);
  delivering = signal(false);
  sendingToClient = signal(false);

  pipelinePhases = ['Onboarding', 'Research', 'Concepts', 'Scripts', 'Delivered'];

  ngOnInit() {
    this.loadProject();
    this.refreshInterval = setInterval(() => {
      const status = this.project()?.project.status;
      if (status && !['Delivered', 'Complete', 'Client Review'].includes(status)) {
        this.loadProject();
      }
    }, 30000);
  }

  ngOnDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
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

  currentPhaseIndex = () => {
    const status = this.project()?.project.status || '';
    const map: Record<string, number> = {
      'Onboarding': 0,
      'Research': 1,
      'Concept Review': 2,
      'Scripting': 3,
      'Script Review': 3,
      'Delivered': 4,
      'Complete': 4,
      'Client Review': 4,
    };
    return map[status] ?? 0;
  };

  pendingConcepts = () => {
    return (this.project()?.project.concepts || []).filter(
      c => c.status === 'Pending' || c.status === 'pending'
    );
  };

  canDeliver(): boolean {
    const status = this.project()?.project.status || '';
    return status === 'Script Review' || status === 'Scripting';
  }

  canSendToClient(): boolean {
    const status = this.project()?.project.status || '';
    return status === 'Delivered' || status === 'Complete';
  }

  toggleConcept(id: string) {
    this.selectedConcepts.update(ids =>
      ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    );
  }

  approveSelected() {
    const projectId = this.project()?.project.id;
    if (!projectId) return;

    this.approving.set(true);
    this.ugcService.approveConcepts(projectId, this.selectedConcepts()).subscribe({
      next: () => {
        this.toast.success('Concepts Approved', `${this.selectedConcepts().length} concepts approved. Script writing will begin.`);
        this.selectedConcepts.set([]);
        this.approving.set(false);
        this.loadProject();
      },
      error: () => {
        this.toast.error('Failed to approve', 'Please try again');
        this.approving.set(false);
      },
    });
  }

  deliverScripts() {
    const projectId = this.project()?.project.id;
    if (!projectId) return;

    this.delivering.set(true);
    this.ugcService.deliverScripts(projectId).subscribe({
      next: () => {
        this.toast.success('Scripts Delivered', 'Delivery approved successfully');
        this.delivering.set(false);
        this.loadProject();
      },
      error: () => {
        this.toast.error('Failed to deliver', 'Please try again');
        this.delivering.set(false);
      },
    });
  }

  sendToClient() {
    const projectId = this.project()?.project.id;
    if (!projectId) return;

    this.sendingToClient.set(true);
    this.ugcService.sendToClient(projectId).subscribe({
      next: () => {
        this.toast.success('Sent to Client', 'Scripts are now in client review');
        this.sendingToClient.set(false);
        this.loadProject();
      },
      error: () => {
        this.toast.error('Failed to send', 'Please try again');
        this.sendingToClient.set(false);
      },
    });
  }

  statusBadgeClass(status: string): string {
    const s = status.toLowerCase();
    if (s.includes('deliver') || s.includes('complete') || s === 'approved') return 'bg-green-50 text-green-700';
    if (s.includes('script') || s.includes('review')) return 'bg-blue-50 text-blue-700';
    if (s.includes('research') || s.includes('concept') || s === 'pending') return 'bg-yellow-50 text-yellow-700';
    if (s.includes('onboard')) return 'bg-purple-50 text-purple-700';
    if (s.includes('reject')) return 'bg-red-50 text-red-700';
    return 'bg-gray-100 text-gray-600';
  }

  goBack() {
    this.router.navigate(['/app/ugc-studio']);
  }
}
