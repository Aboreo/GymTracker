import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from 'firebase/auth';
import { useRef, useState, type FormEvent } from 'react';
import * as api from '../api';
import { Icon } from '../components/Icon';
import { Confirm, Link, Num, Section, SubNav } from '../components/ui';
import { generateSampleData } from '../data/sampleData';
import { auth } from '../firebase';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { nutritionCsv, parseBackup, saveFile, weightCsv, workoutsCsv } from '../logic/backup';
import { todayISO } from '../logic/dates';
import { convertAllData } from '../logic/units';
import { useLocation } from '../router';
import { normalizeFoods } from '../logic/diet';
import type { ExportFile, RestType, Settings as SettingsT, Units } from '../shared/types';
import { useAppData } from '../state/AppData';

type Pending =
  | { kind: 'import'; file: ExportFile }
  | { kind: 'sample-overwrite' }
  | { kind: 'remove-sample' }
  | null;

export function Settings() {
  const { sub } = useLocation();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>
      <SubNav
        label="Settings section"
        items={[
          { sub: 'account', label: 'Account' },
          { sub: 'rest', label: 'Rest' },
          { sub: 'prefs', label: 'Preferences' },
          { sub: 'data', label: 'Data' },
        ]}
      />
      {message && (
        <div className="card row spread" role="status">
          <span className="small">{message}</span>
          <button className="btn sm ghost" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </div>
      )}
      {sub === 'rest' ? (
        <RestSettings />
      ) : sub === 'prefs' ? (
        <Preferences onMessage={setMessage} />
      ) : sub === 'data' ? (
        <DataBackup onMessage={setMessage} />
      ) : (
        <Account />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Account() {
  const email = auth.currentUser?.email ?? '';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    setBusy(true);
    setStatus(null);
    try {
      // Firebase requires a recent sign-in before a password change.
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, current));
      await updatePassword(user, next);
      setCurrent('');
      setNext('');
      setStatus({ ok: true, text: 'Password changed.' });
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setStatus({
        ok: false,
        text: code.includes('invalid-credential') || code.includes('wrong-password')
          ? 'Current password is incorrect.'
          : code.includes('weak-password')
            ? 'The new password is too weak (at least 6 characters).'
            : code.includes('network')
              ? 'Changing your password needs a connection.'
              : `Couldn't change password (${code || 'unknown error'}).`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section title="Signed in">
        <p className="small">{email}</p>
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => void signOut(auth)}>
          Sign out
        </button>
      </Section>
      <Section title="Change password">
        <form className="stack" style={{ maxWidth: 380 }} onSubmit={(e) => void changePassword(e)}>
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <label className="field">
            <span>Current password</span>
            <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </label>
          <label className="field">
            <span>New password</span>
            <input className="input" type="password" autoComplete="new-password" minLength={6} value={next} onChange={(e) => setNext(e.target.value)} required />
          </label>
          {status && (
            <p className="small" role="status" style={{ color: status.ok ? 'var(--good)' : 'var(--bad)' }}>
              {status.text}
            </p>
          )}
          <button className="btn sm primary" style={{ alignSelf: 'flex-start' }} disabled={busy}>
            {busy ? 'Please wait…' : 'Change password'}
          </button>
        </form>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

const REST_LABEL: Record<RestType, string> = { compound: 'Compound (s)', isolation: 'Isolation (s)', abs: 'Abs (s)' };

function RestSettings() {
  const { settings, updateSettings } = useAppData();
  const t = settings.timer;
  const setTimer = (patch: Partial<SettingsT['timer']>) => updateSettings((s) => ({ ...s, timer: { ...s.timer, ...patch } }));

  return (
    <>
      <Section title="Default rest" subtitle="Used for new blocks and custom workouts, by each exercise's rest type (set in Plan → Exercises).">
        <div className="grid cols-3">
          {(Object.keys(REST_LABEL) as RestType[]).map((k) => (
            <Num
              key={k}
              label={REST_LABEL[k]}
              value={t.restSec[k]}
              onCommit={(v) => v !== null && setTimer({ restSec: { ...t.restSec, [k]: Math.max(0, v) } })}
            />
          ))}
        </div>
      </Section>
      <Section title="Rest timer">
        <div className="row spread wrap">
          <span>When rest ends</span>
          <div className="segmented" role="group" aria-label="When rest ends">
            <button aria-pressed={t.autoAdvance} onClick={() => setTimer({ autoAdvance: true })}>
              Auto-advance
            </button>
            <button aria-pressed={!t.autoAdvance} onClick={() => setTimer({ autoAdvance: false })}>
              Wait for tap
            </button>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={t.sound} onChange={(e) => setTimer({ sound: e.target.checked })} />
          Sound: beep in the last 3 seconds and when rest ends
        </label>
        <label className="check">
          <input type="checkbox" checked={t.vibration} onChange={(e) => setTimer({ vibration: e.target.checked })} />
          <span>
            Vibration
            <span className="xs muted" style={{ display: 'block' }}>
              Android and some desktops only: iPhone browsers can't vibrate.
            </span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={t.autoStartRest} onChange={(e) => setTimer({ autoStartRest: e.target.checked })} />
          Custom workouts: start the rest timer automatically after logging a set
        </label>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function Preferences({ onMessage }: { onMessage: (m: string) => void }) {
  const { settings, updateSettings, uid } = useAppData();
  const [pendingUnits, setPendingUnits] = useState<Units | null>(null);
  const [theme, setThemeState] = useState<Theme>(getTheme);

  function convertUnits(to: Units) {
    api
      .exportAll(uid)
      .then((all) => {
        const converted = convertAllData(settings, all.days, all.sessions, to);
        void api.writeMany(uid, converted.days, converted.sessions);
        updateSettings(() => converted.settings);
        onMessage(`Converted everything to ${to}.`);
      })
      .catch((e: Error) => onMessage(`Conversion needs a connection: ${e.message}`));
    setPendingUnits(null);
  }

  return (
    <>
      <Section title="Units & weights">
        <div className="row spread">
          <span>Units</span>
          <div className="segmented" role="group" aria-label="Units">
            {(['lb', 'kg'] as const).map((u) => (
              <button key={u} aria-pressed={settings.units === u} onClick={() => u !== settings.units && setPendingUnits(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 220 }}>
          <Num
            label={`Weight step (${settings.units})`}
            value={settings.timer.weightStep}
            onCommit={(v) => v !== null && v > 0 && updateSettings((s) => ({ ...s, timer: { ...s.timer, weightStep: v } }))}
          />
        </div>
      </Section>
      <Section title="Appearance" subtitle="Saved on this device only.">
        <div className="segmented" role="group" aria-label="Theme" style={{ alignSelf: 'flex-start' }}>
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              aria-pressed={theme === t}
              onClick={() => {
                setTheme(t);
                setThemeState(t);
              }}
              style={{ textTransform: 'capitalize' }}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <FoodLibraryLink />

      {pendingUnits && (
        <Confirm
          title={`Switch to ${pendingUnits}?`}
          message={`Every stored weight (sets, bodyweight, gain target, weight step) will be converted from ${settings.units} to ${pendingUnits}. This rewrites your data once.`}
          confirmLabel={`Convert to ${pendingUnits}`}
          onConfirm={() => convertUnits(pendingUnits)}
          onCancel={() => setPendingUnits(null)}
        />
      )}
    </>
  );
}

function FoodLibraryLink() {
  return (
    <Section title="Food library" subtitle="Foods you log often, with values per serving.">
      <Link to="/plan/foods" className="btn" style={{ alignSelf: 'flex-start' }}>
        Open food library <Icon name="right" size={16} />
      </Link>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------

function DataBackup({ onMessage }: { onMessage: (m: string) => void }) {
  const app = useAppData();
  const { settings, updateSettings, uid } = app;
  const [now] = useState(Date.now);
  const [pending, setPending] = useState<Pending>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const days = [...app.days.values()];
  const sampleDays = days.filter((d) => d.sample);
  const sampleSessions = app.sessions.filter((s) => s.sample);
  const daysSinceBackup = settings.lastBackupAt ? Math.floor((now - settings.lastBackupAt) / 86_400_000) : null;
  const hasRealData = days.some((d) => !d.sample) || app.sessions.some((s) => !s.sample);

  async function exportJson() {
    try {
      const file = await api.exportAll(uid);
      await saveFile(`gymplan-backup-${todayISO()}.json`, JSON.stringify(file, null, 1), 'application/json');
      updateSettings((s) => ({ ...s, lastBackupAt: Date.now() }));
      onMessage('Backup exported.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') onMessage(`Export failed: ${(e as Error).message}`);
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
      if ((e as Error).name !== 'AbortError') onMessage(`Export failed: ${(e as Error).message}`);
    }
  }

  async function onImportFile(f: File | undefined) {
    if (!f) return;
    try {
      setPending({ kind: 'import', file: parseBackup(await f.text()) });
    } catch (e) {
      onMessage((e as Error).message);
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  function loadSample() {
    const realDays = new Set(days.filter((d) => !d.sample).map((d) => d.date));
    const realSessions = new Set(app.sessions.filter((s) => !s.sample).map((s) => s.date));
    const data = generateSampleData(settings, todayISO(), realDays, realSessions);
    void api.writeMany(uid, data.days, data.sessions);
    updateSettings((s) => ({ ...s, hasSampleData: true }));
    onMessage(`Loaded ${data.days.length} sample days and ${data.sessions.length} sample workouts.`);
  }

  function confirmPending() {
    if (!pending) return;
    if (pending.kind === 'import') {
      void api.importAll(uid, pending.file);
      if (pending.file.foods) app.saveFoods(normalizeFoods(pending.file.foods).foods);
      onMessage(`Restored ${pending.file.days.length} days and ${pending.file.sessions.length} workouts.`);
    } else if (pending.kind === 'sample-overwrite') {
      loadSample();
    } else if (pending.kind === 'remove-sample') {
      void api.deleteMany(uid, sampleDays.map((d) => d.date), sampleSessions.map((s) => s.id));
      updateSettings((s) => ({ ...s, hasSampleData: false }));
      onMessage('Sample data removed.');
    }
    setPending(null);
  }

  return (
    <>
      <Section title="Backup" subtitle="Firebase's free plan has no automatic backups. Export one now and then.">
        <p className="small">
          Last backup:{' '}
          <strong style={{ color: daysSinceBackup === null || daysSinceBackup > 30 ? 'var(--caution)' : undefined }}>
            {daysSinceBackup === null ? 'never' : daysSinceBackup === 0 ? 'today' : `${daysSinceBackup} days ago`}
          </strong>
          <span className="muted"> · Today reminds you after 30 days.</span>
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

      <Section title="Sample data" subtitle="About 8 weeks of made-up workouts, meals and weigh-ins, to see the dashboard working. Tagged, so it can be removed without touching your real data.">
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
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => (hasRealData ? setPending({ kind: 'sample-overwrite' }) : loadSample())}>
            Load sample data
          </button>
        )}
      </Section>

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
    </>
  );
}
