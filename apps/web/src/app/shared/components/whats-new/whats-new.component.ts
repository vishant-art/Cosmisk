import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

interface ChangelogEntry {
  version: string;
  date: string;
  highlights: { icon: string; title: string; description: string }[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.4.0',
    date: 'April 2, 2026',
    highlights: [
      { icon: 'shield', title: 'Account Security', description: 'Change password, activity log, and account deletion from Settings.' },
      { icon: 'sparkles', title: 'Creative Score Engine', description: '5-dimension scoring for ad creatives — hook, visual, message, CTA, and pacing.' },
      { icon: 'video', title: 'Creative Studio Redesign', description: 'URL-first generation flow with drag-and-drop asset management.' },
      { icon: 'smartphone', title: 'Mobile Responsive', description: 'Sidebar and layout now work on mobile with swipe-to-open navigation.' },
      { icon: 'keyboard', title: 'Keyboard Shortcuts', description: 'Press ? for shortcuts, Cmd+K for command palette, G+key for quick navigation.' },
      { icon: 'bell', title: 'Smarter Notifications', description: 'Rate limit feedback, connection status, and 8s error toasts for better visibility.' },
    ],
  },
];

const CURRENT_VERSION = '1.4.0';
const STORAGE_KEY = 'cosmisk_last_seen_version';

@Component({
  selector: 'app-whats-new',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (visible()) {
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center animate-fade-in" (click)="close()">
        <div class="w-full max-w-md mx-4 animate-slide-up" (click)="$event.stopPropagation()">
          <div class="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <!-- Header -->
            <div class="bg-gradient-to-br from-accent via-violet-500 to-purple-600 p-6 text-white relative overflow-hidden">
              <div class="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
              <div class="relative">
                <div class="flex items-center gap-2 mb-1">
                  <lucide-icon name="gift" [size]="16" class="opacity-80"></lucide-icon>
                  <span class="text-xs font-mono font-bold uppercase tracking-widest opacity-70">What's New</span>
                </div>
                <h2 class="text-2xl font-display font-bold m-0">v{{ entry.version }}</h2>
                <p class="text-sm opacity-70 font-body m-0 mt-1">{{ entry.date }}</p>
              </div>
            </div>

            <!-- Changes -->
            <div class="p-5 max-h-[50vh] overflow-y-auto space-y-3">
              @for (item of entry.highlights; track item.title) {
                <div class="flex gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <lucide-icon [name]="item.icon" [size]="18" class="text-accent"></lucide-icon>
                  </div>
                  <div>
                    <h4 class="text-sm font-display font-semibold text-navy m-0">{{ item.title }}</h4>
                    <p class="text-xs text-gray-500 font-body m-0 mt-0.5 leading-relaxed">{{ item.description }}</p>
                  </div>
                </div>
              }
            </div>

            <!-- Footer -->
            <div class="p-4 border-t border-gray-100">
              <button
                (click)="close()"
                class="w-full py-2.5 bg-accent text-white rounded-xl text-sm font-body font-semibold border-0 cursor-pointer hover:bg-accent/90 transition-colors">
                Got it!
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class WhatsNewComponent {
  visible = signal(false);
  entry = CHANGELOG[0];

  show() {
    this.visible.set(true);
  }

  close() {
    this.visible.set(false);
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
  }

  /** Call on init — shows only if user hasn't seen this version */
  checkAndShow() {
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    if (lastSeen !== CURRENT_VERSION) {
      // Delay slightly so it doesn't compete with welcome tour
      setTimeout(() => this.show(), 1500);
    }
  }
}
