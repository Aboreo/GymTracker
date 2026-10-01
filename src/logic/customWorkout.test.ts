import { describe, expect, it } from 'vitest';
import type { Exercise, WorkoutSession } from '../shared/types';
import { loggedSets, weeklyAdherence, weeklyVolume } from './analytics';
import { addExercise, createCustomSession, deleteSet, editSet, isCustom, logSet, moveExercise, removeExercise, setsOf, toTemplate } from './customWorkout';
import { finish } from './workoutPlayer';

const bench: Exercise = { id: 'bench', name: 'Bench', muscleGroup: 'chest', assisted: false };
const curl: Exercise = { id: 'curl', name: 'Curl', muscleGroup: 'biceps', assisted: false };
const pull: Exercise = { id: 'pull', name: 'Assisted pull-up', muscleGroup: 'back', assisted: true };

function workout(): WorkoutSession {
  let s = createCustomSession('2026-09-30', 1, 'c1');
  s = addExercise(s, bench, 2);
  s = addExercise(s, curl, 3);
  s = addExercise(s, pull, 4);
  s = logSet(s, 0, { weight: 135, reps: 8, rpe: 8 }, 5);
  s = logSet(s, 1, { weight: 30, reps: 12, rpe: null }, 6);
  s = logSet(s, 0, { weight: 135, reps: 7, rpe: null }, 7);
  s = logSet(s, 2, { weight: 40, reps: 6, rpe: null }, 8);
  return s;
}

describe('custom workout', () => {
  it('starts empty and named', () => {
    const s = createCustomSession('2026-09-30', 1);
    expect(isCustom(s)).toBe(true);
    expect(s.workoutName).toBe('Custom workout');
    expect(s.steps).toEqual([]);
  });

  it('keeps sets grouped by exercise in order, numbered per exercise', () => {
    const s = workout();
    expect(s.steps.map((st) => (st.kind === 'exercise' ? `${st.exerciseId}#${st.round}/${st.rounds}` : ''))).toEqual([
      'bench#1/2', 'bench#2/2', 'curl#1/1', 'pull#1/1',
    ]);
  });

  it('edits and deletes sets', () => {
    let s = workout();
    const second = setsOf(s, 0)[1];
    s = editSet(s, second.id, { weight: 140, reps: 6, rpe: null }, 9);
    expect(setsOf(s, 0)[1].result?.weight).toBe(140);
    s = deleteSet(s, setsOf(s, 0)[0].id, 10);
    expect(setsOf(s, 0).map((st) => [st.round, st.result?.weight])).toEqual([[1, 140]]);
  });

  it('reorders and removes exercises with their sets', () => {
    let s = moveExercise(workout(), 2, -1, 9);
    expect(s.custom?.map((c) => c.exerciseId)).toEqual(['bench', 'pull', 'curl']);
    s = removeExercise(s, 0, 10);
    expect(s.custom?.map((c) => c.exerciseId)).toEqual(['pull', 'curl']);
    expect(s.steps.every((st) => st.kind === 'exercise' && st.exerciseId !== 'bench')).toBe(true);
  });

  it('feeds strength and volume analytics like any session', () => {
    const s = finish(workout(), 20, false);
    const sets = loggedSets([s]);
    expect(sets).toHaveLength(4);
    expect(weeklyVolume(sets)[0].byGroup.chest).toBe(135 * 8 + 135 * 7);
    expect(weeklyVolume(sets)[0].byGroup.back).toBe(0); // assisted: weight is assistance
  });

  it('does not count toward planned-workout adherence', () => {
    const custom = finish(workout(), 20, false);
    const planned: WorkoutSession = { ...custom, id: 'p1', custom: undefined, workoutId: 'upper-a' };
    const split = { mon: 'upper-a', tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
    expect(weeklyAdherence([custom], split, '2026-09-28', '2026-09-30')[0].completed).toBe(0);
    expect(weeklyAdherence([custom, planned], split, '2026-09-28', '2026-09-30')[0].completed).toBe(1);
  });

  it('saves as a template: one block per exercise, rounds = sets, target = reps achieved', () => {
    const t = toTemplate(workout(), 't1', 'Freestyle', (id) => (id === 'curl' ? 60 : 90));
    expect(t.blocks).toEqual([
      { id: 't1-0', kind: 'work', exercises: [{ exerciseId: 'bench', target: { kind: 'range', min: 7, max: 8 } }], rounds: 2, restSec: 90 },
      { id: 't1-1', kind: 'work', exercises: [{ exerciseId: 'curl', target: { kind: 'reps', reps: 12 } }], rounds: 1, restSec: 60 },
      { id: 't1-2', kind: 'work', exercises: [{ exerciseId: 'pull', target: { kind: 'reps', reps: 6 } }], rounds: 1, restSec: 90 },
    ]);
  });
});
