import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'lakhCrore', standalone: true })
export class LakhCrorePipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return '';
    if (value >= 10000000) {
      return `₹${(value / 10000000).toFixed(1)}Cr`;
    }
    if (value >= 100000) {
      return `₹${(value / 100000).toFixed(1)}L`;
    }
    if (value >= 1000) {
      return `₹${(value / 1000).toFixed(1)}K`;
    }
    return `₹${value}`;
  }
}
