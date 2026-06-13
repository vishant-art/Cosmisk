import { Component, signal, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { InsightCardComponent } from '../../shared/components/insight-card/insight-card.component';
import { AiInsight } from '../../core/models/insight.model';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { environment } from '../../../environments/environment';

/**
 * Phase 5 — renders the AiInsight cards from the ai-layer service
 * (GET /api/ai-layer/insights). Self-contained and **flag-gated by the response**:
 * when the backend feature is off (AI_LAYER_URL unset) the endpoint returns an empty
 * list, so this component renders nothing — zero visual change. Reuses app-insight-card.
 *
 * "Continue without Meta login": when no ad account is connected, offers a one-click
 * demo that loads insights from the shared dev/testing creds (backend `demo=1`). The
 * backend only honours this when its dev Meta token is configured (off in prod), and
 * cards are clearly badged "Demo data".
 */
@Component({
  selector: 'app-ai-layer-insights',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, InsightCardComponent],
  template: `
    @if (insights().length > 0) {
      <div class="lg:col-span-2 card">
        <div class="flex items-center gap-2 mb-4">
          <lucide-icon name="brain-circuit" [size]="18" class="text-accent"></lucide-icon>
          <h3 class="text-card-title font-display text-navy m-0">AI Layer Insights</h3>
          @if (demoMode()) {
            <span
              class="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"
              >Demo data</span
            >
          }
          <!-- Refresh: pull fresh live Meta data into the cache. Otherwise cached data
               is shown. -->
          <button
            type="button"
            (click)="refresh()"
            [disabled]="refreshing()"
            title="Refresh with live data (otherwise cached data is shown)"
            class="ml-auto text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:border-accent hover:text-accent transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <lucide-icon name="refresh-cw" [size]="13" [class.animate-spin]="refreshing()"></lucide-icon>
            {{ refreshing() ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>
        <div class="space-y-3">
          @for (insight of insights(); track insight.id) {
            <app-insight-card [insight]="insight" (actionClicked)="onAction($event)" />
          }
        </div>
      </div>
    } @else if (showDemoPrompt()) {
      <div class="lg:col-span-2 card">
        <div class="flex items-center gap-2 mb-2">
          <lucide-icon name="brain-circuit" [size]="18" class="text-accent"></lucide-icon>
          <h3 class="text-card-title font-display text-navy m-0">AI Layer Insights</h3>
        </div>
        <p class="text-sm text-slate-500 mb-3">
          Connect a Meta ad account to see insights on your own data, or continue without
          logging in to explore with sample data.
        </p>
        <button
          type="button"
          class="text-sm font-medium px-3 py-1.5 rounded-md border border-accent text-accent hover:bg-accent hover:text-white transition-colors"
          (click)="loadDemo()"
        >
          Continue without Meta login
        </button>
      </div>
    }
  `,
})
export class AiLayerInsightsComponent {
  private api = inject(ApiService);
  private adAccounts = inject(AdAccountService);
  private router = inject(Router);

  insights = signal<AiInsight[]>([]);
  demoMode = signal(false);
  // Show the demo prompt only when no account is connected and we haven't opted in yet.
  showDemoPrompt = signal(false);
  refreshing = signal(false);

  constructor() {
    effect(() => {
      const acc = this.adAccounts.currentAccount();
      if (!acc) {
        // No connected account: offer the "continue without Meta login" path.
        this.insights.set([]);
        if (!this.demoMode()) this.showDemoPrompt.set(true);
        return;
      }
      // A real account is connected — use it, drop any demo state.
      this.demoMode.set(false);
      this.showDemoPrompt.set(false);
      this.load(acc.id);
    }, { allowSignalWrites: true });
  }

  private load(accountId: string): void {
    this.api
      .get<{ success: boolean; insights?: AiInsight[] }>(environment.AI_LAYER_INSIGHTS, {
        account_id: accountId,
      })
      .subscribe({
        next: (res) => this.insights.set(res?.insights ?? []),
        error: () => this.insights.set([]), // degrade silently to hidden
      });
  }

  loadDemo(): void {
    this.demoMode.set(true);
    this.showDemoPrompt.set(false);
    this.api
      .get<{ success: boolean; insights?: AiInsight[]; demo?: boolean }>(
        environment.AI_LAYER_INSIGHTS,
        { demo: '1' },
      )
      .subscribe({
        next: (res) => this.insights.set(res?.insights ?? []),
        error: () => {
          this.insights.set([]);
          this.demoMode.set(false);
          this.showDemoPrompt.set(true); // let the user retry
        },
      });
  }

  /**
   * Pull fresh live Meta data into the ai-layer store cache, then reload the cards from
   * the now-updated cache. Without this, the cached store data is shown.
   */
  refresh(): void {
    if (this.refreshing()) return;
    const acc = this.adAccounts.currentAccount();
    const body: Record<string, unknown> = acc ? { account_id: acc.id } : { demo: true };
    this.refreshing.set(true);
    this.api.post<{ success: boolean }>(environment.AI_LAYER_REFRESH, body).subscribe({
      next: () => {
        this.refreshing.set(false);
        if (acc) this.load(acc.id);
        else this.loadDemo();
      },
      error: () => this.refreshing.set(false),
    });
  }

  onAction(insight: AiInsight): void {
    if (insight.actionRoute) {
      this.router.navigate([insight.actionRoute]);
    }
  }
}
