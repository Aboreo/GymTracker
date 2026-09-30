// Security rules tests. Run with: npm run test:rules (starts the Firestore emulator for you).
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const OWNER = 'dev-owner'; // in the allow-list in firestore.rules
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-gymplan',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe('firestore.rules', () => {
  it('lets the owner read and write their own data', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(setDoc(doc(db, `users/${OWNER}/days/2026-09-30`), { kcal: 2700 }));
    await assertSucceeds(getDoc(doc(db, `users/${OWNER}/days/2026-09-30`)));
    await assertSucceeds(setDoc(doc(db, `users/${OWNER}/settings/main`), { units: 'lb' }));
  });

  it('denies another signed-in user access to the owner data', async () => {
    const db = env.authenticatedContext('someone-else').firestore();
    await assertFails(getDoc(doc(db, `users/${OWNER}/days/2026-09-30`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/days/2026-09-30`), { kcal: 1 }));
  });

  it('denies a signed-in user who is not on the allow-list, even under their own uid', async () => {
    const db = env.authenticatedContext('stranger').firestore();
    await assertFails(setDoc(doc(db, 'users/stranger/days/2026-09-30'), { kcal: 1 }));
    await assertFails(getDoc(doc(db, 'users/stranger/days/2026-09-30')));
  });

  it('denies unauthenticated requests', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `users/${OWNER}/days/2026-09-30`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/days/2026-09-30`), { kcal: 1 }));
  });

  it('denies everything outside users/{uid}', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(setDoc(doc(db, 'public/anything'), { a: 1 }));
    await assertFails(getDoc(doc(db, 'public/anything')));
  });
});
