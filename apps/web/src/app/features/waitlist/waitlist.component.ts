import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';

interface WaitlistForm {
  email: string;
  name: string;
  company: string;
  role: string;
  adSpend: string;
  teamSize: string;
  painPoints: string[];
  features: string[];
}

@Component({
  selector: 'app-waitlist',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <!-- Hero -->
    <section class="relative overflow-hidden bg-dark-mesh py-24 -mt-[72px] pt-[calc(6rem+72px)]">
      <div class="relative z-10 max-w-7xl mx-auto px-6 text-center">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-6">
          <span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
          <span class="text-accent text-sm font-body font-medium">Early Access</span>
        </div>
        <h1 class="text-hero font-display text-white mb-4">Join the Cosmisk Waitlist</h1>
        <p class="text-lg text-gray-400 font-body max-w-2xl mx-auto">
          AI-powered creative intelligence for Meta advertisers. Be among the first to get access
          and shape the product with your feedback.
        </p>
      </div>
    </section>

    <!-- Form Section -->
    <section class="py-20 bg-[#F7F8FA]">
      <div class="max-w-2xl mx-auto px-6">
        @if (step() <= 3) {
          <!-- Progress Indicator -->
          <div class="flex items-center justify-center gap-3 mb-10">
            @for (s of [1, 2, 3]; track s) {
              <div class="flex items-center gap-3">
                <div
                  class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-body font-semibold transition-all duration-300"
                  [ngClass]="step() > s ? 'bg-green-500 text-white' : step() === s ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'bg-gray-200 text-gray-500'">
                  @if (step() > s) {
                    <lucide-icon name="check" [size]="18"></lucide-icon>
                  } @else {
                    {{ s }}
                  }
                </div>
                @if (s < 3) {
                  <div
                    class="w-16 h-0.5 rounded transition-all duration-300"
                    [ngClass]="step() > s ? 'bg-green-500' : 'bg-gray-200'">
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- Form Card -->
        <div class="bg-white rounded-2xl shadow-card border border-divider overflow-hidden">

          <!-- Step 1: Identity -->
          @if (step() === 1) {
            <div class="p-8 animate-fade-in">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <lucide-icon name="user" [size]="20" class="text-accent"></lucide-icon>
                </div>
                <div>
                  <h2 class="text-card-title font-display text-navy m-0">Get on the list</h2>
                  <p class="text-sm text-gray-500 font-body m-0">Takes less than 2 minutes</p>
                </div>
              </div>

              <div class="space-y-5">
                <div>
                  <label for="wl-email" class="block text-sm font-body font-semibold text-navy mb-1.5">Work Email *</label>
                  <input
                    id="wl-email"
                    type="email"
                    [(ngModel)]="form.email"
                    name="email"
                    placeholder="you&#64;company.com"
                    class="input w-full"
                    (keyup.enter)="nextStep()" />
                </div>
                <div>
                  <label for="wl-name" class="block text-sm font-body font-semibold text-navy mb-1.5">Full Name</label>
                  <input
                    id="wl-name"
                    type="text"
                    [(ngModel)]="form.name"
                    name="name"
                    placeholder="Rajesh Gupta"
                    class="input w-full" />
                </div>
                <div>
                  <label for="wl-company" class="block text-sm font-body font-semibold text-navy mb-1.5">Company / Brand</label>
                  <input
                    id="wl-company"
                    type="text"
                    [(ngModel)]="form.company"
                    name="company"
                    placeholder="Your company or agency"
                    class="input w-full" />
                </div>

                <button
                  (click)="nextStep()"
                  [disabled]="!form.email.includes('@')"
                  class="btn-primary w-full !py-3 hover:shadow-glow hover:scale-[1.01] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none">
                  Continue
                  <lucide-icon name="arrow-right" [size]="18" class="ml-2"></lucide-icon>
                </button>
              </div>
            </div>
          }

          <!-- Step 2: Persona -->
          @if (step() === 2) {
            <div class="p-8 animate-fade-in">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <lucide-icon name="briefcase" [size]="20" class="text-accent"></lucide-icon>
                </div>
                <div>
                  <h2 class="text-card-title font-display text-navy m-0">Tell us about you</h2>
                  <p class="text-sm text-gray-500 font-body m-0">Helps us tailor your experience</p>
                </div>
              </div>

              <div class="space-y-5">
                <!-- Role -->
                <div>
                  <label class="block text-sm font-body font-semibold text-navy mb-2">Your Role</label>
                  <div class="grid grid-cols-2 gap-2">
                    @for (role of roles; track role) {
                      <button
                        (click)="form.role = role"
                        class="px-4 py-2.5 rounded-xl text-sm font-body text-left transition-all duration-200 border cursor-pointer bg-white"
                        [ngClass]="form.role === role ? 'border-accent bg-accent/5 text-accent font-semibold' : 'border-gray-200 text-gray-700 hover:border-gray-300'">
                        {{ role }}
                      </button>
                    }
                  </div>
                </div>

                <!-- Ad Spend -->
                <div>
                  <label class="block text-sm font-body font-semibold text-navy mb-2">Monthly Ad Spend</label>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    @for (spend of adSpendOptions; track spend) {
                      <button
                        (click)="form.adSpend = spend"
                        class="px-4 py-2.5 rounded-xl text-sm font-body text-center transition-all duration-200 border cursor-pointer bg-white"
                        [ngClass]="form.adSpend === spend ? 'border-accent bg-accent/5 text-accent font-semibold' : 'border-gray-200 text-gray-700 hover:border-gray-300'">
                        {{ spend }}
                      </button>
                    }
                  </div>
                </div>

                <!-- Team Size -->
                <div>
                  <label class="block text-sm font-body font-semibold text-navy mb-2">Team Size</label>
                  <div class="flex gap-2">
                    @for (size of teamSizes; track size) {
                      <button
                        (click)="form.teamSize = size"
                        class="flex-1 px-4 py-2.5 rounded-xl text-sm font-body text-center transition-all duration-200 border cursor-pointer bg-white"
                        [ngClass]="form.teamSize === size ? 'border-accent bg-accent/5 text-accent font-semibold' : 'border-gray-200 text-gray-700 hover:border-gray-300'">
                        {{ size }}
                      </button>
                    }
                  </div>
                </div>

                <div class="flex gap-3">
                  <button
                    (click)="prevStep()"
                    class="btn-ghost !py-3 flex-1 !text-gray-500">
                    <lucide-icon name="arrow-left" [size]="18" class="mr-2"></lucide-icon>
                    Back
                  </button>
                  <button
                    (click)="nextStep()"
                    class="btn-primary !py-3 flex-[2] hover:shadow-glow hover:scale-[1.01] transition-all duration-300">
                    Continue
                    <lucide-icon name="arrow-right" [size]="18" class="ml-2"></lucide-icon>
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Step 3: Interest -->
          @if (step() === 3) {
            <div class="p-8 animate-fade-in">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <lucide-icon name="sparkles" [size]="20" class="text-accent"></lucide-icon>
                </div>
                <div>
                  <h2 class="text-card-title font-display text-navy m-0">What matters most?</h2>
                  <p class="text-sm text-gray-500 font-body m-0">Pick up to 3 each</p>
                </div>
              </div>

              <div class="space-y-6">
                <!-- Pain Points -->
                <div>
                  <label class="block text-sm font-body font-semibold text-navy mb-2">
                    Biggest pain points
                    <span class="text-gray-400 font-normal">({{ form.painPoints.length }}/3)</span>
                  </label>
                  <div class="space-y-2">
                    @for (pain of painPoints; track pain) {
                      <button
                        (click)="toggleSelection(form.painPoints, pain)"
                        [disabled]="!form.painPoints.includes(pain) && form.painPoints.length >= 3"
                        class="w-full px-4 py-3 rounded-xl text-sm font-body text-left transition-all duration-200 border cursor-pointer bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        [ngClass]="form.painPoints.includes(pain) ? 'border-accent bg-accent/5 text-accent font-medium' : 'border-gray-200 text-gray-700 hover:border-gray-300'">
                        <span class="flex items-center gap-2">
                          <span
                            class="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-all"
                            [ngClass]="form.painPoints.includes(pain) ? 'bg-accent border-accent' : 'border-gray-300'">
                            @if (form.painPoints.includes(pain)) {
                              <lucide-icon name="check" [size]="14" class="text-white"></lucide-icon>
                            }
                          </span>
                          {{ pain }}
                        </span>
                      </button>
                    }
                  </div>
                </div>

                <!-- Features -->
                <div>
                  <label class="block text-sm font-body font-semibold text-navy mb-2">
                    Most interesting features
                    <span class="text-gray-400 font-normal">({{ form.features.length }}/3)</span>
                  </label>
                  <div class="space-y-2">
                    @for (feat of featureOptions; track feat) {
                      <button
                        (click)="toggleSelection(form.features, feat)"
                        [disabled]="!form.features.includes(feat) && form.features.length >= 3"
                        class="w-full px-4 py-3 rounded-xl text-sm font-body text-left transition-all duration-200 border cursor-pointer bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        [ngClass]="form.features.includes(feat) ? 'border-accent bg-accent/5 text-accent font-medium' : 'border-gray-200 text-gray-700 hover:border-gray-300'">
                        <span class="flex items-center gap-2">
                          <span
                            class="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-all"
                            [ngClass]="form.features.includes(feat) ? 'bg-accent border-accent' : 'border-gray-300'">
                            @if (form.features.includes(feat)) {
                              <lucide-icon name="check" [size]="14" class="text-white"></lucide-icon>
                            }
                          </span>
                          {{ feat }}
                        </span>
                      </button>
                    }
                  </div>
                </div>

                <div class="flex gap-3">
                  <button
                    (click)="prevStep()"
                    class="btn-ghost !py-3 flex-1 !text-gray-500">
                    <lucide-icon name="arrow-left" [size]="18" class="mr-2"></lucide-icon>
                    Back
                  </button>
                  <button
                    (click)="submit()"
                    [disabled]="submitting()"
                    class="btn-primary !py-3 flex-[2] hover:shadow-glow hover:scale-[1.01] transition-all duration-300 disabled:opacity-60">
                    @if (submitting()) {
                      <span class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                      Joining...
                    } @else {
                      Join the Waitlist
                      <lucide-icon name="rocket" [size]="18" class="ml-2"></lucide-icon>
                    }
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Step 4: Success -->
          @if (step() === 4) {
            <div class="p-8 text-center animate-fade-in">
              <!-- Animated checkmark -->
              <div class="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-6 animate-bounce-in">
                <lucide-icon name="check-circle-2" [size]="44" class="text-green-500"></lucide-icon>
              </div>

              <h2 class="text-2xl font-display font-bold text-navy mb-2">You're in!</h2>
              <p class="text-lg text-gray-600 font-body mb-1">
                You're <span class="font-bold text-accent">#{{ position() }}</span> on the waitlist
              </p>
              <p class="text-sm text-gray-500 font-body mb-8">
                We'll email you when it's your turn. The earlier you joined, the sooner you get access.
              </p>

              <!-- Social proof -->
              <div class="bg-[#F7F8FA] rounded-xl border border-gray-200 p-6 mb-8">
                <p class="text-sm font-body font-semibold text-navy mb-3">Follow Vishant for early access updates</p>
                <div class="flex items-center justify-center gap-3">
                  <a
                    href="https://www.linkedin.com/in/vishant-jain-facebook-ads-specialist-roi-driven-ads/"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0A66C2] text-white text-sm font-body font-medium rounded-xl no-underline hover:bg-[#004182] transition-colors">
                    <lucide-icon name="linkedin" [size]="16"></lucide-icon>
                    LinkedIn
                  </a>
                  <a
                    href="https://www.instagram.com/vishant.jain06/"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white text-sm font-body font-medium rounded-xl no-underline hover:opacity-90 transition-opacity">
                    <lucide-icon name="instagram" [size]="16"></lucide-icon>
                    Instagram
                  </a>
                </div>
              </div>

              <!-- Share buttons -->
              <p class="text-sm font-body font-semibold text-navy mb-3">Share with your network</p>
              <div class="flex items-center justify-center gap-3">
                <button
                  (click)="shareLinkedIn()"
                  class="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-body font-medium rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <lucide-icon name="linkedin" [size]="16"></lucide-icon>
                  Share
                </button>
                <button
                  (click)="shareTwitter()"
                  class="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-body font-medium rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <lucide-icon name="twitter" [size]="16"></lucide-icon>
                  Tweet
                </button>
                <button
                  (click)="shareWhatsApp()"
                  class="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-body font-medium rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <lucide-icon name="message-circle" [size]="16"></lucide-icon>
                  WhatsApp
                </button>
              </div>
            </div>
          }
        </div>

        @if (error()) {
          <div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-body text-center">
            {{ error() }}
          </div>
        }

        <!-- Trust signals -->
        @if (step() <= 3) {
          <div class="mt-8 text-center space-y-2">
            <p class="text-xs text-gray-400 font-body flex items-center justify-center gap-1.5">
              <lucide-icon name="lock" [size]="12"></lucide-icon>
              No credit card required. We'll never spam you.
            </p>
          </div>
        }
      </div>
    </section>
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes bounceIn {
      0% { opacity: 0; transform: scale(0.3); }
      50% { transform: scale(1.05); }
      70% { transform: scale(0.95); }
      100% { opacity: 1; transform: scale(1); }
    }
    .animate-fade-in { animation: fadeIn 0.4s ease-out; }
    .animate-bounce-in { animation: bounceIn 0.6s ease-out; }
  `]
})
export default class WaitlistComponent {
  private http = inject(HttpClient);

  step = signal(1);
  submitting = signal(false);
  position = signal(0);
  error = signal('');

  form: WaitlistForm = {
    email: '',
    name: '',
    company: '',
    role: '',
    adSpend: '',
    teamSize: '',
    painPoints: [],
    features: [],
  };

  roles = ['Agency Owner', 'Media Buyer', 'Brand Marketer', 'Freelancer/Consultant', 'Founder/CEO'];

  adSpendOptions = ['< \u20B91L', '\u20B91-5L', '\u20B95-25L', '\u20B925L-1Cr', '> \u20B91Cr'];

  teamSizes = ['Solo', '2-5', '6-20', '20+'];

  painPoints = [
    'Creative fatigue \u2014 same ads, declining performance',
    'Manual reporting \u2014 hours in spreadsheets',
    'Scaling creatives \u2014 can\'t produce enough variations',
    'Competitor blind spots \u2014 no idea what rivals run',
    'No performance insights \u2014 data but no actionable takeaways',
    'Video production \u2014 too expensive/slow',
  ];

  featureOptions = [
    'AI Creative Analysis (Creative DNA)',
    'AI Video & Image Generation',
    'Competitor Ad Spy',
    'Autopilot Alerts (anomaly detection)',
    'White-label Client Reports',
    'AI Chat for Ad Data',
    'Campaign Builder & Automation',
  ];

  nextStep() {
    if (this.step() === 1 && !this.form.email.includes('@')) return;
    this.step.update(s => s + 1);
  }

  prevStep() {
    this.step.update(s => Math.max(1, s - 1));
  }

  toggleSelection(arr: string[], item: string) {
    const idx = arr.indexOf(item);
    if (idx >= 0) {
      arr.splice(idx, 1);
    } else if (arr.length < 3) {
      arr.push(item);
    }
  }

  submit() {
    this.submitting.set(true);
    this.error.set('');

    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    const source = this.detectSource(referrer);

    const payload = {
      email: this.form.email,
      name: this.form.name,
      company: this.form.company,
      role: this.form.role,
      ad_spend: this.form.adSpend,
      team_size: this.form.teamSize,
      pain_points: this.form.painPoints,
      interested_features: this.form.features,
      source,
      referrer,
      signed_up_at: new Date().toISOString(),
    };

    this.http.post<{ position: number }>(`${environment.API_BASE_URL}/waitlist/join`, payload).subscribe({
      next: (res) => {
        this.position.set(res.position || 1);
        this.step.set(4);
        this.submitting.set(false);
      },
      error: () => {
        this.error.set('Something went wrong. Please try again.');
        this.submitting.set(false);
      }
    });
  }

  private detectSource(referrer: string): string {
    if (referrer.includes('linkedin.com')) return 'linkedin';
    if (referrer.includes('instagram.com')) return 'instagram';
    if (referrer.includes('twitter.com') || referrer.includes('x.com')) return 'twitter';
    return 'waitlist';
  }

  shareLinkedIn() {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://cosmisk.com/waitlist')}`, '_blank');
  }

  shareTwitter() {
    const text = encodeURIComponent('Just joined the Cosmisk waitlist \u2014 AI-powered creative intelligence for Meta advertisers. Check it out:');
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent('https://cosmisk.com/waitlist')}`, '_blank');
  }

  shareWhatsApp() {
    const text = encodeURIComponent('Check out Cosmisk \u2014 AI-powered creative intelligence for Meta advertisers. Join the waitlist: https://cosmisk.com/waitlist');
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }
}
