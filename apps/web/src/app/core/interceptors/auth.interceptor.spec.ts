import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpHandlerFn, HttpEvent, HttpResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let authService: jasmine.SpyObj<AuthService>;
  let mockNext: jasmine.Spy<HttpHandlerFn>;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['getToken']);
    mockNext = jasmine.createSpy('next').and.callFake(
      (req: HttpRequest<unknown>) => of(new HttpResponse({ status: 200 }))
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authService },
      ],
    });
  });

  it('should add Authorization header when token exists', () => {
    authService.getToken.and.returnValue('my-jwt-token');
    const req = new HttpRequest('GET', '/api/data');

    TestBed.runInInjectionContext(() => authInterceptor(req, mockNext));

    const passedReq = mockNext.calls.mostRecent().args[0] as HttpRequest<unknown>;
    expect(passedReq.headers.get('Authorization')).toBe('Bearer my-jwt-token');
  });

  it('should not modify request when no token exists', () => {
    authService.getToken.and.returnValue(null);
    const req = new HttpRequest('GET', '/api/data');

    TestBed.runInInjectionContext(() => authInterceptor(req, mockNext));

    const passedReq = mockNext.calls.mostRecent().args[0] as HttpRequest<unknown>;
    expect(passedReq.headers.has('Authorization')).toBe(false);
  });

  it('should pass the original URL through unchanged', () => {
    authService.getToken.and.returnValue('token-123');
    const req = new HttpRequest('POST', '/api/users', { name: 'test' });

    TestBed.runInInjectionContext(() => authInterceptor(req, mockNext));

    const passedReq = mockNext.calls.mostRecent().args[0] as HttpRequest<unknown>;
    expect(passedReq.url).toBe('/api/users');
    expect(passedReq.method).toBe('POST');
  });

  it('should always call next handler', () => {
    authService.getToken.and.returnValue(null);
    const req = new HttpRequest('GET', '/api/test');

    TestBed.runInInjectionContext(() => authInterceptor(req, mockNext));

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should preserve existing headers when adding Authorization', () => {
    authService.getToken.and.returnValue('abc');
    // Build a request with a custom header
    const customReq = new HttpRequest('GET', '/api/data');
    const reqWithHeader = customReq.clone({ setHeaders: { 'X-Custom': 'value' } });

    TestBed.runInInjectionContext(() => authInterceptor(reqWithHeader, mockNext));

    const passedReq = mockNext.calls.mostRecent().args[0] as HttpRequest<unknown>;
    expect(passedReq.headers.get('Authorization')).toBe('Bearer abc');
    expect(passedReq.headers.get('X-Custom')).toBe('value');
  });
});
