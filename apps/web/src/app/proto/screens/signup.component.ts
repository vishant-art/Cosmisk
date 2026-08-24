import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ProtoStateService } from '../proto-state.service';
import { DEMO_EMAIL } from '../proto-data';

/**
 * PROTOTYPE — Blueprint §6.
 * Phone number was cut: nothing in Slice 1 uses it, so it was unjustified friction.
 * Fields are email + password only.
 */
@Component({
  selector: 'proto-signup',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="animate-fade-in">
      <h1 class="text-2xl font-display font-bold text-navy mb-1">Create your account</h1>
      <p class="text-sm text-gray-500 font-body mb-8">
        Two fields. You will see your first finding in under three minutes.
      </p>

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="space-y-5">
          <div>
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Work email</label>
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
            <label class="block text-sm font-body font-medium text-navy mb-1.5">Password</label>
            <div class="relative">
              <input [type]="showPassword() ? 'text' : 'password'" formControlName="password"
                class="input !rounded-xl !py-3 !pr-16"
                [class.!border-red-300]="invalid('password')"
                placeholder="At least 8 characters">
              <button type="button" (click)="showPassword.set(!showPassword())"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy text-xs font-medium border-0 bg-transparent cursor-pointer flex items-center gap-1">
                <lucide-icon name="eye" [size]="14"></lucide-icon>
                {{ showPassword() ? 'Hide' : 'Show' }}
              </button>
            </div>

            <!-- Strength meter -->
            @if (form.get('password')?.value) {
              <div class="mt-2.5">
                <div class="flex gap-1.5 mb-1.5">
                  @for (i of [0,1,2]; track i) {
                    <div class="h-1 flex-1 rounded-full transition-colors duration-300"
                      [class]="i < strength() ? strengthColor() : 'bg-gray-200'"></div>
                  }
                </div>
                <p class="text-[11px] font-body m-0" [class]="strengthTextColor()">{{ strengthLabel() }}</p>
              </div>
            }
          </div>

          <button type="submit" [disabled]="loading()"
            class="btn-primary w-full !rounded-xl !py-3 !text-[15px]">
            @if (loading()) {
              <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block"></span>
              Creating account…
            } @else {
              Create account
              <lucide-icon name="arrow-right" [size]="16"></lucide-icon>
            }
          </button>

          <p class="text-[11px] text-gray-400 font-body text-center m-0 leading-relaxed">
            By creating an account you agree to our Terms and Privacy Policy.
          </p>
        </div>
      </form>

      <p class="text-sm text-gray-500 font-body text-center mt-7 mb-0">
        Already have an account?
        <a routerLink="/proto/login" class="text-accent hover:text-accent-hover font-medium no-underline ml-1">Log in</a>
      </p>
    </div>
  `,
})
export default class ProtoSignupComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private state = inject(ProtoStateService);

  showPassword = signal(false);
  loading = signal(false);

  form = this.fb.group({
    email: [DEMO_EMAIL, [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  private pw = signal('');

  constructor() {
    this.form.get('password')!.valueChanges.subscribe((v) => this.pw.set(v || ''));
  }

  strength = computed(() => {
    const v = this.pw();
    if (v.length < 8) return 1;
    const varied = /[A-Z]/.test(v) && /[0-9]/.test(v);
    return varied ? 3 : 2;
  });
  strengthColor = computed(() => ['', 'bg-red-400', 'bg-amber-400', 'bg-emerald-500'][this.strength()]);
  strengthTextColor = computed(() => ['', 'text-red-500', 'text-amber-600', 'text-emerald-600'][this.strength()]);
  strengthLabel = computed(() =>
    ['', 'Too short — use at least 8 characters', 'Decent — add a number and a capital', 'Strong password'][this.strength()]
  );

  invalid(name: string) {
    const c = this.form.get(name);
    return !!c && c.invalid && c.touched;
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    setTimeout(() => {
      this.loading.set(false);
      this.state.email.set(this.form.value.email!);
      this.router.navigate(['/proto/onboarding']);
    }, 700);
  }
}
