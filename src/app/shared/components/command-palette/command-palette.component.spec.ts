import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommandPaletteComponent } from './command-palette.component';
import { AiService } from '../../../core/services/ai.service';
import { of, throwError } from 'rxjs';

describe('CommandPaletteComponent', () => {
  let component: CommandPaletteComponent;
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let mockRouter: any;
  let mockAiService: any;

  beforeEach(async () => {
    mockRouter = {
      navigate: jasmine.createSpy('navigate'),
      events: of(),
    };

    mockAiService = {
      chat: jasmine.createSpy('chat').and.returnValue(of({ content: 'AI response here' })),
    };

    await TestBed.configureTestingModule({
      imports: [CommandPaletteComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: AiService, useValue: mockAiService },
        { provide: HttpClient, useValue: {} },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(CommandPaletteComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should start closed', () => {
    expect(component.open()).toBeFalse();
  });

  it('should start in AI mode', () => {
    expect(component.mode()).toBe('ai');
  });

  it('should open on Cmd+K', () => {
    fixture.detectChanges();
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    component.onKeydown(event);
    expect(component.open()).toBeTrue();
  });

  it('should close on Cmd+K when already open', () => {
    fixture.detectChanges();
    component.open.set(true);
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    component.onKeydown(event);
    expect(component.open()).toBeFalse();
  });

  it('should close and reset state', () => {
    component.open.set(true);
    component.query = 'test';
    component.mode.set('nav');
    component.close();
    expect(component.open()).toBeFalse();
    expect(component.query).toBe('');
    expect(component.mode()).toBe('ai');
    expect(component.aiResponse()).toBeNull();
    expect(component.aiLoading()).toBeFalse();
  });

  it('should filter items on search', () => {
    component.query = 'Dashboard';
    component.onSearch();
    const items = component.filteredItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.label.toLowerCase().includes('dashboard') || i.category.toLowerCase().includes('dashboard'))).toBeTrue();
  });

  it('should return all items when query is empty', () => {
    component.query = '';
    component.onSearch();
    expect(component.filteredItems().length).toBe(component.allItems.length);
  });

  it('should switch to AI mode for natural language queries', () => {
    component.mode.set('nav');
    component.query = 'show me my best performing ads';
    component.onSearch();
    expect(component.mode()).toBe('ai');
  });

  it('should handle Tab key to switch modes', () => {
    component.mode.set('nav');
    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    component.onInputKeydown(event);
    expect(component.mode()).toBe('ai');
  });

  it('should handle Escape key to close', () => {
    component.open.set(true);
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onInputKeydown(event);
    expect(component.open()).toBeFalse();
  });

  it('should handle ArrowDown to increment activeIndex', () => {
    component.query = '';
    component.onSearch();
    component.activeIndex = 0;
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    component.onInputKeydown(event);
    expect(component.activeIndex).toBe(1);
  });

  it('should handle ArrowUp to decrement activeIndex', () => {
    component.activeIndex = 2;
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    component.onInputKeydown(event);
    expect(component.activeIndex).toBe(1);
  });

  it('should not go below 0 on ArrowUp', () => {
    component.activeIndex = 0;
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    component.onInputKeydown(event);
    expect(component.activeIndex).toBe(0);
  });

  it('should execute item and navigate on Enter in nav mode', () => {
    component.mode.set('nav');
    component.query = '';
    component.onSearch();
    component.activeIndex = 0;
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onInputKeydown(event);
    expect(mockRouter.navigate).toHaveBeenCalled();
  });

  it('should ask AI on Enter in AI mode with query', () => {
    component.mode.set('ai');
    component.query = 'What are my best ads?';
    fixture.detectChanges();
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onInputKeydown(event);
    expect(mockAiService.chat).toHaveBeenCalledWith('What are my best ads?');
  });

  it('should set aiResponse after AI call', () => {
    component.askAi('test prompt');
    expect(component.aiResponse()).toBe('AI response here');
    expect(component.aiLoading()).toBeFalse();
  });

  it('should handle AI error', () => {
    mockAiService.chat.and.returnValue(throwError(() => new Error('fail')));
    component.askAi('test');
    expect(component.aiResponse()).toContain('Could not reach AI');
    expect(component.aiLoading()).toBeFalse();
  });

  it('should execute quick command', () => {
    component.executeQuickCommand('Test prompt');
    expect(component.query).toBe('Test prompt');
    expect(mockAiService.chat).toHaveBeenCalledWith('Test prompt');
  });

  it('should execute AI action and navigate', () => {
    component.open.set(true);
    component.executeAiAction({ label: 'Go', route: '/app/analytics' });
    expect(component.open()).toBeFalse();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/analytics']);
  });

  it('should execute item with route', () => {
    component.open.set(true);
    component.executeItem({ id: 'test', label: 'Test', category: 'Pages', icon: '', route: '/app/dashboard' });
    expect(component.open()).toBeFalse();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/app/dashboard']);
  });

  it('should execute item with action', () => {
    const actionSpy = jasmine.createSpy('action');
    component.open.set(true);
    component.executeItem({ id: 'test', label: 'Test', category: 'Actions', icon: '', action: actionSpy });
    expect(actionSpy).toHaveBeenCalled();
  });

  it('should switch to nav mode', () => {
    component.mode.set('ai');
    component.aiResponse.set('some response');
    component.switchToNav();
    expect(component.mode()).toBe('nav');
    expect(component.aiResponse()).toBeNull();
  });

  it('should get categories from filtered items', () => {
    component.query = '';
    component.onSearch();
    const categories = component.categories();
    expect(categories).toContain('Pages');
    expect(categories).toContain('Actions');
  });

  it('should get items by category', () => {
    component.query = '';
    component.onSearch();
    const pages = component.getItemsByCategory('Pages');
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every(i => i.category === 'Pages')).toBeTrue();
  });

  it('should toggle shortcuts overlay with ? key', () => {
    fixture.detectChanges();
    expect(component.showShortcuts()).toBeFalse();
    const event = new KeyboardEvent('keydown', { key: '?' });
    Object.defineProperty(event, 'target', { value: document.body });
    component.onKeydown(event);
    expect(component.showShortcuts()).toBeTrue();
  });
});
