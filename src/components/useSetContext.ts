import { useMemo } from 'react';
import { lastPerformance, prefill, progressionHint } from '../logic/progression';
import type { ExerciseStep } from '../shared/types';
import { useAppData } from '../state/AppData';

/** Last time's performance, the progression hint and pre-fill values for one set. */
export function useSetContext(step: ExerciseStep, sessionId: string) {
  const { sessions, settings } = useAppData();
  const { weightStep } = settings.timer;
  const { units } = settings;
  return useMemo(() => {
    const last = lastPerformance(step.exerciseId, sessions, sessionId);
    const hint = progressionHint(step.target, last, { assisted: step.assisted, weightStep, units });
    return { last, hint, pre: prefill(step, last, hint) };
  }, [step, sessions, sessionId, weightStep, units]);
}
