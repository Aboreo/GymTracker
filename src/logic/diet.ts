// Diet entries: "item eaten × servings", quick adds, and the daily totals derived from them.
// Pure functions; the day document stores both the entries and their totals.

import type { DayEntry, Meal, MealEntry, SavedFood } from '../shared/types';

export const MANUAL_ENTRY_ID = 'manual';

/**
 * The day's entries. Days logged before entries existed only have totals: those are shown as
 * one "Manual total" entry (not written until the day is next edited), so nothing is lost.
 */
export function dayEntries(day: DayEntry): MealEntry[] {
  if (day.entries) return day.entries;
  if (day.kcal === null && day.protein === null && day.fat === null && day.carbs === null) return [];
  return [
    {
      id: MANUAL_ENTRY_ID,
      kind: 'manual',
      name: 'Manual total',
      kcalPerServing: day.kcal,
      proteinPerServing: day.protein,
      fatPerServing: day.fat,
      carbsPerServing: day.carbs,
      servings: 1,
      meal: 'snacks',
      loggedAt: day.updatedAt,
    },
  ];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Macros {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

/** What one entry adds: per-serving values × servings (kcal whole, grams to 0.1). */
export function entryTotals(e: MealEntry): Macros {
  const x = (v: number | null, r: (n: number) => number) => (v === null ? null : r(v * e.servings));
  return {
    kcal: x(e.kcalPerServing, Math.round),
    protein: x(e.proteinPerServing, round1),
    fat: x(e.fatPerServing, round1),
    carbs: x(e.carbsPerServing, round1),
  };
}

/** Sum of entries. A macro no entry provides stays null ("not logged"), not 0. */
export function sumEntries(entries: MealEntry[]): Macros {
  const out: Macros = { kcal: null, protein: null, fat: null, carbs: null };
  for (const e of entries) {
    const t = entryTotals(e);
    for (const k of ['kcal', 'protein', 'fat', 'carbs'] as const) {
      const v = t[k];
      if (v !== null) out[k] = round1((out[k] ?? 0) + v);
    }
  }
  return out;
}

/** The day with these entries and its denormalized totals recalculated. */
export function withEntries(day: DayEntry, entries: MealEntry[]): DayEntry {
  return { ...day, ...sumEntries(entries), entries };
}

export function upsertEntry(day: DayEntry, entry: MealEntry): DayEntry {
  const list = dayEntries(day);
  const i = list.findIndex((e) => e.id === entry.id);
  return withEntries(day, i >= 0 ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry]);
}

export function removeEntry(day: DayEntry, id: string): DayEntry {
  return withEntries(day, dayEntries(day).filter((e) => e.id !== id));
}

/**
 * Macros vs calories (4 kcal/g protein and carbs, 9 kcal/g fat). Flags a mismatch beyond ±15%
 * (and at least 20 kcal, so tiny items don't trip it) — e.g. a typo like 300 g fat.
 */
export function macroMismatch(kcal: number | null, protein: number, fat: number, carbs: number): { fromMacros: number } | null {
  if (kcal === null || kcal <= 0) return null;
  const fromMacros = Math.round(protein * 4 + carbs * 4 + fat * 9);
  if (fromMacros === 0) return null;
  const diff = Math.abs(fromMacros - kcal);
  return diff > kcal * 0.15 && diff >= 20 ? { fromMacros } : null;
}

/** Default meal for the time of day. */
export function mealForHour(hour: number): Meal {
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snacks';
}

// ---------------------------------------------------------------------------------------------
// Food library (one document, capped; never evicts)

export const FOOD_CAP = 500;
/** From here on the library shows a gentle "getting full" notice. */
export const FOOD_NOTICE_AT = 450;

/** The per-serving values that define a food (everything the user edits). */
export type FoodInput = Pick<SavedFood, 'name' | 'kcal' | 'protein' | 'fat' | 'carbs' | 'servingNote'>;

export type FoodResult =
  | { ok: true; list: SavedFood[]; food: SavedFood }
  | { ok: false; reason: 'duplicate'; existing: SavedFood; suggestion: string }
  | { ok: false; reason: 'full' }
  | { ok: false; reason: 'missing' };

const nameKey = (name: string) => name.trim().toLowerCase();

export function findByName(list: SavedFood[], name: string, exceptId?: string): SavedFood | undefined {
  const key = nameKey(name);
  return list.find((f) => f.id !== exceptId && nameKey(f.name) === key);
}

/** "Name (2)", "Name (3)", … : the first one not already in the library. */
export function uniqueName(list: SavedFood[], name: string): string {
  const base = name.trim().replace(/ \(\d+\)$/, '');
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!findByName(list, candidate)) return candidate;
  }
}

function clean(input: FoodInput): FoodInput {
  const note = input.servingNote?.trim();
  return { name: input.name.trim(), kcal: input.kcal, protein: input.protein, fat: input.fat, carbs: input.carbs, ...(note ? { servingNote: note } : {}) };
}

/** Adds a food. Refuses a name already in the library (case-insensitive) and a full library. */
export function addFood(list: SavedFood[], input: FoodInput, now: number, newId: () => string): FoodResult {
  if (list.length >= FOOD_CAP) return { ok: false, reason: 'full' };
  const existing = findByName(list, input.name);
  if (existing) return { ok: false, reason: 'duplicate', existing, suggestion: uniqueName(list, input.name) };
  const food: SavedFood = { ...clean(input), id: newId(), favorite: false, lastUsedAt: now };
  return { ok: true, list: [...list, food], food };
}

/** Overwrites a food's values (keeps its id and favorite). Refuses renaming onto another food's name. */
export function updateFood(list: SavedFood[], id: string, input: FoodInput, now: number): FoodResult {
  const current = list.find((f) => f.id === id);
  if (!current) return { ok: false, reason: 'missing' };
  const existing = findByName(list, input.name, id);
  if (existing) return { ok: false, reason: 'duplicate', existing, suggestion: uniqueName(list, input.name) };
  const food: SavedFood = { id, favorite: current.favorite, ...clean(input), lastUsedAt: now };
  return { ok: true, list: list.map((f) => (f.id === id ? food : f)), food };
}

/**
 * Migration and repair on load: the library lives in the same document the old "saved items"
 * used, so this upgrades it in place: fills in missing fields, drops unusable rows and merges
 * same-name duplicates (keeping the most recently used values, starred if either was).
 * `changed` says whether the cleaned list needs writing back.
 */
export function normalizeFoods(raw: unknown): { foods: SavedFood[]; changed: boolean } {
  const items = Array.isArray(raw) ? (raw as Partial<SavedFood>[]) : [];
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const byName = new Map<string, SavedFood>();
  items.forEach((f, i) => {
    if (!f || typeof f.name !== 'string' || !f.name.trim()) return;
    const food: SavedFood = {
      id: typeof f.id === 'string' && f.id ? f.id : `migrated-${i}`,
      name: f.name.trim(),
      kcal: n(f.kcal),
      protein: n(f.protein),
      fat: n(f.fat),
      carbs: n(f.carbs),
      ...(typeof f.servingNote === 'string' && f.servingNote.trim() ? { servingNote: f.servingNote.trim() } : {}),
      favorite: f.favorite === true,
      lastUsedAt: n(f.lastUsedAt),
    };
    const key = nameKey(food.name);
    const prev = byName.get(key);
    if (!prev) byName.set(key, food);
    else {
      const newer = food.lastUsedAt > prev.lastUsedAt ? food : prev;
      byName.set(key, { ...newer, favorite: prev.favorite || food.favorite });
    }
  });
  const foods = [...byName.values()];
  const fields = ['id', 'name', 'kcal', 'protein', 'fat', 'carbs', 'servingNote', 'favorite', 'lastUsedAt'] as const;
  const changed = foods.length !== items.length || foods.some((f, i) => fields.some((k) => f[k] !== items[i][k]));
  return { foods, changed };
}

/**
 * Foods ordered by when they were last logged, newest first. Worked out from the entries already
 * in memory (by foodId, or by name for entries logged before foodId existed), so logging a food
 * costs no extra write.
 */
export function recentFoodIds(list: SavedFood[], entries: MealEntry[]): string[] {
  const ids = new Set(list.map((f) => f.id));
  const byName = new Map(list.map((f) => [nameKey(f.name), f.id]));
  const out = new Set<string>();
  for (const e of [...entries].sort((a, b) => b.loggedAt - a.loggedAt)) {
    const id = e.foodId && ids.has(e.foodId) ? e.foodId : byName.get(nameKey(e.name));
    if (id) out.add(id);
  }
  return [...out];
}

const matches = (f: SavedFood, q: string) => f.name.toLowerCase().includes(q) || !!f.servingNote?.toLowerCase().includes(q);

/** The library list: search, starred first, then A–Z or most recently logged. */
export function sortLibrary(list: SavedFood[], query: string, order: 'az' | 'recent', recentIds: string[]): SavedFood[] {
  const q = query.trim().toLowerCase();
  const rank = new Map(recentIds.map((id, i) => [id, i]));
  const recency = (f: SavedFood) => rank.get(f.id) ?? Infinity;
  return list
    .filter((f) => matches(f, q))
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        (order === 'recent' ? recency(a) - recency(b) || b.lastUsedAt - a.lastUsedAt : 0) ||
        a.name.localeCompare(b.name),
    );
}

/** The "+ Log meal" picker: favorites, then recently logged, then everything else (A–Z). */
export function pickerSections(list: SavedFood[], query: string, recentIds: string[], recentLimit = 8) {
  const q = query.trim().toLowerCase();
  const found = list.filter((f) => matches(f, q));
  const byId = new Map(found.map((f) => [f.id, f]));
  const favorites = found.filter((f) => f.favorite).sort((a, b) => a.name.localeCompare(b.name));
  const recent = recentIds
    .map((id) => byId.get(id))
    .filter((f): f is SavedFood => !!f && !f.favorite)
    .slice(0, recentLimit);
  const shown = new Set([...favorites, ...recent].map((f) => f.id));
  const rest = found.filter((f) => !shown.has(f.id)).sort((a, b) => a.name.localeCompare(b.name));
  return { favorites, recent, rest };
}

/**
 * Which library question "Add to today" asks:
 * changed = a library food was picked and its name or a nutrition value was edited;
 * save = typed in by hand (with a name); none = picked and unchanged, or nothing to save.
 */
export function libraryPrompt(values: FoodInput, picked: SavedFood | null): 'changed' | 'save' | 'none' {
  if (picked) {
    const same =
      values.name.trim() === picked.name &&
      values.kcal === picked.kcal &&
      values.protein === picked.protein &&
      values.fat === picked.fat &&
      values.carbs === picked.carbs;
    return same ? 'none' : 'changed';
  }
  return values.name.trim() ? 'save' : 'none';
}
