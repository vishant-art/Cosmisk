import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { User, AuthResponse } from '../models/user.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  private currentUser = signal<User | null>(null);
  private token = signal<string | null>(null);

  user = this.currentUser.asReadonly();
  isLoggedIn = computed(() => !!this.currentUser());
  isOnboardingComplete = computed(() => this.currentUser()?.onboardingComplete ?? false);

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const storedToken = localStorage.getItem('cosmisk_token');
    const storedUser = localStorage.getItem('cosmisk_user');
    if (storedToken && storedUser) {
      try {
        const payload = JSON.parse(atob(storedToken.split('.')[1]));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          localStorage.removeItem('cosmisk_token');
          localStorage.removeItem('cosmisk_user');
          return;
        }
      } catch { /* malformed token — clear it */
        localStorage.removeItem('cosmisk_token');
        localStorage.removeItem('cosmisk_user');
        return;
      }
      this.token.set(storedToken);
      this.currentUser.set(JSON.parse(storedUser));
    }
  }

  private storeAuth(response: AuthResponse) {
    this.token.set(response.token);
    this.currentUser.set(response.user);
    localStorage.setItem('cosmisk_token', response.token);
    localStorage.setItem('cosmisk_user', JSON.stringify(response.user));
  }

  getToken(): string | null {
    return this.token();
  }

  login(email: string, password: string) {
    return this.api.post<AuthResponse>(environment.AUTH_LOGIN, { email, password });
  }

  signup(name: string, email: string, password: string) {
    return this.api.post<AuthResponse>(environment.AUTH_SIGNUP, { name, email, password });
  }

  handleAuthResponse(response: AuthResponse) {
    this.storeAuth(response);
  }

  setOnboardingComplete() {
    const user = this.currentUser();
    if (user) {
      const updated = { ...user, onboardingComplete: true };
      this.currentUser.set(updated);
      localStorage.setItem('cosmisk_user', JSON.stringify(updated));
    }
  }

  logout() {
    this.token.set(null);
    this.currentUser.set(null);
    localStorage.removeItem('cosmisk_token');
    localStorage.removeItem('cosmisk_user');
    this.router.navigate(['/login']);
  }

}
