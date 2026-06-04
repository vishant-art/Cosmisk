import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { AutopilotBadgeService } from './autopilot-badge.service';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

describe('AutopilotBadgeService', () => {
  let service: AutopilotBadgeService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AutopilotBadgeService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    service = TestBed.inject(AutopilotBadgeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with unreadCount of 0', () => {
    expect(service.unreadCount()).toBe(0);
  });

  describe('refresh()', () => {
    it('should fetch unread count and update signal', () => {
      apiSpy.get.and.returnValue(of({ success: true, count: 7 }));

      service.refresh();

      expect(apiSpy.get).toHaveBeenCalledWith(environment.AUTOPILOT_UNREAD_COUNT);
      expect(service.unreadCount()).toBe(7);
    });

    it('should default to 0 when count is undefined', () => {
      apiSpy.get.and.returnValue(of({ success: true }));

      service.refresh();

      expect(service.unreadCount()).toBe(0);
    });

    it('should set to 0 on API error', () => {
      // First set a non-zero count
      apiSpy.get.and.returnValue(of({ success: true, count: 5 }));
      service.refresh();
      expect(service.unreadCount()).toBe(5);

      // Then trigger error
      apiSpy.get.and.returnValue(throwError(() => new Error('Network error')));
      service.refresh();
      expect(service.unreadCount()).toBe(0);
    });

    it('should handle zero count', () => {
      apiSpy.get.and.returnValue(of({ success: true, count: 0 }));
      service.refresh();
      expect(service.unreadCount()).toBe(0);
    });
  });
});
