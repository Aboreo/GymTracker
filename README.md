# Gymplan

A personal, offline-first PWA for logging workouts, diet and bodyweight — built for one user, running entirely on Firebase's free **Spark** plan.

- **iPhone:** log workouts at the gym (works with no signal, syncs later).
- **Mac:** analyse progress and edit your plan.
- Stack: Vite + React + TypeScript (strict), Firebase Auth (email/password) + Firestore + Hosting, Recharts, vite-plugin-pwa, Vitest, oxlint.

---

## 1. Local development (no Firebase project needed)

Development runs against the **Firebase Emulator Suite**, so it never touches your real project or quota.

Requirements: Node 20+, Java 21 (`brew install --cask temurin@21`), Firebase CLI (`npm i -g firebase-tools`).

```bash
npm install
npm run emulators        # terminal 1: Auth + Firestore emulators (UI at http://127.0.0.1:4000)
npm run dev:user         # once: creates dev@gymplan.local / devpass123 (uid "dev-owner")
npm run dev              # terminal 2: http://localhost:5173
```

The login form is pre-filled with the dev account. Emulator data is saved to `.emulator-data/` when you stop the emulators (Ctrl-C), and reloaded next time.

In development a small **R · W counter** (bottom right) shows approximately how many Firestore reads and writes the session has cost, so you can see what each screen costs.

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for all logic (block expansion, player, timer, progression, analytics, snapshots) |
| `npm run test:rules` | Security-rules tests against a throwaway Firestore emulator |
| `npm run lint` | oxlint with type-aware rules (`no-explicit-any`, `no-floating-promises`, hooks rules…) |
| `npm run typecheck` | TypeScript strict |
| `npm run build` | Production build + service worker into `dist/` |
| `npm run icons` | Regenerate the app icons in `public/icons/` |

---

## 2. Firebase setup (one time)

1. **Create the project:** [console.firebase.google.com](https://console.firebase.google.com) → *Add project* → name it (e.g. `gymplan`). Google Analytics is not needed. New projects start on the **Spark (no-cost)** plan — don't add a billing account.
2. **Register a web app:** Project overview → *</>* (Web) → nickname `gymplan` → *Register app* (skip Hosting setup here). Copy the `firebaseConfig` values.
3. **Enable email/password sign-in:** Build → *Authentication* → *Get started* → *Sign-in method* → *Email/Password* → enable (leave "passwordless" off) → Save.
4. **Create Firestore:** Build → *Firestore Database* → *Create database* → **Standard edition** → choose a location close to you (e.g. `nam5` or `eur3`; it can't be changed later) → start in **production mode**.
5. **Configure the app:**
   ```bash
   cp .env.example .env      # fill in VITE_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID / APP_ID
   ```
   and put your project id in `.firebaserc` (`"default": "your-project-id"`).
6. **Log in the CLI:** `firebase login`

`.env` is git-ignored (the values aren't secret, but they stay out of the repo). Never commit service-account keys — the app doesn't need any.

### Lock the app to your account

1. Deploy once (next section) and open the app. Tap **First time? Create account** and sign up.
2. Firebase console → *Authentication* → *Users* → copy your **User UID**.
3. In `firestore.rules`, replace `REPLACE_WITH_YOUR_UID` with it. (`dev-owner` is the emulator account; it can't be created by sign-up in production, so it's harmless to leave.)
4. **Turn off new sign-ups:** Authentication → *Settings* → *User actions* → untick **Enable create (sign-up)** → Save.
5. `firebase deploy --only firestore:rules`

Now only your uid can read or write `users/<uid>/**`; everything else is denied, even if someone manages to create an account. The deploy refuses to push rules that still contain the placeholder.

---

## 3. Deploy

```bash
npm run deploy     # = npm run build && firebase deploy --only hosting,firestore:rules
```

Your app is live at `https://<project-id>.web.app`. Hosting serves `index.html` for every path (SPA rewrite) and never caches `index.html`/`sw.js`, so updates arrive on the next launch.

## 4. Install on your iPhone

1. Open `https://<project-id>.web.app` in **Safari**.
2. Share button → **Add to Home Screen** → Add.
3. Open it from the Home Screen and **sign in once inside the installed app** — the Home Screen app has its own storage, separate from Safari, so a Safari login doesn't carry over. After that you stay signed in.

Sign in with signal the first time; after that the app opens and works offline.

## 5. Install on your Mac

Safari → open the URL → **File → Add to Dock** (or just use any browser). The desktop layout has a left sidebar and a wide chart grid.

---

## 6. Using the app

### Editing your split (Plan & Settings)

- **Weekly split:** pick a workout (or Rest) for each weekday.
- **Workouts:** create, rename, duplicate, delete. Each workout is an ordered list of **blocks**:
  - **Exercise block** — one or more exercises, repeated for N **rounds**, with a rest after each round. One exercise = normal sets; tap **Make superset** to add a second (or third) exercise; **Split out** turns it back into its own block.
  - **Rest block** — a standalone rest (e.g. to change stations).
- **Targets:** fixed reps, a rep range, or to failure (optionally "aim for" a ceiling).
- **Reorder** blocks with the drag handle (Mac) or the ↑/↓ buttons (phone).
- **Exercise library:** rename, set muscle group, mark **Assisted** (weight = assistance, lower is better). Renaming keeps history — charts follow an exercise's id, not its name.
- The orange **preview** shows exactly what focus mode will run, e.g. `Curls × 10 → Pull-ups to failure → Rest 30s → Curls × 10 → Pull-ups to failure`.
- Changes apply to **future** sessions only. Each session stores a snapshot of names and targets, so past workouts never change. You'll see a warning if you edit a workout that has a session in progress.

Seeded defaults you may want to adjust: rest is 90s for compound lifts and 60s for isolation/abs, and "Abs 2–3 sets" was seeded as 3 × 10–15.

### Workout screen

Shows the workout for the selected date: exercises, total sets, estimated time and the block list exactly as it will run. Tap any set to log or edit it (this is also how you back-fill a past day — use **Log manually instead**). You can pick a different workout for a day; it applies to that day only. **Finish workout** asks you to fill in or discard any sets still pending or marked "log later" (discarded sets are removed and never count in stats). Completed sessions can be reopened or deleted.

### Focus mode and the rest timer

One step at a time: exercise name, target, "Round 2 of 3 · Step 4 of 29", what you did last time, and a progression hint. Weight/reps are **pre-filled** from last time (weight step configurable, default 2.5 lb).

- **Log it** saves the set and moves on. **Log later** skips data entry; fill it in afterwards from the overview.
- ← goes back to the previous exercise (rests are skipped on the way back). ✕ leaves focus mode; progress is saved after every step.
- **Rest steps** start a countdown automatically, with −15s / pause / +15s / skip. Beeps for the last 3 seconds and a chime at the end; then it auto-advances (or waits for a tap — Settings).

How it stays reliable:
- The timer stores **when the rest ends** and computes the remaining time from the clock, so locking the phone or switching apps doesn't slow it down. Reopen the app mid-rest and it shows the right time; if the rest already ended while the app was closed, it moves on.
- The screen is kept awake with the **Screen Wake Lock API** (re-acquired when you come back to the app).

iOS limitations:
- **Sound** can only play after a tap, so audio is unlocked when you tap *Start focus mode* (or on your first tap in focus mode). The silent switch mutes it.
- **Vibration isn't supported** on iOS Safari; it's skipped silently (works on Android).
- If you lock the phone or leave the app, iOS pauses the page: **no beep plays while it's in the background**. The time stays correct — you'll see and hear the finish as soon as you return.
- Wake Lock needs iOS 16.4+; in Low Power Mode iOS may refuse it (the screen can then auto-lock).

### Progression hints (double progression)

- **Rep range / fixed reps:** hit the top of the range on **every** set at your working weight → *Go up to X* (weight + step). Otherwise → *Stay at X, aim for 12 reps on every set*. Example: 15 lb curls 10,10 → 12,11 → 12,12 → *Go up to 17.5 lb*.
- **Assisted exercises:** the same rule, but progress by *reducing* assistance.
- **To failure:** *Beat N reps* (your best last time). With a ceiling set, reaching it → go up in weight.
- Most sets should stop 1–3 reps short of failure unless the target is failure.

### Diet and weight (Log)

- Diet: calories, protein, fat and carbs for the day, saved as you type. Carbs **auto-fill** from remaining calories (kcal − 4·protein − 9·fat) ÷ 4, or type your own (tap *Auto* to go back). Bars are green = on target, amber = close, red = off.
- Weight: morning weigh-in, recent history and the **7-day rolling average**, weekly change, and the calorie suggestion.

---

## 7. Backups (do this!)

Firebase's free plan has **no automatic backups**.

- **Export:** Plan & Settings → Backup → **Export backup (JSON)**. On iPhone this opens the share sheet — choose *Save to Files* (iCloud Drive). The Today screen reminds you if it's been more than 30 days.
- **Restore:** **Restore from backup…** → pick the JSON file → confirm. It replaces your settings/plan and any days/workouts with the same dates/ids; other data is left alone.
- **CSV:** separate exports for workouts (one row per set), nutrition and weight, for spreadsheets.

**Sample data:** *Load sample data* adds ~8 weeks of made-up data (tagged as sample) so you can try the dashboard. It skips any date that already has real data, asks first if you have real data, and *Remove sample data* deletes only sample entries.

**Units:** switching lb ↔ kg asks for confirmation, then converts every stored weight once (sets, bodyweight, gain target, weight step).

---

## 8. Free-tier quotas and how the app stays inside them

Spark limits: **50,000 reads/day, 20,000 writes/day, 1 GiB stored**.

| What | Cost |
| --- | --- |
| Data layout | 1 settings doc (plan + preferences), 1 doc per **day** (nutrition + weight), 1 doc per **workout** (all its sets). A year ≈ 365 + ~200 small docs, well under 5 MB. |
| Opening the app | Live listeners on the **last 12 months** of days and sessions. The first load reads each doc once (~600 reads/year of data); after that, Firestore's local cache means only **changed** docs are re-read. |
| Screens and charts | All analytics run on the device from memory. Changing a chart filter or switching screens costs **0 reads**. "All time" loads older data **once** on demand. |
| Logging | ~1 write per set during a workout (so a closed app never loses progress) ≈ 20–30 writes per workout; 1–4 writes per day for diet/weight. Plan edits are batched (written 0.6s after you stop typing). |
| Offline | Writes queue locally and sync when signal returns, at no extra cost. |

Realistic use is on the order of **100–1,000 reads and ~50 writes per day** — around 1% of the free quota. The dev-only R · W counter lets you check.

---

## 9. How the insights are calculated

All analytics use **logged sets only**. Pending and "log later" sets are never counted (not even as zeros).

- **Estimated 1RM (Epley):** weight × (1 + reps/30); reps = 1 → weight. Not calculated for assisted exercises (their chart shows assistance, where lower is better).
- **Top set:** heaviest weight in a session (least assistance for assisted exercises), with the best reps at that weight.
- **Volume:** Σ weight × reps per week, overall and per muscle group (assisted sets excluded from load; set counts shown alongside). Muscle groups are shown as small multiples — there are too many to give each a distinguishable colour in one chart.
- **7-day average:** mean of weigh-ins in the 7 days ending on each date.
- **Weekly rate:** least-squares slope of the **weekly averages** (weeks with ≥ 2 weigh-ins) over the last 4 weeks.
- **Calorie suggestion:** needs 3+ weeks. Below +0.25/week → add 100–150 kcal; +0.25–0.5 → keep; above +0.5 → cut 100–150 kcal (all editable).
- **Progressed:** at least one session in the last 4 weeks beat all earlier sessions (more weight, more reps at a weight, or higher e1RM).
- **Stalled:** no such improvement for **3+ sessions** (needs ≥ 4 sessions).
- **Protein:** % of logged days at or above the protein minimum. "Better progress on protein weeks" compares the average weekly e1RM change (each exercise vs its previous week) in weeks where protein was hit on ≥ 70% of days vs other weeks (needs ≥ 2 weeks of each).
- **Lower-volume muscle groups:** sets per group over the last 4 weeks below half the median group.
- **Calories vs lifting:** Pearson correlation between weekly average calories and the weekly e1RM change; |r| ≥ 0.5 "fairly clear", ≥ 0.3 "weak", otherwise "no clear link".
- **Adherence:** completed workouts per week vs workout days in your current split; the streak counts consecutive weeks that met the plan (the current week doesn't break it while in progress).

Insights need **3+ weeks** of data and are worded cautiously — they're patterns, not proof.

---

## Project structure

```
src/
  shared/types.ts        data models
  firebase.ts            Firebase init, persistent multi-tab cache, emulator hookup
  api.ts                 the only module that touches Firestore (+ sync status, dev op counter)
  state/AppData.tsx      in-memory cache of the signed-in user's data
  logic/                 pure, tested logic: workoutPlayer, restTimer, progression, analytics, units, dates, backup
  data/                  defaultPlan (seed), sampleData
  lib/device.ts          sound, vibration, wake lock
  components/, pages/    UI
  styles/tokens.css      design tokens (light/dark)
tests/rules.test.ts      security-rules tests
firestore.rules, firebase.json, .firebaserc
```
