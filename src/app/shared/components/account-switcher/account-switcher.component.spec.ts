import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccountSwitcherComponent } from './account-switcher.component';
import { AdAccountService } from '../../../core/services/ad-account.service';

describe('AccountSwitcherComponent', () => {
  let component: AccountSwitcherComponent;
  let fixture: ComponentFixture<AccountSwitcherComponent>;
  let mockAdAccountService: any;

  beforeEach(async () => {
    mockAdAccountService = {
      currentAccount: signal({ id: 'act_1', name: 'Test Account', currency: 'INR' }),
      loading: signal(false),
      accountCount: signal(2),
      groupedAccounts: signal([
        ['Business A', [
          { id: 'act_1', name: 'Account 1', business_name: 'Business A', currency: 'INR' },
          { id: 'act_2', name: 'Account 2', business_name: 'Business A', currency: 'USD' },
        ]],
      ]),
      switchAccount: jasmine.createSpy('switchAccount'),
    };

    await TestBed.configureTestingModule({
      imports: [AccountSwitcherComponent],
      providers: [{ provide: AdAccountService, useValue: mockAdAccountService }],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .overrideComponent(AccountSwitcherComponent, { set: { imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA] } })
    .compileComponents();
    fixture = TestBed.createComponent(AccountSwitcherComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => { fixture.detectChanges(); expect(component).toBeTruthy(); });
  it('should start closed', () => { expect(component.open()).toBeFalse(); });
  it('should display current account name', () => { fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('Test Account'); });
  it('should show loading state', () => {
    mockAdAccountService.currentAccount.set(null);
    mockAdAccountService.loading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading accounts...');
  });
  it('should show no accounts', () => {
    mockAdAccountService.currentAccount.set(null);
    mockAdAccountService.loading.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No ad accounts');
  });
  it('should toggle dropdown', () => {
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    expect(component.open()).toBeTrue();
    fixture.nativeElement.querySelector('button').click();
    expect(component.open()).toBeFalse();
  });
  it('should filter accounts', () => {
    component.searchTerm.set('account 1');
    const groups = component.filteredGroups();
    expect(groups.length).toBe(1);
    expect((groups[0][1] as any[]).length).toBe(1);
  });
  it('should return all groups when empty search', () => {
    component.searchTerm.set('');
    expect((component.filteredGroups()[0][1] as any[]).length).toBe(2);
  });
  it('should switch account', () => {
    component.open.set(true);
    component.selectAccount('act_2');
    expect(mockAdAccountService.switchAccount).toHaveBeenCalledWith('act_2');
    expect(component.open()).toBeFalse();
  });
  it('should update search term', () => {
    component.onSearch({ target: { value: 'test' } } as any);
    expect(component.searchTerm()).toBe('test');
  });
});
