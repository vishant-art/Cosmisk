const _BUILD_VER = '2026-02-23-v1';
import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { UgcService, UgcProjectSummary } from '../../core/services/ugc.service';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-ugc-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, ModalComponent, LoadingSpinnerComponent],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">UGC Studio</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Manage your UGC pipeline projects</p>
        </div>
        <button
          (click)="startNewProject()"
          class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors inline-flex items-center gap-1.5">
          <lucide-icon name="plus" [size]="16"></lucide-icon> New Project
        </button>
      </div>

      <!-- Onboarding Wizard (when creating) -->
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

          <!-- Step 1: Brand Info -->
          @if (wizardStep() === 1) {
            <div class="p-6 space-y-4 animate-fade-in">
              <h3 class="text-base font-display text-navy mb-1">Brand Details</h3>
              <p class="text-xs text-gray-500 font-body mb-4">Tell us about the brand for this project</p>

              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Brand Name *</label>
                  <input [(ngModel)]="brief.brand_name" placeholder="e.g., Wheelwash" class="input" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Client Name *</label>
                  <input [(ngModel)]="brief.client_name" placeholder="e.g., Chirag Sharma" class="input" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Client Email *</label>
                  <input [(ngModel)]="brief.client_email" type="email" placeholder="client@company.com" class="input" />
                </div>
                <div>
                  <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Number of Scripts *</label>
                  <input [(ngModel)]="brief.num_scripts" type="number" min="1" max="20" placeholder="6" class="input" />
                </div>
              </div>

              <div class="flex justify-end mt-6">
                <button
                  [disabled]="!brief.brand_name || !brief.client_name || !brief.client_email"
                  (click)="wizardStep.set(2)"
                  class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Continue &#8594;
                </button>
              </div>
            </div>
          }

          <!-- Step 2: Product & Audience -->
          @if (wizardStep() === 2) {
            <div class="p-6 space-y-4 animate-fade-in">
              <h3 class="text-base font-display text-navy mb-1">Product & Audience</h3>
              <p class="text-xs text-gray-500 font-body mb-4">Describe the product and who it's for</p>

              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Product / Feature *</label>
                <textarea [(ngModel)]="brief.product_feature" rows="3" placeholder="What product or feature should the UGC scripts focus on?" class="input resize-none"></textarea>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Target Audience *</label>
                <textarea [(ngModel)]="brief.target_user" rows="3" placeholder="Who is the target audience? Age, interests, pain points..." class="input resize-none"></textarea>
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Brand Voice / Tone</label>
                <input [(ngModel)]="brief.brand_voice" placeholder="e.g., Friendly, professional, quirky" class="input" />
              </div>
              <div>
                <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Competitors (optional)</label>
                <input [(ngModel)]="brief.competitors" placeholder="e.g., Brand A, Brand B" class="input" />
              </div>

              <div class="flex justify-between mt-6">
                <button (click)="wizardStep.set(1)" class="px-4 py-2 text-gray-500 text-sm font-body hover:text-gray-700">
                  &#8592; Back
                </button>
                <button
                  [disabled]="!brief.product_feature || !brief.target_user"
                  (click)="wizardStep.set(3)"
                  class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Continue &#8594;
                </button>
              </div>
            </div>
          }

          <!-- Step 3: Review & Submit -->
          @if (wizardStep() === 3) {
            <div class="p-6 space-y-4 animate-fade-in">
              <h3 class="text-base font-display text-navy mb-1">Review & Submit</h3>
              <p class="text-xs text-gray-500 font-body mb-4">Confirm the brief before starting the pipeline</p>

              <div class="bg-gray-50 rounded-lg p-4 space-y-3 text-sm font-body">
                <div class="flex justify-between"><span class="text-gray-500">Brand</span><span class="text-navy font-medium">{{ brief.brand_name }}</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Client</span><span class="text-navy font-medium">{{ brief.client_name }} ({{ brief.client_email }})</span></div>
                <div class="flex justify-between"><span class="text-gray-500">Scripts</span><span class="text-navy font-medium">{{ brief.num_scripts }}</span></div>
                <div class="border-t border-gray-200 pt-3">
                  <span class="text-gray-500 block mb-1">Product</span>
                  <span class="text-navy">{{ brief.product_feature }}</span>
                </div>
                <div>
                  <span class="text-gray-500 block mb-1">Target Audience</span>
                  <span class="text-navy">{{ brief.target_user }}</span>
                </div>
                @if (brief.brand_voice) {
                  <div class="flex justify-between"><span class="text-gray-500">Brand Voice</span><span class="text-navy">{{ brief.brand_voice }}</span></div>
                }
              </div>

              <div class="flex justify-between mt-6">
                <button (click)="wizardStep.set(2)" class="px-4 py-2 text-gray-500 text-sm font-body hover:text-gray-700">
                  &#8592; Back
                </button>
                <button
                  (click)="submitOnboarding()"
                  [disabled]="submitting()"
                  class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40">
                  @if (submitting()) {
                    <span class="inline-flex items-center gap-2">
                      <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      Creating project...
                    </span>
                  } @else {
                    Launch Pipeline &#10149;
                  }
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Quick Stats -->
      @if (!wizardOpen() && !loading() && projects().length > 0) {
        <div class="grid grid-cols-3 gap-4">
          <div class="card !p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <lucide-icon name="activity" [size]="20" class="text-accent"></lucide-icon>
            </div>
            <div>
              <p class="text-xs text-gray-500 font-body m-0">Active Projects</p>
              <p class="text-lg font-mono font-bold text-navy m-0">{{ projects().length }}</p>
            </div>
          </div>
          <div class="card !p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <lucide-icon name="file-text" [size]="20" class="text-blue-500"></lucide-icon>
            </div>
            <div>
              <p class="text-xs text-gray-500 font-body m-0">Scripts This Month</p>
              <p class="text-lg font-mono font-bold text-navy m-0">{{ totalScripts() }}</p>
            </div>
          </div>
          <div class="card !p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <lucide-icon name="clock" [size]="20" class="text-green-500"></lucide-icon>
            </div>
            <div>
              <p class="text-xs text-gray-500 font-body m-0">Avg Delivery</p>
              <p class="text-lg font-mono font-bold text-navy m-0">~3 days</p>
            </div>
          </div>
        </div>
      }

      <!-- Projects List -->
      @if (!wizardOpen()) {
        <!-- Loading -->
        @if (loading()) {
          <div class="flex justify-center py-12">
            <app-loading-spinner />
          </div>
        }

        <!-- Projects table -->
        @if (!loading()) {
          <div class="bg-white rounded-card shadow-card">
            <div class="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 class="text-sm font-display text-navy m-0">Your Projects</h3>
              <span class="text-xs text-gray-400 font-body">{{ projects().length }} projects</span>
            </div>
            @if (projects().length === 0) {
              <div class="p-16 text-center">
                <div class="w-20 h-20 mx-auto mb-4 bg-accent/5 rounded-2xl flex items-center justify-center">
                  <lucide-icon name="video" [size]="32" class="text-accent/40"></lucide-icon>
                </div>
                <h3 class="text-card-title font-display text-navy mb-2">No projects yet</h3>
                <p class="text-sm text-gray-500 font-body mb-6 max-w-sm mx-auto">Create your first UGC project to start the AI-powered creative pipeline</p>
                <button (click)="startNewProject()" class="btn-primary inline-flex items-center gap-1.5">
                  <lucide-icon name="plus" [size]="16"></lucide-icon>
                  Create Your First Project
                </button>
              </div>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-sm font-body">
                  <thead>
                    <tr class="border-b border-divider">
                      <th class="text-left py-3 px-4 text-xs text-gray-500 font-medium">Code</th>
                      <th class="text-left py-3 px-4 text-xs text-gray-500 font-medium">Brand</th>
                      <th class="text-left py-3 px-4 text-xs text-gray-500 font-medium">Status</th>
                      <th class="text-left py-3 px-4 text-xs text-gray-500 font-medium">Pipeline</th>
                      <th class="text-center py-3 px-4 text-xs text-gray-500 font-medium">Scripts</th>
                      <th class="text-left py-3 px-4 text-xs text-gray-500 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (project of projects(); track project.id) {
                      <tr
                        class="border-b border-divider hover:bg-cream transition-colors cursor-pointer"
                        (click)="viewProject(project)">
                        <td class="py-3 px-4 font-mono text-xs text-accent font-semibold">{{ project.client_code }}</td>
                        <td class="py-3 px-4 font-medium text-navy">{{ project.brand_name }}</td>
                        <td class="py-3 px-4">
                          <span class="px-2 py-0.5 rounded-pill text-xs font-body font-medium"
                            [ngClass]="{
                              'bg-green-50 text-green-700': project.status === 'Delivered' || project.status === 'Complete',
                              'bg-blue-50 text-blue-700': project.status === 'Scripting' || project.status === 'Script Review',
                              'bg-yellow-50 text-yellow-700': project.status === 'Research' || project.status === 'Concept Review',
                              'bg-purple-50 text-purple-700': project.status === 'Onboarding',
                              'bg-gray-100 text-gray-600': !['Delivered','Complete','Scripting','Script Review','Research','Concept Review','Onboarding'].includes(project.status)
                            }">
                            {{ project.status }}
                          </span>
                        </td>
                        <td class="py-3 px-4">
                          <div class="flex items-center gap-1">
                            @for (phase of pipelinePhases; track phase; let i = $index) {
                              <div class="w-2 h-2 rounded-full transition-colors"
                                [ngClass]="i <= getPhaseIndex(project.status) ? 'bg-accent' : 'bg-gray-200'"></div>
                              @if (i < pipelinePhases.length - 1) {
                                <div class="w-3 h-px" [ngClass]="i < getPhaseIndex(project.status) ? 'bg-accent' : 'bg-gray-200'"></div>
                              }
                            }
                          </div>
                        </td>
                        <td class="py-3 px-4 text-center font-mono">{{ project.num_scripts }}</td>
                        <td class="py-3 px-4 text-gray-400 text-xs">{{ project.created_at }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
      }

      <!-- Project Detail Modal -->
      @if (selectedProject()) {
        <app-modal (close)="selectedProject.set(null)" title="Project Detail">
          <div class="space-y-4 p-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-display text-navy m-0">{{ selectedProject()!.brand_name }}</h3>
                <p class="text-xs text-gray-500 font-body mt-1 m-0">{{ selectedProject()!.client_code }} · {{ selectedProject()!.status }}</p>
              </div>
            </div>
            <p class="text-sm text-gray-500 font-body">Full project detail view coming soon. For now, manage concepts and scripts through the Slack-based approval flow.</p>
          </div>
        </app-modal>
      }
    </div>
  `
})
export default class UgcStudioComponent implements OnInit {
  private toast = inject(ToastService);
  private ugcService = inject(UgcService);
  private router = inject(Router);
  protected Math = Math;

  wizardSteps = [
    { num: 1, label: 'Brand Info' },
    { num: 2, label: 'Product & Audience' },
    { num: 3, label: 'Review & Submit' },
  ];

  pipelinePhases = ['Onboarding', 'Research', 'Concept Review', 'Scripting', 'Delivered'];

  wizardOpen = signal(false);
  wizardStep = signal(1);
  submitting = signal(false);
  loading = signal(false);
  projects = signal<UgcProjectSummary[]>([]);
  selectedProject = signal<UgcProjectSummary | null>(null);

  totalScripts = computed(() =>
    this.projects().reduce((sum, p) => sum + (p.num_scripts || 0), 0)
  );

  brief = {
    brand_name: '',
    client_name: '',
    client_email: '',
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
        // API not available — show empty state
      },
    });
  }

  startNewProject() {
    this.wizardOpen.set(true);
    this.wizardStep.set(1);
    this.brief = {
      brand_name: '',
      client_name: '',
      client_email: '',
      product_feature: '',
      target_user: '',
      brand_voice: '',
      competitors: '',
      num_scripts: 6,
    };
  }

  submitOnboarding() {
    this.submitting.set(true);
    this.ugcService.onboardProject(this.brief).subscribe({
      next: (res: any) => {
        this.submitting.set(false);
        this.wizardOpen.set(false);
        this.toast.success('Project Created!', `Client code: ${res.client_code || 'assigned'}. Pipeline starting...`);
        this.fetchProjects();
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error('Failed to create project', err.error?.message || 'Please try again');
      },
    });
  }

  getPhaseIndex(status: string): number {
    const map: Record<string, number> = {
      'Onboarding': 0,
      'Research': 1,
      'Concept Review': 2,
      'Scripting': 3,
      'Script Review': 3,
      'Delivered': 4,
      'Complete': 4,
    };
    return map[status] ?? 0;
  }

  viewProject(project: UgcProjectSummary) {
    this.router.navigate(['/app/ugc-studio', project.id]);
  }
}
