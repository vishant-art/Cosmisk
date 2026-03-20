import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { CreativeEngineService } from '../../../core/services/creative-engine.service';
import { ToastService } from '../../../core/services/toast.service';
import { AdAccountService } from '../../../core/services/ad-account.service';
import { ApiService } from '../../../core/services/api.service';
import { environment } from '../../../../environments/environment';
import type {
  Sprint, CreativeJob, SprintProgress, SprintPlanItem, ScoringResult,
} from '../../../core/models/creative-engine.model';
import { getFormatMeta } from '../../../core/models/creative-engine.model';

@Component({
  selector: 'app-sprint-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="max-w-7xl mx-auto">
      <!-- Back + Header -->
      <button (click)="goBack()" class="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <lucide-icon name="arrow-left" [size]="16"></lucide-icon>
        Back to Sprints
      </button>

      @if (loading()) {
        <div class="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div class="w-10 h-10 border-3 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-3"></div>
          <p class="text-sm text-gray-500">Loading sprint...</p>
        </div>
      }

      @if (sprint()) {
        <!-- Sprint Header -->
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-display font-bold text-gray-900">{{ sprint()!.name }}</h1>
            <p class="text-sm text-gray-500 mt-1">
              {{ sprint()!.total_creatives }} creatives &middot;
              {{ sprint()!.status }} &middot;
              Created {{ sprint()!.created_at | date:'mediumDate' }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-4 py-1.5 rounded-full text-sm font-medium" [class]="getStatusClass(sprint()!.status)">
              {{ sprint()!.status }}
            </span>
            @if (sprint()!.status === 'generating') {
              <button
                (click)="cancelSprint()"
                class="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">
                Cancel
              </button>
            }
            @if (sprint()!.status !== 'generating') {
              <button
                (click)="duplicateSprint()"
                class="px-3 py-1.5 text-xs text-accent border border-accent/30 rounded-lg hover:bg-accent/10 transition">
                Duplicate
              </button>
              <button
                (click)="deleteSprint()"
                class="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition">
                Delete
              </button>
            }
          </div>
        </div>

        <!-- Learn Panel (always visible) -->
        @if (sprint()!.learn_snapshot) {
          <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <h2 class="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <lucide-icon name="search" [size]="18" class="text-accent"></lucide-icon>
              Account Snapshot
            </h2>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div class="bg-gray-50 rounded-xl p-3">
                <p class="text-xs text-gray-500 mb-0.5">Avg ROAS</p>
                <p class="text-lg font-bold">{{ sprint()!.learn_snapshot!.benchmarks.avgRoas }}x</p>
              </div>
              <div class="bg-gray-50 rounded-xl p-3">
                <p class="text-xs text-gray-500 mb-0.5">Avg CTR</p>
                <p class="text-lg font-bold">{{ sprint()!.learn_snapshot!.benchmarks.avgCtr }}%</p>
              </div>
              <div class="bg-gray-50 rounded-xl p-3">
                <p class="text-xs text-gray-500 mb-0.5">Avg CPA</p>
                <p class="text-lg font-bold">{{ sprint()!.learn_snapshot!.benchmarks.avgCpa | number:'1.0-2' }}</p>
              </div>
              <div class="bg-gray-50 rounded-xl p-3">
                <p class="text-xs text-gray-500 mb-0.5">Total Spend</p>
                <p class="text-lg font-bold">{{ sprint()!.learn_snapshot!.benchmarks.totalSpend | number:'1.0-0' }}</p>
              </div>
              <div class="bg-gray-50 rounded-xl p-3">
                <p class="text-xs text-gray-500 mb-0.5">Top Ads</p>
                <p class="text-lg font-bold">{{ sprint()!.learn_snapshot!.topAds.length }}</p>
              </div>
            </div>
          </div>
        }

        <!-- Plan Review -->
        @if (sprint()!.plan) {
          <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2">
                <lucide-icon name="clipboard-list" [size]="18" class="text-accent"></lucide-icon>
                Sprint Plan
              </h2>
              <span class="text-sm text-gray-500">
                {{ sprint()!.plan!.totalCreatives }} creatives &middot;
                Est. {{ (sprint()!.plan!.totalEstimatedCents / 100) | number:'1.2-2' }} {{ sprint()!.currency }}
              </span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              @for (item of sprint()!.plan!.items; track item.format) {
                <div class="border rounded-xl p-4 relative"
                  [class]="item.winProbability && item.winProbability >= 85 ? 'border-green-300 bg-green-50/30' :
                           item.winProbability && item.winProbability >= 70 ? 'border-gray-200' : 'border-gray-200'">

                  <!-- Win probability badge -->
                  @if (item.winProbability) {
                    <div class="absolute top-3 right-3 flex items-center gap-1">
                      <div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                        [class]="item.winProbability >= 85 ? 'bg-green-500 text-white' :
                                 item.winProbability >= 70 ? 'bg-blue-500 text-white' :
                                 'bg-amber-500 text-white'">
                        {{ item.winProbability }}
                      </div>
                    </div>
                  }

                  <div class="flex items-center gap-2 mb-2">
                    <div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                      <lucide-icon [name]="getFormatIcon(item.format)" [size]="16" class="text-accent"></lucide-icon>
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-gray-900">{{ getFormatLabel(item.format) }}</p>
                      <p class="text-xs text-gray-500">{{ item.count }} &middot; {{ (item.estimated_cost_cents / 100) | number:'1.2-2' }}</p>
                    </div>
                  </div>

                  <!-- Score breakdown bar -->
                  @if (item.scoreBreakdown) {
                    <div class="flex gap-0.5 h-1.5 rounded-full overflow-hidden mb-2">
                      <div class="bg-violet-400 rounded-l" [style.width.%]="(item.scoreBreakdown.formatSignal / 25) * 25" title="Format signal"></div>
                      <div class="bg-blue-400" [style.width.%]="(item.scoreBreakdown.dataBackingSignal / 25) * 25" title="Data backing"></div>
                      <div class="bg-emerald-400" [style.width.%]="(item.scoreBreakdown.diversitySignal / 25) * 25" title="Diversity"></div>
                      <div class="bg-amber-400 rounded-r" [style.width.%]="(item.scoreBreakdown.complianceSignal / 25) * 25" title="Compliance"></div>
                    </div>
                    <div class="flex gap-2 text-[9px] text-gray-400 mb-2">
                      <span>Format {{ item.scoreBreakdown.formatSignal }}/25</span>
                      <span>Data {{ item.scoreBreakdown.dataBackingSignal }}/25</span>
                      <span>Diversity {{ item.scoreBreakdown.diversitySignal }}/25</span>
                      <span>Compliance {{ item.scoreBreakdown.complianceSignal }}/25</span>
                    </div>
                  }

                  <p class="text-xs text-gray-600 leading-relaxed">{{ item.rationale }}</p>

                  <!-- Warnings -->
                  @if (item.warnings?.length) {
                    <div class="mt-2 space-y-1">
                      @for (w of item.warnings; track w) {
                        <p class="text-[10px] text-amber-600 flex items-start gap-1 m-0">
                          <lucide-icon name="alert-triangle" [size]="10" class="shrink-0 mt-0.5"></lucide-icon>
                          {{ w }}
                        </p>
                      }
                    </div>
                  }

                  @if (item.source_ads?.length) {
                    <div class="mt-2 flex flex-wrap gap-1">
                      @for (ad of item.source_ads; track ad.name) {
                        <span class="px-2 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-medium">
                          {{ ad.name | slice:0:20 }} ({{ ad.roas }}x)
                        </span>
                      }
                    </div>
                  }
                </div>
              }
            </div>

            <!-- Removed items by scoring -->
            @if (sprint()!.plan!.scoring?.removed?.length) {
              <div class="border border-dashed border-gray-300 rounded-xl p-4 mb-4 bg-gray-50/50">
                <div class="flex items-center gap-2 mb-3">
                  <lucide-icon name="shield-check" [size]="16" class="text-gray-500"></lucide-icon>
                  <h3 class="text-sm font-semibold text-gray-700 m-0">
                    Filtered by AI Scoring ({{ sprint()!.plan!.scoring!.removed.length }} items removed)
                  </h3>
                  <button
                    (click)="showRemoved.set(!showRemoved())"
                    class="ml-auto text-xs text-accent bg-transparent border-0 cursor-pointer hover:underline">
                    {{ showRemoved() ? 'Hide' : 'Show details' }}
                  </button>
                </div>

                @if (sprint()!.plan!.scoring!.summary) {
                  <div class="flex gap-4 text-xs text-gray-500 mb-2">
                    <span>Avg win probability: {{ sprint()!.plan!.scoring!.summary.avgWinProbability }}%</span>
                    <span>Tokens saved: ~{{ sprint()!.plan!.scoring!.summary.savedTokenEstimate | number:'1.0-0' }}</span>
                  </div>
                }

                @if (showRemoved()) {
                  <div class="space-y-2 mt-3">
                    @for (r of sprint()!.plan!.scoring!.removed; track r.format) {
                      <div class="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-gray-200">
                        <div class="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                          <span class="text-[10px] font-bold text-red-600">{{ r.winProbability }}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-medium text-gray-700 m-0">{{ getFormatLabel(r.format) }} ({{ r.count }})</p>
                          @if (r.warnings?.length) {
                            <p class="text-[10px] text-gray-500 m-0 truncate">{{ r.warnings[0] }}</p>
                          }
                        </div>
                        <span class="text-[10px] text-red-500 font-medium">Below threshold</span>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- Actions based on status -->
            @if (sprint()!.status === 'planning') {
              <div class="flex items-center gap-3 pt-4 border-t border-gray-100">
                <button
                  (click)="approveSprint()"
                  [disabled]="approving()"
                  class="px-5 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2">
                  <lucide-icon name="check" [size]="16"></lucide-icon>
                  Approve & Create Jobs
                </button>
              </div>
            }
            @if (sprint()!.status === 'approved') {
              <div class="pt-4 border-t border-gray-100 space-y-4">
                <h3 class="text-sm font-semibold text-gray-700">Generate Scripts</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input [(ngModel)]="productName" placeholder="Product name" class="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  <input [(ngModel)]="targetAudience" placeholder="Target audience" class="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  <input [(ngModel)]="brandName" placeholder="Brand name" class="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div class="flex items-center gap-3">
                  <button
                    (click)="generateScripts()"
                    [disabled]="scriptLoading()"
                    class="px-5 py-2.5 bg-accent text-white rounded-xl font-medium text-sm hover:bg-accent/90 transition disabled:opacity-50 flex items-center gap-2">
                    @if (scriptLoading()) {
                      <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Generating Scripts...
                    } @else {
                      <lucide-icon name="sparkles" [size]="16"></lucide-icon>
                      Generate All Scripts
                    }
                  </button>
                  @if (getScriptReadyCount() > 0) {
                    <button
                      (click)="startGeneration()"
                      [disabled]="generating()"
                      class="px-5 py-2.5 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2">
                      @if (generating()) {
                        <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Starting...
                      } @else {
                        <lucide-icon name="play" [size]="16"></lucide-icon>
                        Start Generation ({{ getScriptReadyCount() }} ready)
                      }
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- Jobs List -->
        @if (jobs().length > 0) {
          <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <h2 class="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <lucide-icon name="layers" [size]="18" class="text-accent"></lucide-icon>
              Creative Jobs ({{ jobs().length }})
            </h2>

            <!-- Progress bar -->
            @if (sprint()!.status === 'generating' || sprint()!.status === 'approved') {
              <div class="mb-4">
                <div class="flex items-center justify-between text-sm text-gray-500 mb-1">
                  <span>{{ getCompletedCount() }} / {{ jobs().length }} completed</span>
                  <span>{{ jobs().length > 0 ? ((getCompletedCount() / jobs().length) * 100 | number:'1.0-0') : 0 }}%</span>
                </div>
                <div class="w-full bg-gray-100 rounded-full h-2">
                  <div class="bg-accent rounded-full h-2 transition-all" [style.width.%]="jobs().length > 0 ? (getCompletedCount() / jobs().length) * 100 : 0"></div>
                </div>
              </div>
            }

            <!-- Job cards -->
            <div class="space-y-2 max-h-[500px] overflow-y-auto">
              @for (job of jobs(); track job.id) {
                <div class="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center" [class]="getJobStatusBg(job.status)">
                    @if (job.status === 'completed') {
                      <lucide-icon name="check" [size]="14" class="text-green-600"></lucide-icon>
                    } @else if (job.status === 'failed') {
                      <lucide-icon name="x" [size]="14" class="text-red-500"></lucide-icon>
                    } @else if (job.status === 'generating' || job.status === 'polling') {
                      <div class="w-3.5 h-3.5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin"></div>
                    } @else if (job.status === 'script_ready') {
                      <lucide-icon name="file-text" [size]="14" class="text-blue-500"></lucide-icon>
                    } @else {
                      <lucide-icon name="clock" [size]="14" class="text-gray-400"></lucide-icon>
                    }
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900">{{ getFormatLabel(job.format) }}</p>
                    <p class="text-xs text-gray-500">{{ job.status }}
                      @if (job.predicted_score) {
                        &middot; Score: {{ job.predicted_score }}
                      }
                    </p>
                  </div>

                  <!-- Script preview -->
                  @if (job.script?.title) {
                    <span class="text-xs text-gray-400 truncate max-w-[200px]">{{ job.script.title }}</span>
                  }

                  <!-- DNA tags -->
                  @if (job.dna_tags) {
                    <div class="flex gap-1">
                      @for (tag of (job.dna_tags.hook || []).slice(0, 1); track tag) {
                        <span class="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded text-[10px]">{{ tag }}</span>
                      }
                    </div>
                  }

                  <!-- Actions -->
                  @if (job.status === 'failed') {
                    <button
                      (click)="retryJob(job.id)"
                      class="px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded transition">
                      Retry
                    </button>
                  }
                  @if (job.status === 'completed' && job.output_url) {
                    <div class="flex gap-1">
                      <button
                        (click)="approveAsset(job.id)"
                        class="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded transition">
                        Approve
                      </button>
                      <button
                        (click)="rejectAsset(job.id)"
                        class="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition">
                        Reject
                      </button>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Review Grid (completed creatives) -->
        @if (getCompletedJobs().length > 0 && (sprint()!.status === 'reviewing' || sprint()!.status === 'generating')) {
          <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2">
                <lucide-icon name="eye" [size]="18" class="text-accent"></lucide-icon>
                Review Creatives ({{ getCompletedJobs().length }})
              </h2>
              <div class="flex items-center gap-2">
                <select [(ngModel)]="reviewFilter" class="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
                  <option value="all">All Formats</option>
                  @for (fmt of getUniqueFormats(); track fmt) {
                    <option [value]="fmt">{{ getFormatLabel(fmt) }}</option>
                  }
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              @for (job of getFilteredCompletedJobs(); track job.id) {
                <div class="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition group">
                  <!-- Media preview -->
                  <div class="relative aspect-[9/16] max-h-[280px] bg-gray-900 flex items-center justify-center overflow-hidden">
                    @if (isVideoFormat(job.format)) {
                      @if (job.output_url) {
                        <video
                          [src]="job.output_url"
                          class="w-full h-full object-cover"
                          controls
                          preload="metadata"
                          [poster]="job.output_thumbnail || ''">
                        </video>
                      } @else {
                        <lucide-icon name="video-off" [size]="32" class="text-gray-600"></lucide-icon>
                      }
                    } @else {
                      @if (job.output_url) {
                        <img [src]="job.output_url" [alt]="job.format" class="w-full h-full object-cover" />
                      } @else {
                        <lucide-icon name="image-off" [size]="32" class="text-gray-600"></lucide-icon>
                      }
                    }

                    <!-- Score badge -->
                    @if (job.predicted_score) {
                      <div class="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold"
                        [class]="job.predicted_score >= 70 ? 'bg-green-500 text-white' : job.predicted_score >= 40 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'">
                        {{ job.predicted_score }}
                      </div>
                    }
                  </div>

                  <div class="p-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-sm font-medium text-gray-900">{{ getFormatLabel(job.format) }}</span>
                      <span class="text-[10px] text-gray-400">{{ job.cost_cents > 0 ? ((job.cost_cents / 100) | number:'1.2-2') + ' ' + sprint()!.currency : '' }}</span>
                    </div>

                    <!-- DNA tags -->
                    @if (job.dna_tags) {
                      <div class="flex flex-wrap gap-1 mb-2">
                        @for (tag of (job.dna_tags.hook || []).slice(0, 2); track tag) {
                          <span class="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded text-[10px]">{{ tag }}</span>
                        }
                        @for (tag of (job.dna_tags.visual || []).slice(0, 1); track tag) {
                          <span class="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">{{ tag }}</span>
                        }
                      </div>
                    }

                    <!-- Actions -->
                    <div class="flex items-center gap-2 pt-2 border-t border-gray-100">
                      <button
                        (click)="approveAsset(job.id)"
                        class="flex-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition">
                        Approve
                      </button>
                      <button
                        (click)="rejectAsset(job.id)"
                        class="flex-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition">
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- Publish to Meta -->
        @if (sprint()!.status === 'reviewing' || sprint()!.status === 'published') {
          <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <h2 class="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <lucide-icon name="send" [size]="18" class="text-accent"></lucide-icon>
              Publish to Meta
            </h2>

            @if (sprint()!.status === 'published') {
              <div class="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
                Sprint published. Use "Track Performance" to fetch metrics after 3-7 days.
              </div>
            } @else {
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div>
                  <label class="block text-xs font-body font-semibold text-gray-600 mb-1">Ad Account</label>
                  <input [(ngModel)]="publishAccountId" placeholder="Ad Account ID (act_...)" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" readonly />
                </div>
                <div>
                  <label class="block text-xs font-body font-semibold text-gray-600 mb-1">Facebook Page</label>
                  @if (loadingPages()) {
                    <div class="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-400">Loading pages...</div>
                  } @else if (facebookPages().length > 0) {
                    <select [(ngModel)]="publishPageId" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      <option value="">Select a page</option>
                      @for (page of facebookPages(); track page.id) {
                        <option [value]="page.id">{{ page.name }}</option>
                      }
                    </select>
                  } @else {
                    <input [(ngModel)]="publishPageId" placeholder="Page ID (no pages found)" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  }
                </div>
              </div>
              <button
                (click)="publishSprint()"
                [disabled]="publishing()"
                class="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
                @if (publishing()) {
                  <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Publishing...
                } @else {
                  <lucide-icon name="send" [size]="16"></lucide-icon>
                  Publish to Meta (as PAUSED)
                }
              </button>
            }

            @if (sprint()!.status === 'published') {
              <button
                (click)="trackPerformance()"
                [disabled]="tracking()"
                class="mt-3 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2">
                @if (tracking()) {
                  <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Fetching Metrics...
                } @else {
                  <lucide-icon name="bar-chart-2" [size]="16"></lucide-icon>
                  Track Performance
                }
              </button>
            }
          </div>
        }

        <!-- Performance Results -->
        @if (assets().length > 0) {
          <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <h2 class="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <lucide-icon name="bar-chart-2" [size]="18" class="text-accent"></lucide-icon>
              Performance ({{ assets().length }} assets)
            </h2>
            <div class="space-y-2">
              @for (asset of assets(); track asset.id) {
                <div class="flex items-center gap-3 p-3 rounded-lg border border-gray-100">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900">{{ asset.name }}</p>
                    <p class="text-xs text-gray-500">{{ asset.format }} &middot; {{ asset.status }}</p>
                  </div>
                  @if (asset.predicted_score) {
                    <div class="text-center">
                      <p class="text-[10px] text-gray-400">Predicted</p>
                      <p class="text-sm font-bold text-gray-700">{{ asset.predicted_score }}</p>
                    </div>
                  }
                  @if (asset.actual_metrics) {
                    <div class="flex gap-3">
                      <div class="text-center">
                        <p class="text-[10px] text-gray-400">ROAS</p>
                        <p class="text-sm font-bold" [class]="asset.actual_metrics.roas >= 2 ? 'text-green-600' : 'text-gray-700'">{{ asset.actual_metrics.roas }}x</p>
                      </div>
                      <div class="text-center">
                        <p class="text-[10px] text-gray-400">CTR</p>
                        <p class="text-sm font-bold text-gray-700">{{ asset.actual_metrics.ctr }}%</p>
                      </div>
                      <div class="text-center">
                        <p class="text-[10px] text-gray-400">Spend</p>
                        <p class="text-sm font-bold text-gray-700">{{ asset.actual_metrics.spend | number:'1.0-0' }}</p>
                      </div>
                    </div>
                  } @else if (asset.status === 'published') {
                    <span class="text-xs text-amber-600">Awaiting metrics (3-7 days)</span>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Cost Summary -->
        @if (sprint()!.estimated_cost_cents > 0 || sprint()!.actual_cost_cents > 0) {
          <div class="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 class="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <lucide-icon name="credit-card" [size]="18" class="text-accent"></lucide-icon>
              Cost Summary
            </h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="bg-gray-50 rounded-xl p-3">
                <p class="text-xs text-gray-500 mb-0.5">Estimated</p>
                <p class="text-lg font-bold text-gray-900">{{ (sprint()!.estimated_cost_cents / 100) | number:'1.2-2' }}</p>
                <p class="text-[10px] text-gray-400">{{ sprint()!.currency }}</p>
              </div>
              <div class="bg-gray-50 rounded-xl p-3">
                <p class="text-xs text-gray-500 mb-0.5">Actual</p>
                <p class="text-lg font-bold" [class]="sprint()!.actual_cost_cents > sprint()!.estimated_cost_cents ? 'text-red-600' : 'text-green-600'">
                  {{ (sprint()!.actual_cost_cents / 100) | number:'1.2-2' }}
                </p>
                <p class="text-[10px] text-gray-400">{{ sprint()!.currency }}</p>
              </div>
              <div class="bg-gray-50 rounded-xl p-3">
                <p class="text-xs text-gray-500 mb-0.5">Cost per Creative</p>
                <p class="text-lg font-bold text-gray-900">
                  {{ getCompletedCount() > 0 ? ((sprint()!.actual_cost_cents / getCompletedCount() / 100) | number:'1.2-2') : '0.00' }}
                </p>
                <p class="text-[10px] text-gray-400">{{ sprint()!.currency }} avg</p>
              </div>
              <div class="bg-gray-50 rounded-xl p-3">
                <p class="text-xs text-gray-500 mb-0.5">Savings</p>
                <p class="text-lg font-bold text-green-600">
                  {{ sprint()!.estimated_cost_cents > sprint()!.actual_cost_cents
                    ? ((sprint()!.estimated_cost_cents - sprint()!.actual_cost_cents) / 100 | number:'1.2-2')
                    : '0.00' }}
                </p>
                <p class="text-[10px] text-gray-400">under budget</p>
              </div>
            </div>

            <!-- Cost by format -->
            @if (getCostByFormat().length > 0) {
              <div class="mt-4 pt-4 border-t border-gray-100">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">By Format</h3>
                <div class="space-y-1.5">
                  @for (item of getCostByFormat(); track item.format) {
                    <div class="flex items-center justify-between text-sm">
                      <span class="text-gray-700">{{ getFormatLabel(item.format) }} ({{ item.count }})</span>
                      <span class="font-medium text-gray-900">{{ (item.cost / 100) | number:'1.2-2' }} {{ sprint()!.currency }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export default class SprintDetailComponent implements OnInit, OnDestroy {
  private engineService = inject(CreativeEngineService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private adAccountService = inject(AdAccountService);
  private apiService = inject(ApiService);

  sprint = signal<Sprint | null>(null);
  jobs = signal<CreativeJob[]>([]);
  assets = signal<any[]>([]);
  loading = signal(true);
  approving = signal(false);
  scriptLoading = signal(false);
  generating = signal(false);
  publishing = signal(false);
  tracking = signal(false);
  showRemoved = signal(false);
  loadingPages = signal(false);
  facebookPages = signal<{ id: string; name: string; category: string }[]>([]);

  productName = '';
  targetAudience = '';
  brandName = '';
  reviewFilter = 'all';
  publishAccountId = '';
  publishPageId = '';

  private pollSub: Subscription | null = null;

  ngOnInit() {
    const acc = this.adAccountService.currentAccount();
    if (acc) this.publishAccountId = acc.id;
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadSprint(id);
    this.fetchPages();
  }

  private fetchPages() {
    this.loadingPages.set(true);
    this.apiService.get<{ success: boolean; pages: { id: string; name: string; category: string }[] }>(
      environment.AD_ACCOUNT_PAGES
    ).subscribe({
      next: (res) => {
        this.loadingPages.set(false);
        if (res.success && res.pages?.length) {
          this.facebookPages.set(res.pages);
          // Auto-select first page if none selected
          if (!this.publishPageId) {
            this.publishPageId = res.pages[0].id;
          }
        }
      },
      error: () => this.loadingPages.set(false),
    });
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
  }

  loadSprint(id: string) {
    this.loading.set(true);
    this.engineService.getSprint(id).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.success) {
          this.sprint.set(res.sprint);
          this.jobs.set(res.jobs);
          this.assets.set(res.assets || []);

          // Start polling if generating
          if (res.sprint.status === 'generating') {
            this.startPolling(id);
          }
        }
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Error', 'Could not load sprint');
      },
    });
  }

  startPolling(sprintId: string) {
    this.pollSub?.unsubscribe();
    this.pollSub = this.engineService.pollProgress(sprintId).subscribe({
      next: (res) => {
        if (res.success) {
          // Reload full sprint data on each poll
          this.loadSprint(sprintId);
        }
      },
    });
  }

  approveSprint() {
    const s = this.sprint();
    if (!s) return;
    this.approving.set(true);
    this.engineService.approveSprint(s.id).subscribe({
      next: (res) => {
        this.approving.set(false);
        if (res.success) {
          this.toast.success('Approved', `${res.jobs_created} jobs created.`);
          this.loadSprint(s.id);
        }
      },
      error: (err) => {
        this.approving.set(false);
        this.toast.error('Error', err.error?.error || 'Approval failed');
      },
    });
  }

  generateScripts() {
    const s = this.sprint();
    if (!s) return;
    this.scriptLoading.set(true);
    this.engineService.generateScripts(s.id, {
      product_name: this.productName,
      target_audience: this.targetAudience,
      brand_name: this.brandName,
    }).subscribe({
      next: (res) => {
        this.scriptLoading.set(false);
        if (res.success) {
          this.toast.success('Scripts Generated', `${res.scripts_generated} scripts created.`);
          this.loadSprint(s.id);
        }
      },
      error: (err) => {
        this.scriptLoading.set(false);
        this.toast.error('Error', err.error?.error || 'Script generation failed');
      },
    });
  }

  retryJob(jobId: string) {
    this.engineService.retryJob(jobId).subscribe({
      next: () => {
        this.toast.success('Retrying', 'Job queued for retry.');
        const s = this.sprint();
        if (s) this.loadSprint(s.id);
      },
    });
  }

  approveAsset(jobId: string) {
    this.engineService.approveAsset(jobId).subscribe({
      next: () => {
        this.toast.success('Approved', 'Creative approved.');
        const s = this.sprint();
        if (s) this.loadSprint(s.id);
      },
    });
  }

  rejectAsset(jobId: string) {
    this.engineService.rejectAsset(jobId).subscribe({
      next: () => {
        this.toast.success('Rejected', 'Creative rejected.');
        const s = this.sprint();
        if (s) this.loadSprint(s.id);
      },
    });
  }

  publishSprint() {
    const s = this.sprint();
    if (!s || !this.publishAccountId || !this.publishPageId) {
      this.toast.error('Error', 'Account ID and Page ID are required');
      return;
    }
    this.publishing.set(true);
    this.engineService.publishSprint(s.id, {
      account_id: this.publishAccountId,
      page_id: this.publishPageId,
    }).subscribe({
      next: (res) => {
        this.publishing.set(false);
        if (res.success) {
          this.toast.success('Published', `${res.published} creatives published to Meta.`);
          this.loadSprint(s.id);
        }
      },
      error: (err) => {
        this.publishing.set(false);
        this.toast.error('Error', err.error?.error || 'Publish failed');
      },
    });
  }

  trackPerformance() {
    const s = this.sprint();
    if (!s) return;
    this.tracking.set(true);
    this.engineService.trackPerformance(s.id).subscribe({
      next: (res) => {
        this.tracking.set(false);
        if (res.success) {
          this.toast.success('Tracked', `Metrics fetched for ${res.tracked}/${res.total} assets.`);
          this.loadSprint(s.id);
        }
      },
      error: (err) => {
        this.tracking.set(false);
        this.toast.error('Error', err.error?.error || 'Tracking failed');
      },
    });
  }

  startGeneration() {
    const s = this.sprint();
    if (!s) return;
    this.generating.set(true);
    this.engineService.startGeneration(s.id).subscribe({
      next: (res) => {
        this.generating.set(false);
        if (res.success) {
          this.toast.success('Generation Started', 'Creatives are being generated.');
          this.loadSprint(s.id);
        }
      },
      error: (err) => {
        this.generating.set(false);
        this.toast.error('Error', err.error?.error || 'Failed to start generation');
      },
    });
  }

  getScriptReadyCount(): number {
    return this.jobs().filter(j => j.status === 'script_ready').length;
  }

  getCompletedJobs(): CreativeJob[] {
    return this.jobs().filter(j => j.status === 'completed');
  }

  getFilteredCompletedJobs(): CreativeJob[] {
    const completed = this.getCompletedJobs();
    if (this.reviewFilter === 'all') return completed;
    return completed.filter(j => j.format === this.reviewFilter);
  }

  getUniqueFormats(): string[] {
    const formats = new Set(this.getCompletedJobs().map(j => j.format));
    return Array.from(formats);
  }

  isVideoFormat(format: string): boolean {
    const videoFormats = ['ugc_talking_head', 'podcast_clip', 'skit', 'before_after',
      'product_demo', 'testimonial_mashup', 'interview', 'unboxing'];
    return videoFormats.includes(format) || format.includes('video');
  }

  getCostByFormat(): { format: string; count: number; cost: number }[] {
    const map = new Map<string, { count: number; cost: number }>();
    for (const job of this.jobs()) {
      if (job.cost_cents > 0) {
        const existing = map.get(job.format) || { count: 0, cost: 0 };
        existing.count++;
        existing.cost += job.cost_cents;
        map.set(job.format, existing);
      }
    }
    return Array.from(map.entries())
      .map(([format, data]) => ({ format, ...data }))
      .sort((a, b) => b.cost - a.cost);
  }

  cancelSprint() {
    const s = this.sprint();
    if (!s) return;
    this.engineService.cancelSprint(s.id).subscribe({
      next: () => {
        this.toast.success('Cancelled', 'Sprint generation cancelled.');
        this.loadSprint(s.id);
      },
    });
  }

  duplicateSprint() {
    const s = this.sprint();
    if (!s) return;
    this.engineService.duplicateSprint(s.id).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success('Duplicated', `Sprint "${res.name}" created.`);
          this.router.navigate(['/app/creative-engine', res.sprint_id]);
        }
      },
      error: (err) => {
        this.toast.error('Error', err.error?.error || 'Could not duplicate sprint');
      },
    });
  }

  deleteSprint() {
    const s = this.sprint();
    if (!s) return;
    if (!confirm(`Delete sprint "${s.name}"? This cannot be undone.`)) return;
    this.engineService.deleteSprint(s.id).subscribe({
      next: () => {
        this.toast.success('Deleted', 'Sprint deleted.');
        this.goBack();
      },
    });
  }

  goBack() {
    this.router.navigate(['/app/creative-engine']);
  }

  getCompletedCount(): number {
    return this.jobs().filter(j => j.status === 'completed').length;
  }

  getFormatLabel(format: string): string {
    return getFormatMeta(format).label;
  }

  getFormatIcon(format: string): string {
    return getFormatMeta(format).icon;
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      analyzing: 'bg-blue-50 text-blue-700',
      planning: 'bg-purple-50 text-purple-700',
      approved: 'bg-indigo-50 text-indigo-700',
      generating: 'bg-amber-50 text-amber-700',
      reviewing: 'bg-cyan-50 text-cyan-700',
      published: 'bg-green-50 text-green-700',
      archived: 'bg-gray-100 text-gray-600',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  }

  getJobStatusBg(status: string): string {
    const map: Record<string, string> = {
      pending: 'bg-gray-100',
      script_ready: 'bg-blue-50',
      generating: 'bg-amber-50',
      polling: 'bg-amber-50',
      completed: 'bg-green-50',
      failed: 'bg-red-50',
      cancelled: 'bg-gray-100',
    };
    return map[status] || 'bg-gray-100';
  }
}
