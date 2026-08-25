import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ProtoStateService } from '../proto-state.service';
import { FIRST_FINDING } from '../proto-data';

/**
 * PROTOTYPE — Blueprint §11. The first finding.
 *
 * Five blocks: WHAT WE FOUND → EVIDENCE → WHAT WE THINK IS HAPPENING → WHAT TO DO
 * → THEN COSMISK CHECKS ITSELF.
 *
 * LAID OUT TO FIT ONE SCREEN. Stacked in a 760px column the five blocks ran to
 * ~1970px, so the recommendation — the only part that asks the user to do
 * anything — sat two scrolls below the fold. It is now a Z: a full-width finding,
 * then evidence | interpretation, then recommendation | learning. Reading order
 * is still 1→5; only the geometry changed.
 *
 * The last block is the one that makes this Cosmisk rather than a report. A tool
 * that recommends and never returns is guessing in public; the loop only closes
 * when the recommendation is measured against what actually happened.
 *
 * Facts and interpretation are deliberately styled differently. Evidence is
 * mono/tabular on white. Interpretation sits on a tinted panel and is written in
 * sentences. A user must never have to guess which is which.
 */
@Component({
  selector: 'proto-aha',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="w-full max-w-[1180px] animate-fade-in">

      <!-- ── 1. WHAT WE FOUND — full width, one line of headline ───── -->
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 mr-0.5">What Cosmisk found</span>
        <span class="text-[11px] font-mono uppercase tracking-wider text-red-700
          bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">{{ f.severity }}</span>
        <span class="text-[11px] font-mono uppercase tracking-wider text-gray-500
          bg-white border border-divider px-2 py-0.5 rounded-full">{{ f.confidence }}</span>
        @if (state.isDemo()) {
          <span class="text-[11px] font-mono uppercase tracking-wider text-amber-700
            bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Sample data</span>
        }
      </div>

      <h1 class="text-[28px] leading-[36px] font-display font-bold text-navy mb-1.5">
        {{ f.headline }}
      </h1>
      <p class="text-[15px] leading-[23px] text-gray-500 font-body m-0 mb-0.5">{{ f.subhead }}</p>
      <p class="text-[11px] font-mono uppercase tracking-wider text-gray-400 m-0 mb-2.5">{{ f.basedOn }}</p>

      <!-- ── 2 + 3 — facts on the left, thinking on the right ──────
           Side by side rather than stacked. Reading order is unchanged
           (evidence then interpretation), but putting them shoulder to
           shoulder makes the difference between a measurement and a
           judgement impossible to miss. -->
      <div class="grid lg:grid-cols-2 gap-4 mb-3">

        <!-- EVIDENCE (facts) -->
        <div class="card !p-0 overflow-hidden">
          <div class="px-5 py-2 border-b border-divider bg-[#FBFBFC]">
            <span class="text-[11px] font-mono uppercase tracking-wider text-gray-500">Evidence</span>
            <span class="text-[11px] text-gray-400 font-body ml-2">— measured, not inferred</span>
          </div>
          <div class="divide-y divide-divider">
            @for (e of f.evidence; track e.label) {
              <div class="px-5 py-2">
                <div class="flex items-baseline justify-between gap-3">
                  <span class="text-[13px] font-body font-semibold text-navy">{{ e.label }}</span>
                  <span class="text-[13px] font-mono font-semibold shrink-0"
                    [class]="e.tone === 'bad' ? 'text-red-600'
                           : e.tone === 'good' ? 'text-emerald-600'
                           : 'text-navy'">{{ e.value }}</span>
                </div>
                <p class="text-[11px] text-gray-500 font-mono leading-[16px] m-0 mt-0.5">{{ e.detail }}</p>
              </div>
            }
          </div>
        </div>

        <!-- INTERPRETATION (thinking) -->
        <div class="rounded-card border border-accent/20 bg-accent-light/40 p-5">
          <div class="flex items-center gap-2 mb-2.5">
            <lucide-icon name="brain" [size]="14" class="text-accent"></lucide-icon>
            <span class="text-[11px] font-mono uppercase tracking-wider text-accent">What Cosmisk thinks is happening</span>
          </div>
          <div class="space-y-2">
            @for (line of f.interpretation; track line) {
              <p class="text-[13px] leading-[20px] text-navy font-body m-0">{{ line }}</p>
            }
          </div>
          <div class="mt-2.5 pt-2.5 border-t border-accent/15">
            <p class="text-[11px] text-gray-500 font-body m-0 leading-[16px]">
              <span class="font-mono uppercase tracking-wider text-[10px] text-gray-400 mr-1.5">Caveat</span>
              {{ f.interpretationCaveat }}
            </p>
          </div>
        </div>
      </div>

      <!-- ── 4 + 5 — the recommendation, and what happens after it ── -->
      <div class="grid lg:grid-cols-12 gap-4">

        <!-- WHAT TO DO -->
        <div class="lg:col-span-7 card !p-5 border-l-[3px] !border-l-emerald-500">
          <div class="flex items-center justify-between gap-4 mb-2">
            <span class="text-[11px] font-mono uppercase tracking-wider text-emerald-700">What to do</span>
            <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">{{ f.recommendation.effort }}</span>
          </div>

          <p class="text-[15px] leading-[23px] font-body font-semibold text-navy m-0 mb-1.5">
            {{ f.recommendation.action }}
          </p>
          <p class="text-[13px] text-gray-600 font-body m-0 mb-3 leading-[19px]">
            {{ f.recommendation.reasoning }}
          </p>

          <!-- The projection, laid out as arithmetic that reads left to right -->
          <div class="rounded-xl border border-emerald-100 bg-emerald-50 overflow-hidden mb-2.5">
            <div class="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-emerald-100">
              @for (p of f.recommendation.projection; track p.label) {
                <div class="px-3 py-2.5">
                  <p class="text-[11px] text-emerald-900/70 font-body m-0 leading-[15px]">{{ p.label }}</p>
                  <p class="text-[13px] font-mono font-semibold text-emerald-800 m-0 mt-1">{{ p.value }}</p>
                  <p class="text-[10px] text-emerald-700/80 font-mono m-0 mt-0.5 leading-[13px]">{{ p.note }}</p>
                </div>
              }
            </div>
            <div class="px-3 py-2 bg-emerald-100/50 border-t border-emerald-100">
              <p class="text-[11px] text-emerald-800 font-body m-0 leading-[15px]">
                <span class="font-mono uppercase tracking-wider text-[10px] text-emerald-700 mr-1.5">Assumption</span>
                {{ f.recommendation.projectionAssumption }}
              </p>
            </div>
          </div>

          <p class="text-[11px] text-gray-500 font-body m-0 leading-[16px]">{{ f.recommendation.caveat }}</p>
        </div>

        <!-- LEARNING, then the unbuilt action, then the exits -->
        <div class="lg:col-span-5 flex flex-col gap-3">

          <div class="card !p-5 flex-1">
            <div class="flex items-center gap-2 mb-2.5">
              <lucide-icon name="rotate-ccw" [size]="14" class="text-navy"></lucide-icon>
              <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">Then Cosmisk checks itself</span>
            </div>

            <!-- The loop is shown as stages with their real status, so the button
                 cannot be mistaken for Cosmisk having learned anything. Recording
                 an action is step one of five, and the last four have not run. -->
            <div class="space-y-1 mb-2.5">
              @for (s of loop; track s.label; let i = $index) {
                <div class="flex items-center gap-2">
                  @if (i < doneCount()) {
                    <lucide-icon name="check" [size]="12" class="text-emerald-600 shrink-0"></lucide-icon>
                  } @else {
                    <span class="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0 mx-[3px]"></span>
                  }
                  <span class="text-[12px] font-body"
                    [class]="i < doneCount() ? 'text-navy font-medium' : 'text-gray-400'">{{ s.label }}</span>
                  <span class="ml-auto text-[10px] font-mono uppercase tracking-wider shrink-0"
                    [class]="i < doneCount() ? 'text-emerald-700' : 'text-gray-400'">
                    {{ i < doneCount() ? s.done : s.pending }}
                  </span>
                </div>
              }
            </div>

            @if (!state.findingActioned()) {
              <p class="text-[11px] text-gray-500 font-body m-0 mb-2.5 leading-[16px]">
                This records the action. It does not mean Cosmisk knows the call was right.
              </p>
              <button (click)="markDone()" class="btn-secondary !rounded-xl !py-2 !text-[13px]">
                <lucide-icon name="check" [size]="14"></lucide-icon> I have done this
              </button>
            } @else {
              <p class="text-[11px] text-gray-500 font-body m-0 leading-[16px]">
                Recorded — this confirms the recommended action was taken. Cosmisk has not evaluated
                the outcome yet. Outcome tracking will come later.
              </p>
            }
          </div>

          <!-- Future action — outside the recommendation card, so it reads as a
               capability Cosmisk does not have rather than as a step to take. -->
          <div class="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#F1F2F5] border border-dashed border-gray-300">
            <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 shrink-0">⌁ Future</span>
            <span class="text-[13px] text-gray-500 font-body">Do this for me in Ads Manager</span>
            <span class="text-[11px] text-gray-400 font-body ml-auto shrink-0">Not built</span>
          </div>

          <div class="flex gap-3">
            <button (click)="toDashboard()" class="btn-primary flex-1 !rounded-xl !py-2.5 !text-sm">
              Go to my dashboard <lucide-icon name="arrow-right" [size]="15"></lucide-icon>
            </button>
            <button (click)="ask()" class="btn-secondary !rounded-xl !py-2.5 px-4 !text-sm">
              <lucide-icon name="message-square" [size]="14"></lucide-icon> Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export default class ProtoAhaComponent {
  private router = inject(Router);
  state = inject(ProtoStateService);
  f = FIRST_FINDING;

  /**
   * The five stages of the loop. Only the first is ever reachable in Slice 1 —
   * Slice 1 persists no baseline (X5, locked), and the rest need real elapsed
   * data, which the product does not have and must not pretend to. Their status
   * strings say when, not whether.
   */
  loop = [
    { label: 'Action recorded', done: 'By you', pending: 'Waiting for you' },
    { label: 'Baseline locked', done: '', pending: "Today's numbers" },
    { label: 'Cosmisk observes new data', done: '', pending: 'Next 7 days' },
    { label: 'Outcome evaluated', done: '', pending: 'Verdict on day 7' },
    { label: 'Cosmisk adjusts its model', done: '', pending: 'After the verdict' },
  ];

  /** Only the action itself can complete. Slice 1 persists no baseline. */
  doneCount = computed(() => (this.state.findingActioned() ? 1 : 0));

  constructor() {
    this.state.hasSeenFinding.set(true);
  }

  /** Records that the user took the action. Nothing else. No baseline, no outcome. */
  markDone() {
    this.state.findingActioned.set(true);
  }

  toDashboard() {
    this.router.navigate(['/proto/dashboard']);
  }
  ask() {
    this.router.navigate(['/proto/ask'], { queryParams: { q: 'Why did ROAS drop?' } });
  }
}
