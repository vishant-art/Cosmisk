const _BUILD_VER = '2026-03-28-v1';
import { Component, signal, inject, ElementRef, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AiService, AiBriefingResponse } from '../../core/services/ai.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { DateRangeService } from '../../core/services/date-range.service';
import { timeout, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  chart?: { type: string; data: { label: string; value: number }[] };
  table?: { headers: string[]; rows: string[][] };
  isBriefing?: boolean;
}

const SUGGESTED_QUESTIONS = [
  { text: 'How is my account doing?' },
  { text: 'Where is my budget going?' },
  { text: 'What audience segments convert best?' },
  { text: 'Which ads are performing best?' },
  { text: 'What\'s my CPA across campaigns?' },
  { text: 'Predict next week\'s performance' },
];


@Component({
  selector: 'app-ai-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="flex flex-col h-[calc(100vh-8rem)]">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 bg-gradient-to-br from-accent to-violet-500 rounded-full flex items-center justify-center shadow-lg shadow-accent/20">
          <lucide-icon name="sparkles" [size]="18" class="text-white"></lucide-icon>
        </div>
        <div class="flex-1">
          <h1 class="text-page-title font-display text-navy m-0">AI Studio</h1>
          <p class="text-xs text-gray-500 font-body m-0">
            {{ briefingLoaded() ? 'Your AI strategist is ready' : 'Ask anything about your ad performance' }}
          </p>
        </div>
        @if (messages().length > 0) {
          <button (click)="clearChat()"
            class="px-3 py-1.5 text-xs font-body font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5">
            <lucide-icon name="trash-2" [size]="14"></lucide-icon>
            New Chat
          </button>
        }
      </div>

      <!-- Chat area -->
      <div class="flex-1 overflow-y-auto bg-white rounded-card shadow-card p-4 space-y-4 mb-4" #chatContainer>
        <!-- Briefing loading shimmer -->
        @if (briefingLoading() && messages().length === 0) {
          <div class="animate-pulse space-y-4 py-8">
            <div class="flex gap-3">
              <div class="w-8 h-8 bg-gradient-to-br from-accent/30 to-violet-300/30 rounded-full shrink-0"></div>
              <div class="flex-1 space-y-3 max-w-[75%]">
                <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                <div class="h-4 bg-gray-200 rounded w-full"></div>
                <div class="h-4 bg-gray-200 rounded w-5/6"></div>
                <div class="h-4 bg-gray-100 rounded w-2/3"></div>
                <div class="h-4 bg-gray-100 rounded w-1/2"></div>
              </div>
            </div>
            <div class="flex gap-2 ml-11">
              <div class="h-8 bg-gray-100 rounded-full w-40"></div>
              <div class="h-8 bg-gray-100 rounded-full w-36"></div>
              <div class="h-8 bg-gray-100 rounded-full w-44"></div>
            </div>
          </div>
        }

        @if (!briefingLoading() && messages().length === 0 && !briefingLoaded()) {
          <!-- Fallback welcome screen (no briefing available) -->
          <div class="text-center py-12">
            <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-accent/10 to-violet-500/10 rounded-full flex items-center justify-center">
              <lucide-icon name="sparkles" [size]="24"></lucide-icon>
            </div>
            <h2 class="text-lg font-display text-navy mb-2">Ask Cosmisk AI</h2>
            <p class="text-sm text-gray-500 font-body mb-6 max-w-md mx-auto">
              I can analyze your ad performance, find patterns, predict trends, and give recommendations.
            </p>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl mx-auto">
              @for (q of suggestedQuestions; track q.text) {
                <button
                  (click)="askQuestion(q.text)"
                  class="text-left p-3 bg-gray-50 rounded-lg hover:bg-accent/5 hover:border-accent/30 border border-gray-100 transition-all group">
                  <span class="text-sm font-body text-gray-600 group-hover:text-accent">{{ q.text }}</span>
                </button>
              }
            </div>
          </div>
        }

        @if (messages().length > 0) {
          @for (msg of messages(); track msg.id) {
            <div class="flex gap-3" [ngClass]="msg.role === 'user' ? 'justify-end' : 'justify-start'">
              @if (msg.role === 'ai') {
                <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
                  [ngClass]="msg.isBriefing ? 'bg-gradient-to-br from-accent to-violet-500 shadow-lg shadow-accent/20' : 'bg-accent/10'">
                  <lucide-icon name="sparkles" [size]="14" [class]="msg.isBriefing ? 'text-white' : ''"></lucide-icon>
                </div>
              }
              <div [ngClass]="msg.role === 'user'
                ? 'max-w-[75%] rounded-xl p-3 bg-accent text-white'
                : msg.isBriefing
                  ? 'max-w-[85%] rounded-xl p-4 bg-gradient-to-br from-gray-50 to-violet-50/50 border border-accent/20 shadow-sm'
                  : 'max-w-[75%] rounded-xl p-3 bg-gray-50 text-gray-800'">

                @if (msg.isBriefing) {
                  <div class="flex items-center gap-2 mb-2 pb-2 border-b border-accent/10">
                    <span class="text-xs font-body font-semibold text-accent uppercase tracking-wide">Morning Briefing</span>
                    <span class="text-[10px] text-gray-400 font-body">{{ msg.timestamp | date:'mediumDate' }}</span>
                  </div>
                }

                <div class="text-sm font-body whitespace-pre-line" [ngClass]="msg.isBriefing ? 'text-gray-800' : ''" [innerHTML]="formatMessage(msg.content)"></div>

                @if (msg.chart) {
                  <div class="mt-3 bg-white rounded-lg p-3 border border-gray-100">
                    <div class="space-y-2">
                      @for (item of msg.chart.data; track item.label) {
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-body text-gray-600 w-36 truncate">{{ item.label }}</span>
                          <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div class="bg-accent/70 h-full rounded-full flex items-center justify-end px-2 transition-all"
                              [style.width.%]="(item.value / getMaxValue(msg.chart!.data)) * 100">
                              <span class="text-[10px] font-body font-bold text-white">{{ formatChartValue(item.value, msg.chart!.type) }}</span>
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }

                @if (msg.table) {
                  <div class="mt-3 bg-white rounded-lg border border-gray-100 overflow-hidden">
                    <table class="w-full text-xs font-body">
                      <thead>
                        <tr class="bg-gray-50">
                          @for (h of msg.table.headers; track h) {
                            <th class="px-3 py-2 text-left font-semibold text-gray-600">{{ h }}</th>
                          }
                        </tr>
                      </thead>
                      <tbody>
                        @for (row of msg.table.rows; track row[0]) {
                          <tr class="border-t border-gray-50">
                            @for (cell of row; track cell; let j = $index) {
                              <td class="px-3 py-2 text-gray-700" [ngClass]="j === 0 ? 'font-medium' : ''">{{ cell }}</td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }

                <span class="text-[10px] mt-1 block"
                  [ngClass]="msg.role === 'user' ? 'text-white/60' : 'text-gray-400'">
                  {{ msg.timestamp | date:'shortTime' }}
                </span>
              </div>
              @if (msg.role === 'user') {
                <div class="w-8 h-8 bg-navy rounded-full flex items-center justify-center shrink-0 mt-1">
                  <span class="text-xs text-white font-body font-bold">You</span>
                </div>
              }
            </div>
          }

          <!-- Context-aware suggestion pills after briefing -->
          @if (dynamicSuggestions().length > 0 && messages().length === 1 && messages()[0].isBriefing) {
            <div class="flex flex-wrap gap-2 ml-11 mt-2">
              @for (s of dynamicSuggestions(); track s) {
                <button (click)="askQuestion(s)"
                  class="px-3 py-1.5 text-xs font-body font-medium text-accent bg-accent/5 border border-accent/20 rounded-full hover:bg-accent/10 hover:border-accent/40 transition-all">
                  {{ s }}
                </button>
              }
            </div>
          }

          @if (typing()) {
            <div class="flex gap-3 justify-start">
              <div class="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center shrink-0">
                <lucide-icon name="sparkles" [size]="14"></lucide-icon>
              </div>
              <div class="bg-gray-50 rounded-xl p-3">
                <div class="flex gap-1">
                  <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                  <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                  <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                </div>
              </div>
            </div>
          }
        }
      </div>

      <!-- Input bar -->
      <div class="bg-white rounded-card shadow-card p-3 flex gap-3 items-end">
        <textarea
          [(ngModel)]="inputText"
          (keydown.enter)="onEnter($event)"
          rows="1"
          placeholder="Ask about your ad performance..."
          class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none resize-none max-h-24"></textarea>
        <button
          (click)="sendMessage()"
          [disabled]="!inputText.trim() || typing()"
          class="px-4 py-2 bg-accent text-white rounded-lg text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
          Send
        </button>
      </div>
    </div>
  `
})
export default class AiStudioComponent implements OnInit {
  @ViewChild('chatContainer') chatContainer!: ElementRef;
  private aiService = inject(AiService);
  private adAccountService = inject(AdAccountService);
  private dateRangeService = inject(DateRangeService);

  messages = signal<ChatMessage[]>(this.loadChatHistory());
  typing = signal(false);
  briefingLoading = signal(false);
  briefingLoaded = signal(false);
  dynamicSuggestions = signal<string[]>([]);
  inputText = '';
  suggestedQuestions = SUGGESTED_QUESTIONS;

  ngOnInit() {
    // Only load briefing if we don't have existing chat history
    if (this.messages().length === 0) {
      this.loadBriefing();
    } else {
      // Check if first message was a briefing to restore state
      const first = this.messages()[0];
      if (first?.isBriefing) {
        this.briefingLoaded.set(true);
      }
    }
  }

  private loadBriefing() {
    this.briefingLoading.set(true);
    this.aiService.getBriefing().pipe(
      timeout(10000),
      catchError(() => {
        this.briefingLoading.set(false);
        return throwError(() => new Error('Briefing unavailable'));
      }),
    ).subscribe({
      next: (response: AiBriefingResponse) => {
        this.briefingLoading.set(false);

        if (!response.briefing) return;

        this.briefingLoaded.set(true);

        // Format briefing as first AI message
        const briefingMsg: ChatMessage = {
          id: 'briefing-' + Date.now(),
          role: 'ai',
          content: response.briefing.content,
          timestamp: new Date(response.briefing.completedAt),
          isBriefing: true,
        };

        this.messages.set([briefingMsg]);
        this.saveChatHistory();

        // Set context-aware suggestions
        if (response.suggestions.length > 0) {
          this.dynamicSuggestions.set(response.suggestions);
        }

        this.scrollToBottom();
      },
    });
  }

  private loadChatHistory(): ChatMessage[] {
    try {
      const saved = sessionStorage.getItem('cosmisk_chat_history');
      if (!saved) return [];
      const parsed = JSON.parse(saved) as ChatMessage[];
      return parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
    } catch { return []; }
  }

  private saveChatHistory() {
    try {
      sessionStorage.setItem('cosmisk_chat_history', JSON.stringify(this.messages()));
    } catch { /* storage full — ignore */ }
  }

  askQuestion(text: string) {
    this.inputText = text;
    this.sendMessage();
  }

  onEnter(event: Event) {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) {
      ke.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage() {
    const text = this.inputText.trim();
    if (!text) return;

    // Clear dynamic suggestions once user starts chatting
    this.dynamicSuggestions.set([]);

    const userMsg: ChatMessage = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    this.messages.update(msgs => [...msgs, userMsg]);
    this.saveChatHistory();
    this.inputText = '';
    this.typing.set(true);
    this.scrollToBottom();

    const acc = this.adAccountService.currentAccount();
    const context = acc ? {
      account_id: acc.id,
      credential_group: acc.credential_group,
      date_preset: this.dateRangeService.datePreset(),
      currency: acc.currency || 'USD',
    } : undefined;

    // Send last few messages as conversation context for follow-ups
    const history = this.messages().slice(-6).map(m => ({
      role: m.role as 'user' | 'ai',
      content: m.content,
    }));

    this.aiService.chat(text, context, history).pipe(
      timeout(60000),
      catchError((err) => {
        const isTimeout = err?.name === 'TimeoutError';
        const errorContent = isTimeout
          ? 'The AI took too long to respond. Please try again with a simpler question.'
          : err?.error?.error || 'Could not connect to Cosmisk AI. Please check your connection and try again.';
        const aiMsg: ChatMessage = {
          id: 'msg-' + Date.now() + '-err',
          role: 'ai',
          content: errorContent,
          timestamp: new Date(),
        };
        this.messages.update(msgs => [...msgs, aiMsg]);
        this.saveChatHistory();
        this.typing.set(false);
        this.scrollToBottom();
        return throwError(() => err);
      }),
    ).subscribe({
      next: (response) => {
        const aiMsg: ChatMessage = {
          id: 'msg-' + Date.now() + '-ai',
          role: 'ai',
          content: response.content,
          timestamp: new Date(),
          chart: response.chart,
          table: response.table,
        };
        this.messages.update(msgs => [...msgs, aiMsg]);
        this.saveChatHistory();
        this.typing.set(false);
        this.scrollToBottom();
      },
    });
  }

  formatMessage(content: string): string {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^---$/gm, '<hr class="my-2 border-gray-200">')
      .replace(/_([^_]+)_/g, '<em>$1</em>');
  }

  clearChat() {
    this.messages.set([]);
    this.briefingLoaded.set(false);
    this.dynamicSuggestions.set([]);
    sessionStorage.removeItem('cosmisk_chat_history');
    this.loadBriefing();
  }

  formatChartValue(value: number, chartType: string): string {
    // For line charts (daily spend), show currency-style
    if (chartType === 'line') return value.toLocaleString();
    // For bar charts, check if values look like ROAS (typically < 20) or currency (typically > 20)
    if (value > 20) return value.toLocaleString();
    return `${value}x`;
  }

  getMaxValue(data: { label: string; value: number }[]): number {
    return Math.max(...data.map(d => d.value));
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.chatContainer) {
        const el = this.chatContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }
}
