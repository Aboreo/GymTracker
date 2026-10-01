// Custom (freestyle) workouts: start empty, add exercises and sets as you go. Stored as a normal
// WorkoutSession (logged ExerciseSteps with exercise snapshots), so analytics read it unchanged.
// All functions are pure: they take a session and return a new one.

import type { CustomExercise, Exercise, ExerciseStep, ISODate, SetResult, Target, WorkoutSession, WorkoutTemplate } from '../shared/types';
import { startTimer } from './restTimer';
import { newSessionId } from './workoutPlayer';

export const CUSTOM_NAME = 'Custom workout';
/** Custom sets have no planned target; "to failure, no ceiling" makes hints say "beat last time". */
const OPEN_TARGET: Target = { kind: 'failure', ceiling: null };

export const isCustom = (s: WorkoutSession): boolean => s.custom !== undefined;

export function createCustomSession(date: ISODate, now: number, id: string = newSessionId(date)): WorkoutSession {
  return {
    id,
    date,
    workoutId: null,
    workoutName: CUSTOM_NAME,
    status: 'in_progress',
    startedAt: now,
    endedAt: null,
    steps: [],
    currentIndex: 0,
    timer: null,
    updatedAt: now,
    sample: false,
    custom: [],
  };
}

/** Logged sets of one exercise, in order. */
export function setsOf(s: WorkoutSession, blockIndex: number): ExerciseStep[] {
  return s.steps.filter((st): st is ExerciseStep => st.kind === 'exercise' && st.blockIndex === blockIndex);
}

/** Steps re-sorted to the exercise order, with rounds renumbered (keeps exports and charts tidy). */
function normalize(s: WorkoutSession, custom: CustomExercise[], steps: ExerciseStep[], now: number): WorkoutSession {
  const ordered: ExerciseStep[] = [];
  for (const ex of custom) {
    const sets = steps.filter((st) => st.blockIndex === ex.blockIndex);
    sets.forEach((st, i) => ordered.push({ ...st, round: i + 1, rounds: sets.length }));
  }
  return { ...s, custom, steps: ordered, currentIndex: ordered.length, updatedAt: now };
}

const allSets = (s: WorkoutSession) => s.steps.filter((st): st is ExerciseStep => st.kind === 'exercise');

export function addExercise(s: WorkoutSession, ex: Exercise, now: number): WorkoutSession {
  const custom = s.custom ?? [];
  const blockIndex = custom.reduce((m, c) => Math.max(m, c.blockIndex + 1), 0);
  const entry: CustomExercise = { blockIndex, exerciseId: ex.id, exerciseName: ex.name, muscleGroup: ex.muscleGroup, assisted: ex.assisted };
  return normalize(s, [...custom, entry], allSets(s), now);
}

export function removeExercise(s: WorkoutSession, blockIndex: number, now: number): WorkoutSession {
  return normalize(
    s,
    (s.custom ?? []).filter((c) => c.blockIndex !== blockIndex),
    allSets(s).filter((st) => st.blockIndex !== blockIndex),
    now,
  );
}

export function moveExercise(s: WorkoutSession, blockIndex: number, delta: -1 | 1, now: number): WorkoutSession {
  const custom = [...(s.custom ?? [])];
  const i = custom.findIndex((c) => c.blockIndex === blockIndex);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= custom.length) return s;
  [custom[i], custom[j]] = [custom[j], custom[i]];
  return normalize(s, custom, allSets(s), now);
}

export function logSet(s: WorkoutSession, blockIndex: number, result: SetResult, now: number): WorkoutSession {
  const ex = s.custom?.find((c) => c.blockIndex === blockIndex);
  if (!ex) return s;
  const step: ExerciseStep = {
    kind: 'exercise',
    id: `c${blockIndex}-${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    blockIndex,
    round: 0,
    rounds: 0,
    exerciseIndex: 0,
    blockSize: 1,
    exerciseId: ex.exerciseId,
    exerciseName: ex.exerciseName,
    muscleGroup: ex.muscleGroup,
    assisted: ex.assisted,
    target: { ...OPEN_TARGET },
    status: 'logged',
    result,
  };
  return normalize(s, s.custom ?? [], [...allSets(s), step], now);
}

export function editSet(s: WorkoutSession, stepId: string, result: SetResult, now: number): WorkoutSession {
  return normalize(s, s.custom ?? [], allSets(s).map((st) => (st.id === stepId ? { ...st, result } : st)), now);
}

export function deleteSet(s: WorkoutSession, stepId: string, now: number): WorkoutSession {
  return normalize(s, s.custom ?? [], allSets(s).filter((st) => st.id !== stepId), now);
}

export function startRest(s: WorkoutSession, seconds: number, now: number): WorkoutSession {
  return { ...s, timer: startTimer(seconds, now), updatedAt: now };
}

export function stopRest(s: WorkoutSession, now: number): WorkoutSession {
  return { ...s, timer: null, updatedAt: now };
}

/**
 * A reusable template from what was done: one block per exercise with sets, rounds = sets
 * logged, target = the rep range achieved (fixed reps if every set matched).
 */
export function toTemplate(s: WorkoutSession, id: string, name: string, restFor: (exerciseId: string) => number): WorkoutTemplate {
  const blocks = (s.custom ?? []).flatMap((ex, i) => {
    const reps = setsOf(s, ex.blockIndex).map((st) => st.result?.reps ?? 0).filter((r) => r > 0);
    if (!reps.length) return [];
    const min = Math.min(...reps);
    const max = Math.max(...reps);
    const target: Target = min === max ? { kind: 'reps', reps: min } : { kind: 'range', min, max };
    return [{ id: `${id}-${i}`, kind: 'work' as const, exercises: [{ exerciseId: ex.exerciseId, target }], rounds: reps.length, restSec: restFor(ex.exerciseId) }];
  });
  return { id, name, blocks };
}
