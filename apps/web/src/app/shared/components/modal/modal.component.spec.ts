import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';

describe('ModalComponent', () => {
  let component: ModalComponent;
  let fixture: ComponentFixture<ModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ModalComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default isOpen to false', () => {
    expect(component.isOpen).toBeFalse();
  });

  it('should default title to empty string', () => {
    expect(component.title).toBe('');
  });

  it('should default maxWidth to 900px', () => {
    expect(component.maxWidth).toBe('900px');
  });

  it('should accept isOpen input', () => {
    component.isOpen = true;
    fixture.detectChanges();
    expect(component.isOpen).toBeTrue();
  });

  it('should accept title input', () => {
    component.title = 'Test Modal';
    fixture.detectChanges();
    expect(component.title).toBe('Test Modal');
  });

  it('should accept maxWidth input', () => {
    component.maxWidth = '600px';
    fixture.detectChanges();
    expect(component.maxWidth).toBe('600px');
  });

  it('should emit close event', () => {
    spyOn(component.close, 'emit');
    component.close.emit();
    expect(component.close.emit).toHaveBeenCalled();
  });

  it('should not render content when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.fixed')).toBeNull();
  });

  it('should render content when isOpen is true', () => {
    component.isOpen = true;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.fixed')).toBeTruthy();
  });
});
