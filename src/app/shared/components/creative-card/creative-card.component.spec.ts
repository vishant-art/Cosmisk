import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreativeCardComponent } from './creative-card.component';
import { Creative } from '../../../core/models/creative.model';
import { Component, Input } from '@angular/core';

// Stub child components
@Component({ selector: 'app-dna-badge', standalone: true, template: '' })
class DnaBadgeStubComponent {
  @Input() label = '';
  @Input() type = 'hook';
}

@Component({ selector: 'app-status-badge', standalone: true, template: '' })
class StatusBadgeStubComponent {
  @Input() status = 'stable';
}

describe('CreativeCardComponent', () => {
  let component: CreativeCardComponent;
  let fixture: ComponentFixture<CreativeCardComponent>;

  const mockCreative: Creative = {
    id: 'cr-1',
    name: 'Summer Sale Video',
    brandId: 'brand-1',
    format: 'video',
    duration: 30,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    status: 'winning',
    dna: {
      hook: ['Price Anchor'],
      visual: ['Warm Palette', 'UGC Style'],
      audio: ['Hindi VO'],
    },
    metrics: { roas: 3.5, cpa: 150, ctr: 2.1, spend: 50000, impressions: 100000, clicks: 2100, conversions: 333 },
    trend: { direction: 'up', percentage: 15, period: '7d' },
    daysActive: 14,
    createdAt: '2026-03-01T00:00:00Z',
    adSetId: 'as-1',
    campaignId: 'camp-1',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreativeCardComponent],
    })
      .overrideComponent(CreativeCardComponent, {
        remove: { imports: [] },
        add: { imports: [DnaBadgeStubComponent, StatusBadgeStubComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CreativeCardComponent);
    component = fixture.componentInstance;
    component.creative = mockCreative;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept creative input', () => {
    expect(component.creative.name).toBe('Summer Sale Video');
  });

  it('should accept optional source input', () => {
    component.source = 'meta';
    expect(component.source).toBe('meta');
  });

  it('should return correct statusDotClass for winning', () => {
    component.creative = { ...mockCreative, status: 'winning' };
    expect(component.statusDotClass).toBe('bg-green-500');
  });

  it('should return correct statusDotClass for stable', () => {
    component.creative = { ...mockCreative, status: 'stable' };
    expect(component.statusDotClass).toBe('bg-gray-400');
  });

  it('should return correct statusDotClass for fatiguing', () => {
    component.creative = { ...mockCreative, status: 'fatiguing' };
    expect(component.statusDotClass).toBe('bg-red-500');
  });

  it('should return correct statusDotClass for new', () => {
    component.creative = { ...mockCreative, status: 'new' };
    expect(component.statusDotClass).toBe('bg-blue-500');
  });

  it('should return green roasColor for ROAS >= 3', () => {
    component.creative = { ...mockCreative, metrics: { ...mockCreative.metrics, roas: 4.0 } };
    expect(component.roasColor).toBe('text-green-600');
  });

  it('should return yellow roasColor for ROAS >= 2 but < 3', () => {
    component.creative = { ...mockCreative, metrics: { ...mockCreative.metrics, roas: 2.5 } };
    expect(component.roasColor).toBe('text-yellow-600');
  });

  it('should return red roasColor for ROAS < 2', () => {
    component.creative = { ...mockCreative, metrics: { ...mockCreative.metrics, roas: 1.2 } };
    expect(component.roasColor).toBe('text-red-600');
  });

  it('should return correct trendColor', () => {
    component.creative = { ...mockCreative, trend: { direction: 'up', percentage: 10, period: '7d' } };
    expect(component.trendColor).toBe('text-green-600');

    component.creative = { ...mockCreative, trend: { direction: 'down', percentage: 5, period: '7d' } };
    expect(component.trendColor).toBe('text-red-600');

    component.creative = { ...mockCreative, trend: { direction: 'flat', percentage: 0, period: '7d' } };
    expect(component.trendColor).toBe('text-gray-500');
  });

  it('should return correct trendArrow', () => {
    component.creative = { ...mockCreative, trend: { direction: 'up', percentage: 10, period: '7d' } };
    expect(component.trendArrow).toBe('\u2191');

    component.creative = { ...mockCreative, trend: { direction: 'down', percentage: 5, period: '7d' } };
    expect(component.trendArrow).toBe('\u2193');

    component.creative = { ...mockCreative, trend: { direction: 'flat', percentage: 0, period: '7d' } };
    expect(component.trendArrow).toBe('\u2192');
  });

  it('should handle image error with placeholder', () => {
    const mockEvent = { target: { src: '' } as HTMLImageElement } as unknown as Event;
    component.onImgError(mockEvent);
    expect((mockEvent.target as any).src).toContain('placehold.co');
  });
});
