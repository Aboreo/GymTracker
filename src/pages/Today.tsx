import { useState } from 'react';
import { Icon } from '../components/Icon';
import { DateNav, ProgressBar } from '../components/ui';
import { minStatus, rangeStatus, rollingAverage } from '../logic/analytics';
import { formatLongDate, weekdayOf } from '../logic/dates';
import { counts, summaryLine, expandBlocks } from '../logic/workoutPlayer';
import { navigate } from '../router';
import { emptyDay, useAppData } from '../state/AppData';

export function Today() {
  const { settings, selectedDate, setSelectedDate, sessions, days } = useAppData();
  const [now] = useState(Date.now);
  const plan = settings.plan;
  const session = sessions.find((s) => s.date === selectedDate);
  const template = plan.workouts.find((w) => w.id === (session?.workoutId ?? plan.split[weekdayOf(selectedDate)]));
  const steps = session?.steps ?? (template ? expandBlocks(template.blocks, plan.exercises) : []);
  const c = counts(steps);
  const day = days.get(selectedDate) ?? emptyDay(selectedDate);
  const t = settings.nutrition;
  const rolling = rollingAverage([...days.values()].filter((d) => d.date <= selectedDate));
  const avg = rolling.length ? rolling[rolling.length - 1].avg : null;
  const backupDays = settings.lastBackupAt ? Math.floor((now - settings.lastBackupAt) / 86_400_000) : null;
  const hasData = days.size > 0 || sessions.length > 0;

  return (
    <div className="page">
      <div className="page-header">
        <div className="stack" style={{ gap: 0 }}>
          <p className="label">{formatLongDate(selectedDate)}</p>
          <h1>Today</h1>
        </div>
        <DateNav date={selectedDate} onChange={setSelectedDate} />
      </div>

      {hasData && (backupDays === null || backupDays > 30) && (
        <a href="#/plan" className="card row spread" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="small">
            {backupDays === null ? 'You haven’t exported a backup yet.' : `Last backup: ${backupDays} days ago.`} Export one in Settings.
          </span>
          <Icon name="right" size={18} />
        </a>
      )}

      <section className="card">
        <div className="card-title">
          <span className="label">Workout</span>
          {session && (
            <span className={`badge ${session.status === 'completed' ? 'good' : 'accent'}`}>
              {session.status === 'completed' ? 'Done' : `${c.logged}/${c.sets} sets`}
            </span>
          )}
        </div>
        {template || session ? (
          <>
            <h2 style={{ fontSize: 'var(--fs-xl)' }}>{session?.workoutName ?? template?.name}</h2>
            <p className="muted small">
              {summaryLine(steps)}
            </p>
            <button className="btn primary lg block" onClick={() => navigate('workout')}>
              {session?.status === 'completed' ? 'View workout' : session ? 'Resume' : 'Start'}
            </button>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 'var(--fs-xl)' }}>Rest day</h2>
            <p className="muted small">Recover well. You can still pick a workout on the Workout screen.</p>
          </>
        )}
      </section>

      <div className="grid cols-2">
        <a href="#/log" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card-title">
            <span className="label">Diet</span>
            <Icon name="right" size={18} />
          </div>
          <div className="row spread">
            <span>
              <strong style={{ fontSize: 'var(--fs-lg)' }}>{day.kcal ?? '—'}</strong> <span className="muted small">/ {t.kcalTarget} kcal</span>
            </span>
          </div>
          <ProgressBar value={day.kcal ?? 0} max={t.kcalMax} status={rangeStatus(day.kcal, t.kcalMin, t.kcalMax)} />
          <div className="row spread">
            <span>
              <strong>{day.protein ?? '—'}</strong> <span className="muted small">/ {t.proteinMin} g protein</span>
            </span>
          </div>
          <ProgressBar value={day.protein ?? 0} max={t.proteinMax} status={minStatus(day.protein, t.proteinMin)} />
        </a>

        <a href="#/log" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card-title">
            <span className="label">Weight</span>
            <Icon name="right" size={18} />
          </div>
          <p>
            <strong style={{ fontSize: 'var(--fs-xl)' }}>{day.weight ?? '—'}</strong> <span className="muted">{settings.units}</span>
          </p>
          <p className="small muted">{avg !== null ? `7-day average ${avg} ${settings.units}` : 'Log a morning weigh-in'}</p>
        </a>
      </div>
    </div>
  );
}
