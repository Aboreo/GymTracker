import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Confirm, Stepper } from '../components/ui';
import { useSetContext } from '../components/useSetContext';
import { countdownBeep, finishChime, keepAwake, unlockAudio } from '../lib/device';
import { formatSet } from '../logic/progression';
import { adjustTimer, formatClock, isPaused, pauseTimer, progress, remainingMs, resumeTimer } from '../logic/restTimer';
import {
  back,
  currentStep,
  finish,
  formatTarget,
  isAtEnd,
  logCurrent,
  logLater,
  next,
  nextExerciseStep,
  resume,
  unresolvedSteps,
} from '../logic/workoutPlayer';
import { navigate } from '../router';
import type { ExerciseStep, RestStep, WorkoutSession } from '../shared/types';
import { useAppData } from '../state/AppData';

export function FocusMode() {
  const { sessions, selectedDate } = useAppData();
  const active =
    sessions.find((s) => s.status === 'in_progress' && s.date === selectedDate) ?? sessions.find((s) => s.status === 'in_progress');
  if (!active) {
    return (
      <div className="focus">
        <div className="focus-body" style={{ justifyContent: 'center', textAlign: 'center' }}>
          <h1>No workout in progress</h1>
          <button className="btn primary lg" onClick={() => navigate('workout')}>
            Back to workout
          </button>
        </div>
      </div>
    );
  }
  return <FocusRunner key={active.id} initial={active} />;
}

/** Re-render on a short interval while `active`, and whenever the app returns to the foreground. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    document.addEventListener('visibilitychange', tick);
    const id = active ? window.setInterval(tick, 250) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', tick);
      window.clearInterval(id);
    };
  }, [active]);
  return now;
}

function FocusRunner({ initial }: { initial: WorkoutSession }) {
  const { saveSession, settings } = useAppData();
  const [s, setS] = useState(() => resume(initial, Date.now()));
  const [confirmExit, setConfirmExit] = useState(false);
  const update = (next: WorkoutSession) => {
    setS(next);
    saveSession(next);
  };

  // Persist the result of resuming (e.g. an expired rest was skipped while the app was closed).
  useEffect(() => {
    if (s !== initial) saveSession(s);
    // run once on open
    // oxlint-disable-next-line react/exhaustive-deps
  }, []);

  useEffect(() => keepAwake(), []);

  // If focus mode was opened without a tap (app relaunched here), unlock audio on the first tap.
  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener('pointerdown', h, { once: true });
    return () => window.removeEventListener('pointerdown', h);
  }, []);

  const step = currentStep(s);
  const total = s.steps.length;

  return (
    <div className="focus">
      <header className="focus-top">
        <button className="btn icon ghost" onClick={() => setConfirmExit(true)} aria-label="Exit focus mode">
          <Icon name="close" />
        </button>
        <div className="focus-progress" aria-label={`Step ${Math.min(s.currentIndex + 1, total)} of ${total}`}>
          <div style={{ width: `${(Math.min(s.currentIndex, total) / Math.max(1, total)) * 100}%` }} />
        </div>
        <button className="btn icon ghost" onClick={() => update(back(s, Date.now()))} disabled={s.currentIndex === 0} aria-label="Previous step">
          <Icon name="back" />
        </button>
      </header>

      {step === null || isAtEnd(s) ? (
        <EndView session={s} onFinish={() => update(finish(s, Date.now(), false))} />
      ) : step.kind === 'rest' ? (
        <RestView
          key={step.id}
          session={s}
          step={step}
          sound={settings.timer.sound}
          autoAdvance={settings.timer.autoAdvance}
          onUpdate={update}
        />
      ) : (
        <ExerciseView key={step.id} session={s} step={step} onUpdate={update} />
      )}

      {confirmExit && (
        <Confirm
          title="Leave focus mode?"
          message="Your progress is saved. You can resume any time from the Workout screen."
          confirmLabel="Leave"
          onConfirm={() => navigate('workout')}
          onCancel={() => setConfirmExit(false)}
        />
      )}
    </div>
  );
}

function StepContext({ session }: { session: WorkoutSession }) {
  const step = currentStep(session);
  if (!step) return null;
  return (
    <p className="focus-context">
      {step.kind === 'exercise' && (
        <>
          {step.blockSize > 1 && <span>Superset · </span>}
          Round {step.round} of {step.rounds} ·{' '}
        </>
      )}
      Step {session.currentIndex + 1} of {session.steps.length}
    </p>
  );
}

function NextUp({ session }: { session: WorkoutSession }) {
  const n = nextExerciseStep(session);
  return <p className="focus-next">{n ? `Next: ${n.exerciseName} ${formatTarget(n.target)}` : 'Last one!'}</p>;
}

// ---------------------------------------------------------------------------------------------

function ExerciseView({ session, step, onUpdate }: { session: WorkoutSession; step: ExerciseStep; onUpdate: (s: WorkoutSession) => void }) {
  const { settings } = useAppData();
  const { last, hint, pre } = useSetContext(step, session.id);
  const [weight, setWeight] = useState(step.result?.weight ?? pre.weight);
  const [reps, setReps] = useState(step.result?.reps ?? pre.reps);
  const [rpe, setRpe] = useState(step.result?.rpe?.toString() ?? '');

  return (
    <div className="focus-body">
      <StepContext session={session} />
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="focus-title">{step.exerciseName}</h1>
        <p className="focus-target">{formatTarget(step.target)}</p>
      </div>
      <div className="focus-hint">
        <p>{last ? `Last time: ${last.sets.map((x) => formatSet(x, settings.units)).join(', ')}` : 'No history yet'}</p>
        <p className="accent">{hint.text}</p>
      </div>

      <div className="focus-inputs">
        <Stepper
          large
          label={step.assisted ? 'Assistance' : 'Weight'}
          unit={settings.units}
          value={weight}
          onChange={setWeight}
          step={settings.timer.weightStep}
        />
        <Stepper large label="Reps" value={reps} onChange={setReps} step={1} />
        <label className="focus-rpe">
          <span>RPE</span>
          <input type="number" inputMode="decimal" min={1} max={10} step={0.5} placeholder="—" value={rpe} onChange={(e) => setRpe(e.target.value)} />
        </label>
      </div>

      <div className="focus-actions">
        <button
          className="btn primary lg block"
          onClick={() => onUpdate(logCurrent(session, { weight, reps, rpe: rpe === '' ? null : Number(rpe) }, Date.now()))}
        >
          Log it
        </button>
        <button className="btn ghost block" onClick={() => onUpdate(logLater(session, Date.now()))}>
          Log later
        </button>
        <NextUp session={session} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const RING = 2 * Math.PI * 88;

function RestView({
  session,
  step,
  sound,
  autoAdvance,
  onUpdate,
}: {
  session: WorkoutSession;
  step: RestStep;
  sound: boolean;
  autoAdvance: boolean;
  onUpdate: (s: WorkoutSession) => void;
}) {
  const timer = session.timer;
  const paused = timer ? isPaused(timer) : false;
  const now = useNow(!!timer && !paused);
  const rem = timer ? remainingMs(timer, now) : 0;
  const done = rem <= 0;
  const beeped = useRef<Set<number>>(new Set());
  const chimed = useRef(false);

  // Beeps for the last 3 seconds (only when crossing each second live, not after returning late).
  useEffect(() => {
    if (!timer || paused) return;
    const sec = Math.ceil(rem / 1000);
    if (sound && sec >= 1 && sec <= 3 && !beeped.current.has(sec) && rem > (sec - 1) * 1000 + 600) {
      beeped.current.add(sec);
      countdownBeep();
    }
    if (done && !chimed.current) {
      chimed.current = true;
      if (sound) finishChime();
      if (autoAdvance) onUpdate(next(session, Date.now()));
    }
  }, [rem, done, timer, paused, sound, autoAdvance, session, onUpdate]);

  const act = (fn: (t: NonNullable<typeof timer>, n: number) => NonNullable<typeof timer>) =>
    timer && onUpdate({ ...session, timer: fn(timer, Date.now()), updatedAt: Date.now() });

  const nextEx = nextExerciseStep(session);

  return (
    <div className="focus-body rest">
      <StepContext session={session} />
      <p className="label" style={{ color: 'var(--focus-text-2)' }}>
        {step.standalone ? 'Rest' : 'Rest between rounds'}
      </p>
      <div className="ring" role="timer" aria-live="off" aria-label={`${formatClock(rem)} remaining`}>
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="88" className="ring-track" />
          <circle
            cx="100"
            cy="100"
            r="88"
            className="ring-fill"
            strokeDasharray={RING}
            strokeDashoffset={RING * (timer ? progress(timer, now) : 1)}
          />
        </svg>
        <div className="ring-text">
          <span className="ring-clock">{done ? '0:00' : formatClock(rem)}</span>
          {paused && <span className="ring-sub">Paused</span>}
        </div>
      </div>

      {nextEx && (
        <p className="focus-next" style={{ fontSize: 'var(--fs-lg)' }}>
          Next: <strong>{nextEx.exerciseName}</strong> {formatTarget(nextEx.target)}
        </p>
      )}

      {done && !autoAdvance ? (
        <div className="focus-actions">
          <button className="btn primary lg block" onClick={() => onUpdate(next(session, Date.now()))}>
            Rest over – continue
          </button>
        </div>
      ) : (
        <div className="focus-actions">
          <div className="rest-controls">
            <button className="btn lg" onClick={() => act((t, n) => adjustTimer(t, -15, n))}>
              −15s
            </button>
            <button className="btn lg" onClick={() => act((t, n) => (isPaused(t) ? resumeTimer(t, n) : pauseTimer(t, n)))} aria-label={paused ? 'Resume' : 'Pause'}>
              <Icon name={paused ? 'play' : 'pause'} filled={paused} />
            </button>
            <button className="btn lg" onClick={() => act((t, n) => adjustTimer(t, 15, n))}>
              +15s
            </button>
          </div>
          <button className="btn primary lg block" onClick={() => onUpdate(next(session, Date.now()))}>
            <Icon name="skip" filled size={18} /> Skip rest
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function EndView({ session, onFinish }: { session: WorkoutSession; onFinish: () => void }) {
  const open = unresolvedSteps(session);
  const logged = session.steps.filter((s) => s.kind === 'exercise' && s.status === 'logged').length;
  return (
    <div className="focus-body" style={{ justifyContent: 'center', textAlign: 'center' }}>
      <h1 className="focus-title">That’s the last step</h1>
      <p className="focus-target">
        {logged} sets logged{open.length ? ` · ${open.length} to log later` : ''}
      </p>
      <div className="focus-actions">
        {open.length ? (
          <button className="btn primary lg block" onClick={() => (window.location.hash = '/workout?review')}>
            Review {open.length} unlogged {open.length === 1 ? 'set' : 'sets'}
          </button>
        ) : (
          <button
            className="btn primary lg block"
            onClick={() => {
              onFinish();
              navigate('workout');
            }}
          >
            Finish workout
          </button>
        )}
      </div>
    </div>
  );
}
