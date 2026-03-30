import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AutopilotBadgeService } from './autopilot-badge.service';
import { ApiService } from './api.service';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

describe('AutopilotBadgeService', () => {
  let service: AutopilotBadgeService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
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

  describe('refresh', () => {
    it('should update unreadCount on success', () => {
      apiSpy.get.and.returnValue(of({ success: true, count: 7 }));
      service.refresh();
      expect(service.unreadCount()).toBe(7);
      expect(apiSpy.get).toHaveBeenCalledWith(environment.AUTOPILOT_UNREAD_COUNT);
    });

    it('should set unreadCount to 0 when count is null', () => {
      apiSpy.get.and.returnValue(of({ success: true, count: null }));
      service.refresh();
      expect(service.unreadCount()).toBe(0);
    });

    it('should set unreadCount to 0 on error', () => {
      // First set it to a non-zero value
      apiSpy.get.and.returnValue(of({ success: true, count: 5 }));
      service.refresh();
      expect(service.unreadCount()).toBe(5);

      // Now simulate error
      apiSpy.get.and.returnValue(throwError(() => new Error('fail')));
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
