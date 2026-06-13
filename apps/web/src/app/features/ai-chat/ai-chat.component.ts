import { Component, signal, inject, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { environment } from '../../../environments/environment';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  success: boolean;
  answer?: string;
  model?: string;
  costUsd?: number;
  demo?: boolean;
  meta_connected?: boolean;
  error?: string;
  sessionId?: string;
  contextMode?: string;
  cached?: boolean;
}

/**
 * AI Chat — talks to the Python ai-layer RAG (`POST /api/ai-layer/chat`), grounded in
 * the selected account's data. When no Meta account is connected it falls back to the
 * shared dev/testing creds ("continue without Meta login", badged "Demo data"), so the
 * chat is usable without logging in. Degrades to an inline error if the layer is off.
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
          <!-- Refresh: pull fresh live data into the cache and rebuild the snapshot for
               the next message. Otherwise the cached data is reused. -->
          <button
            type="button"
            (click)="refresh()"
            [disabled]="refreshing() || sending()"
            title="Refresh with live data (otherwise cached data is used)"
            class="text-xs font-medium px-3 py-1.5 rounded-pill border border-gray-200 text-gray-600 hover:border-accent hover:text-accent transition-colors disabled:opacity-50 flex items-center gap-1.5">
            <lucide-icon name="refresh-cw" [size]="14" [class.animate-spin]="refreshing()"></lucide-icon>
            {{ refreshing() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <!-- Summary mode toggle: OFF = full data (default, as before); ON = lean
               aggregates-only context (cheaper + faster). -->
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
            {{ summaryMode() ? 'Summary mode: ON' : 'Summary mode: OFF' }}
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
          <div class="flex" [class.justify-end]="m.role === 'user'">
            <div
              class="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm font-body whitespace-pre-wrap leading-relaxed"
              [ngClass]="m.role === 'user'
                ? 'bg-accent text-white rounded-br-sm'
                : 'bg-gray-100 text-navy rounded-bl-sm'">
              {{ m.content }}
            </div>
          </div>
        }
        @if (sending()) {
          <div class="flex">
            <div class="bg-gray-100 text-gray-400 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm font-body">
              <span class="inline-flex gap-1">
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms"></span>
              </span>
            </div>
          </div>
        }
        @if (errorMsg()) {
          <div class="flex">
            <div class="bg-red-50 text-red-600 border border-red-100 rounded-xl px-4 py-2.5 text-sm font-body">
              {{ errorMsg() }}
            </div>
          </div>
        }
      </div>

      <!-- Footer / cost -->
      @if (lastModel()) {
        <p class="text-[11px] text-gray-400 font-mono mt-1 mb-0 shrink-0 text-right">
          {{ lastModel() }} · {{ lastContextMode() }} context{{ lastCached() ? ' · cached' : '' }}
          · session cost ~\${{ sessionCost().toFixed(4) }}
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
})
export default class AiChatComponent implements AfterViewChecked {
  private api = inject(ApiService);
  private adAccounts = inject(AdAccountService);

  @ViewChild('scroll') private scrollEl?: ElementRef<HTMLDivElement>;

  messages = signal<ChatTurn[]>([]);
  draft = '';
  sending = signal(false);
  errorMsg = signal('');
  lastModel = signal('');
  sessionCost = signal(0);

  // Summary mode is OFF by default (full data, as before); the header button toggles it.
  summaryMode = signal(false);
  lastContextMode = signal('full');
  lastCached = signal(false);
  refreshing = signal(false);
  // Stable per-chat session id so the ai-layer reuses its cached snapshot across turns.
  private sessionId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '';

  // No connected account => demo mode (continue without Meta login).
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

  toggleSummary(): void {
    this.summaryMode.update((v) => !v);
  }

  /**
   * Pull fresh live Meta data into the store cache, then start a new session so the
   * next message rebuilds its snapshot from the just-refreshed data. Until pressed,
   * the cached snapshot is reused across turns.
   */
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
          // New session id => the next turn rebuilds context from the fresh store.
          this.sessionId =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '';
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
        error: () => {
          this.refreshing.set(false);
          this.errorMsg.set('Could not refresh live data. Please try again.');
        },
      });
  }

  send(preset?: string): void {
    const text = (preset ?? this.draft).trim();
    if (!text || this.sending()) return;

    const acc = this.adAccounts.currentAccount();
    const demo = !acc;
    this.demoMode.set(demo);
    this.accountName.set(acc?.name ?? '');
    this.errorMsg.set('');

    // History = prior turns (before this message); send the new message separately.
    const history = this.messages();
    this.messages.set([...history, { role: 'user', content: text }]);
    this.draft = '';
    this.sending.set(true);
    this.shouldScroll = true;

    const body: Record<string, unknown> = {
      message: text,
      history,
      context_mode: this.summaryMode() ? 'summary' : 'full',
    };
    if (this.sessionId) body['session_id'] = this.sessionId;
    if (acc) body['account_id'] = acc.id;
    else body['demo'] = true;

    this.api.post<ChatResponse>(environment.AI_LAYER_CHAT, body).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.shouldScroll = true;
        if (res?.meta_connected === false) {
          this.errorMsg.set('Connect a Meta ad account to chat about your data.');
          return;
        }
        if (!res?.success) {
          this.errorMsg.set(res?.error || 'Something went wrong. Please try again.');
          return;
        }
        this.messages.update((m) => [...m, { role: 'assistant', content: res.answer ?? '' }]);
        if (res.model) this.lastModel.set(res.model);
        if (res.sessionId) this.sessionId = res.sessionId; // keep the cache warm
        if (res.contextMode) this.lastContextMode.set(res.contextMode);
        this.lastCached.set(!!res.cached);
        if (typeof res.costUsd === 'number') this.sessionCost.update((c) => c + res.costUsd!);
      },
      error: () => {
        this.sending.set(false);
        this.errorMsg.set('The AI layer is unavailable right now. Please try again.');
      },
    });
  }
}
