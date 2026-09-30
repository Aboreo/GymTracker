// Small shared UI pieces.
import { useEffect, useState, type ReactNode } from 'react';
import { addDays, formatLongDate, todayISO } from '../logic/dates';
import type { Status } from '../logic/analytics';
import type { ISODate } from '../shared/types';
import { Icon } from './Icon';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <h2>{title}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A confirm dialog built into the page (no window.confirm). */
export function Confirm({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet title={title} onClose={onCancel}>
      <div className="muted">{message}</div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

export function DateNav({ date, onChange }: { date: ISODate; onChange: (d: ISODate) => void }) {
  const isToday = date === todayISO();
  return (
    <div className="row">
      <button className="btn icon ghost" onClick={() => onChange(addDays(date, -1))} aria-label="Previous day">
        <Icon name="left" />
      </button>
      <label className="row" style={{ position: 'relative', cursor: 'pointer' }}>
        <span style={{ fontWeight: 600 }}>{isToday ? 'Today' : formatLongDate(date)}</span>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="Pick a date"
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%' }}
        />
      </label>
      <button className="btn icon ghost" onClick={() => onChange(addDays(date, 1))} aria-label="Next day">
        <Icon name="right" />
      </button>
      {!isToday && (
        <button className="btn sm ghost" onClick={() => onChange(todayISO())}>
          Today
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value, max, status }: { value: number; max: number; status: Status }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={status} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Number input that keeps its own text while typing and commits a number (or null when empty)
 * on blur / Enter / after a short pause, so each keystroke doesn't write to the database.
 */
export function NumberInput({
  value,
  onCommit,
  step = 'any',
  placeholder,
  ariaLabel,
  className = 'input num',
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  step?: number | 'any';
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  // Only text the user has typed is ever committed; otherwise we mirror the latest value.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setText(value === null ? '' : String(value));
  }, [value, dirty]);

  const commit = (t: string) => {
    if (!dirty) return;
    setDirty(false);
    const n = t.trim() === '' ? null : Number(t);
    if (n !== null && !Number.isFinite(n)) return;
    if (n !== value) onCommit(n);
  };

  useEffect(() => {
    if (!dirty) return;
    const id = window.setTimeout(() => commit(text), 800);
    return () => window.clearTimeout(id);
    // commit only depends on text/value; re-arming on every render is intended
    // oxlint-disable-next-line react/exhaustive-deps
  }, [text, dirty]);

  return (
    <input
      className={className}
      type="number"
      inputMode="decimal"
      step={step}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onBlur={() => commit(text)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      onChange={(e) => {
        setText(e.target.value);
        setDirty(true);
      }}
    />
  );
}

/** Big −/+ stepper around a number input (focus mode, log sheet). */
export function Stepper({
  value,
  onChange,
  step,
  min = 0,
  label,
  unit,
  large,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  label: string;
  unit?: string;
  large?: boolean;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.round(v * 100) / 100));
  return (
    <div className={`stepper ${large ? 'lg' : ''}`}>
      <span className="stepper-label">
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
      <div className="stepper-row">
        <button type="button" className="stepper-btn" onClick={() => set(value - step)} aria-label={`Decrease ${label}`}>
          <Icon name="minus" size={26} />
        </button>
        <input
          className="stepper-input"
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => set(e.target.value === '' ? 0 : Number(e.target.value))}
          aria-label={label}
        />
        <button type="button" className="stepper-btn" onClick={() => set(value + step)} aria-label={`Increase ${label}`}>
          <Icon name="plus" size={26} />
        </button>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
