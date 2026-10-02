// Food library (Plan → Foods): browse, search, star, add, edit and delete foods.
// The whole library is one document: 1 read to load, 1 write per change.

import { useEffect, useMemo, useState } from 'react';
import { addFood, FOOD_CAP, FOOD_NOTICE_AT, recentFoodIds, sortLibrary, updateFood, type FoodInput, type FoodResult } from '../logic/diet';
import type { SavedFood } from '../shared/types';
import { useAppData } from '../state/AppData';
import { Icon } from './Icon';
import { draftFromFood, draftNumbers, draftToFood, EMPTY_DRAFT, NutritionFields, type NutritionDraft } from './NutritionFields';
import { ChoiceDialog, Confirm, Empty, Sheet } from './ui';

export const newFoodId = () => crypto.randomUUID().slice(0, 8);

/** Library foods, most recently logged first (from the entries in memory: no extra reads or writes). */
export function useRecentFoodIds(): string[] {
  const { days, foods } = useAppData();
  return useMemo(
    () => (Array.isArray(foods) ? recentFoodIds(foods, [...days.values()].flatMap((d) => d.entries ?? [])) : []),
    [days, foods],
  );
}

/** "How full is the library" line: a gentle notice from 450, a block at 500. */
export function CapNotice({ count }: { count: number }) {
  if (count >= FOOD_CAP)
    return (
      <p className="small" style={{ color: 'var(--caution)' }} role="status">
        Your library is full ({FOOD_CAP} foods). Delete a food you no longer use to add a new one.
      </p>
    );
  if (count >= FOOD_NOTICE_AT)
    return (
      <p className="xs" style={{ color: 'var(--caution)' }}>
        {count} of {FOOD_CAP} foods. Nothing is ever removed automatically; delete foods you no longer use to make room.
      </p>
    );
  return null;
}

/** The duplicate-name question: save under "Name (2)" or go back. */
export function DuplicateDialog({ name, suggestion, onSaveAs, onCancel }: { name: string; suggestion: string; onSaveAs: () => void; onCancel: () => void }) {
  return (
    <ChoiceDialog
      title="Already in your library"
      message={`“${name}” is already in your library.`}
      choices={[{ label: `Save as “${suggestion}”`, primary: true, onClick: onSaveAs }]}
      onCancel={onCancel}
    />
  );
}

export function FoodLibrary() {
  const { foods, loadFoods, saveFoods } = useAppData();
  useEffect(() => loadFoods(), [loadFoods]);
  const recentIds = useRecentFoodIds();
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'az' | 'recent'>('az');
  const [editing, setEditing] = useState<SavedFood | 'new' | null>(null);
  const list = useMemo(() => (Array.isArray(foods) ? sortLibrary(foods, query, order, recentIds) : []), [foods, query, order, recentIds]);

  if (foods === null) return <p className="small muted">Loading…</p>;
  if (foods === 'error') return <p className="small muted">Your food library can’t be loaded right now (offline?).</p>;

  const toggleFavorite = (f: SavedFood) => saveFoods(foods.map((x) => (x.id === f.id ? { ...x, favorite: !x.favorite } : x)));

  return (
    <div className="stack">
      <div className="row wrap">
        <input className="input soft grow" style={{ minWidth: 180, width: 'auto' }} type="search" value={query} placeholder="Search foods" aria-label="Search foods" onChange={(e) => setQuery(e.target.value)} />
        <div className="segmented" role="group" aria-label="Sort">
          <button aria-pressed={order === 'az'} onClick={() => setOrder('az')}>
            A–Z
          </button>
          <button aria-pressed={order === 'recent'} onClick={() => setOrder('recent')}>
            Recent
          </button>
        </div>
        <button className="btn primary" disabled={foods.length >= FOOD_CAP} onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} /> Add food
        </button>
      </div>
      <CapNotice count={foods.length} />

      {foods.length === 0 ? (
        <Empty>No foods yet. Add the things you eat often, then pick them when you log a meal.</Empty>
      ) : list.length === 0 ? (
        <Empty>No food matches “{query.trim()}”.</Empty>
      ) : (
        <div className="list">
          {list.map((f) => (
            <div key={f.id} className="list-item">
              <button
                className="btn icon ghost"
                aria-label={f.favorite ? `Unstar ${f.name}` : `Star ${f.name}`}
                aria-pressed={f.favorite}
                style={{ color: f.favorite ? 'var(--accent)' : 'var(--text-muted)' }}
                onClick={() => toggleFavorite(f)}
              >
                <Icon name="star" size={20} filled={f.favorite} />
              </button>
              <button className="list-item grow" style={{ padding: 0 }} onClick={() => setEditing(f)}>
                <span className="grow stack" style={{ gap: 0 }}>
                  <span>{f.name}</span>
                  {f.servingNote && <span className="xs muted">{f.servingNote}</span>}
                </span>
                <span className="small" style={{ fontWeight: 600 }}>
                  {f.kcal} kcal
                </span>
                <Icon name="right" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      {foods.length > 0 && (
        <p className="xs muted">
          {foods.length} {foods.length === 1 ? 'food' : 'foods'}. Values are per serving. Editing or deleting a food never changes meals you’ve already logged.
        </p>
      )}

      {editing && <FoodEditorSheet food={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** "Add food" (to the library only, nothing is logged) or editing a library food. */
export function FoodEditorSheet({ food, onClose, onSaved }: { food?: SavedFood; onClose: () => void; onSaved?: (f: SavedFood) => void }) {
  const { foods, loadFoods, saveFoods } = useAppData();
  useEffect(() => loadFoods(), [loadFoods]);
  const [draft, setDraft] = useState<NutritionDraft>(() => (food ? draftFromFood(food) : EMPTY_DRAFT));
  const [duplicate, setDuplicate] = useState<{ name: string; suggestion: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const loaded = Array.isArray(foods);
  const full = !food && loaded && foods.length >= FOOD_CAP;
  const valid = loaded && !full && draft.name.trim() !== '' && draftNumbers(draft).kcal !== null;

  const save = (name: string) => {
    if (!loaded) return;
    const input: FoodInput = { ...draftToFood(draft), name };
    const r: FoodResult = food ? updateFood(foods, food.id, input, Date.now()) : addFood(foods, input, Date.now(), newFoodId);
    if (r.ok) {
      saveFoods(r.list);
      onSaved?.(r.food);
      onClose();
    } else if (r.reason === 'duplicate') setDuplicate({ name, suggestion: r.suggestion });
  };

  return (
    <>
      <Sheet title={food ? 'Edit food' : 'Add food'} onClose={onClose}>
        <form
          className="stack"
          style={{ gap: 'var(--space-5)' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save(draft.name.trim());
          }}
        >
          <NutritionFields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} caption="Per 1 serving" showServingNote autoFocusName={!food} />
          {foods === 'error' && <p className="small muted">Your food library can’t be loaded right now (offline?).</p>}
          {!food && loaded && <CapNotice count={foods.length} />}
          <button className="btn primary block lg" disabled={!valid}>
            {food ? 'Save changes' : 'Save to library'}
          </button>
          {food && (
            <button type="button" className="btn ghost danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={18} /> Delete food
            </button>
          )}
        </form>
      </Sheet>
      {duplicate && (
        <DuplicateDialog
          name={duplicate.name}
          suggestion={duplicate.suggestion}
          onSaveAs={() => {
            setDuplicate(null);
            save(duplicate.suggestion);
          }}
          onCancel={() => setDuplicate(null)}
        />
      )}
      {confirmDelete && food && loaded && (
        <Confirm
          title={`Delete “${food.name}”?`}
          message="It’s removed from your library. Meals you’ve already logged keep their values."
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            saveFoods(foods.filter((f) => f.id !== food.id));
            onClose();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
