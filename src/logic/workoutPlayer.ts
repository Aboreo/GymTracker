// Expands workout blocks into a flat list of steps, and runs the focus-mode state machine.
// All functions are pure: they take a session and return a new one.

import type {
  Block,
  Exercise,
  ExerciseStep,
  ISODate,
  Plan,
  SetResult,
  Step,
  Target,
  WorkoutSession,
  WorkoutTemplate,
} from '../shared/types';
import { isExpired, startTimer } from './restTimer';

export const UNKNOWN_EXERCISE: Omit<Exercise, 'id'> = { name: 'Unknown exercise', muscleGroup: 'other', assisted: false };

/**
 * Within a block: each exercise in order, then the rest, then the next round.
 * Rest blocks become a single rest step. The last step of the whole workout is never a rest.
 */
export function expandBlocks(blocks: Block[], exercises: Exercise[]): Step[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const steps: Step[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.kind === 'rest') {
      if (block.restSec > 0) {
        steps.push({ kind: 'rest', id: `b${blockIndex}-rest`, blockIndex, restSec: block.restSec, standalone: true });
      }
      return;
    }
    for (let round = 1; round <= block.rounds; round++) {
      block.exercises.forEach((be, exerciseIndex) => {
        const ex = byId.get(be.exerciseId) ?? { id: be.exerciseId, ...UNKNOWN_EXERCISE };
        steps.push({
          kind: 'exercise',
          id: `b${blockIndex}-r${round}-e${exerciseIndex}`,
          blockIndex,
          round,
          rounds: block.rounds,
          exerciseIndex,
          blockSize: block.exercises.length,
          exerciseId: ex.id,
          exerciseName: ex.name,
          muscleGroup: ex.muscleGroup,
          assisted: ex.assisted,
          target: { ...be.target }, // copy: sessions must never share objects with the plan
          status: 'pending',
          result: null,
        });
      });
      if (block.restSec > 0 && block.exercises.length > 0) {
        steps.push({ kind: 'rest', id: `b${blockIndex}-r${round}-rest`, blockIndex, restSec: block.restSec, standalone: false });
      }
    }
  });
  while (steps.length > 0 && steps[steps.length - 1].kind === 'rest') steps.pop();
  return steps;
}

export function createSession(
  template: WorkoutTemplate,
  plan: Plan,
  date: ISODate,
  now: number,
  id: string = newSessionId(date),
): WorkoutSession {
  return {
    id,
    date,
    workoutId: template.id,
    workoutName: template.name,
    status: 'in_progress',
    startedAt: now,
    endedAt: null,
    steps: expandBlocks(template.blocks, plan.exercises),
    currentIndex: 0,
    timer: null,
    updatedAt: now,
    sample: false,
  };
}

export function newSessionId(date: ISODate): string {
  return `${date}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------------------------
// Queries

export const exerciseSteps = (steps: Step[]): ExerciseStep[] =>
  steps.filter((s): s is ExerciseStep => s.kind === 'exercise');

export function currentStep(s: WorkoutSession): Step | null {
  return s.steps[s.currentIndex] ?? null;
}

export function isAtEnd(s: WorkoutSession): boolean {
  return s.currentIndex >= s.steps.length;
}

export function nextExerciseStep(s: WorkoutSession, fromIndex = s.currentIndex): ExerciseStep | null {
  for (let i = fromIndex + 1; i < s.steps.length; i++) {
    const st = s.steps[i];
    if (st.kind === 'exercise') return st;
  }
  return null;
}

/** Exercise steps not yet logged (pending or log later). */
export function unresolvedSteps(s: WorkoutSession): ExerciseStep[] {
  return exerciseSteps(s.steps).filter((st) => st.status !== 'logged');
}

export function counts(steps: Step[]) {
  const ex = exerciseSteps(steps);
  return {
    exercises: new Set(ex.map((s) => `${s.blockIndex}:${s.exerciseIndex}`)).size,
    sets: ex.length,
    logged: ex.filter((s) => s.status === 'logged').length,
  };
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One-line summary, e.g. "6 exercises · 15 sets · ~45 min". */
export function summaryLine(steps: Step[]): string {
  const c = counts(steps);
  return `${plural(c.exercises, 'exercise')} · ${plural(c.sets, 'set')} · ~${estimateMinutes(steps)} min`;
}

/** Rough duration: ~45s per set plus rest, and a couple of minutes of setup. */
export function estimateMinutes(steps: Step[]): number {
  let sec = 120;
  for (const s of steps) sec += s.kind === 'exercise' ? 45 : s.restSec;
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

export function formatTarget(t: Target): string {
  switch (t.kind) {
    case 'reps':
      return `× ${t.reps}`;
    case 'range':
      return `${t.min}–${t.max} reps`;
    case 'failure':
      return t.ceiling ? `Until failure (aim for ${t.ceiling})` : 'Until failure';
  }
}

export interface BlockGroup {
  blockIndex: number;
  kind: 'work' | 'rest';
  /** Steps of this block with their index in the session. */
  items: { index: number; step: Step }[];
  /** Work blocks: exercises of one round, rounds, and rest after each round. */
  exercises: { name: string; target: Target }[];
  rounds: number;
  restSec: number;
}

/** Regroup a flat step list into its blocks (for the overview list). */
export function groupByBlock(steps: Step[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  steps.forEach((step, index) => {
    let g = groups[groups.length - 1];
    if (!g || g.blockIndex !== step.blockIndex) {
      g = { blockIndex: step.blockIndex, kind: step.kind === 'rest' && step.standalone ? 'rest' : 'work', items: [], exercises: [], rounds: 1, restSec: 0 };
      groups.push(g);
    }
    g.items.push({ index, step });
    if (step.kind === 'rest') g.restSec = step.restSec;
    else {
      g.rounds = step.rounds;
      if (step.round === 1 || !g.exercises[step.exerciseIndex]) g.exercises[step.exerciseIndex] = { name: step.exerciseName, target: step.target };
    }
  });
  return groups;
}

export function describeGroup(g: BlockGroup): string {
  if (g.kind === 'rest') return `Rest ${g.restSec}s`;
  const ex = g.exercises.filter(Boolean);
  const rest = g.restSec ? `, rest ${g.restSec}s` : '';
  const rounds = `${g.rounds} ${g.rounds === 1 ? 'round' : 'rounds'}`;
  if (ex.length === 1) {
    const t = ex[0].target;
    const short = t.kind === 'reps' ? `${t.reps}` : t.kind === 'range' ? `${t.min}–${t.max}` : 'to failure';
    return `${ex[0].name}, ${rounds} × ${short}${rest}`;
  }
  return `Superset (${rounds}): ${ex.map((e) => `${e.name} ${inlineTarget(e.target)}`).join(' + ')}${rest}`;
}

export function inlineTarget(t: Target): string {
  if (t.kind === 'reps') return `× ${t.reps}`;
  if (t.kind === 'range') return `× ${t.min}–${t.max}`;
  return t.ceiling ? `to failure (aim ${t.ceiling})` : 'to failure';
}

// ---------------------------------------------------------------------------------------------
// Transitions

function moveTo(s: WorkoutSession, index: number, now: number): WorkoutSession {
  const i = Math.max(0, Math.min(index, s.steps.length));
  const st = s.steps[i];
  return {
    ...s,
    currentIndex: i,
    timer: st?.kind === 'rest' ? startTimer(st.restSec, now) : null,
    updatedAt: now,
  };
}

function updateStep(s: WorkoutSession, index: number, patch: Partial<ExerciseStep>, now: number): WorkoutSession {
  const st = s.steps[index];
  if (!st || st.kind !== 'exercise') return s;
  const steps = s.steps.slice();
  steps[index] = { ...st, ...patch };
  return { ...s, steps, updatedAt: now };
}

/** Advance to the next step. Entering a rest step starts its countdown automatically. */
export function next(s: WorkoutSession, now: number): WorkoutSession {
  return moveTo(s, s.currentIndex + 1, now);
}

/** Go back to the previous exercise step (rests are skipped on the way back). */
export function back(s: WorkoutSession, now: number): WorkoutSession {
  for (let i = Math.min(s.currentIndex, s.steps.length) - 1; i >= 0; i--) {
    if (s.steps[i].kind === 'exercise') return moveTo(s, i, now);
  }
  return s;
}

/** Log the current exercise step and move on. */
export function logCurrent(s: WorkoutSession, result: SetResult, now: number): WorkoutSession {
  return next(updateStep(s, s.currentIndex, { status: 'logged', result }, now), now);
}

/** Skip entering data now: mark the current step "log later" and move on. */
export function logLater(s: WorkoutSession, now: number): WorkoutSession {
  const st = currentStep(s);
  if (!st || st.kind !== 'exercise') return s;
  // Keep an existing result if the step was already logged and we're only revisiting it.
  const patch: Partial<ExerciseStep> = st.status === 'logged' ? {} : { status: 'log_later' };
  return next(updateStep(s, s.currentIndex, patch, now), now);
}

/** Log or edit any step from the overview (back-filling). null clears it back to pending. */
export function setStepResult(s: WorkoutSession, index: number, result: SetResult | null, now: number): WorkoutSession {
  return updateStep(s, index, result ? { status: 'logged', result } : { status: 'pending', result: null }, now);
}

export function markLogLater(s: WorkoutSession, index: number, now: number): WorkoutSession {
  return updateStep(s, index, { status: 'log_later', result: null }, now);
}

/**
 * Called when focus mode opens (e.g. after the app was closed mid-rest). If the current rest
 * has already expired while we were away, move on; otherwise keep the running timer.
 */
export function resume(s: WorkoutSession, now: number): WorkoutSession {
  const st = currentStep(s);
  if (st?.kind === 'rest') {
    if (!s.timer) return { ...s, timer: startTimer(st.restSec, now) };
    if (isExpired(s.timer, now)) return next(s, now);
  }
  return s;
}

/**
 * Mark the session complete. With `discardUnresolved`, pending/log-later steps are removed
 * (so they can never show up in analytics); otherwise they must have been resolved first.
 */
export function finish(s: WorkoutSession, now: number, discardUnresolved: boolean): WorkoutSession {
  const steps = discardUnresolved
    ? s.steps.filter((st) => st.kind !== 'exercise' || st.status === 'logged')
    : s.steps;
  return { ...s, steps, status: 'completed', endedAt: now, timer: null, currentIndex: steps.length, updatedAt: now };
}

export function reopen(s: WorkoutSession, now: number): WorkoutSession {
  return { ...s, status: 'in_progress', endedAt: null, updatedAt: now };
}
