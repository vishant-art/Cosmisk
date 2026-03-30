import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastComponent } from './toast.component';
import { ToastService } from '../../../core/services/toast.service';
import { signal } from '@angular/core';

describe('ToastComponent', () => {
  let component: ToastComponent;
  let fixture: ComponentFixture<ToastComponent>;
  let mockToastService: jasmine.SpyObj<ToastService> & { activeToasts: ReturnType<typeof signal> };

  beforeEach(async () => {
    const activeToasts = signal<any[]>([]);
    mockToastService = {
      ...jasmine.createSpyObj('ToastService', ['dismiss', 'show', 'success', 'error', 'warning', 'info']),
      activeToasts: activeToasts.asReadonly(),
    } as any;

    await TestBed.configureTestingModule({
      imports: [ToastComponent],
      providers: [
        { provide: ToastService, useValue: mockToastService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ToastComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
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

  it('should return correct icon for each type', () => {
    expect(component.getIcon('success')).toBe('\u2713');
    expect(component.getIcon('error')).toBe('\u2715');
    expect(component.getIcon('warning')).toBe('\u26A0');
    expect(component.getIcon('info')).toBe('\u2139');
  });

  it('should render no toasts when activeToasts is empty', () => {
    fixture.detectChanges();
    const toasts = fixture.nativeElement.querySelectorAll('.animate-slide-in');
    expect(toasts.length).toBe(0);
  });
});
