import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { CreativeCardComponent } from './creative-card.component';
import { Creative } from '../../../core/models/creative.model';

describe('CreativeCardComponent', () => {
  let component: CreativeCardComponent;
  let fixture: ComponentFixture<CreativeCardComponent>;

  const mockCreative: Creative = {
    id: 'c1',
    name: 'Test Ad Creative',
    brandId: 'b1',
    format: 'video',
    duration: 30,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    status: 'winning',
    dna: {
      hook: ['Shock Statement'],
      visual: ['UGC Style', 'Warm Palette'],
      audio: ['Hindi VO'],
    },
    metrics: {
      roas: 3.5,
      cpa: 120,
      ctr: 2.1,
      spend: 50000,
      impressions: 100000,
      clicks: 2100,
      conversions: 417,
    },
    trend: {
      direction: 'up',
      percentage: 15,
      period: 'vs last 7d',
    },
    daysActive: 14,
    createdAt: '2025-01-01',
    adSetId: 'as1',
    campaignId: 'camp1',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreativeCardComponent],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(CreativeCardComponent);
    component = fixture.componentInstance;
    component.creative = { ...mockCreative };
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display the creative name', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Test Ad Creative');
  });

  it('should display the format badge', () => {
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.font-mono.rounded.uppercase');
    expect(badge.textContent).toContain('video');
  });

  it('should show duration for video format', () => {
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.font-mono.rounded.uppercase');
    expect(badge.textContent).toContain('30s');
  });

  it('should return correct status dot class for winning', () => {
    expect(component.statusDotClass).toBe('bg-green-500');
  });

  it('should return correct status dot class for fatiguing', () => {
    component.creative = { ...mockCreative, status: 'fatiguing' };
    expect(component.statusDotClass).toBe('bg-red-500');
  });

  it('should return correct status dot class for new', () => {
    component.creative = { ...mockCreative, status: 'new' };
    expect(component.statusDotClass).toBe('bg-blue-500');
  });

  it('should return correct roas color for high ROAS', () => {
    component.creative = { ...mockCreative, metrics: { ...mockCreative.metrics, roas: 3.5 } };
    expect(component.roasColor).toBe('text-green-600');
  });

  it('should return correct roas color for medium ROAS', () => {
    component.creative = { ...mockCreative, metrics: { ...mockCreative.metrics, roas: 2.5 } };
    expect(component.roasColor).toBe('text-yellow-600');
  });

  it('should return correct roas color for low ROAS', () => {
    component.creative = { ...mockCreative, metrics: { ...mockCreative.metrics, roas: 1.0 } };
    expect(component.roasColor).toBe('text-red-600');
  });

  it('should return correct trend arrow for up direction', () => {
    expect(component.trendArrow).toBe('\u2191');
  });

  it('should return correct trend arrow for down direction', () => {
    component.creative = { ...mockCreative, trend: { direction: 'down', percentage: 10, period: 'vs last 7d' } };
    expect(component.trendArrow).toBe('\u2193');
  });

  it('should return correct trend arrow for flat direction', () => {
    component.creative = { ...mockCreative, trend: { direction: 'flat', percentage: 0, period: 'vs last 7d' } };
    expect(component.trendArrow).toBe('\u2192');
  });

  it('should return correct trend color', () => {
    expect(component.trendColor).toBe('text-green-600');
    component.creative = { ...mockCreative, trend: { direction: 'down', percentage: 5, period: '' } };
    expect(component.trendColor).toBe('text-red-600');
  });

  it('should display source badge when source is set', () => {
    component.source = 'meta';
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('meta');
  });

  it('should handle image error by setting placeholder', () => {
    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    const event = new Event('error');
    Object.defineProperty(event, 'target', { value: img });
    component.onImgError(event);
    expect(img.src).toContain('placehold.co');
  });

  it('should display ROAS metric', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('3.5x');
  });

  it('should display CTR metric', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('2.1%');
  });
});
