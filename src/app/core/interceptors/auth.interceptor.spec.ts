import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpTesting: HttpTestingController;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['getToken', 'logout'], {
      isLoggedIn: jasmine.createSpy('isLoggedIn'),
      isOnboardingComplete: jasmine.createSpy('isOnboardingComplete'),
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should attach Authorization header when token exists', () => {
    mockAuthService.getToken.and.returnValue('my-test-token');

    httpClient.get('/api/data').subscribe();

    const req = httpTesting.expectOne('/api/data');
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-test-token');
    req.flush({});
  });

  it('should not attach Authorization header when token is null', () => {
    mockAuthService.getToken.and.returnValue(null);

    httpClient.get('/api/data').subscribe();

    const req = httpTesting.expectOne('/api/data');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('should pass request through to next handler for public endpoints without token', () => {
    mockAuthService.getToken.and.returnValue(null);

    httpClient.get('/api/public/info').subscribe();

    const req = httpTesting.expectOne('/api/public/info');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ data: 'public' });
  });
});
