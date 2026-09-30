import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Nav } from './components/Nav';
import { DevCounter, SyncIndicator } from './components/SyncIndicator';
import { auth } from './firebase';
import { Dashboard } from './pages/Dashboard';
import { FocusMode } from './pages/FocusMode';
import { Log } from './pages/Log';
import { Login } from './pages/Login';
import { PlanSettings } from './pages/PlanSettings';
import { Today } from './pages/Today';
import { Workout } from './pages/Workout';
import { useRoute } from './router';
import { AppDataProvider } from './state/AppData';

function Splash() {
  return (
    <div className="main" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
      <p className="muted">Loading…</p>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <Splash />;
  if (user === null) return <Login />;
  return (
    <AppDataProvider uid={user.uid} loading={<Splash />}>
      <Shell />
    </AppDataProvider>
  );
}

function Shell() {
  const route = useRoute();
  if (route === 'focus') return <FocusMode />;
  return (
    <div className="app">
      <Nav route={route} />
      <main className="main">
        <div className="mobile-sync">
          <SyncIndicator />
        </div>
        {route === 'today' && <Today />}
        {route === 'workout' && <Workout />}
        {route === 'log' && <Log />}
        {route === 'dashboard' && <Dashboard />}
        {route === 'plan' && <PlanSettings />}
      </main>
      {import.meta.env.DEV && <DevCounter />}
    </div>
  );
}
