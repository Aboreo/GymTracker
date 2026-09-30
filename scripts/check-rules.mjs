// Refuses to deploy rules that still contain the owner-uid placeholder.
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
if (rules.includes('REPLACE_WITH_YOUR_UID')) {
  console.error('\n✖ firestore.rules still contains REPLACE_WITH_YOUR_UID. Put your uid in allowedUid() first (see README).\n');
  process.exit(1);
}
