import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { UgcService } from '../../core/services/ugc.service';
import { MetaOAuthService } from '../../core/services/meta-oauth.service';
import { AdAccountService } from '../../core/services/ad-account.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  styles: [`
    @keyframes confetti-fall {
      0% { transform: translateY(-100%) rotate(0deg); opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }
    .confetti-piece {
      position: fixed;
      top: -10px;
      width: 10px;
      height: 10px;
      animation: confetti-fall 3s ease-in forwards;
      z-index: 50;
    }
    .confetti-piece:nth-child(1) { left: 10%; background: #6366F1; animation-delay: 0s; animation-duration: 2.5s; }
    .confetti-piece:nth-child(2) { left: 20%; background: #3498DB; animation-delay: 0.2s; animation-duration: 3s; border-radius: 50%; }
    .confetti-piece:nth-child(3) { left: 30%; background: #F39C12; animation-delay: 0.4s; animation-duration: 2.8s; }
    .confetti-piece:nth-child(4) { left: 40%; background: #2ECC71; animation-delay: 0.1s; animation-duration: 3.2s; border-radius: 50%; }
    .confetti-piece:nth-child(5) { left: 50%; background: #9B59B6; animation-delay: 0.3s; animation-duration: 2.6s; }
    .confetti-piece:nth-child(6) { left: 60%; background: #6366F1; animation-delay: 0.5s; animation-duration: 3.1s; border-radius: 50%; }
    .confetti-piece:nth-child(7) { left: 70%; background: #1ABC9C; animation-delay: 0.15s; animation-duration: 2.9s; }
    .confetti-piece:nth-child(8) { left: 80%; background: #F39C12; animation-delay: 0.35s; animation-duration: 2.7s; border-radius: 50%; }
    .confetti-piece:nth-child(9) { left: 90%; background: #3498DB; animation-delay: 0.25s; animation-duration: 3.3s; }
    .confetti-piece:nth-child(10) { left: 15%; background: #2ECC71; animation-delay: 0.45s; animation-duration: 2.4s; border-radius: 50%; }
    .confetti-piece:nth-child(11) { left: 35%; background: #9B59B6; animation-delay: 0.55s; animation-duration: 3s; }
    .confetti-piece:nth-child(12) { left: 55%; background: #6366F1; animation-delay: 0.6s; animation-duration: 2.8s; border-radius: 50%; }
  `],
  template: `
    <div class="w-full max-w-2xl mx-auto">
      <!-- Progress Bar -->
      @if (currentStep() <= 3) {
        <div class="mb-8">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-body font-medium text-gray-500">Step {{ currentStep() }} of 3</span>
            @if (currentStep() > 1) {
              <button (click)="prevStep()" class="text-sm text-accent hover:underline font-body border-0 bg-transparent cursor-pointer">
                ← Back
              </button>
            }
          </div>
          <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="h-full bg-accent rounded-full transition-all duration-500"
              [style.width.%]="(currentStep() / 3) * 100">
            </div>
          </div>
        </div>
      }

      <!-- Step 1: Brand Basics -->
      @if (currentStep() === 1) {
        <div class="animate-fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="building-2" [size]="32" class="text-accent"></lucide-icon>
            </div>
            <h2 class="text-page-title font-display text-navy mb-3">Tell us about your brand</h2>
            <p class="text-gray-600 font-body">We'll personalize your Cosmisk experience based on this.</p>
          </div>

          <div class="space-y-5">
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Brand Name <span class="text-red-500">*</span></label>
              <input type="text" [(ngModel)]="brand_name" class="input" placeholder="e.g. GlowVita">
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Website URL <span class="text-red-500">*</span></label>
              <input type="url" [(ngModel)]="website_url" class="input" placeholder="e.g. https://glowvita.com">
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Industry <span class="text-red-500">*</span></label>
              <select [(ngModel)]="industry" class="input">
                <option value="">Select your industry</option>
                <option value="Beauty & Skincare">Beauty & Skincare</option>
                <option value="Health & Wellness">Health & Wellness</option>
                <option value="Fashion & Apparel">Fashion & Apparel</option>
                <option value="Food & Beverage">Food & Beverage</option>
                <option value="Home & Living">Home & Living</option>
                <option value="Tech & Electronics">Tech & Electronics</option>
                <option value="Fitness & Sports">Fitness & Sports</option>
                <option value="Pet Care">Pet Care</option>
                <option value="Automotive">Automotive</option>
                <option value="Education">Education</option>
                <option value="Finance & Fintech">Finance & Fintech</option>
                <option value="SaaS & Software">SaaS & Software</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">What do you sell?</label>
              <textarea [(ngModel)]="product_feature" class="input !h-16 resize-none" placeholder="Brief description of your product or service"></textarea>
            </div>
          </div>

          <div class="text-center mt-8">
            <button (click)="submitBrand()" [disabled]="!brand_name || !website_url || !industry || submitting()"
              class="btn-primary !py-3 !px-8 disabled:opacity-50 disabled:cursor-not-allowed">
              @if (submitting()) {
                <span class="inline-flex items-center gap-2">
                  <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Setting up...
                </span>
              } @else {
                Continue →
              }
            </button>
          </div>
        </div>
      }

      <!-- Step 2: Connect Ad Account -->
      @if (currentStep() === 2) {
        <div class="animate-fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="bar-chart-3" [size]="32" class="text-accent"></lucide-icon>
            </div>
            <h2 class="text-page-title font-display text-navy mb-3">Connect your ad account</h2>
            <p class="text-gray-600 font-body">Link your Meta Ads account to unlock analytics, AI insights, and creative intelligence.</p>
          </div>

          <div class="space-y-4 max-w-sm mx-auto">
            <!-- Meta Ads -->
            <div class="border rounded-xl p-5 transition-all"
              [class]="metaOAuth.isConnected() ? 'border-green-300 bg-green-50/50' : 'border-gray-200 hover:border-accent/30'">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/></svg>
                  </div>
                  <div>
                    <p class="font-body font-semibold text-navy text-sm">Meta Ads</p>
                    @if (metaOAuth.isConnected()) {
                      <p class="text-xs text-green-600 font-body">{{ metaOAuth.connectedAccountCount() }} account(s) connected</p>
                    } @else {
                      <p class="text-xs text-gray-500 font-body">Facebook & Instagram Ads</p>
                    }
                  </div>
                </div>
                @if (metaOAuth.isConnected()) {
                  <lucide-icon name="check-circle-2" [size]="24" class="text-green-500"></lucide-icon>
                } @else if (metaOAuth.connectionStatus() === 'loading') {
                  <span class="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin"></span>
                } @else {
                  <button (click)="connectMeta()" class="px-4 py-1.5 bg-accent text-white text-xs font-body font-semibold rounded-full hover:bg-accent/90">
                    Connect
                  </button>
                }
              </div>
            </div>

            <!-- Google Ads (coming soon) -->
            <div class="border border-gray-200 rounded-xl p-5 opacity-60">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-white border border-gray-200 rounded-lg flex items-center justify-center">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" fill="#4285F4"/></svg>
                  </div>
                  <div>
                    <p class="font-body font-semibold text-navy text-sm">Google Ads</p>
                    <p class="text-xs text-gray-400 font-body">Coming soon</p>
                  </div>
                </div>
                <span class="text-xs text-gray-400 font-body bg-gray-100 px-2 py-1 rounded-full">Soon</span>
              </div>
            </div>

            <!-- TikTok Ads (coming soon) -->
            <div class="border border-gray-200 rounded-xl p-5 opacity-60">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48 6.3 6.3 0 001.83-4.47V8.73a8.26 8.26 0 004.76 1.5V6.79a4.83 4.83 0 01-1.01-.1z"/></svg>
                  </div>
                  <div>
                    <p class="font-body font-semibold text-navy text-sm">TikTok Ads</p>
                    <p class="text-xs text-gray-400 font-body">Coming soon</p>
                  </div>
                </div>
                <span class="text-xs text-gray-400 font-body bg-gray-100 px-2 py-1 rounded-full">Soon</span>
              </div>
            </div>
          </div>

          <div class="text-center mt-8 space-y-3">
            <button (click)="currentStep.set(3)"
              class="btn-primary !py-3 !px-8">
              @if (metaOAuth.isConnected()) {
                Continue →
              } @else {
                Skip for Now →
              }
            </button>
            @if (!metaOAuth.isConnected()) {
              <p class="text-xs text-gray-400 font-body">You can connect ad accounts anytime from Settings</p>
            }
          </div>
        </div>
      }

      <!-- Step 3: Add Competitors -->
      @if (currentStep() === 3) {
        <div class="animate-fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="search" [size]="32" class="text-accent"></lucide-icon>
            </div>
            <h2 class="text-page-title font-display text-navy mb-3">Who are your competitors?</h2>
            <p class="text-gray-600 font-body">We'll spy on their Meta ads and use their patterns to make your creatives smarter.</p>
          </div>

          <div class="space-y-3 max-w-sm mx-auto">
            @for (i of [0, 1, 2]; track i) {
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 font-mono w-5">{{ i + 1 }}.</span>
                <input
                  type="text"
                  [value]="competitors[i] || ''"
                  (input)="updateCompetitor(i, $event)"
                  class="input flex-1"
                  [placeholder]="i === 0 ? 'e.g. Mamaearth' : i === 1 ? 'e.g. mCaffeine' : 'e.g. Plum Goodness'">
              </div>
            }
            <p class="text-xs text-gray-400 font-body mt-2 text-center">
              Use the brand name as it appears on their Facebook page
            </p>
          </div>

          <div class="text-center mt-8 space-y-3">
            <button (click)="saveCompetitorsAndComplete()"
              [disabled]="savingCompetitors()"
              class="btn-primary !py-3 !px-8 disabled:opacity-50">
              @if (savingCompetitors()) {
                <span class="inline-flex items-center gap-2">
                  <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Saving...
                </span>
              } @else if (hasCompetitors()) {
                Save & Continue →
              } @else {
                Skip for Now →
              }
            </button>
          </div>
        </div>
      }

      <!-- Step 4: Success -->
      @if (currentStep() === 4) {
        <div class="text-center animate-fade-in py-12 relative">
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>

          <div class="mb-6"><lucide-icon name="sparkles" [size]="48" class="text-accent"></lucide-icon></div>
          <h2 class="text-page-title font-display text-navy mb-3">Welcome to Cosmisk!</h2>
          <p class="text-gray-600 font-body mb-2">Your brand <strong>{{ brand_name }}</strong> is all set up.</p>
          @if (metaOAuth.isConnected()) {
            <p class="text-gray-500 font-body text-sm mb-8">Your ad accounts are connected. Head to the dashboard to see your performance data.</p>
          } @else {
            <p class="text-gray-500 font-body text-sm mb-8">Connect your ad accounts from Settings to unlock full analytics and AI insights.</p>
          }
          <button (click)="goToDashboard()" class="btn-primary !py-3.5 !px-8 !text-base">Go to Dashboard</button>
        </div>
      }
    </div>
  `
})
export default class OnboardingComponent {
  private router = inject(Router);
  private auth = inject(AuthService);
  private ugc = inject(UgcService);
  private api = inject(ApiService);
  private adAccounts = inject(AdAccountService);
  private toast = inject(ToastService);
  metaOAuth = inject(MetaOAuthService);

  currentStep = signal(1);
  submitting = signal(false);
  savingCompetitors = signal(false);

  // Step 1: Brand Basics
  brand_name = '';
  website_url = '';
  industry = '';
  product_feature = '';

  // Step 3: Competitors
  competitors: string[] = ['', '', ''];

  prevStep() {
    this.currentStep.update(s => Math.max(1, s - 1));
  }

  submitBrand() {
    this.submitting.set(true);

    const user = this.auth.user();
    const payload = {
      client_name: user?.name || '',
      client_email: user?.email || '',
      brand_name: this.brand_name,
      website_url: this.website_url,
      product_feature: this.product_feature || this.industry,
      differentiator: '',
      target_user: '',
      biggest_problem: '',
      main_hesitation: '',
      social_proof: '',
      brand_personality: '',
      selling_proposition: '',
      credibility_point: '',
      competitors: '',
      best_concepts: '',
      reference_ads: '',
      do_not_say: '',
      additional_notes: `Industry: ${this.industry}`,
      num_scripts: 5,
      whatsapp_number: '',
    };

    this.ugc.onboardProject(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.currentStep.set(2);
        // Also save brand info to user profile
        this.api.post<any>(environment.SETTINGS_PROFILE, {
          brand_name: this.brand_name,
          website_url: this.website_url,
        }).subscribe();
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error('Setup failed', err.error?.error || 'Please try again.');
      },
    });
  }

  connectMeta() {
    this.metaOAuth.openOAuthPopup();
  }

  hasCompetitors(): boolean {
    return this.competitors.some(c => c.length > 0);
  }

  updateCompetitor(index: number, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.competitors[index] = value.trim();
  }

  saveCompetitorsAndComplete() {
    const validCompetitors = this.competitors.filter(c => c.length > 0);

    if (validCompetitors.length > 0) {
      this.savingCompetitors.set(true);
      this.api.post<any>('settings/profile', {
        competitors: validCompetitors,
      }).subscribe({
        next: () => {
          this.savingCompetitors.set(false);
          this.completeOnboarding();
        },
        error: () => {
          this.savingCompetitors.set(false);
          // Still complete even if save fails
          this.completeOnboarding();
        },
      });
    } else {
      this.completeOnboarding();
    }
  }

  completeOnboarding() {
    this.auth.setOnboardingComplete();
    if (this.metaOAuth.isConnected()) {
      this.adAccounts.loadAccounts();
    }
    this.currentStep.set(4);
  }

  goToDashboard() {
    this.router.navigate(['/app/dashboard']);
  }
}
