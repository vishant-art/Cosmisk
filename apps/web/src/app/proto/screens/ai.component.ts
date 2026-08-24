import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ProtoStateService } from '../proto-state.service';
import { AI_ANSWER, SUGGESTED_QUESTIONS, AiBlock } from '../proto-data';

/**
 * PROTOTYPE — Blueprint §13 + §14.
 *
 * Not a chat bubble UI. The answer is rendered as a labelled work product:
 * TAKEAWAY → DIAGNOSIS → EVIDENCE → WHAT I THINK IS HAPPENING → WHAT TO DO,
 * with unbuilt capabilities marked ⌁ FUTURE rather than implied.
 *
 * SIMULATED: the response is a fixed local object revealed block by block.
 * No LLM call, no /api/ai-layer/chat/stream, no tokens spent.
 */
@Component({
  selector: 'proto-ai',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="px-5 md:px-8 py-7 max-w-[820px] mx-auto">

      <div class="mb-7">
        <h1 class="text-page-title font-display text-navy mb-1">Ask Cosmisk</h1>
        <p class="text-body text-gray-500 m-0">
          It already has {{ state.brand().name }}, 47 creatives and 42 days of history loaded.
        </p>
      </div>

      <!-- QUESTION -->
      @if (question()) {
        <div class="flex items-start gap-3 mb-6 pb-6 border-b border-divider">
          <div class="w-7 h-7 rounded-full bg-navy flex items-center justify-center shrink-0 mt-0.5">
            <span class="text-[11px] font-semibold text-white">{{ userInitial() }}</span>
          </div>
          <p class="text-[17px] leading-[27px] font-body font-medium text-navy m-0">{{ question() }}</p>
        </div>
      }

      <!-- THINKING -->
      @if (thinking()) {
        <div class="flex items-center gap-3 py-4">
          <div class="flex gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style="animation-delay:0ms"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style="animation-delay:150ms"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style="animation-delay:300ms"></span>
          </div>
          <span class="text-sm text-gray-400 font-body">{{ thinkingLabel() }}</span>
        </div>
      }

      <!-- ANSWER -->
      @if (visible().length) {
        <div class="space-y-5 animate-fade-in">
          @for (b of visible(); track $index) {

            @switch (b.type) {

              @case ('takeaway') {
                <div class="border-l-[3px] border-l-accent pl-5 py-1">
                  <span class="text-[11px] font-mono uppercase tracking-wider text-accent block mb-2">Takeaway</span>
                  <p class="text-[19px] leading-[29px] font-display font-bold text-navy m-0">{{ b.text }}</p>
                </div>
              }

              @case ('diagnosis') {
                <div>
                  <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 block mb-2">Diagnosis</span>
                  <p class="text-[15px] leading-[25px] text-navy font-body m-0">{{ b.text }}</p>
                </div>
              }

              @case ('evidence') {
                <div class="card !p-0 overflow-hidden">
                  <div class="px-5 py-3 border-b border-divider bg-[#FBFBFC]">
                    <span class="text-[11px] font-mono uppercase tracking-wider text-gray-500">Evidence</span>
                    <span class="text-[11px] text-gray-400 font-body ml-2">— measured, not inferred</span>
                  </div>
                  <div class="divide-y divide-divider">
                    @for (r of b.rows; track r.label) {
                      <div class="px-5 py-3">
                        <div class="flex items-baseline justify-between gap-4 mb-0.5">
                          <span class="text-sm font-body font-medium text-navy">{{ r.label }}</span>
                          <span class="text-sm font-mono font-semibold shrink-0"
                            [class]="r.tone === 'bad' ? 'text-red-600'
                                   : r.tone === 'good' ? 'text-emerald-600' : 'text-navy'">{{ r.value }}</span>
                        </div>
                        <p class="text-xs text-gray-500 font-mono m-0">{{ r.detail }}</p>
                      </div>
                    }
                  </div>
                </div>
              }

              @case ('interpretation') {
                <div class="rounded-card border border-accent/20 bg-accent-light/40 p-5">
                  <span class="text-[11px] font-mono uppercase tracking-wider text-accent block mb-3">
                    What I think is happening
                  </span>
                  <div class="space-y-2.5">
                    @for (item of b.items; track item) {
                      <p class="text-[15px] leading-[25px] text-navy font-body m-0">{{ item }}</p>
                    }
                  </div>
                </div>
              }

              @case ('action') {
                <div class="card !p-5 border-l-[3px] !border-l-emerald-500">
                  <span class="text-[11px] font-mono uppercase tracking-wider text-emerald-700 block mb-3">What to do</span>
                  <ol class="m-0 pl-5 space-y-2.5">
                    @for (item of b.items; track item) {
                      <li class="text-[15px] leading-[25px] text-navy font-body">{{ item }}</li>
                    }
                  </ol>
                </div>
              }

              @case ('future') {
                <div class="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#F7F8FA] border border-dashed border-gray-300">
                  <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 shrink-0">⌁ Future</span>
                  <span class="text-sm text-gray-500 font-body">{{ b.text }}</span>
                  <span class="text-[11px] text-gray-400 font-body ml-auto shrink-0">Not built</span>
                </div>
              }
            }
          }
        </div>

        @if (complete()) {
          <div class="mt-7 pt-6 border-t border-divider">
            <p class="text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-3">Follow up</p>
            <div class="flex flex-wrap gap-2">
              @for (q of suggested(); track q) {
                <button (click)="ask(q)"
                  class="px-3.5 py-2 rounded-full bg-white border border-border text-sm font-body
                  text-navy cursor-pointer hover:border-accent hover:text-accent transition-colors">
                  {{ q }}
                </button>
              }
            </div>
          </div>
        }
      }

      <!-- EMPTY -->
      @if (!question() && !thinking()) {
        <div class="py-4">
          <p class="text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-3">Try one of these</p>
          <div class="flex flex-wrap gap-2">
            @for (q of suggested(); track q) {
              <button (click)="ask(q)"
                class="px-3.5 py-2 rounded-full bg-white border border-border text-sm font-body
                text-navy cursor-pointer hover:border-accent hover:text-accent transition-colors">
                {{ q }}
              </button>
            }
          </div>
        </div>
      }

      <!-- COMPOSER -->
      <div class="mt-8 sticky bottom-4">
        <div class="flex gap-2.5 bg-white border border-border rounded-2xl p-2 shadow-card">
          <input class="flex-1 border-0 bg-transparent px-3 text-sm font-body text-navy
            placeholder:text-gray-400 focus:outline-none"
            [(ngModel)]="draft" (keyup.enter)="submit()"
            placeholder="Ask about a creative, a campaign or a number…">
          <button (click)="submit()" [disabled]="thinking()"
            class="btn-primary !rounded-xl !py-2.5 !px-4 shrink-0">
            <lucide-icon name="arrow-up" [size]="16"></lucide-icon>
          </button>
        </div>
        <p class="text-[10px] font-mono uppercase tracking-wider text-gray-400 text-center mt-3 mb-0">
          Prototype — one scripted answer. Other questions return the same response.
        </p>
      </div>
    </div>
  `,
})
export default class ProtoAiComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  state = inject(ProtoStateService);

  question = signal('');
  draft = signal('');
  thinking = signal(false);
  thinkingLabel = signal('Reading your account…');
  visible = signal<AiBlock[]>([]);
  complete = signal(false);
  /** Never offer back the question just asked. */
  suggested = computed(() => SUGGESTED_QUESTIONS.filter((q) => q !== this.question()));

  private timers: any[] = [];

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) this.ask(q);
  }

  ngOnDestroy() {
    this.clear();
  }

  private clear() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  userInitial() {
    return (this.state.email() || 'p').charAt(0).toUpperCase();
  }

  submit() {
    const q = this.draft().trim();
    if (!q) return;
    this.draft.set('');
    this.ask(q);
  }

  ask(q: string) {
    this.clear();
    this.question.set(q);
    this.visible.set([]);
    this.complete.set(false);
    this.thinking.set(true);

    const labels = ['Reading your account…', 'Comparing creatives…', 'Checking frequency curves…'];
    labels.forEach((l, i) => {
      this.timers.push(setTimeout(() => this.thinkingLabel.set(l), i * 600));
    });

    // Every question resolves to the same scripted answer in the prototype.
    const blocks = AI_ANSWER['Why did ROAS drop?'];

    this.timers.push(
      setTimeout(() => {
        this.thinking.set(false);
        blocks.forEach((b, i) => {
          this.timers.push(
            setTimeout(() => {
              this.visible.update((v) => [...v, b]);
              if (i === blocks.length - 1) this.complete.set(true);
            }, i * 420)
          );
        });
      }, 1800)
    );
  }
}
