// One place that holds the signed-in user's data in memory. Screens read from here and never
// query Firestore themselves, so re-renders and chart filter changes cost zero reads.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as api from '../api';
import { defaultSettings } from '../data/defaultPlan';
import { addDays, isISODate, todayISO } from '../logic/dates';
import { normalizeFoods } from '../logic/diet';
import { normalizeSettings } from '../logic/settings';
import { navigate, parseHash, pathWith, useLocation } from '../router';
import type { DayEntry, ISODate, SavedFood, Settings, WorkoutSession } from '../shared/types';

export const LIVE_WINDOW_DAYS = 365;

interface AppData {
  uid: string;
  settings: Settings;
  /** Every loaded day, keyed by date. */
  days: Map<ISODate, DayEntry>;
  /** Every loaded session, newest first. */
  sessions: WorkoutSession[];
  selectedDate: ISODate;
  setSelectedDate: (d: ISODate) => void;
  /** Older-than-12-months data has been loaded (once, on demand). */
  allTimeLoaded: boolean;
  loadAllTime: () => Promise<void>;
  updateSettings: (fn: (s: Settings) => Settings) => void;
  saveDay: (d: DayEntry) => void;
  saveSession: (s: WorkoutSession) => void;
  deleteSession: (id: string) => void;
  /** Food library: null until loaded, 'error' if it couldn't be loaded (saving is then disabled). */
  foods: SavedFood[] | null | 'error';
  loadFoods: () => void;
  saveFoods: (items: SavedFood[]) => void;
}

const Ctx = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData outside AppDataProvider');
  return v;
}

/**
 * The selected date, kept in step with the URL: a ?date= param (deep link, Back) selects that
 * date, and changing the date on a screen whose URL carries one updates it in place.
 */
export function useSelectedDate(): [ISODate, (d: ISODate) => void] {
  const { selectedDate, setSelectedDate } = useAppData();
  const loc = useLocation();
  const urlDate = loc.params.get('date');
  useEffect(() => {
    if (isISODate(urlDate)) setSelectedDate(urlDate);
  }, [urlDate, setSelectedDate]);
  const set = (d: ISODate) => {
    setSelectedDate(d);
    if (loc.params.has('date')) navigate(pathWith(loc, { params: { date: d } }), { replace: true });
  };
  return [selectedDate, set];
}

export function emptyDay(date: ISODate): DayEntry {
  return { date, kcal: null, protein: null, fat: null, carbs: null, carbsManual: false, weight: null, updatedAt: 0, sample: false };
}

export function AppDataProvider({ uid, children, loading }: { uid: string; children: ReactNode; loading: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [liveDays, setLiveDays] = useState<DayEntry[] | null>(null);
  const [liveSessions, setLiveSessions] = useState<WorkoutSession[] | null>(null);
  const [olderDays, setOlderDays] = useState<DayEntry[]>([]);
  const [olderSessions, setOlderSessions] = useState<WorkoutSession[]>([]);
  const [allTimeLoaded, setAllTimeLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<ISODate>(() => {
    const d = parseHash(window.location.hash).params.get('date');
    return isISODate(d) ? d : todayISO();
  });
  const [error, setError] = useState<string | null>(null);
  // Our own latest writes, shown immediately. Firestore's listener echoes them back a moment
  // later; until then, a second quick edit must build on the first, not on the stale snapshot.
  const [localDays, setLocalDays] = useState<Map<ISODate, DayEntry>>(() => new Map());
  const [localSessions, setLocalSessions] = useState<Map<string, WorkoutSession | null>>(() => new Map());
  const windowStart = useMemo(() => addDays(todayISO(), -LIVE_WINDOW_DAYS), []);
  const [foods, setFoods] = useState<SavedFood[] | null | 'error'>(null);
  const [foodsRequested, setFoodsRequested] = useState(false);

  // The food library is only loaded when a screen needs it, and only once per app launch.
  // Old "saved items" live in the same document; normalizeFoods upgrades them (one write, once).
  useEffect(() => {
    if (!foodsRequested) return;
    api.loadFoods(uid).then(
      (raw) => {
        const { foods: list, changed } = normalizeFoods(raw);
        if (changed) api.saveFoods(uid, list);
        setFoods(list);
      },
      () => setFoods('error'),
    );
  }, [uid, foodsRequested]);

  useEffect(() => {
    const onErr = (e: Error) => setError(e.message);
    const unsubs = [
      api.listenSettings(
        uid,
        (s) => {
          if (api.hasQueuedSettings()) return; // local edits win until they're written
          const next = s ? normalizeSettings(s) : defaultSettings();
          if (!s) api.saveSettings(uid, next);
          setSettings(next);
        },
        onErr,
      ),
      api.listenDays(uid, windowStart, setLiveDays, onErr),
      api.listenSessions(uid, windowStart, setLiveSessions, onErr),
    ];
    return () => {
      unsubs.forEach((u) => u());
      api.flushSettings();
    };
  }, [uid, windowStart]);

  const loadAllTime = useCallback(async () => {
    if (allTimeLoaded) return;
    const [d, s] = await Promise.all([api.fetchDaysBefore(uid, windowStart), api.fetchSessionsBefore(uid, windowStart)]);
    setOlderDays(d);
    setOlderSessions(s);
    setAllTimeLoaded(true);
  }, [uid, windowStart, allTimeLoaded]);

  const days = useMemo(() => {
    const m = new Map<ISODate, DayEntry>();
    for (const d of olderDays) m.set(d.date, d);
    for (const d of liveDays ?? []) m.set(d.date, d);
    for (const [date, d] of localDays) if (d.updatedAt >= (m.get(date)?.updatedAt ?? 0)) m.set(date, d);
    return m;
  }, [olderDays, liveDays, localDays]);

  const sessions = useMemo(() => {
    const byId = new Map<string, WorkoutSession>();
    for (const s of olderSessions) byId.set(s.id, s);
    for (const s of liveSessions ?? []) byId.set(s.id, s);
    for (const [id, s] of localSessions) {
      if (s === null) byId.delete(id);
      else if (s.updatedAt >= (byId.get(id)?.updatedAt ?? 0)) byId.set(id, s);
    }
    return [...byId.values()].sort((a, b) => (a.date === b.date ? b.startedAt - a.startedAt : a.date < b.date ? 1 : -1));
  }, [olderSessions, liveSessions, localSessions]);

  const value = useMemo<AppData | null>(
    () =>
      settings && liveDays && liveSessions
        ? {
            uid,
            settings,
            days,
            sessions,
            selectedDate,
            setSelectedDate,
            allTimeLoaded,
            loadAllTime,
            // Applies locally at once; the write is batched (see api.queueSettings).
            updateSettings: (fn) => {
              const next = fn(settings);
              setSettings(next);
              api.queueSettings(uid, next);
            },
            saveDay: (d) => {
              const next = { ...d, updatedAt: Date.now() };
              setLocalDays((m) => new Map(m).set(next.date, next));
              api.saveDay(uid, next);
            },
            saveSession: (s) => {
              const next = { ...s, updatedAt: Date.now() };
              setLocalSessions((m) => new Map(m).set(next.id, next));
              api.saveSession(uid, next);
            },
            deleteSession: (id) => {
              setLocalSessions((m) => new Map(m).set(id, null));
              api.deleteSession(uid, id);
            },
            foods,
            loadFoods: () => setFoodsRequested(true),
            saveFoods: (items) => {
              setFoods(items);
              api.saveFoods(uid, items);
            },
          }
        : null,
    [uid, settings, liveDays, liveSessions, days, sessions, selectedDate, allTimeLoaded, loadAllTime, foods],
  );

  if (error && !value) {
    return (
      <div className="main">
        <div className="page">
          <div className="card">
            <h2>Couldn't load your data</h2>
            <p className="muted small">{error}</p>
          </div>
        </div>
      </div>
    );
  }
  if (!value) return <>{loading}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
