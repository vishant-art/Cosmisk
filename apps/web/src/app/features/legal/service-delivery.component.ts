import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-service-delivery',
  standalone: true,
  imports: [RouterLink],
  template: `
    <!-- Page Header -->
    <section class="bg-white border-b border-gray-200 py-16 -mt-[72px] pt-[calc(4rem+72px)]">
      <div class="max-w-3xl mx-auto px-6">
        <p class="text-sm font-body text-accent font-semibold uppercase tracking-widest mb-3">Legal</p>
        <h1 class="text-4xl font-display font-bold text-navy mb-3">Service Delivery Policy</h1>
        <p class="text-sm text-gray-500 font-body">Last updated: 29 July 2026</p>
      </div>
    </section>

    <!-- Content -->
    <section class="bg-[#F7F8FA] py-16">
      <div class="max-w-3xl mx-auto px-6">
        <div class="bg-white rounded-2xl shadow-card border border-divider p-10 space-y-10">

          <!-- Intro -->
          <div class="bg-[#F7F8FA] rounded-xl border-l-4 border-accent p-5">
            <p class="text-sm text-gray-600 font-body leading-relaxed">
              <strong class="text-navy">Cosmisk sells software, not physical goods.</strong>
              Nothing is shipped. There is no courier, no consignment and no physical delivery address. This policy describes how access to the Services is delivered to you electronically.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 1. How and when the Service is delivered -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">1. How and When the Service Is Delivered</h2>
            <div class="space-y-3">
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                Access to Cosmisk is provisioned <strong class="text-navy">immediately and automatically</strong> upon successful confirmation of payment by our payment gateway.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                Delivery is made electronically to the <strong class="text-navy">email address registered on your account</strong>, in the form of account access at
                <a href="https://cosmisk.com" class="text-accent underline">cosmisk.com</a>.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                Your payment is confirmed by your bank or UPI app at the time of the transaction, and your current subscription details are shown under <strong class="text-navy">Settings &rarr; Billing</strong> in your account.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                The Services are delivered over the internet and are available continuously, subject to scheduled maintenance and to events outside our reasonable control.
              </p>
            </div>
          </div>

          <hr class="border-gray-100" />

          <!-- 2. If access is not provisioned -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">2. If Access Is Not Provisioned</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed">
              In the rare event that payment succeeds but account access is not provisioned, contact us at
              <a href="mailto:cosmiskapp&#64;gmail.com" class="text-accent underline">cosmiskapp&#64;gmail.com</a>
              or +91 96625 98320. We will restore access or, where we are unable to do so, issue a
              <strong class="text-navy">full refund</strong> of the amount charged, in accordance with our
              <a routerLink="/refund-policy" class="text-accent underline">Cancellation &amp; Refund Policy</a>.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 3. Service availability and support -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">3. Service Availability and Support</h2>
            <div class="space-y-3">
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                Support is provided by email at
                <a href="mailto:cosmiskapp&#64;gmail.com" class="text-accent underline">cosmiskapp&#64;gmail.com</a>,
                ordinarily responded to within <strong class="text-navy">one (1) business day</strong>.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                Business days are Monday to Friday, excluding public holidays in India.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                Where planned maintenance is expected to interrupt the Services materially, we will give advance notice by email or by notice on the Platform.
              </p>
            </div>
          </div>

          <hr class="border-gray-100" />

          <!-- 4. Geographic scope -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">4. Geographic Scope</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed">
              The Services are delivered online and are available in India and internationally. Prices are shown in <strong class="text-navy">Indian Rupees</strong> or <strong class="text-navy">US Dollars</strong> depending on the plan you select. Personal data is stored and processed outside India, as described in our
              <a routerLink="/privacy-policy" class="text-accent underline">Privacy Policy</a>.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 5. Contact -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">5. Contact Us</h2>
            <div class="bg-[#F7F8FA] rounded-xl border border-gray-200 p-5 space-y-2">
              <p class="text-sm font-body text-gray-700">
                <span class="font-semibold text-navy">Cosmisk</span> — a sole proprietorship of Sanskar Saxena
              </p>
              <p class="text-sm font-body text-gray-700">
                27, Nirmal Bunglows, Nr Karnavati Park, Opp Baroda Expressway,<br />
                CTM, Ahmedabad, Gujarat 380026, India
              </p>
              <p class="text-sm font-body text-gray-700">
                Email:
                <a href="mailto:cosmiskapp&#64;gmail.com" class="text-accent underline">cosmiskapp&#64;gmail.com</a>
              </p>
              <p class="text-sm font-body text-gray-700">Phone: +91 96625 98320</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  `
})
export default class ServiceDeliveryComponent {}
