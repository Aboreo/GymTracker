import { useEffect, useMemo, useRef, useState } from 'react';
import { countdownBeep, finishChime, unlockAudio } from '../lib/device';
import {
  addExercise,
  deleteSet,
  editSet,
  logSet,
  moveExercise,
  removeExercise,
  setsOf,
  startRest,
  stopRest,
  toTemplate,
} from '../logic/customWorkout';
import { lastPerformance, formatSet } from '../logic/progression';
import { adjustTimer, formatClock, isPaused, pauseTimer, remainingMs, resumeTimer } from '../logic/restTimer';
import { defaultRestFor } from '../logic/settings';
import { finish, reopen } from '../logic/workoutPlayer';
import { MUSCLE_GROUPS, type CustomExercise, type Exercise, type ExerciseStep, type MuscleGroup, type SetResult, type WorkoutSession } from '../shared/types';
import { useAppData } from '../state/AppData';
import { Icon } from './Icon';
import { newId } from './SplitEditor';
import { Empty, Sheet, Stepper } from './ui';
import { useNow } from './useNow';

/** Starts the session's rest timer now (called from taps only). */
const restFrom = (s: WorkoutSession, seconds: number) => startRest(s, seconds, Date.now());

/** A custom (freestyle) workout: add exercises and sets as you go. Autosaves after every change. */
export function CustomWorkoutView({ session, onDelete }: { session: WorkoutSession; onDelete: () => void }) {
  const app = useAppData();
  const { settings } = app;
  const [adding, setAdding] = useState(false);
  const [setSheet, setSetSheet] = useState<{ ex: CustomExercise; step?: ExerciseStep } | null>(null);
  const [templateOffer, setTemplateOffer] = useState(false);
  const [lastLogged, setLastLogged] = useState<number | null>(null);
  const save = (s: WorkoutSession) => app.saveSession(s);
  const custom = session.custom ?? [];
  const done = session.status === 'completed';
  const exerciseById = (id: string) => settings.plan.exercises.find((e) => e.id === id);
  const restFor = (ex: CustomExercise) => {
    const lib = exerciseById(ex.exerciseId);
    return lib ? defaultRestFor(lib, settings) : settings.timer.restSec.compound;
  };
  const lastEx = custom.find((c) => c.blockIndex === lastLogged);

  function startRestNow() {
    if (!lastEx) return;
    unlockAudio(); // inside the tap, so the countdown can beep on iOS
    save(restFrom(session, restFor(lastEx)));
  }

  function onLogged(ex: CustomExercise, s: WorkoutSession) {
    setLastLogged(ex.blockIndex);
    save(settings.timer.autoStartRest ? restFrom(s, restFor(ex)) : s);
  }

  return (
    <>
      <section className="card">
        <div className="card-title">
          <NameInput key={session.workoutName} value={session.workoutName} onCommit={(workoutName) => save({ ...session, workoutName, updatedAt: Date.now() })} />
          <span className={`badge ${done ? 'good' : 'accent'}`}>{done ? 'Completed' : 'In progress'}</span>
        </div>
        <p className="small muted">
          Custom workout · {custom.length} {custom.length === 1 ? 'exercise' : 'exercises'} · {session.steps.length}{' '}
          {session.steps.length === 1 ? 'set' : 'sets'} · saved after every set
        </p>
        {session.timer ? (
          <RestBar session={session} onUpdate={save} />
        ) : (
          lastEx &&
          !done && (
            <button
              className="btn block"
              onClick={startRestNow}
            >
              <Icon name="play" filled size={16} /> Start rest timer ({restFor(lastEx)}s)
            </button>
          )
        )}
      </section>

      {custom.length === 0 && <Empty>Add your first exercise to start logging sets.</Empty>}

      {custom.map((ex, i) => {
        const sets = setsOf(session, ex.blockIndex);
        return (
          <section key={ex.blockIndex} className="card">
            <div className="card-title">
              <div className="stack" style={{ gap: 0 }}>
                <h3>{ex.exerciseName}</h3>
                <span className="xs muted" style={{ textTransform: 'capitalize' }}>
                  {ex.muscleGroup}
                  {ex.assisted ? ' · assisted' : ''}
                </span>
              </div>
              <div className="row" style={{ gap: 0 }}>
                <button className="btn icon ghost" disabled={i === 0} aria-label="Move up" onClick={() => save(moveExercise(session, ex.blockIndex, -1, Date.now()))}>
                  <Icon name="up" />
                </button>
                <button className="btn icon ghost" disabled={i === custom.length - 1} aria-label="Move down" onClick={() => save(moveExercise(session, ex.blockIndex, 1, Date.now()))}>
                  <Icon name="down" />
                </button>
                <button className="btn icon ghost danger" aria-label={`Remove ${ex.exerciseName}`} onClick={() => save(removeExercise(session, ex.blockIndex, Date.now()))}>
                  <Icon name="trash" size={20} />
                </button>
              </div>
            </div>
            {sets.length > 0 && (
              <div className="list">
                {sets.map((st) => (
                  <button key={st.id} className="list-item" onClick={() => setSetSheet({ ex, step: st })}>
                    <span className="dot good" />
                    <span className="grow small">Set {st.round}</span>
                    <span className="small">{st.result ? formatSet(st.result, settings.units) : ''}</span>
                  </button>
                ))}
              </div>
            )}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSetSheet({ ex })}>
              <Icon name="plus" size={18} /> Log set
            </button>
          </section>
        );
      })}

      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>
        <Icon name="plus" size={18} /> Add exercise
      </button>

      <div className="row wrap">
        {done ? (
          <>
            <button className="btn" onClick={() => save(reopen(session, Date.now()))}>
              Reopen
            </button>
            <button className="btn" onClick={() => setTemplateOffer(true)} disabled={session.steps.length === 0}>
              Save as workout template
            </button>
          </>
        ) : (
          <button
            className="btn primary"
            onClick={() => {
              save(finish(session, Date.now(), false));
              if (session.steps.length > 0) setTemplateOffer(true);
            }}
          >
            <Icon name="check" size={18} /> Finish workout
          </button>
        )}
        <button className="btn ghost danger" onClick={onDelete}>
          <Icon name="trash" size={18} /> Delete session
        </button>
      </div>

      {adding && (
        <AddExerciseSheet
          inSession={new Set(custom.map((c) => c.exerciseId))}
          onPick={(ex) => {
            save(addExercise(session, ex, Date.now()));
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {setSheet && (
        <SetSheet
          key={setSheet.step?.id ?? `new-${setSheet.ex.blockIndex}`}
          session={session}
          ex={setSheet.ex}
          step={setSheet.step}
          onClose={() => setSetSheet(null)}
          onSave={(r) => {
            if (setSheet.step) save(editSet(session, setSheet.step.id, r, Date.now()));
            else onLogged(setSheet.ex, logSet(session, setSheet.ex.blockIndex, r, Date.now()));
            setSetSheet(null);
          }}
          onDelete={
            setSheet.step
              ? () => {
                  save(deleteSet(session, setSheet.step!.id, Date.now()));
                  setSetSheet(null);
                }
              : undefined
          }
        />
      )}

      {templateOffer && (
        <SaveTemplateSheet
          session={session}
          onClose={() => setTemplateOffer(false)}
          restFor={(id) => {
            const lib = exerciseById(id);
            return lib ? defaultRestFor(lib, settings) : settings.timer.restSec.compound;
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <input
      className="input"
      style={{ fontWeight: 650, fontSize: 'var(--fs-lg)', maxWidth: 320 }}
      value={text}
      aria-label="Workout name"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => (text.trim() && text.trim() !== value ? onCommit(text.trim()) : setText(value))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Countdown for the session's rest timer (timestamp-based, same as focus mode). */
function RestBar({ session, onUpdate }: { session: WorkoutSession; onUpdate: (s: WorkoutSession) => void }) {
  const { settings } = useAppData();
  const timer = session.timer!;
  const paused = isPaused(timer);
  const now = useNow(!paused);
  const rem = remainingMs(timer, now);
  const beeped = useRef<Set<number>>(new Set());
  const chimed = useRef(false);
  const cues = useMemo(() => ({ sound: settings.timer.sound, vibration: settings.timer.vibration }), [settings.timer.sound, settings.timer.vibration]);

  useEffect(() => {
    if (paused) return;
    const sec = Math.ceil(rem / 1000);
    if (sec >= 1 && sec <= 3 && !beeped.current.has(sec) && rem > (sec - 1) * 1000 + 600) {
      beeped.current.add(sec);
      countdownBeep(cues);
    }
    if (rem <= 0 && !chimed.current) {
      chimed.current = true;
      // Only chime when it ends while watching, not when reopening the app long after.
      if (rem > -2000) finishChime(cues);
    }
  }, [rem, paused, cues]);

  const act = (fn: (t: typeof timer, n: number) => typeof timer) => onUpdate({ ...session, timer: fn(timer, Date.now()), updatedAt: Date.now() });

  return (
    <div className="rest-bar" role="timer" aria-label={`Rest ${formatClock(rem)} remaining`}>
      <span className="rest-bar-clock">{rem <= 0 ? 'Rest over' : formatClock(rem)}</span>
      {paused && <span className="xs muted">Paused</span>}
      {rem > 0 && (
        <>
          <button className="btn sm" onClick={() => act((t, n) => adjustTimer(t, -15, n))}>
            −15s
          </button>
          <button className="btn sm icon" aria-label={paused ? 'Resume' : 'Pause'} onClick={() => act((t, n) => (isPaused(t) ? resumeTimer(t, n) : pauseTimer(t, n)))}>
            <Icon name={paused ? 'play' : 'pause'} filled={paused} size={18} />
          </button>
          <button className="btn sm" onClick={() => act((t, n) => adjustTimer(t, 15, n))}>
            +15s
          </button>
        </>
      )}
      <button className="btn sm ghost" onClick={() => onUpdate(stopRest(session, Date.now()))}>
        {rem <= 0 ? 'Dismiss' : 'Stop'}
      </button>
    </div>
  );
}

function SetSheet({
  session,
  ex,
  step,
  onSave,
  onDelete,
  onClose,
}: {
  session: WorkoutSession;
  ex: CustomExercise;
  step?: ExerciseStep;
  onSave: (r: SetResult) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { sessions, settings } = useAppData();
  const last = useMemo(() => lastPerformance(ex.exerciseId, sessions, session.id), [ex.exerciseId, sessions, session.id]);
  // Pre-fill: this set if editing, else the previous set today, else the matching set last time.
  const thisSession = setsOf(session, ex.blockIndex);
  const prev = thisSession[thisSession.length - 1]?.result ?? last?.sets[Math.min(thisSession.length, (last?.sets.length ?? 1) - 1)] ?? null;
  const pre = step?.result ?? prev;
  const [weight, setWeight] = useState(pre?.weight ?? 0);
  const [reps, setReps] = useState(pre?.reps ?? 10);
  const [rpe, setRpe] = useState(pre?.rpe?.toString() ?? '');

  return (
    <Sheet title={`${ex.exerciseName} · Set ${step?.round ?? thisSession.length + 1}`} onClose={onClose}>
      {last && <p className="small muted">Last time: {last.sets.map((s) => formatSet(s, settings.units)).join(', ')}</p>}
      <div className="grid cols-2">
        <Stepper label={ex.assisted ? 'Assistance' : 'Weight'} unit={settings.units} value={weight} onChange={setWeight} step={settings.timer.weightStep} />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} />
      </div>
      <label className="field" style={{ maxWidth: 160 }}>
        <span>RPE (optional)</span>
        <input className="input" type="number" inputMode="decimal" min={1} max={10} step={0.5} value={rpe} onChange={(e) => setRpe(e.target.value)} />
      </label>
      <button
        className="btn primary block lg"
        onClick={() => {
          unlockAudio(); // a tap: lets an auto-started rest timer beep on iOS
          onSave({ weight, reps, rpe: rpe === '' ? null : Number(rpe) });
        }}
      >
        {step ? 'Save changes' : 'Log set'}
      </button>
      {onDelete && (
        <button className="btn ghost danger" onClick={onDelete}>
          <Icon name="trash" size={18} /> Delete set
        </button>
      )}
    </Sheet>
  );
}

function AddExerciseSheet({ inSession, onPick, onClose }: { inSession: Set<string>; onPick: (ex: Exercise) => void; onClose: () => void }) {
  const { settings, updateSettings } = useAppData();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [group, setGroup] = useState<MuscleGroup>('other');
  const [assisted, setAssisted] = useState(false);
  const query = q.trim().toLowerCase();
  const matches = settings.plan.exercises.filter((e) => e.name.toLowerCase().includes(query) || e.muscleGroup.includes(query));

  function create() {
    const ex: Exercise = { id: newId(), name: q.trim(), muscleGroup: group, assisted };
    updateSettings((s) => ({ ...s, plan: { ...s.plan, exercises: [...s.plan.exercises, ex] } }));
    onPick(ex);
  }

  return (
    <Sheet title="Add exercise" onClose={onClose}>
      <label className="field">
        <span className="row" style={{ gap: 6 }}>
          <Icon name="search" size={16} /> Search or name a new exercise
        </span>
        <input className="input" value={q} autoFocus onChange={(e) => setQ(e.target.value)} placeholder="e.g. Incline press" />
      </label>
      {creating ? (
        <div className="stack">
          <h3>New exercise: {q.trim() || '…'}</h3>
          <label className="field">
            <span>Muscle group</span>
            <select className="input" value={group} onChange={(e) => setGroup(e.target.value as MuscleGroup)}>
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={assisted} onChange={(e) => setAssisted(e.target.checked)} />
            Assisted (weight = assistance, lower is better)
          </label>
          <div className="row">
            <button className="btn primary" disabled={!q.trim()} onClick={create}>
              Create & add
            </button>
            <button className="btn ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
          <p className="xs muted">Saved to your exercise library (Plan → Exercises).</p>
        </div>
      ) : (
        <>
          <div className="list picker-list">
            {matches.map((e) => (
              <button key={e.id} className="list-item" onClick={() => onPick(e)}>
                <span className="grow">{e.name}</span>
                <span className="xs muted" style={{ textTransform: 'capitalize' }}>
                  {inSession.has(e.id) ? 'added · ' : ''}
                  {e.muscleGroup}
                </span>
              </button>
            ))}
            {matches.length === 0 && <p className="small muted">No match in your library.</p>}
          </div>
          <button className="btn" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} /> Create new exercise{q.trim() ? ` “${q.trim()}”` : ''}
          </button>
        </>
      )}
    </Sheet>
  );
}

function SaveTemplateSheet({ session, restFor, onClose }: { session: WorkoutSession; restFor: (exerciseId: string) => number; onClose: () => void }) {
  const { updateSettings } = useAppData();
  const [name, setName] = useState(session.workoutName === 'Custom workout' ? '' : session.workoutName);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <Sheet title="Workout finished" onClose={onClose}>
      {saved ? (
        <p className="small">
          Saved “{saved}” to your workouts. Edit it or add it to the weekly schedule in <a href="#/plan/workouts">Plan → Workouts</a>.
        </p>
      ) : (
        <>
          <p className="small muted">
            Optional: save this as a workout template, with one block per exercise, the number of sets you did, and the rep range you hit.
          </p>
          <label className="field">
            <span>Template name</span>
            <input className="input" value={name} placeholder="e.g. Freestyle push" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>
              Not now
            </button>
            <button
              className="btn primary"
              disabled={!name.trim()}
              onClick={() => {
                const t = toTemplate(session, newId(), name.trim(), restFor);
                updateSettings((s) => ({ ...s, plan: { ...s.plan, workouts: [...s.plan.workouts, t] } }));
                setSaved(t.name);
              }}
            >
              Save template
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
