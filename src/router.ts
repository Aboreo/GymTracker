// Minimal hash router: #/today, #/workout, #/focus, #/log, #/dashboard, #/plan.
import { useSyncExternalStore } from 'react';

export const ROUTES = ['today', 'workout', 'focus', 'log', 'dashboard', 'plan'] as const;
export type Route = (typeof ROUTES)[number];

function current(): Route {
  const r = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES as readonly string[]).includes(r) ? (r as Route) : 'today';
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, current);
}

export function navigate(r: Route) {
  window.location.hash = `/${r}`;
}
