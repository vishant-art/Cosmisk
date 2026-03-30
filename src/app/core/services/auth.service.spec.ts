import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { of } from 'rxjs';
import { AuthResponse, User } from '../models/user.model';

describe('AuthService', () => {
  let service: AuthService;
  let apiSpy: jasmine.SpyObj<ApiService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockUser: User = {
    id: 'u1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'owner',
    onboardingComplete: false,
    plan: 'trial',
    createdAt: '2024-01-01',
  };

  const mockAuthResponse: AuthResponse = {
    token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.sig',
    user: mockUser,
  };

  beforeEach(() => {
    localStorage.clear();

    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with no user and not logged in', () => {
    expect(service.user()).toBeNull();
    expect(service.isLoggedIn()).toBeFalse();
    expect(service.isOnboardingComplete()).toBeFalse();
  });

  describe('login', () => {
    it('should call api.post with login endpoint', () => {
      apiSpy.post.and.returnValue(of(mockAuthResponse));
      service.login('test@example.com', 'password123');
      expect(apiSpy.post).toHaveBeenCalledWith(jasmine.any(String), { email: 'test@example.com', password: 'password123' });
    });
  });

  describe('signup', () => {
    it('should call api.post with signup endpoint', () => {
      apiSpy.post.and.returnValue(of(mockAuthResponse));
      service.signup('Test', 'test@example.com', 'password123');
      expect(apiSpy.post).toHaveBeenCalledWith(jasmine.any(String), { name: 'Test', email: 'test@example.com', password: 'password123' });
    });
  });

  describe('handleAuthResponse', () => {
    it('should store token and user', () => {
      service.handleAuthResponse(mockAuthResponse);
      expect(service.user()).toEqual(mockUser);
      expect(service.getToken()).toBe(mockAuthResponse.token);
      expect(service.isLoggedIn()).toBeTrue();
      expect(localStorage.getItem('cosmisk_token')).toBe(mockAuthResponse.token);
      expect(localStorage.getItem('cosmisk_user')).toBe(JSON.stringify(mockUser));
    });
  });

  describe('setOnboardingComplete', () => {
    it('should update onboarding status', () => {
      service.handleAuthResponse(mockAuthResponse);
      service.setOnboardingComplete();
      expect(service.isOnboardingComplete()).toBeTrue();
      const storedUser = JSON.parse(localStorage.getItem('cosmisk_user')!);
      expect(storedUser.onboardingComplete).toBeTrue();
    });

    it('should do nothing if no user', () => {
      service.setOnboardingComplete();
      expect(service.user()).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear state and navigate to login', () => {
      service.handleAuthResponse(mockAuthResponse);
      service.logout();
      expect(service.user()).toBeNull();
      expect(service.getToken()).toBeNull();
      expect(service.isLoggedIn()).toBeFalse();
      expect(localStorage.getItem('cosmisk_token')).toBeNull();
      expect(localStorage.getItem('cosmisk_user')).toBeNull();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('loadFromStorage', () => {
    it('should restore user from valid stored token', () => {
      const validToken = 'header.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.sig';
      localStorage.setItem('cosmisk_token', validToken);
      localStorage.setItem('cosmisk_user', JSON.stringify(mockUser));

      // Re-create service to trigger constructor
      const freshService = TestBed.inject(AuthService);
      // Since it's providedIn root, we need a new injector
      // But the constructor already ran. Let's test with fresh TestBed.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [HttpClientTestingModule],
        providers: [
          { provide: ApiService, useValue: apiSpy },
          { provide: Router, useValue: routerSpy },
        ],
      });
      const newService = TestBed.inject(AuthService);
      expect(newService.user()).toEqual(mockUser);
      expect(newService.isLoggedIn()).toBeTrue();
    });

    it('should clear expired token from storage', () => {
      const expiredToken = 'header.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 })) + '.sig';
      localStorage.setItem('cosmisk_token', expiredToken);
      localStorage.setItem('cosmisk_user', JSON.stringify(mockUser));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [HttpClientTestingModule],
        providers: [
          { provide: ApiService, useValue: apiSpy },
          { provide: Router, useValue: routerSpy },
        ],
      });
      const newService = TestBed.inject(AuthService);
      expect(newService.user()).toBeNull();
      expect(localStorage.getItem('cosmisk_token')).toBeNull();
    });

    it('should clear malformed token from storage', () => {
      localStorage.setItem('cosmisk_token', 'malformed-token');
      localStorage.setItem('cosmisk_user', JSON.stringify(mockUser));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [HttpClientTestingModule],
        providers: [
          { provide: ApiService, useValue: apiSpy },
          { provide: Router, useValue: routerSpy },
        ],
      });
      const newService = TestBed.inject(AuthService);
      expect(newService.user()).toBeNull();
      expect(localStorage.getItem('cosmisk_token')).toBeNull();
    });
  });

  describe('getToken', () => {
    it('should return null when not authenticated', () => {
      expect(service.getToken()).toBeNull();
    });

    it('should return token when authenticated', () => {
      service.handleAuthResponse(mockAuthResponse);
      expect(service.getToken()).toBe(mockAuthResponse.token);
    });
  });
});
