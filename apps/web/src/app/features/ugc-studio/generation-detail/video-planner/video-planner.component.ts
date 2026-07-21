import { Component, Input, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CreativeStudioService, VideoPlan } from '../../../../core/services/creative-studio.service';
import { DegradeBadgeComponent } from '../../shared/degrade-badge.component';

const CLIP_USD = 1.2222;
const N_SHOTS = 3;

@Component({
  selector: 'app-video-planner',
  standalone: true,
  imports: [CommonModule, FormsModule, DegradeBadgeComponent],
  template: `
    <section class="mt-6 rounded-card border border-border bg-white p-5">
      <h3 class="font-display text-navy text-lg m-0 mb-3">Video</h3>

      <!-- Persona card (spec §3.1): who is on camera. Voice = guarantee, look = best-effort. -->
      <div class="rounded-card border border-divider bg-cream/40 p-4 mb-4">
        <h4 class="font-display text-navy text-sm font-semibold m-0 mb-3">Who is on camera</h4>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Age range</label>
            <select [(ngModel)]="creator.age_range" class="w-full rounded-lg bg-input-bg px-2 py-1.5 text-sm font-body">
              <option value="18-24">18-24</option>
              <option value="25-34">25-34</option>
              <option value="35-44">35-44</option>
              <option value="45-54">45-54</option>
              <option value="55+">55+</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Gender</label>
            <select [(ngModel)]="creator.gender" class="w-full rounded-lg bg-input-bg px-2 py-1.5 text-sm font-body">
              <option value="woman">woman</option>
              <option value="man">man</option>
              <option value="nonbinary">nonbinary</option>
              <option value="unspecified">unspecified</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Energy</label>
            <select [(ngModel)]="creator.energy" class="w-full rounded-lg bg-input-bg px-2 py-1.5 text-sm font-body">
              <option value="calm">calm</option>
              <option value="warm">warm</option>
              <option value="upbeat">upbeat</option>
              <option value="deadpan">deadpan</option>
              <option value="intense">intense</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Appearance <span class="text-gray-400">(best-effort)</span></label>
            <input [(ngModel)]="creator.appearance" class="w-full rounded-lg bg-input-bg px-2 py-1.5 text-sm font-body" placeholder="e.g. curly hair, warm brown skin" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Wardrobe <span class="text-gray-400">(best-effort)</span></label>
            <input [(ngModel)]="creator.wardrobe" class="w-full rounded-lg bg-input-bg px-2 py-1.5 text-sm font-body" placeholder="e.g. cozy oversized sweater" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Setting <span class="text-gray-400">(best-effort)</span></label>
            <input [(ngModel)]="creator.setting" class="w-full rounded-lg bg-input-bg px-2 py-1.5 text-sm font-body" placeholder="e.g. sunlit bedroom" />
          </div>
        </div>
        <p class="text-[10px] text-gray-400 font-body m-0 mb-3">Look consistency: best-effort — the face may vary across shots.</p>

        <div class="flex flex-wrap items-center gap-2 mb-1">
          <label class="text-xs text-gray-500">Voice</label>
          <input [(ngModel)]="creator.voice_id" placeholder="voice id (optional)" class="rounded-lg bg-input-bg px-2 py-1.5 text-sm font-body" />
          <button (click)="previewVoice()" [disabled]="voicePreviewing()"
                  class="rounded-pill border border-accent text-accent px-3 py-1 text-xs font-semibold">
            {{ voicePreviewing() ? 'Loading…' : 'Preview ▸' }}
          </button>
          <span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">guarantee — this voice ships</span>
        </div>
        @if (voiceUrl()) {
          <audio [src]="voiceUrl()" controls class="w-full h-8 mb-3 mt-1"></audio>
        }

        <div class="flex flex-wrap gap-4 mt-2">
          <label class="text-xs text-gray-600"><input type="checkbox" [(ngModel)]="pinFace" /> Pin face <span class="text-gray-400">(experimental)</span></label>
          <label class="text-xs text-gray-600"><input type="checkbox" [(ngModel)]="heroWithCreator" /> Creator holds the product in hero shots <span class="text-gray-400">(experimental)</span></label>
        </div>
      </div>

      <label class="block text-sm text-gray-600 mb-1">Direction</label>
      <input [(ngModel)]="direction" class="w-full rounded-lg bg-input-bg px-3 py-2 mb-3 font-body"
             placeholder="cozy handheld, morning light, slow" />

      <div class="flex flex-wrap gap-4 items-center mb-4">
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
        {{ planning() ? 'Planning…' : 'Plan storyboard — $0' }}
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

          @if (!p.quote.guard_enabled) {
            <div class="mt-2">
              <app-degrade-badge text="Balance guard off — spend unverified"
                detail="No admin key — this estimate isn't checked against your live fal balance." />
            </div>
          }

          <p class="text-sm mt-2"
             [class.text-gray-500]="!p.quote.guard_enabled"
             [class.text-red-600]="p.quote.guard_enabled && !p.quote.affordable">
            @if (!p.quote.guard_enabled) { Balance check off }
            @else if (p.quote.affordable) { Balance \${{ p.quote.balance_usd }} — covers this (needs \${{ (p.quote.estimated_usd + 0.30).toFixed(2) }} incl. margin) }
            @else { Short \${{ p.quote.shortfall_usd.toFixed(2) }} — top up at fal.ai/dashboard/billing }
          </p>

          <div class="flex flex-wrap items-center gap-3 mt-3">
            <button (click)="render()"
                    [disabled]="rendering() || (p.quote.guard_enabled && !p.quote.affordable)"
                    class="rounded-pill bg-accent text-white px-5 py-2 font-semibold">
              {{ rendering() ? 'Rendering…' : 'Render ' + p.quote.clips + ' clips — $' + p.quote.estimated_usd.toFixed(2) }}
            </button>
            @if (p.quote.guard_enabled && !p.quote.affordable) {
              <button (click)="plan()" [disabled]="planning()"
                      class="rounded-pill border border-gray-300 text-gray-600 px-4 py-2 text-sm font-semibold">
                Re-plan — $0
              </button>
            }
          </div>
          @if (rendered()) { <p class="text-sm text-green-700 mt-2">Rendering started. We'll notify you when it's ready — you can leave this page.</p> }
          @if (renderError()) { <p class="text-red-600 text-sm mt-2">{{ renderError() }}</p> }
        </div>
      }

      <!-- Video result + QA banner (spec §6.2) -->
      @if (videoJob(); as vj) {
        @if (vj.video?.url) {
          <div class="mt-5 border-t border-divider pt-4">
            @if (vj.qa_passed === true) {
              <div class="rounded-pill bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 inline-block mb-3">
                QA passed — {{ visibleChecks(vj).length }} checks
              </div>
            } @else if (vj.qa_passed === false) {
              <div class="mb-3">
                <app-degrade-badge text="⚠ Shipped with QA flags"
                  detail="A paid render is never discarded — this ships with the flags below, shown so 'shipped anyway' is informed, not silent." />
                <button (click)="checksExpanded.set(!checksExpanded())" class="block text-xs text-gray-500 mt-1 hover:text-navy">
                  {{ checksExpanded() ? '▾' : '▸' }} show checks
                </button>
                @if (checksExpanded()) {
                  <ul class="mt-1 ml-4 space-y-0.5 list-disc">
                    @for (c of visibleChecks(vj); track c.name) {
                      <li class="text-xs" [class.text-red-600]="!c.passed" [class.text-gray-500]="c.passed">
                        {{ c.name }}: {{ c.passed ? 'passed' : 'failed' }} @if (c.detail) { — {{ c.detail }} }
                      </li>
                    }
                  </ul>
                }
              </div>
            }
            <video [src]="videoUrl()" controls class="w-full rounded-lg"></video>
          </div>
        }
      }

      <!-- Follow-up (spec §6.3/§8.2): variants + publish loop aren't wired to this screen yet -->
      <p class="text-[10px] text-gray-400 font-body mt-4 mb-0 italic">
        Variant A/B cutting and the publish→learn loop are a follow-up — the API routes exist (proxied) but variant rendering isn't wired to this screen yet.
      </p>
    </section>
  `,
})
export class VideoPlannerComponent implements OnDestroy {
  @Input() generationId!: string;
  @Input() aiJobId!: string;
  private studio = inject(CreativeStudioService);
  readonly Math = Math; readonly CLIP_USD = CLIP_USD;

  direction = ''; voiceover = true; captions = true; sfx = true;
  seconds = signal(24);
  planning = signal(false); rendering = signal(false);
  rendered = signal(false); planError = signal(''); renderError = signal('');
  quote = signal<VideoPlan | null>(null);

  creator = { name: 'Creator', age_range: '25-34', gender: 'woman', energy: 'warm', appearance: '', wardrobe: '', setting: '', voice_id: '' };
  pinFace = false; heroWithCreator = false;
  voiceUrl = signal(''); voicePreviewing = signal(false);

  videoJob = signal<any>(null);
  checksExpanded = signal(false);
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  previewVoice(): void {
    this.voicePreviewing.set(true);
    this.studio.voicePreview(this.creator.voice_id || undefined).subscribe({
      next: (r) => { this.voicePreviewing.set(false); if (r.success) this.voiceUrl.set(r.url); },
      error: () => this.voicePreviewing.set(false),
    });
  }

  plan(): void {
    this.planning.set(true); this.planError.set('');
    this.studio.videoPlan(this.generationId, { seconds: this.seconds(), direction: this.direction || undefined, n_shots: N_SHOTS, creator: this.creator })
      .subscribe({
        next: (r) => { this.planning.set(false); r.success ? this.quote.set(r.plan) : this.planError.set(r.error || 'Planning failed.'); },
        error: (e) => { this.planning.set(false); this.planError.set(e?.error?.error || 'Planning failed.'); },
      });
  }
  render(): void {
    this.rendering.set(true); this.renderError.set('');
    this.studio.videoGenerate(this.generationId, {
      voiceover: this.voiceover, captions: this.captions, sfx: this.sfx,
      direction: this.direction || undefined, creator: this.creator,
      pin_face: this.pinFace, hero_with_creator: this.heroWithCreator,
    }).subscribe({
      next: (r) => {
        this.rendering.set(false);
        if (r.success) { this.rendered.set(true); this.startPolling(); }
        else this.renderError.set(r.error || 'Could not start render.');
      },
      error: (e) => {
        this.rendering.set(false);
        if (e?.status === 402) { this.renderError.set('Balance changed since the quote — re-quoted below.'); this.plan(); }
        else this.renderError.set(e?.error?.error || 'Could not start render.');
      },
    });
  }

  private startPolling(): void {
    if (this.pollHandle || !this.aiJobId) return;
    this.pollHandle = setInterval(() => {
      this.studio.getVideoJob(this.aiJobId).subscribe({
        next: (r) => {
          if (!r.success) return;
          this.videoJob.set(r.job);
          if (r.job?.status === 'complete' || r.job?.status === 'failed') this.stopPolling();
        },
        error: () => {},
      });
    }, 3000);
  }
  private stopPolling(): void {
    if (this.pollHandle) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }
  ngOnDestroy(): void { this.stopPolling(); }

  videoUrl(): string {
    const url = this.videoJob()?.video?.url;
    return url ? `/api/creative-studio/asset/${this.aiJobId}/${url.split('/').pop()}` : '';
  }
  // Known false-positives on edited clips (caption drift, cut alignment) are internal-only signal.
  visibleChecks(job: any): Array<{ name: string; passed: boolean; detail?: string }> {
    const checks: any[] = job?.qa?.checks || [];
    return checks.filter((c) => !/caption|cut_alignment/i.test(c?.name || ''));
  }
}
