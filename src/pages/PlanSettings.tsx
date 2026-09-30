import { signOut } from 'firebase/auth';
import { useRef, useState, type ReactNode } from 'react';
import * as api from '../api';
import { ExerciseLibrary, WeeklySplitEditor, WorkoutsEditor } from '../components/SplitEditor';
import { Confirm, NumberInput } from '../components/ui';
import { generateSampleData } from '../data/sampleData';
import { auth } from '../firebase';
import { nutritionCsv, parseBackup, saveFile, weightCsv, workoutsCsv } from '../logic/backup';
import { todayISO } from '../logic/dates';
import { convertAllData } from '../logic/units';
import type { ExportFile, NutritionTargets, Settings, Units } from '../shared/types';
import { useAppData } from '../state/AppData';

function Section({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`card ${wide ? 'span-2' : ''}`}>
      <div className="stack" style={{ gap: 2 }}>
        <h2>{title}</h2>
        {subtitle && <p className="small muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

type Pending =
  | { kind: 'units'; to: Units }
  | { kind: 'import'; file: ExportFile }
  | { kind: 'sample-overwrite' }
  | { kind: 'remove-sample' }
  | null;

export function PlanSettings() {
  const app = useAppData();
  const { settings, updateSettings, uid } = app;
  const [now] = useState(Date.now);
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = (fn: (s: Settings) => Settings) => updateSettings(fn);
  const setNutrition = (k: keyof NutritionTargets) => (v: number | null) =>
    v !== null && set((s) => ({ ...s, nutrition: { ...s.nutrition, [k]: v } }));

  const days = [...app.days.values()];
  const sampleDays = days.filter((d) => d.sample);
  const sampleSessions = app.sessions.filter((s) => s.sample);
  const daysSinceBackup = settings.lastBackupAt ? Math.floor((now - settings.lastBackupAt) / 86_400_000) : null;

  async function exportJson() {
    try {
      const file = await api.exportAll(uid);
      await saveFile(`gymplan-backup-${todayISO()}.json`, JSON.stringify(file, null, 1), 'application/json');
      set((s) => ({ ...s, lastBackupAt: Date.now() }));
      setMessage('Backup exported.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMessage(`Export failed: ${(e as Error).message}`);
    }
  }

  async function exportCsv(kind: 'workouts' | 'nutrition' | 'weight') {
    try {
      const all = await api.exportAll(uid);
      const text =
        kind === 'workouts'
          ? workoutsCsv(all.sessions, settings.units)
          : kind === 'nutrition'
            ? nutritionCsv(all.days)
            : weightCsv(all.days, settings.units);
      await saveFile(`gymplan-${kind}-${todayISO()}.csv`, text, 'text/csv');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMessage(`Export failed: ${(e as Error).message}`);
    }
  }

  async function onImportFile(f: File | undefined) {
    if (!f) return;
    try {
      setPending({ kind: 'import', file: parseBackup(await f.text()) });
    } catch (e) {
      setMessage((e as Error).message);
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  function loadSample() {
    const realDays = new Set(days.filter((d) => !d.sample).map((d) => d.date));
    const realSessions = new Set(app.sessions.filter((s) => !s.sample).map((s) => s.date));
    const data = generateSampleData(settings, todayISO(), realDays, realSessions);
    void api.writeMany(uid, data.days, data.sessions);
    set((s) => ({ ...s, hasSampleData: true }));
    setMessage(`Loaded ${data.days.length} sample days and ${data.sessions.length} sample workouts.`);
  }

  function confirmPending() {
    if (!pending) return;
    if (pending.kind === 'units') {
      const to = pending.to;
      api
        .exportAll(uid)
        .then((all) => {
          const converted = convertAllData(settings, all.days, all.sessions, to);
          void api.writeMany(uid, converted.days, converted.sessions);
          set(() => converted.settings);
          setMessage(`Converted everything to ${to}.`);
        })
        .catch((e: Error) => setMessage(`Conversion needs a connection: ${e.message}`));
    } else if (pending.kind === 'import') {
      void api.importAll(uid, pending.file);
      setMessage(`Restored ${pending.file.days.length} days and ${pending.file.sessions.length} workouts.`);
    } else if (pending.kind === 'sample-overwrite') {
      loadSample();
    } else if (pending.kind === 'remove-sample') {
      void api.deleteMany(uid, sampleDays.map((d) => d.date), sampleSessions.map((s) => s.id));
      set((s) => ({ ...s, hasSampleData: false }));
      setMessage('Sample data removed.');
    }
    setPending(null);
  }

  const hasRealData = days.some((d) => !d.sample) || app.sessions.some((s) => !s.sample);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Plan & Settings</h1>
      </div>

      {message && (
        <div className="card row spread" role="status">
          <span className="small">{message}</span>
          <button className="btn sm ghost" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid cols-2">
        <Section title="Workouts" subtitle="Blocks run top to bottom. Add a second exercise to a block to make a superset." wide>
          <WorkoutsEditor />
        </Section>

        <Section title="Weekly split" subtitle="Which workout runs on each weekday.">
          <WeeklySplitEditor />
        </Section>

        <Section title="Exercise library">
          <ExerciseLibrary />
        </Section>

        <Section title="Nutrition targets">
          <div className="grid cols-2">
            <Num label="Maintenance kcal" value={settings.nutrition.maintenanceKcal} onCommit={setNutrition('maintenanceKcal')} />
            <Num label="Daily target kcal" value={settings.nutrition.kcalTarget} onCommit={setNutrition('kcalTarget')} />
            <Num label="Target range: min kcal" value={settings.nutrition.kcalMin} onCommit={setNutrition('kcalMin')} />
            <Num label="Target range: max kcal" value={settings.nutrition.kcalMax} onCommit={setNutrition('kcalMax')} />
            <Num label="Protein min (g)" value={settings.nutrition.proteinMin} onCommit={setNutrition('proteinMin')} />
            <Num label="Protein max (g)" value={settings.nutrition.proteinMax} onCommit={setNutrition('proteinMax')} />
            <Num label="Fat min (g)" value={settings.nutrition.fatMin} onCommit={setNutrition('fatMin')} />
            <Num label="Fat max (g)" value={settings.nutrition.fatMax} onCommit={setNutrition('fatMax')} />
          </div>
          <p className="xs muted">Carbs fill whatever calories remain.</p>
          <h3>Weight gain target ({settings.units}/week)</h3>
          <div className="grid cols-2">
            <Num
              label="Min gain"
              value={settings.adjustment.gainMinPerWeek}
              onCommit={(v) => v !== null && set((s) => ({ ...s, adjustment: { ...s.adjustment, gainMinPerWeek: v } }))}
            />
            <Num
              label="Max gain"
              value={settings.adjustment.gainMaxPerWeek}
              onCommit={(v) => v !== null && set((s) => ({ ...s, adjustment: { ...s.adjustment, gainMaxPerWeek: v } }))}
            />
            <Num
              label="Adjust by (min kcal)"
              value={settings.adjustment.kcalStepMin}
              onCommit={(v) => v !== null && set((s) => ({ ...s, adjustment: { ...s.adjustment, kcalStepMin: v } }))}
            />
            <Num
              label="Adjust by (max kcal)"
              value={settings.adjustment.kcalStepMax}
              onCommit={(v) => v !== null && set((s) => ({ ...s, adjustment: { ...s.adjustment, kcalStepMax: v } }))}
            />
          </div>
        </Section>

        <Section title="Units & rest timer">
          <div className="row spread">
            <span>Units</span>
            <div className="segmented" role="group" aria-label="Units">
              {(['lb', 'kg'] as const).map((u) => (
                <button key={u} aria-pressed={settings.units === u} onClick={() => u !== settings.units && setPending({ kind: 'units', to: u })}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="grid cols-2">
            <Num
              label="Default rest (s)"
              value={settings.timer.defaultRestSec}
              onCommit={(v) => v !== null && set((s) => ({ ...s, timer: { ...s.timer, defaultRestSec: Math.max(0, v) } }))}
            />
            <Num
              label={`Weight step (${settings.units})`}
              value={settings.timer.weightStep}
              onCommit={(v) => v !== null && v > 0 && set((s) => ({ ...s, timer: { ...s.timer, weightStep: v } }))}
            />
          </div>
          <div className="row spread">
            <span>When rest ends</span>
            <div className="segmented" role="group" aria-label="When rest ends">
              <button aria-pressed={settings.timer.autoAdvance} onClick={() => set((s) => ({ ...s, timer: { ...s.timer, autoAdvance: true } }))}>
                Auto-advance
              </button>
              <button aria-pressed={!settings.timer.autoAdvance} onClick={() => set((s) => ({ ...s, timer: { ...s.timer, autoAdvance: false } }))}>
                Wait for tap
              </button>
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.timer.sound} onChange={(e) => set((s) => ({ ...s, timer: { ...s.timer, sound: e.target.checked } }))} />
            Beep in the last 3 seconds and when rest ends
          </label>
        </Section>

        <Section title="Backup" subtitle="Firebase's free plan has no automatic backups. Export one now and then.">
          <p className="small">
            Last backup:{' '}
            <strong style={{ color: daysSinceBackup === null || daysSinceBackup > 30 ? 'var(--caution)' : undefined }}>
              {daysSinceBackup === null ? 'never' : daysSinceBackup === 0 ? 'today' : `${daysSinceBackup} days ago`}
            </strong>
          </p>
          <div className="row wrap">
            <button className="btn primary sm" onClick={() => void exportJson()}>
              Export backup (JSON)
            </button>
            <button className="btn sm" onClick={() => fileInput.current?.click()}>
              Restore from backup…
            </button>
            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} />
          </div>
          <div className="row wrap">
            <span className="small muted">CSV:</span>
            <button className="btn sm ghost" onClick={() => void exportCsv('workouts')}>
              Workouts
            </button>
            <button className="btn sm ghost" onClick={() => void exportCsv('nutrition')}>
              Nutrition
            </button>
            <button className="btn sm ghost" onClick={() => void exportCsv('weight')}>
              Weight
            </button>
          </div>
        </Section>

        <Section title="Sample data" subtitle="About 8 weeks of made-up workouts, meals and weigh-ins, to see the dashboard working.">
          {sampleDays.length + sampleSessions.length > 0 ? (
            <>
              <p className="small">
                <span className="badge caution">Sample data loaded</span> {sampleDays.length} days, {sampleSessions.length} workouts.
              </p>
              <button className="btn sm danger" style={{ alignSelf: 'flex-start' }} onClick={() => setPending({ kind: 'remove-sample' })}>
                Remove sample data
              </button>
            </>
          ) : (
            <button
              className="btn sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => (hasRealData ? setPending({ kind: 'sample-overwrite' }) : loadSample())}
            >
              Load sample data
            </button>
          )}
        </Section>

        <Section title="Account">
          <p className="small muted">{auth.currentUser?.email}</p>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => void signOut(auth)}>
            Sign out
          </button>
        </Section>
      </div>

      {pending?.kind === 'units' && (
        <Confirm
          title={`Switch to ${pending.to}?`}
          message={`Every stored weight (sets, bodyweight, gain target, weight step) will be converted from ${settings.units} to ${pending.to}. This rewrites your data once.`}
          confirmLabel={`Convert to ${pending.to}`}
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'import' && (
        <Confirm
          title="Restore this backup?"
          message={`It has ${pending.file.days.length} days and ${pending.file.sessions.length} workouts, exported ${new Date(pending.file.exportedAt).toLocaleDateString()}. Your settings and plan, and any days or workouts with the same dates/ids, will be replaced.`}
          confirmLabel="Restore"
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'sample-overwrite' && (
        <Confirm
          title="Add sample data?"
          message="You already have real data. Sample data only fills dates without real entries and never overwrites them. It's tagged so you can remove it later."
          confirmLabel="Add sample data"
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'remove-sample' && (
        <Confirm
          title="Remove sample data?"
          message="Only entries created by “Load sample data” are deleted. Your real data is untouched."
          confirmLabel="Remove"
          danger
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function Num({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number | null) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <NumberInput value={value} onCommit={onCommit} />
    </label>
  );
}
