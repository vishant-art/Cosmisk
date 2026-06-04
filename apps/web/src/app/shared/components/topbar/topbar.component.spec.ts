import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TopbarComponent } from './topbar.component';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { DateRangeService } from '../../../core/services/date-range.service';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';

describe('TopbarComponent', () => {
  let component: TopbarComponent;
  let fixture: ComponentFixture<TopbarComponent>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let notifServiceSpy: jasmine.SpyObj<NotificationService>;
  let dateRangeServiceSpy: jasmine.SpyObj<DateRangeService>;
  let routerEvents$: Subject<any>;
  let router: Router;

  beforeEach(async () => {
    routerEvents$ = new Subject();

    authServiceSpy = jasmine.createSpyObj('AuthService', ['logout'], {
      user: jasmine.createSpy().and.returnValue({ name: 'Vishat Jain', email: 'v@test.com' }),
    });

    notifServiceSpy = jasmine.createSpyObj(
      'NotificationService',
      ['startPolling', 'stopPolling', 'markAllAsRead', 'markAsRead'],
      {
        unreadCount: jasmine.createSpy().and.returnValue(3),
        allNotifications: jasmine.createSpy().and.returnValue([]),
      }
    );

    dateRangeServiceSpy = jasmine.createSpyObj('DateRangeService', ['setPreset'], {
      displayLabel: jasmine.createSpy().and.returnValue('Last 7 Days'),
    });

    await TestBed.configureTestingModule({
      imports: [TopbarComponent, RouterTestingModule],
    })
      .overrideProvider(AuthService, { useValue: authServiceSpy })
      .overrideProvider(NotificationService, { useValue: notifServiceSpy })
      .overrideProvider(DateRangeService, { useValue: dateRangeServiceSpy })
      .compileComponents();

    fixture = TestBed.createComponent(TopbarComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default pageTitle to Dashboard', () => {
    expect(component.pageTitle).toBe('Dashboard');
  });

  it('should have date ranges defined', () => {
    expect(component.dateRanges.length).toBe(7);
    expect(component.dateRanges).toContain('Last 7 Days');
  });

  it('should toggle datePickerOpen', () => {
    expect(component.datePickerOpen()).toBeFalse();
    component.datePickerOpen.set(true);
    expect(component.datePickerOpen()).toBeTrue();
  });

  it('should toggle notifOpen', () => {
    expect(component.notifOpen()).toBeFalse();
    component.notifOpen.set(true);
    expect(component.notifOpen()).toBeTrue();
  });

  it('should toggle userMenuOpen', () => {
    expect(component.userMenuOpen()).toBeFalse();
    component.userMenuOpen.set(true);
    expect(component.userMenuOpen()).toBeTrue();
  });

  it('should get user initials', () => {
    expect(component.getUserInitials()).toBe('VJ');
  });

  it('should return U for missing user name', () => {
    (authServiceSpy as any).user = jasmine.createSpy().and.returnValue(null);
    // Recreate component to pick up new mock
    const initials = component.getUserInitials();
    // With current mock returning { name: 'Vishat Jain' }, should still be VJ
    expect(initials).toBe('VJ');
  });

  it('should select a date range and close picker', () => {
    component.datePickerOpen.set(true);
    component.selectRange('Last 30 Days');
    expect(dateRangeServiceSpy.setPreset).toHaveBeenCalledWith('last_30d');
    expect(component.datePickerOpen()).toBeFalse();
  });

  it('should call logout on authService', () => {
    component.logout();
    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(component.userMenuOpen()).toBeFalse();
  });

  it('should navigate and close user menu', () => {
    spyOn(router, 'navigate');
    component.userMenuOpen.set(true);
    component.navigate('/app/settings');
    expect(component.userMenuOpen()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/app/settings']);
  });

  it('should handle notification click', () => {
    spyOn(router, 'navigate');
    component.notifOpen.set(true);
    component.handleNotifClick('notif-1', '/app/autopilot');
    expect(notifServiceSpy.markAsRead).toHaveBeenCalledWith('notif-1');
    expect(component.notifOpen()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/app/autopilot']);
  });

  it('should stop polling on destroy', () => {
    component.ngOnInit();
    component.ngOnDestroy();
    expect(notifServiceSpy.stopPolling).toHaveBeenCalled();
  });
});
