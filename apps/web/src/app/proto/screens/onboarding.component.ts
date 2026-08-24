import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ProtoStateService } from '../proto-state.service';

/**
 * PROTOTYPE — Blueprint §7.
 * Cut from 4 steps to 2.
 *
 * The step-4 confetti screen was removed: it celebrated the user typing, not
 * Cosmisk discovering anything. The real celebration is the first finding.
 *
 * Brand name and monthly spend were also removed. Cosmisk reads the brand name
 * off the website and the spend off the Meta account — asking the user to type
 * facts the product is about to discover teaches them it is a form, not an
 * analyst. The website URL is the one thing it genuinely cannot infer.
 *
 * Step 1 is deliberately not a form — it answers "what does this do, what does
 * it need, what do I get" before asking for anything.
 */
@Component({
  selector: 'proto-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="w-full max-w-[560px] animate-fade-in">

      <!-- Progress -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-2.5">
          <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">
            Step {{ step() }} of 2
          </span>
          <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">
            One question
          </span>
        </div>
        <div class="h-1 bg-gray-200 rounded-full overflow-hidden">
          <div class="h-full bg-accent rounded-full transition-all duration-500"
            [style.width.%]="(step() / 2) * 100"></div>
        </div>
      </div>

      <div class="card !p-8">

        <!-- STEP 1 — what this is -->
        @if (step() === 1) {
          <div class="animate-fade-in">
            <h1 class="text-2xl font-display font-bold text-navy mb-2">
              Cosmisk reads your ad account and tells you the one thing that matters today.
            </h1>
            <p class="text-body text-gray-500 mb-7">
              Not another dashboard. It looks at what you are spending, finds what is quietly
              losing money, and explains why.
            </p>

            <div class="space-y-3 mb-8">
              <div class="flex gap-3.5 p-4 rounded-xl bg-[#F7F8FA] border border-divider">
                <div class="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center shrink-0">
                  <lucide-icon name="link" [size]="15" class="text-accent"></lucide-icon>
                </div>
                <div>
                  <p class="text-sm font-body font-semibold text-navy m-0 mb-0.5">What it needs</p>
                  <p class="text-sm text-gray-500 font-body m-0">
                    Your website address, and a connection to your Meta ad account.
                  </p>
                </div>
              </div>

              <div class="flex gap-3.5 p-4 rounded-xl bg-[#F7F8FA] border border-divider">
                <div class="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center shrink-0">
                  <lucide-icon name="target" [size]="15" class="text-accent"></lucide-icon>
                </div>
                <div>
                  <p class="text-sm font-body font-semibold text-navy m-0 mb-0.5">What you get</p>
                  <p class="text-sm text-gray-500 font-body m-0">
                    One specific finding with the numbers behind it, and what to do about it.
                  </p>
                </div>
              </div>

              <div class="flex gap-3.5 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <div class="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                  <lucide-icon name="shield" [size]="15" class="text-emerald-600"></lucide-icon>
                </div>
                <div>
                  <p class="text-sm font-body font-semibold text-navy m-0 mb-0.5">Who makes the change</p>
                  <p class="text-sm text-gray-600 font-body m-0">
                    You do. Cosmisk finds the problem and tells you exactly what to do —
                    every edit happens in your Ads Manager, by you.
                  </p>
                </div>
              </div>
            </div>

            <button (click)="next()" class="btn-primary w-full !rounded-xl !py-3 !text-[15px]">
              Get started <lucide-icon name="arrow-right" [size]="16"></lucide-icon>
            </button>
          </div>
        }

        <!-- STEP 2 — the one thing Cosmisk cannot infer -->
        @if (step() === 2) {
          <div class="animate-fade-in">
            <h1 class="text-2xl font-display font-bold text-navy mb-2">
              What is your store's website address?
            </h1>
            <p class="text-body text-gray-500 mb-7">
              One address. Cosmisk reads it and works out the rest — your brand name, what you sell,
              who buys it — and shows you what it found before it goes any further.
            </p>

            <div class="mb-7">
              <label class="block text-sm font-body font-medium text-navy mb-1.5">Store website</label>
              <div class="relative">
                <span class="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-mono">https://</span>
                <input class="input !rounded-xl !py-3 !pl-[80px]" [(ngModel)]="websiteInput"
                  (keyup.enter)="finish()" placeholder="nectarsupplements.in">
              </div>
              @if (urlTouched() && !urlValid()) {
                <p class="text-xs text-red-500 mt-1.5 m-0 flex items-center gap-1">
                  <lucide-icon name="info" [size]="12"></lucide-icon>
                  That does not look like a website address
                </p>
              }
            </div>

            <div class="flex gap-3.5 p-4 rounded-xl bg-[#F7F8FA] border border-divider mb-7">
              <div class="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center shrink-0">
                <lucide-icon name="scan-eye" [size]="15" class="text-accent"></lucide-icon>
              </div>
              <div>
                <p class="text-sm font-body font-semibold text-navy m-0 mb-0.5">Not asking for your budget</p>
                <p class="text-sm text-gray-500 font-body m-0">
                  Cosmisk reads what you actually spend from Meta. Asking you to estimate it would
                  only give it a worse number than the one it already has.
                </p>
              </div>
            </div>

            <!-- What Cosmisk connects to, and in what order. Stated so the user
                 knows the website is the first source and not the only one —
                 without building any of these flows in Slice 1. -->
            <div class="mb-7 px-4 py-3 rounded-xl border border-divider">
              <p class="text-[11px] font-mono uppercase tracking-wider text-gray-400 m-0 mb-2">
                Where Cosmisk's understanding comes from
              </p>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm font-body">
                <span class="text-navy font-medium">Your website</span>
                <span class="text-[11px] font-mono uppercase tracking-wider text-emerald-700">now</span>
                <span class="text-gray-300">→</span>
                <span class="text-navy font-medium">Meta ad account</span>
                <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">next step</span>
                <span class="text-gray-300">→</span>
                <span class="text-gray-400">More sources</span>
                <span class="text-[11px] font-mono uppercase tracking-wider text-gray-400">later</span>
              </div>
            </div>

            <div class="flex gap-3">
              <button (click)="back()" class="btn-secondary !rounded-xl !py-3 px-6">Back</button>
              <button (click)="finish()" [disabled]="!urlValid()"
                class="btn-primary flex-1 !rounded-xl !py-3 !text-[15px]">
                Read my website <lucide-icon name="arrow-right" [size]="16"></lucide-icon>
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export default class ProtoOnboardingComponent {
  private router = inject(Router);
  private state = inject(ProtoStateService);

  step = signal(1);
  websiteInput = signal('nectarsupplements.in');
  urlTouched = signal(false);

  urlValid = computed(() => /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(this.websiteInput().trim()));

  next() {
    this.step.update((s) => Math.min(2, s + 1));
  }

  back() {
    this.step.update((s) => Math.max(1, s - 1));
  }

  finish() {
    this.urlTouched.set(true);
    if (!this.urlValid()) return;
    const website = this.websiteInput().trim();
    this.state.websiteUrl.set(website);
    this.state.patchBrand({ website });
    this.router.navigate(['/proto/connect']);
  }
}
