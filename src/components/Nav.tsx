import { todayISO } from '../logic/dates';
import type { Route } from '../router';
import { useAppData } from '../state/AppData';
import { Icon, type IconName } from './Icon';
import { SyncIndicator } from './SyncIndicator';

const ITEMS: { route: Route; label: string; icon: IconName }[] = [
  { route: 'today', label: 'Today', icon: 'today' },
  { route: 'workout', label: 'Workout', icon: 'workout' },
  { route: 'log', label: 'Log', icon: 'log' },
  { route: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { route: 'plan', label: 'Plan', icon: 'plan' },
];
// Desktop only: on phone, Settings is the gear in the header (five tabs fit; six would be cramped).
const SETTINGS = { route: 'settings', label: 'Settings', icon: 'settings' } as const;

export function Nav({ route }: { route: Route }) {
  const { setSelectedDate } = useAppData();
  const link = (i: { route: Route; label: string; icon: IconName }) => (
    <a
      key={i.route}
      href={`#/${i.route}`}
      aria-current={route === i.route ? 'page' : undefined}
      onClick={(e) => {
        // Tapping Today again goes back to its root: today's date, scrolled to the top.
        if (i.route !== 'today' || route !== 'today') return;
        e.preventDefault();
        if (window.location.hash !== '#/today') history.replaceState(history.state, '', '#/today');
        setSelectedDate(todayISO());
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <Icon name={i.icon} />
      <span>{i.label}</span>
    </a>
  );
  return (
    <>
      <nav className="sidebar" aria-label="Main">
        <div className="brand">Gymplan</div>
        {ITEMS.map(link)}
        {link(SETTINGS)}
        <div className="sidebar-foot">
          <SyncIndicator />
        </div>
      </nav>
      <nav className="tabbar" aria-label="Main">
        {ITEMS.map(link)}
      </nav>
    </>
  );
}

/** Phone header row above every page: sync status and the Settings gear. */
export function MobileHeader({ route }: { route: Route }) {
  return (
    <div className="mobile-sync">
      <SyncIndicator />
      {route !== 'settings' && (
        <a href="#/settings" className="btn icon ghost" aria-label="Settings">
          <Icon name="settings" />
        </a>
      )}
    </div>
  );
}
