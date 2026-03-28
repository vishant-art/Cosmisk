import { Component, inject, signal, HostListener, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AiService } from '../../../core/services/ai.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface CommandItem {
  id: string;
  label: string;
  category: string;
  icon: string;
  route?: string;
  action?: () => void;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open()) {
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] animate-fade-in" (click)="close()"></div>

      <div class="fixed top-[12%] left-1/2 -translate-x-1/2 w-full max-w-xl z-[101] animate-slide-down">
        <div class="bg-white rounded-xl shadow-modal overflow-hidden border border-gray-200">
          <!-- Search Input -->
          <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            @if (mode() === 'ai') {
              <span class="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold">AI</span>
            } @else {
              <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            }
            <input
              #searchInput
              [(ngModel)]="query"
              (input)="onSearch()"
              (keydown)="onInputKeydown($event)"
              [placeholder]="mode() === 'ai' ? 'Ask Cosmisk anything...' : 'Search or type a command...'"
              class="flex-1 bg-transparent border-0 outline-none text-sm font-body text-navy placeholder:text-gray-400" />
            @if (mode() === 'ai') {
              <button (click)="switchToNav()" class="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-body text-gray-500 hover:bg-gray-200 border-0 cursor-pointer">NAV</button>
            } @else {
              <kbd class="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-400">ESC</kbd>
            }
          </div>

          <!-- Quick Commands (when AI mode and no query yet) -->
          @if (mode() === 'ai' && !query && !aiResponse()) {
            <div class="p-3 border-b border-gray-100">
              <span class="px-2 text-[10px] font-body font-semibold text-gray-400 uppercase">Quick Commands</span>
              <div class="grid grid-cols-2 gap-1.5 mt-2">
                @for (cmd of quickCommands; track cmd.label) {
                  <button
                    (click)="executeQuickCommand(cmd.prompt)"
                    class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-accent/5 hover:text-accent text-left border-0 cursor-pointer transition-colors">
                    <span class="text-sm">{{ cmd.icon }}</span>
                    <span class="text-xs font-body text-gray-700">{{ cmd.label }}</span>
                  </button>
                }
              </div>
            </div>
          }

          <!-- AI Response -->
          @if (aiResponse()) {
            <div class="p-4 max-h-72 overflow-y-auto">
              <div class="text-xs text-gray-400 font-body mb-1">Cosmisk AI</div>
              <div class="text-sm font-body text-navy leading-relaxed whitespace-pre-wrap">{{ aiResponse() }}</div>
              @if (aiActions().length > 0) {
                <div class="flex flex-wrap gap-2 mt-3">
                  @for (action of aiActions(); track action.label) {
                    <button
                      (click)="executeAiAction(action)"
                      class="px-3 py-1.5 rounded-lg text-xs font-body font-medium border-0 cursor-pointer transition-colors"
                      [ngClass]="action.type === 'danger' ? 'bg-red-50 text-red-700 hover:bg-red-100' : action.type === 'success' ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-accent/10 text-accent hover:bg-accent/20'">
                      {{ action.label }}
                    </button>
                  }
                </div>
              }
            </div>
          }

          <!-- AI Loading -->
          @if (aiLoading()) {
            <div class="p-6 flex items-center gap-3">
              <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
              <span class="text-sm font-body text-gray-500">Thinking...</span>
            </div>
          }

          <!-- Navigation Results -->
          @if (mode() === 'nav' || (mode() === 'ai' && !aiResponse() && !aiLoading() && query)) {
            <div class="max-h-72 overflow-y-auto">
              @if (filteredItems().length === 0 && mode() === 'nav') {
                <div class="p-6 text-center">
                  <p class="text-sm text-gray-400 font-body m-0">No results. Press Enter to ask AI instead.</p>
                </div>
              } @else if (filteredItems().length > 0) {
                @for (category of categories(); track category) {
                  <div class="px-2 pt-2">
                    <span class="px-2 text-[10px] font-body font-semibold text-gray-400 uppercase">{{ category }}</span>
                  </div>
                  @for (item of getItemsByCategory(category); track item.id) {
                    <button
                      (click)="executeItem(item)"
                      (mouseenter)="activeIndex = getItemIndex(item)"
                      class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-0 bg-transparent cursor-pointer"
                      [ngClass]="activeIndex === getItemIndex(item) ? 'bg-accent/5 text-accent' : 'text-navy hover:bg-gray-50'">
                      <span class="text-lg w-6 text-center" [innerHTML]="item.icon"></span>
                      <span class="text-sm font-body">{{ item.label }}</span>
                    </button>
                  }
                }
              }
            </div>
          }

          <!-- Footer -->
          <div class="flex items-center gap-4 px-4 py-2 border-t border-gray-100 bg-gray-50">
            <div class="flex items-center gap-1 text-[10px] text-gray-400 font-body">
              <kbd class="px-1 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono">Tab</kbd>
              {{ mode() === 'nav' ? 'AI mode' : 'Nav mode' }}
            </div>
            <div class="flex items-center gap-1 text-[10px] text-gray-400 font-body">
              <kbd class="px-1 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono">&#8593;</kbd>
              <kbd class="px-1 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono">&#8595;</kbd>
              navigate
            </div>
            <div class="flex items-center gap-1 text-[10px] text-gray-400 font-body">
              <kbd class="px-1 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono">&#8629;</kbd>
              {{ mode() === 'ai' ? 'ask' : 'select' }}
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Keyboard Shortcuts Overlay -->
    @if (showShortcuts()) {
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] animate-fade-in" (click)="showShortcuts.set(false)"></div>
      <div class="fixed top-[10%] left-1/2 -translate-x-1/2 w-full max-w-md z-[101] animate-slide-down">
        <div class="bg-white rounded-xl shadow-modal overflow-hidden border border-gray-200">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 class="text-sm font-display font-semibold text-navy m-0">Keyboard Shortcuts</h3>
            <button (click)="showShortcuts.set(false)" class="p-1 hover:bg-gray-100 rounded border-0 bg-transparent cursor-pointer">
              <span class="text-gray-400 text-lg">&times;</span>
            </button>
          </div>
          <div class="p-3 max-h-[60vh] overflow-y-auto">
            @for (s of shortcuts; track s.desc) {
              <div class="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50">
                <span class="text-sm text-gray-700 font-body">{{ s.desc }}</span>
                <div class="flex items-center gap-1">
                  @for (key of s.keys; track key) {
                    <kbd class="px-2 py-1 bg-gray-100 rounded border border-gray-200 text-xs font-mono text-gray-600 min-w-[28px] text-center">{{ key }}</kbd>
                  }
                </div>
              </div>
            }
          </div>
          <div class="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p class="text-[10px] text-gray-400 font-body m-0 text-center">Press <kbd class="px-1 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono">?</kbd> to toggle this overlay</p>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes slide-down {
      from { opacity: 0; transform: translate(-50%, -12px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
    .animate-slide-down {
      animation: slide-down 0.15s ease-out;
    }
  `]
})
export class CommandPaletteComponent implements AfterViewChecked {
  private router = inject(Router);
  private ai = inject(AiService);
  private http = inject(HttpClient);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  open = signal(false);
  mode = signal<'nav' | 'ai'>('ai'); // Default to AI mode
  query = '';
  activeIndex = 0;

  aiResponse = signal<string | null>(null);
  aiLoading = signal(false);
  aiActions = signal<{ label: string; type: 'danger' | 'success' | 'info'; route?: string; apiCall?: string }[]>([]);

  private shouldFocus = false;

  quickCommands = [
    { icon: '&#9888;&#65039;', label: 'Pause losing campaigns', prompt: 'Which campaigns have CPA above target? Should I pause any?' },
    { icon: '&#128640;', label: 'Scale my best ads', prompt: 'Show me my top performing ads by ROAS and recommend budget increases' },
    { icon: '&#128200;', label: 'Today\'s performance', prompt: 'Give me a quick summary of how my ads performed today' },
    { icon: '&#129504;', label: 'Morning briefing', prompt: 'Give me my morning briefing with key decisions needed' },
    { icon: '&#127916;', label: 'New creative brief', prompt: 'Based on my winning patterns, generate a new creative brief' },
    { icon: '&#128737;', label: 'Account health check', prompt: 'Run a quick health check on my ad account' },
  ];

  allItems: CommandItem[] = [
    // Pages
    { id: 'nav-dashboard', label: 'Dashboard', category: 'Pages', icon: '&#9632;', route: '/app/dashboard' },
    { id: 'nav-cockpit', label: 'Creative Cockpit', category: 'Pages', icon: '&#127912;', route: '/app/creative-cockpit' },
    { id: 'nav-director', label: 'Director Lab', category: 'Pages', icon: '&#127916;', route: '/app/director-lab' },
    { id: 'nav-ugc', label: 'Creative Studio', category: 'Pages', icon: '&#9654;', route: '/app/ugc-studio' },
    { id: 'nav-brain', label: 'Brain', category: 'Pages', icon: '&#129504;', route: '/app/brain' },
    { id: 'nav-analytics', label: 'Analytics', category: 'Pages', icon: '&#128202;', route: '/app/analytics' },
    { id: 'nav-ai', label: 'AI Studio', category: 'Pages', icon: '&#128172;', route: '/app/ai-studio' },
    { id: 'nav-reports', label: 'Reports', category: 'Pages', icon: '&#128196;', route: '/app/reports' },
    { id: 'nav-campaigns', label: 'Campaign Builder', category: 'Pages', icon: '&#128227;', route: '/app/campaigns' },
    { id: 'nav-graphic', label: 'Graphic Studio', category: 'Pages', icon: '&#128444;', route: '/app/graphic-studio' },
    { id: 'nav-assets', label: 'Assets Vault', category: 'Pages', icon: '&#128194;', route: '/app/assets' },
    { id: 'nav-swipe', label: 'Swipe File', category: 'Pages', icon: '&#128278;', route: '/app/swipe-file' },
    { id: 'nav-lighthouse', label: 'Lighthouse', category: 'Pages', icon: '&#9201;', route: '/app/lighthouse' },
    { id: 'nav-attribution', label: 'Attribution', category: 'Pages', icon: '&#9095;', route: '/app/attribution' },
    { id: 'nav-audit', label: 'Account Audit', category: 'Pages', icon: '&#128737;', route: '/app/audit' },
    { id: 'nav-automations', label: 'Automations', category: 'Pages', icon: '&#9881;', route: '/app/automations' },
    { id: 'nav-autopilot', label: 'Autopilot', category: 'Pages', icon: '&#9992;', route: '/app/autopilot' },
    { id: 'nav-competitor', label: 'Competitor Spy', category: 'Pages', icon: '&#128373;', route: '/app/competitor-spy' },
    { id: 'nav-settings', label: 'Settings', category: 'Pages', icon: '&#9881;', route: '/app/settings' },
    { id: 'nav-agency', label: 'Agency Command Center', category: 'Pages', icon: '&#127970;', route: '/app/agency' },
    // Actions
    { id: 'act-campaign', label: 'Create New Campaign', category: 'Actions', icon: '&#10133;', route: '/app/campaigns' },
    { id: 'act-creative', label: 'Generate Creative Brief', category: 'Actions', icon: '&#9997;', route: '/app/director-lab' },
    { id: 'act-report', label: 'Generate Report', category: 'Actions', icon: '&#128200;', route: '/app/reports' },
    { id: 'act-audit', label: 'Run Account Audit', category: 'Actions', icon: '&#128737;', route: '/app/audit' },
    { id: 'act-watchdog', label: 'Run AI Watchdog', category: 'Actions', icon: '&#129454;', route: '/app/autopilot' },
    { id: 'act-sprint', label: 'Start Creative Sprint', category: 'Actions', icon: '&#127939;', route: '/app/ugc-studio' },
  ];

  private filteredCache: CommandItem[] = this.allItems;

  ngAfterViewChecked() {
    if (this.shouldFocus && this.searchInput?.nativeElement) {
      this.searchInput.nativeElement.focus();
      this.shouldFocus = false;
    }
  }

  filteredItems(): CommandItem[] {
    return this.filteredCache;
  }

  categories(): string[] {
    return [...new Set(this.filteredCache.map(i => i.category))];
  }

  getItemsByCategory(category: string): CommandItem[] {
    return this.filteredCache.filter(i => i.category === category);
  }

  getItemIndex(item: CommandItem): number {
    return this.filteredCache.indexOf(item);
  }

  onSearch() {
    const q = this.query.toLowerCase().trim();

    // Check if query looks like natural language (not just a page name)
    const isNaturalLanguage = q.length > 15 || /\b(how|what|why|show|give|pause|scale|increase|decrease|run|generate|compare|analyze|which|my|should|can)\b/i.test(q);

    if (isNaturalLanguage && this.mode() === 'nav') {
      this.mode.set('ai');
    }

    if (!q) {
      this.filteredCache = this.allItems;
    } else {
      this.filteredCache = this.allItems.filter(i =>
        i.label.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
      );
    }
    this.activeIndex = 0;
    this.aiResponse.set(null);
    this.aiActions.set([]);
  }

  onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      event.preventDefault();
      this.mode.set(this.mode() === 'ai' ? 'nav' : 'ai');
      return;
    }

    if (event.key === 'Escape') {
      this.close();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = Math.min(this.activeIndex + 1, this.filteredCache.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = Math.max(this.activeIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.mode() === 'ai' && this.query.trim()) {
        this.askAi(this.query.trim());
      } else if (this.filteredCache.length > 0) {
        this.executeItem(this.filteredCache[this.activeIndex]);
      } else if (this.query.trim()) {
        // No nav results — fall through to AI
        this.mode.set('ai');
        this.askAi(this.query.trim());
      }
    }
  }

  askAi(prompt: string) {
    this.aiLoading.set(true);
    this.aiResponse.set(null);
    this.aiActions.set([]);

    this.ai.chat(prompt).subscribe({
      next: (res) => {
        this.aiLoading.set(false);
        this.aiResponse.set(res.content);

        // Parse response for actionable suggestions
        const actions: { label: string; type: 'danger' | 'success' | 'info'; route?: string }[] = [];
        const text = res.content.toLowerCase();

        if (/pause|stop|disable/i.test(text)) {
          actions.push({ label: 'Go to Automations', type: 'danger', route: '/app/automations' });
        }
        if (/scale|increase|boost/i.test(text)) {
          actions.push({ label: 'Open Autopilot', type: 'success', route: '/app/autopilot' });
        }
        if (/creative|brief|ad copy/i.test(text)) {
          actions.push({ label: 'Open Director Lab', type: 'info', route: '/app/director-lab' });
        }
        if (/analytics|report|data/i.test(text)) {
          actions.push({ label: 'View Analytics', type: 'info', route: '/app/analytics' });
        }
        if (/audit|health|optimize/i.test(text)) {
          actions.push({ label: 'Run Audit', type: 'info', route: '/app/audit' });
        }

        // Always offer to continue in AI Studio for deeper conversation
        actions.push({ label: 'Continue in AI Studio', type: 'info', route: '/app/ai-studio' });
        this.aiActions.set(actions);
      },
      error: () => {
        this.aiLoading.set(false);
        this.aiResponse.set('Could not reach AI. Check your connection and try again.');
      }
    });
  }

  executeQuickCommand(prompt: string) {
    this.query = prompt;
    this.askAi(prompt);
  }

  executeAiAction(action: { label: string; route?: string }) {
    this.close();
    if (action.route) {
      this.router.navigate([action.route]);
    }
  }

  executeItem(item: CommandItem) {
    this.close();
    if (item.route) {
      this.router.navigate([item.route]);
    }
    if (item.action) {
      item.action();
    }
  }

  switchToNav() {
    this.mode.set('nav');
    this.aiResponse.set(null);
    this.aiActions.set([]);
  }

  close() {
    this.open.set(false);
    this.query = '';
    this.filteredCache = this.allItems;
    this.activeIndex = 0;
    this.mode.set('ai');
    this.aiResponse.set(null);
    this.aiLoading.set(false);
    this.aiActions.set([]);
  }

  showShortcuts = signal(false);
  private gPressed = false;
  private gTimeout?: ReturnType<typeof setTimeout>;

  shortcuts = [
    { keys: ['Cmd', 'K'], desc: 'Command bar' },
    { keys: ['?'], desc: 'Keyboard shortcuts' },
    { keys: ['G', 'D'], desc: 'Go to Dashboard' },
    { keys: ['G', 'A'], desc: 'Go to Analytics' },
    { keys: ['G', 'B'], desc: 'Go to Brain' },
    { keys: ['G', 'C'], desc: 'Go to Creative Cockpit' },
    { keys: ['G', 'S'], desc: 'Go to AI Studio' },
    { keys: ['G', 'E'], desc: 'Go to Creative Engine' },
    { keys: ['G', 'R'], desc: 'Go to Reports' },
    { keys: ['G', 'P'], desc: 'Go to Autopilot' },
    { keys: ['G', 'U'], desc: 'Go to UGC Studio' },
    { keys: ['Tab'], desc: 'Switch AI/Nav mode (in command bar)' },
    { keys: ['Esc'], desc: 'Close overlay' },
  ];

  private gNavMap: Record<string, string> = {
    d: '/app/dashboard',
    a: '/app/analytics',
    b: '/app/brain',
    c: '/app/creative-cockpit',
    s: '/app/ai-studio',
    e: '/app/creative-engine',
    r: '/app/reports',
    p: '/app/autopilot',
    u: '/app/ugc-studio',
    l: '/app/director-lab',
    t: '/app/settings',
    w: '/app/swipe-file',
    x: '/app/audit',
  };

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Cmd+K always works
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      if (this.open()) {
        this.close();
      } else {
        this.open.set(true);
        this.shouldFocus = true;
      }
      return;
    }

    // Don't process shortcuts when typing in an input
    if (isInput || this.open()) return;

    // ? for shortcuts overlay
    if (event.key === '?' || (event.shiftKey && event.key === '/')) {
      event.preventDefault();
      this.showShortcuts.set(!this.showShortcuts());
      return;
    }

    // Escape closes shortcuts
    if (event.key === 'Escape' && this.showShortcuts()) {
      this.showShortcuts.set(false);
      return;
    }

    // G+key navigation (vim-style "go to")
    if (event.key === 'g' && !this.gPressed) {
      this.gPressed = true;
      clearTimeout(this.gTimeout);
      this.gTimeout = setTimeout(() => { this.gPressed = false; }, 500);
      return;
    }

    if (this.gPressed) {
      this.gPressed = false;
      clearTimeout(this.gTimeout);
      const route = this.gNavMap[event.key];
      if (route) {
        event.preventDefault();
        this.router.navigate([route]);
      }
    }
  }
}
