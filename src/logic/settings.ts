// Backward-compatible reading of the settings document. New fields are filled with defaults
// when they're missing, so older documents (and backups) load without a migration write.

import { DEFAULT_EXERCISES, defaultSettings } from '../data/defaultPlan';
import type { Exercise, MuscleGroup, RestType, Settings } from '../shared/types';

const DEFAULT_REST_TYPE = new Map(DEFAULT_EXERCISES.map((e) => [e.id, e.restType]));
const ISOLATION_GROUPS: MuscleGroup[] = ['biceps', 'triceps', 'calves'];

/** The exercise's rest type: set explicitly, else the seeded default for that id, else inferred. */
export function restTypeOf(ex: Pick<Exercise, 'id' | 'muscleGroup' | 'restType'>): RestType {
  if (ex.restType) return ex.restType;
  const seeded = DEFAULT_REST_TYPE.get(ex.id);
  if (seeded) return seeded;
  if (ex.muscleGroup === 'abs') return 'abs';
  return ISOLATION_GROUPS.includes(ex.muscleGroup) ? 'isolation' : 'compound';
}

export function defaultRestFor(ex: Pick<Exercise, 'id' | 'muscleGroup' | 'restType'>, s: Settings): number {
  return s.timer.restSec[restTypeOf(ex)];
}

/** Fill in fields added after the first release. Never drops or rewrites existing values. */
export function normalizeSettings(raw: Settings): Settings {
  const d = defaultSettings();
  const t: Partial<Settings['timer']> = raw.timer ?? {};
  const legacyRest = t.defaultRestSec ?? d.timer.defaultRestSec;
  return {
    ...d,
    ...raw,
    timer: {
      ...d.timer,
      ...t,
      restSec: t.restSec ?? { ...d.timer.restSec, compound: legacyRest },
      vibration: t.vibration ?? t.sound ?? d.timer.vibration,
    },
  };
}
