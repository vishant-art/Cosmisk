import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { TopbarComponent } from './topbar.component';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { DateRangeService } from '../../../core/services/date-range.service';

describe('TopbarComponent', () => {
  let component: TopbarComponent;
  let fixture: ComponentFixture<TopbarComponent>;
  let routerEvents$: Subject<any>;
  let mockRouter: any;
  let mockAuthService: any;
  let mockNotificationService: any;
  let mockDateRangeService: any;

  beforeEach(async () => {
    routerEvents$ = new Subject();
    mockRouter = {
      events: routerEvents$.asObservable(),
      url: '/app/dashboard',
      navigate: jasmine.createSpy('navigate'),
    };
    mockAuthService = {
      user: signal({ name: 'John Doe', email: 'john@example.com' }),
      logout: jasmine.createSpy('logout'),
    };
    mockNotificationService = {
      unreadCount: signal(3),
      allNotifications: signal([
        { id: '1', type: 'alert', title: 'Alert 1', read: false, createdAt: new Date().toISOString() },
      ]),
      startPolling: jasmine.createSpy('startPolling'),
      stopPolling: jasmine.createSpy('stopPolling'),
      markAsRead: jasmine.createSpy('markAsRead'),
      markAllAsRead: jasmine.createSpy('markAllAsRead'),
    };
    mockDateRangeService = {
      displayLabel: signal('Last 7 Days'),
      setPreset: jasmine.createSpy('setPreset'),
    };

    await TestBed.configureTestingModule({
      imports: [TopbarComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuthService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: DateRangeService, useValue: mockDateRangeService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .overrideComponent(TopbarComponent, {
      set: { imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA] }
    })
    .compileComponents();

    fixture = TestBed.createComponent(TopbarComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => { component.ngOnDestroy(); });

  it('should create', () => { fixture.detectChanges(); expect(component).toBeTruthy(); });

  it('should display page title', () => {
    fixture.detectChanges();
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1.textContent).toContain('Dashboard');
  });

  it('should update title on navigation', () => {
    fixture.detectChanges();
    routerEvents$.next(new NavigationEnd(1, '/app/analytics', '/app/analytics'));
    expect(component.pageTitle).toBe('Analytics');
    expect(component.breadcrumb).toBe('Intelligence');
  });

  it('should get user initials', () => { fixture.detectChanges(); expect(component.getUserInitials()).toBe('JD'); });

  it('should handle single name initial', () => {
    mockAuthService.user = signal({ name: 'Admin', email: 'a@a.com' });
    fixture = TestBed.createComponent(TopbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.getUserInitials()).toBe('A');
  });

  it('should handle null user for initials', () => {
    mockAuthService.user = signal(null);
    fixture = TestBed.createComponent(TopbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.getUserInitials()).toBe('U');
  });

  it('should toggle date picker', () => {
    fixture.detectChanges();
    expect(component.datePickerOpen()).toBeFalse();
    component.datePickerOpen.set(true);
    expect(component.datePickerOpen()).toBeTrue();
  });

  it('should select date range and close picker', () => {
    fixture.detectChanges();
    component.datePickerOpen.set(true);
    component.selectRange('Today');
    expect(mockDateRangeService.setPreset).toHaveBeenCalledWith('today');
    expect(component.datePickerOpen()).toBeFalse();
  });

  it('should handle notification click', () => {
    fixture.detectChanges();
    component.notifOpen.set(true);
    component.handleNotifClick('1', '/app/dashboard');
    expect(mockNotificationService.markAsRead).toHaveBeenCalledWith('1');
    expect(component.notifOpen()).toBeFalse();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/dashboard']);
  });

  it('should handle notification click without route', () => {
    fixture.detectChanges();
    component.handleNotifClick('1');
    expect(mockNotificationService.markAsRead).toHaveBeenCalledWith('1');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should navigate and close user menu', () => {
    fixture.detectChanges();
    component.userMenuOpen.set(true);
    component.navigate('/app/settings');
    expect(component.userMenuOpen()).toBeFalse();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/settings']);
  });

  it('should logout and close user menu', () => {
    fixture.detectChanges();
    component.userMenuOpen.set(true);
    component.logout();
    expect(component.userMenuOpen()).toBeFalse();
    expect(mockAuthService.logout).toHaveBeenCalled();
  });

  it('should start polling on init', () => { fixture.detectChanges(); expect(mockNotificationService.startPolling).toHaveBeenCalled(); });
  it('should stop polling on destroy', () => { fixture.detectChanges(); component.ngOnDestroy(); expect(mockNotificationService.stopPolling).toHaveBeenCalled(); });
});
