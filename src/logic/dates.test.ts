import { describe, expect, it } from 'vitest';
import { isISODate, parseISODate, relativeDayLabel } from './dates';

describe('relativeDayLabel', () => {
  const today = '2026-09-30';
  it('names today, yesterday and tomorrow', () => {
    expect(relativeDayLabel('2026-09-30', today)).toBe('Today');
    expect(relativeDayLabel('2026-09-29', today)).toBe('Yesterday');
    expect(relativeDayLabel('2026-10-01', today)).toBe('Tomorrow');
  });
  it('uses a short weekday and date otherwise, across month boundaries', () => {
    const expected = parseISODate('2026-10-05').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    expect(relativeDayLabel('2026-10-05', today)).toBe(expected);
    expect(relativeDayLabel('2026-09-28', today)).not.toBe('Yesterday');
  });
});

describe('isISODate', () => {
  it('accepts YYYY-MM-DD only', () => {
    expect(isISODate('2026-09-30')).toBe(true);
    expect(isISODate('2026-9-30')).toBe(false);
    expect(isISODate('today')).toBe(false);
    expect(isISODate(null)).toBe(false);
  });
});
