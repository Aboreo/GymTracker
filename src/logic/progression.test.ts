import { describe, expect, it } from 'vitest';
import type { ExerciseStep, SetResult, Target, WorkoutSession } from '../shared/types';
import { lastPerformance, prefill, progressionHint, type LastPerformance } from './progression';

const opts = { assisted: false, weightStep: 2.5, units: 'lb' as const };
const sets = (...s: [number, number][]): SetResult[] => s.map(([weight, reps]) => ({ weight, reps, rpe: null }));
const last = (...s: [number, number][]): LastPerformance => ({ date: '2026-09-01', sessionId: 'x', sets: sets(...s) });
const range: Target = { kind: 'range', min: 10, max: 12 };

describe('progressionHint', () => {
  it('follows the double-progression example: 10,10 → 12,11 → 12,12 → go up', () => {
    expect(progressionHint(range, last([15, 10], [15, 10]), opts)).toMatchObject({ kind: 'reps', suggestedWeight: 15 });
    expect(progressionHint(range, last([15, 12], [15, 11]), opts)).toMatchObject({ kind: 'reps', suggestedWeight: 15 });
    expect(progressionHint(range, last([15, 12], [15, 12]), opts)).toMatchObject({
      kind: 'increase',
      text: 'Go up to 17.5 lb',
      suggestedWeight: 17.5,
    });
  });

  it('fixed reps: increases only when every set hit the target', () => {
    const t: Target = { kind: 'reps', reps: 8 };
    expect(progressionHint(t, last([100, 8], [100, 7]), opts).kind).toBe('reps');
    expect(progressionHint(t, last([100, 8], [100, 8]), opts)).toMatchObject({ kind: 'increase', suggestedWeight: 102.5 });
  });

  it('to failure without a ceiling: beat last time', () => {
    const t: Target = { kind: 'failure', ceiling: null };
    expect(progressionHint(t, last([0, 8], [0, 6]), opts)).toMatchObject({ kind: 'beat', text: 'Beat 8 reps' });
  });

  it('to failure with a ceiling: go up once the ceiling is reached', () => {
    const t: Target = { kind: 'failure', ceiling: 12 };
    expect(progressionHint(t, last([20, 10]), opts)).toMatchObject({ kind: 'beat', text: 'Beat 10 reps (aim for 12)' });
    expect(progressionHint(t, last([20, 12], [20, 9]), opts)).toMatchObject({ kind: 'increase', suggestedWeight: 22.5 });
  });

  it('assisted pull-ups progress by reducing assistance', () => {
    const t: Target = { kind: 'range', min: 6, max: 10 };
    const a = { ...opts, assisted: true, weightStep: 5 };
    expect(progressionHint(t, last([50, 10], [50, 10], [50, 10]), a)).toMatchObject({
      kind: 'reduce_assist',
      text: 'Reduce assistance to 45 lb',
      suggestedWeight: 45,
    });
    // Judged on the least-assisted weight used.
    expect(progressionHint(t, last([50, 10], [45, 7]), a)).toMatchObject({ kind: 'reps', suggestedWeight: 45 });
  });

  it('gives a first-time hint with no history', () => {
    expect(progressionHint(range, null, opts)).toMatchObject({ kind: 'first', suggestedWeight: null });
  });
});

describe('prefill and lastPerformance', () => {
  const step = (round: number): ExerciseStep => ({
    kind: 'exercise', id: 'e', blockIndex: 0, round, rounds: 2, exerciseIndex: 0, blockSize: 1,
    exerciseId: 'curl', exerciseName: 'Curls', muscleGroup: 'biceps', assisted: false,
    target: range, status: 'pending', result: null,
  });

  it('pre-fills from the same set last time', () => {
    const l = last([15, 12], [15, 11]);
    const h = progressionHint(range, l, opts);
    expect(prefill(step(2), l, h)).toEqual({ weight: 15, reps: 11 });
  });

  it('after an increase, starts at the bottom of the range', () => {
    const l = last([15, 12], [15, 12]);
    expect(prefill(step(1), l, progressionHint(range, l, opts))).toEqual({ weight: 17.5, reps: 10 });
  });

  it('finds the most recent session with logged sets, ignoring log-later/pending', () => {
    const mk = (id: string, date: string, status: ExerciseStep['status'], reps: number): WorkoutSession => ({
      id, date, workoutId: 'w', workoutName: 'W', status: 'completed', startedAt: 0, endedAt: 0,
      steps: [{ ...step(1), status, result: status === 'logged' ? { weight: 15, reps, rpe: null } : null }],
      currentIndex: 1, timer: null, updatedAt: 0, sample: false,
    });
    const sessions = [mk('a', '2026-09-01', 'logged', 10), mk('b', '2026-09-08', 'log_later', 0), mk('c', '2026-09-15', 'pending', 0)];
    expect(lastPerformance('curl', sessions)).toMatchObject({ sessionId: 'a', sets: [{ reps: 10 }] });
    expect(lastPerformance('curl', sessions, 'a')).toBeNull();
  });
});
