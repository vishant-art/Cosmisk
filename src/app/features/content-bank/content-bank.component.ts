import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { environment } from '../../../environments/environment';

interface ContentItem {
  id: string;
  platform: string;
  content_type: string;
  title: string | null;
  body: string;
  hashtags: string | null;
  media_notes: string | null;
  status: string;
  scheduled_for: string | null;
  posted_at: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-content-bank',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Error banner -->
      @if (error()) {
        <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <lucide-icon name="alert-circle" [size]="18" class="text-red-500 shrink-0"></lucide-icon>
          <p class="text-sm text-red-700 font-body m-0 flex-1">{{ error() }}</p>
          <button (click)="retry()" class="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-body font-semibold hover:bg-red-200 transition-colors border-0 cursor-pointer">
            Retry
          </button>
        </div>
      }

      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 class="text-page-title font-display text-navy m-0">Content Bank</h1>
          <p class="text-sm text-gray-500 font-body mt-1 mb-0">
            {{ total() }} pieces of content
            @if (activeFilter() !== 'all') { &middot; Showing {{ activeFilter() }} }
          </p>
        </div>
        <div class="flex gap-3">
          <button
            (click)="triggerWeekly()"
            [disabled]="generatingWeekly()"
            class="px-4 py-2 border border-gray-200 rounded-pill text-sm font-body text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            @if (generatingWeekly()) {
              <span class="inline-flex items-center gap-2">
                <span class="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                Generating...
              </span>
            } @else {
              Generate 7-Day Batch
            }
          </button>
          <button
            (click)="showComposer.set(true)"
            class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors flex items-center gap-2">
            <lucide-icon name="plus" [size]="16"></lucide-icon>
            New Content
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap gap-2">
        <!-- Status tabs -->
        <div class="flex bg-gray-100 rounded-lg p-0.5">
          @for (tab of statusTabs; track tab.value) {
            <button
              (click)="setFilter(tab.value)"
              class="px-3 py-1.5 rounded-md text-xs font-body font-medium transition-colors"
              [class]="activeFilter() === tab.value
                ? 'bg-white text-navy shadow-sm'
                : 'text-gray-500 hover:text-gray-700'">
              {{ tab.label }}
            </button>
          }
        </div>

        <!-- Platform filter -->
        <div class="flex bg-gray-100 rounded-lg p-0.5 ml-auto">
          @for (p of platformTabs; track p.value) {
            <button
              (click)="setPlatform(p.value)"
              class="px-3 py-1.5 rounded-md text-xs font-body font-medium transition-colors"
              [class]="activePlatform() === p.value
                ? 'bg-white text-navy shadow-sm'
                : 'text-gray-500 hover:text-gray-700'">
              {{ p.label }}
            </button>
          }
        </div>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="bg-white rounded-card shadow-card p-4 animate-pulse">
              <div class="flex items-center gap-2 mb-3">
                <div class="h-5 w-16 bg-gray-200 rounded-full"></div>
                <div class="h-5 w-12 bg-gray-200 rounded-full ml-auto"></div>
              </div>
              <div class="h-3 bg-gray-200 rounded w-full mb-2"></div>
              <div class="h-3 bg-gray-200 rounded w-4/5 mb-2"></div>
              <div class="h-3 bg-gray-200 rounded w-3/5"></div>
            </div>
          }
        </div>
      }

      <!-- Empty state -->
      @if (!loading() && items().length === 0) {
        <div class="bg-white rounded-card shadow-card p-12 text-center">
          <lucide-icon name="file-text" [size]="48" class="text-gray-300 mx-auto mb-4"></lucide-icon>
          <h3 class="text-lg font-display text-navy mb-2">No content yet</h3>
          <p class="text-sm text-gray-500 font-body mb-4">
            Generate a 7-day content batch or create individual pieces.
          </p>
          <button
            (click)="triggerWeekly()"
            [disabled]="generatingWeekly()"
            class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors">
            Generate 7-Day Batch
          </button>
        </div>
      }

      <!-- Content grid -->
      @if (!loading() && items().length > 0) {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          @for (item of items(); track item.id) {
            <div class="bg-white rounded-card shadow-card overflow-hidden hover:shadow-lg transition-shadow group">
              <!-- Card header -->
              <div class="px-4 pt-4 pb-2 flex items-center gap-2">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider"
                  [class]="platformClass(item.platform)">
                  {{ item.platform }}
                </span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider"
                  [class]="statusClass(item.status)">
                  {{ item.status }}
                </span>
                <span class="ml-auto text-[10px] text-gray-400 font-mono">
                  {{ formatDate(item.created_at) }}
                </span>
              </div>

              <!-- Title -->
              @if (item.title) {
                <div class="px-4 pb-1">
                  <h4 class="text-sm font-display text-navy m-0 truncate">{{ item.title }}</h4>
                </div>
              }

              <!-- Body preview -->
              <div class="px-4 pb-3">
                @if (expandedId() === item.id) {
                  <p class="text-sm text-gray-700 font-body whitespace-pre-wrap m-0">{{ item.body }}</p>
                } @else {
                  <p class="text-sm text-gray-600 font-body m-0 line-clamp-4">{{ item.body }}</p>
                }
                @if (item.body.length > 200) {
                  <button
                    (click)="toggleExpand(item.id)"
                    class="text-xs text-accent font-body mt-1 bg-transparent border-0 cursor-pointer p-0 hover:underline">
                    {{ expandedId() === item.id ? 'Show less' : 'Show more' }}
                  </button>
                }
              </div>

              <!-- Hashtags -->
              @if (item.hashtags) {
                <div class="px-4 pb-3">
                  <p class="text-xs text-accent/70 font-body m-0 truncate">{{ item.hashtags }}</p>
                </div>
              }

              <!-- Actions -->
              <div class="px-4 pb-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  (click)="copyContent(item)"
                  class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-body text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors border-0 cursor-pointer">
                  <lucide-icon name="copy" [size]="12"></lucide-icon>
                  {{ copiedId() === item.id ? 'Copied' : 'Copy' }}
                </button>

                @if (item.status === 'draft') {
                  <button
                    (click)="updateStatus(item.id, 'scheduled')"
                    class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-body text-accent bg-accent/10 rounded-lg hover:bg-accent/20 transition-colors border-0 cursor-pointer">
                    <lucide-icon name="calendar" [size]="12"></lucide-icon>
                    Schedule
                  </button>
                }

                @if (item.status === 'scheduled') {
                  <button
                    (click)="updateStatus(item.id, 'posted')"
                    class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-body text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors border-0 cursor-pointer">
                    <lucide-icon name="send" [size]="12"></lucide-icon>
                    Mark Posted
                  </button>
                }

                <button
                  (click)="deleteContent(item.id)"
                  class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-body text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors border-0 cursor-pointer ml-auto">
                  <lucide-icon name="trash-2" [size]="12"></lucide-icon>
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Load more -->
        @if (items().length < total()) {
          <div class="text-center pt-4">
            <button
              (click)="loadMore()"
              class="px-5 py-2 border border-gray-200 rounded-pill text-sm font-body text-gray-600 hover:bg-gray-50 transition-colors">
              Load more ({{ total() - items().length }} remaining)
            </button>
          </div>
        }
      }

      <!-- Composer modal -->
      @if (showComposer()) {
        <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" (click)="showComposer.set(false)">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" (click)="$event.stopPropagation()">
            <div class="p-6">
              <div class="flex items-center justify-between mb-6">
                <h2 class="text-lg font-display text-navy m-0">New Content</h2>
                <button (click)="showComposer.set(false)" class="text-gray-400 hover:text-gray-600 bg-transparent border-0 cursor-pointer">
                  <lucide-icon name="x" [size]="20"></lucide-icon>
                </button>
              </div>

              <!-- Platform select -->
              <div class="mb-4">
                <label class="block text-xs font-body font-semibold text-gray-500 mb-1.5">Platform</label>
                <div class="flex gap-2">
                  @for (p of ['instagram', 'linkedin', 'twitter']; track p) {
                    <button
                      (click)="composerPlatform.set(p)"
                      class="px-3 py-1.5 rounded-lg text-sm font-body border transition-colors cursor-pointer"
                      [class]="composerPlatform() === p
                        ? 'bg-accent text-white border-accent'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'">
                      {{ p | titlecase }}
                    </button>
                  }
                </div>
              </div>

              <!-- Title -->
              <div class="mb-4">
                <label class="block text-xs font-body font-semibold text-gray-500 mb-1.5">Title (optional)</label>
                <input
                  [(ngModel)]="composerTitle"
                  placeholder="e.g. Monday Motivation"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
              </div>

              <!-- Body -->
              <div class="mb-4">
                <label class="block text-xs font-body font-semibold text-gray-500 mb-1.5">Content</label>
                <textarea
                  [(ngModel)]="composerBody"
                  rows="6"
                  placeholder="Write your post..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"></textarea>
              </div>

              <!-- Hashtags -->
              <div class="mb-4">
                <label class="block text-xs font-body font-semibold text-gray-500 mb-1.5">Hashtags (optional)</label>
                <input
                  [(ngModel)]="composerHashtags"
                  placeholder="#marketing #growth"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
              </div>

              <!-- AI Generate -->
              <div class="mb-6 p-3 bg-accent/5 border border-accent/20 rounded-lg">
                <label class="block text-xs font-body font-semibold text-accent mb-1.5">Or generate with AI</label>
                <div class="flex gap-2">
                  <input
                    [(ngModel)]="composerTopic"
                    placeholder="Topic or theme..."
                    class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-body focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                  <button
                    (click)="generateContent()"
                    [disabled]="generating()"
                    class="px-4 py-2 bg-accent text-white rounded-lg text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50 whitespace-nowrap">
                    {{ generating() ? 'Generating...' : 'Generate' }}
                  </button>
                </div>
              </div>

              <!-- Save -->
              <div class="flex justify-end gap-3">
                <button
                  (click)="showComposer.set(false)"
                  class="px-4 py-2 text-sm font-body text-gray-600 hover:text-gray-800 bg-transparent border-0 cursor-pointer">
                  Cancel
                </button>
                <button
                  (click)="saveContent()"
                  [disabled]="!composerBody"
                  class="px-5 py-2.5 bg-accent text-white rounded-pill text-sm font-body font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50">
                  Save to Bank
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Weekly generation success toast -->
      @if (weeklySuccess()) {
        <div class="fixed bottom-6 right-6 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-3 animate-slide-up">
          <lucide-icon name="check-circle" [size]="20"></lucide-icon>
          <div>
            <p class="text-sm font-body font-semibold m-0">Weekly content generated</p>
            <p class="text-xs font-body opacity-80 m-0">{{ weeklyCount() }} pieces saved to your bank</p>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .line-clamp-4 {
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    @keyframes slide-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-up { animation: slide-up 0.3s ease-out; }
  `]
})
export default class ContentBankComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  items = signal<ContentItem[]>([]);
  total = signal(0);
  loading = signal(false);
  error = signal<string | null>(null);
  activeFilter = signal('all');
  activePlatform = signal('all');
  expandedId = signal<string | null>(null);
  copiedId = signal<string | null>(null);
  generatingWeekly = signal(false);
  weeklySuccess = signal(false);
  weeklyCount = signal(0);
  showComposer = signal(false);
  generating = signal(false);

  composerPlatform = signal('instagram');
  composerTitle = '';
  composerBody = '';
  composerHashtags = '';
  composerTopic = '';

  private offset = 0;
  private limit = 30;

  statusTabs = [
    { label: 'All', value: 'all' },
    { label: 'Drafts', value: 'draft' },
    { label: 'Scheduled', value: 'scheduled' },
    { label: 'Posted', value: 'posted' },
  ];

  platformTabs = [
    { label: 'All', value: 'all' },
    { label: 'Instagram', value: 'instagram' },
    { label: 'LinkedIn', value: 'linkedin' },
    { label: 'Twitter', value: 'twitter' },
  ];

  ngOnInit() {
    this.loadContent();
  }

  loadContent() {
    this.loading.set(true);
    this.offset = 0;

    const params: Record<string, string> = { limit: String(this.limit), offset: '0' };
    if (this.activeFilter() !== 'all') params['status'] = this.activeFilter();
    if (this.activePlatform() !== 'all') params['platform'] = this.activePlatform();

    const qs = new URLSearchParams(params).toString();

    this.api.get<any>(`${environment.CONTENT_BANK}?${qs}`).subscribe({
      next: (res) => {
        this.items.set(res.items || []);
        this.total.set(res.total || 0);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Failed to load content. Check your connection and try again.');
      },
    });
  }

  loadMore() {
    this.offset += this.limit;
    const params: Record<string, string> = { limit: String(this.limit), offset: String(this.offset) };
    if (this.activeFilter() !== 'all') params['status'] = this.activeFilter();
    if (this.activePlatform() !== 'all') params['platform'] = this.activePlatform();

    const qs = new URLSearchParams(params).toString();

    this.api.get<any>(`${environment.CONTENT_BANK}?${qs}`).subscribe({
      next: (res) => {
        this.items.update(prev => [...prev, ...(res.items || [])]);
      },
    });
  }

  setFilter(status: string) {
    this.activeFilter.set(status);
    this.loadContent();
  }

  setPlatform(platform: string) {
    this.activePlatform.set(platform);
    this.loadContent();
  }

  toggleExpand(id: string) {
    this.expandedId.update(prev => prev === id ? null : id);
  }

  copyContent(item: ContentItem) {
    const text = item.body + (item.hashtags ? '\n\n' + item.hashtags : '');
    navigator.clipboard.writeText(text);
    this.copiedId.set(item.id);
    setTimeout(() => this.copiedId.set(null), 2000);
  }

  updateStatus(id: string, status: string) {
    const body: any = { status };
    if (status === 'posted') body.posted_at = new Date().toISOString();

    this.api.put<any>(`${environment.CONTENT_BANK}/${id}`, body).subscribe({
      next: () => {
        this.items.update(prev => prev.map(i =>
          i.id === id ? { ...i, status, posted_at: body.posted_at || i.posted_at } : i
        ));
      },
    });
  }

  deleteContent(id: string) {
    if (!confirm('Delete this content? This cannot be undone.')) return;
    this.api.delete<any>(`${environment.CONTENT_BANK}/${id}`).subscribe({
      next: () => {
        this.items.update(prev => prev.filter(i => i.id !== id));
        this.total.update(t => t - 1);
      },
    });
  }

  triggerWeekly() {
    this.generatingWeekly.set(true);
    this.api.post<any>(environment.CONTENT_TRIGGER_WEEKLY, {}).subscribe({
      next: (res) => {
        this.generatingWeekly.set(false);
        this.weeklyCount.set(res.total_pieces || 0);
        this.weeklySuccess.set(true);
        setTimeout(() => this.weeklySuccess.set(false), 5000);
        this.loadContent();
      },
      error: (err) => {
        this.generatingWeekly.set(false);
        const msg = err.error?.error || 'Weekly generation failed. This may take a while — please try again.';
        this.error.set(msg);
        this.toast.error('Generation Failed', msg);
      },
    });
  }

  generateContent() {
    this.generating.set(true);
    this.api.post<any>(environment.CONTENT_GENERATE, {
      platforms: [this.composerPlatform()],
      topic: this.composerTopic || undefined,
    }).subscribe({
      next: (res) => {
        this.generating.set(false);
        const platform = this.composerPlatform();
        let content = res.content?.[platform];
        if (content) {
          // Twitter returns { thread: [...], single_tweets: [...] } — flatten to string
          if (typeof content === 'object') {
            if (content.thread?.length) {
              content = content.thread.map((t: string, i: number) => `${i + 1}/ ${t}`).join('\n\n');
            } else if (content.single_tweets?.length) {
              content = content.single_tweets.join('\n\n---\n\n');
            } else if (content.body) {
              content = content.body;
            } else {
              content = JSON.stringify(content, null, 2);
            }
          }
          this.composerBody = content;
          this.composerHashtags = res.hashtags?.[platform]?.join(' ') || '';
        }
      },
      error: (err) => {
        this.generating.set(false);
        const msg = err.error?.error || 'AI generation failed. Please try again.';
        this.error.set(msg);
        this.toast.error('Generation Failed', msg);
      },
    });
  }

  saveContent() {
    if (!this.composerBody) return;
    this.api.post<any>(environment.CONTENT_SAVE, {
      platform: this.composerPlatform(),
      title: this.composerTitle || undefined,
      body: this.composerBody,
      hashtags: this.composerHashtags ? this.composerHashtags.split(/\s+/).filter(Boolean) : undefined,
      source: 'manual',
    }).subscribe({
      next: () => {
        this.showComposer.set(false);
        this.composerTitle = '';
        this.composerBody = '';
        this.composerHashtags = '';
        this.composerTopic = '';
        this.loadContent();
      },
    });
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  platformClass(platform: string): string {
    const map: Record<string, string> = {
      instagram: 'bg-pink-100 text-pink-700',
      linkedin: 'bg-blue-100 text-blue-700',
      twitter: 'bg-sky-100 text-sky-700',
    };
    return map[platform] || 'bg-gray-100 text-gray-600';
  }

  retry() {
    this.error.set(null);
    this.loadContent();
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-600',
      scheduled: 'bg-amber-100 text-amber-700',
      posted: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-red-100 text-red-600',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  }
}
