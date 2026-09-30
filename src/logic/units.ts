import type { DayEntry, Settings, Step, Units, WorkoutSession } from '../shared/types';

const LB_PER_KG = 2.20462262;

export const DEFAULT_WEIGHT_STEP: Record<Units, number> = { lb: 2.5, kg: 1 };

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function convertWeight(value: number, from: Units, to: Units): number {
  if (from === to) return value;
  return round1(from === 'lb' ? value / LB_PER_KG : value * LB_PER_KG);
}

function convertSteps(steps: Step[], from: Units, to: Units): Step[] {
  return steps.map((s) =>
    s.kind === 'exercise' && s.result
      ? { ...s, result: { ...s.result, weight: convertWeight(s.result.weight, from, to) } }
      : s,
  );
}

/** One-time conversion of every stored weight (sets, bodyweight, gain band, weight step). */
export function convertAllData(
  settings: Settings,
  days: DayEntry[],
  sessions: WorkoutSession[],
  to: Units,
): { settings: Settings; days: DayEntry[]; sessions: WorkoutSession[] } {
  const from = settings.units;
  const c = (v: number) => convertWeight(v, from, to);
  // The gain band is small (e.g. 0.25 lb/week), so convert it with 2 decimals instead of 1.
  const band = (v: number) =>
    from === to ? v : Math.round((from === 'lb' ? v / LB_PER_KG : v * LB_PER_KG) * 100) / 100;
  return {
    settings: {
      ...settings,
      units: to,
      adjustment: {
        ...settings.adjustment,
        gainMinPerWeek: band(settings.adjustment.gainMinPerWeek),
        gainMaxPerWeek: band(settings.adjustment.gainMaxPerWeek),
      },
      timer: { ...settings.timer, weightStep: DEFAULT_WEIGHT_STEP[to] },
    },
    days: days.map((d) => (d.weight === null ? d : { ...d, weight: c(d.weight) })),
    sessions: sessions.map((s) => ({ ...s, steps: convertSteps(s.steps, from, to) })),
  };
}
