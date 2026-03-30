import { TestBed } from '@angular/core/testing';
import { DateRangeService, DatePreset } from './date-range.service';

describe('DateRangeService', () => {
  let service: DateRangeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DateRangeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should default to last_7d', () => {
    expect(service.datePreset()).toBe('last_7d');
  });

  it('should have default display label as Last 7 Days', () => {
    expect(service.displayLabel()).toBe('Last 7 Days');
  });

  describe('setPreset', () => {
    it('should update datePreset', () => {
      service.setPreset('today');
      expect(service.datePreset()).toBe('today');
    });

    it('should update displayLabel for today', () => {
      service.setPreset('today');
      expect(service.displayLabel()).toBe('Today');
    });

    it('should update displayLabel for yesterday', () => {
      service.setPreset('yesterday');
      expect(service.displayLabel()).toBe('Yesterday');
    });

    it('should update displayLabel for last_14d', () => {
      service.setPreset('last_14d');
      expect(service.displayLabel()).toBe('Last 14 Days');
    });

    it('should update displayLabel for last_30d', () => {
      service.setPreset('last_30d');
      expect(service.displayLabel()).toBe('Last 30 Days');
    });

    it('should update displayLabel for this_month', () => {
      service.setPreset('this_month');
      expect(service.displayLabel()).toBe('This Month');
    });

    it('should update displayLabel for last_month', () => {
      service.setPreset('last_month');
      expect(service.displayLabel()).toBe('Last Month');
    });
  });
});
