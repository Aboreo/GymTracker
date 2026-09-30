import { useMemo, useState, type ReactNode } from 'react';
import { DateNav, Empty, NumberInput, ProgressBar } from '../components/ui';
import { calorieSuggestion, carbsFromRemaining, minStatus, rangeStatus, rollingAverage, weeklyBodyweight, weeklyRate, type Status } from '../logic/analytics';
import { formatShortDate } from '../logic/dates';
import type { DayEntry } from '../shared/types';
import { emptyDay, useAppData } from '../state/AppData';

export function Log() {
  const { selectedDate, setSelectedDate } = useAppData();
  const [tab, setTab] = useState<'diet' | 'weight'>('diet');
  return (
    <div className="page">
      <div className="page-header">
        <h1>Log</h1>
        <DateNav date={selectedDate} onChange={setSelectedDate} />
      </div>
      <div className="segmented" role="group" aria-label="Log type" style={{ alignSelf: 'flex-start' }}>
        <button aria-pressed={tab === 'diet'} onClick={() => setTab('diet')}>
          Diet
        </button>
        <button aria-pressed={tab === 'weight'} onClick={() => setTab('weight')}>
          Weight
        </button>
      </div>
      {tab === 'diet' ? <DietLog /> : <WeightLog />}
    </div>
  );
}

const STATUS_TEXT: Record<Status, string> = { good: 'On target', close: 'Close', off: 'Off target', none: 'Not logged' };
const STATUS_BADGE: Record<Status, string> = { good: 'good', close: 'caution', off: 'bad', none: '' };

function MacroRow({
  label,
  unit,
  value,
  target,
  status,
  onCommit,
  extra,
  max,
}: {
  label: string;
  unit: string;
  value: number | null;
  target: string;
  status: Status;
  onCommit: (v: number | null) => void;
  extra?: ReactNode;
  max: number;
}) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row spread">
        <label className="row grow" style={{ gap: 12 }}>
          <span style={{ fontWeight: 600, minWidth: 70 }}>{label}</span>
          <div style={{ width: 120 }}>
            <NumberInput value={value} onCommit={onCommit} placeholder="—" ariaLabel={`${label} (${unit})`} />
          </div>
          <span className="small muted">{unit}</span>
        </label>
        {extra}
      </div>
      <ProgressBar value={value ?? 0} max={max} status={status} />
      <div className="row spread xs">
        <span className="muted">Target {target}</span>
        <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_TEXT[status]}</span>
      </div>
    </div>
  );
}

function DietLog() {
  const { days, selectedDate, saveDay, settings } = useAppData();
  const t = settings.nutrition;
  const day = days.get(selectedDate) ?? emptyDay(selectedDate);

  const autoCarbs = (d: DayEntry) =>
    !d.carbsManual && d.kcal !== null ? carbsFromRemaining(d.kcal, d.protein ?? 0, d.fat ?? 0) : d.carbs;

  const patch = (p: Partial<DayEntry>) => {
    const next = { ...day, ...p };
    saveDay({ ...next, carbs: autoCarbs(next) });
  };

  const carbTarget = carbsFromRemaining(t.kcalTarget, (t.proteinMin + t.proteinMax) / 2, (t.fatMin + t.fatMax) / 2);

  return (
    <section className="card" style={{ maxWidth: 640 }}>
      <div className="card-title">
        <h2>Daily totals</h2>
        <span className="small muted">Saves automatically</span>
      </div>
      <MacroRow
        label="Calories"
        unit="kcal"
        value={day.kcal}
        target={`${t.kcalMin}–${t.kcalMax}`}
        max={t.kcalMax}
        status={rangeStatus(day.kcal, t.kcalMin, t.kcalMax)}
        onCommit={(kcal) => patch({ kcal })}
      />
      <MacroRow
        label="Protein"
        unit="g"
        value={day.protein}
        target={`${t.proteinMin}–${t.proteinMax}`}
        max={t.proteinMax}
        status={minStatus(day.protein, t.proteinMin)}
        onCommit={(protein) => patch({ protein })}
      />
      <MacroRow
        label="Fat"
        unit="g"
        value={day.fat}
        target={`${t.fatMin}–${t.fatMax}`}
        max={t.fatMax}
        status={rangeStatus(day.fat, t.fatMin, t.fatMax, 0.15)}
        onCommit={(fat) => patch({ fat })}
      />
      <MacroRow
        label="Carbs"
        unit="g"
        value={day.carbs}
        target={`~${carbTarget}`}
        max={carbTarget}
        status={day.carbs === null ? 'none' : 'good'}
        onCommit={(carbs) => saveDay({ ...day, carbs, carbsManual: carbs !== null })}
        extra={
          day.carbsManual ? (
            <button className="btn sm ghost" onClick={() => patch({ carbsManual: false })}>
              Auto
            </button>
          ) : (
            <span className="xs muted">auto from remaining kcal</span>
          )
        }
      />
    </section>
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
