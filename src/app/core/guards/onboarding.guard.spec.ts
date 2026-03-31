import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { onboardingGuard } from './onboarding.guard';
import { AuthService } from '../services/auth.service';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

describe('onboardingGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  const mockRoute = {} as ActivatedRouteSnapshot;
  const mockState = {} as RouterStateSnapshot;

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['getToken', 'logout'], {
      isOnboardingComplete: jasmine.createSpy('isOnboardingComplete'),
    });
    router = jasmine.createSpyObj('Router', ['createUrlTree']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('should allow access when onboarding is complete', () => {
    (authService.isOnboardingComplete as jasmine.Spy).and.returnValue(true);

    const result = TestBed.runInInjectionContext(() => onboardingGuard(mockRoute, mockState));

    expect(result).toBe(true);
  });

  it('should redirect to /onboarding when onboarding is incomplete', () => {
    const fakeUrlTree = new UrlTree();
    (authService.isOnboardingComplete as jasmine.Spy).and.returnValue(false);
    router.createUrlTree.and.returnValue(fakeUrlTree);

    const result = TestBed.runInInjectionContext(() => onboardingGuard(mockRoute, mockState));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/onboarding']);
    expect(result).toBe(fakeUrlTree);
  });

  it('should not redirect when onboarding is already complete', () => {
    (authService.isOnboardingComplete as jasmine.Spy).and.returnValue(true);

    TestBed.runInInjectionContext(() => onboardingGuard(mockRoute, mockState));

    expect(router.createUrlTree).not.toHaveBeenCalled();
  });
});
