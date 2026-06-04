import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { ApiService } from '../../../core/services/api.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="min-h-screen bg-cream flex items-center justify-center px-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <a routerLink="/" class="text-2xl font-display font-bold text-navy no-underline">COSMISK</a>
        </div>

        <div class="bg-white rounded-card p-8 shadow-card">
          @if (!token) {
            <!-- No token -->
            <div class="text-center">
              <div class="w-16 h-16 mx-auto mb-4 bg-red-50 rounded-full flex items-center justify-center">
                <lucide-icon name="alert-triangle" [size]="32" class="text-red-500"></lucide-icon>
              </div>
              <h1 class="text-page-title font-display text-navy mb-2">Invalid link</h1>
              <p class="text-sm text-gray-500 font-body mb-6">This password reset link is invalid or has expired.</p>
              <a routerLink="/forgot-password" class="btn-primary inline-block !py-3 !px-8 no-underline">Request new link</a>
            </div>
          } @else if (success()) {
            <!-- Success -->
            <div class="text-center">
              <div class="w-16 h-16 mx-auto mb-4 bg-green-50 rounded-full flex items-center justify-center">
                <lucide-icon name="check-circle" [size]="32" class="text-emerald-500"></lucide-icon>
              </div>
              <h1 class="text-page-title font-display text-navy mb-2">Password reset</h1>
              <p class="text-sm text-gray-500 font-body mb-6">Your password has been successfully reset. You can now log in with your new password.</p>
              <a routerLink="/login" class="btn-primary inline-block !py-3 !px-8 no-underline">Go to Login</a>
            </div>
          } @else {
            <!-- Reset form -->
            <div class="text-center mb-6">
              <div class="w-16 h-16 mx-auto mb-4 bg-accent/10 rounded-full flex items-center justify-center">
                <lucide-icon name="lock" [size]="32" class="text-accent"></lucide-icon>
              </div>
              <h1 class="text-page-title font-display text-navy mb-2">Set new password</h1>
              <p class="text-sm text-gray-500 font-body">Enter your new password below.</p>
            </div>

            <form [formGroup]="form" (ngSubmit)="onSubmit()">
              <div class="mb-4">
                <label class="block text-sm font-body font-medium text-navy mb-1">New password</label>
                <input
                  type="password"
                  formControlName="password"
                  class="input"
                  [class.!border-red-400]="form.get('password')?.invalid && form.get('password')?.touched"
                  placeholder="Min. 8 characters">
                @if (form.get('password')?.hasError('required') && form.get('password')?.touched) {
                  <p class="text-xs text-red-500 mt-1 m-0">Password is required</p>
                }
                @if (form.get('password')?.hasError('minlength') && form.get('password')?.touched) {
                  <p class="text-xs text-red-500 mt-1 m-0">Password must be at least 8 characters</p>
                }
              </div>

              <div class="mb-4">
                <label class="block text-sm font-body font-medium text-navy mb-1">Confirm password</label>
                <input
                  type="password"
                  formControlName="confirmPassword"
                  class="input"
                  [class.!border-red-400]="form.get('confirmPassword')?.touched && passwordMismatch()"
                  placeholder="Repeat your password">
                @if (form.get('confirmPassword')?.touched && passwordMismatch()) {
                  <p class="text-xs text-red-500 mt-1 m-0">Passwords do not match</p>
                }
              </div>

              @if (errorMsg()) {
                <div class="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p class="text-sm text-red-600 font-body m-0">{{ errorMsg() }}</p>
                </div>
              }

              <button
                type="submit"
                class="btn-primary w-full !py-3"
                [disabled]="loading()">
                {{ loading() ? 'Resetting...' : 'Reset Password' }}
              </button>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export default class ResetPasswordComponent implements OnInit {
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  token: string | null = null;
  loading = signal(false);
  success = signal(false);
  errorMsg = signal<string | null>(null);

  form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  });

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token');
  }

  passwordMismatch(): boolean {
    return this.form.get('password')?.value !== this.form.get('confirmPassword')?.value;
  }

  onSubmit() {
    if (this.form.invalid || this.passwordMismatch()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMsg.set(null);

    this.api.post<{ success: boolean; error?: string }>('auth/reset-password', {
      token: this.token,
      password: this.form.get('password')?.value,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.success) {
          this.success.set(true);
          this.toast.success('Password reset', 'You can now log in with your new password.');
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.error || 'Failed to reset password. The link may have expired.');
      },
    });
  }
}
