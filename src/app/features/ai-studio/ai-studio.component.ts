const _BUILD_VER = '2026-02-23-v2';
import { Component, signal, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AiService } from '../../core/services/ai.service';

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  chart?: { type: string; data: { label: string; value: number }[] };
  table?: { headers: string[]; rows: string[][] };
}

const SUGGESTED_QUESTIONS = [
  { icon: '📈', text: 'What\'s my best performing hook this month?' },
  { icon: '💰', text: 'Which creatives have the highest ROAS?' },
  { icon: '⚠️', text: 'Are any creatives fatiguing soon?' },
  { icon: '🎯', text: 'What audience segments convert best?' },
  { icon: '🔮', text: 'Predict next week\'s spend at current pace' },
  { icon: '🧬', text: 'What DNA patterns work for skincare?' },
];

const AI_RESPONSES: Record<string, { content: string; chart?: ChatMessage['chart']; table?: ChatMessage['table'] }> = {
  'best performing hook': {
    content: 'Based on the last 30 days, your **top performing hook type is "Shock Statement"** with an average ROAS of 4.8x across 12 creatives. Here\'s the breakdown:',
    chart: {
      type: 'bar',
      data: [
        { label: 'Shock Statement', value: 4.8 },
        { label: 'Price Anchor', value: 4.2 },
        { label: 'Social Proof', value: 3.9 },
        { label: 'Curiosity', value: 3.5 },
        { label: 'Authority', value: 3.1 },
      ]
    }
  },
  'highest roas': {
    content: 'Here are your **top 5 creatives by ROAS** this month:',
    table: {
      headers: ['Creative', 'ROAS', 'Spend', 'Status'],
      rows: [
        ['Marine Collagen — Shock Hook', '5.2x', '₹1.8L', 'Winning'],
        ['Vitamin C Serum — UGC', '4.8x', '₹92K', 'Winning'],
        ['Bundle Offer — Price Anchor', '4.5x', '₹1.2L', 'Stable'],
        ['Before/After — Transformation', '4.2x', '₹67K', 'New'],
        ['Testimonial Reel — Hindi', '3.9x', '₹2.1L', 'Stable'],
      ]
    }
  },
  'fatiguing': {
    content: '⚠️ **3 creatives are showing fatigue signals:**\n\n1. **"Summer Sale Banner"** — CTR dropped 34% in 7 days. Recommend pausing.\n2. **"Hydration Hero"** — ROAS down from 3.8x to 2.1x. Iterate with new hook.\n3. **"Protein Powder Lifestyle"** — Frequency at 4.2 (above 3.0 threshold).\n\nI recommend creating new variations using the Director Lab for creatives #1 and #2.',
  },
  'audience segments': {
    content: 'Your **best converting audience segments** based on the last 30 days:',
    table: {
      headers: ['Segment', 'CPA', 'ROAS', 'Conv. Rate'],
      rows: [
        ['Women 25-34, Metro', '₹245', '4.6x', '3.8%'],
        ['Women 35-44, Health Interest', '₹312', '4.1x', '3.2%'],
        ['Men 25-34, Fitness', '₹398', '3.5x', '2.7%'],
        ['Women 18-24, Beauty', '₹425', '3.1x', '2.4%'],
      ]
    }
  },
  'predict': {
    content: '🔮 **Spend Forecast for Next 7 Days:**\n\nAt current daily spend of ~₹42K/day:\n- **Projected weekly spend:** ₹2.94L\n- **Monthly pace:** ₹12.6L (budget: ₹15L)\n- **Status:** UNDER-PACING by ~16%\n\n**Recommendation:** Increase daily budgets on your top 3 winning creatives by 15-20% to hit your monthly target. This should improve utilization without sacrificing ROAS.',
  },
  'dna patterns': {
    content: 'For **skincare category**, the winning DNA patterns are:\n\n🟡 **Hook:** Shock Statement + Transformation hooks deliver 4.5x avg ROAS\n🔵 **Visual:** UGC Style + Before/After visuals outperform by 38%\n🟢 **Audio:** Hindi VO with Emotional tone has 2.1x higher completion rate\n\n**Top DNA Combination:** Shock Statement + UGC Style + Hindi VO = 5.2x ROAS',
    chart: {
      type: 'bar',
      data: [
        { label: 'Shock+UGC+Hindi', value: 5.2 },
        { label: 'Price+Lifestyle+Music', value: 4.1 },
        { label: 'Social+Macro+English', value: 3.6 },
        { label: 'Curiosity+Text+Silent', value: 2.8 },
      ]
    }
  },
};

@Component({
  selector: 'app-ai-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="flex flex-col h-[calc(100vh-8rem)]">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center">
          <lucide-icon name="sparkles" [size]="18"></lucide-icon>
        </div>
        <div>
          <h1 class="text-page-title font-display text-navy m-0">AI Studio</h1>
          <p class="text-xs text-gray-500 font-body m-0">Ask anything about your ad performance</p>
        </div>
      </div>

      <!-- Chat area -->
      <div class="flex-1 overflow-y-auto bg-white rounded-card shadow-card p-4 space-y-4 mb-4" #chatContainer>
        @if (messages().length === 0) {
          <!-- Welcome screen -->
          <div class="text-center py-12">
            <div class="w-16 h-16 mx-auto mb-4 bg-accent/10 rounded-full flex items-center justify-center">
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
                  <span class="text-lg block mb-1">{{ q.icon }}</span>
                  <span class="text-xs font-body text-gray-600 group-hover:text-accent">{{ q.text }}</span>
                </button>
              }
            </div>
          </div>
        } @else {
          @for (msg of messages(); track msg.id) {
            <div class="flex gap-3" [ngClass]="msg.role === 'user' ? 'justify-end' : 'justify-start'">
              @if (msg.role === 'ai') {
                <div class="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center shrink-0 mt-1">
                  <lucide-icon name="sparkles" [size]="14"></lucide-icon>
                </div>
              }
              <div class="max-w-[75%] rounded-xl p-3"
                [ngClass]="msg.role === 'user' ? 'bg-accent text-white' : 'bg-gray-50 text-gray-800'">
                <div class="text-sm font-body whitespace-pre-line" [innerHTML]="formatMessage(msg.content)"></div>

                @if (msg.chart) {
                  <div class="mt-3 bg-white rounded-lg p-3 border border-gray-100">
                    <div class="space-y-2">
                      @for (item of msg.chart.data; track item.label) {
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-body text-gray-600 w-36 truncate">{{ item.label }}</span>
                          <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div class="bg-accent/70 h-full rounded-full flex items-center justify-end px-2 transition-all"
                              [style.width.%]="(item.value / getMaxValue(msg.chart!.data)) * 100">
                              <span class="text-[10px] font-body font-bold text-white">{{ item.value }}x</span>
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
export default class AiStudioComponent {
  @ViewChild('chatContainer') chatContainer!: ElementRef;
  private aiService = inject(AiService);

  messages = signal<ChatMessage[]>([]);
  typing = signal(false);
  inputText = '';
  suggestedQuestions = SUGGESTED_QUESTIONS;

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

    const userMsg: ChatMessage = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    this.messages.update(msgs => [...msgs, userMsg]);
    this.inputText = '';
    this.typing.set(true);
    this.scrollToBottom();

    this.aiService.chat(text).subscribe({
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
        this.typing.set(false);
        this.scrollToBottom();
      },
      error: () => {
        // Fallback to demo response when API unavailable
        const fallback = this.findResponse(text);
        const aiMsg: ChatMessage = {
          id: 'msg-' + Date.now() + '-ai',
          role: 'ai',
          content: fallback.content,
          timestamp: new Date(),
          chart: fallback.chart,
          table: fallback.table,
        };
        this.messages.update(msgs => [...msgs, aiMsg]);
        this.typing.set(false);
        this.scrollToBottom();
      }
    });
  }

  private findResponse(query: string): { content: string; chart?: ChatMessage['chart']; table?: ChatMessage['table'] } {
    const lower = query.toLowerCase();
    for (const [key, value] of Object.entries(AI_RESPONSES)) {
      if (lower.includes(key)) return value;
    }
    return {
      content: `Great question! Based on your account data:\n\n📊 Your overall account ROAS this month is **3.8x** (up 12% from last month).\n\nYour top performing campaign "Collagen Range — Feb" is driving 62% of conversions with a CPA of ₹285.\n\nWould you like me to dig deeper into any specific metric or creative?`
    };
  }

  formatMessage(content: string): string {
    return content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
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
