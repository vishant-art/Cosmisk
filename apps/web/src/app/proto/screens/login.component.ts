import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ProtoStateService } from '../proto-state.service';
import { DEMO_EMAIL } from '../proto-data';

/** PROTOTYPE — no AuthService, no HTTP. Credentials are never sent anywhere. */
@Component({
  selector: 'proto-login',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="animate-fade-in">
      <h1 class="text-2xl font-display font-bold text-navy mb-1">Welcome back</h1>
      <p class="text-sm text-gray-500 font-body mb-8">Log in to continue to Cosmisk.</p>

      <!-- Google SSO — genuinely not built, so it stays disabled -->
      <button disabled title="Not available yet"
        class="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-gray-200 rounded-xl font-body font-medium text-sm text-gray-400 cursor-not-allowed shadow-sm">
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 3.58Z" fill="#EA4335"/>
        </svg>
        Continue with Google
        <span class="text-[10px] text-gray-300 ml-auto">Soon</span>
      </button>

      <div class="flex items-center gap-4 my-6">
        <div class="flex-1 h-px bg-gray-200"></div>
        <span class="text-[11px] text-gray-400 font-mono uppercase tracking-wider">or continue with email</span>
        <div class="flex-1 h-px bg-gray-200"></div>
      </div>

      @if (errorMessage()) {
        <div class="mb-5 px-4 py-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2.5 animate-scale-in">
          <lucide-icon name="alert-circle" [size]="16" class="text-red-500 shrink-0"></lucide-icon>
          <p class="text-sm text-red-600 font-body m-0">{{ errorMessage() }}</p>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="space-y-5">
          <div>
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Email address</label>
            <div class="relative">
              <input type="email" formControlName="email"
                class="input !rounded-xl !py-3"
                [class.!border-red-300]="invalid('email')"
                placeholder="you&#64;company.com">
              @if (form.get('email')?.valid && form.get('email')?.touched) {
                <div class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <lucide-icon name="check" [size]="12" class="text-emerald-600"></lucide-icon>
                </div>
              }
            </div>
            @if (invalid('email')) {
              <p class="text-xs text-red-500 mt-1.5 m-0 flex items-center gap-1">
                <lucide-icon name="info" [size]="12"></lucide-icon> Please enter a valid email
              </p>
            }
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-sm font-body font-medium text-navy">Password</label>
              <a routerLink="/proto/login" class="text-xs text-accent hover:text-accent-hover font-body font-medium no-underline">Forgot?</a>
            </div>
            <div class="relative">
              <input [type]="showPassword() ? 'text' : 'password'" formControlName="password"
                class="input !rounded-xl !py-3 !pr-16"
                [class.!border-red-300]="invalid('password')"
                placeholder="Enter your password">
              <button type="button" (click)="showPassword.set(!showPassword())"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy text-xs font-medium border-0 bg-transparent cursor-pointer flex items-center gap-1">
                <lucide-icon name="eye" [size]="14"></lucide-icon>
                {{ showPassword() ? 'Hide' : 'Show' }}
              </button>
            </div>
            @if (invalid('password')) {
              <p class="text-xs text-red-500 mt-1.5 m-0 flex items-center gap-1">
                <lucide-icon name="info" [size]="12"></lucide-icon> Password must be at least 6 characters
              </p>
            }
          </div>

          <button type="submit" [disabled]="loading()"
            class="btn-primary w-full !rounded-xl !py-3 !text-[15px]">
            @if (loading()) {
              <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block"></span>
              Logging in…
            } @else {
              Log in
              <lucide-icon name="arrow-right" [size]="16"></lucide-icon>
            }
          </button>
        </div>
      </form>

      <p class="text-sm text-gray-500 font-body text-center mt-7 mb-0">
        New to Cosmisk?
        <a routerLink="/proto/signup" class="text-accent hover:text-accent-hover font-medium no-underline ml-1">Create an account</a>
      </p>

      <!-- Prototype affordance: not part of the product -->
      <div class="mt-8 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
        <p class="text-[11px] font-mono uppercase tracking-wider text-amber-700 m-0 mb-1">Prototype</p>
        <p class="text-xs text-amber-800 font-body m-0 leading-relaxed">
          Any email and a 6+ character password will log you in — nothing is sent to a server.
          Use <span class="font-mono">fail&#64;cosmisk.com</span> to see the error state.
        </p>
      </div>
    </div>
  `,
})
export default class ProtoLoginComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private state = inject(ProtoStateService);

  showPassword = signal(false);
  loading = signal(false);
  errorMessage = signal('');

  form = this.fb.group({
    email: [DEMO_EMAIL, [Validators.required, Validators.email]],
    password: ['cosmisk123', [Validators.required, Validators.minLength(6)]],
  });

  invalid(name: string) {
    const c = this.form.get(name);
    return !!c && c.invalid && c.touched;
  }

  onSubmit() {
    this.errorMessage.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    setTimeout(() => {
      this.loading.set(false);
      const email = this.form.value.email!;
      if (email === 'fail@cosmisk.com') {
        this.errorMessage.set('That email and password combination does not match an account.');
        return;
      }
      this.state.email.set(email);
      this.router.navigate(['/proto/dashboard']);
    }, 700);
  }
}
