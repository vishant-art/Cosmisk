import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { UgcService } from '../../core/services/ugc.service';
import { ToastService } from '../../core/services/toast.service';
import { LucideAngularModule } from 'lucide-angular';

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
    .confetti-piece:nth-child(13) { left: 75%; background: #F39C12; animation-delay: 0.1s; animation-duration: 3.4s; }
    .confetti-piece:nth-child(14) { left: 85%; background: #1ABC9C; animation-delay: 0.4s; animation-duration: 2.5s; border-radius: 50%; }
    .confetti-piece:nth-child(15) { left: 45%; background: #3498DB; animation-delay: 0.7s; animation-duration: 3.2s; }
  `],
  template: `
    <div class="w-full max-w-2xl mx-auto">
      <!-- Progress Bar -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-body font-medium text-gray-500">Step {{ currentStep() }} of 4</span>
          @if (currentStep() > 1 && currentStep() <= 4) {
            <button (click)="prevStep()" class="text-sm text-accent hover:underline font-body border-0 bg-transparent cursor-pointer">
              ← Back
            </button>
          }
        </div>
        <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="h-full bg-accent rounded-full transition-all duration-500"
            [style.width.%]="currentStep() <= 4 ? currentStep() * 25 : 100">
          </div>
        </div>
      </div>

      <!-- Step 1: Brand & Product -->
      @if (currentStep() === 1) {
        <div class="animate-fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="building-2" [size]="32" class="text-accent"></lucide-icon>
            </div>
            <h2 class="text-page-title font-display text-navy mb-3">Tell us about your brand</h2>
            <p class="text-gray-600 font-body">We'll use this to create your UGC project and start research.</p>
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
              <label class="block text-sm font-body font-medium text-navy mb-1">Product / Service to Promote <span class="text-red-500">*</span></label>
              <textarea [(ngModel)]="product_feature" class="input !h-20 resize-none" placeholder="What product or service do you want UGC ads for?"></textarea>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">What makes you different?</label>
              <textarea [(ngModel)]="differentiator" class="input !h-20 resize-none" placeholder="Your unique selling point vs competitors"></textarea>
            </div>
          </div>

          <div class="text-center mt-8">
            <button (click)="nextStep()" [disabled]="!brand_name || !website_url || !product_feature"
              class="btn-primary !py-3 !px-8 disabled:opacity-50 disabled:cursor-not-allowed">
              Continue →
            </button>
          </div>
        </div>
      }

      <!-- Step 2: Target Audience -->
      @if (currentStep() === 2) {
        <div class="animate-fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="users" [size]="32" class="text-accent"></lucide-icon>
            </div>
            <h2 class="text-page-title font-display text-navy mb-3">Who are you selling to?</h2>
            <p class="text-gray-600 font-body">Understanding your audience helps us write scripts that convert.</p>
          </div>

          <div class="space-y-5">
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Target Audience</label>
              <textarea [(ngModel)]="target_user" class="input !h-20 resize-none" placeholder="e.g. Women 25-40, interested in skincare, mid-to-premium segment"></textarea>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Biggest Problem You Solve</label>
              <textarea [(ngModel)]="biggest_problem" class="input !h-20 resize-none" placeholder="What pain point does your product address?"></textarea>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Main Hesitation to Buy</label>
              <textarea [(ngModel)]="main_hesitation" class="input !h-16 resize-none" placeholder="Why do people hesitate before purchasing?"></textarea>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Social Proof</label>
              <textarea [(ngModel)]="social_proof" class="input !h-16 resize-none" placeholder="Reviews, ratings, testimonials, press mentions..."></textarea>
            </div>
          </div>

          <div class="text-center mt-8">
            <button (click)="nextStep()" [disabled]="!target_user"
              class="btn-primary !py-3 !px-8 disabled:opacity-50 disabled:cursor-not-allowed">Continue →</button>
          </div>
        </div>
      }

      <!-- Step 3: Brand Voice & Identity -->
      @if (currentStep() === 3) {
        <div class="animate-fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="palette" [size]="32" class="text-accent"></lucide-icon>
            </div>
            <h2 class="text-page-title font-display text-navy mb-3">Brand voice & positioning</h2>
            <p class="text-gray-600 font-body">This shapes the tone and style of your UGC scripts.</p>
          </div>

          <div class="space-y-5">
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Brand Personality</label>
              <textarea [(ngModel)]="brand_personality" class="input !h-16 resize-none" placeholder="e.g. Fun, approachable, science-backed, premium but not stuffy"></textarea>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Key Selling Proposition</label>
              <textarea [(ngModel)]="selling_proposition" class="input !h-16 resize-none" placeholder="The one thing you want every ad to communicate"></textarea>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Credibility / Trust Signal</label>
              <input type="text" [(ngModel)]="credibility_point" class="input" placeholder="e.g. Dermatologist-approved, 50,000+ happy customers">
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Competitors</label>
              <input type="text" [(ngModel)]="competitors" class="input" placeholder="e.g. WOW Skin Science, Oziva, mCaffeine">
            </div>
          </div>

          <div class="text-center mt-8">
            <button (click)="nextStep()" class="btn-primary !py-3 !px-8">Continue →</button>
          </div>
        </div>
      }

      <!-- Step 4: Project Setup -->
      @if (currentStep() === 4) {
        <div class="animate-fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 mx-auto mb-6 bg-accent/10 rounded-full flex items-center justify-center">
              <lucide-icon name="clapperboard" [size]="32" class="text-accent"></lucide-icon>
            </div>
            <h2 class="text-page-title font-display text-navy mb-3">Project details</h2>
            <p class="text-gray-600 font-body">Almost there! Just a few more details to get started.</p>
          </div>

          <div class="space-y-5">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-body font-medium text-navy mb-1">Number of Scripts</label>
                <input type="number" [(ngModel)]="num_scripts" class="input" min="1" max="20" placeholder="5">
              </div>
              <div>
                <label class="block text-sm font-body font-medium text-navy mb-1">WhatsApp Number</label>
                <input type="tel" [(ngModel)]="whatsapp_number" class="input" placeholder="+91 98765 43210">
              </div>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Preferred UGC Concepts</label>
              <textarea [(ngModel)]="best_concepts" class="input !h-16 resize-none" placeholder="e.g. Unboxing, Before/After, Testimonial, GRWM"></textarea>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Reference Ads (URLs or descriptions)</label>
              <textarea [(ngModel)]="reference_ads" class="input !h-16 resize-none" placeholder="Links to ads you like, or describe the style you want"></textarea>
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Things to Avoid</label>
              <input type="text" [(ngModel)]="do_not_say" class="input" placeholder="Claims, words, or themes you don't want in ads">
            </div>
            <div>
              <label class="block text-sm font-body font-medium text-navy mb-1">Additional Notes</label>
              <textarea [(ngModel)]="additional_notes" class="input !h-16 resize-none" placeholder="Anything else we should know?"></textarea>
            </div>
          </div>

          <div class="text-center mt-8">
            <button (click)="submitOnboarding()" [disabled]="submitting() || !num_scripts || num_scripts < 1"
              class="btn-primary !py-4 !px-10 !text-base disabled:opacity-50 disabled:cursor-not-allowed">
              @if (submitting()) {
                <span class="inline-flex items-center gap-2">
                  <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Setting up your project...
                </span>
              } @else {
                Launch Project
              }
            </button>
          </div>
        </div>
      }

      <!-- Step 5: Success -->
      @if (currentStep() === 5) {
        <div class="text-center animate-fade-in py-12 relative">
          <!-- Confetti pieces -->
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
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>
          <div class="confetti-piece"></div>

          <div class="mb-6"><lucide-icon name="sparkles" [size]="48" class="text-accent"></lucide-icon></div>
          <h2 class="text-page-title font-display text-navy mb-3">You're all set!</h2>
          <p class="text-gray-600 font-body mb-2">Your project <strong>{{ clientCode() }}</strong> has been created.</p>
          <p class="text-gray-500 font-body text-sm mb-8">Our AI is already researching your brand and scouting creators. You'll see concepts appear shortly.</p>
          <button (click)="goToStudio()" class="btn-primary !py-3.5 !px-8 !text-base">Go to UGC Studio</button>
        </div>
      }
    </div>
  `
})
export default class OnboardingComponent {
  private router = inject(Router);
  private auth = inject(AuthService);
  private ugc = inject(UgcService);
  private toast = inject(ToastService);

  currentStep = signal(1);
  submitting = signal(false);
  clientCode = signal('');

  // Step 1: Brand & Product
  brand_name = '';
  website_url = '';
  product_feature = '';
  differentiator = '';

  // Step 2: Target Audience
  target_user = '';
  biggest_problem = '';
  main_hesitation = '';
  social_proof = '';

  // Step 3: Brand Voice
  brand_personality = '';
  selling_proposition = '';
  credibility_point = '';
  competitors = '';

  // Step 4: Project Setup
  num_scripts = 5;
  whatsapp_number = '';
  best_concepts = '';
  reference_ads = '';
  do_not_say = '';
  additional_notes = '';

  nextStep() {
    this.currentStep.update(s => s + 1);
  }

  prevStep() {
    this.currentStep.update(s => Math.max(1, s - 1));
  }

  submitOnboarding() {
    this.submitting.set(true);

    const user = this.auth.user();
    const payload = {
      client_name: user?.name || '',
      client_email: user?.email || '',
      whatsapp_number: this.whatsapp_number,
      brand_name: this.brand_name,
      website_url: this.website_url,
      product_feature: this.product_feature,
      differentiator: this.differentiator,
      target_user: this.target_user,
      biggest_problem: this.biggest_problem,
      main_hesitation: this.main_hesitation,
      social_proof: this.social_proof,
      brand_personality: this.brand_personality,
      selling_proposition: this.selling_proposition,
      credibility_point: this.credibility_point,
      competitors: this.competitors,
      best_concepts: this.best_concepts,
      reference_ads: this.reference_ads,
      do_not_say: this.do_not_say,
      additional_notes: this.additional_notes,
      num_scripts: this.num_scripts || 5,
    };

    this.ugc.onboardProject(payload).subscribe({
      next: (res: any) => {
        this.submitting.set(false);
        this.clientCode.set(res.client_code || '');
        this.auth.setOnboardingComplete();
        this.currentStep.set(5);
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error('Onboarding failed', err.error?.error || 'Please try again.');
      },
    });
  }

  goToStudio() {
    this.router.navigate(['/app/ugc-studio']);
  }
}
