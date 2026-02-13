import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../core/services/toast.service';

interface Report {
  id: string;
  name: string;
  type: string;
  dateRange: string;
  status: 'Ready' | 'Generating' | 'Scheduled';
  createdAt: string;
  size: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
                <option value="oziva">OZiva</option>
                <option value="wow">WOW Skin Science</option>
                <option value="plum">Plum Goodness</option>
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
          <span class="text-xs text-gray-400 font-body">{{ reports.length }} reports</span>
        </div>
        @if (reports.length === 0) {
          <div class="p-12 text-center">
            <span class="text-4xl block mb-3">📄</span>
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
export default class ReportsComponent {
  private toast = inject(ToastService);

  showGenerator = signal(false);
  generating = signal(false);

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

  reports: Report[] = [
    { id: 'r-1', name: 'January 2024 Performance', type: 'Performance Summary', dateRange: 'Jan 1-31', status: 'Ready', createdAt: 'Feb 1, 2024', size: '2.4 MB' },
    { id: 'r-2', name: 'Collagen Range Deep Dive', type: 'Creative Analysis', dateRange: 'Jan 15 - Feb 8', status: 'Ready', createdAt: 'Feb 8, 2024', size: '3.1 MB' },
    { id: 'r-3', name: 'Weekly Client Report — W5', type: 'Full Account Report', dateRange: 'Jan 29 - Feb 4', status: 'Scheduled', createdAt: 'Feb 5, 2024', size: '-' },
    { id: 'r-4', name: 'Audience Insights Q4', type: 'Audience Insights', dateRange: 'Oct-Dec 2023', status: 'Ready', createdAt: 'Jan 5, 2024', size: '1.8 MB' },
  ];

  generateReport() {
    this.generating.set(true);
    setTimeout(() => {
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
        id: 'r-' + Date.now(),
        name: this.reportName || 'Untitled Report',
        type: typeLabels[this.reportType] ?? 'Performance Summary',
        dateRange: rangeLbls[this.reportDateRange] ?? 'Last 30 Days',
        status: 'Ready',
        createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        size: (1.5 + Math.random() * 3).toFixed(1) + ' MB',
      });
      this.generating.set(false);
      this.showGenerator.set(false);
      this.toast.success('Report Generated!', 'Your report is ready for download');
    }, 3000);
  }

  scheduleReport() {
    this.reports.unshift({
      id: 'r-' + Date.now(),
      name: (this.reportName || 'Weekly Report') + ' (Scheduled)',
      type: 'Performance Summary',
      dateRange: 'Weekly',
      status: 'Scheduled',
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      size: '-',
    });
    this.showGenerator.set(false);
    this.toast.info('Report Scheduled', 'Weekly report will be generated every Monday');
  }

  downloadReport(report: Report) {
    this.toast.success('Downloading...', `${report.name} (${report.size})`);
  }
}
