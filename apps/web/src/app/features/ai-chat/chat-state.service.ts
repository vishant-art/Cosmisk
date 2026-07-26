import { Injectable, effect, signal } from '@angular/core';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Holds the AI Chat conversation at app scope (providedIn: 'root') so it survives
 * navigating away from and back to the chat tab — the component is destroyed on route
 * change, but this singleton (and its localStorage mirror) is not. Also restores the
 * conversation across reloads.
 */
@Injectable({ providedIn: 'root' })
export class ChatStateService {
  messages = signal<ChatTurn[]>([]);
  sessionId = signal<string>(this.newId());
  summaryMode = signal(false);
  lastModel = signal('');
  lastContextMode = signal('full');
  lastCached = signal(false);

  private static readonly KEY = 'cosmisk_ai_chat';

  constructor() {
    // Restore prior conversation (best-effort).
    try {
      const raw = localStorage.getItem(ChatStateService.KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<{
          messages: ChatTurn[];
          sessionId: string;
          summaryMode: boolean;
        }>;
        if (Array.isArray(s.messages)) this.messages.set(s.messages);
        if (s.sessionId) this.sessionId.set(s.sessionId);
        if (typeof s.summaryMode === 'boolean') this.summaryMode.set(s.summaryMode);
      }
    } catch {
      /* ignore corrupt/unavailable storage */
    }
    // Persist on change.
    effect(() => {
      const data = {
        messages: this.messages(),
        sessionId: this.sessionId(),
        summaryMode: this.summaryMode(),
      };
      try {
        localStorage.setItem(ChatStateService.KEY, JSON.stringify(data));
      } catch {
        /* storage full / unavailable */
      }
    });
  }

  private newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  }

  /** Start a fresh server-side context (e.g. after a data refresh). */
  resetSession(): void {
    this.sessionId.set(this.newId());
  }

  /** Clear the whole conversation. */
  clear(): void {
    this.messages.set([]);
    this.lastModel.set('');
    this.lastCached.set(false);
    this.resetSession();
  }
}
