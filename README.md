# Gymplan

A personal, offline-first PWA for logging workouts, diet and bodyweight — built for one user, running entirely on Firebase's free **Spark** plan.

- **iPhone:** log workouts at the gym (works with no signal, syncs later).
- **Mac:** analyse progress and edit your plan.
- Stack: Vite + React + TypeScript (strict), Firebase Auth (email/password) + Firestore, hosted on Vercel, Recharts, vite-plugin-pwa, Vitest, oxlint.

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
npm i -g vercel && vercel login            # once
vercel link                                 # once: link this folder to a Vercel project
# once: add the four VITE_FIREBASE_* values from .env to the Vercel project (Production):
#   vercel env add VITE_FIREBASE_API_KEY production   (repeat for AUTH_DOMAIN, PROJECT_ID, APP_ID)
npm run deploy         # = vercel --prod (Vercel builds with `npm run build`)
npm run deploy:rules   # = firebase deploy --only firestore:rules (whenever firestore.rules changes)
```

Your app is live at `https://<vercel-project>.vercel.app`. `vercel.json` serves `index.html` for every path (SPA rewrite) and never caches `index.html`/`sw.js`, so updates arrive on the next launch.

## 4. Install on your iPhone

1. Open `https://<vercel-project>.vercel.app` in **Safari**.
2. Share button → **Add to Home Screen** → Add.
3. Open it from the Home Screen and **sign in once inside the installed app** — the Home Screen app has its own storage, separate from Safari, so a Safari login doesn't carry over. After that you stay signed in.

Sign in with signal the first time; after that the app opens and works offline.

## 5. Install on your Mac

Safari → open the URL → **File → Add to Dock** (or just use any browser). The desktop layout has a left sidebar and a wide chart grid.

---

## 6. Using the app

### Navigation

- Tabs (phone) / sidebar (Mac): **Today, Workout, Log, Dashboard, Plan**, plus **Settings**. On phone, Settings is the **gear** in the top-right of every screen (six tabs would be cramped); on Mac it's a sidebar item.
- Every screen is a real URL, e.g. `#/log/weight?date=2026-10-05`, `#/plan/library`, `#/settings/data`, so deep links, reloads and the browser Back button work.
- **Today** heading shows the selected date: *Today / Yesterday / Tomorrow* or e.g. *Mon, Oct 5*, with the full date underneath. The ‹ date › navigator has fixed-width parts, so stepping through days never moves anything; tap the date to pick one. Tapping the Today tab while on Today jumps back to today's date.
- Today's widgets open the exact place for the selected date: **Diet → Log → Diet**, **Weight → Log → Weight**, **Workout → Workout**. Those screens then show **‹ Today** (top left) to go straight back, keeping the date. In the installed iPhone app, a swipe in from the left edge does the same.

### Editing your plan (Plan)

Plan has four sections: **Workouts**, **Exercises**, **Foods** and **Nutrition**.

- **Weekly schedule** (top of Workouts): pick a workout (or Rest) for each weekday. Workouts used in the schedule are listed first, and each shows which days it runs.
- **Workouts:** create, rename, duplicate, delete. Each workout is an ordered list of **blocks**:
  - **Exercise block** — one or more exercises, repeated for N **rounds**, with a rest after each round. One exercise = normal sets; tap **Make superset** to add a second (or third) exercise; **Split out** turns it back into its own block.
  - **Rest block** — a standalone rest (e.g. to change stations).
- **Targets:** fixed reps, a rep range, or to failure (optionally "aim for" a ceiling).
- **Reorder** blocks with the drag handle (Mac) or the ↑/↓ buttons (phone).
- **Exercise library** (Exercises): rename, set muscle group, **rest type** (compound / isolation / abs, which picks the default rest), mark **Assisted** (weight = assistance, lower is better). Renaming keeps history — charts follow an exercise's id, not its name.
- **Food library** (Foods): see *Diet and weight* below.
- **Nutrition:** maintenance and daily calorie target and range, protein and fat ranges (carbs fill the rest), the target weekly weight gain and the calorie-adjustment step.
- The orange **preview** shows exactly what focus mode will run, e.g. `Curls × 10 → Pull-ups to failure → Rest 30s → Curls × 10 → Pull-ups to failure`.
- Changes apply to **future** sessions only. Each session stores a snapshot of names and targets, so past workouts never change. You'll see a warning if you edit a workout that has a session in progress.

Seeded defaults you may want to adjust: rest is 90s for compound lifts and 60s for isolation/abs (Settings → Rest), and "Abs 2–3 sets" was seeded as 3 × 10–15.

### Workout screen

Shows the workout for the selected date: exercises, total sets, estimated time and the block list exactly as it will run. Tap any set to log or edit it (this is also how you back-fill a past day — use **Log manually instead**). You can pick a different workout for a day; it applies to that day only. **Finish workout** asks you to fill in or discard any sets still pending or marked "log later" (discarded sets are removed and never count in stats). Completed sessions can be reopened or deleted.

### Custom workouts

**Custom workout** on the Workout screen starts an empty, renameable session for any day — including rest days. If the day's planned workout hasn't had a set logged yet, the custom workout replaces it; once sets are logged, it can't be swapped.

- **Add exercise:** search your library, or **Create new exercise** (name, muscle group, assisted) — it's saved to the library.
- **Log set:** weight, reps, optional RPE, pre-filled from your previous set today or the same set last time. Tap a set to edit or delete it. Reorder (↑/↓) or remove exercises at any time.
- **Rest:** *Start rest timer* after a set uses that exercise's default rest (Settings → Rest), or turn on *start the rest timer automatically* there. Same clock-based timer as focus mode.
- Saved after every change, so closing the app never loses anything; reopening the day resumes it.
- **Finish workout** completes it and offers **Save as workout template** (one block per exercise, rounds = sets done, target = the rep range you hit).
- Custom workouts use the same session format, so they count in strength, volume and insights. They are **not** counted in plan adherence (they're extra training, not a planned day). Focus mode is for planned workouts only.

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

**Diet** — log what you ate. Two buttons on Log → Diet:

- **+ Log meal** logs something you ate to the day you're viewing. Tap **Choose food** to pick from your library: **Favorites**, then **Recent**, then everything else, with search. Picking a food fills in its name and per-serving values. Or choose **"Not in my library, enter manually"** and type it in. Every value stays editable. **Servings (×)** takes decimals like 1.5 or 0.25 (chips 0.5× 1× 1.5× 2× and −/+), and a live total shows exactly what will be added (per-serving × servings). Meal group defaults by time of day. The button reads **Add to today**, or e.g. **Add to Mon, Oct 5** on another day.
- When you tap it, the app may ask about your library. The meal is added whatever you choose:
  - Picked a library food and **changed** its name or a value: **Update "…" in library** / **Save as new food** / **Just this once**.
  - **Typed it in** with a name: **Save this to your library?** → **Save to library** / **Not now**.
  - Picked a food and changed nothing: no question.
  - **Cancel** (or tapping outside) goes back to the sheet without adding anything.
- After adding, a small **Added · Add another** message appears. *Add another* opens a fresh sheet in the same meal group.
- **Add food** adds a food to your **library** only (nothing is logged).
- **Quick add**: type a total (calories and/or macros), no per-serving math.
- All of these sheets share one layout: name, a large **Calories** field, then **Protein / Fat / Carbs** in one row, *"Per 1 serving"*, and the serving description behind **More**. Carbs fill in **auto**matically from the remaining calories (kcal − 4·protein − 9·fat) ÷ 4 until you type your own; tap *auto* to switch back. If the macros don't roughly match the calories (4/4/9 kcal per g, ±15%), a small amber line warns you, e.g. *"These macros add up to ~2,700 kcal, but you entered 400"*. It never blocks saving.
- Entries are listed by meal. Tap one to edit it in the same sheet (**Save changes**, no library question) or delete it. The day's totals and bars update immediately (green = on target, amber = close, red = off).
- Days logged before entries existed (daily totals only) show as one **"Manual total"** entry. Nothing is lost, and adding meals adds to it.

**Food library** — **Plan → Foods**, next to the exercise library. There are also links from Log → Diet and Settings → Preferences.

- Search, with ★ favorites at the top, then **A–Z** or **Recent**. Each row shows the name, calories per serving and serving description. Tap a row to edit or delete it (delete asks first), and tap ★ to star a food.
- Values are **per serving**. Logged meals store a **snapshot** of the values, so editing or deleting a library food never changes past days.
- Names are unique (ignoring case). Adding an existing name offers **Save as "Name (2)"** or Cancel.
- Up to **500 foods**. A notice appears from 450. When full, adding is blocked until you delete something. Nothing is ever removed automatically.
- "Recent" is worked out from the meals you've logged, so logging a food costs no extra write.
- Older "saved items" live in the same document and are upgraded in place the first time the library loads (missing fields filled in, same-name duplicates merged).

**Weight:** morning weigh-in, recent history and the **7-day rolling average**, weekly change, and the calorie suggestion. **ⓘ How is this calculated?** explains each rule with your current numbers.

**No AI is involved anywhere.** The weight report and dashboard insights are fixed rules (section 9), computed on your device from your logged data.

### Settings

| Section | What's there |
| --- | --- |
| **Account** | Signed-in email, change password, sign out |
| **Rest** | Default rest for compound / isolation / abs, auto-advance vs wait-for-tap, sound, vibration, auto-start rest in custom workouts |
| **Preferences** | Units (lb/kg, with conversion), weight step, theme (system/light/dark, per device), link to the food library |
| **Data** | JSON backup and restore, CSV exports, last-backup date, load/remove sample data |

Where things moved from the old *Plan & Settings* screen: weekly split, workouts, exercise library and nutrition targets → **Plan**; units, weight step → **Settings → Preferences**; default rest, auto-advance, sound → **Settings → Rest**; backup, CSV, sample data → **Settings → Data**; sign out → **Settings → Account**. The old single "default rest" became the compound default.

---

## 7. Backups (do this!)

Firebase's free plan has **no automatic backups**.

- **Export:** Settings → Data → **Export backup (JSON)** (includes the food library). On iPhone this opens the share sheet — choose *Save to Files* (iCloud Drive). The Today screen reminds you if it's been more than 30 days.
- **Restore:** **Restore from backup…** → pick the JSON file → confirm. It replaces your settings/plan and any days/workouts with the same dates/ids; other data is left alone.
- **CSV:** separate exports for workouts (one row per set), nutrition and weight, for spreadsheets.

**Sample data:** *Load sample data* adds ~8 weeks of made-up data (tagged as sample) so you can try the dashboard. It skips any date that already has real data, asks first if you have real data, and *Remove sample data* deletes only sample entries.

**Units:** switching lb ↔ kg asks for confirmation, then converts every stored weight once (sets, bodyweight, gain target, weight step).

---

## 8. Free-tier quotas and how the app stays inside them

Spark limits: **50,000 reads/day, 20,000 writes/day, 1 GiB stored**.

| What | Cost |
| --- | --- |
| Data layout | 1 settings doc (plan + preferences), 1 doc for the **whole food library**, 1 doc per **day** (meal entries + totals + weight), 1 doc per **workout** (all its sets). A year ≈ 365 + ~200 small docs, well under 5 MB. |
| Opening the app | Live listeners on the **last 12 months** of days and sessions. The first load reads each doc once (~600 reads/year of data); after that, Firestore's local cache means only **changed** docs are re-read. |
| Screens and charts | All analytics run on the device from memory. Changing a chart filter or switching screens costs **0 reads**. "All time" loads older data **once** on demand. |
| Logging | ~1 write per set during a workout (so a closed app never loses progress) ≈ 20–30 writes per workout; 1 write per diet entry added/edited (+1 when you save or update a library food); the food library loads with 1 read, only when needed. Plan edits are batched (written 0.6s after you stop typing). |
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
- **Adherence:** completed **planned** workouts per week (custom workouts excluded) vs workout days in your current split; the streak counts consecutive weeks that met the plan (the current week doesn't break it while in progress).

Insights need **3+ weeks** of data and are worded cautiously — they're patterns, not proof. The same rules are explained in the app under **How are these insights calculated?** on the dashboard. Nothing is sent anywhere and no AI is used.

---

## Project structure

```
src/
  shared/types.ts        data models
  firebase.ts            Firebase init, persistent multi-tab cache, emulator hookup
  api.ts                 the only module that touches Firestore (+ sync status, dev op counter)
  state/AppData.tsx      in-memory cache of the signed-in user's data
  router.ts              hash router: #/route/sub?date=…&from=today
  logic/                 pure, tested logic: workoutPlayer, customWorkout, diet, settings (defaults for older docs),
                         restTimer, progression, analytics, units, dates, backup
  data/                  defaultPlan (seed), sampleData
  lib/device.ts          sound, vibration, wake lock
  lib/theme.ts           per-device theme (system/light/dark)
  components/, pages/    UI
  styles/tokens.css      design tokens (light/dark)
tests/rules.test.ts      security-rules tests
firestore.rules, firebase.json, .firebaserc
```
