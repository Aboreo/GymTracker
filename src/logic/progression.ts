// Double-progression hints: work up to the top of the rep range on every set, then add weight.
// Assisted exercises progress by reducing assistance. "To failure" targets: beat last time's
// reps, and if a ceiling is set and reached, go up in weight.

import type { ExerciseStep, SetResult, Target, Units, WorkoutSession } from '../shared/types';
import { round1 } from './units';

export interface LastPerformance {
  date: string;
  sessionId: string;
  /** Logged sets for the exercise in that session, in order. */
  sets: SetResult[];
}

export type HintKind = 'first' | 'increase' | 'reduce_assist' | 'reps' | 'beat';

export interface Hint {
  kind: HintKind;
  text: string;
  /** Weight to pre-fill for the next set. null = no history. */
  suggestedWeight: number | null;
}

/** The most recent earlier session with at least one logged set of this exercise. */
export function lastPerformance(
  exerciseId: string,
  sessions: WorkoutSession[],
  excludeSessionId?: string,
): LastPerformance | null {
  let best: WorkoutSession | null = null;
  let bestSets: SetResult[] = [];
  for (const s of sessions) {
    if (s.id === excludeSessionId) continue;
    if (best && (s.date < best.date || (s.date === best.date && s.startedAt <= best.startedAt))) continue;
    const sets = s.steps
      .filter((st): st is ExerciseStep => st.kind === 'exercise' && st.exerciseId === exerciseId)
      .filter((st) => st.status === 'logged' && st.result !== null)
      .map((st) => st.result as SetResult);
    if (sets.length > 0) {
      best = s;
      bestSets = sets;
    }
  }
  return best ? { date: best.date, sessionId: best.id, sets: bestSets } : null;
}

function topReps(t: Target): number | null {
  if (t.kind === 'reps') return t.reps;
  if (t.kind === 'range') return t.max;
  return t.ceiling;
}

const fmt = (w: number, units: Units) => `${round1(w)} ${units}`;

export function progressionHint(
  target: Target,
  last: LastPerformance | null,
  opts: { assisted: boolean; weightStep: number; units: Units },
): Hint {
  const { assisted, weightStep, units } = opts;
  if (!last || last.sets.length === 0) {
    const goal = target.kind === 'failure' ? 'a weight you can do for a solid set' : `a weight you could do for ${target.kind === 'reps' ? target.reps : target.max} with 1–3 reps left`;
    return { kind: 'first', text: `First time: pick ${goal}`, suggestedWeight: null };
  }

  // Judge progression on the heaviest (or, for assisted, least-assisted) weight used last time.
  const weights = last.sets.map((s) => s.weight);
  const working = assisted ? Math.min(...weights) : Math.max(...weights);
  const workingSets = last.sets.filter((s) => s.weight === working);
  const bestReps = Math.max(...workingSets.map((s) => s.reps));
  const top = topReps(target);

  // Failure without a ceiling: just beat last time.
  if (target.kind === 'failure' && top === null) {
    return { kind: 'beat', text: `Beat ${bestReps} reps`, suggestedWeight: working };
  }

  const hitTop =
    top !== null &&
    (target.kind === 'failure'
      ? workingSets.some((s) => s.reps >= top) // ceiling reached
      : workingSets.every((s) => s.reps >= top)); // every set at the top of the range

  if (hitTop) {
    if (assisted) {
      const w = Math.max(0, round1(working - weightStep));
      return { kind: 'reduce_assist', text: `Reduce assistance to ${fmt(w, units)}`, suggestedWeight: w };
    }
    const w = round1(working + weightStep);
    return { kind: 'increase', text: `Go up to ${fmt(w, units)}`, suggestedWeight: w };
  }

  if (target.kind === 'failure') {
    return { kind: 'beat', text: `Beat ${bestReps} reps (aim for ${top})`, suggestedWeight: working };
  }
  return {
    kind: 'reps',
    text: `Stay at ${fmt(working, units)}, aim for ${top} reps on every set`,
    suggestedWeight: working,
  };
}

/** Pre-fill values for a set: the suggested weight and the reps from the same set last time. */
export function prefill(
  step: ExerciseStep,
  last: LastPerformance | null,
  hint: Hint,
): { weight: number; reps: number } {
  const fallbackReps =
    step.target.kind === 'reps' ? step.target.reps : step.target.kind === 'range' ? step.target.min : (step.target.ceiling ?? 10);
  if (!last) return { weight: 0, reps: fallbackReps };
  const same = last.sets[Math.min(step.round - 1, last.sets.length - 1)];
  // After a weight increase, start from the bottom of the range again.
  const reps =
    hint.kind === 'increase' || hint.kind === 'reduce_assist'
      ? step.target.kind === 'range'
        ? step.target.min
        : same.reps
      : same.reps;
  return { weight: hint.suggestedWeight ?? same.weight, reps };
}

export function formatSet(r: SetResult, units: Units): string {
  return `${round1(r.weight)} ${units} × ${r.reps}${r.rpe !== null ? ` @${r.rpe}` : ''}`;
}
