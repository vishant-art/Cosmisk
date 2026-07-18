import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CreativeStudioService, VideoPlan } from '../../../../core/services/creative-studio.service';

const CLIP_USD = 1.2222;

@Component({
  selector: 'app-video-planner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="mt-6 rounded-card border border-border bg-white p-5">
      <h3 class="font-display text-navy text-lg m-0 mb-3">Video</h3>

      <label class="block text-sm text-gray-600 mb-1">Direction</label>
      <input [(ngModel)]="direction" class="w-full rounded-lg bg-input-bg px-3 py-2 mb-3 font-body"
             placeholder="cozy handheld, morning light, slow" />

      <div class="flex flex-wrap gap-4 items-center mb-4">
        <span class="text-sm">Shots
          <button (click)="nShots.set(Math.max(1, nShots() - 1))" class="px-2">−</button>
          <span class="font-mono">{{ nShots() }}</span>
          <button (click)="nShots.set(Math.min(12, nShots() + 1))" class="px-2">+</button>
        </span>
        <span class="text-sm">Seconds
          <button (click)="seconds.set(Math.max(6, seconds() - 6))" class="px-2">−</button>
          <span class="font-mono">{{ seconds() }}</span>
          <button (click)="seconds.set(Math.min(90, seconds() + 6))" class="px-2">+</button>
        </span>
        <label class="text-sm"><input type="checkbox" [(ngModel)]="voiceover" /> Voiceover</label>
        <label class="text-sm"><input type="checkbox" [(ngModel)]="captions" /> Captions</label>
        <label class="text-sm"><input type="checkbox" [(ngModel)]="sfx" /> SFX</label>
      </div>

      <button (click)="plan()" [disabled]="planning()"
              class="rounded-pill border border-accent text-accent px-4 py-2 font-semibold">
        {{ planning() ? 'Planning…' : 'Plan it · free' }}
      </button>

      @if (planError()) { <p class="text-red-600 text-sm mt-2">{{ planError() }}</p> }

      @if (quote(); as p) {
        <div class="mt-5 border-t border-divider pt-4">
          <div class="flex justify-between text-xs text-gray-500 mb-2">
            <span>STORYBOARD</span><span>{{ p.duration_s }}s · {{ p.grounded ? 'grounded' : 'brief-only' }}</span>
          </div>
          @for (s of p.storyboard.shots; track $index) {
            <div class="flex justify-between py-1 text-sm">
              <span><span class="font-mono text-gray-400 mr-2">{{ ($index + 1).toString().padStart(2,'0') }}</span>{{ s.title || s.description || 'Shot' }}</span>
              <span class="font-mono">\${{ CLIP_USD.toFixed(4) }}</span>
            </div>
          }
          <div class="flex justify-between border-t border-divider mt-2 pt-2 font-semibold">
            <span>{{ p.quote.clips }} clips</span>
            <span class="font-mono">\${{ p.quote.estimated_usd.toFixed(2) }}</span>
          </div>

          <p class="text-sm mt-2"
             [class.text-gray-500]="!p.quote.guard_enabled"
             [class.text-red-600]="p.quote.guard_enabled && !p.quote.affordable">
            @if (!p.quote.guard_enabled) { Balance check off }
            @else if (p.quote.affordable) { Balance \${{ p.quote.balance_usd }} — covers this (needs \${{ (p.quote.estimated_usd + 0.30).toFixed(2) }} incl. margin) }
            @else { Short \${{ p.quote.shortfall_usd.toFixed(2) }} — top up at fal.ai/dashboard/billing }
          </p>

          <button (click)="render()"
                  [disabled]="rendering() || (p.quote.guard_enabled && !p.quote.affordable)"
                  class="mt-3 rounded-pill bg-accent text-white px-5 py-2 font-semibold">
            {{ rendering() ? 'Rendering…' : 'Render ' + p.quote.clips + ' clips — $' + p.quote.estimated_usd.toFixed(2) }}
          </button>
          @if (rendered()) { <p class="text-sm text-green-700 mt-2">Rendering started. We'll notify you when it's ready — you can leave this page.</p> }
          @if (renderError()) { <p class="text-red-600 text-sm mt-2">{{ renderError() }}</p> }
        </div>
      }
    </section>
  `,
})
export class VideoPlannerComponent {
  @Input() generationId!: string;
  private studio = inject(CreativeStudioService);
  readonly Math = Math; readonly CLIP_USD = CLIP_USD;

  direction = ''; voiceover = true; captions = true; sfx = true;
  nShots = signal(3); seconds = signal(24);
  planning = signal(false); rendering = signal(false);
  rendered = signal(false); planError = signal(''); renderError = signal('');
  quote = signal<VideoPlan | null>(null);

  plan(): void {
    this.planning.set(true); this.planError.set('');
    this.studio.videoPlan(this.generationId, { seconds: this.seconds(), direction: this.direction || undefined, n_shots: this.nShots() })
      .subscribe({
        next: (r) => { this.planning.set(false); r.success ? this.quote.set(r.plan) : this.planError.set(r.error || 'Planning failed.'); },
        error: (e) => { this.planning.set(false); this.planError.set(e?.error?.error || 'Planning failed.'); },
      });
  }
  render(): void {
    this.rendering.set(true); this.renderError.set('');
    this.studio.videoGenerate(this.generationId, { voiceover: this.voiceover, captions: this.captions, sfx: this.sfx })
      .subscribe({
        next: (r) => { this.rendering.set(false); r.success ? this.rendered.set(true) : this.renderError.set(r.error || 'Could not start render.'); },
        error: (e) => { this.rendering.set(false); this.renderError.set(e?.error?.error || 'Could not start render.'); },
      });
  }
}
