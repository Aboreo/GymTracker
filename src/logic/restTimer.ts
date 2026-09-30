// Timestamp-based rest timer. We store when the rest ends and always compute the remaining
// time from the clock, so it stays correct when the screen locks, the tab is throttled or the
// app is closed and reopened. `now` is passed in so the logic is pure and testable.

import type { RestTimer } from '../shared/types';

export function startTimer(seconds: number, now: number): RestTimer {
  const durationMs = Math.max(0, seconds) * 1000;
  return { durationMs, endsAt: now + durationMs, pausedRemainingMs: null };
}

export function remainingMs(t: RestTimer, now: number): number {
  if (t.pausedRemainingMs !== null) return t.pausedRemainingMs;
  return Math.max(0, t.endsAt - now);
}

export function isPaused(t: RestTimer): boolean {
  return t.pausedRemainingMs !== null;
}

export function isExpired(t: RestTimer, now: number): boolean {
  return remainingMs(t, now) <= 0;
}

export function pauseTimer(t: RestTimer, now: number): RestTimer {
  if (isPaused(t)) return t;
  return { ...t, pausedRemainingMs: remainingMs(t, now) };
}

export function resumeTimer(t: RestTimer, now: number): RestTimer {
  if (t.pausedRemainingMs === null) return t;
  return { ...t, endsAt: now + t.pausedRemainingMs, pausedRemainingMs: null };
}

/** Add or remove time (e.g. ±15s). Remaining time never goes below zero. */
export function adjustTimer(t: RestTimer, deltaSec: number, now: number): RestTimer {
  const next = Math.max(0, remainingMs(t, now) + deltaSec * 1000);
  const durationMs = Math.max(next, t.durationMs + deltaSec * 1000);
  if (isPaused(t)) return { ...t, durationMs, pausedRemainingMs: next };
  return { ...t, durationMs, endsAt: now + next };
}

/** 0 → 1 as the rest elapses (for the progress ring). */
export function progress(t: RestTimer, now: number): number {
  if (t.durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingMs(t, now) / t.durationMs));
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
