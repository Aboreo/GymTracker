import { describe, expect, it } from 'vitest';
import type { Block, Exercise, Plan, Step, WorkoutTemplate } from '../shared/types';
import { remainingMs } from './restTimer';
import {
  back,
  createSession,
  currentStep,
  describeGroup,
  expandBlocks,
  groupByBlock,
  finish,
  isAtEnd,
  logCurrent,
  logLater,
  next,
  resume,
  setStepResult,
  unresolvedSteps,
} from './workoutPlayer';

const exercises: Exercise[] = [
  { id: 'curl', name: 'Bicep curls', muscleGroup: 'biceps', assisted: false },
  { id: 'pullup', name: 'Pull-ups', muscleGroup: 'back', assisted: false },
  { id: 'row', name: 'Row', muscleGroup: 'back', assisted: false },
];

const superset: Block = {
  id: 's',
  kind: 'work',
  exercises: [
    { exerciseId: 'curl', target: { kind: 'reps', reps: 10 } },
    { exerciseId: 'pullup', target: { kind: 'failure', ceiling: null } },
  ],
  rounds: 2,
  restSec: 30,
};

/** Compact description of a step sequence, e.g. "curl,pullup,rest30". */
const describeSteps = (steps: Step[]) =>
  steps.map((s) => (s.kind === 'rest' ? `rest${s.restSec}` : s.exerciseId)).join(',');

const template = (blocks: Block[]): WorkoutTemplate => ({ id: 't', name: 'Test', blocks });
const plan = (blocks: Block[]): Plan => ({
  exercises,
  workouts: [template(blocks)],
  split: { mon: 't', tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
});
const session = (blocks: Block[], now = 0) => createSession(template(blocks), plan(blocks), '2026-09-30', now, 'sess');
const result = (weight: number, reps: number) => ({ weight, reps, rpe: null });

describe('expandBlocks', () => {
  it('expands the superset fixture exactly, with no trailing rest', () => {
    const steps = expandBlocks([superset], exercises);
    expect(describeSteps(steps)).toBe('curl,pullup,rest30,curl,pullup');
    const [curl, pullup] = steps;
    expect(curl).toMatchObject({ exerciseName: 'Bicep curls', target: { kind: 'reps', reps: 10 }, round: 1, rounds: 2 });
    expect(pullup).toMatchObject({ exerciseName: 'Pull-ups', target: { kind: 'failure' }, round: 1 });
    expect(steps[3]).toMatchObject({ round: 2 });
  });

  it('expands a single-exercise block into N rounds with rests between', () => {
    const block: Block = { id: 'r', kind: 'work', exercises: [{ exerciseId: 'row', target: { kind: 'range', min: 8, max: 12 } }], rounds: 3, restSec: 90 };
    expect(describeSteps(expandBlocks([block], exercises))).toBe('row,rest90,row,rest90,row');
  });

  it('keeps the rest after a block when another block follows', () => {
    const row: Block = { id: 'r', kind: 'work', exercises: [{ exerciseId: 'row', target: { kind: 'reps', reps: 8 } }], rounds: 1, restSec: 60 };
    expect(describeSteps(expandBlocks([superset, row], exercises))).toBe('curl,pullup,rest30,curl,pullup,rest30,row');
  });

  it('includes standalone rest blocks, but never as the final step', () => {
    const rest: Block = { id: 'x', kind: 'rest', restSec: 120 };
    const row: Block = { id: 'r', kind: 'work', exercises: [{ exerciseId: 'row', target: { kind: 'reps', reps: 8 } }], rounds: 1, restSec: 0 };
    expect(describeSteps(expandBlocks([row, rest, row], exercises))).toBe('row,rest120,row');
    expect(describeSteps(expandBlocks([row, rest], exercises))).toBe('row');
  });

  it('snapshots names of missing exercises safely', () => {
    const block: Block = { id: 'g', kind: 'work', exercises: [{ exerciseId: 'gone', target: { kind: 'reps', reps: 5 } }], rounds: 1, restSec: 0 };
    expect(expandBlocks([block], exercises)[0]).toMatchObject({ exerciseName: 'Unknown exercise' });
  });
});

describe('groupByBlock / describeGroup', () => {
  it('describes blocks exactly as they will run', () => {
    const row: Block = { id: 'r', kind: 'work', exercises: [{ exerciseId: 'row', target: { kind: 'range', min: 8, max: 12 } }], rounds: 3, restSec: 90 };
    const groups = groupByBlock(expandBlocks([row, superset, { id: 'x', kind: 'rest', restSec: 120 }, row], exercises));
    expect(groups.map(describeGroup)).toEqual([
      'Row, 3 rounds × 8–12, rest 90s',
      'Superset (2 rounds): Bicep curls × 10 + Pull-ups to failure, rest 30s',
      'Rest 120s',
      'Row, 3 rounds × 8–12, rest 90s',
    ]);
  });
});

describe('player state machine', () => {
  it('logs a step and advances; entering a rest starts the timer', () => {
    let s = session([superset], 1000);
    s = logCurrent(s, result(15, 10), 2000);
    expect(s.steps[0]).toMatchObject({ status: 'logged', result: { weight: 15, reps: 10 } });
    expect(s.currentIndex).toBe(1);
    expect(s.timer).toBeNull();
    s = logCurrent(s, result(0, 8), 3000);
    expect(currentStep(s)?.kind).toBe('rest');
    expect(s.timer && remainingMs(s.timer, 3000)).toBe(30_000);
  });

  it('log later marks the step and moves on without data', () => {
    let s = session([superset]);
    s = logLater(s, 1);
    expect(s.steps[0]).toMatchObject({ status: 'log_later', result: null });
    expect(s.currentIndex).toBe(1);
  });

  it('back returns to the previous exercise step, skipping rests', () => {
    let s = session([superset]);
    s = logCurrent(s, result(15, 10), 1);
    s = logCurrent(s, result(0, 8), 2); // now on rest
    s = next(s, 3); // curl round 2
    expect(s.currentIndex).toBe(3);
    s = back(s, 4);
    expect(s.currentIndex).toBe(1);
    expect(s.timer).toBeNull();
    // Revisiting a logged step keeps its result if we "log later" past it.
    s = logLater(s, 5);
    expect(s.steps[1]).toMatchObject({ status: 'logged' });
  });

  it('resumes mid-workout exactly where it was', () => {
    let s = session([superset], 0);
    s = logCurrent(s, result(15, 10), 1000);
    s = logCurrent(s, result(0, 8), 2000); // rest 30s ends at 32000
    const reopenedEarly = resume(structuredClone(s), 12_000);
    expect(reopenedEarly.currentIndex).toBe(2);
    expect(reopenedEarly.timer && remainingMs(reopenedEarly.timer, 12_000)).toBe(20_000);
    const reopenedLate = resume(structuredClone(s), 60_000);
    expect(reopenedLate.currentIndex).toBe(3);
    expect(reopenedLate.timer).toBeNull();
  });

  it('reaches the end after the last step', () => {
    let s = session([superset]);
    for (let i = 0; i < 5; i++) s = currentStep(s)?.kind === 'rest' ? next(s, i) : logCurrent(s, result(10, 10), i);
    expect(isAtEnd(s)).toBe(true);
    expect(unresolvedSteps(s)).toHaveLength(0);
  });

  it('finish reports unresolved steps and can discard them', () => {
    let s = session([superset]);
    s = logCurrent(s, result(15, 10), 1);
    s = logLater(s, 2);
    expect(unresolvedSteps(s).map((x) => x.status)).toEqual(['log_later', 'pending', 'pending']);
    const kept = finish(s, 10, false);
    expect(kept.status).toBe('completed');
    expect(unresolvedSteps(kept)).toHaveLength(3);
    const discarded = finish(s, 10, true);
    expect(unresolvedSteps(discarded)).toHaveLength(0);
    expect(discarded.steps.filter((x) => x.kind === 'exercise')).toHaveLength(1);
  });

  it('back-fills a log-later step from the overview', () => {
    let s = session([superset]);
    s = logLater(s, 1);
    s = setStepResult(s, 0, result(15, 9), 2);
    expect(s.steps[0]).toMatchObject({ status: 'logged', result: { reps: 9 } });
    expect(s.currentIndex).toBe(1);
  });
});

describe('sessions are snapshots', () => {
  it('editing the plan afterwards never changes a past session', () => {
    const p = plan([superset]);
    const s = createSession(p.workouts[0], p, '2026-09-01', 0, 'past');
    const before = structuredClone(s);

    // Rename the exercise, change targets, rounds and rest, and delete a block.
    p.exercises[0].name = 'Renamed curls';
    const block = p.workouts[0].blocks[0];
    if (block.kind === 'work') {
      const t = block.exercises[0].target;
      if (t.kind === 'reps') t.reps = 99; // in-place mutation must not leak into the session
      block.exercises[1].target = { kind: 'range', min: 6, max: 8 };
      block.rounds = 5;
      block.restSec = 120;
    }
    p.workouts[0].name = 'Renamed workout';
    p.workouts[0].blocks.push({ id: 'new', kind: 'rest', restSec: 60 });

    expect(s).toEqual(before);
    expect(s.steps[0]).toMatchObject({ exerciseName: 'Bicep curls', target: { kind: 'reps', reps: 10 } });
    expect(s.workoutName).toBe('Test');
  });
});
