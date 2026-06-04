import { TestBed } from '@angular/core/testing';
import { DateRangeService, DatePreset } from './date-range.service';

describe('DateRangeService', () => {
  let service: DateRangeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DateRangeService],
    });
    service = TestBed.inject(DateRangeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should default to last_7d preset', () => {
    expect(service.datePreset()).toBe('last_7d');
  });

  it('should display "Last 7 Days" as default label', () => {
    expect(service.displayLabel()).toBe('Last 7 Days');
  });

  describe('setPreset()', () => {
    const presets: { preset: DatePreset; label: string }[] = [
      { preset: 'today', label: 'Today' },
      { preset: 'yesterday', label: 'Yesterday' },
      { preset: 'last_7d', label: 'Last 7 Days' },
      { preset: 'last_14d', label: 'Last 14 Days' },
      { preset: 'last_30d', label: 'Last 30 Days' },
      { preset: 'this_month', label: 'This Month' },
      { preset: 'last_month', label: 'Last Month' },
    ];

    presets.forEach(({ preset, label }) => {
      it(`should set preset to "${preset}" and display "${label}"`, () => {
        service.setPreset(preset);
        expect(service.datePreset()).toBe(preset);
        expect(service.displayLabel()).toBe(label);
      });
    });
  });

  it('should update displayLabel reactively when preset changes', () => {
    expect(service.displayLabel()).toBe('Last 7 Days');
    service.setPreset('today');
    expect(service.displayLabel()).toBe('Today');
    service.setPreset('last_30d');
    expect(service.displayLabel()).toBe('Last 30 Days');
  });
});
