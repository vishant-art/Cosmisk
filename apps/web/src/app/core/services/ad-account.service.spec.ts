import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { AdAccountService } from './ad-account.service';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';
import { AdAccount } from '../models/ad-account.model';

describe('AdAccountService', () => {
  let service: AdAccountService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  const mockAccounts: AdAccount[] = [
    { id: 'act_1', account_id: '1', name: 'Account 1', business_name: 'Biz A', status: 'active', currency: 'USD', credential_group: 'system' },
    { id: 'act_2', account_id: '2', name: 'Account 2', business_name: 'Biz A', status: 'active', currency: 'INR', credential_group: 'oauth' },
    { id: 'act_3', account_id: '3', name: 'Account 3', business_name: 'Biz B', status: 'inactive', currency: 'EUR', credential_group: 'personal' },
  ];

  beforeEach(() => {
    localStorage.clear();
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
    apiSpy.get.and.returnValue(of({ success: true, accounts: mockAccounts, total: 3 }));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AdAccountService,
        { provide: ApiService, useValue: apiSpy },
      ],
    });

    service = TestBed.inject(AdAccountService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadAccounts()', () => {
    it('should load accounts from API on construction', () => {
      expect(apiSpy.get).toHaveBeenCalledWith(environment.AD_ACCOUNTS_LIST, { limit: 100 });
      expect(service.allAccounts().length).toBe(3);
      expect(service.loading()).toBeFalse();
    });

    it('should set first account as current when no saved selection', () => {
      expect(service.currentAccount()!.id).toBe('act_1');
    });

    it('should restore saved account from localStorage', () => {
      localStorage.setItem('cosmisk_ad_account', 'act_2');

      // Recreate service
      TestBed.resetTestingModule();
      apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
      apiSpy.get.and.returnValue(of({ success: true, accounts: mockAccounts, total: 3 }));
      TestBed.configureTestingModule({
        imports: [HttpClientTestingModule],
        providers: [
          AdAccountService,
          { provide: ApiService, useValue: apiSpy },
        ],
      });
      const freshService = TestBed.inject(AdAccountService);

      expect(freshService.currentAccount()!.id).toBe('act_2');
    });

    it('should fall back to first account if saved ID not found', () => {
      localStorage.setItem('cosmisk_ad_account', 'nonexistent');

      TestBed.resetTestingModule();
      apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
      apiSpy.get.and.returnValue(of({ success: true, accounts: mockAccounts, total: 3 }));
      TestBed.configureTestingModule({
        imports: [HttpClientTestingModule],
        providers: [
          AdAccountService,
          { provide: ApiService, useValue: apiSpy },
        ],
      });
      const freshService = TestBed.inject(AdAccountService);

      expect(freshService.currentAccount()!.id).toBe('act_1');
    });

    it('should handle API error gracefully', () => {
      apiSpy.get.and.returnValue(throwError(() => new Error('Network error')));
      service.loadAccounts();
      expect(service.loading()).toBeFalse();
    });

    it('should handle unsuccessful response', () => {
      apiSpy.get.and.returnValue(of({ success: false, accounts: [], total: 0 }));
      service.loadAccounts();
      expect(service.loading()).toBeFalse();
    });
  });

  describe('accountCount', () => {
    it('should compute correct count', () => {
      expect(service.accountCount()).toBe(3);
    });
  });

  describe('groupedAccounts', () => {
    it('should group accounts by business_name sorted alphabetically', () => {
      const groups = service.groupedAccounts();
      expect(groups.length).toBe(2);
      expect(groups[0][0]).toBe('Biz A');
      expect(groups[0][1].length).toBe(2);
      expect(groups[1][0]).toBe('Biz B');
      expect(groups[1][1].length).toBe(1);
    });
  });

  describe('switchAccount()', () => {
    it('should switch to specified account and save to localStorage', () => {
      service.switchAccount('act_2');
      expect(service.currentAccount()!.id).toBe('act_2');
      expect(localStorage.getItem('cosmisk_ad_account')).toBe('act_2');
    });

    it('should do nothing for unknown account ID', () => {
      const currentBefore = service.currentAccount();
      service.switchAccount('unknown');
      expect(service.currentAccount()).toEqual(currentBefore);
    });
  });
});
