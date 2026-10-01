// All analytics are computed on the device from data already in memory.
// Only LOGGED sets are used: pending and log-later steps are never counted (not even as zeros).

import type {
  AdjustmentRule,
  DayEntry,
  ExerciseStep,
  ISODate,
  MuscleGroup,
  NutritionTargets,
  SetResult,
  Split,
  Units,
  WorkoutSession,
} from '../shared/types';
import { addDays, daysBetween, weekStart } from './dates';
import { round1 } from './units';

// ---------------------------------------------------------------------------------------------
// Sets

export interface LoggedSet {
  sessionId: string;
  date: ISODate;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  assisted: boolean;
  weight: number;
  reps: number;
}

export function loggedSets(sessions: WorkoutSession[]): LoggedSet[] {
  const out: LoggedSet[] = [];
  for (const s of sessions) {
    for (const st of s.steps) {
      if (st.kind !== 'exercise' || st.status !== 'logged' || !st.result) continue;
      out.push(toLogged(s, st, st.result));
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function toLogged(s: WorkoutSession, st: ExerciseStep, r: SetResult): LoggedSet {
  return {
    sessionId: s.id,
    date: s.date,
    exerciseId: st.exerciseId,
    exerciseName: st.exerciseName,
    muscleGroup: st.muscleGroup,
    assisted: st.assisted,
    weight: r.weight,
    reps: r.reps,
  };
}

/** Epley estimated one-rep max. */
export function e1rm(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// ---------------------------------------------------------------------------------------------
// Per-exercise history

export interface ExercisePoint {
  date: ISODate;
  sessionId: string;
  /** Heaviest weight (assisted: least assistance). */
  topWeight: number;
  /** Best reps at the top weight. */
  topReps: number;
  /** Best estimated 1RM in the session (null for assisted exercises). */
  e1rm: number | null;
}

export function exerciseHistory(sets: LoggedSet[], exerciseId: string): ExercisePoint[] {
  const bySession = new Map<string, LoggedSet[]>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId) continue;
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }
  const points: ExercisePoint[] = [];
  for (const [sessionId, list] of bySession) {
    const assisted = list[0].assisted;
    const topWeight = assisted ? Math.min(...list.map((s) => s.weight)) : Math.max(...list.map((s) => s.weight));
    const topReps = Math.max(...list.filter((s) => s.weight === topWeight).map((s) => s.reps));
    points.push({
      date: list[0].date,
      sessionId,
      topWeight,
      topReps,
      e1rm: assisted ? null : round1(Math.max(...list.map((s) => e1rm(s.weight, s.reps)))),
    });
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Indices of sessions that beat everything before them (weight, reps at that weight, or e1RM). */
function prIndices(points: ExercisePoint[], assisted: boolean): number[] {
  const prs: number[] = [];
  let bestE1rm = -Infinity;
  const bestRepsAt = new Map<number, number>();
  let bestWeight = assisted ? Infinity : -Infinity;
  points.forEach((p, i) => {
    let improved = false;
    if (i > 0) {
      const heavier = assisted ? p.topWeight < bestWeight : p.topWeight > bestWeight;
      // More reps at this weight (or at an easier-to-beat one for assisted: same or less assistance).
      let prevReps = -Infinity;
      for (const [w, r] of bestRepsAt) {
        if (assisted ? w <= p.topWeight : w >= p.topWeight) prevReps = Math.max(prevReps, r);
      }
      const moreReps = p.topReps > prevReps;
      const higherE1rm = p.e1rm !== null && p.e1rm > bestE1rm;
      improved = heavier || moreReps || higherE1rm;
    }
    if (improved) prs.push(i);
    if (p.e1rm !== null) bestE1rm = Math.max(bestE1rm, p.e1rm);
    bestWeight = assisted ? Math.min(bestWeight, p.topWeight) : Math.max(bestWeight, p.topWeight);
    bestRepsAt.set(p.topWeight, Math.max(bestRepsAt.get(p.topWeight) ?? -Infinity, p.topReps));
  });
  return prs;
}

export interface ExerciseStatus {
  stalled: boolean;
  progressed: boolean;
  sessionsSinceImprovement: number;
}

/**
 * Stalled: no increase in weight, reps or e1RM for 3+ sessions.
 * Progressed: improved at least once in the last 4 weeks, compared with earlier sessions.
 */
export function exerciseStatus(points: ExercisePoint[], assisted: boolean, today: ISODate): ExerciseStatus {
  const prs = prIndices(points, assisted);
  const lastPr = prs.length ? prs[prs.length - 1] : 0;
  const sessionsSinceImprovement = points.length ? points.length - 1 - lastPr : 0;
  const windowStart = addDays(today, -28);
  return {
    stalled: points.length >= 4 && sessionsSinceImprovement >= 3,
    progressed: prs.some((i) => points[i].date >= windowStart),
    sessionsSinceImprovement,
  };
}

// ---------------------------------------------------------------------------------------------
// Volume

export interface WeekVolume {
  week: ISODate;
  /** Σ weight × reps over logged sets (assisted sets excluded: their weight is assistance). */
  total: number;
  byGroup: Partial<Record<MuscleGroup, number>>;
  setsByGroup: Partial<Record<MuscleGroup, number>>;
}

export function weeklyVolume(sets: LoggedSet[]): WeekVolume[] {
  const weeks = new Map<ISODate, WeekVolume>();
  for (const s of sets) {
    const week = weekStart(s.date);
    const w = weeks.get(week) ?? { week, total: 0, byGroup: {}, setsByGroup: {} };
    const load = s.assisted ? 0 : s.weight * s.reps;
    w.total += load;
    w.byGroup[s.muscleGroup] = (w.byGroup[s.muscleGroup] ?? 0) + load;
    w.setsByGroup[s.muscleGroup] = (w.setsByGroup[s.muscleGroup] ?? 0) + 1;
    weeks.set(week, w);
  }
  return [...weeks.values()].sort((a, b) => (a.week < b.week ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------
// Bodyweight

export interface WeightPoint {
  date: ISODate;
  weight: number;
  /** Average of weigh-ins in the 7 days ending on this date. */
  avg: number;
}

export function rollingAverage(days: DayEntry[], window = 7): WeightPoint[] {
  const weighed = days
    .filter((d): d is DayEntry & { weight: number } => d.weight !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return weighed.map((d) => {
    const from = addDays(d.date, -(window - 1));
    const inWindow = weighed.filter((x) => x.date >= from && x.date <= d.date);
    const avg = inWindow.reduce((sum, x) => sum + x.weight, 0) / inWindow.length;
    return { date: d.date, weight: d.weight, avg: round1(avg) };
  });
}

export interface WeekAverage {
  week: ISODate;
  avg: number;
  n: number;
}

export function weeklyBodyweight(days: DayEntry[]): WeekAverage[] {
  const map = new Map<ISODate, number[]>();
  for (const d of days) {
    if (d.weight === null) continue;
    const w = weekStart(d.date);
    map.set(w, [...(map.get(w) ?? []), d.weight]);
  }
  return [...map.entries()]
    .map(([week, ws]) => ({ week, avg: ws.reduce((a, b) => a + b, 0) / ws.length, n: ws.length }))
    .sort((a, b) => (a.week < b.week ? -1 : 1));
}

/** Least-squares slope, in y-units per x-unit. */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Weekly rate of change of the weekly-average bodyweight (units/week), fitted over the last
 * `maxWeeks` weeks that have at least 2 weigh-ins. null if fewer than 2 such weeks.
 */
export function weeklyRate(weekly: WeekAverage[], maxWeeks = 4): { rate: number; weeks: number } | null {
  const usable = weekly.filter((w) => w.n >= 2).slice(-maxWeeks);
  if (usable.length < 2) return null;
  const xs = usable.map((w) => daysBetween(usable[0].week, w.week) / 7);
  return { rate: Math.round(slope(xs, usable.map((w) => w.avg)) * 100) / 100, weeks: usable.length };
}

export type AdviceKind = 'increase' | 'keep' | 'decrease' | 'insufficient';

export interface CalorieAdvice {
  kind: AdviceKind;
  text: string;
}

/** The calorie adjustment rule. Needs 3+ weeks of weigh-ins before suggesting a change. */
export function calorieSuggestion(
  rate: { rate: number; weeks: number } | null,
  rule: AdjustmentRule,
  units: Units,
): CalorieAdvice {
  if (!rate || rate.weeks < 3) {
    return { kind: 'insufficient', text: 'Log morning weight on most days for 3+ weeks to get a calorie suggestion.' };
  }
  const r = `${rate.rate >= 0 ? '+' : ''}${rate.rate.toFixed(2)} ${units}/week`;
  const band = `${rule.gainMinPerWeek}–${rule.gainMaxPerWeek} ${units}/week`;
  const step = `${rule.kcalStepMin}–${rule.kcalStepMax} kcal`;
  if (rate.rate < rule.gainMinPerWeek) {
    return { kind: 'increase', text: `Gaining ${r}, below the ${band} target. Consider adding ${step} a day.` };
  }
  if (rate.rate > rule.gainMaxPerWeek) {
    return { kind: 'decrease', text: `Gaining ${r}, faster than the ${band} target. Consider cutting ${step} a day.` };
  }
  return { kind: 'keep', text: `Gaining ${r}, within the ${band} target. Keep calories the same.` };
}

// ---------------------------------------------------------------------------------------------
// Nutrition

export type Status = 'good' | 'close' | 'off' | 'none';

export function rangeStatus(value: number | null, min: number, max: number, tolerance = 0.05): Status {
  if (value === null) return 'none';
  if (value >= min && value <= max) return 'good';
  if (value >= min * (1 - tolerance) && value <= max * (1 + tolerance)) return 'close';
  return 'off';
}

export function minStatus(value: number | null, min: number, tolerance = 0.1): Status {
  if (value === null) return 'none';
  if (value >= min) return 'good';
  if (value >= min * (1 - tolerance)) return 'close';
  return 'off';
}

/** Carbs that fill the remaining calories after protein (4 kcal/g) and fat (9 kcal/g). */
export function carbsFromRemaining(kcal: number, protein: number, fat: number): number {
  return Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
}

export function isOnTarget(d: DayEntry, t: NutritionTargets): boolean {
  return d.kcal !== null && d.kcal >= t.kcalMin && d.kcal <= t.kcalMax && d.protein !== null && d.protein >= t.proteinMin;
}

/** Share of days with calories logged that were on target (calories in range and protein hit). */
export function daysOnTarget(days: DayEntry[], t: NutritionTargets): { pct: number; n: number } {
  const logged = days.filter((d) => d.kcal !== null);
  if (!logged.length) return { pct: 0, n: 0 };
  return { pct: Math.round((logged.filter((d) => isOnTarget(d, t)).length / logged.length) * 100), n: logged.length };
}

export interface WeekNutrition {
  week: ISODate;
  avgKcal: number | null;
  avgProtein: number | null;
  days: number;
  proteinHitDays: number;
}

export function weeklyNutrition(days: DayEntry[], t: NutritionTargets): WeekNutrition[] {
  const map = new Map<ISODate, DayEntry[]>();
  for (const d of days) {
    if (d.kcal === null && d.protein === null) continue;
    const w = weekStart(d.date);
    map.set(w, [...(map.get(w) ?? []), d]);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return [...map.entries()]
    .map(([week, ds]) => ({
      week,
      avgKcal: avg(ds.flatMap((d) => (d.kcal === null ? [] : [d.kcal]))),
      avgProtein: avg(ds.flatMap((d) => (d.protein === null ? [] : [d.protein]))),
      days: ds.length,
      proteinHitDays: ds.filter((d) => d.protein !== null && d.protein >= t.proteinMin).length,
    }))
    .sort((a, b) => (a.week < b.week ? -1 : 1));
}

export interface CaloriesVsWeight {
  week: ISODate;
  avgKcal: number;
  /** Change in weekly-average bodyweight vs the previous week. */
  weightChange: number;
}

export function caloriesVsWeight(days: DayEntry[], t: NutritionTargets): CaloriesVsWeight[] {
  const bw = weeklyBodyweight(days);
  const kc = new Map(weeklyNutrition(days, t).map((w) => [w.week, w.avgKcal]));
  const out: CaloriesVsWeight[] = [];
  for (let i = 1; i < bw.length; i++) {
    if (daysBetween(bw[i - 1].week, bw[i].week) !== 7) continue;
    const k = kc.get(bw[i].week);
    if (k === null || k === undefined) continue;
    out.push({ week: bw[i].week, avgKcal: k, weightChange: round1(bw[i].avg - bw[i - 1].avg) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Adherence

export interface WeekAdherence {
  week: ISODate;
  planned: number;
  completed: number;
}

export function plannedPerWeek(split: Split): number {
  return Object.values(split).filter((v) => v !== null).length;
}

export function weeklyAdherence(sessions: WorkoutSession[], split: Split, from: ISODate, today: ISODate): WeekAdherence[] {
  const planned = plannedPerWeek(split);
  const out: WeekAdherence[] = [];
  for (let w = weekStart(from); w <= today; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    // Custom workouts are extra training: they show up in strength and volume, never in plan adherence.
    const completed = sessions.filter((s) => s.status === 'completed' && !s.custom && s.date >= w && s.date <= end).length;
    out.push({ week: w, planned, completed });
  }
  return out;
}

/** Consecutive weeks (most recent first) meeting the plan. The current week counts once met. */
export function streakWeeks(weeks: WeekAdherence[]): number {
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    const met = w.planned > 0 && w.completed >= w.planned;
    if (met) streak++;
    else if (i === weeks.length - 1) continue; // current week still in progress
    else break;
  }
  return streak;
}

// ---------------------------------------------------------------------------------------------
// Insights

/**
 * Weekly lifting performance: the average % change in each exercise's best e1RM vs its
 * previous week trained. Assisted exercises are left out (no e1RM).
 */
export function weeklyPerformance(sets: LoggedSet[]): Map<ISODate, number> {
  const best = new Map<string, Map<ISODate, number>>();
  for (const s of sets) {
    if (s.assisted) continue;
    const week = weekStart(s.date);
    const m = best.get(s.exerciseId) ?? new Map<ISODate, number>();
    m.set(week, Math.max(m.get(week) ?? 0, e1rm(s.weight, s.reps)));
    best.set(s.exerciseId, m);
  }
  const changes = new Map<ISODate, number[]>();
  for (const m of best.values()) {
    const weeks = [...m.keys()].sort();
    for (let i = 1; i < weeks.length; i++) {
      const prev = m.get(weeks[i - 1]) ?? 0;
      if (prev <= 0) continue;
      const pct = ((m.get(weeks[i]) ?? 0) / prev - 1) * 100;
      changes.set(weeks[i], [...(changes.get(weeks[i]) ?? []), pct]);
    }
  }
  return new Map([...changes].map(([w, xs]) => [w, xs.reduce((a, b) => a + b, 0) / xs.length]));
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export type InsightTone = 'good' | 'warn' | 'neutral';
export interface Insight {
  tone: InsightTone;
  text: string;
}

export interface InsightInput {
  sessions: WorkoutSession[];
  days: DayEntry[];
  nutrition: NutritionTargets;
  rule: AdjustmentRule;
  units: Units;
  today: ISODate;
}

export interface InsightReport {
  enoughData: boolean;
  weeksOfData: number;
  working: Insight[];
  notWorking: Insight[];
}

export const MIN_WEEKS_FOR_INSIGHTS = 3;

export function insights(input: InsightInput): InsightReport {
  const { sessions, days, nutrition, rule, units, today } = input;
  const sets = loggedSets(sessions);
  const weeks = new Set<ISODate>([
    ...sets.map((s) => weekStart(s.date)),
    ...days.filter((d) => d.weight !== null || d.kcal !== null).map((d) => weekStart(d.date)),
  ]);
  const report: InsightReport = { enoughData: weeks.size >= MIN_WEEKS_FOR_INSIGHTS, weeksOfData: weeks.size, working: [], notWorking: [] };
  if (!report.enoughData) return report;
  const { working, notWorking } = report;

  // Exercise progress / stalls
  const names = new Map<string, { name: string; assisted: boolean }>();
  for (const s of sets) names.set(s.exerciseId, { name: s.exerciseName, assisted: s.assisted });
  const progressed: string[] = [];
  const stalled: string[] = [];
  for (const [id, { name, assisted }] of names) {
    const st = exerciseStatus(exerciseHistory(sets, id), assisted, today);
    if (st.stalled) stalled.push(`${name} (${st.sessionsSinceImprovement} sessions)`);
    else if (st.progressed) progressed.push(name);
  }
  if (progressed.length) working.push({ tone: 'good', text: `Progressed in the last 4 weeks: ${progressed.join(', ')}.` });
  if (stalled.length) {
    notWorking.push({
      tone: 'warn',
      text: `No increase in weight, reps or e1RM for 3+ sessions: ${stalled.join(', ')}. A small deload, a rep-range change or more rest between sets may help.`,
    });
  }

  // Protein
  const nut = weeklyNutrition(days, nutrition);
  const loggedProteinDays = days.filter((d) => d.protein !== null);
  if (loggedProteinDays.length >= 7) {
    const hit = loggedProteinDays.filter((d) => (d.protein ?? 0) >= nutrition.proteinMin).length;
    const pct = Math.round((hit / loggedProteinDays.length) * 100);
    (pct >= 60 ? working : notWorking).push({
      tone: pct >= 60 ? 'good' : 'warn',
      text: `Protein hit (≥ ${nutrition.proteinMin} g) on ${pct}% of logged days.`,
    });

    const perf = weeklyPerformance(sets);
    const hitWeeks: number[] = [];
    const missWeeks: number[] = [];
    for (const w of nut) {
      const p = perf.get(w.week);
      if (p === undefined || w.days < 3) continue;
      (w.proteinHitDays / w.days >= 0.7 ? hitWeeks : missWeeks).push(p);
    }
    if (hitWeeks.length >= 2 && missWeeks.length >= 2) {
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const diff = avg(hitWeeks) - avg(missWeeks);
      if (Math.abs(diff) >= 0.5) {
        (diff > 0 ? working : notWorking).push({
          tone: diff > 0 ? 'good' : 'neutral',
          text:
            diff > 0
              ? `Strength tended to improve more in weeks when protein was hit (${diff.toFixed(1)}% higher e1RM change on average). This is a pattern, not proof.`
              : `Strength didn't improve more in high-protein weeks so far. Other factors (sleep, recovery) may matter more right now.`,
        });
      }
    }
  }

  // Bodyweight rate
  const rate = weeklyRate(weeklyBodyweight(days));
  const advice = calorieSuggestion(rate, rule, units);
  if (advice.kind === 'keep') working.push({ tone: 'good', text: advice.text });
  else if (advice.kind !== 'insufficient') notWorking.push({ tone: 'warn', text: advice.text });

  // Muscle groups with lower weekly volume (hard sets, last 4 weeks)
  const recent = sets.filter((s) => s.date >= addDays(today, -28));
  const setsPerGroup = new Map<MuscleGroup, number>();
  for (const s of recent) setsPerGroup.set(s.muscleGroup, (setsPerGroup.get(s.muscleGroup) ?? 0) + 1);
  if (setsPerGroup.size >= 3) {
    const vals = [...setsPerGroup.values()].sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)];
    const low = [...setsPerGroup.entries()]
      .filter(([, count]) => count < median * 0.5)
      .map(([g, count]) => `${g} (${(count / 4).toFixed(1)} sets/week)`);
    if (low.length) {
      notWorking.push({ tone: 'neutral', text: `Lower weekly volume than other muscle groups: ${low.join(', ')}. Fine if intentional.` });
    }
  }

  // Calories vs lifting performance
  const perf = weeklyPerformance(sets);
  const pairs = nut.filter((w) => w.avgKcal !== null && perf.has(w.week));
  const r = pearson(pairs.map((w) => w.avgKcal ?? 0), pairs.map((w) => perf.get(w.week) ?? 0));
  if (r !== null && pairs.length >= MIN_WEEKS_FOR_INSIGHTS) {
    const strength = Math.abs(r) >= 0.5 ? 'fairly clear' : Math.abs(r) >= 0.3 ? 'weak' : null;
    if (strength) {
      const text =
        r > 0
          ? `Higher-calorie weeks showed a ${strength} link with better lifting (r = ${r.toFixed(2)}, ${pairs.length} weeks). Correlation, not proof.`
          : `Higher-calorie weeks showed a ${strength} link with worse lifting (r = ${r.toFixed(2)}, ${pairs.length} weeks). Likely noise or other factors.`;
      (r > 0 ? working : notWorking).push({ tone: 'neutral', text });
    } else {
      working.push({ tone: 'neutral', text: `No clear link yet between weekly calories and lifting performance (${pairs.length} weeks).` });
    }
  }

  return report;
}
