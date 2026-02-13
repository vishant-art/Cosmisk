import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  template: `
    <div>
      <h1 class="text-page-title font-display text-navy mb-2">Start your free trial</h1>
      <p class="text-sm text-gray-500 font-body mb-8">14 days free. No credit card needed.</p>

      <!-- Google SSO -->
      <button class="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-border rounded-lg hover:bg-gray-50 transition-colors font-body font-medium text-sm text-navy cursor-pointer">
        <span class="text-lg">G</span>
        Continue with Google
      </button>

      <!-- Divider -->
      <div class="flex items-center gap-4 my-6">
        <div class="flex-1 h-px bg-divider"></div>
        <span class="text-xs text-gray-400 font-body">or</span>
        <div class="flex-1 h-px bg-divider"></div>
      </div>

      <!-- Form -->
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-body font-medium text-navy mb-1">Full Name</label>
            <input type="text" formControlName="name" class="input" placeholder="Your full name">
            @if (form.get('name')?.invalid && form.get('name')?.touched) {
              <p class="text-xs text-red-500 mt-1 m-0">Name is required</p>
            }
          </div>

          <div>
            <label class="block text-sm font-body font-medium text-navy mb-1">Work Email</label>
            <input type="email" formControlName="email" class="input" placeholder="you&#64;company.com">
            @if (form.get('email')?.invalid && form.get('email')?.touched) {
              <p class="text-xs text-red-500 mt-1 m-0">Please enter a valid email</p>
            }
          </div>

          <div>
            <label class="block text-sm font-body font-medium text-navy mb-1">Password</label>
            <div class="relative">
              <input
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                class="input !pr-12"
                placeholder="Min 8 characters">
              <button
                type="button"
                (click)="showPassword.set(!showPassword())"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm border-0 bg-transparent cursor-pointer">
                {{ showPassword() ? 'Hide' : 'Show' }}
              </button>
            </div>
            @if (form.get('password')?.invalid && form.get('password')?.touched) {
              <p class="text-xs text-red-500 mt-1 m-0">Password must be at least 8 characters</p>
            }
          </div>

          <label class="flex items-start gap-2 text-sm font-body text-gray-600 cursor-pointer">
            <input type="checkbox" formControlName="terms" class="rounded border-border text-accent mt-0.5">
            <span>I agree to the <a class="text-accent hover:underline no-underline cursor-pointer">Terms of Service</a> and <a class="text-accent hover:underline no-underline cursor-pointer">Privacy Policy</a></span>
          </label>

          <button
            type="submit"
            class="btn-primary w-full !py-3"
            [disabled]="loading() || !form.get('terms')?.value">
            {{ loading() ? 'Creating account...' : 'Create Account' }}
          </button>
        </div>
      </form>

      <p class="text-center text-sm text-gray-500 font-body mt-6">
        Already have an account?
        <a routerLink="/login" class="text-accent font-semibold hover:underline no-underline">Log in</a>
      </p>
    </div>
  `
})
export default class SignupComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  showPassword = signal(false);
  loading = signal(false);

  form = this.fb.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    terms: [false],
  });

  onSubmit() {
    if (this.form.invalid || !this.form.get('terms')?.value) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    setTimeout(() => {
      this.auth.demoLogin();
      this.auth.user(); // trigger signal
      this.toast.success('Account created!', 'Welcome to Cosmisk.');
      this.router.navigate(['/onboarding']);
      this.loading.set(false);
    }, 800);
  }
}
