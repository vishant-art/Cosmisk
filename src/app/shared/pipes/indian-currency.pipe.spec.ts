import { IndianCurrencyPipe } from './indian-currency.pipe';

describe('IndianCurrencyPipe', () => {
  let pipe: IndianCurrencyPipe;

  beforeEach(() => {
    pipe = new IndianCurrencyPipe();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should format numbers with Indian comma system', () => {
    expect(pipe.transform(100000)).toBe('₹1,00,000');
  });

  it('should format large numbers correctly', () => {
    expect(pipe.transform(10000000)).toBe('₹1,00,00,000');
  });

  it('should handle small numbers without commas', () => {
    expect(pipe.transform(999)).toBe('₹999');
  });

  it('should handle 0', () => {
    expect(pipe.transform(0)).toBe('₹0');
  });

  it('should return empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('should handle negative numbers', () => {
    const result = pipe.transform(-100000);
    expect(result).toBe('₹-1,00,000');
  });

  it('should handle decimal numbers', () => {
    const result = pipe.transform(1234.56);
    expect(result).toContain('₹');
    expect(result).toContain('1,234.56');
  });

  it('should handle 1', () => {
    expect(pipe.transform(1)).toBe('₹1');
  });
});
