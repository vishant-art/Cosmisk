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
  status: 'Ready' | 'Generating' | 'Scheduled';
  createdAt: string;
  size: string;
  data?: any;
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
          @if (!loading()) {
            <span class="text-xs text-gray-400 font-body">{{ reports.length }} reports</span>
          }
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
                @for (report of reports; track report.id) {
                  <tr class="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3 font-medium text-navy">{{ report.name }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ report.type }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ report.dateRange }}</td>
                    <td class="px-4 py-3">
                      <span class="px-2 py-0.5 rounded-pill text-[10px] font-semibold"
                        [ngClass]="{
                          'bg-green-50 text-green-700': report.status === 'Ready',
                          'bg-yellow-50 text-yellow-700': report.status === 'Generating',
                          'bg-blue-50 text-blue-700': report.status === 'Scheduled'
                        }">
                        {{ report.status }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-gray-500">{{ report.createdAt }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ report.size }}</td>
                    <td class="px-4 py-3 text-right">
                      @if (report.status === 'Ready') {
                        <button (click)="downloadReport(report)" class="text-accent hover:underline font-semibold">
                          Download
                        </button>
                      }
                    </td>
                  </tr>
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
        console.error('Failed to load reports:', err);
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

  downloadReport(report: Report) {
    if (!report.data) {
      this.toast.error('No Data', 'Report data not available');
      return;
    }

    // Build readable text from report data
    const data = report.data;
    let content = `# ${report.name}\n`;
    content += `Type: ${report.type} | Period: ${report.dateRange} | Generated: ${report.createdAt}\n\n`;

    if (data.summary) content += `## Summary\n${data.summary}\n\n`;
    if (data.narrative) content += `## Analysis\n${data.narrative}\n\n`;
    if (data.kpis) {
      content += `## Key Metrics\n`;
      for (const [key, val] of Object.entries(data.kpis || {})) {
        content += `- ${key}: ${val}\n`;
      }
      content += '\n';
    }
    if (data.recommendations?.length) {
      content += `## Recommendations\n`;
      for (const rec of data.recommendations) {
        content += `- ${typeof rec === 'string' ? rec : rec.title || rec.message || JSON.stringify(rec)}\n`;
      }
      content += '\n';
    }
    if (data.sections) {
      for (const [section, value] of Object.entries(data.sections || {})) {
        content += `## ${section}\n${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n\n`;
      }
    }

    // Fallback: dump entire data as formatted JSON
    if (content.length < 200) {
      content += JSON.stringify(data, null, 2);
    }

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.name.replace(/\s+/g, '-').toLowerCase()}-${report.createdAt?.split(',')[0]?.trim() || 'report'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
