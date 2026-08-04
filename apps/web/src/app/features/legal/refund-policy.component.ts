import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-refund-policy',
  standalone: true,
  imports: [RouterLink],
  template: `
    <!-- Page Header -->
    <section class="bg-white border-b border-gray-200 py-16 -mt-[72px] pt-[calc(4rem+72px)]">
      <div class="max-w-3xl mx-auto px-6">
        <p class="text-sm font-body text-accent font-semibold uppercase tracking-widest mb-3">Legal</p>
        <h1 class="text-4xl font-display font-bold text-navy mb-3">Cancellation &amp; Refund Policy</h1>
        <p class="text-sm text-gray-500 font-body">Last updated: 29 July 2026</p>
      </div>
    </section>

    <!-- Content -->
    <section class="bg-[#F7F8FA] py-16">
      <div class="max-w-3xl mx-auto px-6">
        <div class="bg-white rounded-2xl shadow-card border border-divider p-10 space-y-10">

          <!-- Intro -->
          <div>
            <p class="text-base text-gray-700 font-body leading-relaxed">
              Cosmisk is a software-as-a-service product delivered electronically. Access is sold on a recurring subscription basis, billed either monthly or annually. This policy sets out how cancellations and refunds are handled.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 1. Cancellation -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">1. Cancellation</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed mb-4">
              You may cancel your subscription at any time from <strong class="text-navy">Settings &rarr; Billing</strong> within your account, or by writing to
              <a href="mailto:cosmiskapp&#64;gmail.com" class="text-accent underline">cosmiskapp&#64;gmail.com</a>.
            </p>
            <div class="space-y-3">
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                Cancellation takes effect at the end of your current billing period. You retain full access to the Services until that period ends.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                Once cancelled, your subscription will not renew and you will not be charged again.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                No cancellation fee is charged at any time.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                If you pay by UPI AutoPay, cancelling the mandate in your UPI app stops future payments but does not cancel your subscription with us. Cancel in <strong class="text-navy">Settings &rarr; Billing</strong> as well, so that your account is closed correctly.
              </p>
            </div>
          </div>

          <hr class="border-gray-100" />

          <!-- 2. Refunds -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">2. Refunds</h2>
            <div class="space-y-4">

              <div class="bg-[#F7F8FA] rounded-xl border border-gray-200 p-5">
                <h3 class="text-base font-semibold font-body text-navy mb-2">Monthly plans</h3>
                <p class="text-sm text-gray-600 font-body leading-relaxed">
                  Charges for the current month are non-refundable. Cancelling stops the next renewal. Because the maximum amount at risk is a single month, and access continues for the full period paid for, no partial or pro-rata refund is issued.
                </p>
              </div>

              <div class="bg-[#F7F8FA] rounded-xl border border-gray-200 p-5">
                <h3 class="text-base font-semibold font-body text-navy mb-2">Annual plans</h3>
                <p class="text-sm text-gray-600 font-body leading-relaxed">
                  A full refund is available if requested within <strong class="text-navy">seven (7) calendar days</strong> of the first annual charge. After seven days the annual subscription is non-refundable for the remainder of the term, and cancelling stops the next renewal.
                </p>
              </div>

              <div class="bg-[#F7F8FA] rounded-xl border border-gray-200 p-5">
                <h3 class="text-base font-semibold font-body text-navy mb-2">Renewals</h3>
                <p class="text-sm text-gray-600 font-body leading-relaxed">
                  Renewal charges on either plan are non-refundable. Your bank or UPI app notifies you before each automatic renewal charge, so you can cancel beforehand if you wish.
                </p>
              </div>

              <div class="bg-[#F7F8FA] rounded-xl border-l-4 border-accent p-5">
                <h3 class="text-base font-semibold font-body text-navy mb-2">Billing errors are always refunded in full</h3>
                <p class="text-sm text-gray-600 font-body leading-relaxed">
                  If you are charged in error, charged twice for the same period, or charged after a valid cancellation, we will refund the full amount without reference to the windows above. Write to
                  <a href="mailto:cosmiskapp&#64;gmail.com" class="text-accent underline">cosmiskapp&#64;gmail.com</a>
                  and we will confirm within two (2) business days.
                </p>
              </div>

            </div>
          </div>

          <hr class="border-gray-100" />

          <!-- 3. How refunds are processed -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">3. How Refunds Are Processed</h2>
            <div class="space-y-3">
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                Approved refunds are credited to the <strong class="text-navy">original payment method</strong> only.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                We initiate the refund within <strong class="text-navy">five (5) business days</strong> of approving the request.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                Your bank or card issuer may take a further <strong class="text-navy">five to ten (5 to 10) business days</strong> to post the credit to your account.
              </p>
              <p class="text-sm text-gray-600 font-body leading-relaxed">
                If more than <strong class="text-navy">fifteen (15) business days</strong> have passed since we confirmed approval of your refund and you have not received it, contact us at
                <a href="mailto:cosmiskapp&#64;gmail.com" class="text-accent underline">cosmiskapp&#64;gmail.com</a>
                or +91 96625 98320.
              </p>
            </div>
          </div>

          <hr class="border-gray-100" />

          <!-- 4. Free trials -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">4. Free Trials</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed">
              Where a free trial is offered, no payment is taken during the trial period and the trial is the intended means of evaluating whether the Services suit your requirements. You may cancel at any point during the trial without being charged. If you do not cancel before the trial ends, the subscription begins and the terms above apply.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 5. Suspension or termination by us -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">5. Suspension or Termination by Us</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed">
              If we suspend or terminate your account for breach of the
              <a routerLink="/terms" class="text-accent underline">Terms &amp; Conditions</a>,
              no refund is payable. If we discontinue the Services entirely, we will refund the unused portion of any prepaid subscription on a pro-rata basis.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 6. Contact -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">6. Contact Us</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed mb-5">
              For any question about cancellations or refunds, contact us:
            </p>
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
export default class RefundPolicyComponent {}
