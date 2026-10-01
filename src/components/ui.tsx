// Small shared UI pieces.
import { useEffect, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { addDays, formatFullDate, relativeDayLabel, todayISO } from '../logic/dates';
import { backToToday, navigate, pathWith, useLocation } from '../router';
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

/**
 * ‹ date › with fixed-width parts, so stepping through days never moves the arrows or shifts
 * the content below. The "Today" pill keeps its space and is only hidden when on today.
 */
export function DateNav({ date, onChange }: { date: ISODate; onChange: (d: ISODate) => void }) {
  const today = todayISO();
  const isToday = date === today;
  const picker = useRef<HTMLInputElement>(null);
  // Desktop browsers only open the calendar from its icon; iOS opens it on tap (and may throw here).
  const openPicker = () => {
    try {
      picker.current?.showPicker();
    } catch {
      // already open, or not supported
    }
  };
  return (
    <div className="date-nav">
      <button className="btn icon ghost" onClick={() => onChange(addDays(date, -1))} aria-label="Previous day">
        <Icon name="left" />
      </button>
      <label className="date-nav-label" title={formatFullDate(date)} onClick={openPicker}>
        <span>{relativeDayLabel(date, today)}</span>
        <input
          ref={picker}
          type="date"
          value={date}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="Pick a date"
        />
      </label>
      <button className="btn icon ghost" onClick={() => onChange(addDays(date, 1))} aria-label="Next day">
        <Icon name="right" />
      </button>
      <button
        className="btn sm ghost date-nav-today"
        style={{ visibility: isToday ? 'hidden' : 'visible' }}
        aria-hidden={isToday}
        tabIndex={isToday ? -1 : 0}
        onClick={() => onChange(today)}
      >
        Today
      </button>
    </div>
  );
}

/** An in-app link: a real href (open in new tab, long-press) that navigates with history state. */
export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <a
      href={`#${to}`}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * "‹ Today", shown on screens opened from a Today widget (?from=today). In the installed iOS
 * app, where there's no system back gesture, a swipe in from the left edge does the same.
 */
export function BackToToday() {
  const show = useLocation().params.get('from') === 'today';
  useEffect(() => {
    if (!show || !isStandalone()) return;
    let start: { x: number; y: number } | null = null;
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      start = t.clientX < 24 ? { x: t.clientX, y: t.clientY } : null;
    };
    const up = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (start && t.clientX - start.x > 80 && Math.abs(t.clientY - start.y) < 60) backToToday();
      start = null;
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchend', up, { passive: true });
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchend', up);
    };
  }, [show]);
  if (!show) return null;
  return (
    <button className="btn sm ghost back-link" onClick={backToToday}>
      <Icon name="left" size={20} />
      Today
    </button>
  );
}

/** Segmented control whose segments are routes (e.g. /log/diet, /log/weight). */
export function SubNav({ label, items }: { label: string; items: { sub: string; label: string }[] }) {
  const loc = useLocation();
  return (
    <div className="segmented sub-nav" role="group" aria-label={label}>
      {items.map((i) => (
        <button key={i.sub} aria-pressed={loc.sub === i.sub} onClick={() => navigate(pathWith(loc, { sub: i.sub }), { replace: true })}>
          {i.label}
        </button>
      ))}
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

/** A settings-style card with a title. */
export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="stack" style={{ gap: 2 }}>
        <h2>{title}</h2>
        {subtitle && <p className="small muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function Num({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number | null) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <NumberInput value={value} onCommit={onCommit} />
    </label>
  );
}

/** "ⓘ How is this calculated?" — a plain disclosure explaining a rule-based calculation. */
export function Explainer({ title = 'How is this calculated?', children }: { title?: string; children: ReactNode }) {
  return (
    <details className="explainer">
      <summary>
        <Icon name="info" size={18} />
        {title}
      </summary>
      <div className="explainer-body">
        {children}
        <p className="xs muted">Calculated on your device from your logged data. No AI is used.</p>
      </div>
    </details>
  );
}
