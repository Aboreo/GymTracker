import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../shared/types';
import { adjustTimer, formatClock, isExpired, pauseTimer, progress, remainingMs, resumeTimer, startTimer } from './restTimer';
import { resume } from './workoutPlayer';

describe('restTimer', () => {
  it('starts with the full duration and counts down from the clock', () => {
    const t = startTimer(90, 1_000);
    expect(remainingMs(t, 1_000)).toBe(90_000);
    expect(remainingMs(t, 31_000)).toBe(60_000);
    expect(progress(t, 46_000)).toBeCloseTo(0.5);
  });

  it('pauses and resumes without losing or gaining time', () => {
    let t = startTimer(60, 0);
    t = pauseTimer(t, 20_000);
    expect(remainingMs(t, 20_000)).toBe(40_000);
    expect(remainingMs(t, 500_000)).toBe(40_000); // frozen while paused
    t = resumeTimer(t, 500_000);
    expect(remainingMs(t, 510_000)).toBe(30_000);
  });

  it('adds and removes 15s, never going below zero', () => {
    let t = startTimer(30, 0);
    t = adjustTimer(t, 15, 10_000);
    expect(remainingMs(t, 10_000)).toBe(35_000);
    t = adjustTimer(t, -15, 10_000);
    expect(remainingMs(t, 10_000)).toBe(20_000);
    t = adjustTimer(t, -15, 10_000);
    t = adjustTimer(t, -15, 10_000);
    expect(remainingMs(t, 10_000)).toBe(0);
    expect(isExpired(t, 10_000)).toBe(true);
  });

  it('adjusts while paused', () => {
    let t = pauseTimer(startTimer(30, 0), 10_000);
    t = adjustTimer(t, 15, 99_000);
    expect(remainingMs(t, 99_000)).toBe(35_000);
  });

  it('is correct after simulated backgrounding (no ticks while away)', () => {
    const t = startTimer(90, 0);
    // The screen locks at 5s; setInterval never fires. On return at 70s:
    expect(remainingMs(t, 70_000)).toBe(20_000);
    expect(isExpired(t, 70_000)).toBe(false);
  });

  it('expires while the app was closed, and resume moves on', () => {
    const session: WorkoutSession = {
      id: 's',
      date: '2026-09-30',
      workoutId: 'w',
      workoutName: 'W',
      status: 'in_progress',
      startedAt: 0,
      endedAt: null,
      steps: [
        { kind: 'rest', id: 'r', blockIndex: 0, restSec: 60, standalone: true },
        {
          kind: 'exercise', id: 'e', blockIndex: 1, round: 1, rounds: 1, exerciseIndex: 0, blockSize: 1,
          exerciseId: 'x', exerciseName: 'X', muscleGroup: 'back', assisted: false,
          target: { kind: 'reps', reps: 5 }, status: 'pending', result: null,
        },
      ],
      currentIndex: 0,
      timer: startTimer(60, 0),
      updatedAt: 0,
      sample: false,
    };
    expect(isExpired(session.timer!, 3_600_000)).toBe(true);
    const resumed = resume(session, 3_600_000);
    expect(resumed.currentIndex).toBe(1);
    expect(resumed.timer).toBeNull();
  });

  it('formats a clock', () => {
    expect(formatClock(90_000)).toBe('1:30');
    expect(formatClock(4_200)).toBe('0:05');
    expect(formatClock(0)).toBe('0:00');
  });
});
