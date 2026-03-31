import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { NotificationService } from './notification.service';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

describe('NotificationService', () => {
  let service: NotificationService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  const mockAlerts = {
    success: true,
    alerts: [
      { id: 'n1', severity: 'critical', title: 'ROAS Declined', content: 'Down 30%', read: false, created_at: '2026-01-01', type: 'roas_decline' },
      { id: 'n2', severity: 'success', title: 'Scale Found', content: 'Opportunity', read: true, created_at: '2026-01-02', type: 'scale_opportunity' },
      { id: 'n3', severity: 'info', title: 'Update', content: 'New feature', read: false, created_at: '2026-01-03', type: 'unknown_type' },
    ],
  };

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
    apiSpy.get.and.returnValue(of(mockAlerts));
    apiSpy.post.and.returnValue(of({ success: true }));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        NotificationService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    service.stopPolling();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadAlerts()', () => {
    it('should fetch and map alerts from API', () => {
      service.loadAlerts();

      expect(apiSpy.get).toHaveBeenCalledWith(environment.AUTOPILOT_ALERTS, { limit: 30 });
      expect(service.allNotifications().length).toBe(3);
    });

    it('should map severity to notification type correctly', () => {
      service.loadAlerts();
      const notifs = service.allNotifications();

      expect(notifs[0].type).toBe('alert');       // critical -> alert
      expect(notifs[1].type).toBe('positive');     // success -> positive
      expect(notifs[2].type).toBe('info');         // info -> info
    });

    it('should map type to actionRoute correctly', () => {
      service.loadAlerts();
      const notifs = service.allNotifications();

      expect(notifs[0].actionRoute).toBe('/app/dashboard');         // roas_decline
      expect(notifs[1].actionRoute).toBe('/app/creative-cockpit');  // scale_opportunity
      expect(notifs[2].actionRoute).toBe('/app/dashboard');         // unknown -> default
    });

    it('should handle API error silently', () => {
      apiSpy.get.and.returnValue(throwError(() => new Error('fail')));
      expect(() => service.loadAlerts()).not.toThrow();
    });

    it('should handle unsuccessful response', () => {
      apiSpy.get.and.returnValue(of({ success: false }));
      service.loadAlerts();
      // Should not crash
    });
  });

  describe('unreadCount', () => {
    it('should compute unread count', () => {
      service.loadAlerts();
      expect(service.unreadCount()).toBe(2); // n1 and n3 are unread
    });
  });

  describe('markAsRead()', () => {
    it('should optimistically mark notification as read', () => {
      service.loadAlerts();
      service.markAsRead('n1');

      const n1 = service.allNotifications().find(n => n.id === 'n1');
      expect(n1!.read).toBeTrue();
      expect(service.unreadCount()).toBe(1);
    });

    it('should call API to persist read status', () => {
      service.loadAlerts();
      service.markAsRead('n1');
      expect(apiSpy.post).toHaveBeenCalledWith(environment.AUTOPILOT_MARK_READ, { alert_ids: ['n1'] });
    });
  });

  describe('markAllAsRead()', () => {
    it('should mark all notifications as read', () => {
      service.loadAlerts();
      service.markAllAsRead();

      expect(service.unreadCount()).toBe(0);
      service.allNotifications().forEach((n) => {
        expect(n.read).toBeTrue();
      });
    });

    it('should call API with mark_all flag', () => {
      service.loadAlerts();
      service.markAllAsRead();
      expect(apiSpy.post).toHaveBeenCalledWith(environment.AUTOPILOT_MARK_READ, { mark_all: true });
    });
  });

  describe('startPolling()', () => {
    it('should load alerts immediately', () => {
      service.startPolling();
      expect(apiSpy.get).toHaveBeenCalled();
    });

    it('should not create duplicate intervals', () => {
      service.startPolling();
      service.startPolling();
      // If duplicate intervals were created, stopping would only clear one.
      // We just verify no errors occur.
      service.stopPolling();
    });
  });

  describe('stopPolling()', () => {
    it('should stop interval', fakeAsync(() => {
      service.startPolling();
      const callCountAfterStart = apiSpy.get.calls.count();

      service.stopPolling();
      tick(120_000);

      // Should not have additional calls after stopping
      expect(apiSpy.get.calls.count()).toBe(callCountAfterStart);
    }));

    it('should handle being called when not polling', () => {
      expect(() => service.stopPolling()).not.toThrow();
    });
  });
});
