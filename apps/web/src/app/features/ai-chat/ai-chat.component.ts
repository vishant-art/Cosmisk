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
import { AuthService } from '../../core/services/auth.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { ToastService } from '../../core/services/toast.service';
import { environment } from '../../../environments/environment';
import { ChatStateService } from './chat-state.service';

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
                <div class="md-body" [innerHTML]="renderMd(m.content, sending() && $index === messages().length - 1)"></div>
              } @else {
                <span class="inline-flex gap-1 py-1">
                  <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                  <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                  <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms"></span>
                </span>
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
        <p class="text-[11px] text-gray-400 font-mono mt-1 mb-0 shrink-0 text-right">
          {{ lastModel() }} · {{ lastContextMode() }} context{{ lastCached() ? ' · cached' : '' }}
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
  private auth = inject(AuthService);
  private sanitizer = inject(DomSanitizer);
  private feedback = inject(FeedbackService);
  private toast = inject(ToastService);
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

  // Parsed-HTML memo for settled messages. The actively-streaming message must NOT be
  // cached: its content changes every token, so caching it would store every partial
  // prefix (O(n²) memory for one answer).
  private mdCache = new Map<string, SafeHtml>();

  /** Markdown -> sanitized HTML for assistant bubbles; memoized unless streaming. */
  renderMd(text: string, streaming = false): SafeHtml {
    if (streaming) return this.parseMd(text);
    let html = this.mdCache.get(text);
    if (!html) {
      html = this.parseMd(text);
      this.mdCache.set(text, html);
    }
    return html;
  }

  private parseMd(text: string): SafeHtml {
    const html = marked.parse(text ?? '', { async: false }) as string;
    return this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(html));
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

  async send(preset?: string): Promise<void> {
    const text = (preset ?? this.draft).trim();
    if (!text || this.sending()) return;

    const acc = this.adAccounts.currentAccount();
    this.demoMode.set(!acc);
    this.accountName.set(acc?.name ?? '');
    this.errorMsg.set('');

    // History = prior turns; then append the user turn + an empty assistant turn to stream into.
    const history = this.messages().map((m) => ({ role: m.role, content: m.content }));
    this.messages.set([...this.messages(), { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    const asstIndex = this.messages().length - 1;
    this.draft = '';
    this.sending.set(true);
    this.shouldScroll = true;

    const body: Record<string, unknown> = {
      message: text,
      history,
      context_mode: this.summaryMode() ? 'summary' : 'full',
      session_id: this.state.sessionId(),
    };
    if (acc) body['account_id'] = acc.id;
    else body['demo'] = true;

    try {
      const token = this.auth.getToken();
      const res = await fetch(`${environment.API_BASE_URL}/${environment.AI_LAYER_CHAT}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      // Session/meta headers arrive with the response head (before the body).
      const sid = res.headers.get('X-Session-Id');
      if (sid) this.state.sessionId.set(sid);
      const cm = res.headers.get('X-Context-Mode');
      if (cm) this.lastContextMode.set(cm);
      this.lastCached.set(res.headers.get('X-Cached') === 'true');
      const model = res.headers.get('X-Model');
      if (model) this.lastModel.set(model);

      if (res.status === 401) {
        // Raw fetch skips the HTTP interceptors — mirror errorInterceptor's 401 contract
        // here, or an expired session leaves the tab stuck on a generic error forever.
        this.messages.set(this.messages().slice(0, asstIndex));
        this.sending.set(false);
        this.toast.error('Session Expired', 'Please log in again.');
        this.auth.logout();
        return;
      }

      const contentType = res.headers.get('Content-Type') || '';
      if (!res.ok || !res.body || !contentType.startsWith('text/plain')) {
        // Degraded / not-connected -> a JSON body, not a stream.
        let msg = 'Something went wrong. Please try again.';
        try {
          const j = (await res.json()) as { meta_connected?: boolean; error?: string };
          if (j.meta_connected === false) msg = 'Connect a Meta ad account to chat about your data.';
          else if (j.error) msg = j.error;
        } catch {
          /* keep default */
        }
        this.messages.set(this.messages().slice(0, asstIndex)); // drop the empty placeholder
        this.errorMsg.set(msg);
        this.sending.set(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc2 = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc2 += decoder.decode(value, { stream: true });
        this.updateAssistant(asstIndex, acc2);
        this.shouldScroll = true;
      }
      if (!acc2) {
        // Empty stream — drop the placeholder and show a gentle note.
        this.messages.set(this.messages().slice(0, asstIndex));
        this.errorMsg.set('No response — please try again.');
      }
      this.sending.set(false);
    } catch {
      this.messages.set(this.messages().slice(0, asstIndex)); // drop placeholder
      this.errorMsg.set('The AI layer is unavailable right now. Please try again.');
      this.sending.set(false);
    }
  }

  private updateAssistant(index: number, content: string): void {
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
