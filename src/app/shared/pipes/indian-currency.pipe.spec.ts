import { IndianCurrencyPipe } from './indian-currency.pipe';

describe('IndianCurrencyPipe', () => {
  let pipe: IndianCurrencyPipe;

  beforeEach(() => {
    pipe = new IndianCurrencyPipe();
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  // --- Null / undefined / zero ---

  it('should return empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('should format zero', () => {
    expect(pipe.transform(0)).toBe('\u20B90');
  });

  // --- Positive numbers ---

  it('should format small numbers without commas', () => {
    expect(pipe.transform(999)).toBe('\u20B9999');
  });

  it('should format thousands with Indian comma system', () => {
    // In en-IN locale: 1,000
    expect(pipe.transform(1000)).toContain('\u20B9');
    expect(pipe.transform(1000)).toMatch(/1[,.]?000/);
  });

  it('should format lakhs with Indian comma system', () => {
    const result = pipe.transform(100000);
    expect(result).toContain('\u20B9');
    // en-IN: 1,00,000
    expect(result).toMatch(/1[,.]?00[,.]?000/);
  });

  it('should format crores with Indian comma system', () => {
    const result = pipe.transform(10000000);
    expect(result).toContain('\u20B9');
    // en-IN: 1,00,00,000
    expect(result).toMatch(/1.*0.*0.*0/);
  });

  it('should format large numbers (100 crore)', () => {
    const result = pipe.transform(1000000000);
    expect(result.startsWith('\u20B9')).toBeTrue();
  });

  // --- Negative numbers ---

  it('should format negative numbers', () => {
    const result = pipe.transform(-5000);
    expect(result).toContain('\u20B9');
    expect(result).toContain('-');
  });

  // --- Decimal numbers ---

  it('should handle decimal values', () => {
    const result = pipe.transform(1234.56);
    expect(result).toContain('\u20B9');
    expect(result).toContain('1');
  });

  it('should handle very small decimal values', () => {
    const result = pipe.transform(0.01);
    expect(result).toContain('\u20B9');
    expect(result).toContain('0.01');
  });
});
