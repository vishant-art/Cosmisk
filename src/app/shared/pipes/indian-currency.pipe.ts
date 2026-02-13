import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'indianCurrency', standalone: true })
export class IndianCurrencyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return '';
    const formatted = value.toLocaleString('en-IN');
    return `₹${formatted}`;
  }
}
