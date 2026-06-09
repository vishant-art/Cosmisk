import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AccountSwitcherComponent } from './account-switcher.component';
import { AdAccountService } from '../../../core/services/ad-account.service';
import { signal } from '@angular/core';

describe('AccountSwitcherComponent', () => {
  let component: AccountSwitcherComponent;
  let fixture: ComponentFixture<AccountSwitcherComponent>;
  let adAccountServiceSpy: jasmine.SpyObj<AdAccountService>;

  const mockAccounts = [
    ['Business A', [
      { id: 'act_1', name: 'Account 1', currency: 'INR', business_name: 'Business A' },
      { id: 'act_2', name: 'Account 2', currency: 'USD', business_name: 'Business A' },
    ]],
    ['Business B', [
      { id: 'act_3', name: 'Account 3', currency: 'INR', business_name: 'Business B' },
    ]],
  ];

  beforeEach(async () => {
    adAccountServiceSpy = jasmine.createSpyObj(
      'AdAccountService',
      ['switchAccount'],
      {
        currentAccount: jasmine.createSpy().and.returnValue({ id: 'act_1', name: 'Account 1', currency: 'INR' }),
        loading: jasmine.createSpy().and.returnValue(false),
        groupedAccounts: jasmine.createSpy().and.returnValue(mockAccounts),
        accountCount: jasmine.createSpy().and.returnValue(3),
      }
    );

    await TestBed.configureTestingModule({
      imports: [AccountSwitcherComponent],
    })
      .overrideProvider(AdAccountService, { useValue: adAccountServiceSpy })
      .compileComponents();

    fixture = TestBed.createComponent(AccountSwitcherComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with dropdown closed', () => {
    expect(component.open()).toBeFalse();
  });

  it('should start with empty search term', () => {
    expect(component.searchTerm()).toBe('');
  });

  it('should toggle dropdown open state', () => {
    component.open.set(true);
    expect(component.open()).toBeTrue();
    component.open.set(false);
    expect(component.open()).toBeFalse();
  });

  it('should update search term on search', () => {
    const mockEvent = { target: { value: 'test' } } as unknown as Event;
    component.onSearch(mockEvent);
    expect(component.searchTerm()).toBe('test');
  });

  it('should select account and close dropdown', () => {
    component.open.set(true);
    component.selectAccount('act_2');
    expect(adAccountServiceSpy.switchAccount).toHaveBeenCalledWith('act_2');
    expect(component.open()).toBeFalse();
    expect(component.searchTerm()).toBe('');
  });

  it('should filter groups based on search term', () => {
    component.searchTerm.set('account 1');
    const groups = component.filteredGroups();
    expect(groups.length).toBe(1);
    expect(groups[0][1].length).toBe(1);
  });

  it('should return all groups when search is empty', () => {
    component.searchTerm.set('');
    const groups = component.filteredGroups();
    expect(groups.length).toBe(2);
  });

  it('should filter by business name as well', () => {
    component.searchTerm.set('business b');
    const groups = component.filteredGroups();
    expect(groups.length).toBe(1);
    expect(groups[0][0]).toBe('Business B');
  });

  it('should return empty when no match', () => {
    component.searchTerm.set('nonexistent');
    const groups = component.filteredGroups();
    expect(groups.length).toBe(0);
  });
});
