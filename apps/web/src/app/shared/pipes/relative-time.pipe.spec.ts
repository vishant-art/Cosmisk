import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  let pipe: RelativeTimePipe;

  beforeEach(() => {
    pipe = new RelativeTimePipe();
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  // --- Null / undefined / empty ---

  it('should return empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(pipe.transform('')).toBe('');
  });

  // --- Just now (< 1 minute) ---

  it('should return "just now" for a date less than 1 minute ago', () => {
    const now = new Date();
    expect(pipe.transform(now.toISOString())).toBe('just now');
  });

  it('should return "just now" for a date 30 seconds ago', () => {
    const date = new Date(Date.now() - 30 * 1000);
    expect(pipe.transform(date.toISOString())).toBe('just now');
  });

  // --- Minutes ago ---

  it('should return "1 minute ago" for singular', () => {
    const date = new Date(Date.now() - 1 * 60 * 1000);
    expect(pipe.transform(date.toISOString())).toBe('1 minute ago');
  });

  it('should return "5 minutes ago" for plural', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(pipe.transform(date.toISOString())).toBe('5 minutes ago');
  });

  it('should return "59 minutes ago" at the boundary', () => {
    const date = new Date(Date.now() - 59 * 60 * 1000);
    expect(pipe.transform(date.toISOString())).toBe('59 minutes ago');
  });

  // --- Hours ago ---

  it('should return "1 hour ago" for singular', () => {
    const date = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(pipe.transform(date.toISOString())).toBe('1 hour ago');
  });

  it('should return "5 hours ago" for plural', () => {
    const date = new Date(Date.now() - 5 * 60 * 60 * 1000);
    expect(pipe.transform(date.toISOString())).toBe('5 hours ago');
  });

  it('should return "23 hours ago" at the boundary', () => {
    const date = new Date(Date.now() - 23 * 60 * 60 * 1000);
    expect(pipe.transform(date.toISOString())).toBe('23 hours ago');
  });

  // --- Days ago ---

  it('should return "1 day ago" for singular', () => {
    const date = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    expect(pipe.transform(date.toISOString())).toBe('1 day ago');
  });

  it('should return "3 days ago" for plural', () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(pipe.transform(date.toISOString())).toBe('3 days ago');
  });

  it('should return "6 days ago" at the boundary', () => {
    const date = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    expect(pipe.transform(date.toISOString())).toBe('6 days ago');
  });

  // --- Older dates (>= 7 days) ---

  it('should return a formatted date for 7+ days ago', () => {
    const date = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const result = pipe.transform(date.toISOString());
    // Should be a locale date string like "21 Mar 2026"
    expect(result).not.toContain('ago');
    expect(result).not.toBe('');
    // Should contain a year
    expect(result).toMatch(/\d{4}/);
  });

  it('should return a formatted date for very old dates', () => {
    const result = pipe.transform('2020-01-01T00:00:00Z');
    expect(result).toContain('2020');
    expect(result).not.toContain('ago');
  });
});
