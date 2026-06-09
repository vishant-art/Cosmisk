import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AnimateOnScrollDirective } from '../../shared/directives/animate-on-scroll.directive';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, AnimateOnScrollDirective],
  template: `
    <!-- Hero -->
    <section class="relative overflow-hidden bg-dark-mesh py-24 -mt-[72px] pt-[calc(6rem+72px)]">
      <div class="relative z-10 max-w-7xl mx-auto px-6 text-center">
        <h1 class="text-hero font-display text-white mb-4">Let's Talk</h1>
        <p class="text-lg text-gray-400 font-body max-w-xl mx-auto">
          Whether you want a demo, custom pricing, or just have questions -- we'd love to hear from you.
        </p>
      </div>
    </section>

    <!-- Form + Info Grid -->
    <section class="py-20 bg-[#F7F8FA]">
      <div class="max-w-5xl mx-auto px-6 grid lg:grid-cols-5 gap-12">
        <!-- Contact Form (3 cols) -->
        <div appAnimateOnScroll class="lg:col-span-3">
          <div class="bg-white rounded-2xl shadow-card border border-divider p-8">
            <h2 class="text-section-title font-display text-navy mb-6">Send Us a Message</h2>

            @if (submitted()) {
              <div class="text-center py-12" role="status">
                <div class="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <lucide-icon name="check" [size]="32" class="text-green-600"></lucide-icon>
                </div>
                <h3 class="text-card-title font-display text-navy mb-2">Message Sent!</h3>
                <p class="text-gray-600 font-body text-sm">We'll get back to you within 24 hours.</p>
              </div>
            } @else {
              <form (submit)="submitForm(); $event.preventDefault()" class="space-y-5">
                <div class="grid md:grid-cols-2 gap-5">
                  <div>
                    <label for="contact-name" class="block text-sm font-body font-semibold text-navy mb-1.5">Full Name *</label>
                    <input
                      id="contact-name"
                      type="text"
                      [(ngModel)]="form.name"
                      name="name"
                      required
                      placeholder="Rajesh Gupta"
                      class="input w-full" />
                  </div>
                  <div>
                    <label for="contact-email" class="block text-sm font-body font-semibold text-navy mb-1.5">Work Email *</label>
                    <input
                      id="contact-email"
                      type="email"
                      [(ngModel)]="form.email"
                      name="email"
                      required
                      placeholder="rajesh&#64;company.com"
                      class="input w-full" />
                  </div>
                </div>

                <div>
                  <label for="contact-company" class="block text-sm font-body font-semibold text-navy mb-1.5">Company Name</label>
                  <input
                    id="contact-company"
                    type="text"
                    [(ngModel)]="form.company"
                    name="company"
                    placeholder="Your company or agency"
                    class="input w-full" />
                </div>

                <div>
                  <label for="contact-spend" class="block text-sm font-body font-semibold text-navy mb-1.5">Monthly Ad Spend</label>
                  <select
                    id="contact-spend"
                    [(ngModel)]="form.adSpend"
                    name="adSpend"
                    class="input w-full">
                    <option value="">Select range</option>
                    <option value="< 1L">Less than &#8377;1L</option>
                    <option value="1-5L">&#8377;1L - &#8377;5L</option>
                    <option value="5-25L">&#8377;5L - &#8377;25L</option>
                    <option value="25L-1Cr">&#8377;25L - &#8377;1Cr</option>
                    <option value="> 1Cr">More than &#8377;1Cr</option>
                  </select>
                </div>

                <div>
                  <label for="contact-message" class="block text-sm font-body font-semibold text-navy mb-1.5">Message *</label>
                  <textarea
                    id="contact-message"
                    [(ngModel)]="form.message"
                    name="message"
                    required
                    rows="4"
                    placeholder="Tell us what you're looking for..."
                    class="input w-full resize-y"></textarea>
                </div>

                <button
                  type="submit"
                  class="btn-primary w-full !py-3 hover:shadow-glow hover:scale-[1.01] transition-all duration-300">
                  Send Message
                </button>
              </form>
            }
          </div>
        </div>

        <!-- Sidebar Info (2 cols) -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Book a Demo -->
          <div appAnimateOnScroll [aosDelay]="100" class="bg-white rounded-2xl shadow-card border border-divider p-6">
            <div class="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
              <lucide-icon name="calendar" [size]="22" class="text-accent"></lucide-icon>
            </div>
            <h3 class="text-card-title font-display text-navy mb-2">Book a Live Demo</h3>
            <p class="text-sm text-gray-600 font-body mb-4">See Cosmisk in action with your own ad data. 30-minute session with our team.</p>
            <!-- Calendly placeholder -->
            <div class="bg-[#F7F8FA] rounded-xl border border-gray-200 p-6 text-center">
              <lucide-icon name="video" [size]="28" class="text-gray-300 mb-2 mx-auto"></lucide-icon>
              <p class="text-sm text-gray-500 font-body m-0 mb-3">Calendly integration coming soon</p>
              <a href="mailto:hello&#64;cosmisk.ai?subject=Demo Request" class="btn-primary !py-2 !px-5 !text-sm no-underline inline-flex">
                Email for Demo
              </a>
            </div>
          </div>

          <!-- Quick Contact -->
          <div appAnimateOnScroll [aosDelay]="200" class="bg-white rounded-2xl shadow-card border border-divider p-6">
            <h3 class="text-card-title font-display text-navy mb-4">Quick Contact</h3>
            <div class="space-y-4">
              <div class="flex items-start gap-3">
                <lucide-icon name="mail" [size]="18" class="text-accent mt-0.5"></lucide-icon>
                <div>
                  <p class="text-sm font-body font-semibold text-navy m-0">Email</p>
                  <p class="text-sm text-gray-600 m-0">hello&#64;cosmisk.ai</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <lucide-icon name="clock" [size]="18" class="text-accent mt-0.5"></lucide-icon>
                <div>
                  <p class="text-sm font-body font-semibold text-navy m-0">Response Time</p>
                  <p class="text-sm text-gray-600 m-0">Within 24 hours</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <lucide-icon name="map-pin" [size]="18" class="text-accent mt-0.5"></lucide-icon>
                <div>
                  <p class="text-sm font-body font-semibold text-navy m-0">Location</p>
                  <p class="text-sm text-gray-600 m-0">Bangalore, India</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `
})
export default class ContactComponent {
  private http = inject(HttpClient);
  submitted = signal(false);

  form = {
    name: '',
    email: '',
    company: '',
    adSpend: '',
    message: '',
  };

  submitForm() {
    if (this.form.name && this.form.email.includes('@') && this.form.message) {
      this.submitted.set(true);
      this.http.post(`${environment.API_BASE_URL}/leads/capture`, {
        email: this.form.email,
        source: 'contact',
      }).subscribe();
    }
  }
}
