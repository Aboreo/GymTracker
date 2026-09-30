// Shared chart plumbing: colours from design tokens, and consistent axes/tooltip styling.
import { useEffect, useState, type ReactNode } from 'react';
import { formatShortDate } from '../logic/dates';

const TOKENS = [
  'chart-e1rm', 'chart-top-set', 'chart-volume', 'chart-bodyweight', 'chart-calories', 'chart-protein',
  'chart-workouts', 'chart-target-band', 'chart-grid', 'chart-axis', 'surface', 'border', 'text', 'text-2', 'good',
] as const;
export type ChartColors = Record<(typeof TOKENS)[number], string>;

function read(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(TOKENS.map((t) => [t, cs.getPropertyValue(`--${t}`).trim()])) as ChartColors;
}

/** Chart colours from tokens.css, updated when the system theme changes. */
export function useChartColors(): ChartColors {
  const [c, setC] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setC(read());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return c;
}

export const dateTick = (d: string) => formatShortDate(d);

export function axisProps(c: ChartColors) {
  return {
    tick: { fill: c['chart-axis'], fontSize: 12 },
    tickLine: false,
    axisLine: { stroke: c['chart-grid'] },
  } as const;
}

export function tooltipProps(c: ChartColors) {
  return {
    contentStyle: {
      background: c.surface,
      border: `1px solid ${c.border}`,
      borderRadius: 10,
      fontSize: 13,
      color: c.text,
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    },
    labelStyle: { color: c['text-2'], fontWeight: 600, marginBottom: 4 },
    itemStyle: { color: c.text, padding: 0 },
    cursor: { stroke: c['chart-axis'], strokeWidth: 1, strokeDasharray: '3 3' },
    labelFormatter: (l: unknown) => (typeof l === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l) ? formatShortDate(l) : String(l)),
  } as const;
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="row wrap xs" style={{ gap: 14 }}>
      {items.map((i) => (
        <span key={i.label} className="row" style={{ gap: 6, color: 'var(--text-2)' }}>
          <svg width="16" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="16" y2="4" stroke={i.color} strokeWidth="2.5" strokeDasharray={i.dashed ? '3 3' : undefined} strokeLinecap="round" />
          </svg>
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  right,
  children,
  wide,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`card ${wide ? 'span-2' : ''}`}>
      <div className="card-title" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 2 }}>
          <h2>{title}</h2>
          {subtitle && <div className="small muted">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
