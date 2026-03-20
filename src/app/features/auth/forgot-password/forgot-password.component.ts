import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { ApiService } from '../../../core/services/api.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="min-h-screen bg-cream flex items-center justify-center px-4">
      <div class="w-full max-w-md">
        <!-- Logo -->
        <div class="text-center mb-8">
          <a routerLink="/" class="text-2xl font-display font-bold text-navy no-underline">COSMISK</a>
        </div>

        <div class="bg-white rounded-card p-8 shadow-card">
          @if (step() === 1) {
            <!-- Step 1: Enter Email -->
            <div class="text-center mb-6">
              <div class="w-16 h-16 mx-auto mb-4 bg-accent/10 rounded-full flex items-center justify-center">
                <lucide-icon name="key-round" [size]="32" class="text-accent"></lucide-icon>
              </div>
              <h1 class="text-page-title font-display text-navy mb-2">Reset your password</h1>
              <p class="text-sm text-gray-500 font-body">Enter your email and we'll send you a reset link.</p>
            </div>

            <form [formGroup]="form" (ngSubmit)="onSubmit()">
              <div class="mb-4">
                <label class="block text-sm font-body font-medium text-navy mb-1">Email address</label>
                <input
                  type="email"
                  formControlName="email"
                  class="input"
                  [class.!border-red-400]="form.get('email')?.invalid && form.get('email')?.touched"
                  placeholder="you&#64;company.com">
                @if (form.get('email')?.invalid && form.get('email')?.touched) {
                  <p class="text-xs text-red-500 mt-1 m-0">Please enter a valid email address</p>
                }
              </div>

              <button
                type="submit"
                class="btn-primary w-full !py-3 mb-4"
                [disabled]="loading()">
                {{ loading() ? 'Sending...' : 'Send Reset Link' }}
              </button>
            </form>

            <p class="text-center text-sm text-gray-500 font-body m-0">
              <a routerLink="/login" class="text-accent font-medium hover:underline no-underline inline-flex items-center gap-1"><lucide-icon name="arrow-left" [size]="14"></lucide-icon> Back to login</a>
            </p>
          }

          @if (step() === 2) {
            <!-- Step 2: Confirmation -->
            <div class="text-center">
              <div class="w-16 h-16 mx-auto mb-4 bg-green-50 rounded-full flex items-center justify-center">
                <lucide-icon name="mail" [size]="32" class="text-accent"></lucide-icon>
              </div>
              <h1 class="text-page-title font-display text-navy mb-2">Check your email</h1>
              <p class="text-sm text-gray-500 font-body mb-6">
                We've sent a password reset link to<br>
                <span class="font-semibold text-navy">{{ submittedEmail }}</span>
              </p>
              <p class="text-xs text-gray-400 font-body mb-6">
                Didn't receive the email? Check your spam folder or
                <button
                  (click)="resend()"
                  class="text-accent hover:underline border-0 bg-transparent cursor-pointer font-body text-xs p-0">
                  resend it
                </button>.
              </p>
              <a routerLink="/login" class="btn-primary inline-block !py-3 !px-8 no-underline">Back to Login</a>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export default class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private api = inject(ApiService);

  step = signal(1);
  loading = signal(false);
  submittedEmail = '';

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.submittedEmail = this.form.get('email')?.value || '';

    this.api.post<{ success: boolean }>('auth/forgot-password', {
      email: this.submittedEmail,
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.step.set(2);
        this.toast.success('Reset link sent!', 'Check your inbox.');
      },
      error: () => {
        this.loading.set(false);
        // Still show success to prevent email enumeration
        this.step.set(2);
      },
    });
  }

  resend() {
    this.api.post('auth/forgot-password', { email: this.submittedEmail }).subscribe({
      next: () => this.toast.info('Email resent', 'Check your inbox again.'),
      error: () => this.toast.info('Email resent', 'Check your inbox again.'),
    });
  }
}
