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
            <label class="block text-sm font-body font-medium text-navy mb-1">Email</label>
            <input
              type="email"
              formControlName="email"
              class="input"
              placeholder="you&#64;company.com">
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
                placeholder="Enter your password">
              <button
                type="button"
                (click)="showPassword.set(!showPassword())"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm border-0 bg-transparent cursor-pointer">
                {{ showPassword() ? 'Hide' : 'Show' }}
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 text-sm font-body text-gray-600 cursor-pointer">
              <input type="checkbox" formControlName="rememberMe" class="rounded border-border text-accent">
              Remember me
            </label>
            <a class="text-sm text-accent hover:underline font-body no-underline cursor-pointer">Forgot password?</a>
          </div>

          <button
            type="submit"
            class="btn-primary w-full !py-3"
            [disabled]="loading()">
            {{ loading() ? 'Logging in...' : 'Log In' }}
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

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    rememberMe: [false],
  });

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Demo login for development
    this.loading.set(true);
    setTimeout(() => {
      this.auth.demoLogin();
      this.toast.success('Welcome back!');
      this.router.navigate(['/app/dashboard']);
      this.loading.set(false);
    }, 800);
  }
}
