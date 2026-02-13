import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  template: `
    <div>
      <h1 class="text-page-title font-display text-navy mb-2">Welcome back</h1>
      <p class="text-sm text-gray-500 font-body mb-8">Log in to your Cosmisk account.</p>

      <!-- Google SSO -->
      <button class="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-border rounded-lg hover:bg-gray-50 transition-colors font-body font-medium text-sm text-navy cursor-pointer">
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58Z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <!-- Divider -->
      <div class="flex items-center gap-4 my-6">
        <div class="flex-1 h-px bg-divider"></div>
        <span class="text-xs text-gray-400 font-body">or</span>
        <div class="flex-1 h-px bg-divider"></div>
      </div>

      <!-- Error Banner -->
      @if (errorMessage()) {
        <div class="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <span class="text-red-500 text-sm">&#9888;</span>
          <p class="text-sm text-red-600 font-body m-0">{{ errorMessage() }}</p>
        </div>
      }

      <!-- Form -->
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="space-y-4">
          <!-- Email -->
          <div>
            <label class="block text-sm font-body font-medium text-navy mb-1">Email</label>
            <div class="relative">
              <input
                type="email"
                formControlName="email"
                class="input"
                [class.!border-red-400]="form.get('email')?.invalid && form.get('email')?.touched"
                [class.!border-green-400]="form.get('email')?.valid && form.get('email')?.touched"
                placeholder="you&#64;company.com">
              @if (form.get('email')?.valid && form.get('email')?.touched) {
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-sm">&#10003;</span>
              }
            </div>
            @if (form.get('email')?.invalid && form.get('email')?.touched) {
              <p class="text-xs text-red-500 mt-1 m-0">Please enter a valid email</p>
            }
          </div>

          <!-- Password -->
          <div>
            <label class="block text-sm font-body font-medium text-navy mb-1">Password</label>
            <div class="relative">
              <input
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                class="input !pr-20"
                [class.!border-red-400]="form.get('password')?.invalid && form.get('password')?.touched"
                placeholder="Enter your password">
              <button
                type="button"
                (click)="showPassword.set(!showPassword())"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm border-0 bg-transparent cursor-pointer">
                {{ showPassword() ? 'Hide' : 'Show' }}
              </button>
            </div>
            @if (form.get('password')?.invalid && form.get('password')?.touched) {
              <p class="text-xs text-red-500 mt-1 m-0">Password is required</p>
            }
          </div>

          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 text-sm font-body text-gray-600 cursor-pointer">
              <input type="checkbox" formControlName="rememberMe" class="rounded border-border text-accent">
              Remember me
            </label>
            <a routerLink="/forgot-password" class="text-sm text-accent hover:underline font-body no-underline">Forgot password?</a>
          </div>

          <button
            type="submit"
            class="btn-primary w-full !py-3"
            [disabled]="loading()">
            @if (loading()) {
              <span class="inline-flex items-center gap-2">
                <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Logging in...
              </span>
            } @else {
              Log In
            }
          </button>
        </div>
      </form>

      <p class="text-center text-sm text-gray-500 font-body mt-6">
        Don't have an account?
        <a routerLink="/signup" class="text-accent font-semibold hover:underline no-underline">Sign up</a>
      </p>
    </div>
  `
})
export default class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  showPassword = signal(false);
  loading = signal(false);
  errorMessage = signal('');

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    rememberMe: [false],
  });

  onSubmit() {
    this.errorMessage.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    // Demo login for development
    setTimeout(() => {
      this.auth.demoLogin();
      this.toast.success('Welcome back!');
      const user = this.auth.user();
      if (user?.onboardingComplete) {
        this.router.navigate(['/app/dashboard']);
      } else {
        this.router.navigate(['/onboarding']);
      }
      this.loading.set(false);
    }, 800);
  }
}
