// The only module that talks to Firestore.
//
// Writes are fire-and-forget: with the persistent cache a write is applied locally at once and
// its promise only settles when the server acknowledges it (possibly much later, when signal
// returns). We track those promises to drive the "Saving… / Saved / Offline – will sync" indicator.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { DayEntry, ExportFile, ISODate, SavedFood, Settings, WorkoutSession } from './shared/types';

// ---------------------------------------------------------------------------------------------
// Tiny observable store helper (used by the sync indicator and the dev op counter)

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: (): T => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Dev-only read/write counter (approximates billed operations: cache hits are free,
// an empty query result still costs 1 read)

export interface OpCounts {
  reads: number;
  writes: number;
}
export const opCounter = createStore<OpCounts>({ reads: 0, writes: 0 });

function countReads(n: number) {
  if (!import.meta.env.DEV || n === 0) return;
  const c = opCounter.get();
  opCounter.set({ ...c, reads: c.reads + n });
}
function countWrites(n: number) {
  if (!import.meta.env.DEV || n === 0) return;
  const c = opCounter.get();
  opCounter.set({ ...c, writes: c.writes + n });
}
function countSnapshot(snap: QuerySnapshot<DocumentData>) {
  if (snap.metadata.fromCache) return;
  countReads(Math.max(1, snap.docChanges().length));
}

// ---------------------------------------------------------------------------------------------
// Sync status

export type SyncState = 'saved' | 'saving' | 'offline' | 'error';
export const syncStatus = createStore<SyncState>('saved');

let pending = 0;
let oldestPendingAt = 0;
let lastError = false;
const OFFLINE_AFTER_MS = 4000;

function recomputeSync() {
  if (lastError) return syncStatus.set('error');
  if (pending === 0) return syncStatus.set('saved');
  const stuck = Date.now() - oldestPendingAt > OFFLINE_AFTER_MS;
  syncStatus.set(!navigator.onLine || stuck ? 'offline' : 'saving');
}
setInterval(recomputeSync, 1000);
window.addEventListener('online', recomputeSync);
window.addEventListener('offline', recomputeSync);

function track(p: Promise<unknown>, writes = 1): void {
  countWrites(writes);
  if (pending === 0) oldestPendingAt = Date.now();
  pending++;
  lastError = false;
  recomputeSync();
  p.catch((err: unknown) => {
    console.error('Firestore write failed', err);
    lastError = true;
  }).finally(() => {
    pending--;
    recomputeSync();
  });
}

// ---------------------------------------------------------------------------------------------
// Paths

const settingsRef = (uid: string) => doc(db, 'users', uid, 'settings', 'main');
const foodsRef = (uid: string) => doc(db, 'users', uid, 'settings', 'foods');
const daysCol = (uid: string) => collection(db, 'users', uid, 'days');
const sessionsCol = (uid: string) => collection(db, 'users', uid, 'sessions');
const dayRef = (uid: string, date: ISODate) => doc(daysCol(uid), date);
const sessionRef = (uid: string, id: string) => doc(sessionsCol(uid), id);

// ---------------------------------------------------------------------------------------------
// Settings (includes the plan)

/** Calls back with null when the document definitely doesn't exist on the server. */
export function listenSettings(
  uid: string,
  onData: (s: Settings | null) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    settingsRef(uid),
    (snap) => {
      if (!snap.metadata.fromCache) countReads(1);
      if (snap.exists()) onData(snap.data() as Settings);
      else if (!snap.metadata.fromCache) onData(null);
      // Missing only in the cache (first launch offline): wait for the server.
    },
    onError,
  );
}

export function saveSettings(uid: string, settings: Settings): void {
  track(setDoc(settingsRef(uid), settings));
}

// Settings edits (e.g. typing a workout name) are batched: written 600ms after the last change,
// or immediately when the app is hidden/closed, so typing doesn't cost a write per keystroke.
let queued: { uid: string; settings: Settings } | null = null;
let queueTimer: ReturnType<typeof setTimeout> | undefined;

export function queueSettings(uid: string, settings: Settings): void {
  queued = { uid, settings };
  clearTimeout(queueTimer);
  queueTimer = setTimeout(flushSettings, 600);
}

export function flushSettings(): void {
  clearTimeout(queueTimer);
  if (queued) saveSettings(queued.uid, queued.settings);
  queued = null;
}

export const hasQueuedSettings = () => queued !== null;

window.addEventListener('pagehide', flushSettings);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSettings();
});

// ---------------------------------------------------------------------------------------------
// Saved items: every item in ONE document (1 read to load, 1 write per save)

/** Loads once (from the local cache when offline). Throws if neither server nor cache has it. */
export async function loadFoods(uid: string): Promise<SavedFood[]> {
  const snap = await getDoc(foodsRef(uid));
  if (!snap.metadata.fromCache) countReads(1);
  return (snap.data()?.items as SavedFood[] | undefined) ?? [];
}

export function saveFoods(uid: string, items: SavedFood[]): void {
  track(setDoc(foodsRef(uid), { items }));
}

// ---------------------------------------------------------------------------------------------
// Days and sessions: live listeners on a bounded window, plus a one-off load of older data

function listenFrom<T>(
  col: ReturnType<typeof collection>,
  fromDate: ISODate,
  onData: (items: T[]) => void,
  onError: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(col, where('date', '>=', fromDate)),
    (snap) => {
      countSnapshot(snap);
      onData(snap.docs.map((d) => d.data() as T));
    },
    onError,
  );
}

async function fetchBefore<T>(col: ReturnType<typeof collection>, beforeDate: ISODate): Promise<T[]> {
  const snap = await getDocs(query(col, where('date', '<', beforeDate)));
  countSnapshot(snap);
  return snap.docs.map((d) => d.data() as T);
}

export const listenDays = (uid: string, from: ISODate, cb: (d: DayEntry[]) => void, err: (e: Error) => void) =>
  listenFrom<DayEntry>(daysCol(uid), from, cb, err);

export const listenSessions = (
  uid: string,
  from: ISODate,
  cb: (s: WorkoutSession[]) => void,
  err: (e: Error) => void,
) => listenFrom<WorkoutSession>(sessionsCol(uid), from, cb, err);

export const fetchDaysBefore = (uid: string, before: ISODate) => fetchBefore<DayEntry>(daysCol(uid), before);
export const fetchSessionsBefore = (uid: string, before: ISODate) =>
  fetchBefore<WorkoutSession>(sessionsCol(uid), before);

/** One document per calendar day: re-entering a day overwrites the same document. */
export function saveDay(uid: string, day: DayEntry): void {
  track(setDoc(dayRef(uid, day.date), day));
}

export function saveSession(uid: string, session: WorkoutSession): void {
  track(setDoc(sessionRef(uid, session.id), session));
}

export function deleteSession(uid: string, id: string): void {
  track(deleteDoc(sessionRef(uid, id)));
}

// ---------------------------------------------------------------------------------------------
// Bulk operations: export/import, sample data, unit conversion

const BATCH_LIMIT = 450;

type BulkOp = { ref: DocumentReference; data: DocumentData | null };

async function runBulk(ops: BulkOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    for (const op of chunk) {
      if (op.data) batch.set(op.ref, op.data);
      else batch.delete(op.ref);
    }
    const p = batch.commit();
    track(p, chunk.length);
    // Don't await the server (offline would hang); the batch is already applied locally.
  }
}

/** Bulk writes are stamped as newest, so they win over any older copy held in app state. */
export function writeMany(uid: string, days: DayEntry[], sessions: WorkoutSession[]): Promise<void> {
  const now = Date.now();
  days = days.map((d) => ({ ...d, updatedAt: now }));
  sessions = sessions.map((s) => ({ ...s, updatedAt: now }));
  return runBulk([
    ...days.map((d) => ({ ref: dayRef(uid, d.date), data: d as unknown as DocumentData })),
    ...sessions.map((s) => ({ ref: sessionRef(uid, s.id), data: s as unknown as DocumentData })),
  ]);
}

export function deleteMany(uid: string, dayIds: ISODate[], sessionIds: string[]): Promise<void> {
  return runBulk([
    ...dayIds.map((id) => ({ ref: dayRef(uid, id), data: null })),
    ...sessionIds.map((id) => ({ ref: sessionRef(uid, id), data: null })),
  ]);
}

/** Reads everything once (including data older than the live window) for a backup. */
export async function exportAll(uid: string): Promise<ExportFile> {
  const [settingsSnap, daysSnap, sessionsSnap, foods] = await Promise.all([
    getDoc(settingsRef(uid)),
    getDocs(daysCol(uid)),
    getDocs(sessionsCol(uid)),
    loadFoods(uid),
  ]);
  countReads(1);
  countSnapshot(daysSnap);
  countSnapshot(sessionsSnap);
  return {
    app: 'gymplan',
    version: 1,
    exportedAt: Date.now(),
    settings: settingsSnap.data() as Settings,
    days: daysSnap.docs.map((d) => d.data() as DayEntry),
    sessions: sessionsSnap.docs.map((d) => d.data() as WorkoutSession),
    foods,
  };
}

/**
 * Restores a backup. Documents with the same id are overwritten; others are left alone.
 * Saved items (file.foods) are restored by the caller through AppData, so its cache stays current.
 */
export async function importAll(uid: string, file: ExportFile): Promise<void> {
  saveSettings(uid, file.settings);
  await writeMany(uid, file.days, file.sessions);
}
