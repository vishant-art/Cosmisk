import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Page Header -->
    <section class="bg-white border-b border-gray-200 py-16 -mt-[72px] pt-[calc(4rem+72px)]">
      <div class="max-w-3xl mx-auto px-6">
        <p class="text-sm font-body text-accent font-semibold uppercase tracking-widest mb-3">Legal</p>
        <h1 class="text-4xl font-display font-bold text-navy mb-3">Privacy Policy</h1>
        <p class="text-sm text-gray-500 font-body">Last updated: March 2026</p>
      </div>
    </section>

    <!-- Content -->
    <section class="bg-[#F7F8FA] py-16">
      <div class="max-w-3xl mx-auto px-6">
        <div class="bg-white rounded-2xl shadow-card border border-divider p-10 space-y-10">

          <!-- Intro -->
          <div>
            <p class="text-base text-gray-700 font-body leading-relaxed">
              This Privacy Policy describes how Cosmisk ("<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>"), operated by Vishant Jain, India, collects, uses, and protects information when you use our platform at
              <a href="https://cosmisk.com" class="text-accent underline">cosmisk.com</a>.
              By accessing or using Cosmisk, you agree to the practices described in this policy.
            </p>
          </div>

          <!-- Divider -->
          <hr class="border-gray-100" />

          <!-- 1. Information We Collect -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">1. Information We Collect</h2>
            <div class="space-y-4">
              <div>
                <h3 class="text-base font-semibold font-body text-navy mb-1">Account Information</h3>
                <p class="text-sm text-gray-600 font-body leading-relaxed">
                  When you sign up or connect your account, we collect your name, email address, and authentication credentials necessary to provide access to the platform.
                </p>
              </div>
              <div>
                <h3 class="text-base font-semibold font-body text-navy mb-1">Usage Data</h3>
                <p class="text-sm text-gray-600 font-body leading-relaxed">
                  We collect information about how you interact with Cosmisk, including pages visited, features used, session duration, and browser or device information. This data is used solely to improve the platform.
                </p>
              </div>
              <div>
                <h3 class="text-base font-semibold font-body text-navy mb-1">Meta Advertising Data</h3>
                <p class="text-sm text-gray-600 font-body leading-relaxed">
                  When you connect your Meta Business account, we access your advertising performance data — including campaign metrics, ad spend, impressions, clicks, and conversions — through the Meta Graph API. This requires your explicit authorization via Meta's OAuth flow.
                </p>
              </div>
              <div>
                <h3 class="text-base font-semibold font-body text-navy mb-1">Communications</h3>
                <p class="text-sm text-gray-600 font-body leading-relaxed">
                  If you contact us via email or our contact form, we retain that correspondence to respond to your inquiry and improve our support.
                </p>
              </div>
            </div>
          </div>

          <hr class="border-gray-100" />

          <!-- 2. How We Use Your Information -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">2. How We Use Your Information</h2>
            <ul class="space-y-2 text-sm text-gray-600 font-body leading-relaxed list-none pl-0">
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>To operate and deliver the Cosmisk platform, including analytics dashboards and AI-powered insights.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>To generate AI analysis and recommendations based on your advertising data.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>To authenticate your identity and maintain the security of your account.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>To send transactional emails such as account confirmations or important service updates. We do not send marketing emails without your consent.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>To diagnose technical issues and improve platform performance and reliability.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>To comply with legal obligations applicable under Indian law and applicable international regulations.</span>
              </li>
            </ul>
          </div>

          <hr class="border-gray-100" />

          <!-- 3. Data From Meta -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">3. Data From Meta</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed mb-3">
              Cosmisk integrates with the Meta Graph API to retrieve your advertising data. By connecting your Meta account, you authorize us to access campaign performance data on your behalf. Specifically:
            </p>
            <ul class="space-y-2 text-sm text-gray-600 font-body leading-relaxed list-none pl-0 mb-3">
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>We request only the permissions necessary to display your campaign, ad set, and ad-level metrics.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>We do not publish posts, create ads, or spend your budget on your behalf.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>Meta data is stored in our database only to power your dashboard. It is not sold or shared with any third party for marketing purposes.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>You may revoke Cosmisk's access to your Meta account at any time through your Meta Business Settings.</span>
              </li>
            </ul>
            <p class="text-sm text-gray-600 font-body leading-relaxed">
              Our use of Meta data is governed by the
              <a href="https://developers.facebook.com/policy/" target="_blank" rel="noopener noreferrer" class="text-accent underline">Meta Platform Terms</a>.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 4. Third-Party Services -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">4. Third-Party Services</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed mb-5">
              We use a limited number of trusted third-party services to operate Cosmisk. Each service receives only the data necessary for its specific function.
            </p>

            <div class="space-y-5">
              <!-- Anthropic -->
              <div class="border border-gray-200 rounded-xl p-5">
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-8 h-8 rounded-lg bg-[#F0EBF8] flex items-center justify-center flex-shrink-0">
                    <span class="text-xs font-bold text-[#7C3AED] font-body">AI</span>
                  </div>
                  <h3 class="text-sm font-semibold font-body text-navy">Anthropic (Claude AI)</h3>
                </div>
                <p class="text-sm text-gray-600 font-body leading-relaxed">
                  Cosmisk uses Anthropic's Claude models to generate AI-powered analysis and recommendations. When you request an AI insight, relevant campaign data (metrics and summaries — not personally identifiable information) is sent to Anthropic's API. Anthropic's data handling is governed by their
                  <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" class="text-accent underline">Privacy Policy</a>.
                </p>
              </div>

              <!-- Railway -->
              <div class="border border-gray-200 rounded-xl p-5">
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-8 h-8 rounded-lg bg-[#EBF4FF] flex items-center justify-center flex-shrink-0">
                    <span class="text-xs font-bold text-[#1D4ED8] font-body">SV</span>
                  </div>
                  <h3 class="text-sm font-semibold font-body text-navy">Railway (Hosting &amp; Infrastructure)</h3>
                </div>
                <p class="text-sm text-gray-600 font-body leading-relaxed">
                  Our backend server and database are hosted on Railway. Your data is stored on Railway's infrastructure. Railway's data handling practices are described in their
                  <a href="https://railway.com/legal/privacy" target="_blank" rel="noopener noreferrer" class="text-accent underline">Privacy Policy</a>.
                </p>
              </div>
            </div>

            <p class="text-sm text-gray-500 font-body leading-relaxed mt-4">
              We do not use advertising trackers, sell your data, or share it with analytics platforms such as Google Analytics.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 5. Data Security -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">5. Data Security</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed mb-3">
              We take the security of your data seriously. Our measures include:
            </p>
            <ul class="space-y-2 text-sm text-gray-600 font-body leading-relaxed list-none pl-0">
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>All data is transmitted over HTTPS using TLS encryption.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>Access tokens from Meta are stored encrypted and are never exposed in client-side code or logs.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>Our server infrastructure uses environment-level secrets management and is not publicly accessible beyond the API layer.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>We limit internal access to user data to only what is required to operate the service.</span>
              </li>
            </ul>
            <p class="text-sm text-gray-600 font-body leading-relaxed mt-3">
              No method of transmission or storage is 100% secure. While we strive to protect your data, we cannot guarantee absolute security. If you believe your account has been compromised, please contact us immediately at
              <a href="mailto:support&#64;cosmisk.com" class="text-accent underline">support&#64;cosmisk.com</a>.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 6. Data Retention -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">6. Data Retention</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed mb-3">
              We retain your data for as long as your account is active or as needed to provide the service. Specifically:
            </p>
            <ul class="space-y-2 text-sm text-gray-600 font-body leading-relaxed list-none pl-0">
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>Account information is retained until you request deletion of your account.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>Meta advertising data cached in our system is refreshed periodically and deleted when you disconnect your Meta account or delete your Cosmisk account.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0"></span>
                <span>Backup copies may be retained for up to 30 days following deletion to protect against accidental data loss.</span>
              </li>
            </ul>
            <p class="text-sm text-gray-600 font-body leading-relaxed mt-3">
              Upon account deletion, we will remove your personal data from our active systems within a reasonable time, except where retention is required by law.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 7. Your Rights -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">7. Your Rights</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed mb-3">
              Depending on your location, you may have rights under applicable data protection laws including GDPR. These rights include:
            </p>
            <div class="grid sm:grid-cols-2 gap-3">
              <div class="bg-[#F7F8FA] rounded-xl p-4 border border-gray-100">
                <p class="text-sm font-semibold font-body text-navy mb-1">Access</p>
                <p class="text-xs text-gray-600 font-body leading-relaxed">Request a copy of the personal data we hold about you.</p>
              </div>
              <div class="bg-[#F7F8FA] rounded-xl p-4 border border-gray-100">
                <p class="text-sm font-semibold font-body text-navy mb-1">Rectification</p>
                <p class="text-xs text-gray-600 font-body leading-relaxed">Ask us to correct inaccurate or incomplete data.</p>
              </div>
              <div class="bg-[#F7F8FA] rounded-xl p-4 border border-gray-100">
                <p class="text-sm font-semibold font-body text-navy mb-1">Erasure</p>
                <p class="text-xs text-gray-600 font-body leading-relaxed">Request deletion of your account and associated data.</p>
              </div>
              <div class="bg-[#F7F8FA] rounded-xl p-4 border border-gray-100">
                <p class="text-sm font-semibold font-body text-navy mb-1">Portability</p>
                <p class="text-xs text-gray-600 font-body leading-relaxed">Request a machine-readable export of data you provided to us.</p>
              </div>
              <div class="bg-[#F7F8FA] rounded-xl p-4 border border-gray-100">
                <p class="text-sm font-semibold font-body text-navy mb-1">Restriction</p>
                <p class="text-xs text-gray-600 font-body leading-relaxed">Request that we limit the processing of your personal data in certain circumstances.</p>
              </div>
              <div class="bg-[#F7F8FA] rounded-xl p-4 border border-gray-100">
                <p class="text-sm font-semibold font-body text-navy mb-1">Objection</p>
                <p class="text-xs text-gray-600 font-body leading-relaxed">Object to processing based on our legitimate interests.</p>
              </div>
            </div>
            <p class="text-sm text-gray-600 font-body leading-relaxed mt-4">
              To exercise any of these rights, email us at
              <a href="mailto:support&#64;cosmisk.com" class="text-accent underline">support&#64;cosmisk.com</a>.
              We will respond within 30 days. We may ask you to verify your identity before processing a request.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 8. Cookies -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">8. Cookies and Local Storage</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed">
              Cosmisk uses browser local storage and session cookies solely for authentication and user preferences (such as keeping you logged in). We do not use third-party advertising cookies or tracking pixels. You may clear local storage or cookies through your browser settings at any time, though this may log you out of the platform.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 9. Changes to This Policy -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">9. Changes to This Policy</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed">
              We may update this Privacy Policy from time to time. When we do, we will revise the "Last updated" date at the top of this page. If the changes are material, we will notify you via email or a notice on the platform. Your continued use of Cosmisk after any changes constitutes your acceptance of the updated policy.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- 10. Contact Us -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">10. Contact Us</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed mb-5">
              If you have questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact us:
            </p>
            <div class="bg-[#F7F8FA] rounded-xl border border-gray-200 p-5 space-y-2">
              <p class="text-sm font-body text-gray-700">
                <span class="font-semibold text-navy">Cosmisk</span>
              </p>
              <p class="text-sm font-body text-gray-700">Operated by Vishant Jain</p>
              <p class="text-sm font-body text-gray-700">India</p>
              <p class="text-sm font-body text-gray-700">
                Email:
                <a href="mailto:support&#64;cosmisk.com" class="text-accent underline">support&#64;cosmisk.com</a>
              </p>
              <p class="text-sm font-body text-gray-700">
                Website:
                <a href="https://cosmisk.com" class="text-accent underline">cosmisk.com</a>
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  `
})
export default class PrivacyPolicyComponent {}
