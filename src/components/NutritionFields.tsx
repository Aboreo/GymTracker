// The one nutrition layout used everywhere (Add food, Log meal, Quick add, editing an entry):
// name, a large Calories field, then Protein / Fat / Carbs in one row, a muted caption, and
// extras (serving description) behind "More". The draft keeps what was typed, as text.

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { carbsFromRemaining } from '../logic/analytics';
import { macroMismatch, type FoodInput } from '../logic/diet';

export interface NutritionDraft {
  name: string;
  kcal: string;
  protein: string;
  fat: string;
  carbs: string;
  /** Carbs follow the remaining calories until typed in. */
  carbsAuto: boolean;
  servingNote: string;
}

export const EMPTY_DRAFT: NutritionDraft = { name: '', kcal: '', protein: '', fat: '', carbs: '', carbsAuto: true, servingNote: '' };

export const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

/** Parses a typed number; '' (or anything invalid) → null. Accepts a decimal comma too. */
export const parseNum = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function draftFromFood(f: { name: string; kcal: number | null; protein: number | null; fat: number | null; carbs: number | null; servingNote?: string }): NutritionDraft {
  return { name: f.name, kcal: str(f.kcal), protein: str(f.protein), fat: str(f.fat), carbs: str(f.carbs), carbsAuto: false, servingNote: f.servingNote ?? '' };
}

/** The typed numbers (null = blank), with auto carbs resolved. */
export function draftNumbers(d: NutritionDraft) {
  const kcal = parseNum(d.kcal);
  const protein = parseNum(d.protein);
  const fat = parseNum(d.fat);
  const carbs = d.carbsAuto ? (kcal !== null ? carbsFromRemaining(kcal, protein ?? 0, fat ?? 0) : null) : parseNum(d.carbs);
  return { kcal, protein, fat, carbs };
}

/** The draft as library values (blank grams = 0). */
export function draftToFood(d: NutritionDraft): FoodInput {
  const n = draftNumbers(d);
  return { name: d.name.trim(), kcal: n.kcal ?? 0, protein: n.protein ?? 0, fat: n.fat ?? 0, carbs: n.carbs ?? 0, servingNote: d.servingNote.trim() || undefined };
}

/** Enter (or "Next" on the iOS keyboard) moves to the next field instead of submitting. */
export function enterToNext(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const fields = [...(e.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[data-next]') ?? [])];
  const next = fields[fields.indexOf(e.currentTarget) + 1];
  if (next) next.focus();
  else e.currentTarget.blur();
}

export function NutritionFields({
  value,
  onChange,
  nameLabel = 'Name',
  namePlaceholder = 'e.g. Protein bar',
  caption,
  showServingNote = false,
  autoFocusName = false,
}: {
  value: NutritionDraft;
  onChange: (patch: Partial<NutritionDraft>) => void;
  nameLabel?: string;
  namePlaceholder?: string;
  /** Muted line under the macros, e.g. "Per 1 serving". */
  caption?: string;
  showServingNote?: boolean;
  autoFocusName?: boolean;
}) {
  const [more, setMore] = useState(value.servingNote !== '');
  const n = draftNumbers(value);
  const mismatch = macroMismatch(n.kcal, n.protein ?? 0, n.fat ?? 0, n.carbs ?? 0);

  return (
    <div className="nf">
      <label className="nf-field">
        <span className="nf-label">{nameLabel}</span>
        <input
          className="input soft"
          value={value.name}
          placeholder={namePlaceholder}
          autoComplete="off"
          autoFocus={autoFocusName}
          enterKeyHint="next"
          data-next
          onKeyDown={enterToNext}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>

      <label className="nf-field">
        <span className="nf-label">Calories (kcal)</span>
        <input
          className="input soft nf-hero"
          type="text"
          inputMode="decimal"
          value={value.kcal}
          placeholder="0"
          enterKeyHint="next"
          data-next
          onKeyDown={enterToNext}
          onChange={(e) => onChange({ kcal: e.target.value })}
        />
      </label>

      <div className="nf-macros">
        <Grams label="Protein" value={value.protein} onChange={(protein) => onChange({ protein })} />
        <Grams label="Fat" value={value.fat} onChange={(fat) => onChange({ fat })} />
        <Grams
          label="Carbs"
          value={value.carbsAuto ? str(n.carbs) : value.carbs}
          placeholder={value.carbsAuto ? 'auto' : '0'}
          onChange={(carbs) => onChange({ carbs, carbsAuto: false })}
          extra={
            <button
              type="button"
              className="nf-chip"
              aria-pressed={value.carbsAuto}
              title="Calculate carbs from the calories left after protein and fat"
              onClick={() => onChange(value.carbsAuto ? { carbsAuto: false, carbs: str(n.carbs) } : { carbsAuto: true })}
            >
              auto
            </button>
          }
        />
      </div>

      {mismatch && (
        <p className="nf-warning" role="status">
          These macros add up to ~{mismatch.fromMacros.toLocaleString()} kcal, but you entered {n.kcal?.toLocaleString()}.
        </p>
      )}
      {caption && <p className="xs muted">{caption}</p>}

      {showServingNote && (
        <details className="nf-more" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
          <summary>More</summary>
          <label className="nf-field">
            <span className="nf-label">Serving description (optional)</span>
            <input
              className="input soft"
              value={value.servingNote}
              placeholder="e.g. 1 bar, 100 g"
              autoComplete="off"
              enterKeyHint="done"
              onKeyDown={enterToNext}
              onChange={(e) => onChange({ servingNote: e.target.value })}
            />
          </label>
        </details>
      )}
    </div>
  );
}

function Grams({ label, value, onChange, placeholder = '0', extra }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; extra?: ReactNode }) {
  const id = useId();
  return (
    <div className="nf-field">
      <span className="nf-label row" style={{ gap: 6 }}>
        <label htmlFor={id}>{label}</label>
        {extra}
      </span>
      <span className="nf-suffix">
        <input
          id={id}
          className="input soft num"
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          enterKeyHint="next"
          data-next
          onKeyDown={enterToNext}
          onChange={(e) => onChange(e.target.value)}
        />
        <span aria-hidden="true">g</span>
      </span>
    </div>
  );
}
