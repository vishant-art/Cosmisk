import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { SidebarComponent } from './sidebar.component';
import { AutopilotBadgeService } from '../../../core/services/autopilot-badge.service';
import { signal } from '@angular/core';

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;
  let mockBadgeService: any;

  beforeEach(async () => {
    mockBadgeService = {
      unreadCount: signal(0),
      refresh: jasmine.createSpy('refresh'),
    };

    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        { provide: AutopilotBadgeService, useValue: mockBadgeService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should start with collapsed = false', () => {
    expect(component.collapsed()).toBeFalse();
  });

  it('should toggle collapsed state', () => {
    fixture.detectChanges();
    component.toggleCollapse();
    expect(component.collapsed()).toBeTrue();
    component.toggleCollapse();
    expect(component.collapsed()).toBeFalse();
  });

  it('should emit collapsedChange when toggling', () => {
    fixture.detectChanges();
    spyOn(component.collapsedChange, 'emit');
    component.toggleCollapse();
    expect(component.collapsedChange.emit).toHaveBeenCalledWith(true);
  });

  it('should start with mobileOpen = false', () => {
    expect(component.mobileOpen()).toBeFalse();
  });

  it('should set mobileOpen to true on openMobile()', () => {
    component.openMobile();
    expect(component.mobileOpen()).toBeTrue();
  });

  it('should set mobileOpen to false on closeMobile()', () => {
    component.openMobile();
    component.closeMobile();
    expect(component.mobileOpen()).toBeFalse();
  });

  it('should have 4 nav groups', () => {
    expect(component.navGroups.length).toBe(4);
  });

  it('should have Command, Intelligence, Create, Optimize groups', () => {
    const titles = component.navGroups.map(g => g.title);
    expect(titles).toEqual(['Command', 'Intelligence', 'Create', 'Optimize']);
  });

  it('should call badgeService.refresh on init', () => {
    fixture.detectChanges(); // triggers ngOnInit
    expect(mockBadgeService.refresh).toHaveBeenCalled();
  });

  it('should toggle collapse on Ctrl+B', () => {
    fixture.detectChanges();
    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true });
    component.onKeydown(event);
    expect(component.collapsed()).toBeTrue();
  });

  it('should toggle collapse on Meta+B', () => {
    fixture.detectChanges();
    const event = new KeyboardEvent('keydown', { key: 'b', metaKey: true });
    component.onKeydown(event);
    expect(component.collapsed()).toBeTrue();
  });

  it('should not toggle on plain B key', () => {
    fixture.detectChanges();
    const event = new KeyboardEvent('keydown', { key: 'b' });
    component.onKeydown(event);
    expect(component.collapsed()).toBeFalse();
  });

  it('should render the COSMISK brand text when not collapsed', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('COSMISK');
  });
});
