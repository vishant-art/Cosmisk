import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { SidebarComponent } from './sidebar.component';
import { AutopilotBadgeService } from '../../../core/services/autopilot-badge.service';
import { Component } from '@angular/core';

// Stub child components to avoid importing their full dependency trees
@Component({ selector: 'app-brand-switcher', standalone: true, template: '' })
class BrandSwitcherStubComponent {}

@Component({ selector: 'app-account-switcher', standalone: true, template: '' })
class AccountSwitcherStubComponent {}

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;
  let badgeServiceSpy: jasmine.SpyObj<AutopilotBadgeService>;

  beforeEach(async () => {
    badgeServiceSpy = jasmine.createSpyObj('AutopilotBadgeService', ['refresh'], {
      unreadCount: jasmine.createSpy().and.returnValue(0),
    });

    await TestBed.configureTestingModule({
      imports: [SidebarComponent, RouterTestingModule],
    })
      .overrideComponent(SidebarComponent, {
        remove: { imports: [/* BrandSwitcherComponent, AccountSwitcherComponent */] },
        add: { imports: [BrandSwitcherStubComponent, AccountSwitcherStubComponent] },
      })
      .overrideComponent(SidebarComponent, {
        set: {
          providers: [],
        },
      })
      .compileComponents();

    TestBed.overrideProvider(AutopilotBadgeService, { useValue: badgeServiceSpy });

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with collapsed = false', () => {
    expect(component.collapsed()).toBeFalse();
  });

  it('should toggle collapsed state', () => {
    component.toggleCollapse();
    expect(component.collapsed()).toBeTrue();
    component.toggleCollapse();
    expect(component.collapsed()).toBeFalse();
  });

  it('should emit collapsedChange on toggle', () => {
    spyOn(component.collapsedChange, 'emit');
    component.toggleCollapse();
    expect(component.collapsedChange.emit).toHaveBeenCalledWith(true);
  });

  it('should have navigation groups defined', () => {
    expect(component.navGroups.length).toBeGreaterThan(0);
    expect(component.navGroups[0].title).toBe('Command');
  });

  it('should close mobile overlay', () => {
    component.mobileOpen.set(true);
    component.closeMobile();
    expect(component.mobileOpen()).toBeFalse();
  });

  it('should open mobile overlay', () => {
    component.openMobile();
    expect(component.mobileOpen()).toBeTrue();
  });

  it('should toggle collapse on Cmd+B', () => {
    const event = new KeyboardEvent('keydown', { key: 'b', metaKey: true });
    component.onKeydown(event);
    expect(component.collapsed()).toBeTrue();
  });

  it('should not toggle collapse on plain B key', () => {
    const event = new KeyboardEvent('keydown', { key: 'b' });
    component.onKeydown(event);
    expect(component.collapsed()).toBeFalse();
  });

  it('should clear badge interval on destroy', () => {
    spyOn(window, 'clearInterval').and.callThrough();
    component.ngOnInit();
    const intervalRef = component['badgeInterval'];
    expect(intervalRef).not.toBeNull();
    component.ngOnDestroy();
    expect(window.clearInterval).toHaveBeenCalledWith(intervalRef as any);
  });
});
