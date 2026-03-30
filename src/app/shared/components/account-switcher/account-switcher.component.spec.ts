import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { AccountSwitcherComponent } from './account-switcher.component';
import { AdAccountService } from '../../../core/services/ad-account.service';
import { signal } from '@angular/core';

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
      providers: [
        { provide: AdAccountService, useValue: mockAdAccountService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountSwitcherComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should start with dropdown closed', () => {
    expect(component.open()).toBeFalse();
  });

  it('should display current account name', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Test Account');
  });

  it('should show loading state when loading', () => {
    mockAdAccountService.currentAccount = signal(null);
    mockAdAccountService.loading = signal(true);
    fixture = TestBed.createComponent(AccountSwitcherComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Loading accounts...');
  });

  it('should show no accounts message when empty', () => {
    mockAdAccountService.currentAccount = signal(null);
    mockAdAccountService.loading = signal(false);
    fixture = TestBed.createComponent(AccountSwitcherComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No ad accounts');
  });

  it('should toggle dropdown on button click', () => {
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button');
    button.click();
    expect(component.open()).toBeTrue();
    button.click();
    expect(component.open()).toBeFalse();
  });

  it('should filter accounts on search', () => {
    component.searchTerm.set('account 1');
    const groups = component.filteredGroups();
    expect(groups.length).toBe(1);
    expect((groups[0][1] as any[]).length).toBe(1);
  });

  it('should return all groups when search is empty', () => {
    component.searchTerm.set('');
    const groups = component.filteredGroups();
    expect(groups.length).toBe(1);
    expect((groups[0][1] as any[]).length).toBe(2);
  });

  it('should switch account and close dropdown', () => {
    component.open.set(true);
    component.selectAccount('act_2');
    expect(mockAdAccountService.switchAccount).toHaveBeenCalledWith('act_2');
    expect(component.open()).toBeFalse();
    expect(component.searchTerm()).toBe('');
  });

  it('should update searchTerm on input event', () => {
    const mockEvent = { target: { value: 'test search' } } as any;
    component.onSearch(mockEvent);
    expect(component.searchTerm()).toBe('test search');
  });
});
