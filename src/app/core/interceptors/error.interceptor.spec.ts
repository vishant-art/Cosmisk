import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { errorInterceptor } from './error.interceptor';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

describe('errorInterceptor', () => {
  let httpClient: HttpClient;
  let httpTesting: HttpTestingController;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockToastService: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['getToken', 'logout'], {
      isLoggedIn: jasmine.createSpy('isLoggedIn'),
      isOnboardingComplete: jasmine.createSpy('isOnboardingComplete'),
    });
    mockToastService = jasmine.createSpyObj('ToastService', ['show', 'success', 'error', 'warning', 'info', 'dismiss']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ToastService, useValue: mockToastService },
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should call logout and show toast on 401 for non-auth endpoints', () => {
    httpClient.get('/api/data').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(401);
      },
    });

    const req = httpTesting.expectOne('/api/data');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(mockToastService.error).toHaveBeenCalledWith('Session expired', 'Please log in again.');
    expect(mockAuthService.logout).toHaveBeenCalled();
  });

  it('should not call logout on 401 for auth/login endpoint', () => {
    httpClient.get('/api/auth/login').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(401);
      },
    });

    const req = httpTesting.expectOne('/api/auth/login');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(mockAuthService.logout).not.toHaveBeenCalled();
  });

  it('should not call logout on 401 for auth/signup endpoint', () => {
    httpClient.get('/api/auth/signup').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(401);
      },
    });

    const req = httpTesting.expectOne('/api/auth/signup');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(mockAuthService.logout).not.toHaveBeenCalled();
  });

  it('should show forbidden toast on 403', () => {
    httpClient.get('/api/data').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(403);
      },
    });

    const req = httpTesting.expectOne('/api/data');
    req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

    expect(mockToastService.error).toHaveBeenCalledWith('Access denied', "You don't have permission to do that.");
  });

  it('should show error toast on 500', () => {
    httpClient.get('/api/data').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(500);
      },
    });

    const req = httpTesting.expectOne('/api/data');
    req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });

    expect(mockToastService.error).toHaveBeenCalledWith('Something went wrong', "We've been notified. Please try again.");
  });

  it('should show error toast on network error (status 0)', () => {
    httpClient.get('/api/data').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(0);
      },
    });

    const req = httpTesting.expectOne('/api/data');
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(mockToastService.error).toHaveBeenCalledWith('Something went wrong', "We've been notified. Please try again.");
  });

  it('should show warning toast on 429', () => {
    httpClient.get('/api/data').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(429);
      },
    });

    const req = httpTesting.expectOne('/api/data');
    req.flush('Rate Limited', { status: 429, statusText: 'Too Many Requests' });

    expect(mockToastService.warning).toHaveBeenCalledWith('Rate limited', "Too many requests. We'll retry automatically.");
  });

  it('should not show toast for 404 errors', () => {
    httpClient.get('/api/data').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(404);
      },
    });

    const req = httpTesting.expectOne('/api/data');
    req.flush('Not Found', { status: 404, statusText: 'Not Found' });

    expect(mockToastService.error).not.toHaveBeenCalled();
    expect(mockToastService.warning).not.toHaveBeenCalled();
  });

  it('should skip toast for silent endpoints', () => {
    httpClient.get('/api/analytics/full').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(500);
      },
    });

    const req = httpTesting.expectOne('/api/analytics/full');
    req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });

    expect(mockToastService.error).not.toHaveBeenCalled();
  });

  it('should skip toast for ad-accounts/kpis silent endpoint', () => {
    httpClient.get('/api/ad-accounts/kpis').subscribe({
      error: (err: HttpErrorResponse) => {
        expect(err.status).toBe(401);
      },
    });

    const req = httpTesting.expectOne('/api/ad-accounts/kpis');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(mockToastService.error).not.toHaveBeenCalled();
    expect(mockAuthService.logout).not.toHaveBeenCalled();
  });
});
