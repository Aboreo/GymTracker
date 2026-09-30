import type { Route } from '../router';
import { Icon, type IconName } from './Icon';
import { SyncIndicator } from './SyncIndicator';

const ITEMS: { route: Route; label: string; icon: IconName }[] = [
  { route: 'today', label: 'Today', icon: 'today' },
  { route: 'workout', label: 'Workout', icon: 'workout' },
  { route: 'log', label: 'Log', icon: 'log' },
  { route: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { route: 'plan', label: 'Plan', icon: 'plan' },
];

export function Nav({ route }: { route: Route }) {
  const link = (i: (typeof ITEMS)[number]) => (
    <a key={i.route} href={`#/${i.route}`} aria-current={route === i.route ? 'page' : undefined}>
      <Icon name={i.icon} />
      <span>{i.label}</span>
    </a>
  );
  return (
    <>
      <nav className="sidebar" aria-label="Main">
        <div className="brand">Gymplan</div>
        {ITEMS.map(link)}
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
