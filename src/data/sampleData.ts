// "Load sample data": ~8 weeks of realistic fake data so the dashboard has something to show.
// Everything generated is tagged `sample: true` so it can be removed again, and dates that
// already hold real data are skipped (never overwritten).

import { addDays, weekdayOf } from '../logic/dates';
import { carbsFromRemaining } from '../logic/analytics';
import { convertWeight } from '../logic/units';
import { createSession } from '../logic/workoutPlayer';
import type { DayEntry, ISODate, Settings, WorkoutSession } from '../shared/types';

/** Starting working weights in lb (assisted = assistance). Unknown exercises start at 50. */
const START_LB: Record<string, number> = {
  'lat-pulldown': 100, 'machine-row': 90, 'db-bench': 50, 'db-shoulder-press': 35, 'db-curl': 20,
  'triceps-pushdown': 40, 'leg-press': 180, rdl: 115, 'leg-curl': 70, 'calf-raise': 120, abs: 0,
  'assisted-pullup': 70, 'cable-row': 90, 'chest-press': 100, 'lateral-raise': 15, 'hammer-curl': 22.5,
  squat: 135, 'leg-extension': 80,
};
/** These stay stuck, so the stall detection has something to find. */
const STALLERS = new Set(['lateral-raise', 'db-shoulder-press']);

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSampleData(
  settings: Settings,
  today: ISODate,
  realDayDates: Set<ISODate>,
  realSessionDates: Set<ISODate>,
): { days: DayEntry[]; sessions: WorkoutSession[] } {
  const rand = mulberry32(42);
  const noise = (amp: number) => (rand() * 2 - 1) * amp;
  const u = settings.units;
  const w = (lb: number) => convertWeight(lb, 'lb', u);
  const step = settings.timer.weightStep;
  const { nutrition, plan } = settings;

  const days: DayEntry[] = [];
  const sessions: WorkoutSession[] = [];
  const state = new Map<string, { weight: number; reps: number }>();
  const start = addDays(today, -56);

  for (let i = 0; i < 56; i++) {
    const date = addDays(start, i);
    const week = i / 7;

    if (!realDayDates.has(date)) {
      const weighed = rand() > 0.15;
      const ate = rand() > 0.1;
      const kcal = ate ? Math.round(nutrition.kcalTarget + noise(180) - (week < 3 ? 120 : 0)) : null;
      const protein = ate ? Math.round((nutrition.proteinMin + nutrition.proteinMax) / 2 + noise(18)) : null;
      const fat = ate ? Math.round((nutrition.fatMin + nutrition.fatMax) / 2 + noise(10)) : null;
      days.push({
        date,
        weight: weighed ? w(168 + week * 0.35 + noise(0.8)) : null,
        kcal,
        protein,
        fat,
        carbs: kcal !== null && protein !== null && fat !== null ? carbsFromRemaining(kcal, protein, fat) : null,
        carbsManual: false,
        updatedAt: Date.now(),
        sample: true,
      });
    }

    const workoutId = plan.split[weekdayOf(date)];
    const template = plan.workouts.find((x) => x.id === workoutId);
    if (!template || realSessionDates.has(date) || rand() < 0.1) continue;

    const startedAt = new Date(`${date}T18:00:00`).getTime();
    const s = createSession(template, plan, date, startedAt, `sample-${date}`);
    const bumped = new Set<string>();
    s.steps = s.steps.map((st) => {
      if (st.kind !== 'exercise') return st;
      const t = st.target;
      const min = t.kind === 'range' ? t.min : t.kind === 'reps' ? t.reps : 8;
      const max = t.kind === 'range' ? t.max : t.kind === 'reps' ? t.reps : (t.ceiling ?? 12);
      const cur = state.get(st.exerciseId) ?? { weight: w(START_LB[st.exerciseId] ?? 50), reps: min };
      const stuck = STALLERS.has(st.exerciseId) && week > 3;
      const reps = Math.max(1, Math.min(max, cur.reps - (st.round > 1 && rand() < 0.4 ? 1 : 0)));
      if (!bumped.has(st.exerciseId) && st.round === st.rounds) {
        // End of this exercise for the session: progress for next time.
        bumped.add(st.exerciseId);
        let next = { ...cur, reps: stuck ? cur.reps : Math.min(max, cur.reps + (rand() < 0.7 ? 1 : 0)) };
        if (!stuck && cur.reps >= max) {
          next = { weight: st.assisted ? Math.max(0, cur.weight - step) : cur.weight + step, reps: min };
        }
        state.set(st.exerciseId, next);
      } else if (!state.has(st.exerciseId)) {
        state.set(st.exerciseId, cur);
      }
      return { ...st, status: 'logged' as const, result: { weight: cur.weight, reps, rpe: null } };
    });
    sessions.push({
      ...s,
      status: 'completed',
      currentIndex: s.steps.length,
      endedAt: startedAt + 55 * 60_000,
      sample: true,
    });
  }
  return { days, sessions };
}
