// Creates the local emulator account (uid "dev-owner") that firestore.rules allows.
// Run once while `npm run emulators` is running: npm run dev:user
const EMAIL = 'dev@gymplan.local';
const PASSWORD = 'devpass123';

const res = await fetch(
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-gymplan/accounts',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: 'dev-owner', email: EMAIL, password: PASSWORD }),
  },
);
const body = await res.json();
if (res.ok) {
  console.log(`✔ Dev account ready: ${EMAIL} / ${PASSWORD}`);
} else if (JSON.stringify(body).includes('EXISTS')) {
  console.log(`✔ Dev account already exists: ${EMAIL} / ${PASSWORD}`);
} else {
  console.error('✖ Could not create dev account. Are the emulators running?', body);
  process.exit(1);
}
