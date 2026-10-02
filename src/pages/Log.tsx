import { useMemo, useState } from 'react';
import { FoodEditorSheet } from '../components/FoodLibrary';
import { FoodSheet, MEAL_LABEL } from '../components/FoodSheet';
import { Icon } from '../components/Icon';
import { BackToToday, DateNav, Empty, Explainer, Link, NumberInput, ProgressBar, SubNav, Toast } from '../components/ui';
import { calorieSuggestion, carbsFromRemaining, minStatus, rangeStatus, rollingAverage, weeklyBodyweight, weeklyRate, type Status } from '../logic/analytics';
import { formatShortDate } from '../logic/dates';
import { dayEntries, entryTotals, removeEntry, upsertEntry } from '../logic/diet';
import { MEALS, type Meal, type MealEntry } from '../shared/types';
import { useLocation } from '../router';
import { emptyDay, useAppData, useSelectedDate } from '../state/AppData';

export function Log() {
  const [date, setDate] = useSelectedDate();
  const { sub } = useLocation();
  return (
    <div className="page">
      <div className="page-header">
        <BackToToday />
        <h1>Log</h1>
        <DateNav date={date} onChange={setDate} />
      </div>
      <SubNav
        label="Log type"
        items={[
          { sub: 'diet', label: 'Diet' },
          { sub: 'weight', label: 'Weight' },
        ]}
      />
      {sub === 'weight' ? <WeightLog /> : <DietLog />}
    </div>
  );
}

const STATUS_TEXT: Record<Status, string> = { good: 'On target', close: 'Close', off: 'Off target', none: 'Not logged' };
const STATUS_BADGE: Record<Status, string> = { good: 'good', close: 'caution', off: 'bad', none: '' };

function MacroRow({ label, unit, value, target, status, max }: { label: string; unit: string; value: number | null; target: string; status: Status; max: number }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row spread">
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span>
          <strong>{value ?? '—'}</strong> <span className="small muted">{unit}</span>
        </span>
      </div>
      <ProgressBar value={value ?? 0} max={max} status={status} />
      <div className="row spread xs">
        <span className="muted">Target {target}</span>
        <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_TEXT[status]}</span>
      </div>
    </div>
  );
}

type Editing = { mode: 'meal' | 'quick'; entry?: MealEntry; meal?: Meal } | 'add-food' | null;

function DietLog() {
  const { days, selectedDate, saveDay, settings } = useAppData();
  const [editing, setEditingState] = useState<Editing>(null);
  // "Added · Add another" after logging; opening any sheet dismisses it.
  const [added, setAdded] = useState<{ meal: Meal; n: number } | null>(null);
  const setEditing = (e: Editing) => {
    if (e) setAdded(null);
    setEditingState(e);
  };
  const t = settings.nutrition;
  const day = days.get(selectedDate) ?? emptyDay(selectedDate);
  const entries = dayEntries(day);
  const carbTarget = carbsFromRemaining(t.kcalTarget, (t.proteinMin + t.proteinMax) / 2, (t.fatMin + t.fatMax) / 2);

  const groups = [
    { key: 'manual', label: 'Earlier total', items: entries.filter((e) => e.kind === 'manual') },
    ...MEALS.map((m) => ({ key: m, label: MEAL_LABEL[m], items: entries.filter((e) => e.kind !== 'manual' && e.meal === m) })),
  ].filter((g) => g.items.length > 0);

  return (
    <div className="grid cols-2">
      <section className="card">
        <div className="card-title">
          <h2>Daily totals</h2>
        </div>
        <MacroRow label="Calories" unit="kcal" value={day.kcal} target={`${t.kcalMin}–${t.kcalMax}`} max={t.kcalMax} status={rangeStatus(day.kcal, t.kcalMin, t.kcalMax)} />
        <MacroRow label="Protein" unit="g" value={day.protein} target={`${t.proteinMin}–${t.proteinMax}`} max={t.proteinMax} status={minStatus(day.protein, t.proteinMin)} />
        <MacroRow label="Fat" unit="g" value={day.fat} target={`${t.fatMin}–${t.fatMax}`} max={t.fatMax} status={rangeStatus(day.fat, t.fatMin, t.fatMax, 0.15)} />
        <MacroRow label="Carbs" unit="g" value={day.carbs} target={`~${carbTarget}`} max={carbTarget} status={day.carbs === null ? 'none' : 'good'} />
      </section>

      <section className="card">
        <div className="row wrap">
          <button className="btn primary grow" onClick={() => setEditing({ mode: 'meal' })}>
            <Icon name="plus" size={18} /> Log meal
          </button>
          <button className="btn grow" onClick={() => setEditing('add-food')}>
            Add food
          </button>
        </div>
        <div className="row spread">
          <button className="btn sm ghost" onClick={() => setEditing({ mode: 'quick' })}>
            Quick add
          </button>
          <Link to="/plan/foods" className="btn sm ghost">
            Food library <Icon name="right" size={16} />
          </Link>
        </div>
        {groups.length === 0 ? (
          <Empty>Nothing logged for this day yet.</Empty>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="stack" style={{ gap: 0 }}>
              <span className="label">{g.label}</span>
              <div className="list">
                {g.items.map((e) => {
                  const tot = entryTotals(e);
                  return (
                    <button key={e.id} className="list-item" onClick={() => setEditing({ mode: e.kind === 'item' ? 'meal' : 'quick', entry: e })}>
                      <span className="grow stack" style={{ gap: 0 }}>
                        <span>{e.name}</span>
                        <span className="xs muted">
                          {e.kind === 'item' ? `${e.servings} × ${e.kcalPerServing ?? 0} kcal` : e.kind === 'quick' ? 'Quick add' : 'Logged as a daily total'}
                        </span>
                      </span>
                      <span className="stack" style={{ gap: 0, textAlign: 'right' }}>
                        <strong>{tot.kcal ?? '—'} kcal</strong>
                        <span className="xs muted">
                          P {tot.protein ?? '—'} · F {tot.fat ?? '—'} · C {tot.carbs ?? '—'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>

      {editing === 'add-food' && <FoodEditorSheet onClose={() => setEditing(null)} />}
      {editing && editing !== 'add-food' && (
        <FoodSheet
          key={editing.entry?.id ?? editing.mode}
          mode={editing.mode}
          entry={editing.entry}
          date={selectedDate}
          initialMeal={editing.meal}
          onClose={() => setEditing(null)}
          onSave={(e) => {
            saveDay(upsertEntry(day, e));
            setEditing(null);
            if (!editing.entry) setAdded((a) => ({ meal: e.meal, n: (a?.n ?? 0) + 1 }));
          }}
          onDelete={
            editing.entry
              ? () => {
                  saveDay(removeEntry(day, editing.entry!.id));
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
      {added && (
        <Toast
          key={added.n}
          message="Added"
          action={{ label: 'Add another', onClick: () => setEditing({ mode: 'meal', meal: added.meal }) }}
          onDone={() => setAdded(null)}
        />
      )}
    </div>
  );
}

function WeightLog() {
  const { days, selectedDate, saveDay, settings } = useAppData();
  const day = days.get(selectedDate) ?? emptyDay(selectedDate);
  const all = useMemo(() => [...days.values()], [days]);
  const rolling = useMemo(() => rollingAverage(all), [all]);
  const rate = useMemo(() => weeklyRate(weeklyBodyweight(all)), [all]);
  const advice = calorieSuggestion(rate, settings.adjustment, settings.units);
  const recent = rolling.slice(-14).reverse();
  const latestAvg = rolling.length ? rolling[rolling.length - 1].avg : null;
  const u = settings.units;

  return (
    <div className="grid cols-2">
      <section className="card">
        <h2>Morning weight</h2>
        <label className="row" style={{ gap: 12 }}>
          <div style={{ width: 140 }}>
            <NumberInput value={day.weight} onCommit={(weight) => saveDay({ ...day, weight })} placeholder="—" ariaLabel={`Weight (${u})`} />
          </div>
          <span className="muted">{u}</span>
        </label>
        <div className="row wrap" style={{ gap: 24 }}>
          <div>
            <p className="label">7-day average</p>
            <p style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>{latestAvg ?? '—'}</p>
          </div>
          <div>
            <p className="label">Weekly change</p>
            <p style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>
              {rate ? `${rate.rate >= 0 ? '+' : ''}${rate.rate.toFixed(2)}` : '—'} <span className="small muted">{u}/wk</span>
            </p>
          </div>
        </div>
        <p className={`small badge ${advice.kind === 'keep' ? 'good' : advice.kind === 'insufficient' ? '' : 'caution'}`} style={{ whiteSpace: 'normal' }}>
          {advice.text}
        </p>
        <p className="xs muted">
          Target: +{settings.adjustment.gainMinPerWeek} to +{settings.adjustment.gainMaxPerWeek} {u}/week, judged on weekly averages.
        </p>
        <WeightExplainer />
      </section>

      <section className="card">
        <h2>Recent weigh-ins</h2>
        {recent.length === 0 ? (
          <Empty>Log your weight each morning to see your trend.</Empty>
        ) : (
          <div className="list">
            {recent.map((p) => (
              <div key={p.date} className="list-item">
                <span className="grow">{formatShortDate(p.date)}</span>
                <span style={{ fontWeight: 600 }}>
                  {p.weight} {u}
                </span>
                <span className="small muted" style={{ width: 90, textAlign: 'right' }}>
                  avg {p.avg}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Mirrors rollingAverage, weeklyBodyweight, weeklyRate and calorieSuggestion in logic/analytics.ts.
function WeightExplainer() {
  const { settings } = useAppData();
  const u = settings.units;
  const a = settings.adjustment;
  return (
    <Explainer>
      <ul>
        <li>
          <strong>7-day average:</strong> for each day you weighed in, the average of all your weigh-ins in the 7 days ending that day. Days
          without a weigh-in are skipped, not counted as zero.
        </li>
        <li>
          <strong>Weekly change:</strong> weigh-ins are grouped into Monday–Sunday weeks and averaged. Only weeks with at least 2 weigh-ins
          count. A straight line is fitted through the last (up to) 4 of those weekly averages; its slope is your change in {u}/week. It
          needs 2 such weeks to show.
        </li>
        <li>
          <strong>Target band:</strong> +{a.gainMinPerWeek} to +{a.gainMaxPerWeek} {u}/week (Plan → Nutrition).
        </li>
        <li>
          <strong>Too slow / on target / too fast:</strong> below +{a.gainMinPerWeek} is too slow, above +{a.gainMaxPerWeek} is too fast,
          anything in between is on target.
        </li>
        <li>
          <strong>Calorie adjustment:</strong> once 3 or more qualifying weeks exist, too slow suggests adding {a.kcalStepMin}–{a.kcalStepMax}{' '}
          kcal a day, too fast suggests cutting the same amount, and on target says keep calories the same. With less data you get no
          suggestion.
        </li>
      </ul>
    </Explainer>
  );
}
