import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ProtoStateService } from '../proto-state.service';
import { PROTO_KPI, PROTO_SIGNALS, PROTO_CREATIVES, CREATIVES_SHOWN_NOTE, Kpi } from '../proto-data';

type ViewState = 'ready' | 'loading' | 'empty' | 'error';

/**
 * PROTOTYPE — Blueprint §12.
 *
 * Cut from the shipped 12 sections to 5 zones:
 *   1. Brand bar   2. Intelligence   3. KPI strip   4. Creatives   5. AI entry
 *
 * Intelligence sits ABOVE the KPI strip on purpose. A dashboard leads with
 * metrics; an intelligence product leads with the conclusion.
 */
@Component({
  selector: 'proto-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <div class="px-5 md:px-8 py-7 max-w-[1180px] mx-auto">

      <!-- state switcher — prototype affordance only -->
      <div class="flex items-center gap-2 mb-6 flex-wrap">
        <span class="text-[10px] font-mono uppercase tracking-wider text-gray-400">Prototype — view state:</span>
        @for (s of states; track s) {
          <button (click)="view.set(s)"
            class="px-2.5 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider cursor-pointer border transition-colors"
            [class]="view() === s ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-border hover:border-gray-300'">
            {{ s }}
          </button>
        }
      </div>

      <!-- ── 1. BRAND BAR ─────────────────────────────────────────── -->
      <div class="flex items-start justify-between gap-4 mb-7 flex-wrap">
        <div>
          <h1 class="text-page-title font-display text-navy mb-1">
            {{ greeting() }}, {{ state.firstName() }}.
          </h1>
          <p class="text-body text-gray-500 m-0">
            {{ view() === 'ready' ? 'One thing needs you today.' : 'Here is your account.' }}
          </p>
        </div>
        <div class="flex items-center gap-2.5 pt-1.5">
          <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">
            {{ state.brand().category }}
          </span>
          <span class="w-1 h-1 rounded-full bg-gray-300"></span>
          <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">Last 30 days</span>
        </div>
      </div>

      <!-- ═══ LOADING ═══ -->
      @if (view() === 'loading') {
        <div class="space-y-4">
          <div class="skeleton h-[180px] rounded-card"></div>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            @for (i of [1,2,3,4]; track i) { <div class="skeleton h-[104px] rounded-card"></div> }
          </div>
          <div class="skeleton h-[220px] rounded-card"></div>
        </div>
      }

      <!-- ═══ ERROR ═══ -->
      @if (view() === 'error') {
        <div class="card !p-10 text-center">
          <div class="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <lucide-icon name="alert-circle" [size]="22" class="text-red-500"></lucide-icon>
          </div>
          <h2 class="text-card-title font-display text-navy mb-2">Cosmisk lost access to your ad account.</h2>
          <p class="text-sm text-gray-500 font-body mb-6 max-w-[420px] mx-auto">
            Meta returned an expired token. This usually means the password changed or the
            permission was revoked. Your history is safe — reconnecting restores it.
          </p>
          <button class="btn-primary !rounded-xl" routerLink="/proto/connect">Reconnect Meta</button>
        </div>
      }

      <!-- ═══ EMPTY ═══ -->
      @if (view() === 'empty') {
        <div class="card !p-10 text-center">
          <div class="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center mx-auto mb-4">
            <lucide-icon name="clipboard-list" [size]="22" class="text-accent"></lucide-icon>
          </div>
          <h2 class="text-card-title font-display text-navy mb-2">Not enough history yet.</h2>
          <p class="text-sm text-gray-500 font-body mb-1 max-w-[440px] mx-auto">
            Cosmisk needs about 14 days of spend before it can tell the difference between a real
            pattern and a noisy week.
          </p>
          <p class="text-sm text-gray-400 font-body mb-6 max-w-[440px] mx-auto">
            Your account has 3 days of spend. Cosmisk will start the moment there are 14.
          </p>
          <button class="btn-secondary !rounded-xl" routerLink="/proto/ask">Ask a question meanwhile</button>
        </div>
      }

      <!-- ═══ READY ═══ -->
      @if (view() === 'ready') {

        <!-- ── 2. INTELLIGENCE (above metrics, deliberately) ────────
             The two intelligence headings are set in navy with a rule;
             the two analytics headings below stay muted grey. Same type
             size throughout — the ranking is carried by weight and colour,
             not by making anything bigger. A reader scanning the page sees
             two dark headings and two quiet ones, in that order. -->
        <div class="mb-3 flex items-center gap-2.5">
          <span class="text-[11px] font-mono uppercase tracking-wider text-navy font-semibold">What needs your attention</span>
          <span class="h-px flex-1 bg-divider"></span>
        </div>

        <!-- lead signal — becomes a tracker once the user says they acted -->
        @if (!state.findingActioned()) {
          <div class="card !p-6 mb-4 border-l-[3px] !border-l-red-500">
            <div class="flex items-center gap-2 mb-3 flex-wrap">
              <span class="text-[11px] font-mono uppercase tracking-wider text-red-700
                bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">{{ lead.meta }}</span>
            </div>
            <h2 class="text-[21px] leading-[30px] font-display font-bold text-navy mb-2">{{ lead.title }}</h2>
            <p class="text-body text-gray-600 m-0 mb-5">{{ lead.body }}</p>
            <div class="flex flex-wrap gap-2.5">
              <button routerLink="/proto/aha" class="btn-primary !rounded-xl !py-2.5 !text-sm">
                See the evidence <lucide-icon name="arrow-right" [size]="15"></lucide-icon>
              </button>
              <button (click)="askAbout()" class="btn-secondary !rounded-xl !py-2.5 !text-sm">
                <lucide-icon name="message-square" [size]="14"></lucide-icon> Ask about this
              </button>
            </div>
          </div>
        } @else {
          <div class="card !p-6 mb-4 border-l-[3px] !border-l-emerald-500">
            <div class="flex items-center gap-2 mb-3 flex-wrap">
              <span class="text-[11px] font-mono uppercase tracking-wider text-emerald-700
                bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Tracking · day 0 of 7</span>
            </div>
            <h2 class="text-[21px] leading-[30px] font-display font-bold text-navy mb-2">
              You capped Summer Sale. Cosmisk is watching what happens.
            </h2>
            <p class="text-body text-gray-600 m-0 mb-5">
              Your action is recorded and the baseline is locked. Cosmisk has not learned anything
              yet — it will compare the next 7 days against ₹3.5L / 1.8 ROAS and tell you whether
              the call was right, including if it was wrong.
            </p>
            <div class="rounded-xl border border-divider bg-[#FBFBFC] px-5 py-4">
              <p class="text-[11px] font-mono uppercase tracking-wider text-gray-400 m-0 mb-1.5">Where this is in the loop</p>
              <p class="text-sm text-navy font-body m-0">
                Recorded <span class="text-gray-300 mx-0.5">→</span>
                baseline locked <span class="text-gray-300 mx-0.5">→</span>
                <span class="text-gray-400">observing (first read in 3 days)</span>
                <span class="text-gray-300 mx-0.5">→</span>
                <span class="text-gray-400">verdict on day 7</span>
                <span class="text-gray-300 mx-0.5">→</span>
                <span class="text-gray-400">Cosmisk adjusts</span>
              </p>
            </div>
          </div>
        }

        <!-- secondary signals -->
        <div class="mb-3 flex items-center gap-2.5">
          <span class="text-[11px] font-mono uppercase tracking-wider text-navy font-semibold">Other important findings</span>
          <span class="h-px flex-1 bg-divider"></span>
        </div>
        <div class="grid md:grid-cols-2 gap-4 mb-9">
          @for (s of secondary; track s.title) {
            <div class="card !p-5">
              <div class="flex items-center gap-2 mb-2.5">
                <span class="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border"
                  [class]="s.kind === 'opportunity'
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-blue-700 bg-blue-50 border-blue-200'">{{ s.meta }}</span>
              </div>
              <h3 class="text-[15px] leading-[23px] font-body font-semibold text-navy mb-1.5">{{ s.title }}</h3>
              <p class="text-sm text-gray-500 font-body m-0 leading-relaxed">{{ s.body }}</p>
            </div>
          }
        </div>

        <!-- ── 3. KPI STRIP ─────────────────────────────────────────
             Below the findings, and labelled as reference rather than as
             the point of the page. -->
        <div class="mb-3 flex items-baseline gap-2">
          <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">Account numbers</span>
          <span class="text-[11px] text-gray-400 font-body">— for reference, not a finding</span>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          @for (k of kpis; track k.label) {
            <div class="card !p-5">
              <p class="text-[11px] font-mono uppercase tracking-wider text-gray-400 m-0 mb-2">{{ k.label }}</p>
              <p class="text-metric-sm font-display text-navy m-0">{{ k.value }}</p>
              <div class="flex items-center gap-1.5 mt-1.5">
                <lucide-icon [name]="k.dir === 'up' ? 'trending-up' : 'trending-down'" [size]="13"
                  [class]="tone(k)"></lucide-icon>
                <span class="text-xs font-mono" [class]="tone(k)">{{ k.change }}</span>
                <span class="text-xs text-gray-400 font-body">{{ k.sub }}</span>
              </div>
            </div>
          }
        </div>

        <!-- ── 4. CREATIVES ───────────────────────────────────────── -->
        <div class="mb-3 flex items-center justify-between">
          <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">Creative performance</span>
          <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">{{ creativesNote }}</span>
        </div>
        <div class="card !p-0 overflow-hidden mb-8">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse min-w-[620px]">
              <thead>
                <tr class="bg-[#FBFBFC] border-b border-divider">
                  <th class="text-left px-5 py-3 text-[11px] font-mono uppercase tracking-wider text-gray-400 font-normal">Creative</th>
                  <th class="text-right px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-gray-400 font-normal">Spend</th>
                  <th class="text-right px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-gray-400 font-normal">ROAS</th>
                  <th class="text-right px-4 py-3 text-[11px] font-mono uppercase tracking-wider text-gray-400 font-normal">Freq</th>
                  <th class="text-right px-5 py-3 text-[11px] font-mono uppercase tracking-wider text-gray-400 font-normal">7d</th>
                </tr>
              </thead>
              <tbody>
                @for (c of creatives; track c.id) {
                  <tr class="border-b border-divider last:border-0 hover:bg-[#FBFBFC] transition-colors">
                    <td class="px-5 py-3.5">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                          [style.background]="c.thumbBg">
                          <lucide-icon [name]="c.format === 'video' ? 'play' : c.format === 'carousel' ? 'layers' : 'image'"
                            [size]="13" [style.color]="c.thumbText"></lucide-icon>
                        </div>
                        <div class="min-w-0">
                          <p class="text-sm font-body font-medium text-navy m-0 truncate">{{ c.name }}</p>
                          <p class="text-[11px] text-gray-400 font-mono m-0">{{ c.daysActive }}d live · {{ c.hook }}</p>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3.5 text-right text-sm font-mono text-navy">{{ inr(c.spend) }}</td>
                    <td class="px-4 py-3.5 text-right">
                      <span class="text-sm font-mono font-semibold"
                        [class]="c.roas >= 4 ? 'text-emerald-600' : c.roas < 2.5 ? 'text-red-600' : 'text-navy'">
                        {{ c.roas }}
                      </span>
                    </td>
                    <td class="px-4 py-3.5 text-right">
                      <span class="text-sm font-mono" [class]="c.frequency >= 5 ? 'text-red-600' : 'text-gray-500'">
                        {{ c.frequency }}
                      </span>
                    </td>
                    <td class="px-5 py-3.5 text-right">
                      <span class="text-xs font-mono" [class]="c.changePct >= 0 ? 'text-emerald-600' : 'text-red-500'">
                        {{ c.changePct > 0 ? '+' : '' }}{{ c.changePct }}%
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── 5. AI ENTRY ────────────────────────────────────────── -->
        <div class="rounded-card border border-accent/20 bg-accent-light/40 p-6">
          <div class="flex items-center gap-2 mb-3">
            <lucide-icon name="message-square" [size]="15" class="text-accent"></lucide-icon>
            <span class="text-[11px] font-mono uppercase tracking-wider text-accent">Ask Cosmisk</span>
          </div>
          <p class="text-body text-navy m-0 mb-4">
            It has your brand, your creatives and 42 days of history loaded. Ask it something specific.
          </p>
          <div class="flex flex-wrap gap-2">
            @for (q of quickQuestions; track q) {
              <button (click)="askQ(q)"
                class="px-3.5 py-2 rounded-full bg-white border border-border text-sm font-body
                text-navy cursor-pointer hover:border-accent hover:text-accent transition-colors">
                {{ q }}
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export default class ProtoDashboardComponent {
  private router = inject(Router);
  state = inject(ProtoStateService);

  states: ViewState[] = ['ready', 'loading', 'empty', 'error'];
  view = signal<ViewState>('ready');

  lead = PROTO_SIGNALS[0];
  secondary = PROTO_SIGNALS.slice(1);
  creatives = PROTO_CREATIVES;

  kpis = PROTO_KPI;
  creativesNote = CREATIVES_SHOWN_NOTE;

  quickQuestions = [
    'Why did ROAS drop?',
    'Which creative should I scale?',
    'What is working right now?',
  ];

  greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  /**
   * Whether a movement is good is a property of the metric, not of its direction —
   * spend rising is neither good nor bad until you know what it bought. So the
   * data carries the judgement and the view only renders it.
   */
  tone(k: Kpi) {
    return k.good === null ? 'text-gray-400' : k.good ? 'text-emerald-600' : 'text-red-500';
  }

  inr(n: number) {
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(0) + 'K';
    return '₹' + n;
  }

  askAbout() {
    this.askQ('Why did ROAS drop?');
  }
  askQ(q: string) {
    this.router.navigate(['/proto/ask'], { queryParams: { q } });
  }
}
