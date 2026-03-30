import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  let pipe: RelativeTimePipe;

  beforeEach(() => {
    pipe = new RelativeTimePipe();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should return "just now" for a date less than a minute ago', () => {
    const now = new Date();
    expect(pipe.transform(now.toISOString())).toBe('just now');
  });

  it('should return "1 minute ago" for a date 1 minute ago', () => {
    const date = new Date(Date.now() - 60000);
    expect(pipe.transform(date.toISOString())).toBe('1 minute ago');
  });

  it('should return "5 minutes ago" for a date 5 minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60000);
    expect(pipe.transform(date.toISOString())).toBe('5 minutes ago');
  });

  it('should return "1 hour ago" for a date 1 hour ago', () => {
    const date = new Date(Date.now() - 3600000);
    expect(pipe.transform(date.toISOString())).toBe('1 hour ago');
  });

  it('should return "2 hours ago" for a date 2 hours ago', () => {
    const date = new Date(Date.now() - 2 * 3600000);
    expect(pipe.transform(date.toISOString())).toBe('2 hours ago');
  });

  it('should return "1 day ago" for a date 1 day ago', () => {
    const date = new Date(Date.now() - 86400000);
    expect(pipe.transform(date.toISOString())).toBe('1 day ago');
  });

  it('should return "3 days ago" for a date 3 days ago', () => {
    const date = new Date(Date.now() - 3 * 86400000);
    expect(pipe.transform(date.toISOString())).toBe('3 days ago');
  });

  it('should return a formatted date string for dates older than a week', () => {
    const date = new Date(Date.now() - 10 * 86400000);
    const result = pipe.transform(date.toISOString());
    // Should be a locale date string like "20 Mar 2026"
    expect(result).not.toContain('ago');
    expect(result).not.toBe('');
  });

  it('should return empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(pipe.transform('')).toBe('');
  });
});
