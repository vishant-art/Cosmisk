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
        </div>
        <div class="space-y-3">
          @for (insight of insights(); track insight.id) {
            <app-insight-card [insight]="insight" (actionClicked)="onAction($event)" />
          }
        </div>
      </div>
    }
  `,
})
export class AiLayerInsightsComponent {
  private api = inject(ApiService);
  private adAccounts = inject(AdAccountService);
  private router = inject(Router);

  insights = signal<AiInsight[]>([]);

  constructor() {
    effect(() => {
      const acc = this.adAccounts.currentAccount();
      if (!acc) {
        this.insights.set([]);
        return;
      }
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

  onAction(insight: AiInsight): void {
    if (insight.actionRoute) {
      this.router.navigate([insight.actionRoute]);
    }
  }
}
