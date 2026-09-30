import { describe, expect, it } from 'vitest';
import type { AdjustmentRule, DayEntry, ExerciseStep, StepStatus, WorkoutSession } from '../shared/types';
import {
  calorieSuggestion,
  carbsFromRemaining,
  e1rm,
  exerciseHistory,
  exerciseStatus,
  insights,
  loggedSets,
  rollingAverage,
  streakWeeks,
  weeklyBodyweight,
  weeklyRate,
  weeklyVolume,
} from './analytics';
import { addDays } from './dates';

const rule: AdjustmentRule = { gainMinPerWeek: 0.25, gainMaxPerWeek: 0.5, kcalStepMin: 100, kcalStepMax: 150 };

function step(exerciseId: string, status: StepStatus, weight: number, reps: number, extra: Partial<ExerciseStep> = {}): ExerciseStep {
  return {
    kind: 'exercise', id: Math.random().toString(36), blockIndex: 0, round: 1, rounds: 1, exerciseIndex: 0, blockSize: 1,
    exerciseId, exerciseName: exerciseId, muscleGroup: 'biceps', assisted: false,
    target: { kind: 'range', min: 8, max: 12 },
    status, result: status === 'logged' ? { weight, reps, rpe: null } : null,
    ...extra,
  };
}

function session(id: string, date: string, steps: ExerciseStep[]): WorkoutSession {
  return {
    id, date, workoutId: 'w', workoutName: 'W', status: 'completed', startedAt: 0, endedAt: 0,
    steps, currentIndex: steps.length, timer: null, updatedAt: 0, sample: false,
  };
}

function day(date: string, weight: number | null, kcal: number | null = null, protein: number | null = null): DayEntry {
  return { date, weight, kcal, protein, fat: null, carbs: null, carbsManual: false, updatedAt: 0, sample: false };
}

describe('e1rm', () => {
  it('uses the Epley formula', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 1);
    expect(e1rm(100, 0)).toBe(0);
  });
});

describe('logged sets only', () => {
  it('ignores log_later and pending steps (never counted as zeros)', () => {
    const s = session('a', '2026-09-01', [
      step('curl', 'logged', 20, 10),
      step('curl', 'log_later', 0, 0),
      step('curl', 'pending', 0, 0),
    ]);
    const sets = loggedSets([s]);
    expect(sets).toHaveLength(1);
    expect(weeklyVolume(sets)[0].total).toBe(200);
    expect(weeklyVolume(sets)[0].setsByGroup.biceps).toBe(1);
    expect(exerciseHistory(sets, 'curl')[0]).toMatchObject({ topWeight: 20, topReps: 10 });
  });

  it('excludes assisted sets from load volume but counts the set', () => {
    const s = session('a', '2026-09-01', [step('pullup', 'logged', 50, 8, { assisted: true, muscleGroup: 'back' })]);
    const v = weeklyVolume(loggedSets([s]))[0];
    expect(v.total).toBe(0);
    expect(v.setsByGroup.back).toBe(1);
  });
});

describe('stall detection', () => {
  const hist = (entries: [number, number][], assisted = false) =>
    exerciseHistory(
      loggedSets(entries.map(([w, r], i) => session(`s${i}`, addDays('2026-06-01', i * 7), [step('x', 'logged', w, r, { assisted })]))),
      'x',
    );

  it('flags no improvement in weight, reps or e1RM for 3+ sessions', () => {
    const st = exerciseStatus(hist([[100, 8], [100, 10], [100, 10], [100, 9], [100, 10]]), false, '2026-09-30');
    expect(st).toMatchObject({ stalled: true, sessionsSinceImprovement: 3 });
  });

  it('is not stalled while reps keep climbing', () => {
    const st = exerciseStatus(hist([[100, 8], [100, 9], [100, 10], [100, 11]]), false, '2026-09-30');
    expect(st.stalled).toBe(false);
  });

  it('needs at least 4 sessions to call a stall', () => {
    expect(exerciseStatus(hist([[100, 8], [100, 8], [100, 8]]), false, '2026-09-30').stalled).toBe(false);
  });

  it('treats less assistance as improvement for assisted exercises', () => {
    const st = exerciseStatus(hist([[50, 8], [50, 8], [50, 8], [45, 6]], true), true, '2026-09-30');
    expect(st.sessionsSinceImprovement).toBe(0);
  });

  it('reports progress within the last 4 weeks', () => {
    const today = addDays('2026-06-01', 3 * 7);
    expect(exerciseStatus(hist([[100, 8], [100, 9], [102.5, 8], [105, 8]]), false, today).progressed).toBe(true);
  });
});

describe('bodyweight', () => {
  it('computes a 7-day rolling average over weigh-ins', () => {
    const days = [day('2026-09-01', 170), day('2026-09-02', 172), day('2026-09-05', 171), day('2026-09-09', 175)];
    const r = rollingAverage(days);
    expect(r.map((p) => p.avg)).toEqual([170, 171, 171, 173]); // 9th: window 3rd–9th = 171,175
  });

  it('fits the weekly rate on weekly averages', () => {
    // 4 weeks, weekly averages 170, 170.4, 170.8, 171.2 → +0.4/week
    const days: DayEntry[] = [];
    for (let w = 0; w < 4; w++) for (let d = 0; d < 3; d++) days.push(day(addDays('2026-08-31', w * 7 + d), 170 + w * 0.4));
    const rate = weeklyRate(weeklyBodyweight(days));
    expect(rate).toEqual({ rate: 0.4, weeks: 4 });
  });

  it('needs 2 usable weeks for a rate', () => {
    expect(weeklyRate(weeklyBodyweight([day('2026-09-01', 170), day('2026-09-02', 170)]))).toBeNull();
  });
});

describe('calorie adjustment rule', () => {
  it('suggests adding calories when not gaining', () => {
    expect(calorieSuggestion({ rate: 0.05, weeks: 4 }, rule, 'lb').kind).toBe('increase');
  });
  it('keeps calories when gaining 0.25–0.5/week', () => {
    expect(calorieSuggestion({ rate: 0.3, weeks: 4 }, rule, 'lb').kind).toBe('keep');
    expect(calorieSuggestion({ rate: 0.5, weeks: 3 }, rule, 'lb').kind).toBe('keep');
  });
  it('suggests cutting when gaining faster than 0.5/week', () => {
    const a = calorieSuggestion({ rate: 0.8, weeks: 4 }, rule, 'lb');
    expect(a.kind).toBe('decrease');
    expect(a.text).toContain('100–150 kcal');
  });
  it('waits for 3+ weeks of data', () => {
    expect(calorieSuggestion({ rate: 1, weeks: 2 }, rule, 'lb').kind).toBe('insufficient');
    expect(calorieSuggestion(null, rule, 'lb').kind).toBe('insufficient');
  });
});

describe('misc', () => {
  it('calculates carbs from remaining calories', () => {
    expect(carbsFromRemaining(2700, 135, 70)).toBe(383); // (2700 − 540 − 630) / 4 = 382.5
    expect(carbsFromRemaining(500, 135, 70)).toBe(0);
  });

  it('counts a streak, not breaking on the in-progress current week', () => {
    const w = (completed: number) => ({ week: 'x', planned: 4, completed });
    expect(streakWeeks([w(2), w(4), w(4), w(1)])).toBe(2);
    expect(streakWeeks([w(4), w(4), w(4)])).toBe(3);
    expect(streakWeeks([w(4), w(3), w(0)])).toBe(0);
  });

  it('insights require 3+ weeks of data', () => {
    const r = insights({
      sessions: [session('a', '2026-09-28', [step('curl', 'logged', 20, 10)])],
      days: [day('2026-09-28', 170)],
      nutrition: { maintenanceKcal: 2500, kcalTarget: 2700, kcalMin: 2650, kcalMax: 2750, proteinMin: 130, proteinMax: 140, fatMin: 60, fatMax: 75 },
      rule,
      units: 'lb',
      today: '2026-09-30',
    });
    expect(r.enoughData).toBe(false);
    expect(r.working).toHaveLength(0);
  });
});
