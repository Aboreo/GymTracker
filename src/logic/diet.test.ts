import { describe, expect, it } from 'vitest';
import type { DayEntry, MealEntry, SavedFood } from '../shared/types';
import { dayEntries, FOOD_CAP, macroMismatch, mealForHour, removeEntry, saveFood, suggestFoods, sumEntries, upsertEntry } from './diet';

const day = (p: Partial<DayEntry> = {}): DayEntry => ({
  date: '2026-09-30', kcal: null, protein: null, fat: null, carbs: null, carbsManual: false, weight: null, updatedAt: 5, sample: false, ...p,
});

const item = (p: Partial<MealEntry> = {}): MealEntry => ({
  id: 'a', kind: 'item', name: 'Item', kcalPerServing: 400, proteinPerServing: 3, fatPerServing: 10, carbsPerServing: 60,
  servings: 1.5, meal: 'lunch', loggedAt: 1, ...p,
});

describe('item eaten × servings', () => {
  it('adds exactly servings × per-serving values to the day totals', () => {
    const d = upsertEntry(day(), item());
    expect(d.entries).toHaveLength(1);
    expect([d.kcal, d.protein, d.fat, d.carbs]).toEqual([600, 4.5, 15, 90]);
  });
  it('accepts fractional servings', () => {
    expect(sumEntries([item({ servings: 0.25 })])).toEqual({ kcal: 100, protein: 0.8, fat: 2.5, carbs: 15 });
  });
  it('recalculates totals on edit and delete', () => {
    let d = upsertEntry(day(), item());
    d = upsertEntry(d, item({ id: 'b', servings: 1 }));
    expect(d.kcal).toBe(1000);
    d = upsertEntry(d, item({ id: 'b', servings: 2 }));
    expect(d.kcal).toBe(1400);
    d = removeEntry(d, 'a');
    expect([d.kcal, d.protein]).toEqual([800, 6]);
    d = removeEntry(d, 'b');
    expect([d.kcal, d.protein, d.fat, d.carbs]).toEqual([null, null, null, null]);
  });
  it('keeps the weight and other fields of the day', () => {
    expect(upsertEntry(day({ weight: 170 }), item()).weight).toBe(170);
  });
});

describe('days from before entries existed', () => {
  it('show their totals as one manual entry, and keep them when an item is added', () => {
    const old = day({ kcal: 2500, protein: 130, fat: 70, carbs: 300 });
    expect(dayEntries(old)).toHaveLength(1);
    expect(dayEntries(old)[0].kind).toBe('manual');
    const d = upsertEntry(old, item({ servings: 1 }));
    expect(d.entries).toHaveLength(2);
    expect([d.kcal, d.protein, d.fat, d.carbs]).toEqual([2900, 133, 80, 360]);
  });
  it('keep a missing macro as not logged (not 0)', () => {
    const old = day({ protein: 120 });
    expect(sumEntries(dayEntries(old))).toEqual({ kcal: null, protein: 120, fat: null, carbs: null });
  });
  it('with no diet data have no entries', () => {
    expect(dayEntries(day({ weight: 170 }))).toEqual([]);
  });
});

describe('macroMismatch', () => {
  it('flags macros that are far from the calories', () => {
    expect(macroMismatch(400, 3, 300, 60)).toEqual({ fromMacros: 2952 });
  });
  it('allows ±15% and ignores missing macros', () => {
    expect(macroMismatch(400, 3, 10, 60)).toBeNull(); // 342 kcal, within 15%
    expect(macroMismatch(400, 0, 0, 0)).toBeNull();
    expect(macroMismatch(null, 10, 10, 10)).toBeNull();
  });
});

describe('mealForHour', () => {
  it('picks a meal by time of day', () => {
    expect([7, 12, 16, 19, 23, 2].map(mealForHour)).toEqual(['breakfast', 'lunch', 'snacks', 'dinner', 'snacks', 'snacks']);
  });
});

describe('saved items', () => {
  let n = 0;
  const id = () => `f${n++}`;
  const food = { name: 'Bagel', kcal: 300, protein: 10, fat: 2, carbs: 58 };

  it('updates an existing item with the same name instead of duplicating it', () => {
    let list = saveFood([], food, 1, id);
    list = saveFood(list, { ...food, name: 'bagel ', kcal: 320 }, 2, id);
    expect(list).toHaveLength(1);
    expect(list[0].kcal).toBe(320);
    expect(list[0].lastUsedAt).toBe(2);
  });
  it('evicts the least recently used non-favorites over the cap', () => {
    const list: SavedFood[] = Array.from({ length: FOOD_CAP }, (_, i) => ({ ...food, id: `x${i}`, name: `F${i}`, lastUsedAt: i + 10, favorite: i === 0 }));
    const next = saveFood(list, { ...food, name: 'New' }, 999, id);
    expect(next).toHaveLength(FOOD_CAP);
    expect(next.some((f) => f.id === 'x0')).toBe(true); // favorite kept even though oldest
    expect(next.some((f) => f.id === 'x1')).toBe(false); // oldest non-favorite evicted
  });
  it('suggests recently eaten items first, then name matches', () => {
    const list: SavedFood[] = [
      { ...food, id: '1', name: 'Oats', lastUsedAt: 1 },
      { ...food, id: '2', name: 'Bagel', lastUsedAt: 2 },
      { ...food, id: '3', name: 'Chicken bowl', lastUsedAt: 3 },
    ];
    const recent = [item({ name: 'oats', loggedAt: 50 }), item({ name: 'Unknown', loggedAt: 60 })];
    expect(suggestFoods(list, '', recent).map((f) => f.id)).toEqual(['1', '3', '2']);
    expect(suggestFoods(list, 'b', recent).map((f) => f.id)).toEqual(['2', '3']);
  });
});
