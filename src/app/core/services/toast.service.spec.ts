import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
    // Mock crypto.randomUUID
    let counter = 0;
    spyOn(crypto, 'randomUUID').and.callFake(() => `uuid-${++counter}` as `${string}-${string}-${string}-${string}-${string}`);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with empty toasts', () => {
    expect(service.activeToasts().length).toBe(0);
  });

  describe('show', () => {
    it('should add a toast with generated id', () => {
      service.show({ type: 'success', title: 'Done' });
      expect(service.activeToasts().length).toBe(1);
      expect(service.activeToasts()[0].type).toBe('success');
      expect(service.activeToasts()[0].title).toBe('Done');
      expect(service.activeToasts()[0].id).toBeTruthy();
    });

    it('should keep only last 3 toasts', () => {
      service.show({ type: 'info', title: 'A' });
      service.show({ type: 'info', title: 'B' });
      service.show({ type: 'info', title: 'C' });
      service.show({ type: 'info', title: 'D' });
      expect(service.activeToasts().length).toBe(3);
      expect(service.activeToasts()[0].title).toBe('B');
      expect(service.activeToasts()[2].title).toBe('D');
    });

    it('should auto-dismiss after default duration', fakeAsync(() => {
      service.show({ type: 'success', title: 'Auto dismiss' });
      expect(service.activeToasts().length).toBe(1);
      tick(5000);
      expect(service.activeToasts().length).toBe(0);
    }));

    it('should auto-dismiss after custom duration', fakeAsync(() => {
      service.show({ type: 'warning', title: 'Quick', duration: 1000 });
      expect(service.activeToasts().length).toBe(1);
      tick(1000);
      expect(service.activeToasts().length).toBe(0);
    }));
  });

  describe('success', () => {
    it('should create a success toast', () => {
      service.success('Saved', 'Your changes were saved');
      expect(service.activeToasts()[0].type).toBe('success');
      expect(service.activeToasts()[0].title).toBe('Saved');
      expect(service.activeToasts()[0].message).toBe('Your changes were saved');
    });
  });

  describe('error', () => {
    it('should create an error toast', () => {
      service.error('Failed', 'Something went wrong');
      expect(service.activeToasts()[0].type).toBe('error');
      expect(service.activeToasts()[0].title).toBe('Failed');
    });
  });

  describe('warning', () => {
    it('should create a warning toast', () => {
      service.warning('Watch out');
      expect(service.activeToasts()[0].type).toBe('warning');
    });
  });

  describe('info', () => {
    it('should create an info toast', () => {
      service.info('FYI', 'Details here');
      expect(service.activeToasts()[0].type).toBe('info');
    });
  });

  describe('dismiss', () => {
    it('should remove the toast by id', () => {
      service.show({ type: 'info', title: 'A' });
      service.show({ type: 'info', title: 'B' });
      const idToRemove = service.activeToasts()[0].id;
      service.dismiss(idToRemove);
      expect(service.activeToasts().length).toBe(1);
      expect(service.activeToasts()[0].title).toBe('B');
    });

    it('should handle dismissing non-existent id', () => {
      service.show({ type: 'info', title: 'A' });
      service.dismiss('nonexistent');
      expect(service.activeToasts().length).toBe(1);
    });
  });
});
