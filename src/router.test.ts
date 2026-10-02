import { describe, expect, it } from 'vitest';
import { parseHash, pathWith } from './router';

describe('parseHash', () => {
  it('parses route, sub-section and params', () => {
    const l = parseHash('#/log/weight?date=2026-09-30&from=today');
    expect(l.route).toBe('log');
    expect(l.sub).toBe('weight');
    expect(l.params.get('date')).toBe('2026-09-30');
    expect(l.params.get('from')).toBe('today');
  });
  it('defaults unknown routes to today and unknown subs to the first one', () => {
    expect(parseHash('').route).toBe('today');
    expect(parseHash('#/nope').route).toBe('today');
    expect(parseHash('#/log').sub).toBe('diet');
    expect(parseHash('#/plan/bogus').sub).toBe('workouts');
    expect(parseHash('#/plan/foods').sub).toBe('foods');
    expect(parseHash('#/settings').sub).toBe('account');
    expect(parseHash('#/workout?review').sub).toBeNull();
  });
});

describe('pathWith', () => {
  it('switches sub-section and keeps params', () => {
    const l = parseHash('#/log/diet?date=2026-09-30&from=today');
    expect(pathWith(l, { sub: 'weight' })).toBe('/log/weight?date=2026-09-30&from=today');
  });
  it('sets and removes params', () => {
    const l = parseHash('#/workout?date=2026-09-30&review');
    expect(pathWith(l, { params: { date: '2026-10-01', review: null } })).toBe('/workout?date=2026-10-01');
  });
});
