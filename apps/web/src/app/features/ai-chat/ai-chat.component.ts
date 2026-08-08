import {
  Component,
  signal,
  inject,
  ElementRef,
  ViewChild,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LucideAngularModule } from 'lucide-angular';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { environment } from '../../../environments/environment';
import { ChatStateService } from './chat-state.service';

interface ChatApiResponse {
  success: boolean;
  answer?: string;
  model?: string;
  costUsd?: number;
  sessionId?: string;
  contextMode?: string;
  cached?: boolean;
  toolsUsed?: string[];
  demo?: boolean;
  meta_connected?: boolean;
  error?: string;
}

/**
 * AI Chat — streams from the Python ai-layer RAG (`POST /api/ai-layer/chat/stream`),
 * grounded in the selected account's data. Responses stream token-by-token and render
 * as sanitized Markdown (bold/bullets). Conversation state lives in ChatStateService so
 * it survives tab switches + reloads. Demo-aware ("continue without Meta login").
 */
@Component({
  selector: 'app-ai-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      <!-- Header -->
      <div class="flex items-center gap-2 mb-3 shrink-0">
        <lucide-icon name="brain-circuit" [size]="22" class="text-accent"></lucide-icon>
        <h1 class="text-page-title font-display text-navy m-0">AI Chat</h1>
        @if (demoMode()) {
          <span class="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            Demo data
          </span>
        } @else if (accountName()) {
          <span class="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {{ accountName() }}
          </span>
        }
        <div class="ml-auto flex items-center gap-2">
          <button
            type="button"
            (click)="clearChat()"
            [disabled]="sending()"
            title="Clear the conversation"
            class="text-xs font-medium px-2.5 py-1.5 rounded-pill border border-gray-200 text-gray-500 hover:border-accent hover:text-accent transition-colors disabled:opacity-50 flex items-center gap-1.5">
            <lucide-icon name="trash-2" [size]="13"></lucide-icon>
            Clear
          </button>
          <button
            type="button"
            (click)="refresh()"
            [disabled]="refreshing() || sending()"
            title="Refresh with live data (otherwise cached data is used)"
            class="text-xs font-medium px-3 py-1.5 rounded-pill border border-gray-200 text-gray-600 hover:border-accent hover:text-accent transition-colors disabled:opacity-50 flex items-center gap-1.5">
            <lucide-icon name="refresh-cw" [size]="14" [class.animate-spin]="refreshing()"></lucide-icon>
            {{ refreshing() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button
            type="button"
            (click)="toggleSummary()"
            [attr.aria-pressed]="summaryMode()"
            [title]="summaryMode()
              ? 'Summary mode ON — lean aggregates context (cheaper, faster)'
              : 'Full data mode (default) — every row sent. Click for summary mode.'"
            class="text-xs font-medium px-3 py-1.5 rounded-pill border transition-colors flex items-center gap-1.5"
            [ngClass]="summaryMode()
              ? 'border-accent bg-accent text-white'
              : 'border-gray-200 text-gray-600 hover:border-accent hover:text-accent'">
            <lucide-icon [name]="summaryMode() ? 'zap' : 'layers'" [size]="14"></lucide-icon>
            {{ summaryMode() ? 'Summary: ON' : 'Summary: OFF' }}
          </button>
        </div>
      </div>
      <p class="text-sm text-gray-500 font-body mt-0 mb-3 shrink-0">
        Ask about your spend, ROAS, campaigns and trends. Answers are grounded in the last 30 days of data.
        @if (demoMode()) { <span class="text-amber-600">You are not connected to Meta — using sample data.</span> }
      </p>

      <!-- Messages -->
      <div #scroll class="flex-1 overflow-y-auto rounded-card bg-white shadow-card p-4 space-y-4">
        @if (messages().length === 0) {
          <div class="h-full flex flex-col items-center justify-center text-center text-gray-400">
            <lucide-icon name="message-circle" [size]="40" class="mb-3 opacity-30"></lucide-icon>
            <p class="text-sm font-body mb-3">Try one of these:</p>
            <div class="flex flex-wrap gap-2 justify-center max-w-md">
              @for (s of suggestions; track s) {
                <button
                  type="button"
                  (click)="send(s)"
                  class="text-xs px-3 py-1.5 rounded-pill border border-gray-200 text-gray-600 hover:border-accent hover:text-accent transition-colors">
                  {{ s }}
                </button>
              }
            </div>
          </div>
        }
        @for (m of messages(); track $index) {
          <div class="flex flex-col" [class.items-end]="m.role === 'user'">
            <div
              class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm font-body leading-relaxed"
              [ngClass]="m.role === 'user'
                ? 'bg-accent text-white rounded-br-sm whitespace-pre-wrap'
                : 'bg-gray-100 text-navy rounded-bl-sm'">
              @if (m.role === 'user') {
                {{ m.content }}
              } @else if (m.content) {
                <div class="md-body" [innerHTML]="renderMd(m.content)"></div>
              } @else {
                <!-- Waiting state. The answer arrives whole (no stream), so this can sit for
                     30s+ on a cold ad-level pull; three bouncing dots read as "back in a
                     second" and would be a lie. One accent sweep + copy that names the wait. -->
                <div class="w-56 max-w-full py-0.5" role="status" aria-live="polite">
                  <div class="thinking-track" aria-hidden="true"><span class="thinking-sweep"></span></div>
                  <p class="mt-2 mb-0 text-xs font-body text-gray-600">{{ WAIT_COPY[waitPhase()] }}</p>
                </div>
              }
            </div>
            @if (m.role === 'assistant' && m.content) {
              <div class="flex gap-2 mt-1 ml-1 text-gray-400">
                <button type="button" (click)="rateChat($index, 1)" [disabled]="!!rated()[$index]"
                        [class.text-green-600]="rated()[$index] === 1" class="hover:text-green-600 disabled:opacity-100"
                        aria-label="Helpful">
                  <lucide-icon name="thumbs-up" [size]="14"></lucide-icon>
                </button>
                <button type="button" (click)="rateChat($index, -1)" [disabled]="!!rated()[$index]"
                        [class.text-red-500]="rated()[$index] === -1" class="hover:text-red-500 disabled:opacity-100"
                        aria-label="Not helpful">
                  <lucide-icon name="thumbs-down" [size]="14"></lucide-icon>
                </button>
              </div>
            }
          </div>
        }
        @if (answerCount() >= 3 && !commentDismissed() && !commentSent()) {
          <div class="rounded-xl border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500 m-0 mb-2">How's this chat going? (optional — helps us improve)</p>
            <textarea [(ngModel)]="commentText" name="sessionComment" rows="2"
              placeholder="Anything working well or missing?"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none"></textarea>
            <div class="flex gap-2 justify-end mt-2">
              <button type="button" (click)="commentDismissed.set(true)" class="text-xs text-gray-400 hover:text-gray-600 px-2">Dismiss</button>
              <button type="button" (click)="sendSessionComment()" class="text-xs bg-accent text-white rounded-pill px-3 py-1.5 font-semibold">Send</button>
            </div>
          </div>
        }
        @if (commentSent()) {
          <p class="text-xs text-green-700 text-center m-0">Thanks — noted.</p>
        }
        @if (errorMsg()) {
          <div class="flex">
            <div class="bg-red-50 text-red-600 border border-red-100 rounded-xl px-4 py-2.5 text-sm font-body">
              {{ errorMsg() }}
            </div>
          </div>
        }
      </div>

      @if (lastModel()) {
        <p class="text-[11px] text-gray-500 font-mono mt-1 mb-0 shrink-0 text-right">
          @if (lastTools().length) {
            <span class="text-accent">checked {{ lastTools().join(', ') }}</span> ·
          }
          {{ lastContextMode() }} context{{ lastCached() ? ' · cached' : '' }}
          · session ~\${{ sessionCost().toFixed(4) }}
        </p>
      }

      <!-- Input -->
      <form (ngSubmit)="send()" class="flex gap-2 mt-3 shrink-0">
        <input
          [(ngModel)]="draft"
          name="draft"
          [disabled]="sending()"
          placeholder="Ask about your ad data..."
          autocomplete="off"
          class="flex-1 px-4 py-2.5 border border-gray-200 rounded-pill text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none disabled:opacity-50" />
        <button
          type="submit"
          [disabled]="sending() || !draft.trim()"
          class="px-4 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 flex items-center gap-1.5">
          <lucide-icon name="send" [size]="16"></lucide-icon>
          Send
        </button>
      </form>
    </div>
  `,
  styles: [`
    .md-body :where(p) { margin: 0 0 0.5rem; }
    .md-body :where(p:last-child) { margin-bottom: 0; }
    .md-body :where(ul, ol) { margin: 0.25rem 0 0.5rem; padding-left: 1.1rem; }
    .md-body :where(li) { margin: 0.15rem 0; }
    .md-body :where(ul) { list-style: disc; }
    .md-body :where(ol) { list-style: decimal; }
    .md-body :where(strong) { font-weight: 600; }
    .md-body :where(h1, h2, h3, h4) { font-weight: 600; margin: 0.5rem 0 0.25rem; font-size: 0.95rem; }
    .md-body :where(code) { background: rgba(0,0,0,0.06); padding: 0.05rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
    .md-body :where(a) { color: var(--accent); text-decoration: underline; }
    /* Waiting state: one 2px accent sweep. Indeterminate on purpose — we have no real
       progress to report, and a percentage bar would be inventing one. */
    .thinking-track {
      height: 2px; border-radius: 2px; overflow: hidden;
      background: rgba(0,0,0,0.06);
    }
    .thinking-sweep {
      display: block; height: 100%; width: 40%; border-radius: 2px;
      background: linear-gradient(90deg, transparent, var(--accent, #6366F1), transparent);
      animation: thinking-sweep 1.6s ease-in-out infinite;
    }
    @keyframes thinking-sweep {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
    /* The global reduced-motion rule collapses animation-duration to ~0, which would
       freeze the sweep mid-track and read as "stuck". Show a calm full-width bar instead. */
    @media (prefers-reduced-motion: reduce) {
      .thinking-sweep { width: 100%; background: var(--accent, #6366F1); opacity: 0.45; }
    }

    /* The chat prompt tells the model to use tables; a wide one must scroll inside
       the 85%-width bubble, not blow it out. */
    .md-body :where(table) { border-collapse: collapse; margin: 0.5rem 0; width: 100%; font-size: 0.85rem; display: block; overflow-x: auto; }
    .md-body :where(th, td) { border: 1px solid rgba(0,0,0,0.1); padding: 0.3rem 0.5rem; text-align: left; }
    .md-body :where(th) { background: rgba(0,0,0,0.04); font-weight: 600; }
    /* Money & ROAS: mono, tabular — scannable 0.62 vs 3.00 */
    .md-body :where(code) { font-variant-numeric: tabular-nums; }
    .md-body :where(td) { font-variant-numeric: tabular-nums; }
    /* First bold line reads as the takeaway when the model leads with it */
    .md-body :where(p:first-child strong:only-child) {
      display: block; border-left: 3px solid var(--accent, #6366F1); padding-left: 0.6rem;
      margin-bottom: 0.6rem; font-size: 1rem;
    }
  `],
})
export default class AiChatComponent implements AfterViewChecked {
  private api = inject(ApiService);
  private adAccounts = inject(AdAccountService);
  private sanitizer = inject(DomSanitizer);
  private feedback = inject(FeedbackService);
  state = inject(ChatStateService);

  // Per-answer thumbs (keyed by message index) + once-per-session comment box.
  rated = signal<Record<number, -1 | 1>>({});
  commentDismissed = signal(false);
  commentSent = signal(false);
  commentText = '';

  @ViewChild('scroll') private scrollEl?: ElementRef<HTMLDivElement>;

  // Conversation state lives in the service (persists across tab switches).
  messages = this.state.messages;
  summaryMode = this.state.summaryMode;
  lastModel = this.state.lastModel;
  lastContextMode = this.state.lastContextMode;
  lastCached = this.state.lastCached;

  // Transient per-view UI state.
  draft = '';
  sending = signal(false);
  refreshing = signal(false);
  errorMsg = signal('');
  sessionCost = signal(0);
  lastTools = signal<string[]>([]);
  /** 0 = just sent · 1 = past ~7s (likely an ad-level pull) · 2 = past ~25s. */
  waitPhase = signal(0);

  // Elapsed-time copy. Honest about duration without inventing steps we cannot observe.
  readonly WAIT_COPY = [
    'Reading your account data',
    'Pulling ad-level data — the first pull can take a minute',
    'Still working — deeper questions take longer',
  ];
  demoMode = signal(!this.adAccounts.currentAccount());
  accountName = signal(this.adAccounts.currentAccount()?.name ?? '');

  suggestions = [
    'How did spend and ROAS trend this month?',
    'Which campaign is my best performer and why?',
    'Where am I wasting budget?',
  ];

  private shouldScroll = false;

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.scrollEl) {
      this.scrollEl.nativeElement.scrollTop = this.scrollEl.nativeElement.scrollHeight;
      this.shouldScroll = false;
    }
  }

  // Parsed-HTML memo. This is a template binding under default change detection, so it is
  // called on every tick for every message; returning the SAME SafeHtml reference is what
  // stops Angular re-setting innerHTML (which wipes the user's text selection).
  // Answers now arrive whole, so there is no partial-prefix case to exclude.
  private mdCache = new Map<string, SafeHtml>();

  /** Markdown -> sanitized HTML for assistant bubbles, memoized by content. */
  renderMd(text: string): SafeHtml {
    let html = this.mdCache.get(text);
    if (!html) {
      html = this.sanitizer.bypassSecurityTrustHtml(
        DOMPurify.sanitize(marked.parse(text ?? '', { async: false }) as string),
      );
      this.mdCache.set(text, html);
    }
    return html;
  }

  /** Thumbs on an assistant answer. refId = `${sessionId}:${index}`; pairs the Q&A for study. */
  rateChat(index: number, rating: -1 | 1): void {
    if (this.rated()[index]) return;
    const msgs = this.messages();
    const prompt = index > 0 ? msgs[index - 1]?.content : '';
    this.feedback.rate('chat', `${this.state.sessionId()}:${index}`, rating,
      { prompt_text: prompt, response_text: msgs[index]?.content }).subscribe({ error: () => {} });
    this.rated.update((r) => ({ ...r, [index]: rating }));
  }

  /** Number of completed assistant answers this session. */
  answerCount(): number {
    return this.messages().filter((m) => m.role === 'assistant' && m.content).length;
  }

  sendSessionComment(): void {
    const comment = this.commentText.trim();
    if (!comment) { this.commentDismissed.set(true); return; }
    this.feedback.rate('chat', this.state.sessionId(), 0, { comment }).subscribe({ error: () => {} });
    this.commentSent.set(true);
  }

  toggleSummary(): void {
    this.summaryMode.update((v) => !v);
  }

  clearChat(): void {
    if (this.sending()) return;
    this.state.clear();
    this.mdCache.clear();
    this.errorMsg.set('');
  }

  send(preset?: string): void {
    const text = (preset ?? this.draft).trim();
    if (!text || this.sending()) return;

    const acc = this.adAccounts.currentAccount();
    this.demoMode.set(!acc);
    this.accountName.set(acc?.name ?? '');
    this.errorMsg.set('');

    // History = prior turns; then the user turn + an empty assistant turn as the placeholder
    // the waiting state renders into (replaced wholesale when the answer lands).
    const history = this.messages().map((m) => ({ role: m.role, content: m.content }));
    this.messages.set([...this.messages(), { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    const asstIndex = this.messages().length - 1;
    this.draft = '';
    this.sending.set(true);
    this.shouldScroll = true;
    this.startWaitCopy();

    const body: Record<string, unknown> = {
      message: text,
      history,
      context_mode: this.summaryMode() ? 'summary' : 'full',
      session_id: this.state.sessionId(),
    };
    if (acc) body['account_id'] = acc.id;
    else body['demo'] = true;

    // api.post (HttpClient), NOT raw fetch: the non-streaming endpoint is the only one that
    // runs the ad-level tool loop, and going back through HttpClient means authInterceptor
    // and errorInterceptor apply again — 401 logs out, 429 toasts the rate limit.
    this.api.post<ChatApiResponse>(environment.AI_LAYER_CHAT, body).subscribe({
      next: (res) => {
        this.stopWaitCopy();
        this.sending.set(false);
        this.shouldScroll = true;
        const drop = () => this.messages.set(this.messages().slice(0, asstIndex));

        if (res?.meta_connected === false) {
          drop();
          this.errorMsg.set('Connect a Meta ad account to chat about your data.');
          return;
        }
        if (!res?.success || !res.answer) {
          drop();
          this.errorMsg.set(res?.error || 'No response — please try again.');
          return;
        }
        this.setAssistant(asstIndex, res.answer);
        if (res.sessionId) this.state.sessionId.set(res.sessionId);
        if (res.model) this.lastModel.set(res.model);
        if (res.contextMode) this.lastContextMode.set(res.contextMode);
        this.lastCached.set(!!res.cached);
        this.lastTools.set(res.toolsUsed ?? []);
        if (typeof res.costUsd === 'number') this.sessionCost.update((c) => c + res.costUsd!);
      },
      error: (e: { error?: { error?: string } }) => {
        // errorInterceptor already toasted (and logged out on 401); surface the server's
        // copy inline so the honest 429 rate-limit text reaches the reader.
        this.stopWaitCopy();
        this.messages.set(this.messages().slice(0, asstIndex));
        this.errorMsg.set(e?.error?.error || 'The AI layer is unavailable right now. Please try again.');
        this.sending.set(false);
      },
    });
  }

  // --- waiting copy -----------------------------------------------------------------
  // No progress stream exists (run_tool_loop's callback never crosses HTTP), so the copy
  // is driven by ELAPSED TIME, not invented steps. Two timeouts rather than a 1s interval:
  // a per-second tick would run change detection for the whole minute for no benefit.
  private waitTimers: ReturnType<typeof setTimeout>[] = [];

  private startWaitCopy(): void {
    this.stopWaitCopy();
    this.waitPhase.set(0);
    this.waitTimers.push(setTimeout(() => this.waitPhase.set(1), 7000));
    this.waitTimers.push(setTimeout(() => this.waitPhase.set(2), 25000));
  }

  private stopWaitCopy(): void {
    this.waitTimers.forEach(clearTimeout);
    this.waitTimers = [];
    this.waitPhase.set(0);
  }

  private setAssistant(index: number, content: string): void {
    this.messages.update((arr) => {
      if (!arr[index]) return arr;
      const copy = [...arr];
      copy[index] = { role: 'assistant', content };
      return copy;
    });
  }

  refresh(): void {
    if (this.refreshing() || this.sending()) return;
    const acc = this.adAccounts.currentAccount();
    const body: Record<string, unknown> = acc ? { account_id: acc.id } : { demo: true };
    this.refreshing.set(true);
    this.errorMsg.set('');
    this.api
      .post<{ success: boolean; rowsUpserted?: number; until?: string; error?: string }>(
        environment.AI_LAYER_REFRESH,
        body,
      )
      .subscribe({
        next: (res) => {
          this.refreshing.set(false);
          if (!res?.success) {
            this.errorMsg.set(res?.error || 'Could not refresh live data. Please try again.');
            return;
          }
          this.state.resetSession(); // next turn rebuilds context from the fresh store
          this.shouldScroll = true;
          const through = res.until ? ` through ${res.until}` : '';
          this.messages.update((m) => [
            ...m,
            {
              role: 'assistant',
              content: `↻ Refreshed with live data${through}${
                res.rowsUpserted ? ` (${res.rowsUpserted} rows)` : ''
              }. Your next question uses the latest numbers.`,
            },
          ]);
        },
        error: (e: { error?: { error?: string } }) => {
          this.refreshing.set(false);
          // Surface the server's copy (e.g. the honest 429 rate-limit message) when present.
          this.errorMsg.set(e?.error?.error || 'Could not refresh live data. Please try again.');
        },
      });
  }
}
