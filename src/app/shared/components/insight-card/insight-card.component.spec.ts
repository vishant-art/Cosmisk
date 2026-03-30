import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InsightCardComponent } from './insight-card.component';
import { AiInsight } from '../../../core/models/insight.model';

describe('InsightCardComponent', () => {
  let component: InsightCardComponent;
  let fixture: ComponentFixture<InsightCardComponent>;

  const mockInsight: AiInsight = {
    id: '1', priority: 'alert', title: 'High CPA Alert', description: 'CPA is above target',
    actionLabel: 'Pause Campaign', actionRoute: '/app/campaigns', actionType: 'pause', createdAt: '2025-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsightCardComponent],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .overrideComponent(InsightCardComponent, {
      set: { imports: [CommonModule], schemas: [NO_ERRORS_SCHEMA] }
    })
    .compileComponents();
    fixture = TestBed.createComponent(InsightCardComponent);
    component = fixture.componentInstance;
    component.insight = { ...mockInsight };
  });

  it('should create', () => { fixture.detectChanges(); expect(component).toBeTruthy(); });
  it('should display the insight title', () => { fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('High CPA Alert'); });
  it('should display the insight description', () => { fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('CPA is above target'); });
  it('should return correct icon name for alert', () => { expect(component.iconName).toBe('alert-triangle'); });
  it('should return correct icon name for positive', () => { component.insight = { ...mockInsight, priority: 'positive' }; expect(component.iconName).toBe('check-circle-2'); });
  it('should return correct icon name for pattern', () => { component.insight = { ...mockInsight, priority: 'pattern' }; expect(component.iconName).toBe('circle-dot'); });
  it('should return correct icon name for info', () => { component.insight = { ...mockInsight, priority: 'info' }; expect(component.iconName).toBe('info'); });

  it('should return correct card classes', () => {
    expect(component.cardClasses).toContain('bg-red-50');
    component.insight = { ...mockInsight, priority: 'positive' }; expect(component.cardClasses).toContain('bg-green-50');
    component.insight = { ...mockInsight, priority: 'pattern' }; expect(component.cardClasses).toContain('bg-blue-50');
    component.insight = { ...mockInsight, priority: 'info' }; expect(component.cardClasses).toContain('bg-gray-50');
  });

  it('should return correct action icon for scale', () => { component.insight = { ...mockInsight, actionType: 'scale' }; expect(component.actionIcon).toBe('trending-up'); });
  it('should return correct action icon for pause', () => { expect(component.actionIcon).toBe('pause'); });
  it('should return correct action icon for reduce', () => { component.insight = { ...mockInsight, actionType: 'reduce' }; expect(component.actionIcon).toBe('trending-down'); });

  it('should emit actionClicked on action', () => {
    fixture.detectChanges();
    spyOn(component.actionClicked, 'emit');
    component.onAction();
    expect(component.executing).toBeTrue();
    expect(component.actionClicked.emit).toHaveBeenCalledWith(component.insight);
  });

  it('should reset executing after 3 seconds', fakeAsync(() => {
    fixture.detectChanges(); component.onAction(); expect(component.executing).toBeTrue();
    tick(3000); expect(component.executing).toBeFalse();
  }));

  it('should show link for navigate action type', () => {
    component.insight = { ...mockInsight, actionType: 'navigate' };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('should return correct title color', () => {
    expect(component.titleColor).toBe('text-red-800');
    component.insight = { ...mockInsight, priority: 'positive' }; expect(component.titleColor).toBe('text-green-800');
  });
});
