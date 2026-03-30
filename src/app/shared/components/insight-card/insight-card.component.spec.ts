import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { InsightCardComponent } from './insight-card.component';
import { AiInsight } from '../../../core/models/insight.model';

describe('InsightCardComponent', () => {
  let component: InsightCardComponent;
  let fixture: ComponentFixture<InsightCardComponent>;

  const mockInsight: AiInsight = {
    id: '1',
    priority: 'alert',
    title: 'High CPA Alert',
    description: 'CPA is above target',
    actionLabel: 'Pause Campaign',
    actionRoute: '/app/campaigns',
    actionType: 'pause',
    createdAt: '2025-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsightCardComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(InsightCardComponent);
    component = fixture.componentInstance;
    component.insight = { ...mockInsight };
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display the insight title', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('High CPA Alert');
  });

  it('should display the insight description', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('CPA is above target');
  });

  it('should return correct icon name for alert priority', () => {
    expect(component.iconName).toBe('alert-triangle');
  });

  it('should return correct icon name for positive priority', () => {
    component.insight = { ...mockInsight, priority: 'positive' };
    expect(component.iconName).toBe('check-circle-2');
  });

  it('should return correct icon name for pattern priority', () => {
    component.insight = { ...mockInsight, priority: 'pattern' };
    expect(component.iconName).toBe('circle-dot');
  });

  it('should return correct icon name for info priority', () => {
    component.insight = { ...mockInsight, priority: 'info' };
    expect(component.iconName).toBe('info');
  });

  it('should return correct card classes for each priority', () => {
    component.insight = { ...mockInsight, priority: 'alert' };
    expect(component.cardClasses).toContain('bg-red-50');

    component.insight = { ...mockInsight, priority: 'positive' };
    expect(component.cardClasses).toContain('bg-green-50');

    component.insight = { ...mockInsight, priority: 'pattern' };
    expect(component.cardClasses).toContain('bg-blue-50');

    component.insight = { ...mockInsight, priority: 'info' };
    expect(component.cardClasses).toContain('bg-gray-50');
  });

  it('should return correct action icon for scale action type', () => {
    component.insight = { ...mockInsight, actionType: 'scale' };
    expect(component.actionIcon).toBe('trending-up');
  });

  it('should return correct action icon for pause action type', () => {
    component.insight = { ...mockInsight, actionType: 'pause' };
    expect(component.actionIcon).toBe('pause');
  });

  it('should return correct action icon for reduce action type', () => {
    component.insight = { ...mockInsight, actionType: 'reduce' };
    expect(component.actionIcon).toBe('trending-down');
  });

  it('should emit actionClicked and set executing on action button click', () => {
    fixture.detectChanges();
    spyOn(component.actionClicked, 'emit');
    component.onAction();
    expect(component.executing).toBeTrue();
    expect(component.actionClicked.emit).toHaveBeenCalledWith(component.insight);
  });

  it('should reset executing after 3 seconds', fakeAsync(() => {
    fixture.detectChanges();
    component.onAction();
    expect(component.executing).toBeTrue();
    tick(3000);
    expect(component.executing).toBeFalse();
  }));

  it('should show link instead of button for navigate action type', () => {
    component.insight = { ...mockInsight, actionType: 'navigate' };
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('a');
    expect(link).toBeTruthy();
    const button = fixture.nativeElement.querySelector('button');
    expect(button).toBeNull();
  });

  it('should return correct title color for each priority', () => {
    component.insight = { ...mockInsight, priority: 'alert' };
    expect(component.titleColor).toBe('text-red-800');

    component.insight = { ...mockInsight, priority: 'positive' };
    expect(component.titleColor).toBe('text-green-800');
  });
});
