import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const env = import.meta.env;

/**
 * In development we talk to the local Emulator Suite unless VITE_USE_EMULATORS=false,
 * so development never touches the real project or its quota. With no .env at all,
 * a "demo-" project id is used, which the emulators accept without any real project.
 */
export const usingEmulators = env.DEV && env.VITE_USE_EMULATORS !== 'false';

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: usingEmulators ? 'demo-gymplan' : env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

// Persistent sign-in. No popup/redirect resolver: email/password only (reliable in iOS Home Screen apps).
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});

// Offline-first: reads come from the local cache, writes queue and sync when back online.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
