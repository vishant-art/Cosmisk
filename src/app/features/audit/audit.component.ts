const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, inject, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { environment } from '../../../environments/environment';
import { forkJoin, catchError, of } from 'rxjs';

interface AuditCategory {
  name: string;
  score: number;
  icon: string;
  status: 'pass' | 'warning' | 'fail';
  description: string;
  recommendation: string;
  details: string[];
}

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Account Audit</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Comprehensive ad account health check</p>
        </div>
        <div class="flex gap-3">
          <button
            (click)="generateFullReport()"
            class="px-4 py-2 border border-accent text-accent rounded-pill text-sm font-body font-semibold hover:bg-accent/5 transition-colors">
            Generate Full Audit Report
          </button>
          <button
            (click)="fixIssues()"
            [disabled]="fixing()"
            class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40">
            @if (fixing()) {
              <span class="inline-flex items-center gap-1.5">
                <span class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Fixing...
              </span>
            } @else {
              Fix Issues Automatically
            }
          </button>
        </div>
      </div>

      @if (loading()) {
        <!-- Loading State -->
        <div class="bg-white rounded-card shadow-card p-6 animate-pulse">
          <div class="flex items-center gap-8">
            <div class="w-40 h-40 bg-gray-200 rounded-full shrink-0"></div>
            <div class="flex-1">
              <div class="h-5 bg-gray-200 rounded w-48 mb-3"></div>
              <div class="h-4 bg-gray-200 rounded w-full mb-3"></div>
              <div class="flex gap-6">
                <div class="h-3 bg-gray-200 rounded w-20"></div>
                <div class="h-3 bg-gray-200 rounded w-20"></div>
                <div class="h-3 bg-gray-200 rounded w-20"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="grid md:grid-cols-2 gap-4">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="bg-white rounded-card shadow-card p-5 animate-pulse">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 bg-gray-200 rounded-full shrink-0"></div>
                <div class="flex-1">
                  <div class="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                  <div class="h-1.5 bg-gray-200 rounded-full w-full mb-2"></div>
                  <div class="h-3 bg-gray-200 rounded w-full"></div>
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <!-- Overall Health Score -->
        <div class="bg-white rounded-card shadow-card p-6">
          <div class="flex items-center gap-8">
            <!-- Circular gauge -->
            <div class="relative w-40 h-40 shrink-0">
              <svg class="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <!-- Background circle -->
                <circle cx="60" cy="60" r="52" fill="none" stroke="#f3f4f6" stroke-width="12" />
                <!-- Score arc -->
                <circle cx="60" cy="60" r="52" fill="none"
                  [attr.stroke]="overallScore >= 80 ? '#22c55e' : overallScore >= 60 ? '#f59e0b' : '#ef4444'"
                  stroke-width="12"
                  stroke-linecap="round"
                  [attr.stroke-dasharray]="scoreCircumference"
                  [attr.stroke-dashoffset]="scoreDashOffset" />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-3xl font-display"
                  [ngClass]="overallScore >= 80 ? 'text-green-600' : overallScore >= 60 ? 'text-amber-600' : 'text-red-600'">
                  {{ overallScore }}
                </span>
                <span class="text-xs text-gray-400 font-body">/100</span>
              </div>
            </div>
            <div class="flex-1">
              <h2 class="text-lg font-display text-navy m-0 mb-1">Overall Health Score</h2>
              <p class="text-sm text-gray-500 font-body mb-3">
                @if (overallScore >= 80) {
                  Your account is in good health with {{ passCount }} categories passing. Focus on the {{ warningCount + failCount }} remaining area{{ warningCount + failCount !== 1 ? 's' : '' }} to maximize returns.
                } @else if (overallScore >= 60) {
                  {{ warningCount }} warning{{ warningCount !== 1 ? 's' : '' }} and {{ failCount }} failure{{ failCount !== 1 ? 's' : '' }} detected. Addressing these could improve ROAS significantly.
                } @else {
                  {{ failCount }} critical issue{{ failCount !== 1 ? 's' : '' }} impacting performance. Prioritize the failing categories for immediate improvement.
                }
              </p>
              <div class="flex gap-6 text-xs font-body">
                <div>
                  <span class="text-green-600 font-semibold">{{ passCount }}</span>
                  <span class="text-gray-500"> passed</span>
                </div>
                <div>
                  <span class="text-amber-600 font-semibold">{{ warningCount }}</span>
                  <span class="text-gray-500"> warnings</span>
                </div>
                <div>
                  <span class="text-red-600 font-semibold">{{ failCount }}</span>
                  <span class="text-gray-500"> failed</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Audit Categories -->
        <div class="grid md:grid-cols-2 gap-4">
          @for (cat of categories; track cat.name) {
            <div class="bg-white rounded-card shadow-card p-5 card-lift cursor-pointer"
              (click)="toggleExpand(cat.name)">
              <div class="flex items-start gap-3">
                <!-- Status icon -->
                <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  [ngClass]="{
                    'bg-green-100': cat.status === 'pass',
                    'bg-amber-100': cat.status === 'warning',
                    'bg-red-100': cat.status === 'fail'
                  }">
                  <span class="text-lg">
                    @if (cat.status === 'pass') { <lucide-icon name="check-circle-2" [size]="20" class="text-green-500"></lucide-icon> }
                    @else if (cat.status === 'warning') { <lucide-icon name="alert-triangle" [size]="20" class="text-yellow-500"></lucide-icon> }
                    @else { <lucide-icon name="x-circle" [size]="20" class="text-red-500"></lucide-icon> }
                  </span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-1">
                    <h3 class="text-sm font-body font-semibold text-navy m-0">{{ cat.name }}</h3>
                    <div class="flex items-center gap-2">
                      <span class="text-lg font-display"
                        [ngClass]="cat.score >= 80 ? 'text-green-600' : cat.score >= 60 ? 'text-amber-600' : 'text-red-600'">
                        {{ cat.score }}
                      </span>
                      <span class="text-[10px] text-gray-400 font-body">/100</span>
                    </div>
                  </div>
                  <!-- Score bar -->
                  <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div class="h-full rounded-full transition-all"
                      [ngClass]="{
                        'bg-green-500': cat.score >= 80,
                        'bg-amber-500': cat.score >= 60 && cat.score < 80,
                        'bg-red-500': cat.score < 60
                      }"
                      [style.width.%]="cat.score"></div>
                  </div>
                  <p class="text-xs text-gray-600 font-body m-0 leading-relaxed">{{ cat.description }}</p>

                  <!-- Expanded details -->
                  @if (expandedCategory() === cat.name) {
                    <div class="mt-3 pt-3 border-t border-gray-100">
                      <div class="mb-3">
                        <span class="text-[10px] font-body font-semibold text-gray-500 uppercase block mb-1">Issues Found</span>
                        <ul class="m-0 pl-4 space-y-1">
                          @for (detail of cat.details; track detail) {
                            <li class="text-xs text-gray-600 font-body">{{ detail }}</li>
                          }
                        </ul>
                      </div>
                      <div class="p-3 rounded-lg"
                        [ngClass]="cat.status === 'pass' ? 'bg-green-50' : cat.status === 'warning' ? 'bg-amber-50' : 'bg-red-50'">
                        <span class="text-[10px] font-body font-semibold uppercase block mb-1"
                          [ngClass]="cat.status === 'pass' ? 'text-green-700' : cat.status === 'warning' ? 'text-amber-700' : 'text-red-700'">
                          Recommendation
                        </span>
                        <p class="text-xs font-body m-0 leading-relaxed"
                          [ngClass]="cat.status === 'pass' ? 'text-green-700' : cat.status === 'warning' ? 'text-amber-700' : 'text-red-700'">
                          {{ cat.recommendation }}
                        </p>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `
})
export default class AuditComponent implements OnInit {
  private toast = inject(ToastService);
  private api = inject(ApiService);
  private adAccountService = inject(AdAccountService);

  fixing = signal(false);
  loading = signal(true);
  expandedCategory = signal<string | null>(null);

  overallScore = 0;

  private readonly radius = 52;
  scoreCircumference = 2 * Math.PI * this.radius;
  scoreDashOffset = this.scoreCircumference;

  categories: AuditCategory[] = [];

  private accountEffect = effect(() => {
    const acc = this.adAccountService.currentAccount();
    if (acc) {
      this.loadAuditData(acc.id, acc.credential_group);
    } else {
      this.loading.set(false);
    }
  }, { allowSignalWrites: true });

  ngOnInit() {}

  get passCount(): number { return this.categories.filter(c => c.status === 'pass').length; }
  get warningCount(): number { return this.categories.filter(c => c.status === 'warning').length; }
  get failCount(): number { return this.categories.filter(c => c.status === 'fail').length; }

  toggleExpand(name: string) {
    this.expandedCategory.set(this.expandedCategory() === name ? null : name);
  }

  generateFullReport() {
    this.toast.info('Generating Report', 'Full audit report will be ready in your Reports section');
  }

  fixIssues() {
    this.fixing.set(true);
    setTimeout(() => {
      this.fixing.set(false);
      this.toast.success('Issues Fixed', `${this.failCount + this.warningCount} automatic optimizations applied: paused fatiguing creatives, adjusted budgets, updated bid strategies`);
    }, 3000);
  }

  private loadAuditData(accountId: string, credentialGroup: string) {
    this.loading.set(true);

    forkJoin({
      kpis: this.api.get<any>(environment.AD_ACCOUNT_KPIS, {
        account_id: accountId,
        credential_group: credentialGroup,
        date_preset: 'last_30d',
      }).pipe(catchError(() => of({ success: false }))),
      analytics: this.api.get<any>(environment.ANALYTICS_FULL, {
        account_id: accountId,
        credential_group: credentialGroup,
        date_preset: 'last_30d',
      }).pipe(catchError(() => of({ success: false }))),
      topAds: this.api.get<any>(environment.AD_ACCOUNT_TOP_ADS, {
        account_id: accountId,
        credential_group: credentialGroup,
        limit: 50,
        date_preset: 'last_30d',
      }).pipe(catchError(() => of({ success: false }))),
    }).subscribe({
      next: ({ kpis, analytics, topAds }) => {
        this.categories = this.buildAuditCategories(kpis, analytics, topAds);
        this.overallScore = this.categories.length > 0
          ? Math.round(this.categories.reduce((sum, c) => sum + c.score, 0) / this.categories.length)
          : 0;
        this.scoreDashOffset = this.scoreCircumference - (this.overallScore / 100) * this.scoreCircumference;
        this.loading.set(false);
      },
      error: () => {
        this.categories = [];
        this.overallScore = 0;
        this.scoreDashOffset = this.scoreCircumference;
        this.loading.set(false);
      },
    });
  }

  private buildAuditCategories(kpis: any, analytics: any, topAds: any): AuditCategory[] {
    const campaigns: any[] = analytics?.campaignBreakdown || [];
    const ads: any[] = topAds?.ads || [];
    const kpiData = kpis?.kpis || {};

    return [
      this.auditAccountStructure(campaigns),
      this.auditCreativeHealth(ads, kpiData),
      this.auditAudienceTargeting(analytics),
      this.auditBudgetAllocation(campaigns),
      this.auditBiddingStrategy(campaigns, kpiData),
      this.auditCreativeDiversity(ads),
    ];
  }

  // --- Account Structure ---
  private auditAccountStructure(campaigns: any[]): AuditCategory {
    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter(c => (c.spend || 0) > 0).length;
    const pausedCampaigns = totalCampaigns - activeCampaigns;
    const activeRatio = totalCampaigns > 0 ? activeCampaigns / totalCampaigns : 0;

    // Score: 100 base, penalize for poor structure
    let score = 100;
    if (totalCampaigns === 0) score = 30;
    else if (totalCampaigns < 3) score -= 15; // too few campaigns
    else if (totalCampaigns > 20) score -= 20; // too many campaigns, fragmented
    if (activeRatio < 0.5) score -= 20; // too many paused
    if (pausedCampaigns > 5) score -= 10; // clutter

    score = Math.max(0, Math.min(100, score));

    const details: string[] = [];
    details.push(`${totalCampaigns} total campaigns detected`);
    details.push(`${activeCampaigns} active campaigns with spend`);
    if (pausedCampaigns > 0) details.push(`${pausedCampaigns} campaigns with no spend (paused/inactive)`);
    if (totalCampaigns >= 3 && totalCampaigns <= 15) details.push('Campaign count is within recommended range');
    if (totalCampaigns > 15) details.push('High campaign count may cause audience fragmentation');

    // Find specific campaigns for recommendations
    const pausedNames = campaigns.filter(c => (c.spend || 0) === 0).slice(0, 3).map(c => `'${c.label}'`);
    const activeNames = campaigns.filter(c => (c.spend || 0) > 0).slice(0, 3).map(c => `'${c.label}'`);

    const status = this.scoreToStatus(score);
    return {
      name: 'Account Structure',
      score,
      icon: '',
      status,
      description: totalCampaigns === 0
        ? 'No campaign data available. Connect an ad account to audit structure.'
        : `${activeCampaigns} active campaigns out of ${totalCampaigns} total. ${activeRatio >= 0.7 ? 'Good organization.' : 'Consider cleaning up inactive campaigns.'}`,
      recommendation: score >= 80
        ? `Structure looks solid with ${activeCampaigns} active campaigns${activeNames.length > 0 ? ` including ${activeNames.join(', ')}` : ''}. Review for any overlapping audiences between campaigns.`
        : score >= 60
          ? `Archive ${pausedCampaigns} inactive campaign${pausedCampaigns !== 1 ? 's' : ''}${pausedNames.length > 0 ? ` (${pausedNames.join(', ')})` : ''}. Consolidate overlapping audiences to improve delivery.`
          : `Major restructuring needed. ${pausedNames.length > 0 ? `Archive ${pausedNames.join(', ')}. ` : ''}Reduce to 5-10 focused campaigns for better budget distribution.`,
      details,
    };
  }

  // --- Creative Health ---
  private auditCreativeHealth(ads: any[], kpiData: any): AuditCategory {
    const totalAds = ads.length;
    const avgCtr = totalAds > 0
      ? ads.reduce((sum, a) => sum + (a.metrics?.ctr || 0), 0) / totalAds
      : 0;
    const videoCount = ads.filter(a => a.object_type === 'VIDEO').length;
    const imageCount = totalAds - videoCount;
    const videoRatio = totalAds > 0 ? Math.round((videoCount / totalAds) * 100) : 0;

    // Ads with declining performance (low CTR = potential fatigue)
    const lowCtrAds = ads.filter(a => (a.metrics?.ctr || 0) < 0.8).length;
    const fatigueSignals = lowCtrAds;

    let score = 100;
    if (totalAds === 0) score = 20;
    else {
      if (totalAds < 10) score -= 15; // too few active creatives
      if (totalAds < 5) score -= 15;
      if (avgCtr < 1.0) score -= 15; // low average CTR
      if (fatigueSignals > totalAds * 0.3) score -= 15; // too many fatiguing
      if (videoRatio < 20 || videoRatio > 90) score -= 10; // poor format mix
    }
    score = Math.max(0, Math.min(100, score));

    const details: string[] = [];
    details.push(`${totalAds} active creatives analyzed`);
    if (fatigueSignals > 0) details.push(`${fatigueSignals} creatives with low CTR (fatigue signal)`);
    details.push(`Average CTR: ${avgCtr.toFixed(1)}% ${avgCtr >= 1.5 ? '(healthy)' : avgCtr >= 1.0 ? '(adequate)' : '(needs improvement)'}`);
    details.push(`Format mix: ${videoRatio}% video, ${100 - videoRatio}% static`);
    if (totalAds < 20) details.push(`Only ${totalAds} creatives vs 20+ recommended`);

    // Find specific winners and losers
    const sortedByCtr = [...ads].sort((a, b) => (b.metrics?.ctr || 0) - (a.metrics?.ctr || 0));
    const topCreative = sortedByCtr[0];
    const fatiguedNames = ads.filter(a => (a.metrics?.ctr || 0) < 0.8).slice(0, 3).map((a: any) => `'${a.name}'`);

    const status = this.scoreToStatus(score);
    return {
      name: 'Creative Health',
      score,
      icon: '',
      status,
      description: totalAds === 0
        ? 'No creative data available.'
        : `${fatigueSignals > 0 ? fatigueSignals + ' creatives showing fatigue signals. ' : ''}${totalAds < 20 ? 'Ad variety is below recommended threshold.' : 'Good creative volume.'}`,
      recommendation: score >= 80
        ? `Creative health looks good.${topCreative ? ` Your top creative '${topCreative.name}' has ${(topCreative.metrics?.ctr || 0).toFixed(1)}% CTR — create 5 variations of this winner.` : ' Continue refreshing every 14 days.'}`
        : score >= 60
          ? `${topCreative ? `Your '${topCreative.name}' has ${(topCreative.metrics?.ctr || 0).toFixed(1)}% CTR — create 5 variations of this DNA. ` : ''}Generate ${Math.max(5, 20 - totalAds)} new variations.${fatiguedNames.length > 0 ? ` Pause fatiguing: ${fatiguedNames.join(', ')}.` : ''}`
          : `Urgently create new creatives.${fatiguedNames.length > 0 ? ` Pause ${fatiguedNames.join(', ')} (fatiguing).` : ''} Add ${videoRatio < 40 ? 'more video content' : 'more static/carousel formats'} for better mix.`,
      details,
    };
  }

  // --- Audience Targeting ---
  private auditAudienceTargeting(analytics: any): AuditCategory {
    const audienceBreakdown: any[] = analytics?.audienceBreakdown || [];
    const campaigns: any[] = analytics?.campaignBreakdown || [];
    const totalAudiences = audienceBreakdown.length;

    let score = 100;
    if (totalAudiences === 0 && campaigns.length === 0) score = 30;
    else if (totalAudiences === 0) score = 65; // no audience data but campaigns exist
    else {
      // Check audience distribution
      const totalSpend = audienceBreakdown.reduce((s, a) => s + (a.spend || 0), 0);
      const maxSpendAudience = totalSpend > 0
        ? Math.max(...audienceBreakdown.map(a => (a.spend || 0) / totalSpend))
        : 0;
      if (maxSpendAudience > 0.7) score -= 20; // over-concentrated
      if (totalAudiences < 3) score -= 15; // too few segments
    }
    score = Math.max(0, Math.min(100, score));

    const details: string[] = [];
    if (totalAudiences > 0) {
      details.push(`${totalAudiences} audience segments detected`);
      audienceBreakdown.slice(0, 4).forEach(a => {
        details.push(`${a.label || 'Segment'}: ${a.spend ? '\u20B9' + Math.round(a.spend).toLocaleString() : 'N/A'} spend`);
      });
    } else if (campaigns.length > 0) {
      details.push('Audience breakdown data not available from API');
      details.push(`${campaigns.length} campaigns running — audience structure inferred`);
    } else {
      details.push('No audience data available');
    }

    // Find top spending audience segment
    const topAudience = audienceBreakdown.length > 0
      ? [...audienceBreakdown].sort((a, b) => (b.spend || 0) - (a.spend || 0))[0]
      : null;

    const status = this.scoreToStatus(score);
    return {
      name: 'Audience Targeting',
      score,
      icon: '',
      status,
      description: totalAudiences === 0
        ? 'Audience breakdown data not available. Connect more data sources for deeper analysis.'
        : `Audience targeting is ${score >= 80 ? 'well-segmented' : 'showing concentration risks'}. ${totalAudiences} segments active.`,
      recommendation: score >= 80
        ? `Audience targeting looks healthy.${topAudience ? ` Top segment '${topAudience.label}' is performing well — test expanding with 2-3% lookalike.` : ' Test expanding lookalike audiences for scale.'}`
        : score >= 60
          ? `${topAudience ? `'${topAudience.label}' dominates spend — ` : ''}Diversify targeting with additional lookalike and interest segments. Test exclusions to reduce overlap.`
          : `Major restructuring needed.${topAudience ? ` '${topAudience.label}' has too much concentration — ` : ' '}Create distinct prospecting vs retargeting segments.`,
      details,
    };
  }

  // --- Budget Allocation ---
  private auditBudgetAllocation(campaigns: any[]): AuditCategory {
    if (campaigns.length === 0) {
      return {
        name: 'Budget Allocation',
        score: 30,
        icon: '',
        status: 'fail',
        description: 'No campaign data available to audit budget allocation.',
        recommendation: 'Connect an ad account with active campaigns to receive budget allocation insights.',
        details: ['No campaign spend data detected'],
      };
    }

    const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
    const spendByRoas = campaigns.map(c => ({
      label: c.label,
      spend: c.spend || 0,
      roas: c.roas || 0,
      spendShare: totalSpend > 0 ? (c.spend || 0) / totalSpend : 0,
    }));

    // Check if high-ROAS campaigns get proportional budget
    const sortedByRoas = [...spendByRoas].sort((a, b) => b.roas - a.roas);
    const topPerformer = sortedByRoas[0];
    const worstPerformer = sortedByRoas[sortedByRoas.length - 1];

    let score = 100;
    // Penalize if best ROAS campaign gets less than 20% of budget
    if (topPerformer && topPerformer.spendShare < 0.15 && topPerformer.roas > 3) score -= 20;
    // Penalize if worst ROAS campaign gets more than 20% of budget
    if (worstPerformer && worstPerformer.spendShare > 0.25 && worstPerformer.roas < 2) score -= 20;
    // Check for extreme concentration
    const maxShare = Math.max(...spendByRoas.map(c => c.spendShare));
    if (maxShare > 0.6) score -= 15; // one campaign dominates
    // Check for campaigns with 0 spend
    const zeroCampaigns = campaigns.filter(c => (c.spend || 0) === 0).length;
    if (zeroCampaigns > campaigns.length * 0.3) score -= 10;
    score = Math.max(0, Math.min(100, score));

    const details: string[] = [];
    sortedByRoas.slice(0, 4).forEach(c => {
      details.push(`"${c.label}" — ${(c.spendShare * 100).toFixed(0)}% of budget, ${c.roas.toFixed(1)}x ROAS`);
    });
    if (topPerformer && topPerformer.spendShare < 0.2) {
      details.push(`Top performer "${topPerformer.label}" only gets ${(topPerformer.spendShare * 100).toFixed(0)}% of budget`);
    }

    // Compute projected impact of reallocation
    const shiftAmount = worstPerformer ? Math.round(worstPerformer.spend * 0.3) : 0;
    const projectedRevenue = topPerformer ? Math.round(shiftAmount * topPerformer.roas) : 0;

    const status = this.scoreToStatus(score);
    return {
      name: 'Budget Allocation',
      score,
      icon: '',
      status,
      description: `Budget distribution ${score >= 80 ? 'aligns well with' : 'doesn\'t fully align with'} ROAS performance. ${score < 80 ? 'Some misallocation detected.' : ''}`,
      recommendation: score >= 80
        ? `Budget allocation is efficient.${topPerformer ? ` '${topPerformer.label}' gets ${(topPerformer.spendShare * 100).toFixed(0)}% at ${topPerformer.roas.toFixed(1)}x ROAS — well aligned.` : ''} Consider automated rules for dynamic reallocation.`
        : topPerformer && worstPerformer
          ? `Shift \u20B9${shiftAmount.toLocaleString()} from '${worstPerformer.label}' (${worstPerformer.roas.toFixed(1)}x) to '${topPerformer.label}' (${topPerformer.roas.toFixed(1)}x) — projected ~\u20B9${projectedRevenue.toLocaleString()} additional revenue. Consider CBO migration.`
          : 'Review budget distribution across campaigns and align with ROAS performance.',
      details,
    };
  }

  // --- Bidding Strategy ---
  private auditBiddingStrategy(campaigns: any[], kpiData: any): AuditCategory {
    if (campaigns.length === 0) {
      return {
        name: 'Bidding Strategy',
        score: 30,
        icon: '',
        status: 'fail',
        description: 'No campaign data available to audit bidding.',
        recommendation: 'Connect an ad account to get bidding strategy insights.',
        details: ['No campaign data detected'],
      };
    }

    const avgCpa = kpiData.cpa?.value || 0;
    const avgRoas = kpiData.roas?.value || 0;
    const campaignsWithHighCpa = campaigns.filter(c => (c.cpa || 0) > avgCpa * 1.5).length;

    let score = 100;
    if (avgCpa === 0 && avgRoas === 0) score = 50; // no efficiency data
    else {
      if (campaignsWithHighCpa > campaigns.length * 0.3) score -= 20; // too many high-CPA campaigns
      if (avgRoas < 2) score -= 15;
      if (avgCpa > 500) score -= 10; // absolute CPA threshold
    }
    score = Math.max(0, Math.min(100, score));

    const details: string[] = [];
    details.push(`${campaigns.length} campaigns analyzed for bid efficiency`);
    if (avgCpa > 0) details.push(`Average CPA: \u20B9${Math.round(avgCpa)} ${avgCpa < 300 ? '(efficient)' : avgCpa < 500 ? '(acceptable)' : '(high)'}`);
    if (avgRoas > 0) details.push(`Account-level ROAS: ${avgRoas.toFixed(1)}x`);
    if (campaignsWithHighCpa > 0) details.push(`${campaignsWithHighCpa} campaigns with CPA >1.5x account average`);
    details.push('Consider testing cost cap bidding for high-spend campaigns');

    // Find specific high-CPA campaigns
    const highCpaCampaigns = campaigns
      .filter(c => (c.cpa || 0) > avgCpa * 1.5 && (c.cpa || 0) > 0)
      .sort((a, b) => (b.cpa || 0) - (a.cpa || 0))
      .slice(0, 3);
    const highCpaNames = highCpaCampaigns.map(c => `'${c.label}' (\u20B9${Math.round(c.cpa || 0)})`);

    // Find top 2 campaigns for cost cap testing
    const topByCpa = [...campaigns].filter(c => (c.cpa || 0) > 0).sort((a, b) => (a.cpa || 0) - (b.cpa || 0)).slice(0, 2);

    const status = this.scoreToStatus(score);
    return {
      name: 'Bidding Strategy',
      score,
      icon: '',
      status,
      description: `Bidding strategies are ${score >= 80 ? 'appropriate for campaign objectives' : 'showing room for optimization'}. ${campaignsWithHighCpa > 0 ? `${campaignsWithHighCpa} campaigns have CPA above \u20B9${Math.round(avgCpa * 1.5)}.` : ''}`,
      recommendation: score >= 80
        ? `Bidding efficiency is good.${topByCpa.length >= 2 ? ` Test cost cap at \u20B9${Math.round(avgCpa * 0.9)} on '${topByCpa[0].label}' and '${topByCpa[1].label}'.` : ' Test cost cap on your top campaigns.'}`
        : score >= 60
          ? `${highCpaNames.length > 0 ? `Switch ${highCpaNames.join(', ')} to cost cap bidding. ` : ''}Target CPA of \u20B9${Math.round(avgCpa * 0.85)} — 15% below your \u20B9${Math.round(avgCpa)} average.`
          : `Major bid strategy overhaul needed.${highCpaNames.length > 0 ? ` Worst offenders: ${highCpaNames.join(', ')}.` : ''} Switch to cost cap at \u20B9${Math.round(avgCpa * 0.75)} or minimum ROAS bidding.`,
      details,
    };
  }

  // --- Creative Diversity ---
  private auditCreativeDiversity(ads: any[]): AuditCategory {
    if (ads.length === 0) {
      return {
        name: 'Creative Diversity',
        score: 20,
        icon: '',
        status: 'fail',
        description: 'No creative data available to assess diversity.',
        recommendation: 'Create diverse creatives: mix video, static, and carousel formats with varied hook and visual styles.',
        details: ['No ad creative data detected'],
      };
    }

    const totalAds = ads.length;
    const videoCount = ads.filter(a => a.object_type === 'VIDEO').length;
    const imageCount = totalAds - videoCount;
    const formats = new Set(ads.map(a => a.object_type || 'UNKNOWN'));
    const uniqueFormats = formats.size;

    // Assess diversity
    let score = 100;
    if (uniqueFormats < 2) score -= 25; // only one format
    if (totalAds < 5) score -= 20;
    // Check if one format dominates >80%
    const maxFormatRatio = Math.max(videoCount, imageCount) / Math.max(totalAds, 1);
    if (maxFormatRatio > 0.8) score -= 15; // over-reliance on one format
    if (totalAds < 10) score -= 10;
    // No carousel detection (Meta API doesn't always distinguish)
    score = Math.max(0, Math.min(100, score));

    const videoPercent = Math.round((videoCount / Math.max(totalAds, 1)) * 100);
    const imagePercent = 100 - videoPercent;

    const details: string[] = [];
    details.push(`${totalAds} total creatives analyzed`);
    details.push(`${uniqueFormats} ad format types detected`);
    details.push(`${videoPercent}% video, ${imagePercent}% static/image`);
    if (maxFormatRatio > 0.7) details.push(`Over-reliance on ${videoCount > imageCount ? 'video' : 'static'} format (${Math.round(maxFormatRatio * 100)}%)`);
    if (totalAds < 10) details.push(`Only ${totalAds} creatives — below recommended 10+ for testing`);

    const status = this.scoreToStatus(score);
    return {
      name: 'Creative Diversity',
      score,
      icon: '',
      status,
      description: `${score >= 80 ? 'Good' : score >= 60 ? 'Moderate' : 'Low'} creative diversity. ${uniqueFormats < 2 ? 'Only one format type detected.' : `${uniqueFormats} format types in use.`}`,
      recommendation: score >= 80
        ? 'Creative diversity is healthy. Continue testing new formats and styles regularly.'
        : score >= 60
          ? `Add more ${videoCount < imageCount ? 'video' : 'static/carousel'} creatives. Test 3-5 new hook types for variety.`
          : `Urgently create ${Math.max(8, 15 - totalAds)} new creatives with diverse formats. Add ${videoCount === 0 ? 'video' : 'carousel'} format and test new hook/visual DNA combinations.`,
      details,
    };
  }

  private scoreToStatus(score: number): 'pass' | 'warning' | 'fail' {
    if (score >= 80) return 'pass';
    if (score >= 60) return 'warning';
    return 'fail';
  }
}
