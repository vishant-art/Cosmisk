/* ------------------------------------------------------------------ */
/*  Shared currency & number formatting helpers                        */
/* ------------------------------------------------------------------ */

/** Currency symbol lookup */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', INR: '₹', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', JPY: '¥', CNY: '¥',
  AED: 'AED ', SGD: 'S$', MYR: 'RM', BRL: 'R$', ZAR: 'R', KRW: '₩', THB: '฿',
};

export const CURRENCY_LOCALES: Record<string, string> = {
  INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', JPY: 'ja-JP',
};

let _currency = 'USD';

export function setCurrency(c: string) { _currency = c || 'USD'; }
export function getCurrency(): string { return _currency; }

export function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function fmt(value: number): string {
  const sym = CURRENCY_SYMBOLS[_currency] || _currency + ' ';
  const locale = CURRENCY_LOCALES[_currency] || 'en-US';
  return `${sym}${round(value, 2).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNum(value: number): string {
  const locale = CURRENCY_LOCALES[_currency] || 'en-US';
  return round(value, 2).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtInt(value: number): string {
  const locale = CURRENCY_LOCALES[_currency] || 'en-US';
  return value.toLocaleString(locale);
}

export function avgVal(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}
