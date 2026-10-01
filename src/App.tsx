import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { MobileHeader, Nav } from './components/Nav';
import { DevCounter } from './components/SyncIndicator';
import { auth } from './firebase';
import { Dashboard } from './pages/Dashboard';
import { FocusMode } from './pages/FocusMode';
import { Log } from './pages/Log';
import { Login } from './pages/Login';
import { Plan } from './pages/Plan';
import { Settings } from './pages/Settings';
import { Today } from './pages/Today';
import { Workout } from './pages/Workout';
import { useRoute } from './router';
import { AppDataProvider } from './state/AppData';

function Splash() {
  return (
    <div className="center-screen">
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
        <MobileHeader route={route} />
        {route === 'today' && <Today />}
        {route === 'workout' && <Workout />}
        {route === 'log' && <Log />}
        {route === 'dashboard' && <Dashboard />}
        {route === 'plan' && <Plan />}
        {route === 'settings' && <Settings />}
      </main>
      {import.meta.env.DEV && <DevCounter />}
    </div>
  );
}
