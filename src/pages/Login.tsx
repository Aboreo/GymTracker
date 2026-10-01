import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { auth, usingEmulators } from '../firebase';

export function Login() {
  const [email, setEmail] = useState(usingEmulators ? 'dev@gymplan.local' : '');
  const [password, setPassword] = useState(usingEmulators ? 'devpass123' : '');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(
        code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')
          ? 'Email or password is incorrect.'
          : code.includes('network')
            ? 'No connection. Signing in needs signal the first time.'
            : code.includes('admin-restricted') || code.includes('operation-not-allowed')
              ? 'New sign-ups are turned off for this app.'
              : `Couldn't sign in (${code || 'unknown error'}).`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card" style={{ width: '100%', maxWidth: 380 }} onSubmit={submit}>
        <div className="stack" style={{ gap: 4 }}>
          <h1>Gymplan</h1>
          <p className="muted small">{mode === 'signin' ? 'Sign in to continue.' : 'Create your account (one-time).'}</p>
        </div>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'First time? Create account' : 'Have an account? Sign in'}
        </button>
        {usingEmulators && (
          <p className="xs muted">
            Using local emulators. Run <code>npm run dev:user</code> once to create the dev account.
          </p>
        )}
      </form>
    </div>
  );
}
