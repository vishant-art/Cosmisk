import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { errorInterceptor } from './error.interceptor';
import { ToastService } from '../services/toast.service';
import { AuthService } from '../services/auth.service';

describe('errorInterceptor', () => {
  let toastService: jasmine.SpyObj<ToastService>;
  let authService: jasmine.SpyObj<AuthService>;

  function createErrorNext(status: number): jasmine.Spy<HttpHandlerFn> {
    return jasmine.createSpy('next').and.returnValue(
      throwError(() => new HttpErrorResponse({ status, url: '/api/test' }))
    );
  }

  beforeEach(() => {
    toastService = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'show']);
    authService = jasmine.createSpyObj('AuthService', ['getToken', 'logout']);

    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: toastService },
        { provide: AuthService, useValue: authService },
      ],
    });
  });

  describe('401 Unauthorized', () => {
    it('should show session expired toast and call logout', (done) => {
      const req = new HttpRequest('GET', '/api/data');
      const next = createErrorNext(401);

      TestBed.runInInjectionContext(() => {
        errorInterceptor(req, next).subscribe({
          error: () => {
            expect(toastService.error).toHaveBeenCalledWith('Session expired', 'Please log in again.');
            expect(authService.logout).toHaveBeenCalled();
            done();
          },
        });
      });
    });

    it('should NOT logout on 401 from auth/login endpoint', (done) => {
      const req = new HttpRequest('POST', '/api/auth/login', {});
      const next = createErrorNext(401);

      TestBed.runInInjectionContext(() => {
        errorInterceptor(req, next).subscribe({
          error: () => {
            expect(authService.logout).not.toHaveBeenCalled();
            expect(toastService.error).not.toHaveBeenCalledWith('Session expired', jasmine.anything());
            done();
          },
        });
      });
    });

    it('should NOT logout on 401 from auth/signup endpoint', (done) => {
      const req = new HttpRequest('POST', '/api/auth/signup', {});
      const next = createErrorNext(401);

      TestBed.runInInjectionContext(() => {
        errorInterceptor(req, next).subscribe({
          error: () => {
            expect(authService.logout).not.toHaveBeenCalled();
            done();
          },
        });
      });
    });
  });

  describe('403 Forbidden', () => {
    it('should show access denied toast', (done) => {
      const req = new HttpRequest('GET', '/api/admin');
      const next = createErrorNext(403);

      TestBed.runInInjectionContext(() => {
        errorInterceptor(req, next).subscribe({
          error: () => {
            expect(toastService.error).toHaveBeenCalledWith(
              'Access denied',
              "You don't have permission to do that."
            );
            done();
          },
        });
      });
    });
  });

  describe('404 Not Found', () => {
    it('should NOT show any toast for 404 errors', (done) => {
      const req = new HttpRequest('GET', '/api/missing');
      const next = createErrorNext(404);

      TestBed.runInInjectionContext(() => {
        errorInterceptor(req, next).subscribe({
          error: () => {
            expect(toastService.error).not.toHaveBeenCalled();
            expect(toastService.warning).not.toHaveBeenCalled();
            done();
          },
        });
      });
    });
  });

  describe('429 Rate Limited', () => {
    it('should show rate limit warning toast', (done) => {
      const req = new HttpRequest('GET', '/api/data');
      const next = createErrorNext(429);

      TestBed.runInInjectionContext(() => {
        errorInterceptor(req, next).subscribe({
          error: () => {
            expect(toastService.warning).toHaveBeenCalledWith(
              'Rate limited',
              "Too many requests. We'll retry automatically."
            );
            done();
          },
        });
      });
    });
  });

  describe('500 Server Error', () => {
    it('should show generic error toast', (done) => {
      const req = new HttpRequest('GET', '/api/data');
      const next = createErrorNext(500);

      TestBed.runInInjectionContext(() => {
        errorInterceptor(req, next).subscribe({
          error: () => {
            expect(toastService.error).toHaveBeenCalledWith(
              'Something went wrong',
              "We've been notified. Please try again."
            );
            done();
          },
        });
      });
    });
  });

  describe('unknown status codes', () => {
    it('should show generic error toast for unhandled status codes', (done) => {
      const req = new HttpRequest('GET', '/api/data');
      const next = createErrorNext(502);

      TestBed.runInInjectionContext(() => {
        errorInterceptor(req, next).subscribe({
          error: () => {
            expect(toastService.error).toHaveBeenCalledWith(
              'Something went wrong',
              "We've been notified. Please try again."
            );
            done();
          },
        });
      });
    });
  });

  describe('silent endpoints', () => {
    const silentUrls = [
      '/api/analytics/full',
      '/api/ad-accounts/kpis',
      '/api/dashboard/chart',
      '/api/dashboard/insights',
      '/api/brain/patterns',
      '/api/reports/list',
      '/api/ad-accounts/video-source/123',
      '/api/ad-accounts/top-ads',
    ];

    silentUrls.forEach((url) => {
      it(`should NOT show toast for silent endpoint: ${url}`, (done) => {
        const req = new HttpRequest('GET', url);
        const next = createErrorNext(500);

        TestBed.runInInjectionContext(() => {
          errorInterceptor(req, next).subscribe({
            error: () => {
              expect(toastService.error).not.toHaveBeenCalled();
              expect(toastService.warning).not.toHaveBeenCalled();
              done();
            },
          });
        });
      });
    });

    it('should still re-throw error for silent endpoints', (done) => {
      const req = new HttpRequest('GET', '/api/analytics/full');
      const next = createErrorNext(500);

      TestBed.runInInjectionContext(() => {
        errorInterceptor(req, next).subscribe({
          error: (err) => {
            expect(err).toBeInstanceOf(HttpErrorResponse);
            expect(err.status).toBe(500);
            done();
          },
        });
      });
    });
  });

  describe('error propagation', () => {
    it('should always re-throw the error after handling', (done) => {
      const req = new HttpRequest('GET', '/api/data');
      const next = createErrorNext(401);

      TestBed.runInInjectionContext(() => {
        errorInterceptor(req, next).subscribe({
          error: (err) => {
            expect(err).toBeInstanceOf(HttpErrorResponse);
            expect(err.status).toBe(401);
            done();
          },
        });
      });
    });
  });
});
