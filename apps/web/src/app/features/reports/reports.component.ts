const _BUILD_VER = '2026-03-04-v1';
import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../core/services/toast.service';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { environment } from '../../../environments/environment';

interface Report {
  id: string;
  name: string;
  type: string;
  dateRange: string;
  status: 'Ready' | 'Generating' | 'Scheduled' | 'Failed';
  createdAt: string;
  size: string;
  data?: any;
  expanded?: boolean;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Reports</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">Generate branded PDF reports for clients</p>
        </div>
        <button
          (click)="showGenerator.set(!showGenerator())"
          class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
          + New Report
        </button>
      </div>

      <!-- Report Generator Form -->
      @if (showGenerator()) {
        <div class="bg-white rounded-card shadow-card p-6">
          <h3 class="text-base font-display text-navy mb-4 mt-0">Generate Report</h3>
          <div class="grid md:grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Report Name</label>
              <input [(ngModel)]="reportName" placeholder="e.g., February Performance Report"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none" />
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Report Type</label>
              <select [(ngModel)]="reportType" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                <option value="performance">Performance Summary</option>
                <option value="creative">Creative Analysis</option>
                <option value="audience">Audience Insights</option>
                <option value="competitive">Competitive Analysis</option>
                <option value="full">Full Account Report</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Date Range</label>
              <select [(ngModel)]="reportDateRange" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="mtd">Month to Date</option>
                <option value="90d">Last Quarter</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-body font-semibold text-gray-700 block mb-1">Brand</label>
              <select [(ngModel)]="reportBrand" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none">
                <option value="all">All Brands</option>
                @for (brand of brands; track brand.id) {
                  <option [value]="brand.id">{{ brand.name }}</option>
                }
              </select>
            </div>
          </div>

          <!-- Sections to include -->
          <div class="mt-4">
            <label class="text-xs font-body font-semibold text-gray-700 block mb-2">Sections to Include</label>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
              @for (section of reportSections; track section.label) {
                <label class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                  <input type="checkbox" [(ngModel)]="section.checked" class="accent-accent" />
                  <span class="text-xs font-body text-gray-700">{{ section.label }}</span>
                </label>
              }
            </div>
          </div>

          <!-- Branding -->
          <div class="mt-4 flex items-center gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" [(ngModel)]="includeAgencyBranding" class="accent-accent" />
              <span class="text-xs font-body text-gray-700">Include agency branding</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" [(ngModel)]="includeAiSummary" class="accent-accent" />
              <span class="text-xs font-body text-gray-700">AI executive summary</span>
            </label>
          </div>

          <div class="flex justify-end gap-3 mt-5">
            <button (click)="showGenerator.set(false)" class="px-4 py-2 text-gray-500 text-sm font-body hover:text-gray-700">
              Cancel
            </button>
            <button (click)="scheduleReport()" class="px-4 py-2 border border-accent text-accent rounded-pill text-sm font-body font-semibold hover:bg-accent/5">
              Schedule Weekly
            </button>
            <button
              (click)="generateReport()"
              [disabled]="generating()"
              class="px-5 py-2 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 disabled:opacity-40">
              @if (generating()) {
                <span class="inline-flex items-center gap-1.5">
                  <span class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Generating...
                </span>
              } @else {
                Generate Report
              }
            </button>
          </div>
        </div>
      }

      <!-- Previously Generated Reports -->
      <div class="bg-white rounded-card shadow-card overflow-hidden">
        <div class="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 class="text-sm font-display text-navy m-0">Generated Reports</h3>
          <div class="flex items-center gap-3">
            <div class="flex gap-1">
              @for (f of typeFilters; track f.value) {
                <button (click)="activeFilter.set(f.value)"
                  class="px-2.5 py-1 rounded-pill text-[10px] font-body font-semibold transition-colors"
                  [ngClass]="activeFilter() === f.value ? 'bg-accent text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'">
                  {{ f.label }}
                </button>
              }
            </div>
            @if (!loading()) {
              <span class="text-xs text-gray-400 font-body">{{ filteredReports().length }} reports</span>
            }
          </div>
        </div>
        @if (loading()) {
          <div class="p-4 space-y-3">
            @for (i of [1,2,3,4]; track i) {
              <div class="animate-pulse flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex-1 space-y-2">
                  <div class="h-3 bg-gray-200 rounded w-48"></div>
                  <div class="h-2 bg-gray-200 rounded w-32"></div>
                </div>
                <div class="h-5 bg-gray-200 rounded w-14 ml-4"></div>
              </div>
            }
          </div>
        } @else if (loadError()) {
          <div class="p-12 text-center">
            <lucide-icon name="alert-circle" [size]="32" class="text-red-300 mx-auto mb-3"></lucide-icon>
            <p class="text-sm text-red-500 font-body mb-1">Failed to load reports</p>
            <button (click)="loadReports()" class="text-xs text-accent font-body font-semibold hover:underline">Try Again</button>
          </div>
        } @else if (reports.length === 0) {
          <div class="p-12 text-center">
            <lucide-icon name="file-text" [size]="32" class="text-gray-300 mx-auto mb-3"></lucide-icon>
            <p class="text-sm text-gray-500 font-body mb-0">No reports generated yet</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-xs font-body">
              <thead>
                <tr class="bg-gray-50 text-gray-500">
                  <th class="px-4 py-3 text-left font-semibold">Report Name</th>
                  <th class="px-4 py-3 text-left font-semibold">Type</th>
                  <th class="px-4 py-3 text-left font-semibold">Date Range</th>
                  <th class="px-4 py-3 text-left font-semibold">Status</th>
                  <th class="px-4 py-3 text-left font-semibold">Created</th>
                  <th class="px-4 py-3 text-left font-semibold">Size</th>
                  <th class="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (report of filteredReports(); track report.id) {
                  <tr class="border-t border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer" (click)="toggleReport(report)">
                    <td class="px-4 py-3 font-medium text-navy">
                      <div class="flex items-center gap-1.5">
                        @if (isAgentReport(report)) {
                          <span class="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0"></span>
                        }
                        {{ report.name }}
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <span class="px-2 py-0.5 rounded text-[10px] font-semibold"
                        [ngClass]="{
                          'bg-purple-50 text-purple-700': isAgentReport(report),
                          'bg-gray-100 text-gray-600': !isAgentReport(report)
                        }">
                        {{ formatType(report.type) }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-gray-600">{{ report.dateRange }}</td>
                    <td class="px-4 py-3">
                      <span class="px-2 py-0.5 rounded-pill text-[10px] font-semibold"
                        [ngClass]="{
                          'bg-green-50 text-green-700': report.status === 'Ready',
                          'bg-yellow-50 text-yellow-700': report.status === 'Generating',
                          'bg-blue-50 text-blue-700': report.status === 'Scheduled',
                          'bg-red-50 text-red-700': report.status === 'Failed'
                        }">
                        {{ report.status }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-gray-500">{{ report.createdAt }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ report.size }}</td>
                    <td class="px-4 py-3 text-right" (click)="$event.stopPropagation()">
                      @if (report.status === 'Ready') {
                        <div class="flex items-center gap-2 justify-end">
                          @if (report.data) {
                            <button (click)="toggleReport(report)" class="text-gray-400 hover:text-accent font-semibold">
                              {{ report.expanded ? 'Collapse' : 'View' }}
                            </button>
                          }
                          <button (click)="downloadReport(report)" class="text-accent hover:underline font-semibold">
                            Download
                          </button>
                        </div>
                      }
                    </td>
                  </tr>
                  @if (report.expanded && report.data) {
                    <tr>
                      <td colspan="7" class="px-4 py-0">
                        <div class="bg-gray-50 rounded-lg p-4 my-2 text-sm font-body text-gray-700 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                          @if (report.data.strategy_report) {
                            {{ report.data.strategy_report }}
                          } @else if (report.data.narrative?.executive_summary) {
                            <div class="mb-3">
                              <span class="text-xs font-semibold text-navy block mb-1">Executive Summary</span>
                              {{ report.data.narrative.executive_summary }}
                            </div>
                            @if (report.data.narrative.key_takeaways?.length) {
                              <div class="mb-3">
                                <span class="text-xs font-semibold text-navy block mb-1">Key Takeaways</span>
                                @for (t of report.data.narrative.key_takeaways; track t) {
                                  <div class="ml-2 mb-1">- {{ t }}</div>
                                }
                              </div>
                            }
                            @if (report.data.narrative.campaign_narratives?.length) {
                              <div>
                                <span class="text-xs font-semibold text-navy block mb-1">Campaigns</span>
                                @for (c of report.data.narrative.campaign_narratives; track c.name) {
                                  <div class="ml-2 mb-1">{{ c.name }}: {{ c.roas }} ROAS, {{ c.spend }} spend — {{ c.verdict }}</div>
                                }
                              </div>
                            }
                          } @else {
                            <pre class="text-xs overflow-x-auto">{{ report.data | json }}</pre>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `
})
export default class ReportsComponent implements OnInit {
  private toast = inject(ToastService);
  private api = inject(ApiService);
  private adAccountService = inject(AdAccountService);

  showGenerator = signal(false);
  generating = signal(false);
  loading = signal(true);
  loadError = signal(false);
  activeFilter = signal('all');

  typeFilters = [
    { value: 'all', label: 'All' },
    { value: 'agent', label: 'AI Agent' },
    { value: 'performance', label: 'Performance' },
    { value: 'creative', label: 'Creative' },
    { value: 'audience', label: 'Audience' },
  ];

  reportName = '';
  reportType = 'performance';
  reportDateRange = '30d';
  reportBrand = 'all';
  includeAgencyBranding = true;
  includeAiSummary = true;

  reportSections = [
    { label: 'KPI Summary', checked: true },
    { label: 'Creative Performance', checked: true },
    { label: 'Audience Breakdown', checked: true },
    { label: 'DNA Analysis', checked: true },
    { label: 'Budget Pacing', checked: false },
    { label: 'Recommendations', checked: true },
    { label: 'Competitor Insights', checked: false },
    { label: 'Trend Analysis', checked: true },
  ];

  reports: Report[] = [];
  brands: { id: string; name: string }[] = [];

  ngOnInit() {
    this.loadReports();
    this.loadBrands();
  }

  private loadBrands() {
    this.api.get<any>(environment.BRANDS_LIST).subscribe({
      next: (res) => {
        if (res.success && res.brands?.length) {
          this.brands = res.brands;
        }
      },
      error: () => this.toast.error('Load Failed', 'Could not load brands'),
    });
  }

  loadReports() {
    this.loading.set(true);
    this.loadError.set(false);
    const acc = this.adAccountService.currentAccount();
    const params: Record<string, string> = {};
    if (acc) params['account_id'] = acc.id;

    this.api.get<any>(environment.REPORTS_LIST, params).subscribe({
      next: (res) => {
        if (res.success && res.reports?.length) {
          this.reports = res.reports;
        } else {
          this.reports = [];
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  generateReport() {
    this.generating.set(true);
    const acc = this.adAccountService.currentAccount();
    const sections = this.reportSections.filter(s => s.checked).map(s => s.label);

    this.api.post<any>(environment.REPORTS_GENERATE, {
      name: this.reportName || 'Untitled Report',
      type: this.reportType,
      date_range: this.reportDateRange,
      brand: this.reportBrand,
      sections,
      include_branding: this.includeAgencyBranding,
      include_ai_summary: this.includeAiSummary,
      account_id: acc?.id || '',
      credential_group: acc?.credential_group || 'system',
    }).subscribe({
      next: (res) => {
        const typeLabels: Record<string, string> = {
          performance: 'Performance Summary',
          creative: 'Creative Analysis',
          audience: 'Audience Insights',
          competitive: 'Competitive Analysis',
          full: 'Full Account Report',
        };
        const rangeLbls: Record<string, string> = {
          '7d': 'Last 7 Days',
          '30d': 'Last 30 Days',
          'mtd': 'Month to Date',
          '90d': 'Last Quarter',
          'custom': 'Custom',
        };
        this.reports.unshift({
          id: res.report_id || 'r-' + Date.now(),
          name: this.reportName || 'Untitled Report',
          type: typeLabels[this.reportType] ?? 'Performance Summary',
          dateRange: rangeLbls[this.reportDateRange] ?? 'Last 30 Days',
          status: 'Ready',
          createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          size: res.size || 'PDF',
        });
        this.generating.set(false);
        this.showGenerator.set(false);
        this.toast.success('Report Generated!', res.doc_url ? 'View in Google Docs' : 'Your report is ready');
      },
      error: () => {
        this.generating.set(false);
        this.toast.error('Generation Failed', 'Could not generate report. Please try again.');
      },
    });
  }

  scheduleReport() {
    const acc = this.adAccountService.currentAccount();
    if (!acc) {
      this.toast.error('Error', 'Select an ad account to schedule weekly reports');
      return;
    }
    // Trigger an immediate weekly report generation to confirm setup
    this.api.post<any>(environment.REPORTS_GENERATE_WEEKLY, {
      account_id: acc.id,
    }).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success('Weekly Report Scheduled', 'Reports will auto-generate every Monday at 7 AM UTC. First report generated now.');
          this.showGenerator.set(false);
          this.loadReports();
        }
      },
      error: () => {
        this.toast.error('Error', 'Could not schedule weekly reports');
      },
    });
  }

  filteredReports(): Report[] {
    const filter = this.activeFilter();
    if (filter === 'all') return this.reports;
    if (filter === 'agent') return this.reports.filter(r => this.isAgentReport(r));
    return this.reports.filter(r => r.type === filter);
  }

  isAgentReport(report: Report): boolean {
    return report.type === 'weekly-strategy' || report.type === 'agent_weekly';
  }

  formatType(type: string): string {
    const map: Record<string, string> = {
      'weekly-strategy': 'AI Strategy',
      'agent_weekly': 'AI Weekly',
      performance: 'Performance',
      creative: 'Creative',
      audience: 'Audience',
      full: 'Full Report',
    };
    return map[type] || type;
  }

  toggleReport(report: Report) {
    report.expanded = !report.expanded;
  }

  downloadReport(report: Report) {
    if (!report.data) {
      this.toast.error('No Data', 'Report data not available');
      return;
    }

    const data = report.data;
    const sections: string[] = [];

    // Executive Summary
    if (data.narrative?.executive_summary) {
      sections.push(`<div class="section"><h2>Executive Summary</h2><p>${this.escapeHtml(data.narrative.executive_summary)}</p></div>`);
    }
    if (data.strategy_report) {
      sections.push(`<div class="section"><h2>Strategy Report</h2><p>${this.escapeHtml(data.strategy_report).replace(/\n/g, '<br>')}</p></div>`);
    }
    if (data.summary) {
      sections.push(`<div class="section"><h2>Summary</h2><p>${this.escapeHtml(data.summary).replace(/\n/g, '<br>')}</p></div>`);
    }

    // Key Takeaways
    if (data.narrative?.key_takeaways?.length) {
      const items = data.narrative.key_takeaways.map((t: string) => `<li>${this.escapeHtml(t)}</li>`).join('');
      sections.push(`<div class="section"><h2>Key Takeaways</h2><ul>${items}</ul></div>`);
    }

    // KPIs Table
    if (data.kpis && Object.keys(data.kpis).length > 0) {
      const rows = Object.entries(data.kpis).map(([k, v]) =>
        `<tr><td class="metric-label">${this.escapeHtml(k)}</td><td class="metric-value">${this.escapeHtml(String(v))}</td></tr>`
      ).join('');
      sections.push(`<div class="section"><h2>Key Metrics</h2><table class="kpi-table"><tbody>${rows}</tbody></table></div>`);
    }

    // Campaign Narratives
    if (data.narrative?.campaign_narratives?.length) {
      const rows = data.narrative.campaign_narratives.map((c: any) =>
        `<tr><td>${this.escapeHtml(c.name)}</td><td>${c.roas}</td><td>${this.escapeHtml(String(c.spend))}</td><td><span class="verdict verdict-${(c.verdict || '').toLowerCase().includes('scale') ? 'good' : (c.verdict || '').toLowerCase().includes('cut') ? 'bad' : 'neutral'}">${this.escapeHtml(c.verdict)}</span></td></tr>`
      ).join('');
      sections.push(`<div class="section"><h2>Campaign Performance</h2><table class="campaign-table"><thead><tr><th>Campaign</th><th>ROAS</th><th>Spend</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>`);
    }

    // Recommendations
    if (data.recommendations?.length) {
      const items = data.recommendations.map((rec: any) => {
        const text = typeof rec === 'string' ? rec : rec.title || rec.message || JSON.stringify(rec);
        return `<li>${this.escapeHtml(text)}</li>`;
      }).join('');
      sections.push(`<div class="section"><h2>Recommendations</h2><ol class="recommendations">${items}</ol></div>`);
    }

    // Custom sections
    if (data.sections) {
      for (const [section, value] of Object.entries(data.sections || {})) {
        const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        sections.push(`<div class="section"><h2>${this.escapeHtml(section)}</h2><p>${this.escapeHtml(content).replace(/\n/g, '<br>')}</p></div>`);
      }
    }

    // Build the PDF HTML document
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${this.escapeHtml(report.name)}</title>
<style>
  @page { margin: 1in 0.75in; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; line-height: 1.6; }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #2d2b55 100%); color: white; padding: 40px; margin: -1in -0.75in 0; }
  .header h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
  .header .meta { font-size: 12px; opacity: 0.8; }
  .header .meta span { margin-right: 16px; }
  .brand { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.6; margin-bottom: 12px; }
  .section { margin-top: 28px; page-break-inside: avoid; }
  .section h2 { font-size: 16px; font-weight: 700; color: #1a1a2e; border-bottom: 2px solid #6c63ff; padding-bottom: 6px; margin-bottom: 12px; }
  .section p { font-size: 13px; color: #4a4a6a; }
  .section ul, .section ol { padding-left: 20px; font-size: 13px; color: #4a4a6a; }
  .section li { margin-bottom: 6px; }
  .recommendations li { margin-bottom: 8px; }
  .kpi-table { width: 100%; border-collapse: collapse; }
  .kpi-table td { padding: 10px 16px; border-bottom: 1px solid #eee; font-size: 13px; }
  .kpi-table .metric-label { font-weight: 600; color: #1a1a2e; width: 40%; }
  .kpi-table .metric-value { color: #6c63ff; font-weight: 700; font-size: 15px; }
  .campaign-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .campaign-table th { background: #f8f8fc; padding: 8px 12px; text-align: left; font-weight: 600; color: #1a1a2e; border-bottom: 2px solid #e2e2f0; }
  .campaign-table td { padding: 8px 12px; border-bottom: 1px solid #f0f0f5; }
  .verdict { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .verdict-good { background: #e8f5e9; color: #2e7d32; }
  .verdict-bad { background: #fce4ec; color: #c62828; }
  .verdict-neutral { background: #f3e5f5; color: #6a1b9a; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #999; text-align: center; }
</style></head><body>
<div class="header">
  <div class="brand">Cosmisk</div>
  <h1>${this.escapeHtml(report.name)}</h1>
  <div class="meta">
    <span>${this.escapeHtml(report.type)}</span>
    <span>${this.escapeHtml(report.dateRange)}</span>
    <span>Generated: ${this.escapeHtml(report.createdAt)}</span>
  </div>
</div>
${sections.join('\n')}
<div class="footer">Generated by Cosmisk &mdash; AI-Powered Creative Intelligence</div>
</body></html>`;

    // Open in new window for print-to-PDF
    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
        this.toast.success('PDF Ready', 'Use your browser\'s print dialog to save as PDF.');
      }, 300);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
