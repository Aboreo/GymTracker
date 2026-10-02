import { useEffect, useMemo, useState } from 'react';
import { parseISODate, todayISO } from '../logic/dates';
import { addFood, entryTotals, FOOD_CAP, libraryPrompt, mealForHour, pickerSections, updateFood } from '../logic/diet';
import { MEALS, type ISODate, type Meal, type MealEntry, type SavedFood } from '../shared/types';
import { useAppData } from '../state/AppData';
import { DuplicateDialog, newFoodId, useRecentFoodIds } from './FoodLibrary';
import { Icon } from './Icon';
import { draftFromFood, draftNumbers, draftToFood, EMPTY_DRAFT, enterToNext, NutritionFields, parseNum, str, type NutritionDraft } from './NutritionFields';
import { ChoiceDialog, Empty, Sheet } from './ui';

export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const SERVING_CHIPS = [0.5, 1, 1.5, 2];

const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString());

/** "Add to today", or "Add to Mon, Oct 5" when logging to another day. */
export function addToLabel(date: ISODate, today: ISODate = todayISO()): string {
  if (date === today) return 'Add to today';
  return `Add to ${parseISODate(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

type Dialog = { kind: 'changed' } | { kind: 'save' } | { kind: 'duplicate'; how: 'update' | 'new'; name: string; suggestion: string } | null;

/**
 * "+ Log meal" (a library food or typed-in values × servings) or "Quick add" (a typed total).
 * Also edits an existing entry. One day write on save; one library write only when the
 * "Add to today" popup is answered with a library change.
 */
export function FoodSheet({
  mode,
  entry,
  date,
  initialMeal,
  onSave,
  onDelete,
  onClose,
}: {
  mode: 'meal' | 'quick';
  entry?: MealEntry;
  /** The day being logged to (labels the button). */
  date: ISODate;
  initialMeal?: Meal;
  onSave: (e: MealEntry) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { foods, loadFoods, saveFoods } = useAppData();
  useEffect(() => {
    if (mode === 'meal') loadFoods();
  }, [mode, loadFoods]);
  const library = Array.isArray(foods) ? foods : null;

  const [draft, setDraft] = useState<NutritionDraft>(() =>
    entry
      ? draftFromFood({ name: entry.name, kcal: entry.kcalPerServing, protein: entry.proteinPerServing, fat: entry.fatPerServing, carbs: entry.carbsPerServing })
      : EMPTY_DRAFT,
  );
  const [picked, setPicked] = useState<SavedFood | null>(null);
  const [servings, setServings] = useState(str(entry?.servings ?? 1));
  const [meal, setMeal] = useState<Meal>(() => entry?.meal ?? initialMeal ?? mealForHour(new Date().getHours()));
  // Identity and time of a new entry, fixed when the sheet opens.
  const [fresh] = useState(() => ({ id: crypto.randomUUID(), at: Date.now() }));
  const [picking, setPicking] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  const isMeal = mode === 'meal';
  const n = draftNumbers(draft);
  const s = isMeal ? parseNum(servings) : 1;

  /** The entry as it would be saved (a snapshot: never linked to the library food's values). */
  const entryFor = (name: string, foodId: string | undefined): MealEntry => ({
    id: entry?.id ?? fresh.id,
    kind: entry?.kind ?? (isMeal ? 'item' : 'quick'),
    ...(foodId ? { foodId } : {}),
    name: name.trim() || (isMeal ? 'Item' : 'Quick add'),
    // A meal always has numbers (blank grams = 0); a quick add keeps blanks as "not entered".
    kcalPerServing: isMeal ? (n.kcal ?? 0) : n.kcal,
    proteinPerServing: isMeal ? (n.protein ?? 0) : n.protein,
    fatPerServing: isMeal ? (n.fat ?? 0) : n.fat,
    carbsPerServing: isMeal ? (n.carbs ?? 0) : n.carbs,
    servings: s ?? 1,
    meal,
    loggedAt: entry?.loggedAt ?? fresh.at,
  });
  const linkedId = picked?.id ?? entry?.foodId;
  const total = entryTotals(entryFor(draft.name, linkedId));
  const valid = isMeal ? n.kcal !== null && s !== null && s > 0 : [n.kcal, n.protein, n.fat, n.carbs].some((v) => v !== null);

  const pick = (food: SavedFood | null) => {
    setPicking(false);
    if (food) setDraft(draftFromFood(food));
    else if (picked) setDraft(EMPTY_DRAFT); // "enter manually" after a pick: start blank
    setPicked(food);
  };

  /** Saves to the library (update the picked food, or add a new one), then logs the meal. */
  const saveAndLog = (how: 'update' | 'new', name: string) => {
    if (!library) return;
    const input = { ...draftToFood(draft), name };
    let r = how === 'update' && picked ? updateFood(library, picked.id, input, fresh.at) : addFood(library, input, fresh.at, newFoodId);
    if (!r.ok && r.reason === 'missing') r = addFood(library, input, fresh.at, newFoodId); // deleted meanwhile
    if (r.ok) {
      saveFoods(r.list);
      onSave(entryFor(r.food.name, r.food.id));
    } else if (r.reason === 'duplicate') setDialog({ kind: 'duplicate', how, name, suggestion: r.suggestion });
  };

  const submit = () => {
    if (!valid) return;
    // Edit mode and quick adds never ask about the library.
    const ask = entry || !isMeal || !library ? 'none' : libraryPrompt(draftToFood(draft), picked);
    if (ask === 'none') onSave(entryFor(draft.name, linkedId));
    else setDialog({ kind: ask });
  };

  const title = entry ? (entry.kind === 'manual' ? 'Edit manual total' : 'Edit entry') : isMeal ? 'Log meal' : 'Quick add';
  const full = !!library && library.length >= FOOD_CAP;
  const fullNote = full ? `Your library is full (${FOOD_CAP} foods). Delete one in Plan → Foods to save more.` : undefined;

  return (
    <>
      <Sheet title={title} onClose={onClose}>
        <form
          className="stack"
          style={{ gap: 'var(--space-5)' }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {isMeal && (
            <button type="button" className={`input soft picker-field ${picked ? '' : 'empty'}`} onClick={() => setPicking(true)} aria-haspopup="dialog">
              <Icon name={picked ? 'star' : 'plus'} size={18} filled={picked?.favorite} />
              <span className="grow">{picked ? picked.name : 'Choose food'}</span>
              <Icon name="down" size={18} />
            </button>
          )}

          <NutritionFields
            value={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            nameLabel={isMeal ? 'Name' : 'Name (optional)'}
            namePlaceholder={isMeal ? 'e.g. Protein bar' : 'Quick add'}
            caption={isMeal ? 'Per 1 serving' : undefined}
            showServingNote={isMeal && !entry}
          />

          {isMeal && (
            <>
              <hr className="divider" />
              <div className="nf-field">
                <span className="nf-label">Servings (×)</span>
                <div className="row wrap">
                  <div className="row" style={{ gap: 'var(--space-1)' }}>
                    <button type="button" className="btn icon" aria-label="Fewer servings" onClick={() => setServings(String(Math.max(0.25, Math.round(((s ?? 1) - 0.5) * 100) / 100)))}>
                      <Icon name="minus" />
                    </button>
                    <input
                      className="input soft num"
                      style={{ width: 72, textAlign: 'center' }}
                      type="text"
                      inputMode="decimal"
                      value={servings}
                      aria-label="Servings"
                      enterKeyHint="done"
                      data-next
                      onKeyDown={enterToNext}
                      onChange={(e) => setServings(e.target.value)}
                    />
                    <button type="button" className="btn icon" aria-label="More servings" onClick={() => setServings(String(Math.round(((s ?? 0) + 0.5) * 100) / 100))}>
                      <Icon name="plus" />
                    </button>
                  </div>
                  <div className="segmented" role="group" aria-label="Quick servings">
                    {SERVING_CHIPS.map((x) => (
                      <button type="button" key={x} aria-pressed={s === x} onClick={() => setServings(String(x))}>
                        {x}×
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="segmented" role="group" aria-label="Meal" style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}>
            {MEALS.map((m) => (
              <button type="button" key={m} aria-pressed={meal === m} onClick={() => setMeal(m)}>
                {MEAL_LABEL[m]}
              </button>
            ))}
          </div>

          {isMeal && (
            <p className="small preview-total" aria-live="polite">
              <strong>
                {fmt(total.kcal)} kcal · {fmt(total.protein)} g P · {fmt(total.fat)} g F · {fmt(total.carbs)} g C
              </strong>
            </p>
          )}

          <button className="btn primary block lg" disabled={!valid}>
            {entry ? 'Save changes' : addToLabel(date)}
          </button>
          {onDelete && (
            <button type="button" className="btn ghost danger" onClick={onDelete}>
              <Icon name="trash" size={18} /> Delete entry
            </button>
          )}
        </form>
      </Sheet>

      {picking && <FoodPicker onPick={pick} onClose={() => setPicking(false)} />}

      {dialog?.kind === 'changed' && picked && (
        <ChoiceDialog
          title="You changed this food’s details"
          message={fullNote ?? 'The meal is added either way. This only decides what happens to your library.'}
          choices={[
            { label: `Update “${picked.name}” in library`, primary: true, onClick: () => saveAndLog('update', draft.name.trim()) },
            { label: 'Save as new food', disabled: full, onClick: () => saveAndLog('new', draft.name.trim()) },
            { label: 'Just this once', onClick: () => onSave(entryFor(draft.name, picked.id)) },
          ]}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'save' && (
        <ChoiceDialog
          title="Save this to your library?"
          message={fullNote ?? `Next time, pick “${draft.name.trim()}” instead of typing it in.`}
          choices={[
            { label: 'Save to library', primary: true, disabled: full, onClick: () => saveAndLog('new', draft.name.trim()) },
            { label: 'Not now', onClick: () => onSave(entryFor(draft.name, undefined)) },
          ]}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'duplicate' && (
        <DuplicateDialog
          name={dialog.name}
          suggestion={dialog.suggestion}
          onSaveAs={() => saveAndLog(dialog.how, dialog.suggestion)}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
}

/** Searchable list of library foods: favorites, then recent, then everything else. */
function FoodPicker({ onPick, onClose }: { onPick: (f: SavedFood | null) => void; onClose: () => void }) {
  const { foods } = useAppData();
  const recentIds = useRecentFoodIds();
  const [query, setQuery] = useState('');
  const sections = useMemo(() => (Array.isArray(foods) ? pickerSections(foods, query, recentIds) : null), [foods, query, recentIds]);

  return (
    <Sheet title="Choose food" onClose={onClose}>
      <input className="input soft" type="search" value={query} placeholder="Search your library" aria-label="Search your library" onChange={(e) => setQuery(e.target.value)} />
      <button className="list-item" style={{ color: 'var(--accent)', fontWeight: 600 }} onClick={() => onPick(null)}>
        <Icon name="plus" size={18} />
        <span className="grow">Not in my library, enter manually</span>
      </button>
      {foods === null ? (
        <p className="small muted">Loading…</p>
      ) : foods === 'error' || !sections ? (
        <p className="small muted">Your food library can’t be loaded right now (offline?). You can still enter the details manually.</p>
      ) : foods.length === 0 ? (
        <Empty>Your library is empty. Foods you save (or add in Plan → Foods) show up here.</Empty>
      ) : (
        <div className="stack picker-list" style={{ gap: 'var(--space-3)' }}>
          {(
            [
              ['Favorites', sections.favorites],
              ['Recent', sections.recent],
              [sections.favorites.length || sections.recent.length ? 'All foods' : 'Foods', sections.rest],
            ] as const
          )
            .filter(([, list]) => list.length > 0)
            .map(([label, list]) => (
              <div key={label} className="stack" style={{ gap: 0 }}>
                <span className="label">{label}</span>
                <div className="list">
                  {list.map((f) => (
                    <button key={f.id} className="list-item" onClick={() => onPick(f)}>
                      {f.favorite && <Icon name="star" size={14} filled />}
                      <span className="grow stack" style={{ gap: 0 }}>
                        <span>{f.name}</span>
                        {f.servingNote && <span className="xs muted">{f.servingNote}</span>}
                      </span>
                      <span className="small muted">{f.kcal} kcal</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          {sections.favorites.length + sections.recent.length + sections.rest.length === 0 && <p className="small muted">No food matches “{query.trim()}”.</p>}
        </div>
      )}
    </Sheet>
  );
}
