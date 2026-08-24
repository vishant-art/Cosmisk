import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ProtoStateService } from '../proto-state.service';

/**
 * PROTOTYPE — Blueprint §10.
 *
 * ⚠ HONESTY CONSTRAINT.
 * There is no progress channel in the product today. apps/api/src/routes/audits.ts
 * exposes trigger / poll / fetch, but nothing streams per-phase progress. The
 * sequencing below is therefore a PROTOTYPE ANIMATION, and the banner on screen
 * says so rather than implying the backend reports these phases.
 *
 * The blueprint recommended cutting this screen entirely and running the audit
 * asynchronously from discovery. It is built here because it was explicitly
 * requested for review. That decision is still open.
 */
@Component({
  selector: 'proto-processing',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="w-full max-w-[560px] animate-fade-in">

      <div class="text-center mb-8">
        <h1 class="text-page-title font-display text-navy mb-2">
          Cosmisk is going through your account.
        </h1>
        <p class="text-body text-gray-500 m-0">
          {{ done() ? 'Done. It found something.' : 'Reading 42 days of history.' }}
        </p>
      </div>

      <div class="card !p-7 mb-5">
        <div class="space-y-1">
          @for (p of phases; track p.label; let i = $index) {
            <div class="flex items-center gap-3.5 py-3"
              [class.opacity-40]="i > current()">

              <!-- state dot -->
              <div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
                [class]="i < current() ? 'bg-emerald-100'
                       : i === current() ? 'bg-accent-light'
                       : 'bg-gray-100'">
                @if (i < current()) {
                  <lucide-icon name="check" [size]="14" class="text-emerald-600"></lucide-icon>
                } @else if (i === current()) {
                  <span class="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin"></span>
                } @else {
                  <span class="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                }
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-sm font-body m-0"
                  [class]="i <= current() ? 'text-navy font-medium' : 'text-gray-400'">
                  {{ p.label }}
                </p>
                @if (i === current() && !done()) {
                  <p class="text-xs text-gray-400 font-body m-0 mt-0.5">{{ p.detail }}</p>
                }
                @if (i < current()) {
                  <p class="text-xs text-gray-400 font-body m-0 mt-0.5">{{ p.result }}</p>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Honesty banner — this is prototype behaviour, not a real progress feed -->
      <div class="mb-6 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
        <p class="text-[11px] font-mono uppercase tracking-wider text-amber-700 m-0 mb-1">Prototype behaviour</p>
        <p class="text-xs text-amber-800 font-body m-0 leading-relaxed">
          The steps above are animated on a timer. The product has no per-phase progress channel
          today — the real audit returns a single result with no intermediate reporting. Do not
          build this sequencing without a real progress stream behind it.
        </p>
      </div>

      @if (done()) {
        <button (click)="go()" class="btn-primary w-full !rounded-xl !py-3 !text-[15px] animate-scale-in">
          Show me what you found <lucide-icon name="arrow-right" [size]="16"></lucide-icon>
        </button>
      } @else {
        <button (click)="go()" class="btn-ghost w-full !rounded-xl !py-3 !text-sm !text-gray-400">
          Skip ahead
        </button>
      }
    </div>
  `,
})
export default class ProtoProcessingComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private state = inject(ProtoStateService);

  current = signal(0);
  done = signal(false);
  private timers: any[] = [];

  phases = [
    {
      label: 'Understanding your brand',
      detail: 'Reading your site, products and pricing',
      result: '14 products · mid-market · women 25–40',
    },
    {
      label: 'Understanding performance',
      detail: 'Pulling 42 days of spend and revenue',
      result: '8 campaigns · 47 creatives · ₹18.4L spend',
    },
    {
      label: 'Studying creative patterns',
      detail: 'Comparing hooks, formats and decay curves',
      result: '6 hook types · 2 creatives past frequency 5.0',
    },
    {
      label: 'Preparing your first finding',
      detail: 'Working out what actually matters',
      result: '1 finding worth your attention',
    },
  ];

  ngOnInit() {
    // 1s a phase, 4s total. Long enough to read each result line, short enough
    // that nobody is waiting on an animation for a result that already exists.
    const step = 1000;
    this.phases.forEach((_, i) => {
      this.timers.push(setTimeout(() => this.current.set(i + 1), step * (i + 1)));
    });
    this.timers.push(
      setTimeout(() => this.done.set(true), step * this.phases.length)
    );
  }

  ngOnDestroy() {
    this.timers.forEach(clearTimeout);
  }

  go() {
    this.state.hasSeenFinding.set(true);
    this.router.navigate(['/proto/aha']);
  }
}
