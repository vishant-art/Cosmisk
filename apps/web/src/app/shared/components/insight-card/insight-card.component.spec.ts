import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { InsightCardComponent } from './insight-card.component';
import { AiInsight } from '../../../core/models/insight.model';

describe('InsightCardComponent', () => {
  let component: InsightCardComponent;
  let fixture: ComponentFixture<InsightCardComponent>;

  const mockInsight: AiInsight = {
    id: 'ins-1',
    priority: 'alert',
    title: 'CPA Spike Detected',
    description: 'Your CPA increased 40% in the last 24 hours.',
    actionLabel: 'Pause Campaign',
    actionRoute: '/app/automations',
    actionType: 'pause',
    createdAt: '2026-03-30T10:00:00Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsightCardComponent, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(InsightCardComponent);
    component = fixture.componentInstance;
    component.insight = mockInsight;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept insight input', () => {
    expect(component.insight.title).toBe('CPA Spike Detected');
  });

  it('should emit actionClicked on action', () => {
    spyOn(component.actionClicked, 'emit');
    component.onAction();
    expect(component.actionClicked.emit).toHaveBeenCalledWith(mockInsight);
    expect(component.executing).toBeTrue();
  });

  it('should reset executing after 3 seconds', fakeAsync(() => {
    component.onAction();
    expect(component.executing).toBeTrue();
    tick(3000);
    expect(component.executing).toBeFalse();
  }));

  it('should return correct actionIcon for pause', () => {
    component.insight = { ...mockInsight, actionType: 'pause' };
    expect(component.actionIcon).toBe('pause');
  });

  it('should return correct actionIcon for scale', () => {
    component.insight = { ...mockInsight, actionType: 'scale' };
    expect(component.actionIcon).toBe('trending-up');
  });

  it('should return correct actionIcon for increase', () => {
    component.insight = { ...mockInsight, actionType: 'increase' };
    expect(component.actionIcon).toBe('trending-up');
  });

  it('should return correct actionIcon for reduce', () => {
    component.insight = { ...mockInsight, actionType: 'reduce' };
    expect(component.actionIcon).toBe('trending-down');
  });

  it('should return correct actionIcon for navigate (default)', () => {
    component.insight = { ...mockInsight, actionType: 'navigate' };
    expect(component.actionIcon).toBe('zap');
  });

  it('should return correct iconName for each priority', () => {
    component.insight = { ...mockInsight, priority: 'alert' };
    expect(component.iconName).toBe('alert-triangle');

    component.insight = { ...mockInsight, priority: 'positive' };
    expect(component.iconName).toBe('check-circle-2');

    component.insight = { ...mockInsight, priority: 'pattern' };
    expect(component.iconName).toBe('circle-dot');

    component.insight = { ...mockInsight, priority: 'info' };
    expect(component.iconName).toBe('info');
  });

  it('should return correct cardClasses for each priority', () => {
    component.insight = { ...mockInsight, priority: 'alert' };
    expect(component.cardClasses).toContain('bg-red-50');

    component.insight = { ...mockInsight, priority: 'positive' };
    expect(component.cardClasses).toContain('bg-green-50');

    component.insight = { ...mockInsight, priority: 'pattern' };
    expect(component.cardClasses).toContain('bg-blue-50');

    component.insight = { ...mockInsight, priority: 'info' };
    expect(component.cardClasses).toContain('bg-gray-50');
  });

  it('should return correct actionButtonClasses for each priority', () => {
    component.insight = { ...mockInsight, priority: 'alert' };
    expect(component.actionButtonClasses).toContain('bg-red-600');

    component.insight = { ...mockInsight, priority: 'positive' };
    expect(component.actionButtonClasses).toContain('bg-green-600');
  });

  it('should return correct titleColor for each priority', () => {
    component.insight = { ...mockInsight, priority: 'alert' };
    expect(component.titleColor).toBe('text-red-800');

    component.insight = { ...mockInsight, priority: 'info' };
    expect(component.titleColor).toBe('text-gray-800');
  });

  it('should return correct linkColor for each priority', () => {
    component.insight = { ...mockInsight, priority: 'positive' };
    expect(component.linkColor).toBe('text-green-600');

    component.insight = { ...mockInsight, priority: 'pattern' };
    expect(component.linkColor).toBe('text-blue-600');
  });
});
