import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AdAccountService } from './ad-account.service';
import { ApiService } from './api.service';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdAccount } from '../models/ad-account.model';

describe('AdAccountService', () => {
  let service: AdAccountService;
  let apiSpy: jasmine.SpyObj<ApiService>;

  const mockAccounts: AdAccount[] = [
    {
      id: 'act_1',
      account_id: '1',
      name: 'Account 1',
      business_name: 'Business A',
      status: 'active',
      currency: 'USD',
      credential_group: 'system',
    },
    {
      id: 'act_2',
      account_id: '2',
      name: 'Account 2',
      business_name: 'Business B',
      status: 'active',
      currency: 'INR',
      credential_group: 'personal',
    },
    {
      id: 'act_3',
      account_id: '3',
      name: 'Account 3',
      business_name: 'Business A',
      status: 'inactive',
      currency: 'EUR',
      credential_group: 'oauth',
    },
  ];

  const mockApiResponse = {
    success: true,
    accounts: mockAccounts,
    total: 3,
  };

  beforeEach(() => {
    localStorage.clear();
    apiSpy = jasmine.createSpyObj('ApiService', ['get', 'post', 'put', 'delete']);
    apiSpy.get.and.returnValue(of(mockApiResponse));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
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

  it('should load accounts on construction', () => {
    expect(apiSpy.get).toHaveBeenCalledWith(environment.AD_ACCOUNTS_LIST, { limit: 100 });
    expect(service.allAccounts().length).toBe(3);
  });

  it('should set first account as current by default', () => {
    expect(service.currentAccount()!.id).toBe('act_1');
  });

  it('should restore saved account from localStorage', () => {
    localStorage.setItem('cosmisk_ad_account', 'act_2');
    apiSpy.get.and.returnValue(of(mockApiResponse));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: ApiService, useValue: apiSpy },
      ],
    });
    const newService = TestBed.inject(AdAccountService);
    expect(newService.currentAccount()!.id).toBe('act_2');
  });

  it('should set loading to false after load', () => {
    expect(service.loading()).toBeFalse();
  });

  describe('accountCount', () => {
    it('should return the number of accounts', () => {
      expect(service.accountCount()).toBe(3);
    });
  });

  describe('groupedAccounts', () => {
    it('should group accounts by business_name sorted alphabetically', () => {
      const groups = service.groupedAccounts();
      expect(groups.length).toBe(2);
      expect(groups[0][0]).toBe('Business A');
      expect(groups[0][1].length).toBe(2);
      expect(groups[1][0]).toBe('Business B');
      expect(groups[1][1].length).toBe(1);
    });
  });

  describe('switchAccount', () => {
    it('should switch to the specified account', () => {
      service.switchAccount('act_2');
      expect(service.currentAccount()!.id).toBe('act_2');
      expect(localStorage.getItem('cosmisk_ad_account')).toBe('act_2');
    });

    it('should not switch if account not found', () => {
      service.switchAccount('nonexistent');
      expect(service.currentAccount()!.id).toBe('act_1');
    });
  });

  describe('loadAccounts error', () => {
    it('should set loading to false on error', () => {
      apiSpy.get.and.returnValue(throwError(() => new Error('Network error')));
      service.loadAccounts();
      expect(service.loading()).toBeFalse();
    });
  });

  describe('loadAccounts empty', () => {
    it('should handle response with no accounts', () => {
      apiSpy.get.and.returnValue(of({ success: true, accounts: [], total: 0 }));
      service.loadAccounts();
      expect(service.loading()).toBeFalse();
    });

    it('should handle unsuccessful response', () => {
      apiSpy.get.and.returnValue(of({ success: false, accounts: [], total: 0 }));
      service.loadAccounts();
      expect(service.loading()).toBeFalse();
    });
  });
});
