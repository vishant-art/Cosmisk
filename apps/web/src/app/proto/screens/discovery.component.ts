import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ProtoStateService } from '../proto-state.service';

/**
 * PROTOTYPE — Blueprint §9. Brand Discovery.
 *
 * Runs on the website URL alone, before any ad data. This is the first moment
 * the product says something about the user's business rather than asking for
 * more input.
 *
 * SIMULATED: the 2.2s scan. In production this maps to the existing
 * apps/api/src/audit/website-analysis.ts extractor, which today is only
 * reachable from inside runAudit().
 */
@Component({
  selector: 'proto-discovery',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="w-full max-w-[720px] animate-fade-in">

      @if (scanning()) {
        <!-- SCANNING -->
        <div class="card !p-10 text-center">
          <div class="w-14 h-14 rounded-2xl bg-accent-light flex items-center justify-center mx-auto mb-5">
            <lucide-icon name="globe" [size]="24" class="text-accent animate-pulse"></lucide-icon>
          </div>
          <h1 class="text-card-title font-display text-navy mb-1.5">
            Reading {{ state.brand().website }}
          </h1>
          <p class="text-sm text-gray-500 font-body mb-6 m-0">
            Working out what you sell and who buys it.
          </p>
          <div class="h-1 bg-gray-200 rounded-full overflow-hidden max-w-[280px] mx-auto">
            <div class="h-full bg-accent rounded-full transition-all duration-[2200ms] ease-out"
              [style.width.%]="scanProgress()"></div>
          </div>
        </div>
      } @else {
        <!-- RESULT -->
        <div class="mb-7">
          <div class="flex items-center gap-2 mb-2.5">
            <span class="text-[11px] font-mono uppercase tracking-wider text-emerald-700
              bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Read from your website
            </span>
            @if (state.isDemo()) {
              <span class="text-[11px] font-mono uppercase tracking-wider text-amber-700
                bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Sample</span>
            }
          </div>
          <h1 class="text-page-title font-display text-navy mb-2">Here is what Cosmisk understood.</h1>
          <p class="text-body text-gray-500 m-0">
            This is the context Cosmisk uses when interpreting everything else. Every finding, number
            and recommendation from here on is read against it. If something is wrong, fix it now —
            it changes the answers.
          </p>
        </div>

        <div class="card !p-0 overflow-hidden mb-5">
          <!-- header -->
          <div class="px-7 py-5 border-b border-divider flex items-center justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 mb-1">
                <lucide-icon name="brain" [size]="12" class="text-accent"></lucide-icon>
                <span class="text-[11px] font-mono uppercase tracking-wider text-accent">
                  Cosmisk's memory of your brand
                </span>
              </div>
              @if (editing() === 'name') {
                <input class="input !py-2 !text-lg" [(ngModel)]="draftName"
                  (keyup.enter)="save('name')" (blur)="save('name')">
              } @else {
                <h2 class="text-card-title font-display text-navy m-0 truncate">{{ b().name }}</h2>
              }
              <p class="text-sm text-gray-400 font-mono m-0 mt-0.5 truncate">{{ b().website }}</p>
            </div>
            <button (click)="startEdit('name')"
              class="text-xs text-accent font-body font-medium bg-transparent border-0 cursor-pointer shrink-0">
              Edit
            </button>
          </div>

          <!-- rows -->
          <div class="divide-y divide-divider">

            <div class="px-7 py-4 flex items-start gap-5">
              <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 w-[110px] shrink-0 pt-0.5">Category</span>
              <div class="flex-1 min-w-0">
                @if (editing() === 'category') {
                  <input class="input !py-2" [(ngModel)]="draftCategory"
                    (keyup.enter)="save('category')" (blur)="save('category')">
                } @else {
                  <p class="text-sm text-navy font-body m-0">{{ b().category }}</p>
                }
              </div>
              <button (click)="startEdit('category')"
                class="text-xs text-gray-400 hover:text-accent font-body bg-transparent border-0 cursor-pointer shrink-0">Edit</button>
            </div>

            <div class="px-7 py-4 flex items-start gap-5">
              <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 w-[110px] shrink-0 pt-0.5">Positioning</span>
              <div class="flex-1 min-w-0">
                @if (editing() === 'positioning') {
                  <textarea class="input !py-2" rows="2" [(ngModel)]="draftPositioning"
                    (blur)="save('positioning')"></textarea>
                } @else {
                  <p class="text-sm text-navy font-body m-0 leading-relaxed">{{ b().positioning }}</p>
                }
              </div>
              <button (click)="startEdit('positioning')"
                class="text-xs text-gray-400 hover:text-accent font-body bg-transparent border-0 cursor-pointer shrink-0">Edit</button>
            </div>

            <div class="px-7 py-4 flex items-start gap-5">
              <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 w-[110px] shrink-0 pt-0.5">Price point</span>
              <div class="flex-1">
                <p class="text-sm text-navy font-body m-0">
                  {{ b().pricePoint }}
                  <span class="text-gray-400">· {{ b().priceRange }} across {{ b().productCount }} products</span>
                </p>
              </div>
            </div>

            <div class="px-7 py-4 flex items-start gap-5">
              <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 w-[110px] shrink-0 pt-0.5">Top products</span>
              <div class="flex-1 space-y-1.5">
                @for (p of b().topProducts; track p.name) {
                  <div class="flex items-baseline justify-between gap-4">
                    <span class="text-sm text-navy font-body">{{ p.name }}</span>
                    <span class="text-sm text-gray-500 font-mono shrink-0">{{ p.price }}</span>
                  </div>
                }
              </div>
            </div>

            <div class="px-7 py-4 flex items-start gap-5">
              <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 w-[110px] shrink-0 pt-0.5">Audience</span>
              <div class="flex-1 min-w-0">
                @if (editing() === 'audience') {
                  <input class="input !py-2" [(ngModel)]="draftAudience"
                    (keyup.enter)="save('audience')" (blur)="save('audience')">
                } @else {
                  <p class="text-sm text-navy font-body m-0">{{ b().audience }}</p>
                }
              </div>
              <button (click)="startEdit('audience')"
                class="text-xs text-gray-400 hover:text-accent font-body bg-transparent border-0 cursor-pointer shrink-0">Edit</button>
            </div>

            <div class="px-7 py-4 flex items-start gap-5">
              <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 w-[110px] shrink-0 pt-0.5">Geography</span>
              <div class="flex-1">
                <p class="text-sm text-navy font-body m-0">{{ b().geography }}</p>
              </div>
            </div>

            <div class="px-7 py-4 flex items-start gap-5">
              <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400 w-[110px] shrink-0 pt-0.5">Trust signals</span>
              <div class="flex-1 flex flex-wrap gap-1.5">
                @for (t of b().trustSignals; track t) {
                  <span class="text-xs text-gray-600 font-body bg-[#F7F8FA] border border-divider px-2.5 py-1 rounded-full">{{ t }}</span>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Persistence. Without this line the table reads as a one-off setup
             step; with it, it reads as the memory every later answer is built on. -->
        <div class="mb-5 px-5 py-4 rounded-card border border-accent/20 bg-accent-light/40">
          <p class="text-[11px] font-mono uppercase tracking-wider text-accent m-0 mb-1.5">
            Cosmisk keeps this
          </p>
          <p class="text-sm text-navy font-body m-0 leading-relaxed">
            This understanding is stored and reused. When Cosmisk reads your ad account, it judges
            every creative, price and audience against what it knows here — not against a generic
            benchmark. You can correct it at any time, and the findings change with it.
          </p>
        </div>

        @if (corrected()) {
          <div class="mb-5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 animate-scale-in">
            <lucide-icon name="check" [size]="16" class="text-emerald-600 shrink-0"></lucide-icon>
            <p class="text-sm text-emerald-800 font-body m-0">
              Updated. Cosmisk will use your version.
            </p>
          </div>
        }

        <button (click)="confirm()" class="btn-primary w-full !rounded-xl !py-3 !text-[15px]">
          This is right — continue <lucide-icon name="arrow-right" [size]="16"></lucide-icon>
        </button>

        <p class="text-[11px] font-mono uppercase tracking-wider text-gray-400 text-center mt-6 mb-0">
          Prototype — extraction is pre-filled, not live. Fields are editable.
        </p>
      }
    </div>
  `,
})
export default class ProtoDiscoveryComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  state = inject(ProtoStateService);

  scanning = signal(true);
  scanProgress = signal(0);
  editing = signal<string | null>(null);
  corrected = signal(false);

  draftName = signal('');
  draftCategory = signal('');
  draftPositioning = signal('');
  draftAudience = signal('');

  private timers: any[] = [];

  b = this.state.brand;

  ngOnInit() {
    this.timers.push(setTimeout(() => this.scanProgress.set(100), 60));
    this.timers.push(setTimeout(() => this.scanning.set(false), 2200));
  }

  ngOnDestroy() {
    this.timers.forEach(clearTimeout);
  }

  startEdit(field: string) {
    const b = this.b();
    this.draftName.set(b.name);
    this.draftCategory.set(b.category);
    this.draftPositioning.set(b.positioning);
    this.draftAudience.set(b.audience);
    this.editing.set(field);
  }

  save(field: string) {
    if (this.editing() !== field) return;
    const map: Record<string, string> = {
      name: this.draftName(),
      category: this.draftCategory(),
      positioning: this.draftPositioning(),
      audience: this.draftAudience(),
    };
    const value = (map[field] || '').trim();
    if (value) {
      this.state.patchBrand({ [field]: value } as any);
      this.corrected.set(true);
    }
    this.editing.set(null);
  }

  confirm() {
    this.router.navigate(['/proto/processing']);
  }
}
