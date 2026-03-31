import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastComponent } from './toast.component';
import { ToastService } from '../../../core/services/toast.service';

describe('ToastComponent', () => {
  let component: ToastComponent;
  let fixture: ComponentFixture<ToastComponent>;
  let toastServiceSpy: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    toastServiceSpy = jasmine.createSpyObj('ToastService', ['dismiss'], {
      activeToasts: jasmine.createSpy().and.returnValue([]),
    });

    await TestBed.configureTestingModule({
      imports: [ToastComponent],
    })
      .overrideProvider(ToastService, { useValue: toastServiceSpy })
      .compileComponents();

    fixture = TestBed.createComponent(ToastComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return correct border class for success', () => {
    expect(component.getBorderClass('success')).toBe('border-green-500');
  });

  it('should return correct border class for error', () => {
    expect(component.getBorderClass('error')).toBe('border-red-500');
  });

  it('should return correct border class for warning', () => {
    expect(component.getBorderClass('warning')).toBe('border-yellow-500');
  });

  it('should return correct border class for info', () => {
    expect(component.getBorderClass('info')).toBe('border-blue-500');
  });

  it('should return correct icon for success', () => {
    expect(component.getIcon('success')).toBeTruthy();
  });

  it('should return correct icon for error', () => {
    expect(component.getIcon('error')).toBeTruthy();
  });

  it('should return correct icon for warning', () => {
    expect(component.getIcon('warning')).toBeTruthy();
  });

  it('should return correct icon for info', () => {
    expect(component.getIcon('info')).toBeTruthy();
  });

  it('should have different icons for each type', () => {
    const icons = new Set([
      component.getIcon('success'),
      component.getIcon('error'),
      component.getIcon('warning'),
      component.getIcon('info'),
    ]);
    expect(icons.size).toBe(4);
  });
});
