import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ProtoStateService } from '../proto-state.service';

/**
 * PROTOTYPE — Blueprint §8.
 *
 * META PERMISSIONS ARE OUT OF SCOPE FOR THIS PROTOTYPE — deliberately.
 *
 * The blueprint specified the reassurance line "✗ Never edits, pauses or spends".
 * The shipped OAuth request at apps/web/src/app/core/services/meta-oauth.service.ts:62
 * asks for `ads_read,ads_management,business_management,pages_read_engagement`, and
 * `ads_management` is a WRITE scope — so that line is not safe to print today.
 *
 * Rather than design a permission-disclosure UI (which is a separate project with
 * its own legal review), this screen uses neutral language: it says what Cosmisk
 * DOES, never what it CANNOT do. No claim here depends on the scope list, so this
 * copy stays true whichever way the permission decision goes. The contradiction is
 * escalated in the report, not resolved in the prototype.
 */
@Component({
  selector: 'proto-connect',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="w-full max-w-[880px] animate-fade-in">

      <div class="text-center mb-9">
        <h1 class="text-page-title font-display text-navy mb-2">
          Point Cosmisk at your ad account
        </h1>
        <p class="text-body text-gray-500 max-w-[520px] mx-auto">
          It needs 30 days of history to find anything worth telling you. If you would rather
          look around first, use the sample account.
        </p>
      </div>

      <div class="grid md:grid-cols-2 gap-5 items-start">

        <!-- PRIMARY — connect real -->
        <div class="card !p-7 border-2 !border-accent relative">
          <span class="absolute -top-2.5 left-7 px-2.5 py-0.5 bg-accent text-white text-[10px]
            font-mono uppercase tracking-wider rounded-full">Recommended</span>

          <div class="w-11 h-11 rounded-xl bg-[#1877F2] flex items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96H15.83c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/>
            </svg>
          </div>

          <h2 class="text-card-title font-display text-navy mb-1.5">Connect Meta Ads</h2>
          <p class="text-sm text-gray-500 font-body mb-5">
            Your real campaigns, your real numbers. This is the only way the findings are about
            your business.
          </p>

          <div class="space-y-2.5 mb-6">
            <div class="flex items-start gap-2.5">
              <lucide-icon name="check" [size]="15" class="text-emerald-600 shrink-0 mt-0.5"></lucide-icon>
              <span class="text-sm text-gray-600 font-body">Cosmisk reads spend, revenue and creative performance</span>
            </div>
            <div class="flex items-start gap-2.5">
              <lucide-icon name="check" [size]="15" class="text-emerald-600 shrink-0 mt-0.5"></lucide-icon>
              <span class="text-sm text-gray-600 font-body">You make every change yourself, in your Ads Manager</span>
            </div>
            <div class="flex items-start gap-2.5">
              <lucide-icon name="check" [size]="15" class="text-emerald-600 shrink-0 mt-0.5"></lucide-icon>
              <span class="text-sm text-gray-600 font-body">You can disconnect at any time from Settings</span>
            </div>
          </div>

          <p class="text-xs text-gray-400 font-body mb-6 leading-relaxed">
            Meta will show you exactly which permissions it is granting before you approve.
          </p>

          <button (click)="connectMeta()" [disabled]="connecting()"
            class="btn-primary w-full !rounded-xl !py-3 !text-[15px]">
            @if (connecting()) {
              <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block"></span>
              Opening Meta…
            } @else {
              Connect Meta Ads <lucide-icon name="arrow-right" [size]="16"></lucide-icon>
            }
          </button>
        </div>

        <!-- SECONDARY — demo -->
        <div class="card !p-7">
          <div class="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
            <lucide-icon name="play" [size]="20" class="text-amber-700"></lucide-icon>
          </div>

          <h2 class="text-card-title font-display text-navy mb-1.5">Explore the sample account</h2>
          <p class="text-sm text-gray-500 font-body mb-5">
            A fictional supplements brand with 42 days of invented history. Nothing here is real,
            and none of it is anyone's actual data.
          </p>

          <div class="space-y-2.5 mb-6">
            <div class="flex items-start gap-2.5">
              <lucide-icon name="check" [size]="15" class="text-gray-400 shrink-0 mt-0.5"></lucide-icon>
              <span class="text-sm text-gray-600 font-body">See exactly what a finding looks like</span>
            </div>
            <div class="flex items-start gap-2.5">
              <lucide-icon name="check" [size]="15" class="text-gray-400 shrink-0 mt-0.5"></lucide-icon>
              <span class="text-sm text-gray-600 font-body">No account access required</span>
            </div>
            <div class="flex items-start gap-2.5">
              <lucide-icon name="x" [size]="15" class="text-gray-400 shrink-0 mt-0.5"></lucide-icon>
              <span class="text-sm text-gray-600 font-body">The findings are about a made-up brand, not yours</span>
            </div>
          </div>

          <div class="mb-6 p-3.5 rounded-xl bg-amber-50 border border-amber-200">
            <p class="text-xs text-amber-800 font-body m-0 leading-relaxed">
              Everything in sample mode is labelled. You can connect your real account whenever
              you want — the sample data is thrown away, never blended with yours.
            </p>
          </div>

          <button (click)="exploreDemo()" class="btn-secondary w-full !rounded-xl !py-3 !text-[15px]">
            Explore sample account
          </button>
        </div>
      </div>

      <!-- Prototype note -->
      <div class="mt-7 text-center">
        <p class="text-[11px] font-mono uppercase tracking-wider text-gray-400 m-0">
          Prototype — both buttons lead to the same simulated data. No OAuth window opens.
        </p>
      </div>
    </div>
  `,
})
export default class ProtoConnectComponent {
  private router = inject(Router);
  private state = inject(ProtoStateService);

  connecting = signal(false);

  connectMeta() {
    // PROTOTYPE: no OAuth. Simulates the round trip only.
    this.connecting.set(true);
    setTimeout(() => {
      this.connecting.set(false);
      this.state.setDemo(false);
      this.router.navigate(['/proto/discovery']);
    }, 1100);
  }

  exploreDemo() {
    this.state.setDemo(true);
    this.router.navigate(['/proto/discovery']);
  }
}
