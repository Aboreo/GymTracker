import { useSyncExternalStore } from 'react';
import { opCounter, syncStatus, type SyncState } from '../api';

const LABEL: Record<SyncState, [string, string]> = {
  saved: ['Saved', 'good'],
  saving: ['Saving…', 'caution'],
  offline: ['Offline – will sync', 'caution'],
  error: ['Not saved – check connection', 'bad'],
};

export function SyncIndicator() {
  const state = useSyncExternalStore(syncStatus.subscribe, syncStatus.get);
  const [text, tone] = LABEL[state];
  return (
    <span className="sync" role="status" aria-live="polite">
      <span className={`dot ${tone}`} />
      {text}
    </span>
  );
}

/** Development only: approximate Firestore reads/writes since the page loaded. */
export function DevCounter() {
  const c = useSyncExternalStore(opCounter.subscribe, opCounter.get);
  return (
    <div className="devcounter" aria-hidden="true">
      R {c.reads} · W {c.writes}
    </div>
  );
}
