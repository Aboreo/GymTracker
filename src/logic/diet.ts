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
// Saved items (one document, capped)

export const FOOD_CAP = 300;

/**
 * Save or update an item (matched by id, else by name ignoring case). Over the cap, the least
 * recently used non-favorites are evicted.
 */
export function saveFood(list: SavedFood[], food: Omit<SavedFood, 'id' | 'lastUsedAt'> & { id?: string }, now: number, newId: () => string): SavedFood[] {
  const key = food.name.trim().toLowerCase();
  const existing = list.find((f) => (food.id && f.id === food.id) || f.name.trim().toLowerCase() === key);
  const saved: SavedFood = { ...existing, ...food, id: existing?.id ?? food.id ?? newId(), lastUsedAt: now };
  const next = existing ? list.map((f) => (f.id === existing.id ? saved : f)) : [...list, saved];
  return evict(next);
}

function evict(list: SavedFood[]): SavedFood[] {
  if (list.length <= FOOD_CAP) return list;
  const removable = list.filter((f) => !f.favorite).sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const drop = new Set(removable.slice(0, list.length - FOOD_CAP).map((f) => f.id));
  return list.filter((f) => !drop.has(f.id));
}

/**
 * Suggestions while typing: with no query, recently eaten saved items (from the logged entries,
 * newest first, so using an item costs no write); with a query, name matches (prefix first).
 */
export function suggestFoods(list: SavedFood[], query: string, recentEntries: MealEntry[], limit = 10): SavedFood[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    const byName = new Map(list.map((f) => [f.name.trim().toLowerCase(), f]));
    const seen = new Set<string>();
    const out: SavedFood[] = [];
    for (const e of [...recentEntries].sort((a, b) => b.loggedAt - a.loggedAt)) {
      const f = byName.get(e.name.trim().toLowerCase());
      if (f && !seen.has(f.id)) {
        seen.add(f.id);
        out.push(f);
      }
    }
    // Then favorites and recently saved ones that haven't been eaten lately.
    for (const f of [...list].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || b.lastUsedAt - a.lastUsedAt)) {
      if (!seen.has(f.id)) out.push(f);
    }
    return out.slice(0, limit);
  }
  const matches = list.filter((f) => f.name.toLowerCase().includes(q));
  const starts = (f: SavedFood) => f.name.toLowerCase().startsWith(q);
  return matches.sort((a, b) => Number(starts(b)) - Number(starts(a)) || Number(!!b.favorite) - Number(!!a.favorite) || b.lastUsedAt - a.lastUsedAt).slice(0, limit);
}
