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
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should not render content when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();
    const modal = fixture.nativeElement.querySelector('.fixed');
    expect(modal).toBeNull();
  });

  it('should render content when isOpen is true', () => {
    component.isOpen = true;
    fixture.detectChanges();
    const modal = fixture.nativeElement.querySelector('.fixed');
    expect(modal).toBeTruthy();
  });

  it('should display the title when provided', () => {
    component.isOpen = true;
    component.title = 'Test Modal';
    fixture.detectChanges();
    const h2 = fixture.nativeElement.querySelector('h2');
    expect(h2.textContent).toContain('Test Modal');
  });

  it('should not display header when title is empty', () => {
    component.isOpen = true;
    component.title = '';
    fixture.detectChanges();
    const h2 = fixture.nativeElement.querySelector('h2');
    expect(h2).toBeNull();
  });

  it('should apply maxWidth style', () => {
    component.isOpen = true;
    component.maxWidth = '600px';
    fixture.detectChanges();
    const content = fixture.nativeElement.querySelector('.relative.bg-white');
    expect(content.style.maxWidth).toBe('600px');
  });

  it('should emit close when backdrop is clicked', () => {
    component.isOpen = true;
    fixture.detectChanges();
    spyOn(component.close, 'emit');
    const backdrop = fixture.nativeElement.querySelector('.absolute.inset-0');
    backdrop.click();
    expect(component.close.emit).toHaveBeenCalled();
  });

  it('should emit close when close button is clicked', () => {
    component.isOpen = true;
    component.title = 'Test';
    fixture.detectChanges();
    spyOn(component.close, 'emit');
    const closeBtn = fixture.nativeElement.querySelector('button');
    closeBtn.click();
    expect(component.close.emit).toHaveBeenCalled();
  });

  it('should default maxWidth to 900px', () => {
    expect(component.maxWidth).toBe('900px');
  });
});
