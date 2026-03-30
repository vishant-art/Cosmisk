import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MetaOAuthService } from './meta-oauth.service';
import { ApiService } from './api.service';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

describe('MetaOAuthService', () => {
  let service: MetaOAuthService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
    // Default: checkStatus returns disconnected
    apiSpy.get.and.returnValue(of({ connected: false }));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
      ],
    });
    service = TestBed.inject(MetaOAuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('checkStatus', () => {
    it('should set connected status when connected', () => {
      apiSpy.get.and.returnValue(of({
        connected: true,
        status: 'active',
        accountCount: 3,
        metaUserName: 'John',
        expiresAt: '2025-01-01',
      }));
      service.checkStatus();

      expect(service.connectionStatus()).toBe('connected');
      expect(service.connectedAccountCount()).toBe(3);
      expect(service.metaUserName()).toBe('John');
      expect(service.expiresAt()).toBe('2025-01-01');
      expect(service.isConnected()).toBeTrue();
    });

    it('should set expired status when expired', () => {
      apiSpy.get.and.returnValue(of({
        connected: true,
        status: 'expired',
        accountCount: 2,
        metaUserName: 'Jane',
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

    it('should set disconnected on error', () => {
      apiSpy.get.and.returnValue(throwError(() => new Error('fail')));
      service.checkStatus();
      expect(service.connectionStatus()).toBe('disconnected');
    });
  });

  describe('openOAuthPopup', () => {
    it('should open a popup window', () => {
      spyOn(window, 'open');
      localStorage.setItem('cosmisk_token', 'test-token');

      service.openOAuthPopup();

      expect(window.open).toHaveBeenCalledWith(
        jasmine.stringContaining('facebook.com/v22.0/dialog/oauth'),
        'meta_oauth',
        jasmine.any(String),
      );

      localStorage.removeItem('cosmisk_token');
    });
  });

  describe('disconnect', () => {
    it('should reset state on successful disconnect', () => {
      // First set to connected
      apiSpy.get.and.returnValue(of({
        connected: true,
        status: 'active',
        accountCount: 3,
        metaUserName: 'John',
      }));
      service.checkStatus();

      // Now disconnect
      apiSpy.post.and.returnValue(of({ success: true }));
      service.disconnect();

      expect(service.connectionStatus()).toBe('disconnected');
      expect(service.connectedAccountCount()).toBe(0);
      expect(service.metaUserName()).toBe('');
    });

    it('should not reset state on unsuccessful disconnect', () => {
      apiSpy.get.and.returnValue(of({
        connected: true,
        status: 'active',
        accountCount: 3,
        metaUserName: 'John',
      }));
      service.checkStatus();

      apiSpy.post.and.returnValue(of({ success: false }));
      service.disconnect();

      expect(service.connectionStatus()).toBe('connected');
    });
  });

  describe('window message listener', () => {
    it('should update on META_OAUTH_SUCCESS message', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'META_OAUTH_SUCCESS', accountCount: 5 },
      }));

      expect(service.connectionStatus()).toBe('connected');
      expect(service.connectedAccountCount()).toBe(5);
    });
  });
});
