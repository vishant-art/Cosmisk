import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DnaBadgeComponent } from './dna-badge.component';

describe('DnaBadgeComponent', () => {
  let component: DnaBadgeComponent;
  let fixture: ComponentFixture<DnaBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DnaBadgeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DnaBadgeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept label input', () => {
    component.label = 'Price Anchor';
    expect(component.label).toBe('Price Anchor');
  });

  it('should default type to hook', () => {
    expect(component.type).toBe('hook');
  });

  it('should accept type input', () => {
    component.type = 'visual';
    expect(component.type).toBe('visual');
  });

  it('should return correct badgeClass for hook', () => {
    component.type = 'hook';
    expect(component.badgeClass).toBe('bg-dna-hook-bg text-dna-hook-text');
  });

  it('should return correct badgeClass for visual', () => {
    component.type = 'visual';
    expect(component.badgeClass).toBe('bg-dna-visual-bg text-dna-visual-text');
  });

  it('should return correct badgeClass for audio', () => {
    component.type = 'audio';
    expect(component.badgeClass).toBe('bg-dna-audio-bg text-dna-audio-text');
  });

  it('should render the label text', () => {
    component.label = 'ASMR';
    component.type = 'audio';
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ASMR');
  });
});
