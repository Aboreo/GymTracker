import { describe, expect, it } from 'vitest';
import type { DayEntry, MealEntry, SavedFood } from '../shared/types';
import {
  addFood,
  dayEntries,
  FOOD_CAP,
  libraryPrompt,
  macroMismatch,
  mealForHour,
  normalizeFoods,
  pickerSections,
  recentFoodIds,
  removeEntry,
  sortLibrary,
  sumEntries,
  uniqueName,
  updateFood,
  upsertEntry,
} from './diet';

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

describe('food library', () => {
  let n = 0;
  const id = () => `f${n++}`;
  const bagel = { name: 'Bagel', kcal: 300, protein: 10, fat: 2, carbs: 58 };
  const lib = (...names: string[]): SavedFood[] =>
    names.map((name, i) => ({ ...bagel, id: `L${i}`, name, favorite: false, lastUsedAt: i }));

  describe('duplicate names', () => {
    it('refuses a name already in the library (ignoring case and spaces) and suggests "Name (2)"', () => {
      const r = addFood(lib('Bagel'), { ...bagel, name: ' bagel ' }, 1, id);
      expect(r).toMatchObject({ ok: false, reason: 'duplicate', suggestion: 'bagel (2)' });
    });
    it('suggests the next free number', () => {
      expect(uniqueName(lib('Bagel', 'Bagel (2)', 'Bagel (3)'), 'Bagel')).toBe('Bagel (4)');
      expect(uniqueName(lib('Bagel', 'Bagel (2)'), 'Bagel (2)')).toBe('Bagel (3)');
    });
    it('adds under the suggested name, keeping the original', () => {
      const r = addFood(lib('Bagel'), { ...bagel, name: 'Bagel (2)', kcal: 320 }, 1, id);
      expect(r.ok && r.list.map((f) => f.name)).toEqual(['Bagel', 'Bagel (2)']);
    });
    it('lets an update keep its own name, but not take another food\'s', () => {
      const list = lib('Bagel', 'Oats');
      expect(updateFood(list, 'L0', { ...bagel, name: 'BAGEL', kcal: 280 }, 5)).toMatchObject({ ok: true });
      expect(updateFood(list, 'L0', { ...bagel, name: 'oats' }, 5)).toMatchObject({ ok: false, reason: 'duplicate', suggestion: 'oats (2)' });
    });
  });

  describe('500-food cap', () => {
    const full = () => Array.from({ length: FOOD_CAP }, (_, i): SavedFood => ({ ...bagel, id: `x${i}`, name: `F${i}`, favorite: false, lastUsedAt: i }));
    it('blocks adding when full and never evicts anything', () => {
      const list = full();
      expect(addFood(list, { ...bagel, name: 'New' }, 1, id)).toEqual({ ok: false, reason: 'full' });
      expect(list).toHaveLength(FOOD_CAP);
    });
    it('still allows editing when full', () => {
      expect(updateFood(full(), 'x0', { ...bagel, name: 'F0', kcal: 1 }, 1)).toMatchObject({ ok: true });
    });
    it('allows adding just below the cap', () => {
      const r = addFood(full().slice(1), { ...bagel, name: 'New' }, 1, id);
      expect(r.ok && r.list).toHaveLength(FOOD_CAP);
    });
  });

  it('updating keeps the id and favorite, and stores the edited values', () => {
    const list = lib('Bagel');
    list[0].favorite = true;
    const r = updateFood(list, 'L0', { ...bagel, kcal: 280, servingNote: ' 1 bagel ' }, 9);
    expect(r.ok && r.food).toEqual({ ...bagel, id: 'L0', kcal: 280, servingNote: '1 bagel', favorite: true, lastUsedAt: 9 });
  });

  describe('snapshots', () => {
    it('editing or deleting a library food never changes logged entries or day totals', () => {
      const list = lib('Bagel');
      const food = list[0];
      const e = item({ foodId: food.id, name: food.name, kcalPerServing: food.kcal, proteinPerServing: food.protein, fatPerServing: food.fat, carbsPerServing: food.carbs, servings: 2 });
      const d = upsertEntry(day(), e);
      const before = structuredClone(d);
      const edited = updateFood(list, food.id, { ...bagel, kcal: 999 }, 2);
      expect(edited.ok && edited.list[0].kcal).toBe(999);
      expect(list.filter((f) => f.id !== food.id)).toEqual([]);
      expect(d).toEqual(before);
      expect(d.kcal).toBe(600);
    });
  });

  describe('which library question "Add to today" asks', () => {
    const picked: SavedFood = { ...bagel, id: 'L0', favorite: false, lastUsedAt: 0 };
    it('none for a picked food left unchanged (serving note and servings are not compared)', () => {
      expect(libraryPrompt({ ...bagel, servingNote: 'half' }, picked)).toBe('none');
    });
    it('changed when any nutrition value or the name was edited', () => {
      expect(libraryPrompt({ ...bagel, kcal: 301 }, picked)).toBe('changed');
      expect(libraryPrompt({ ...bagel, protein: 11 }, picked)).toBe('changed');
      expect(libraryPrompt({ ...bagel, fat: 2.5 }, picked)).toBe('changed');
      expect(libraryPrompt({ ...bagel, carbs: 0 }, picked)).toBe('changed');
      expect(libraryPrompt({ ...bagel, name: 'Bagel w/ butter' }, picked)).toBe('changed');
    });
    it('save for a typed-in food with a name, none without one', () => {
      expect(libraryPrompt(bagel, null)).toBe('save');
      expect(libraryPrompt({ ...bagel, name: '  ' }, null)).toBe('none');
    });
  });

  describe('migration of old saved items', () => {
    it('fills in favorite, trims, and merges same-name duplicates without losing a star', () => {
      const old = [
        { id: 'a', name: 'Oats ', kcal: 150, protein: 5, fat: 3, carbs: 27, lastUsedAt: 1, favorite: true },
        { id: 'b', name: 'Bagel', kcal: 300, protein: 10, fat: 2, carbs: 58, lastUsedAt: 2 },
        { id: 'c', name: 'oats', kcal: 160, protein: 6, fat: 3, carbs: 28, lastUsedAt: 3 },
      ];
      const { foods, changed } = normalizeFoods(old);
      expect(changed).toBe(true);
      expect(foods).toEqual([
        { id: 'c', name: 'oats', kcal: 160, protein: 6, fat: 3, carbs: 28, lastUsedAt: 3, favorite: true },
        { id: 'b', name: 'Bagel', kcal: 300, protein: 10, fat: 2, carbs: 58, lastUsedAt: 2, favorite: false },
      ]);
    });
    it('keeps serving notes and drops rows with no name', () => {
      const { foods } = normalizeFoods([{ id: 'a', name: 'Bar', kcal: 200, protein: 20, fat: 7, carbs: 20, servingNote: '1 bar', lastUsedAt: 1 }, { id: 'x', name: '' }]);
      expect(foods).toEqual([{ id: 'a', name: 'Bar', kcal: 200, protein: 20, fat: 7, carbs: 20, servingNote: '1 bar', favorite: false, lastUsedAt: 1 }]);
    });
    it('reports no change for an already-migrated library (no write), whatever the field order', () => {
      const stored = [{ lastUsedAt: 1, favorite: false, carbs: 58, fat: 2, protein: 10, kcal: 300, name: 'Bagel', id: 'b' }];
      expect(normalizeFoods(stored).changed).toBe(false);
      expect(normalizeFoods([]).changed).toBe(false);
      expect(normalizeFoods(undefined)).toEqual({ foods: [], changed: false });
    });
  });

  describe('ordering', () => {
    const list: SavedFood[] = [
      { ...bagel, id: '1', name: 'Oats', favorite: false, lastUsedAt: 1 },
      { ...bagel, id: '2', name: 'Bagel', favorite: false, lastUsedAt: 2 },
      { ...bagel, id: '3', name: 'Chicken bowl', favorite: true, lastUsedAt: 3 },
      { ...bagel, id: '4', name: 'Apple', favorite: false, lastUsedAt: 4 },
    ];
    it('finds recent foods from logged entries, by foodId or (older entries) by name', () => {
      const entries = [item({ foodId: '2', loggedAt: 10 }), item({ name: 'oats', loggedAt: 50 }), item({ name: 'Unknown', loggedAt: 60 })];
      expect(recentFoodIds(list, entries)).toEqual(['1', '2']);
    });
    it('library: starred first, then A–Z or most recently logged, filtered by search', () => {
      expect(sortLibrary(list, '', 'az', []).map((f) => f.name)).toEqual(['Chicken bowl', 'Apple', 'Bagel', 'Oats']);
      expect(sortLibrary(list, '', 'recent', ['1', '2']).map((f) => f.name)).toEqual(['Chicken bowl', 'Oats', 'Bagel', 'Apple']);
      expect(sortLibrary(list, 'a', 'az', []).map((f) => f.name)).toEqual(['Apple', 'Bagel', 'Oats']);
    });
    it('picker: favorites, then recent (not repeated), then everything else A–Z', () => {
      const s = pickerSections(list, '', ['3', '1']);
      expect([s.favorites, s.recent, s.rest].map((g) => g.map((f) => f.name))).toEqual([['Chicken bowl'], ['Oats'], ['Apple', 'Bagel']]);
    });
  });
});
