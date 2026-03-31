import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ToastService],
    });
    service = TestBed.inject(ToastService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with no toasts', () => {
    expect(service.activeToasts().length).toBe(0);
  });

  describe('show()', () => {
    it('should add a toast with generated ID', () => {
      service.show({ type: 'info', title: 'Hello' });
      expect(service.activeToasts().length).toBe(1);
      expect(service.activeToasts()[0].type).toBe('info');
      expect(service.activeToasts()[0].title).toBe('Hello');
      expect(service.activeToasts()[0].id).toBeTruthy();
    });

    it('should limit to 3 toasts max', () => {
      service.show({ type: 'info', title: 'Toast 1' });
      service.show({ type: 'info', title: 'Toast 2' });
      service.show({ type: 'info', title: 'Toast 3' });
      service.show({ type: 'info', title: 'Toast 4' });

      expect(service.activeToasts().length).toBe(3);
      expect(service.activeToasts()[0].title).toBe('Toast 2');
      expect(service.activeToasts()[2].title).toBe('Toast 4');
    });

    it('should auto-dismiss after default 5000ms', fakeAsync(() => {
      service.show({ type: 'info', title: 'Auto dismiss' });
      expect(service.activeToasts().length).toBe(1);

      tick(5000);
      expect(service.activeToasts().length).toBe(0);
    }));

    it('should auto-dismiss after custom duration', fakeAsync(() => {
      service.show({ type: 'info', title: 'Custom', duration: 2000 });
      expect(service.activeToasts().length).toBe(1);

      tick(2000);
      expect(service.activeToasts().length).toBe(0);
    }));
  });

  describe('convenience methods', () => {
    it('success() should create a success toast', () => {
      service.success('Done', 'It worked');
      const toast = service.activeToasts()[0];
      expect(toast.type).toBe('success');
      expect(toast.title).toBe('Done');
      expect(toast.message).toBe('It worked');
    });

    it('error() should create an error toast', () => {
      service.error('Failed');
      expect(service.activeToasts()[0].type).toBe('error');
    });

    it('warning() should create a warning toast', () => {
      service.warning('Watch out');
      expect(service.activeToasts()[0].type).toBe('warning');
    });

    it('info() should create an info toast', () => {
      service.info('FYI');
      expect(service.activeToasts()[0].type).toBe('info');
    });

    it('should work without message parameter', () => {
      service.success('Title only');
      expect(service.activeToasts()[0].message).toBeUndefined();
    });
  });

  describe('dismiss()', () => {
    it('should remove a specific toast by ID', () => {
      service.show({ type: 'info', title: 'A' });
      service.show({ type: 'info', title: 'B' });
      const idToRemove = service.activeToasts()[0].id;

      service.dismiss(idToRemove);

      expect(service.activeToasts().length).toBe(1);
      expect(service.activeToasts()[0].title).toBe('B');
    });

    it('should do nothing for unknown ID', () => {
      service.show({ type: 'info', title: 'A' });
      service.dismiss('nonexistent');
      expect(service.activeToasts().length).toBe(1);
    });
  });
});
