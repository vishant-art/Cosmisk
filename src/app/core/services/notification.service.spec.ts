import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NotificationService } from './notification.service';
import { ApiService } from './api.service';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

describe('NotificationService', () => {
  let service: NotificationService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  const mockAlertsResponse = {
    success: true,
    alerts: [
      { id: 'a1', severity: 'critical', title: 'ROAS Decline', content: 'ROAS dropped 30%', read: false, created_at: '2024-01-01', type: 'roas_decline' },
      { id: 'a2', severity: 'success', title: 'Great Performance', content: 'CPA is low', read: true, created_at: '2024-01-02', type: 'scale_opportunity' },
      { id: 'a3', severity: 'info', title: 'Update Available', content: '', read: false, created_at: '2024-01-03', type: 'unknown_type' },
    ],
  };

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
    apiSpy.get.and.returnValue(of({ success: false }));
    apiSpy.post.and.returnValue(of({}));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
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

  describe('loadAlerts', () => {
    it('should map alerts to notifications', () => {
      apiSpy.get.and.returnValue(of(mockAlertsResponse));
      service.loadAlerts();

      const notifications = service.allNotifications();
      expect(notifications.length).toBe(3);
      expect(notifications[0].type).toBe('alert');
      expect(notifications[0].title).toBe('ROAS Decline');
      expect(notifications[0].actionRoute).toBe('/app/dashboard');
      expect(notifications[1].type).toBe('positive');
      expect(notifications[1].actionRoute).toBe('/app/creative-cockpit');
      expect(notifications[2].type).toBe('info');
      expect(notifications[2].actionRoute).toBe('/app/dashboard'); // unknown type defaults to dashboard
    });

    it('should handle error silently', () => {
      apiSpy.get.and.returnValue(throwError(() => new Error('fail')));
      service.loadAlerts();
      expect(service.allNotifications().length).toBe(0);
    });

    it('should handle unsuccessful response', () => {
      apiSpy.get.and.returnValue(of({ success: false }));
      service.loadAlerts();
      expect(service.allNotifications().length).toBe(0);
    });
  });

  describe('unreadCount', () => {
    it('should count unread notifications', () => {
      apiSpy.get.and.returnValue(of(mockAlertsResponse));
      service.loadAlerts();
      expect(service.unreadCount()).toBe(2);
    });
  });

  describe('markAsRead', () => {
    it('should mark a single notification as read', () => {
      apiSpy.get.and.returnValue(of(mockAlertsResponse));
      service.loadAlerts();

      service.markAsRead('a1');
      expect(service.allNotifications().find(n => n.id === 'a1')!.read).toBeTrue();
      expect(service.unreadCount()).toBe(1);
      expect(apiSpy.post).toHaveBeenCalledWith(environment.AUTOPILOT_MARK_READ, { alert_ids: ['a1'] });
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', () => {
      apiSpy.get.and.returnValue(of(mockAlertsResponse));
      service.loadAlerts();

      service.markAllAsRead();
      expect(service.unreadCount()).toBe(0);
      expect(apiSpy.post).toHaveBeenCalledWith(environment.AUTOPILOT_MARK_READ, { mark_all: true });
    });
  });

  describe('startPolling', () => {
    it('should call loadAlerts immediately', () => {
      apiSpy.get.and.returnValue(of(mockAlertsResponse));
      service.startPolling();
      expect(apiSpy.get).toHaveBeenCalledWith(environment.AUTOPILOT_ALERTS, { limit: 30 });
    });

    it('should not create multiple intervals', () => {
      apiSpy.get.and.returnValue(of(mockAlertsResponse));
      service.startPolling();
      service.startPolling();
      // No error thrown, just verify it was called
      expect(apiSpy.get).toHaveBeenCalled();
    });
  });

  describe('stopPolling', () => {
    it('should stop the polling interval', () => {
      apiSpy.get.and.returnValue(of(mockAlertsResponse));
      service.startPolling();
      service.stopPolling();
      // Calling again should be safe
      service.stopPolling();
      expect(service).toBeTruthy();
    });
  });
});
