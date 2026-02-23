import { Component, Input, ViewChild, ElementRef, AfterViewInit, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-area-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<div [style.height.px]="height"><canvas #chartCanvas></canvas></div>`
})
export class AreaChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;
  @Input() labels: string[] = [];
  @Input() values: number[] = [];
  @Input() label = 'Value';
  @Input() color = '#6366F1';
  @Input() height = 208;
  @Input() suffix = '';

  private chart?: Chart;

  ngAfterViewInit() { this.createChart(); }

  ngOnChanges(changes: SimpleChanges) {
    if (this.chart && (changes['values'] || changes['labels'] || changes['color'])) {
      this.chart.data.labels = this.labels;
      this.chart.data.datasets[0].data = this.values;
      this.chart.data.datasets[0].borderColor = this.color;
      this.chart.data.datasets[0].backgroundColor = this.color + '1A';
      this.chart.update('none');
    }
  }

  ngOnDestroy() { this.chart?.destroy(); }

  private createChart() {
    const ctx = this.chartCanvas.nativeElement.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, this.color + '33');
    gradient.addColorStop(1, this.color + '05');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [{
          label: this.label,
          data: this.values,
          borderColor: this.color,
          backgroundColor: gradient,
          fill: true,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: this.color,
          pointHoverBorderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#1A1A2E',
            titleFont: { family: 'JetBrains Mono', size: 11 },
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => `${ctx.parsed.y}${this.suffix}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#9CA3AF', font: { family: 'JetBrains Mono', size: 10 } },
            border: { display: false }
          },
          y: {
            grid: { color: '#F0EDE8' },
            ticks: { color: '#9CA3AF', font: { family: 'JetBrains Mono', size: 10 } },
            border: { display: false }
          }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false }
      }
    });
  }
}
