import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, LucideAngularModule],
  template: `
    <div>
      <h1 class="text-page-title font-display text-navy mb-2">Start your free trial</h1>
      <p class="text-sm text-gray-500 font-body mb-8">14 days free. No credit card needed.</p>

      <!-- Google SSO -->
      <button disabled title="Coming soon" class="w-full flex items-center justify-center gap-3 py-3 px-4 bg-gray-50 border border-border rounded-lg font-body font-medium text-sm text-gray-400 cursor-not-allowed opacity-60">
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58Z" fill="#EA4335"/>
        </svg>
        Continue with Google <span class="text-[10px] ml-1">(Coming soon)</span>
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
          <!-- Full Name -->
          <div>
            <label class="block text-sm font-body font-medium text-navy mb-1">Full Name</label>
            <div class="relative">
              <input
                type="text"
                formControlName="name"
                class="input"
                [class.!border-red-400]="form.get('name')?.invalid && form.get('name')?.touched"
                [class.!border-green-400]="form.get('name')?.valid && form.get('name')?.touched"
                placeholder="Your full name">
              @if (form.get('name')?.valid && form.get('name')?.touched) {
                <lucide-icon name="check" [size]="14" class="absolute right-3 top-1/2 -translate-y-1/2 text-green-500"></lucide-icon>
              }
            </div>
            @if (form.get('name')?.invalid && form.get('name')?.touched) {
              <p class="text-xs text-red-500 mt-1 m-0">Name is required</p>
            }
          </div>

          <!-- Work Email -->
          <div>
            <label class="block text-sm font-body font-medium text-navy mb-1">Work Email</label>
            <div class="relative">
              <input
                type="email"
                formControlName="email"
                class="input"
                [class.!border-red-400]="form.get('email')?.invalid && form.get('email')?.touched"
                [class.!border-green-400]="form.get('email')?.valid && form.get('email')?.touched"
                placeholder="you&#64;company.com">
              @if (form.get('email')?.valid && form.get('email')?.touched) {
                <lucide-icon name="check" [size]="14" class="absolute right-3 top-1/2 -translate-y-1/2 text-green-500"></lucide-icon>
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
                [class.!border-green-400]="form.get('password')?.valid && form.get('password')?.touched"
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
            @if (form.get('password')?.value) {
              <div class="mt-2 flex gap-1">
                @for (i of [0,1,2,3]; track i) {
                  <div class="flex-1 h-1 rounded-full transition-colors"
                    [ngClass]="i < getPasswordStrength() ? (getPasswordStrength() <= 1 ? 'bg-red-400' : getPasswordStrength() <= 2 ? 'bg-yellow-400' : getPasswordStrength() <= 3 ? 'bg-blue-400' : 'bg-green-400') : 'bg-gray-200'">
                  </div>
                }
              </div>
              <p class="text-xs mt-1 m-0" [ngClass]="getPasswordStrength() <= 1 ? 'text-red-500' : getPasswordStrength() <= 2 ? 'text-yellow-600' : getPasswordStrength() <= 3 ? 'text-blue-600' : 'text-green-600'">
                {{ ['', 'Weak', 'Fair', 'Good', 'Strong'][getPasswordStrength()] }}
              </p>
            }
          </div>

          <!-- Terms -->
          <label class="flex items-start gap-2 text-sm font-body text-gray-600 cursor-pointer">
            <input type="checkbox" formControlName="terms" class="rounded border-border text-accent mt-0.5">
            <span>I agree to the <a class="text-accent hover:underline no-underline cursor-pointer">Terms of Service</a> and <a class="text-accent hover:underline no-underline cursor-pointer">Privacy Policy</a></span>
          </label>

          <button
            type="submit"
            class="btn-primary w-full !py-3"
            [disabled]="loading() || !form.get('terms')?.value">
            @if (loading()) {
              <span class="inline-flex items-center gap-2">
                <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Creating account...
              </span>
            } @else {
              Create Account
            }
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

  getPasswordStrength(): number {
    const pw = this.form.get('password')?.value || '';
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  }

  onSubmit() {
    if (this.form.invalid || !this.form.get('terms')?.value) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { name, email, password } = this.form.value;
    this.auth.signup(name!, email!, password!).subscribe({
      next: (res) => {
        this.auth.handleAuthResponse(res);
        this.toast.success('Account created!', 'Welcome to Cosmisk.');
        this.router.navigate(['/onboarding']);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error('Signup failed', err.error?.error || 'Please try again.');
      },
    });
  }
}
