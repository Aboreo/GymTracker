import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { StepSheet } from '../components/StepSheet';
import { Confirm, DateNav, Empty, Sheet } from '../components/ui';
import { weekdayOf } from '../logic/dates';
import { unlockAudio } from '../lib/device';
import { formatSet } from '../logic/progression';
import {
  counts,
  createSession,
  describeGroup,
  summaryLine,
  expandBlocks,
  finish,
  groupByBlock,
  markLogLater,
  reopen,
  setStepResult,
  unresolvedSteps,
} from '../logic/workoutPlayer';
import { navigate } from '../router';
import type { ExerciseStep, Step, WorkoutSession } from '../shared/types';
import { useAppData } from '../state/AppData';

export function Workout() {
  const app = useAppData();
  const { settings, selectedDate, setSelectedDate } = app;
  const plan = settings.plan;
  const session = app.sessions.find((s) => s.date === selectedDate) ?? null;
  const scheduledId = plan.split[weekdayOf(selectedDate)];
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState(() => window.location.hash.includes('review'));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const templateId = overrideId ?? session?.workoutId ?? scheduledId;
  const template = plan.workouts.find((w) => w.id === templateId) ?? null;
  const steps: Step[] = useMemo(
    () => session?.steps ?? (template ? expandBlocks(template.blocks, plan.exercises) : []),
    [session, template, plan.exercises],
  );
  const c = counts(steps);
  const groups = groupByBlock(steps);
  const hasLogs = session ? c.logged > 0 : false;
  const later = session ? unresolvedSteps(session).filter((s) => s.status === 'log_later') : [];

  const save = (s: WorkoutSession) => app.saveSession(s);

  function ensureSession(): WorkoutSession | null {
    if (session && !overrideId) return session;
    if (!template) return null;
    // Switching workout on a day with an untouched session replaces it (same id).
    const s = createSession(template, plan, selectedDate, Date.now(), session?.id);
    save(s);
    setOverrideId(null);
    return s;
  }

  function startFocus() {
    unlockAudio(); // must happen inside this tap for iOS
    const s = ensureSession();
    if (!s) return;
    if (s.status === 'completed') save(reopen(s, Date.now()));
    navigate('focus');
  }

  const editingStep = session && editing !== null ? (session.steps[editing] as ExerciseStep | undefined) : undefined;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Workout</h1>
        <DateNav date={selectedDate} onChange={(d) => { setSelectedDate(d); setOverrideId(null); }} />
      </div>

      <section className="card">
        <div className="card-title">
          <div className="stack" style={{ gap: 2 }}>
            <h2>{session?.workoutName && !overrideId ? session.workoutName : (template?.name ?? 'Rest day')}</h2>
            {steps.length > 0 && (
              <p className="small muted">
                {summaryLine(steps)}
                {session && ` · ${c.logged}/${c.sets} logged`}
              </p>
            )}
          </div>
          {session && (
            <span className={`badge ${session.status === 'completed' ? 'good' : 'accent'}`}>
              {session.status === 'completed' ? 'Completed' : 'In progress'}
            </span>
          )}
        </div>

        {!hasLogs && (
          <label className="row small muted">
            <span>Workout for this day:</span>
            <select
              className="input"
              style={{ width: 'auto' }}
              value={templateId ?? ''}
              onChange={(e) => setOverrideId(e.target.value || null)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {plan.workouts.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.id === scheduledId ? ' (scheduled)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {steps.length === 0 ? (
          <Empty>{template ? 'This workout has no exercises yet. Add blocks in Plan.' : 'Nothing scheduled today. Pick a workout above to train anyway.'}</Empty>
        ) : (
          <>
            <button className="btn primary lg block" onClick={startFocus}>
              <Icon name="play" filled size={18} />
              {session?.status === 'in_progress' && !overrideId ? 'Resume focus mode' : 'Start focus mode'}
            </button>
            {!session && (
              <button className="btn sm ghost" onClick={() => ensureSession()}>
                Log manually instead (back-fill)
              </button>
            )}
          </>
        )}
      </section>

      {later.length > 0 && (
        <section className="card">
          <h3>To log later</h3>
          <div className="list">
            {later.map((st) => {
              const i = session!.steps.indexOf(st);
              return (
                <button key={st.id} className="list-item" onClick={() => setEditing(i)}>
                  <span className="dot caution" />
                  <span className="grow">
                    {st.exerciseName} <span className="muted small">· round {st.round}</span>
                  </span>
                  <span className="small" style={{ color: 'var(--accent)' }}>
                    Fill in
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {groups.length > 0 && (
        <section className="card">
          <h3>Blocks</h3>
          <ol className="blocks">
            {groups.map((g) => (
              <li key={g.blockIndex}>
                <p style={{ fontWeight: 600 }}>{describeGroup(g)}</p>
                {session && g.kind === 'work' && (
                  <div className="list">
                    {g.items.map(({ index, step }) =>
                      step.kind === 'exercise' ? (
                        <button key={step.id} className="list-item" onClick={() => setEditing(index)}>
                          <StatusDot step={step} />
                          <span className="grow small">
                            {step.blockSize > 1 ? `${step.exerciseName} · ` : ''}Round {step.round}
                          </span>
                          <span className="small muted">
                            {step.result ? formatSet(step.result, settings.units) : step.status === 'log_later' ? 'Log later' : 'Pending'}
                          </span>
                        </button>
                      ) : null,
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {session && (
        <div className="row wrap">
          {session.status === 'in_progress' ? (
            <button className="btn primary" onClick={() => (unresolvedSteps(session).length ? setReviewing(true) : save(finish(session, Date.now(), false)))}>
              <Icon name="check" size={18} /> Finish workout
            </button>
          ) : (
            <button className="btn" onClick={() => save(reopen(session, Date.now()))}>
              Reopen
            </button>
          )}
          <button className="btn ghost danger" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={18} /> Delete session
          </button>
        </div>
      )}

      {editingStep && editingStep.kind === 'exercise' && session && (
        <StepSheet
          key={editingStep.id}
          step={editingStep}
          sessionId={session.id}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            save(setStepResult(session, editing!, r, Date.now()));
            setEditing(null);
          }}
          onLogLater={() => {
            save(markLogLater(session, editing!, Date.now()));
            setEditing(null);
          }}
          onClear={() => {
            save(setStepResult(session, editing!, null, Date.now()));
            setEditing(null);
          }}
        />
      )}

      {reviewing && session && editing === null && (
        <FinishReview
          session={session}
          onEdit={setEditing}
          onFinish={(discard) => {
            save(finish(session, Date.now(), discard));
            setReviewing(false);
            history.replaceState(null, '', '#/workout');
          }}
          onClose={() => {
            setReviewing(false);
            history.replaceState(null, '', '#/workout');
          }}
        />
      )}

      {confirmDelete && session && (
        <Confirm
          title="Delete this session?"
          message={`${session.workoutName} on ${session.date} and all its logged sets will be deleted. This can't be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            app.deleteSession(session.id);
            setConfirmDelete(false);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function StatusDot({ step }: { step: ExerciseStep }) {
  const tone = step.status === 'logged' ? 'good' : step.status === 'log_later' ? 'caution' : '';
  return <span className={`dot ${tone}`} aria-label={step.status.replace('_', ' ')} />;
}

function FinishReview({
  session,
  onEdit,
  onFinish,
  onClose,
}: {
  session: WorkoutSession;
  onEdit: (index: number) => void;
  onFinish: (discard: boolean) => void;
  onClose: () => void;
}) {
  const open = unresolvedSteps(session);
  return (
    <Sheet title="Before you finish" onClose={onClose}>
      {open.length === 0 ? (
        <p className="muted">Everything is logged.</p>
      ) : (
        <>
          <p className="muted small">
            {open.length} {open.length === 1 ? 'set isn’t' : 'sets aren’t'} logged. Fill them in now, or discard them. Discarded sets are
            removed and never count in your stats.
          </p>
          <div className="list">
            {open.map((st) => (
              <button key={st.id} className="list-item" onClick={() => onEdit(session.steps.indexOf(st))}>
                <StatusDot step={st} />
                <span className="grow">
                  {st.exerciseName} <span className="muted small">· round {st.round}</span>
                </span>
                <span className="small" style={{ color: 'var(--accent)' }}>
                  Fill in
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {open.length > 0 ? (
          <button className="btn danger" onClick={() => onFinish(true)}>
            Discard {open.length} & finish
          </button>
        ) : (
          <button className="btn primary" onClick={() => onFinish(false)}>
            Finish workout
          </button>
        )}
      </div>
    </Sheet>
  );
}
