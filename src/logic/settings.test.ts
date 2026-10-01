import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../data/defaultPlan';
import type { Settings } from '../shared/types';
import { defaultRestFor, normalizeSettings, restTypeOf } from './settings';

/** A settings document as saved by the first release (no rest types, vibration or auto-start). */
function v1Settings(): Settings {
  const s = defaultSettings();
  const timer = { defaultRestSec: 120, weightStep: 2.5, autoAdvance: true, sound: false };
  return { ...s, timer: timer as Settings['timer'] };
}

describe('normalizeSettings', () => {
  it('fills new timer fields and seeds compound rest from the old single default', () => {
    const n = normalizeSettings(v1Settings());
    expect(n.timer.restSec).toEqual({ compound: 120, isolation: 60, abs: 60 });
    expect(n.timer.vibration).toBe(false); // followed the old combined sound setting
    expect(n.timer.autoStartRest).toBe(false);
    expect(n.timer.sound).toBe(false);
    expect(n.timer.defaultRestSec).toBe(120);
  });
  it('keeps values that are already set', () => {
    const s = defaultSettings();
    s.timer.restSec = { compound: 150, isolation: 45, abs: 30 };
    s.timer.autoStartRest = true;
    expect(normalizeSettings(s)).toEqual(s);
  });
});

describe('restTypeOf', () => {
  it('prefers the explicit type, then the seeded default, then the muscle group', () => {
    expect(restTypeOf({ id: 'x', muscleGroup: 'back', restType: 'isolation' })).toBe('isolation');
    expect(restTypeOf({ id: 'leg-curl', muscleGroup: 'hamstrings' })).toBe('isolation');
    expect(restTypeOf({ id: 'x', muscleGroup: 'abs' })).toBe('abs');
    expect(restTypeOf({ id: 'x', muscleGroup: 'biceps' })).toBe('isolation');
    expect(restTypeOf({ id: 'x', muscleGroup: 'quads' })).toBe('compound');
  });
  it('maps to the configured rest', () => {
    expect(defaultRestFor({ id: 'x', muscleGroup: 'calves' }, defaultSettings())).toBe(60);
  });
});
