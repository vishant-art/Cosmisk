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
    component.label = 'Test';
    component.type = 'hook';
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display the label text', () => {
    component.label = 'Shock Statement';
    component.type = 'hook';
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('span');
    expect(span.textContent.trim()).toBe('Shock Statement');
  });

  it('should apply hook badge class', () => {
    component.label = 'Test';
    component.type = 'hook';
    fixture.detectChanges();
    expect(component.badgeClass).toBe('bg-dna-hook-bg text-dna-hook-text');
  });

  it('should apply visual badge class', () => {
    component.label = 'Test';
    component.type = 'visual';
    fixture.detectChanges();
    expect(component.badgeClass).toBe('bg-dna-visual-bg text-dna-visual-text');
  });

  it('should apply audio badge class', () => {
    component.label = 'Test';
    component.type = 'audio';
    fixture.detectChanges();
    expect(component.badgeClass).toBe('bg-dna-audio-bg text-dna-audio-text');
  });
});
