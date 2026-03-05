import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-data-deletion',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-white py-16 px-6">
      <div class="max-w-2xl mx-auto">

        <!-- Header -->
        <div class="mb-10">
          <h1 class="text-3xl font-bold text-gray-900 mb-3">Data Deletion Instructions</h1>
          <p class="text-gray-500 text-sm">Last updated: March 2026 &nbsp;&middot;&nbsp; cosmisk.com</p>
        </div>

        <!-- Intro -->
        <p class="text-gray-700 text-base leading-relaxed mb-10">
          At Cosmisk, we respect your right to control your personal data. If you would like to delete
          your account and all associated data, you can do so using one of the methods below.
        </p>

        <!-- Steps -->
        <div class="mb-10">
          <h2 class="text-lg font-semibold text-gray-900 mb-5">How to Request Data Deletion</h2>

          <div class="space-y-6">

            <!-- Step 1 -->
            <div class="flex gap-4">
              <div class="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold">
                1
              </div>
              <div>
                <p class="font-semibold text-gray-900 mb-1">Delete your account from within the app</p>
                <p class="text-gray-600 text-sm leading-relaxed">
                  Log into <span class="font-medium text-gray-800">cosmisk.com</span>, navigate to
                  <span class="font-medium text-gray-800">Settings</span>, and click
                  <span class="font-medium text-gray-800">Delete Account</span>. This will immediately
                  schedule your account and all associated data for permanent deletion.
                </p>
              </div>
            </div>

            <!-- Divider -->
            <div class="flex items-center gap-3 pl-4">
              <div class="h-px flex-1 bg-gray-200"></div>
              <span class="text-xs text-gray-400 font-medium uppercase tracking-wide">or</span>
              <div class="h-px flex-1 bg-gray-200"></div>
            </div>

            <!-- Step 2 -->
            <div class="flex gap-4">
              <div class="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold">
                2
              </div>
              <div>
                <p class="font-semibold text-gray-900 mb-1">Send us an email request</p>
                <p class="text-gray-600 text-sm leading-relaxed">
                  Email us at
                  <a href="mailto:support&#64;cosmisk.com?subject=Data Deletion Request"
                     class="text-indigo-600 hover:text-indigo-700 font-medium underline underline-offset-2">
                    support&#64;cosmisk.com
                  </a>
                  with the subject line <span class="font-medium text-gray-800">"Data Deletion Request"</span>.
                  Please include the email address associated with your account. We will process your
                  request and confirm deletion via email.
                </p>
              </div>
            </div>

          </div>
        </div>

        <!-- What gets deleted -->
        <div class="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8">
          <h2 class="text-base font-semibold text-gray-900 mb-4">What We Delete</h2>
          <p class="text-gray-600 text-sm mb-4">
            Upon a verified deletion request, we will permanently remove all of the following within
            <span class="font-semibold text-gray-800">30 days</span>:
          </p>
          <ul class="space-y-2">
            <li class="flex items-start gap-2 text-sm text-gray-600">
              <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
              Your account information (name, email, profile data)
            </li>
            <li class="flex items-start gap-2 text-sm text-gray-600">
              <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
              Meta Ads data fetched and stored on your behalf (campaigns, ad sets, ads, insights)
            </li>
            <li class="flex items-start gap-2 text-sm text-gray-600">
              <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
              AI chat history and any generated recommendations
            </li>
            <li class="flex items-start gap-2 text-sm text-gray-600">
              <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
              Connected integrations and access tokens
            </li>
            <li class="flex items-start gap-2 text-sm text-gray-600">
              <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
              Any other personal data stored in connection with your account
            </li>
          </ul>
        </div>

        <!-- Disconnect Meta note -->
        <div class="border-l-4 border-indigo-400 bg-indigo-50 rounded-r-xl px-5 py-4 mb-10">
          <p class="text-sm text-indigo-900 leading-relaxed">
            <span class="font-semibold">Removing Meta access only:</span> If you want to remove your
            stored Meta data without deleting your entire account, you can go to
            <span class="font-medium">Settings &rarr; Integrations</span> and disconnect your Meta
            account. This removes all stored Meta ad data from our servers immediately.
          </p>
        </div>

        <!-- Contact -->
        <div class="border-t border-gray-200 pt-8">
          <h2 class="text-base font-semibold text-gray-900 mb-2">Questions?</h2>
          <p class="text-gray-600 text-sm leading-relaxed">
            If you have any questions about data deletion or our privacy practices, please contact us at
            <a href="mailto:support&#64;cosmisk.com"
               class="text-indigo-600 hover:text-indigo-700 font-medium underline underline-offset-2">
              support&#64;cosmisk.com
            </a>.
            Cosmisk is operated by Vishant Jain, based in India.
          </p>
        </div>

      </div>
    </div>
  `
})
export default class DataDeletionComponent {}
