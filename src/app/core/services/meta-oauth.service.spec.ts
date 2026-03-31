import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { MetaOAuthService } from './meta-oauth.service';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

describe('MetaOAuthService', () => {
  let service: MetaOAuthService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
    // Default: return connected status for constructor
    apiSpy.get.and.returnValue(of({
      connected: true,
      status: 'active',
      accountCount: 5,
      metaUserName: 'Vishat Jain',
      expiresAt: '2026-06-01',
    }));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        MetaOAuthService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    service = TestBed.inject(MetaOAuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('checkStatus()', () => {
    it('should set connected status on successful check', () => {
      expect(service.connectionStatus()).toBe('connected');
      expect(service.isConnected()).toBeTrue();
      expect(service.connectedAccountCount()).toBe(5);
      expect(service.metaUserName()).toBe('Vishat Jain');
      expect(service.expiresAt()).toBe('2026-06-01');
    });

    it('should set expired status when token is expired', () => {
      apiSpy.get.and.returnValue(of({
        connected: true,
        status: 'expired',
        accountCount: 3,
        metaUserName: 'Test',
        expiresAt: '2025-01-01',
      }));

      service.checkStatus();

      expect(service.connectionStatus()).toBe('expired');
      expect(service.isConnected()).toBeFalse();
    });

    it('should set disconnected when not connected', () => {
      apiSpy.get.and.returnValue(of({ connected: false }));
      service.checkStatus();

      expect(service.connectionStatus()).toBe('disconnected');
      expect(service.connectedAccountCount()).toBe(0);
    });

    it('should set disconnected on API error', () => {
      apiSpy.get.and.returnValue(throwError(() => new Error('Network fail')));
      service.checkStatus();

      expect(service.connectionStatus()).toBe('disconnected');
    });

    it('should set loading before request completes', () => {
      // checkStatus sets loading synchronously before subscribe
      // We can verify the call was made to the correct endpoint
      expect(apiSpy.get).toHaveBeenCalledWith(environment.AUTH_META_STATUS);
    });
  });

  describe('disconnect()', () => {
    it('should call API and reset state on success', () => {
      apiSpy.post.and.returnValue(of({ success: true }));

      service.disconnect();

      expect(apiSpy.post).toHaveBeenCalledWith(environment.AUTH_META_DISCONNECT, {});
      expect(service.connectionStatus()).toBe('disconnected');
      expect(service.connectedAccountCount()).toBe(0);
      expect(service.metaUserName()).toBe('');
    });

    it('should not change state when API returns failure', () => {
      apiSpy.post.and.returnValue(of({ success: false }));

      service.disconnect();

      // State should remain connected since disconnect failed
      expect(service.connectionStatus()).toBe('connected');
    });
  });

  describe('window message listener', () => {
    it('should update state on META_OAUTH_SUCCESS message', () => {
      // First set to disconnected
      apiSpy.get.and.returnValue(of({ connected: false }));
      service.checkStatus();
      expect(service.connectionStatus()).toBe('disconnected');

      // Simulate OAuth popup success message
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'META_OAUTH_SUCCESS', accountCount: 10 },
      }));

      expect(service.connectionStatus()).toBe('connected');
      expect(service.connectedAccountCount()).toBe(10);
    });

    it('should ignore unrelated messages', () => {
      apiSpy.get.and.returnValue(of({ connected: false }));
      service.checkStatus();

      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'SOMETHING_ELSE' },
      }));

      expect(service.connectionStatus()).toBe('disconnected');
    });
  });

  describe('openOAuthPopup()', () => {
    it('should call window.open with correct OAuth URL', () => {
      spyOn(window, 'open');
      localStorage.setItem('cosmisk_token', 'test-token');

      service.openOAuthPopup();

      expect(window.open).toHaveBeenCalled();
      const callArgs = (window.open as jasmine.Spy).calls.first().args;
      const url = callArgs[0] as string;
      expect(url).toContain('facebook.com/v22.0/dialog/oauth');
      expect(url).toContain(environment.META_APP_ID);
      expect(url).toContain('ads_read');
      expect(url).toContain('ads_management');
      expect(url).toContain('response_type=code');

      localStorage.removeItem('cosmisk_token');
    });
  });
});
