// Minimal hash router. Paths look like #/log/weight?date=2026-09-30&from=today:
// a top-level route, an optional sub-section, and query params. Real URLs (not hidden state)
// so deep links, reloads and the browser Back button all work.
import { useMemo, useSyncExternalStore } from 'react';

export const ROUTES = ['today', 'workout', 'focus', 'log', 'dashboard', 'plan', 'settings'] as const;
export type Route = (typeof ROUTES)[number];

/** Sub-sections of routes that have a segmented control. The first one is the default. */
export const SUBS = {
  log: ['diet', 'weight'],
  plan: ['workouts', 'library', 'foods', 'nutrition'],
  settings: ['account', 'rest', 'prefs', 'data'],
} as const satisfies Partial<Record<Route, readonly string[]>>;

export interface Loc {
  route: Route;
  /** Sub-section for routes in SUBS (always valid, defaulted), otherwise null. */
  sub: string | null;
  params: URLSearchParams;
}

export function parseHash(hash: string): Loc {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [r, s] = path.split('/');
  const route = (ROUTES as readonly string[]).includes(r) ? (r as Route) : 'today';
  const subs = (SUBS as Partial<Record<Route, readonly string[]>>)[route];
  const sub = subs ? (s && subs.includes(s) ? s : subs[0]) : null;
  return { route, sub, params: new URLSearchParams(query) };
}

const CHANGE = 'gymplan:navigate';

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  window.addEventListener(CHANGE, cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener(CHANGE, cb);
  };
}

export function useLocation(): Loc {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseHash(hash), [hash]);
}

export function useRoute(): Route {
  return useLocation().route;
}

/**
 * Go to a path such as "/log/diet?date=2026-09-30". Pushes a history entry marked as in-app,
 * so a back control knows it can safely call history.back(). `replace` swaps the current
 * entry instead (used for segment switches and date changes, so Back doesn't step through them).
 */
export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (opts.replace) history.replaceState(history.state, '', url);
  else history.pushState({ inApp: true }, '', url);
  window.dispatchEvent(new Event(CHANGE));
}

/** Build "/route/sub?k=v" from a location, overriding some params (null removes one). */
export function pathWith(loc: Loc, changes: { sub?: string; params?: Record<string, string | null> } = {}): string {
  const params = new URLSearchParams(loc.params);
  for (const [k, v] of Object.entries(changes.params ?? {})) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  const sub = changes.sub ?? loc.sub;
  const q = params.toString();
  return `/${loc.route}${sub ? `/${sub}` : ''}${q ? `?${q}` : ''}`;
}

/** Pop the history entry when we got here from inside the app; otherwise replace it with `path`. */
export function goBackOr(path: string) {
  if ((history.state as { inApp?: boolean } | null)?.inApp) history.back();
  else navigate(path, { replace: true });
}

export const backToToday = () => goBackOr('/today');
