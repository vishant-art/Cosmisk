import { LakhCrorePipe } from './lakh-crore.pipe';

describe('LakhCrorePipe', () => {
  let pipe: LakhCrorePipe;

  beforeEach(() => {
    pipe = new LakhCrorePipe();
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  // --- Null / undefined ---

  it('should return empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  // --- Small numbers (below 1K) ---

  it('should return raw value with rupee symbol for 0', () => {
    expect(pipe.transform(0)).toBe('\u20B90');
  });

  it('should return raw value with rupee symbol for small numbers', () => {
    expect(pipe.transform(500)).toBe('\u20B9500');
  });

  it('should return raw value with rupee symbol for 999', () => {
    expect(pipe.transform(999)).toBe('\u20B9999');
  });

  // --- Thousands (1K - 99,999) ---

  it('should format 1000 as K', () => {
    expect(pipe.transform(1000)).toBe('\u20B91.0K');
  });

  it('should format 5500 as K with decimal', () => {
    expect(pipe.transform(5500)).toBe('\u20B95.5K');
  });

  it('should format 99999 as K', () => {
    expect(pipe.transform(99999)).toBe('\u20B9100.0K');
  });

  // --- Lakhs (1L - 99,99,999) ---

  it('should format 100000 as L', () => {
    expect(pipe.transform(100000)).toBe('\u20B91.0L');
  });

  it('should format 250000 as L with decimal', () => {
    expect(pipe.transform(250000)).toBe('\u20B92.5L');
  });

  it('should format 4970000 as L', () => {
    expect(pipe.transform(4970000)).toBe('\u20B949.7L');
  });

  it('should format 9999999 as L', () => {
    expect(pipe.transform(9999999)).toBe('\u20B9100.0L');
  });

  // --- Crores (1Cr+) ---

  it('should format 10000000 (1 crore) as Cr', () => {
    expect(pipe.transform(10000000)).toBe('\u20B91.0Cr');
  });

  it('should format 55000000 as Cr with decimal', () => {
    expect(pipe.transform(55000000)).toBe('\u20B95.5Cr');
  });

  it('should format 1000000000 (100 crore) as Cr', () => {
    expect(pipe.transform(1000000000)).toBe('\u20B9100.0Cr');
  });

  // --- Edge: Boundary values ---

  it('should format exactly at the K boundary (1000)', () => {
    expect(pipe.transform(1000)).toBe('\u20B91.0K');
  });

  it('should format exactly at the L boundary (100000)', () => {
    expect(pipe.transform(100000)).toBe('\u20B91.0L');
  });

  it('should format exactly at the Cr boundary (10000000)', () => {
    expect(pipe.transform(10000000)).toBe('\u20B91.0Cr');
  });

  // --- Negative numbers ---

  it('should handle negative values below 1K', () => {
    expect(pipe.transform(-500)).toBe('\u20B9-500');
  });

  // Negative values won't hit the >= thresholds, so they fall through to raw
  it('should return raw value for negative large numbers', () => {
    expect(pipe.transform(-100000)).toBe('\u20B9-100000');
  });
});
