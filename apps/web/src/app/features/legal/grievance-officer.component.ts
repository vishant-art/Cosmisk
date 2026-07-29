import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-grievance-officer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Page Header -->
    <section class="bg-white border-b border-gray-200 py-16 -mt-[72px] pt-[calc(4rem+72px)]">
      <div class="max-w-3xl mx-auto px-6">
        <p class="text-sm font-body text-accent font-semibold uppercase tracking-widest mb-3">Legal</p>
        <h1 class="text-4xl font-display font-bold text-navy mb-3">Grievance Officer &amp; Contact</h1>
        <p class="text-sm text-gray-500 font-body">
          Published under the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023
        </p>
      </div>
    </section>

    <!-- Content -->
    <section class="bg-[#F7F8FA] py-16">
      <div class="max-w-3xl mx-auto px-6">
        <div class="bg-white rounded-2xl shadow-card border border-divider p-10 space-y-10">

          <!-- Intro -->
          <div>
            <p class="text-base text-gray-700 font-body leading-relaxed">
              In accordance with the Information Technology Act, 2000 and the rules made thereunder, and the Digital Personal Data Protection Act, 2023, the name and contact details of the Grievance Officer are provided below. You may contact the Grievance Officer with any complaint, question or request concerning our Privacy Policy, your personal data, or the Services.
            </p>
          </div>

          <hr class="border-gray-100" />

          <!-- Officer details -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">Grievance Officer</h2>
            <div class="bg-[#F7F8FA] rounded-xl border border-gray-200 p-6 space-y-4">

              <div>
                <p class="text-xs font-body text-gray-500 uppercase tracking-wider mb-1">Name</p>
                <p class="text-sm font-body text-navy font-semibold">Sanskar Saxena</p>
              </div>

              <div>
                <p class="text-xs font-body text-gray-500 uppercase tracking-wider mb-1">Designation</p>
                <p class="text-sm font-body text-gray-700">Proprietor, Cosmisk</p>
              </div>

              <div>
                <p class="text-xs font-body text-gray-500 uppercase tracking-wider mb-1">Entity</p>
                <p class="text-sm font-body text-gray-700">
                  Cosmisk, a sole proprietorship<br />
                  Udyam Registration No. UDYAM-GJ-01-0663897
                </p>
              </div>

              <div>
                <p class="text-xs font-body text-gray-500 uppercase tracking-wider mb-1">Registered address</p>
                <p class="text-sm font-body text-gray-700">
                  27, Nirmal Bunglows, Nr Karnavati Park,<br />
                  Opp Baroda Expressway, CTM,<br />
                  Ahmedabad, Gujarat 380026, India
                </p>
              </div>

              <div>
                <p class="text-xs font-body text-gray-500 uppercase tracking-wider mb-1">Email</p>
                <p class="text-sm font-body text-gray-700">
                  <a href="mailto:support&#64;cosmisk.com" class="text-accent underline">support&#64;cosmisk.com</a>
                </p>
              </div>

              <div>
                <p class="text-xs font-body text-gray-500 uppercase tracking-wider mb-1">Phone</p>
                <p class="text-sm font-body text-gray-700">
                  <a href="tel:+919662598320" class="text-accent underline">+91 96625 98320</a>
                </p>
              </div>

              <div>
                <p class="text-xs font-body text-gray-500 uppercase tracking-wider mb-1">Working hours</p>
                <p class="text-sm font-body text-gray-700">
                  Monday to Friday, 10:00 to 18:00 IST, excluding public holidays in India
                </p>
              </div>

              <div>
                <p class="text-xs font-body text-gray-500 uppercase tracking-wider mb-1">Response time</p>
                <p class="text-sm font-body text-gray-700">
                  Acknowledgement within 48 hours; resolution within 30 days of receipt
                </p>
              </div>

            </div>
          </div>

          <hr class="border-gray-100" />

          <!-- Escalation -->
          <div>
            <h2 class="text-xl font-display font-bold text-navy mb-4">Escalation</h2>
            <p class="text-sm text-gray-600 font-body leading-relaxed">
              If you are not satisfied with the resolution provided, you may escalate the matter in accordance with the mechanisms available under the Digital Personal Data Protection Act, 2023.
            </p>
          </div>

        </div>
      </div>
    </section>
  `
})
export default class GrievanceOfficerComponent {}
