import { Injectable, signal, computed } from '@angular/core';

export type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'this_month' | 'last_month';

const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7d: 'Last 7 Days',
  last_14d: 'Last 14 Days',
  last_30d: 'Last 30 Days',
  this_month: 'This Month',
  last_month: 'Last Month',
};

@Injectable({ providedIn: 'root' })
export class DateRangeService {
  /** Current date preset value used in API calls */
  datePreset = signal<DatePreset>('last_7d');

  /** Human-readable label for the topbar button */
  displayLabel = computed(() => PRESET_LABELS[this.datePreset()] ?? 'Last 7 Days');

  setPreset(preset: DatePreset) {
    this.datePreset.set(preset);
  }
}
