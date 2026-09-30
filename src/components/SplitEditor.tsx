import { useMemo, useState, type DragEvent } from 'react';
import { expandBlocks, inlineTarget } from '../logic/workoutPlayer';
import { MUSCLE_GROUPS, WEEKDAYS, type Block, type Exercise, type Plan, type Target, type WorkBlock } from '../shared/types';
import { useAppData } from '../state/AppData';
import { Icon } from './Icon';
import { Confirm, NumberInput } from './ui';

const DAY_LABEL: Record<(typeof WEEKDAYS)[number], string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export const newId = () => crypto.randomUUID().slice(0, 8);

/** Edit the plan by mutating a deep copy (the original is never touched). */
function usePlanEditor() {
  const { settings, updateSettings } = useAppData();
  const edit = (fn: (draft: Plan) => void) =>
    updateSettings((s) => {
      const draft = structuredClone(s.plan);
      fn(draft);
      return { ...s, plan: draft };
    });
  return { plan: settings.plan, edit, defaultRest: settings.timer.defaultRestSec };
}

// ---------------------------------------------------------------------------------------------

export function WeeklySplitEditor() {
  const { plan, edit } = usePlanEditor();
  return (
    <div className="list">
      {WEEKDAYS.map((d) => (
        <label key={d} className="list-item">
          <span className="grow">{DAY_LABEL[d]}</span>
          <select
            className="input"
            style={{ width: 'auto', minWidth: 150 }}
            value={plan.split[d] ?? ''}
            onChange={(e) => edit((p) => void (p.split[d] = e.target.value || null))}
          >
            <option value="">Rest</option>
            {plan.workouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function WorkoutsEditor() {
  const { plan, edit, defaultRest } = usePlanEditor();
  const { sessions } = useAppData();
  const [selectedId, setSelectedId] = useState<string | null>(plan.workouts[0]?.id ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wIndex = plan.workouts.findIndex((w) => w.id === selectedId);
  const workout = wIndex >= 0 ? plan.workouts[wIndex] : null;
  const inProgress = workout && sessions.some((s) => s.status === 'in_progress' && s.workoutId === workout.id);

  const addWorkout = () => {
    const id = newId();
    edit((p) => void p.workouts.push({ id, name: 'New workout', blocks: [] }));
    setSelectedId(id);
  };
  const duplicate = () => {
    if (!workout) return;
    const id = newId();
    edit((p) => {
      const copy = structuredClone(workout);
      copy.id = id;
      copy.name = `${workout.name} (copy)`;
      copy.blocks.forEach((b) => (b.id = newId()));
      p.workouts.splice(wIndex + 1, 0, copy);
    });
    setSelectedId(id);
  };
  const remove = () => {
    if (!workout) return;
    edit((p) => {
      p.workouts = p.workouts.filter((w) => w.id !== workout.id);
      for (const d of WEEKDAYS) if (p.split[d] === workout.id) p.split[d] = null;
    });
    setSelectedId(plan.workouts.find((w) => w.id !== workout.id)?.id ?? null);
    setConfirmDelete(false);
  };

  return (
    <div className="stack">
      <div className="row wrap">
        {plan.workouts.map((w) => (
          <button key={w.id} className={`btn sm ${w.id === selectedId ? 'primary' : ''}`} onClick={() => setSelectedId(w.id)}>
            {w.name}
          </button>
        ))}
        <button className="btn sm ghost" onClick={addWorkout}>
          <Icon name="plus" size={18} /> New
        </button>
      </div>

      {workout && (
        <div className="stack">
          {inProgress && (
            <p className="badge caution" style={{ whiteSpace: 'normal' }}>
              A session of this workout is in progress. Changes apply to future sessions only; the current one keeps its steps.
            </p>
          )}
          <div className="row wrap">
            <input
              className="input grow"
              style={{ minWidth: 180, fontWeight: 600 }}
              value={workout.name}
              aria-label="Workout name"
              onChange={(e) => edit((p) => void (p.workouts[wIndex].name = e.target.value))}
            />
            <button className="btn sm" onClick={duplicate}>
              <Icon name="copy" size={18} /> Duplicate
            </button>
            <button className="btn sm danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={18} /> Delete
            </button>
          </div>

          <BlockList
            blocks={workout.blocks}
            exercises={plan.exercises}
            defaultRest={defaultRest}
            onChange={(fn) => edit((p) => fn(p.workouts[wIndex].blocks))}
          />

          <Preview blocks={workout.blocks} exercises={plan.exercises} />
          <p className="xs muted">Changes apply to future sessions only. Past sessions are snapshots and never change.</p>
        </div>
      )}

      {confirmDelete && workout && (
        <Confirm
          title={`Delete “${workout.name}”?`}
          message="Past sessions of this workout are kept. Days using it in the weekly split become rest days."
          confirmLabel="Delete workout"
          danger
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function BlockList({
  blocks,
  exercises,
  defaultRest,
  onChange,
}: {
  blocks: Block[];
  exercises: Exercise[];
  defaultRest: number;
  onChange: (fn: (blocks: Block[]) => void) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const move = (from: number, to: number) =>
    onChange((b) => {
      if (to < 0 || to >= b.length || from === to) return;
      const [x] = b.splice(from, 1);
      b.splice(to, 0, x);
    });

  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom !== null) move(dragFrom, to);
    setDragFrom(null);
    setDragOver(null);
  };

  const firstExercise = exercises[0]?.id;

  return (
    <div className="stack">
      {blocks.length === 0 && <p className="empty">No blocks yet. Add an exercise or a rest below.</p>}
      {blocks.map((block, i) => (
        <div
          key={block.id}
          className={`block-card ${dragOver === i ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            if (dragFrom === null) return;
            e.preventDefault();
            setDragOver(i);
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => onDrop(e, i)}
        >
          <div className="row spread">
            <div className="row">
              <span
                className="drag-handle"
                draggable
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                aria-hidden="true"
                title="Drag to reorder"
              >
                <Icon name="grip" size={20} />
              </span>
              <span className="label">
                {i + 1}. {block.kind === 'rest' ? 'Rest' : block.exercises.length > 1 ? 'Superset' : 'Exercise'}
              </span>
            </div>
            <div className="row" style={{ gap: 0 }}>
              <button className="btn icon ghost" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move block up">
                <Icon name="up" />
              </button>
              <button className="btn icon ghost" onClick={() => move(i, i + 1)} disabled={i === blocks.length - 1} aria-label="Move block down">
                <Icon name="down" />
              </button>
              <button className="btn icon ghost danger" onClick={() => onChange((b) => void b.splice(i, 1))} aria-label="Remove block">
                <Icon name="trash" size={20} />
              </button>
            </div>
          </div>

          {block.kind === 'rest' ? (
            <label className="field" style={{ maxWidth: 200 }}>
              <span>Rest (seconds)</span>
              <NumberInput value={block.restSec} onCommit={(v) => onChange((b) => void ((b[i] as typeof block).restSec = Math.max(0, v ?? 0)))} />
            </label>
          ) : (
            <WorkBlockEditor
              block={block}
              exercises={exercises}
              onChange={(fn) => onChange((b) => fn(b[i] as WorkBlock))}
              onSplitOut={(ex) =>
                onChange((b) => {
                  const wb = b[i] as WorkBlock;
                  const [moved] = wb.exercises.splice(ex, 1);
                  b.splice(i + 1, 0, { id: newId(), kind: 'work', exercises: [moved], rounds: wb.rounds, restSec: wb.restSec });
                })
              }
            />
          )}
        </div>
      ))}

      <div className="row wrap">
        <button
          className="btn sm"
          disabled={!firstExercise}
          onClick={() =>
            onChange((b) =>
              void b.push({
                id: newId(),
                kind: 'work',
                exercises: [{ exerciseId: firstExercise, target: { kind: 'range', min: 8, max: 12 } }],
                rounds: 3,
                restSec: defaultRest,
              }),
            )
          }
        >
          <Icon name="plus" size={18} /> Exercise block
        </button>
        <button className="btn sm" onClick={() => onChange((b) => void b.push({ id: newId(), kind: 'rest', restSec: 120 }))}>
          <Icon name="plus" size={18} /> Rest block
        </button>
      </div>
    </div>
  );
}

function WorkBlockEditor({
  block,
  exercises,
  onChange,
  onSplitOut,
}: {
  block: WorkBlock;
  exercises: Exercise[];
  onChange: (fn: (b: WorkBlock) => void) => void;
  onSplitOut: (exerciseIndex: number) => void;
}) {
  const superset = block.exercises.length > 1;
  return (
    <div className="stack">
      {block.exercises.map((be, j) => (
        <div key={j} className="exercise-row">
          <select
            className="input"
            value={be.exerciseId}
            aria-label="Exercise"
            onChange={(e) => onChange((b) => void (b.exercises[j].exerciseId = e.target.value))}
          >
            {!exercises.some((x) => x.id === be.exerciseId) && <option value={be.exerciseId}>Unknown exercise</option>}
            {exercises.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <TargetEditor target={be.target} onChange={(t) => onChange((b) => void (b.exercises[j].target = t))} />
          {superset && (
            <div className="row">
              <button className="btn sm ghost" onClick={() => onSplitOut(j)} title="Move into its own block">
                Split out
              </button>
              <button className="btn sm ghost danger" onClick={() => onChange((b) => void b.exercises.splice(j, 1))}>
                Remove
              </button>
            </div>
          )}
        </div>
      ))}
      <div className="row wrap" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ width: 110 }}>
          <span>Rounds</span>
          <NumberInput value={block.rounds} step={1} onCommit={(v) => onChange((b) => void (b.rounds = Math.max(1, Math.round(v ?? 1))))} />
        </label>
        <label className="field" style={{ width: 150 }}>
          <span>Rest after round (s)</span>
          <NumberInput value={block.restSec} step={5} onCommit={(v) => onChange((b) => void (b.restSec = Math.max(0, v ?? 0)))} />
        </label>
        <button
          className="btn sm ghost"
          disabled={exercises.length === 0}
          onClick={() => onChange((b) => void b.exercises.push({ exerciseId: exercises[0].id, target: { kind: 'reps', reps: 10 } }))}
        >
          <Icon name="plus" size={18} /> {superset ? 'Add exercise' : 'Make superset'}
        </button>
      </div>
    </div>
  );
}

function TargetEditor({ target, onChange }: { target: Target; onChange: (t: Target) => void }) {
  const setKind = (kind: Target['kind']) => {
    if (kind === 'reps') onChange({ kind, reps: target.kind === 'range' ? target.max : 10 });
    else if (kind === 'range') onChange({ kind, min: 8, max: 12 });
    else onChange({ kind, ceiling: null });
  };
  return (
    <div className="row wrap">
      <select className="input" style={{ width: 'auto' }} value={target.kind} onChange={(e) => setKind(e.target.value as Target['kind'])} aria-label="Target type">
        <option value="reps">Fixed reps</option>
        <option value="range">Rep range</option>
        <option value="failure">To failure</option>
      </select>
      {target.kind === 'reps' && (
        <div style={{ width: 80 }}>
          <NumberInput value={target.reps} step={1} ariaLabel="Reps" onCommit={(v) => onChange({ kind: 'reps', reps: Math.max(1, v ?? 1) })} />
        </div>
      )}
      {target.kind === 'range' && (
        <div className="row">
          <div style={{ width: 70 }}>
            <NumberInput value={target.min} step={1} ariaLabel="Min reps" onCommit={(v) => onChange({ ...target, min: Math.max(1, v ?? 1) })} />
          </div>
          <span className="muted">–</span>
          <div style={{ width: 70 }}>
            <NumberInput value={target.max} step={1} ariaLabel="Max reps" onCommit={(v) => onChange({ ...target, max: Math.max(target.min, v ?? target.min) })} />
          </div>
        </div>
      )}
      {target.kind === 'failure' && (
        <div className="row">
          <span className="small muted">aim for</span>
          <div style={{ width: 80 }}>
            <NumberInput
              value={target.ceiling}
              step={1}
              placeholder="—"
              ariaLabel="Target ceiling (optional)"
              onCommit={(v) => onChange({ kind: 'failure', ceiling: v && v > 0 ? v : null })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Preview({ blocks, exercises }: { blocks: Block[]; exercises: Exercise[] }) {
  const steps = useMemo(() => expandBlocks(blocks, exercises), [blocks, exercises]);
  if (!steps.length) return null;
  return (
    <div className="preview">
      <span className="label">Focus mode will run ({steps.filter((s) => s.kind === 'exercise').length} sets)</span>
      <p className="small">
        {steps
          .map((s) => (s.kind === 'rest' ? `Rest ${s.restSec}s` : `${s.exerciseName} ${inlineTarget(s.target)}`))
          .join(' → ')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function ExerciseLibrary() {
  const { plan, edit } = usePlanEditor();
  const [blocked, setBlocked] = useState<string | null>(null);

  const usedIn = (id: string) =>
    plan.workouts.filter((w) => w.blocks.some((b) => b.kind === 'work' && b.exercises.some((e) => e.exerciseId === id))).map((w) => w.name);

  return (
    <div className="stack">
      <div className="list">
        {plan.exercises.map((ex, i) => (
          <div key={ex.id} className="list-item wrap-sm">
            <input
              className="input grow"
              style={{ minWidth: 160 }}
              value={ex.name}
              aria-label="Exercise name"
              onChange={(e) => edit((p) => void (p.exercises[i].name = e.target.value))}
            />
            <select
              className="input"
              style={{ width: 'auto' }}
              value={ex.muscleGroup}
              aria-label="Muscle group"
              onChange={(e) => edit((p) => void (p.exercises[i].muscleGroup = e.target.value as Exercise['muscleGroup']))}
            >
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <label className="check small" title="Weight means assistance (lower is better)">
              <input type="checkbox" checked={ex.assisted} onChange={(e) => edit((p) => void (p.exercises[i].assisted = e.target.checked))} />
              Assisted
            </label>
            <button
              className="btn icon ghost danger"
              aria-label={`Remove ${ex.name}`}
              onClick={() => {
                const used = usedIn(ex.id);
                if (used.length) setBlocked(`${ex.name} is used in ${used.join(', ')}. Remove it from those workouts first.`);
                else edit((p) => void p.exercises.splice(i, 1));
              }}
            >
              <Icon name="trash" size={20} />
            </button>
          </div>
        ))}
      </div>
      {blocked && (
        <p className="small" style={{ color: 'var(--caution)' }} role="alert">
          {blocked}
        </p>
      )}
      <button
        className="btn sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => edit((p) => void p.exercises.push({ id: newId(), name: 'New exercise', muscleGroup: 'other', assisted: false }))}
      >
        <Icon name="plus" size={18} /> Add exercise
      </button>
      <p className="xs muted">Renaming keeps history: charts follow each exercise by its id, not its name.</p>
    </div>
  );
}
