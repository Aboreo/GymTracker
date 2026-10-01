// The starting plan: Upper/Lower, 4 days a week. Every exercise is its own single-exercise block.
// Rest defaults (assumed, easy to edit): 90s for compound lifts, 60s for isolation and abs.

import type { Block, Exercise, Plan, Settings, Target, WorkoutTemplate } from '../shared/types';

const COMPOUND_REST = 90;
const ISOLATION_REST = 60;

export const DEFAULT_EXERCISES: Exercise[] = [
  { id: 'lat-pulldown', name: 'Lat pulldown', muscleGroup: 'back', assisted: false, restType: 'compound' },
  { id: 'machine-row', name: 'Chest-supported/machine row', muscleGroup: 'back', assisted: false, restType: 'compound' },
  { id: 'db-bench', name: 'Dumbbell bench press', muscleGroup: 'chest', assisted: false, restType: 'compound' },
  { id: 'db-shoulder-press', name: 'Dumbbell shoulder press', muscleGroup: 'shoulders', assisted: false, restType: 'compound' },
  { id: 'db-curl', name: 'Dumbbell curls', muscleGroup: 'biceps', assisted: false, restType: 'isolation' },
  { id: 'triceps-pushdown', name: 'Triceps pushdown', muscleGroup: 'triceps', assisted: false, restType: 'isolation' },
  { id: 'leg-press', name: 'Leg press', muscleGroup: 'quads', assisted: false, restType: 'compound' },
  { id: 'rdl', name: 'Romanian deadlift', muscleGroup: 'hamstrings', assisted: false, restType: 'compound' },
  { id: 'leg-curl', name: 'Leg curl', muscleGroup: 'hamstrings', assisted: false, restType: 'isolation' },
  { id: 'calf-raise', name: 'Calf raises', muscleGroup: 'calves', assisted: false, restType: 'isolation' },
  { id: 'abs', name: 'Abs', muscleGroup: 'abs', assisted: false, restType: 'abs' },
  { id: 'assisted-pullup', name: 'Assisted pull-ups', muscleGroup: 'back', assisted: true, restType: 'compound' },
  { id: 'cable-row', name: 'Seated cable row', muscleGroup: 'back', assisted: false, restType: 'compound' },
  { id: 'chest-press', name: 'Machine/chest press', muscleGroup: 'chest', assisted: false, restType: 'compound' },
  { id: 'lateral-raise', name: 'Lateral raises', muscleGroup: 'shoulders', assisted: false, restType: 'isolation' },
  { id: 'hammer-curl', name: 'Hammer curls', muscleGroup: 'biceps', assisted: false, restType: 'isolation' },
  { id: 'squat', name: 'Squat or hack squat', muscleGroup: 'quads', assisted: false, restType: 'compound' },
  { id: 'leg-extension', name: 'Leg extension', muscleGroup: 'quads', assisted: false, restType: 'isolation' },
];

const range = (min: number, max: number): Target => ({ kind: 'range', min, max });

function single(workoutId: string, i: number, exerciseId: string, rounds: number, target: Target, restSec: number): Block {
  return { id: `${workoutId}-${i}`, kind: 'work', exercises: [{ exerciseId, target }], rounds, restSec };
}

function workout(id: string, name: string, items: [string, number, Target, number][]): WorkoutTemplate {
  return { id, name, blocks: items.map(([ex, rounds, target, rest], i) => single(id, i, ex, rounds, target, rest)) };
}

const C = COMPOUND_REST;
const I = ISOLATION_REST;

export const DEFAULT_WORKOUTS: WorkoutTemplate[] = [
  workout('upper-a', 'Upper A', [
    ['lat-pulldown', 3, range(8, 12), C],
    ['machine-row', 3, range(8, 12), C],
    ['db-bench', 3, range(8, 12), C],
    ['db-shoulder-press', 2, range(8, 12), C],
    ['db-curl', 2, range(10, 15), I],
    ['triceps-pushdown', 2, range(10, 15), I],
  ]),
  workout('lower-a', 'Lower A', [
    ['leg-press', 3, range(8, 12), C],
    ['rdl', 3, range(8, 12), C],
    ['leg-curl', 2, range(10, 15), I],
    ['calf-raise', 3, range(10, 15), I],
    // "Abs 2–3 sets" had no rep target: seeded as 3 × 10–15 (edit in the split editor).
    ['abs', 3, range(10, 15), I],
  ]),
  workout('upper-b', 'Upper B', [
    ['assisted-pullup', 3, range(6, 10), C],
    ['cable-row', 3, range(8, 12), C],
    ['chest-press', 3, range(8, 12), C],
    ['lateral-raise', 3, range(10, 15), I],
    ['hammer-curl', 2, range(10, 15), I],
    ['triceps-pushdown', 2, range(10, 15), I],
  ]),
  workout('lower-b', 'Lower B', [
    ['squat', 3, range(6, 10), C],
    ['leg-curl', 3, range(10, 15), I],
    ['leg-extension', 2, range(10, 15), I],
    ['calf-raise', 3, range(10, 15), I],
    ['abs', 3, range(10, 15), I],
  ]),
];

export const DEFAULT_PLAN: Plan = {
  exercises: DEFAULT_EXERCISES,
  workouts: DEFAULT_WORKOUTS,
  split: { mon: 'upper-a', tue: 'lower-a', wed: null, thu: 'upper-b', fri: 'lower-b', sat: null, sun: null },
};

export function defaultSettings(): Settings {
  return {
    schemaVersion: 1,
    units: 'lb',
    nutrition: {
      maintenanceKcal: 2500,
      kcalTarget: 2700,
      kcalMin: 2650,
      kcalMax: 2750,
      proteinMin: 130,
      proteinMax: 140,
      fatMin: 60,
      fatMax: 75,
    },
    adjustment: { gainMinPerWeek: 0.25, gainMaxPerWeek: 0.5, kcalStepMin: 100, kcalStepMax: 150 },
    timer: {
      defaultRestSec: COMPOUND_REST,
      restSec: { compound: COMPOUND_REST, isolation: ISOLATION_REST, abs: ISOLATION_REST },
      weightStep: 2.5,
      autoAdvance: true,
      sound: true,
      vibration: true,
      autoStartRest: false,
    },
    plan: structuredClone(DEFAULT_PLAN),
    lastBackupAt: null,
    hasSampleData: false,
  };
}
