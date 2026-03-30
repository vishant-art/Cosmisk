import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { onboardingGuard } from './onboarding.guard';
import { AuthService } from '../services/auth.service';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

describe('onboardingGuard', () => {
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;
  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = {} as RouterStateSnapshot;
  const onboardingUrlTree = {} as UrlTree;

  beforeEach(() => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['getToken', 'logout'], {
      isLoggedIn: jasmine.createSpy('isLoggedIn'),
      isOnboardingComplete: jasmine.createSpy('isOnboardingComplete'),
    });
    mockRouter = jasmine.createSpyObj('Router', ['createUrlTree']);
    mockRouter.createUrlTree.and.returnValue(onboardingUrlTree);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  it('should allow access when onboarding is complete', () => {
    (mockAuthService.isOnboardingComplete as unknown as jasmine.Spy).and.returnValue(true);

    const result = TestBed.runInInjectionContext(() => onboardingGuard(dummyRoute, dummyState));

    expect(result).toBeTrue();
  });

  it('should redirect to /onboarding when onboarding is not complete', () => {
    (mockAuthService.isOnboardingComplete as unknown as jasmine.Spy).and.returnValue(false);

    const result = TestBed.runInInjectionContext(() => onboardingGuard(dummyRoute, dummyState));

    expect(result).toBe(onboardingUrlTree);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/onboarding']);
  });
});
