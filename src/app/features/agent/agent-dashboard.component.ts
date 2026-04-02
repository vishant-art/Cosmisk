import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { environment } from '../../../environments/environment';

interface AgentDecision {
  id: string;
  run_id: string;
  account_id: string | null;
  type: string;
  target_id: string | null;
  target_name: string | null;
  reasoning: string;
  confidence: string;
  urgency: string;
  suggested_action: string;
  estimated_impact: string | null;
  status: string;
  approved_at: string | null;
  executed_at: string | null;
  outcome_checked_at: string | null;
  outcome: string | null;
}

interface AgentRun {
  id: string;
  agent_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  summary: string | null;
}

interface Briefing {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  summary: string | null;
  data: {
    summary: string;
    sections: { title: string; content: string }[];
    actionItems: string[];
  } | null;
}

interface MemoryCore { agent_type: string; key: string; value: string; updated_at: string }
interface MemoryEpisode { id: string; agent_type: string; event: string; context: string | null; outcome: string | null; relevance_score: number; reinforcement_count: number; created_at: string }
interface MemoryEntity { entity_type: string; entity_name: string; mention_count: number; first_seen: string; last_seen: string }
interface MemoryStats { totalCoreMemories: number; totalEpisodes: number; totalEntities: number }

type TabKey = 'decisions' | 'briefing' | 'runs' | 'memory';

@Component({
  selector: 'app-agent-dashboard',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-display font-bold text-navy m-0">The Brain</h1>
          <p class="text-sm font-body text-gray-500 mt-1 m-0">
            Autonomous AI agents monitoring and optimizing your ad accounts
          </p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          @if (pendingCount() > 0) {
            <span class="px-2.5 py-1 text-xs font-bold font-mono bg-amber-100 text-amber-700 rounded-full">
              {{ pendingCount() }} pending
            </span>
          }
          <button
            (click)="triggerReport()"
            [disabled]="triggeringReport()"
            class="px-3 py-2 text-sm font-body font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer border-0">
            <lucide-icon name="file-text" [size]="16"></lucide-icon>
            {{ triggeringReport() ? 'Running...' : 'Run Report' }}
          </button>
          <button
            (click)="triggerContent()"
            [disabled]="triggeringContent()"
            class="px-3 py-2 text-sm font-body font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer border-0">
            <lucide-icon name="pen-tool" [size]="16"></lucide-icon>
            {{ triggeringContent() ? 'Running...' : 'Run Content' }}
          </button>
          <button
            (click)="triggerWatchdog()"
            [disabled]="triggeringWatchdog()"
            class="px-3 py-2 text-sm font-body font-semibold rounded-xl bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer border-0">
            <lucide-icon name="scan-eye" [size]="16"></lucide-icon>
            {{ triggeringWatchdog() ? 'Running...' : 'Run Watchdog' }}
          </button>
        </div>
      </div>

      <!-- Stats Row -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-card shadow-card p-4">
          <div class="flex items-center gap-2 mb-1">
            <div class="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <lucide-icon name="clock" [size]="16" class="text-amber-500"></lucide-icon>
            </div>
            <span class="text-xs font-body text-gray-500">Pending</span>
          </div>
          <span class="text-xl font-display font-bold text-navy">{{ pendingCount() }}</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <div class="flex items-center gap-2 mb-1">
            <div class="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <lucide-icon name="check-circle" [size]="16" class="text-emerald-500"></lucide-icon>
            </div>
            <span class="text-xs font-body text-gray-500">Executed</span>
          </div>
          <span class="text-xl font-display font-bold text-navy">{{ executedCount() }}</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <div class="flex items-center gap-2 mb-1">
            <div class="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <lucide-icon name="x-circle" [size]="16" class="text-red-500"></lucide-icon>
            </div>
            <span class="text-xs font-body text-gray-500">Rejected</span>
          </div>
          <span class="text-xl font-display font-bold text-navy">{{ rejectedCount() }}</span>
        </div>
        <div class="bg-white rounded-card shadow-card p-4">
          <div class="flex items-center gap-2 mb-1">
            <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <lucide-icon name="activity" [size]="16" class="text-blue-500"></lucide-icon>
            </div>
            <span class="text-xs font-body text-gray-500">Total Runs</span>
          </div>
          <span class="text-xl font-display font-bold text-navy">{{ runs().length }}</span>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        @for (tab of tabs; track tab.key) {
          <button
            (click)="activeTab.set(tab.key)"
            class="px-4 py-2 text-sm font-body font-medium rounded-lg transition-all cursor-pointer border-0"
            [class]="activeTab() === tab.key
              ? 'bg-white text-navy shadow-sm'
              : 'bg-transparent text-gray-500 hover:text-gray-700'">
            {{ tab.label }}
          </button>
        }
      </div>

      <!-- Decisions Tab -->
      @if (activeTab() === 'decisions') {
        @if (loadingDecisions()) {
          <div class="space-y-3">
            @for (i of [1,2,3]; track i) {
              <div class="bg-white rounded-card shadow-card p-5 animate-pulse">
                <div class="flex items-start gap-4">
                  <div class="w-10 h-10 bg-gray-200 rounded-xl"></div>
                  <div class="flex-1">
                    <div class="h-4 bg-gray-200 rounded w-1/3 mb-3"></div>
                    <div class="h-3 bg-gray-200 rounded w-2/3 mb-2"></div>
                    <div class="h-3 bg-gray-200 rounded w-1/4"></div>
                  </div>
                </div>
              </div>
            }
          </div>
        } @else if (decisions().length > 0) {
          <div class="space-y-3">
            @for (d of decisions(); track d.id) {
              <div class="bg-white rounded-card shadow-card p-5 border-l-4 transition-all hover:shadow-md"
                [class]="getUrgencyBorderClass(d.urgency)">
                <div class="flex items-start gap-4">
                  <!-- Urgency Icon -->
                  <div class="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                    [class]="getUrgencyBgClass(d.urgency)">
                    <lucide-icon
                      [name]="getUrgencyIcon(d.urgency)"
                      [size]="20"
                      [class]="getUrgencyTextClass(d.urgency)">
                    </lucide-icon>
                  </div>

                  <!-- Content -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-3 mb-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <h3 class="text-sm font-display font-bold text-navy m-0">
                          {{ d.suggested_action }}
                        </h3>
                        @if (d.status === 'pending') {
                          <span class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                        }
                      </div>
                      <span class="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-md"
                        [class]="getStatusBadgeClass(d.status)">
                        {{ d.status }}
                      </span>
                    </div>

                    @if (d.target_name) {
                      <p class="text-xs font-body font-semibold text-gray-700 m-0 mb-1">
                        Target: {{ d.target_name }}
                      </p>
                    }

                    <p class="text-sm font-body text-gray-600 m-0 mb-2 leading-relaxed">
                      {{ d.reasoning }}
                    </p>

                    @if (d.estimated_impact) {
                      <p class="text-xs font-body text-accent m-0 mb-2">
                        Estimated impact: {{ d.estimated_impact }}
                      </p>
                    }

                    @if (d.outcome) {
                      <div class="bg-emerald-50 rounded-lg px-3 py-2 mb-2">
                        <p class="text-xs font-body text-emerald-700 m-0">
                          Outcome: {{ d.outcome }}
                        </p>
                      </div>
                    }

                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-md bg-gray-100 text-gray-600">
                        {{ formatType(d.type) }}
                      </span>
                      <span class="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-md"
                        [class]="getUrgencyBadgeClass(d.urgency)">
                        {{ d.urgency }}
                      </span>
                      <span class="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-md bg-blue-50 text-blue-700">
                        {{ d.confidence }} confidence
                      </span>
                      @if (d.account_id) {
                        <span class="text-[11px] font-body text-gray-400">
                          Account: {{ d.account_id }}
                        </span>
                      }
                    </div>

                    <!-- Action buttons for pending decisions -->
                    @if (d.status === 'pending') {
                      <div class="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button
                          (click)="approveDecision(d)"
                          [disabled]="processingId() === d.id"
                          class="px-4 py-1.5 text-xs font-body font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-all cursor-pointer border-0 flex items-center gap-1.5">
                          <lucide-icon name="check" [size]="14"></lucide-icon>
                          Approve & Execute
                        </button>
                        <button
                          (click)="rejectDecision(d)"
                          [disabled]="processingId() === d.id"
                          class="px-4 py-1.5 text-xs font-body font-semibold rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5">
                          <lucide-icon name="x" [size]="14"></lucide-icon>
                          Reject
                        </button>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="bg-white rounded-card shadow-card p-12 text-center">
            <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <lucide-icon name="scan-eye" [size]="28" class="text-gray-400"></lucide-icon>
            </div>
            <h3 class="text-lg font-display font-bold text-navy m-0 mb-2">No decisions yet</h3>
            <p class="text-sm font-body text-gray-500 m-0 max-w-sm mx-auto">
              The watchdog agent runs daily at 7 AM IST. Trigger a manual run to analyze your ad accounts now.
            </p>
          </div>
        }
      }

      <!-- Briefing Tab -->
      @if (activeTab() === 'briefing') {
        @if (loadingBriefing()) {
          <div class="bg-white rounded-card shadow-card p-6 animate-pulse">
            <div class="h-5 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div class="h-3 bg-gray-200 rounded w-full mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
            <div class="h-4 bg-gray-200 rounded w-1/4 mb-3"></div>
            <div class="h-3 bg-gray-200 rounded w-full mb-2"></div>
            <div class="h-3 bg-gray-200 rounded w-3/4"></div>
          </div>
        } @else if (briefing()) {
          <div class="space-y-4">
            <!-- Briefing Header -->
            <div class="bg-white rounded-card shadow-card p-6">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <lucide-icon name="sunrise" [size]="20" class="text-accent"></lucide-icon>
                  </div>
                  <div>
                    <h2 class="text-base font-display font-bold text-navy m-0">Morning Briefing</h2>
                    <p class="text-xs font-body text-gray-400 m-0">{{ formatDate(briefing()!.started_at) }}</p>
                  </div>
                </div>
                <span class="px-2 py-0.5 text-[11px] font-mono font-semibold rounded-md"
                  [class]="briefing()!.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'">
                  {{ briefing()!.status }}
                </span>
              </div>

              @if (briefing()!.data) {
                <!-- Summary -->
                <p class="text-sm font-body text-gray-700 leading-relaxed m-0 mb-4">
                  {{ briefing()!.data!.summary }}
                </p>

                <!-- Sections -->
                @for (section of briefing()!.data!.sections; track section.title) {
                  <div class="mb-4 last:mb-0">
                    <h3 class="text-sm font-display font-bold text-navy m-0 mb-1.5">{{ section.title }}</h3>
                    <p class="text-sm font-body text-gray-600 m-0 leading-relaxed whitespace-pre-line">{{ section.content }}</p>
                  </div>
                }

                <!-- Action Items -->
                @if (briefing()!.data!.actionItems?.length) {
                  <div class="mt-4 pt-4 border-t border-gray-100">
                    <h3 class="text-sm font-display font-bold text-navy m-0 mb-2">Action Items</h3>
                    <ul class="list-none p-0 m-0 space-y-2">
                      @for (item of briefing()!.data!.actionItems; track item; let i = $index) {
                        <li class="flex items-start gap-2 text-sm font-body text-gray-700">
                          <span class="shrink-0 w-5 h-5 rounded-full bg-accent/10 text-accent text-[11px] font-bold flex items-center justify-center mt-0.5">{{ i + 1 }}</span>
                          {{ item }}
                        </li>
                      }
                    </ul>
                  </div>
                }
              } @else if (briefing()!.summary) {
                <p class="text-sm font-body text-gray-600 m-0">{{ briefing()!.summary }}</p>
              }
            </div>
          </div>
        } @else {
          <div class="bg-white rounded-card shadow-card p-12 text-center">
            <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <lucide-icon name="sunrise" [size]="28" class="text-gray-400"></lucide-icon>
            </div>
            <h3 class="text-lg font-display font-bold text-navy m-0 mb-2">No briefing yet</h3>
            <p class="text-sm font-body text-gray-500 m-0 max-w-sm mx-auto">
              The morning briefing runs daily at 7:05 AM IST after the watchdog completes.
            </p>
          </div>
        }
      }

      <!-- Runs Tab -->
      @if (activeTab() === 'runs') {
        @if (loadingRuns()) {
          <div class="space-y-3">
            @for (i of [1,2,3]; track i) {
              <div class="bg-white rounded-card shadow-card p-4 animate-pulse">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 bg-gray-200 rounded-lg"></div>
                  <div class="flex-1">
                    <div class="h-3 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div class="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            }
          </div>
        } @else if (runs().length > 0) {
          <div class="space-y-2">
            @for (run of runs(); track run.id) {
              <div class="bg-white rounded-card shadow-card p-4 hover:shadow-md transition-all">
                <div class="flex items-center gap-3">
                  <div class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                    [class]="getAgentTypeBgClass(run.agent_type)">
                    <lucide-icon
                      [name]="getAgentTypeIcon(run.agent_type)"
                      [size]="16"
                      [class]="getAgentTypeTextClass(run.agent_type)">
                    </lucide-icon>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-body font-semibold text-navy">{{ formatAgentType(run.agent_type) }}</span>
                      <span class="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded"
                        [class]="run.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                          : run.status === 'running' ? 'bg-blue-100 text-blue-700'
                          : 'bg-red-100 text-red-700'">
                        {{ run.status }}
                      </span>
                    </div>
                    @if (run.summary) {
                      <p class="text-xs font-body text-gray-500 m-0 mt-0.5 truncate">{{ run.summary }}</p>
                    }
                  </div>
                  <span class="text-xs font-body text-gray-400 shrink-0">
                    {{ getRelativeTime(run.started_at) }}
                  </span>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="bg-white rounded-card shadow-card p-12 text-center">
            <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <lucide-icon name="activity" [size]="28" class="text-gray-400"></lucide-icon>
            </div>
            <h3 class="text-lg font-display font-bold text-navy m-0 mb-2">No agent runs</h3>
            <p class="text-sm font-body text-gray-500 m-0 max-w-sm mx-auto">
              Agent runs will appear here after the watchdog or briefing agent runs.
            </p>
          </div>
        }
      }

      <!-- Memory Tab -->
      @if (activeTab() === 'memory') {
        @if (loadingMemory()) {
          <div class="space-y-3">
            @for (i of [1,2,3]; track i) {
              <div class="bg-white rounded-card shadow-card p-5 animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-1/4 mb-3"></div>
                <div class="h-3 bg-gray-200 rounded w-2/3 mb-2"></div>
                <div class="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            }
          </div>
        } @else {
          <!-- Memory Stats -->
          <div class="grid grid-cols-3 gap-4 mb-4">
            <div class="bg-white rounded-card shadow-card p-4 text-center">
              <span class="text-2xl font-display font-bold text-navy">{{ memoryStats().totalCoreMemories }}</span>
              <p class="text-xs font-body text-gray-500 m-0 mt-1">Core Memories</p>
            </div>
            <div class="bg-white rounded-card shadow-card p-4 text-center">
              <span class="text-2xl font-display font-bold text-navy">{{ memoryStats().totalEpisodes }}</span>
              <p class="text-xs font-body text-gray-500 m-0 mt-1">Episodes</p>
            </div>
            <div class="bg-white rounded-card shadow-card p-4 text-center">
              <span class="text-2xl font-display font-bold text-navy">{{ memoryStats().totalEntities }}</span>
              <p class="text-xs font-body text-gray-500 m-0 mt-1">Entities</p>
            </div>
          </div>

          <!-- Memory Sub-tabs -->
          <div class="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-4">
            @for (sub of memorySubTabs; track sub) {
              <button
                (click)="activeMemorySubTab.set(sub)"
                class="px-3 py-1.5 text-xs font-body font-medium rounded-lg transition-all cursor-pointer border-0"
                [class]="activeMemorySubTab() === sub ? 'bg-white text-navy shadow-sm' : 'bg-transparent text-gray-500 hover:text-gray-700'">
                {{ sub }}
              </button>
            }
          </div>

          <!-- Core Memories -->
          @if (activeMemorySubTab() === 'Core') {
            @if (memoryCore().length > 0) {
              <div class="space-y-2">
                @for (mem of memoryCore(); track mem.key + mem.agent_type) {
                  <div class="bg-white rounded-card shadow-card p-4">
                    <div class="flex items-center justify-between mb-1">
                      <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 text-[10px] font-mono rounded-full"
                          [class]="getAgentTypeClass(mem.agent_type)">
                          {{ mem.agent_type }}
                        </span>
                        <span class="text-sm font-display font-semibold text-navy">{{ mem.key }}</span>
                      </div>
                      <span class="text-[10px] font-body text-gray-400">{{ getRelativeTime(mem.updated_at) }}</span>
                    </div>
                    <p class="text-sm font-body text-gray-600 m-0 leading-relaxed">{{ mem.value }}</p>
                  </div>
                }
              </div>
            } @else {
              <div class="bg-white rounded-card shadow-card p-8 text-center">
                <lucide-icon name="brain" [size]="28" class="text-gray-300 mx-auto mb-2"></lucide-icon>
                <p class="text-sm font-body text-gray-500 m-0">No core memories yet. Run the watchdog agent to start building memory.</p>
              </div>
            }
          }

          <!-- Episodes -->
          @if (activeMemorySubTab() === 'Episodes') {
            @if (memoryEpisodes().length > 0) {
              <div class="space-y-2">
                @for (ep of memoryEpisodes(); track ep.id) {
                  <div class="bg-white rounded-card shadow-card p-4 border-l-4"
                    [class]="ep.relevance_score >= 2 ? 'border-l-emerald-400' : ep.relevance_score >= 1 ? 'border-l-blue-400' : 'border-l-gray-300'">
                    <div class="flex items-center justify-between mb-1">
                      <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 text-[10px] font-mono rounded-full"
                          [class]="getAgentTypeClass(ep.agent_type)">
                          {{ ep.agent_type }}
                        </span>
                        <div class="flex items-center gap-1">
                          <span class="text-[10px] font-mono text-gray-400">relevance: {{ ep.relevance_score.toFixed(1) }}</span>
                          @if (ep.reinforcement_count > 0) {
                            <span class="text-[10px] font-mono text-emerald-500">+{{ ep.reinforcement_count }} reinforced</span>
                          }
                        </div>
                      </div>
                      <span class="text-[10px] font-body text-gray-400">{{ getRelativeTime(ep.created_at) }}</span>
                    </div>
                    <p class="text-sm font-body text-navy m-0 font-medium">{{ ep.event }}</p>
                    @if (ep.outcome) {
                      <p class="text-xs font-body text-gray-500 m-0 mt-1">
                        Outcome: {{ ep.outcome }}
                      </p>
                    }
                  </div>
                }
              </div>
            } @else {
              <div class="bg-white rounded-card shadow-card p-8 text-center">
                <lucide-icon name="history" [size]="28" class="text-gray-300 mx-auto mb-2"></lucide-icon>
                <p class="text-sm font-body text-gray-500 m-0">No episodes recorded yet. Episodes are created as agents analyze and act on your accounts.</p>
              </div>
            }
          }

          <!-- Entities -->
          @if (activeMemorySubTab() === 'Entities') {
            @if (memoryEntities().length > 0) {
              <div class="bg-white rounded-card shadow-card overflow-hidden">
                <table class="w-full text-left">
                  <thead>
                    <tr class="border-b border-gray-100 bg-gray-50">
                      <th class="px-4 py-3 text-xs font-body font-semibold text-gray-500 uppercase tracking-wider">Entity</th>
                      <th class="px-4 py-3 text-xs font-body font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                      <th class="px-4 py-3 text-xs font-body font-semibold text-gray-500 uppercase tracking-wider text-right">Mentions</th>
                      <th class="px-4 py-3 text-xs font-body font-semibold text-gray-500 uppercase tracking-wider text-right">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (e of memoryEntities(); track e.entity_name + e.entity_type) {
                      <tr class="border-b border-gray-50 hover:bg-gray-25">
                        <td class="px-4 py-3 text-sm font-body font-medium text-navy">{{ e.entity_name }}</td>
                        <td class="px-4 py-3">
                          <span class="px-2 py-0.5 text-[10px] font-mono rounded-full bg-gray-100 text-gray-600">
                            {{ e.entity_type }}
                          </span>
                        </td>
                        <td class="px-4 py-3 text-sm font-mono text-gray-600 text-right">{{ e.mention_count }}</td>
                        <td class="px-4 py-3 text-xs font-body text-gray-400 text-right">{{ getRelativeTime(e.last_seen) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <div class="bg-white rounded-card shadow-card p-8 text-center">
                <lucide-icon name="users" [size]="28" class="text-gray-300 mx-auto mb-2"></lucide-icon>
                <p class="text-sm font-body text-gray-500 m-0">No entities discovered yet. Entities are extracted from agent episodes (campaigns, audiences, creatives).</p>
              </div>
            }
          }
        }
      }
    </div>
  `,
})
export default class AgentDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  decisions = signal<AgentDecision[]>([]);
  runs = signal<AgentRun[]>([]);
  briefing = signal<Briefing | null>(null);
  loadingDecisions = signal(true);
  loadingRuns = signal(true);
  loadingBriefing = signal(true);
  triggeringWatchdog = signal(false);
  triggeringReport = signal(false);
  triggeringContent = signal(false);
  processingId = signal<string | null>(null);
  activeTab = signal<TabKey>('decisions');

  tabs: { key: TabKey; label: string }[] = [
    { key: 'decisions', label: 'Decisions' },
    { key: 'briefing', label: 'Briefing' },
    { key: 'runs', label: 'Runs' },
    { key: 'memory', label: 'Memory' },
  ];

  // Memory tab
  memorySubTabs = ['Core', 'Episodes', 'Entities'] as const;
  activeMemorySubTab = signal<'Core' | 'Episodes' | 'Entities'>('Core');
  loadingMemory = signal(true);
  memoryCore = signal<MemoryCore[]>([]);
  memoryEpisodes = signal<MemoryEpisode[]>([]);
  memoryEntities = signal<MemoryEntity[]>([]);
  memoryStats = signal<MemoryStats>({ totalCoreMemories: 0, totalEpisodes: 0, totalEntities: 0 });

  pendingCount = computed(() => this.decisions().filter(d => d.status === 'pending').length);
  executedCount = computed(() => this.decisions().filter(d => d.status === 'executed').length);
  rejectedCount = computed(() => this.decisions().filter(d => d.status === 'rejected').length);

  ngOnInit() {
    this.fetchDecisions();
    this.fetchRuns();
    this.fetchBriefing();
    this.fetchMemory();
  }

  fetchDecisions() {
    this.loadingDecisions.set(true);
    this.api.get<{ success: boolean; decisions: AgentDecision[] }>(
      environment.AGENT_DECISIONS, { limit: 50 }
    ).subscribe({
      next: (res) => {
        this.decisions.set(res.decisions ?? []);
        this.loadingDecisions.set(false);
      },
      error: () => {
        this.loadingDecisions.set(false);
        this.toast.error('Error', 'Failed to load agent decisions');
      },
    });
  }

  fetchRuns() {
    this.loadingRuns.set(true);
    this.api.get<{ success: boolean; runs: AgentRun[] }>(
      environment.AGENT_RUNS, { limit: 30 }
    ).subscribe({
      next: (res) => {
        this.runs.set(res.runs ?? []);
        this.loadingRuns.set(false);
      },
      error: () => {
        this.loadingRuns.set(false);
        this.toast.error('Error', 'Failed to load agent runs');
      },
    });
  }

  fetchBriefing() {
    this.loadingBriefing.set(true);
    this.api.get<{ success: boolean; briefing: Briefing | null }>(
      environment.AGENT_BRIEFING
    ).subscribe({
      next: (res) => {
        this.briefing.set(res.briefing ?? null);
        this.loadingBriefing.set(false);
      },
      error: () => {
        this.loadingBriefing.set(false);
        this.toast.error('Briefing Failed', 'Could not load morning briefing.');
      },
    });
  }

  fetchMemory() {
    this.loadingMemory.set(true);
    this.api.get<{ success: boolean; core: MemoryCore[]; episodes: MemoryEpisode[]; entities: MemoryEntity[]; stats: MemoryStats }>(
      environment.AGENT_MEMORY_STRUCTURED
    ).subscribe({
      next: (res) => {
        this.memoryCore.set(res.core ?? []);
        this.memoryEpisodes.set(res.episodes ?? []);
        this.memoryEntities.set(res.entities ?? []);
        this.memoryStats.set(res.stats ?? { totalCoreMemories: 0, totalEpisodes: 0, totalEntities: 0 });
        this.loadingMemory.set(false);
      },
      error: () => {
        this.loadingMemory.set(false);
        this.toast.error('Memory Failed', 'Could not load agent memory.');
      },
    });
  }

  getAgentTypeClass(agentType: string): string {
    const map: Record<string, string> = {
      'watchdog': 'bg-amber-100 text-amber-700',
      'briefing': 'bg-blue-100 text-blue-700',
      'report': 'bg-purple-100 text-purple-700',
      'content': 'bg-emerald-100 text-emerald-700',
      'sales': 'bg-orange-100 text-orange-700',
    };
    return map[agentType] || 'bg-gray-100 text-gray-600';
  }

  triggerWatchdog() {
    this.triggeringWatchdog.set(true);
    this.api.post<{ success: boolean; runs?: number; decisions?: number }>(
      environment.AGENT_WATCHDOG_RUN, {}
    ).subscribe({
      next: (res) => {
        this.triggeringWatchdog.set(false);
        if (res.success) {
          this.toast.success('Watchdog Complete', `${res.runs ?? 0} runs, ${res.decisions ?? 0} decisions`);
          this.fetchDecisions();
          this.fetchRuns();
        }
      },
      error: (err) => {
        this.triggeringWatchdog.set(false);
        const msg = err?.error?.error || 'Failed to run watchdog';
        this.toast.error('Watchdog Failed', msg);
      },
    });
  }

  triggerReport() {
    this.triggeringReport.set(true);
    this.api.post<{ success: boolean; reports?: number }>(
      environment.AGENT_REPORT_RUN, {}
    ).subscribe({
      next: (res) => {
        this.triggeringReport.set(false);
        if (res.success) {
          this.toast.success('Report Agent Complete', `${res.reports ?? 0} reports generated`);
          this.fetchRuns();
        }
      },
      error: (err) => {
        this.triggeringReport.set(false);
        this.toast.error('Report Agent Failed', err?.error?.error || 'Failed to run report agent');
      },
    });
  }

  triggerContent() {
    this.triggeringContent.set(true);
    this.api.post<{ success: boolean; briefs?: number }>(
      environment.AGENT_CONTENT_RUN, {}
    ).subscribe({
      next: (res) => {
        this.triggeringContent.set(false);
        if (res.success) {
          this.toast.success('Content Agent Complete', `${res.briefs ?? 0} briefs generated`);
          this.fetchRuns();
        }
      },
      error: (err) => {
        this.triggeringContent.set(false);
        this.toast.error('Content Agent Failed', err?.error?.error || 'Failed to run content agent');
      },
    });
  }

  approveDecision(d: AgentDecision) {
    this.processingId.set(d.id);
    this.api.post<{ success: boolean; message: string }>(
      `${environment.AGENT_APPROVE}/${d.id}/approve`, {}
    ).subscribe({
      next: (res) => {
        this.processingId.set(null);
        if (res.success) {
          this.toast.success('Approved', res.message);
          this.decisions.update(list =>
            list.map(item => item.id === d.id ? { ...item, status: 'executed' } : item)
          );
        }
      },
      error: (err) => {
        this.processingId.set(null);
        this.toast.error('Error', err?.error?.error || 'Failed to approve decision');
      },
    });
  }

  rejectDecision(d: AgentDecision) {
    this.processingId.set(d.id);
    this.api.post<{ success: boolean; message: string }>(
      `${environment.AGENT_REJECT}/${d.id}/reject`, {}
    ).subscribe({
      next: (res) => {
        this.processingId.set(null);
        if (res.success) {
          this.toast.success('Rejected', res.message);
          this.decisions.update(list =>
            list.map(item => item.id === d.id ? { ...item, status: 'rejected' } : item)
          );
        }
      },
      error: (err) => {
        this.processingId.set(null);
        this.toast.error('Error', err?.error?.error || 'Failed to reject decision');
      },
    });
  }

  // --- Urgency helpers ---
  getUrgencyBorderClass(urgency: string): string {
    switch (urgency) {
      case 'critical': return 'border-l-red-500';
      case 'high': return 'border-l-amber-500';
      case 'medium': return 'border-l-blue-500';
      default: return 'border-l-gray-300';
    }
  }

  getUrgencyBgClass(urgency: string): string {
    switch (urgency) {
      case 'critical': return 'bg-red-50';
      case 'high': return 'bg-amber-50';
      case 'medium': return 'bg-blue-50';
      default: return 'bg-gray-50';
    }
  }

  getUrgencyTextClass(urgency: string): string {
    switch (urgency) {
      case 'critical': return 'text-red-500';
      case 'high': return 'text-amber-500';
      case 'medium': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  }

  getUrgencyIcon(urgency: string): string {
    switch (urgency) {
      case 'critical': return 'alert-triangle';
      case 'high': return 'alert-circle';
      case 'medium': return 'info';
      default: return 'minus-circle';
    }
  }

  getUrgencyBadgeClass(urgency: string): string {
    switch (urgency) {
      case 'critical': return 'bg-red-100 text-red-700';
      case 'high': return 'bg-amber-100 text-amber-700';
      case 'medium': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700';
      case 'approved': return 'bg-blue-100 text-blue-700';
      case 'executed': return 'bg-emerald-100 text-emerald-700';
      case 'rejected': return 'bg-red-100 text-red-700';
      case 'expired': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  }

  // --- Agent type helpers ---
  getAgentTypeBgClass(type: string): string {
    switch (type) {
      case 'watchdog': return 'bg-amber-50';
      case 'briefing': return 'bg-accent/10';
      case 'report': return 'bg-blue-50';
      case 'content': return 'bg-emerald-50';
      case 'sales': return 'bg-purple-50';
      default: return 'bg-gray-50';
    }
  }

  getAgentTypeTextClass(type: string): string {
    switch (type) {
      case 'watchdog': return 'text-amber-500';
      case 'briefing': return 'text-accent';
      case 'report': return 'text-blue-500';
      case 'content': return 'text-emerald-500';
      case 'sales': return 'text-purple-500';
      default: return 'text-gray-500';
    }
  }

  getAgentTypeIcon(type: string): string {
    switch (type) {
      case 'watchdog': return 'scan-eye';
      case 'briefing': return 'sunrise';
      case 'report': return 'file-text';
      case 'content': return 'pen-tool';
      case 'sales': return 'handshake';
      default: return 'bot';
    }
  }

  formatAgentType(type: string): string {
    switch (type) {
      case 'watchdog': return 'Ad Watchdog';
      case 'briefing': return 'Morning Briefing';
      case 'report': return 'Client Report';
      case 'content': return 'Content Brief';
      case 'sales': return 'Sales Pipeline';
      default: return type;
    }
  }

  formatType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  }

  getRelativeTime(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
}
