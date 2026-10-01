import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { carbsFromRemaining } from '../logic/analytics';
import { entryTotals, FOOD_CAP, macroMismatch, mealForHour, saveFood, suggestFoods } from '../logic/diet';
import { MEALS, type Meal, type MealEntry, type SavedFood } from '../shared/types';
import { useAppData } from '../state/AppData';
import { Icon } from './Icon';
import { Sheet } from './ui';

export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const SERVING_CHIPS = [0.5, 1, 1.5, 2];

const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
/** Parses a typed number; '' → null. Accepts a decimal comma too. */
const num = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const fmt = (n: number | null) => (n === null ? '—' : String(n));

/**
 * "Item eaten" (per-serving values × servings) or "Quick add" (a typed total). Also edits an
 * existing entry. One day write on save; one saved-items write only if "Save for next time" is on.
 */
export function FoodSheet({
  mode,
  entry,
  recentEntries,
  onSave,
  onDelete,
  onClose,
}: {
  mode: 'item' | 'quick';
  entry?: MealEntry;
  /** Entries from recent days, for the "recent" suggestions. */
  recentEntries: MealEntry[];
  onSave: (e: MealEntry) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const app = useAppData();
  const { foods, loadFoods } = app;
  useEffect(() => {
    if (mode === 'item') loadFoods();
  }, [mode, loadFoods]);

  const [name, setName] = useState(entry?.name ?? '');
  const [kcal, setKcal] = useState(str(entry?.kcalPerServing));
  const [protein, setProtein] = useState(str(entry?.proteinPerServing));
  const [fat, setFat] = useState(str(entry?.fatPerServing));
  const [carbs, setCarbs] = useState(str(entry?.carbsPerServing));
  // Carbs auto-fill from remaining calories until typed (an existing entry keeps its value).
  const [carbsTyped, setCarbsTyped] = useState(entry !== undefined);
  const [servings, setServings] = useState(str(entry?.servings ?? 1));
  const [meal, setMeal] = useState<Meal>(() => entry?.meal ?? mealForHour(new Date().getHours()));
  // Identity and time of a new entry, fixed when the sheet opens.
  const [fresh] = useState(() => ({ id: crypto.randomUUID(), at: Date.now() }));
  const [remember, setRemember] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const k = num(kcal);
  const p = num(protein);
  const f = num(fat);
  const autoCarbs = k !== null ? carbsFromRemaining(k, p ?? 0, f ?? 0) : null;
  const c = carbsTyped ? num(carbs) : autoCarbs;
  const s = mode === 'quick' ? 1 : num(servings);

  const draft: MealEntry = {
    id: entry?.id ?? fresh.id,
    kind: entry?.kind ?? mode,
    name: name.trim() || (mode === 'quick' ? 'Quick add' : 'Item'),
    // An item always has numbers (blank grams = 0); a quick add keeps blanks as "not entered".
    kcalPerServing: mode === 'item' ? (k ?? 0) : k,
    proteinPerServing: mode === 'item' ? (p ?? 0) : p,
    fatPerServing: mode === 'item' ? (f ?? 0) : f,
    carbsPerServing: mode === 'item' ? (c ?? 0) : c,
    servings: s ?? 1,
    meal,
    loggedAt: entry?.loggedAt ?? fresh.at,
  };
  const total = entryTotals(draft);
  const mismatch = macroMismatch(k, p ?? 0, f ?? 0, c ?? 0);
  const valid = mode === 'item' ? k !== null && s !== null && s > 0 : [k, p, f, c].some((v) => v !== null);

  const suggestions = useMemo(
    () => (Array.isArray(foods) && mode === 'item' ? suggestFoods(foods, name, recentEntries, 6) : []),
    [foods, mode, name, recentEntries],
  );
  const pick = (food: SavedFood) => {
    setName(food.name);
    setKcal(str(food.kcal));
    setProtein(str(food.protein));
    setFat(str(food.fat));
    setCarbs(str(food.carbs));
    setCarbsTyped(true);
    setShowSuggestions(false);
  };

  const submit = () => {
    if (!valid) return;
    onSave(draft);
    if (remember && Array.isArray(foods) && name.trim()) {
      app.saveFoods(
        saveFood(
          foods,
          { name: name.trim(), kcal: k ?? 0, protein: p ?? 0, fat: f ?? 0, carbs: c ?? 0 },
          draft.loggedAt,
          () => crypto.randomUUID().slice(0, 8),
        ),
      );
    }
  };

  const title = entry ? (entry.kind === 'manual' ? 'Edit manual total' : 'Edit entry') : mode === 'quick' ? 'Quick add' : 'Item eaten';
  const per = mode === 'item' ? ' per serving' : '';

  return (
    <Sheet title={title} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="field" style={{ position: 'relative' }}>
          <span>Name (optional)</span>
          <input
            className="input"
            value={name}
            placeholder={mode === 'quick' ? 'Quick add' : 'Item'}
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
          />
        </label>
        {showSuggestions && suggestions.length > 0 && (
          <div className="suggestions" role="listbox" aria-label="Saved items">
            <span className="label">{name.trim() ? 'Saved items' : 'Recent'}</span>
            {suggestions.map((food) => (
              <button type="button" role="option" aria-selected={false} key={food.id} className="list-item" onClick={() => pick(food)}>
                {food.favorite && <Icon name="star" size={14} />}
                <span className="grow">{food.name}</span>
                <span className="xs muted">
                  {food.kcal} kcal · P {food.protein} · F {food.fat} · C {food.carbs}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="grid cols-2 macro-fields">
          <MacroField label={`Calories${per}`} unit="kcal" value={kcal} onChange={setKcal} />
          <MacroField label={`Protein${per}`} unit="g" value={protein} onChange={setProtein} />
          <MacroField label={`Fat${per}`} unit="g" value={fat} onChange={setFat} />
          <MacroField
            label={`Carbs${per}`}
            unit="g"
            value={carbsTyped ? carbs : str(autoCarbs)}
            onChange={(v) => {
              setCarbs(v);
              setCarbsTyped(true);
            }}
            hint={
              carbsTyped ? (
                <button type="button" className="btn sm ghost" style={{ minHeight: 0, padding: 0 }} onClick={() => setCarbsTyped(false)}>
                  Auto
                </button>
              ) : (
                <span className="xs muted">auto from remaining kcal</span>
              )
            }
          />
        </div>

        {mismatch && (
          <p className="small badge caution" role="status" style={{ whiteSpace: 'normal' }}>
            These macros add up to ~{mismatch.fromMacros.toLocaleString()} kcal, but you entered {k?.toLocaleString()}. Double-check for a typo.
          </p>
        )}

        {mode === 'item' && (
          <div className="field">
            <span>Servings (×)</span>
            <div className="row wrap">
              <button type="button" className="btn icon" aria-label="Fewer servings" onClick={() => setServings(String(Math.max(0.25, Math.round(((s ?? 1) - 0.5) * 100) / 100)))}>
                <Icon name="minus" />
              </button>
              <input
                className="input num"
                style={{ width: 80 }}
                type="text"
                inputMode="decimal"
                value={servings}
                aria-label="Servings"
                onChange={(e) => setServings(e.target.value)}
              />
              <button type="button" className="btn icon" aria-label="More servings" onClick={() => setServings(String(Math.round(((s ?? 0) + 0.5) * 100) / 100))}>
                <Icon name="plus" />
              </button>
              <div className="segmented" role="group" aria-label="Quick servings">
                {SERVING_CHIPS.map((x) => (
                  <button type="button" key={x} aria-pressed={s === x} onClick={() => setServings(String(x))}>
                    {x}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="segmented" role="group" aria-label="Meal" style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}>
          {MEALS.map((m) => (
            <button type="button" key={m} aria-pressed={meal === m} onClick={() => setMeal(m)}>
              {MEAL_LABEL[m]}
            </button>
          ))}
        </div>

        {mode === 'item' && !entry && (
          <label className="check">
            <input type="checkbox" checked={remember} disabled={!Array.isArray(foods) || !name.trim()} onChange={(e) => setRemember(e.target.checked)} />
            <span>
              Save for next time
              <span className="xs muted" style={{ display: 'block' }}>
                {foods === 'error'
                  ? 'Saved items can’t be loaded right now (offline?).'
                  : !name.trim()
                    ? 'Give it a name to save it.'
                    : Array.isArray(foods) && foods.length >= FOOD_CAP * 0.9
                      ? `${foods.length} of ${FOOD_CAP} saved items: the least recently used ones (not starred) will be removed.`
                      : 'Shows up as a suggestion when you type its name.'}
              </span>
            </span>
          </label>
        )}

        <p className="small preview-total" aria-live="polite">
          {mode === 'item' ? 'Adds ' : 'Total '}
          <strong>
            {fmt(total.kcal)} kcal · {fmt(total.protein)} g protein · {fmt(total.fat)} g fat · {fmt(total.carbs)} g carbs
          </strong>
        </p>

        <button className="btn primary block lg" disabled={!valid}>
          {entry ? 'Save' : 'Add'}
        </button>
        {onDelete && (
          <button type="button" className="btn ghost danger" onClick={onDelete}>
            <Icon name="trash" size={18} /> Delete entry
          </button>
        )}
      </form>
    </Sheet>
  );
}

function MacroField({ label, unit, value, onChange, hint }: { label: string; unit: string; value: string; onChange: (v: string) => void; hint?: ReactNode }) {
  return (
    <label className="field">
      <span>
        {label} <span className="muted">({unit})</span>
      </span>
      <input className="input num" type="text" inputMode="decimal" value={value} placeholder="0" onChange={(e) => onChange(e.target.value)} />
      {hint}
    </label>
  );
}
