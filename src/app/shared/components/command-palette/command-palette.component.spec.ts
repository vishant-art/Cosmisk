import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CommandPaletteComponent } from './command-palette.component';
import { AiService } from '../../../core/services/ai.service';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

describe('CommandPaletteComponent', () => {
  let component: CommandPaletteComponent;
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let aiServiceSpy: jasmine.SpyObj<AiService>;
  let router: Router;

  beforeEach(async () => {
    aiServiceSpy = jasmine.createSpyObj('AiService', ['chat']);
    aiServiceSpy.chat.and.returnValue(of({ content: 'Test AI response' }));

    await TestBed.configureTestingModule({
      imports: [CommandPaletteComponent, RouterTestingModule, HttpClientTestingModule],
    })
      .overrideProvider(AiService, { useValue: aiServiceSpy })
      .compileComponents();

    fixture = TestBed.createComponent(CommandPaletteComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start closed', () => {
    expect(component.open()).toBeFalse();
  });

  it('should default to AI mode', () => {
    expect(component.mode()).toBe('ai');
  });

  it('should start with empty query', () => {
    expect(component.query).toBe('');
  });

  it('should have allItems defined', () => {
    expect(component.allItems.length).toBeGreaterThan(0);
  });

  it('should have quick commands defined', () => {
    expect(component.quickCommands.length).toBeGreaterThan(0);
  });

  it('should have shortcuts defined', () => {
    expect(component.shortcuts.length).toBeGreaterThan(0);
  });

  it('should close and reset state', () => {
    component.open.set(true);
    component.query = 'test';
    component.mode.set('nav');
    component.aiResponse.set('some response');
    component.aiLoading.set(true);

    component.close();

    expect(component.open()).toBeFalse();
    expect(component.query).toBe('');
    expect(component.mode()).toBe('ai');
    expect(component.aiResponse()).toBeNull();
    expect(component.aiLoading()).toBeFalse();
    expect(component.activeIndex).toBe(0);
  });

  it('should filter items on search', () => {
    component.query = 'dashboard';
    component.onSearch();
    const items = component.filteredItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items.some(i => i.label.toLowerCase().includes('dashboard'))).toBeTrue();
  });

  it('should return all items when query is empty', () => {
    component.query = '';
    component.onSearch();
    expect(component.filteredItems().length).toBe(component.allItems.length);
  });

  it('should switch to AI mode for natural language queries', () => {
    component.mode.set('nav');
    component.query = 'which campaigns should I pause today';
    component.onSearch();
    expect(component.mode()).toBe('ai');
  });

  it('should get categories from filtered items', () => {
    component.query = '';
    component.onSearch();
    const cats = component.categories();
    expect(cats).toContain('Pages');
    expect(cats).toContain('Actions');
  });

  it('should get items by category', () => {
    component.query = '';
    component.onSearch();
    const pages = component.getItemsByCategory('Pages');
    expect(pages.length).toBeGreaterThan(0);
    pages.forEach(p => expect(p.category).toBe('Pages'));
  });

  it('should switch to nav mode', () => {
    component.mode.set('ai');
    component.aiResponse.set('response');
    component.switchToNav();
    expect(component.mode()).toBe('nav');
    expect(component.aiResponse()).toBeNull();
    expect(component.aiActions()).toEqual([]);
  });

  it('should execute item and navigate', () => {
    spyOn(router, 'navigate');
    const item = { id: 'nav-dashboard', label: 'Dashboard', category: 'Pages', icon: '', route: '/app/dashboard' };
    component.open.set(true);
    component.executeItem(item);
    expect(component.open()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/app/dashboard']);
  });

  it('should execute item action if defined', () => {
    const actionSpy = jasmine.createSpy('action');
    const item = { id: 'act-test', label: 'Test', category: 'Actions', icon: '', action: actionSpy };
    component.executeItem(item);
    expect(actionSpy).toHaveBeenCalled();
  });

  it('should execute AI action and navigate', () => {
    spyOn(router, 'navigate');
    component.open.set(true);
    component.executeAiAction({ label: 'Open Autopilot', route: '/app/autopilot' });
    expect(component.open()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/app/autopilot']);
  });

  it('should ask AI and set response', () => {
    component.askAi('test prompt');
    expect(component.aiLoading()).toBeFalse();
    expect(component.aiResponse()).toBe('Test AI response');
  });

  it('should handle AI error', () => {
    aiServiceSpy.chat.and.returnValue(throwError(() => new Error('Network error')));
    component.askAi('test');
    expect(component.aiLoading()).toBeFalse();
    expect(component.aiResponse()).toContain('Could not reach AI');
  });

  it('should execute quick command', () => {
    component.executeQuickCommand('Show my best ads');
    expect(component.query).toBe('Show my best ads');
    expect(aiServiceSpy.chat).toHaveBeenCalledWith('Show my best ads');
  });

  it('should handle Tab key to toggle mode', () => {
    component.mode.set('ai');
    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    spyOn(event, 'preventDefault');
    component.onInputKeydown(event);
    expect(component.mode()).toBe('nav');
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should handle Escape key to close', () => {
    component.open.set(true);
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onInputKeydown(event);
    expect(component.open()).toBeFalse();
  });

  it('should handle ArrowDown to increment activeIndex', () => {
    component.query = '';
    component.onSearch(); // populate filteredCache
    component.activeIndex = 0;
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    spyOn(event, 'preventDefault');
    component.onInputKeydown(event);
    expect(component.activeIndex).toBe(1);
  });

  it('should handle ArrowUp to decrement activeIndex', () => {
    component.activeIndex = 2;
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    spyOn(event, 'preventDefault');
    component.onInputKeydown(event);
    expect(component.activeIndex).toBe(1);
  });

  it('should not go below 0 on ArrowUp', () => {
    component.activeIndex = 0;
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    spyOn(event, 'preventDefault');
    component.onInputKeydown(event);
    expect(component.activeIndex).toBe(0);
  });

  it('should open command palette on Cmd+K', () => {
    component.open.set(false);
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    Object.defineProperty(event, 'target', { value: document.createElement('div') });
    component.onKeydown(event);
    expect(component.open()).toBeTrue();
  });

  it('should close command palette on Cmd+K when already open', () => {
    component.open.set(true);
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    Object.defineProperty(event, 'target', { value: document.createElement('div') });
    component.onKeydown(event);
    expect(component.open()).toBeFalse();
  });

  it('should toggle shortcuts overlay on ?', () => {
    expect(component.showShortcuts()).toBeFalse();
    const event = new KeyboardEvent('keydown', { key: '?', shiftKey: true });
    Object.defineProperty(event, 'target', { value: document.createElement('div') });
    component.onKeydown(event);
    expect(component.showShortcuts()).toBeTrue();
  });
});
