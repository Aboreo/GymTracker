import { useState } from 'react';
import { formatSet } from '../logic/progression';
import { formatTarget } from '../logic/workoutPlayer';
import type { ExerciseStep, SetResult } from '../shared/types';
import { useAppData } from '../state/AppData';
import { Sheet, Stepper } from './ui';
import { useSetContext } from './useSetContext';

/** Log or edit one set from the overview (back-filling, fixing mistakes, log-later items). */
export function StepSheet({
  step,
  sessionId,
  onSave,
  onLogLater,
  onClear,
  onClose,
}: {
  step: ExerciseStep;
  sessionId: string;
  onSave: (r: SetResult) => void;
  onLogLater: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { settings } = useAppData();
  const { last, hint, pre } = useSetContext(step, sessionId);
  const [weight, setWeight] = useState(step.result?.weight ?? pre.weight);
  const [reps, setReps] = useState(step.result?.reps ?? pre.reps);
  const [rpe, setRpe] = useState<string>(step.result?.rpe?.toString() ?? '');

  return (
    <Sheet title={step.exerciseName} onClose={onClose}>
      <div className="stack" style={{ gap: 4 }}>
        <p>
          <strong>{formatTarget(step.target)}</strong>{' '}
          <span className="muted small">
            · Round {step.round} of {step.rounds}
          </span>
        </p>
        {last && (
          <p className="small muted">
            Last time: {last.sets.map((s) => formatSet(s, settings.units)).join(', ')}
          </p>
        )}
        <p className="small" style={{ color: 'var(--accent)' }}>
          {hint.text}
        </p>
      </div>
      <div className="grid cols-2">
        <Stepper
          label={step.assisted ? 'Assistance' : 'Weight'}
          unit={settings.units}
          value={weight}
          onChange={setWeight}
          step={settings.timer.weightStep}
        />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} />
      </div>
      <label className="field" style={{ maxWidth: 160 }}>
        <span>RPE (optional)</span>
        <input className="input" type="number" inputMode="decimal" min={1} max={10} step={0.5} value={rpe} onChange={(e) => setRpe(e.target.value)} />
      </label>
      <button
        className="btn primary block lg"
        onClick={() => onSave({ weight, reps, rpe: rpe === '' ? null : Number(rpe) })}
      >
        {step.status === 'logged' ? 'Save changes' : 'Log it'}
      </button>
      <div className="row" style={{ justifyContent: 'center' }}>
        {step.status !== 'log_later' && (
          <button className="btn sm ghost" onClick={onLogLater}>
            Mark “log later”
          </button>
        )}
        {step.status !== 'pending' && (
          <button className="btn sm ghost danger" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
    </Sheet>
  );
}
