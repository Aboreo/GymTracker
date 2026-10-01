import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { axisProps, ChartCard, dateTick, Legend, tooltipProps, useChartColors } from '../components/charts';
import { Empty, Explainer } from '../components/ui';
import {
  caloriesVsWeight,
  daysOnTarget,
  exerciseHistory,
  exerciseStatus,
  insights,
  loggedSets,
  MIN_WEEKS_FOR_INSIGHTS,
  rollingAverage,
  streakWeeks,
  weeklyAdherence,
  weeklyNutrition,
  weeklyVolume,
  type Insight,
} from '../logic/analytics';
import { addDays, daysBetween, todayISO } from '../logic/dates';
import { MUSCLE_GROUPS, type DayEntry, type MuscleGroup } from '../shared/types';
import { useAppData } from '../state/AppData';

type Range = '4w' | '12w' | 'all';
const RANGE_LABEL: Record<Range, string> = { '4w': '4 weeks', '12w': '12 weeks', all: 'All time' };

export function Dashboard() {
  const app = useAppData();
  const { settings } = app;
  const c = useChartColors();
  const [range, setRange] = useState<Range>('12w');
  const [loadingAll, setLoadingAll] = useState(false);
  const today = todayISO();
  const u = settings.units;

  const allDays = useMemo(() => [...app.days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), [app.days]);
  const firstDate = useMemo(() => {
    const dates = [...allDays.map((d) => d.date), ...app.sessions.map((s) => s.date)].sort();
    return dates[0] ?? today;
  }, [allDays, app.sessions, today]);
  const from = range === '4w' ? addDays(today, -27) : range === '12w' ? addDays(today, -83) : firstDate;

  // Everything below is computed from memory: changing the range never queries Firestore.
  const days = useMemo(() => allDays.filter((d) => d.date >= from), [allDays, from]);
  const sessions = useMemo(() => app.sessions.filter((s) => s.date >= from), [app.sessions, from]);
  const sets = useMemo(() => loggedSets(sessions), [sessions]);
  const allSets = useMemo(() => loggedSets(app.sessions), [app.sessions]);

  const report = useMemo(
    () => insights({ sessions, days, nutrition: settings.nutrition, rule: settings.adjustment, units: u, today }),
    [sessions, days, settings.nutrition, settings.adjustment, u, today],
  );

  const pickRange = async (r: Range) => {
    setRange(r);
    if (r === 'all' && !app.allTimeLoaded) {
      setLoadingAll(true);
      try {
        await app.loadAllTime();
      } finally {
        setLoadingAll(false);
      }
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="segmented" role="group" aria-label="Date range">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button key={r} aria-pressed={range === r} onClick={() => void pickRange(r)}>
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      {loadingAll && <p className="small muted">Loading older data…</p>}

      <div className="grid cols-2">
        <InsightsCard working={report.working} notWorking={report.notWorking} enough={report.enoughData} weeks={report.weeksOfData} />
        <StrengthCard sets={sets} allSets={allSets} today={today} units={u} c={c} />
        <VolumeCard sets={sets} units={u} c={c} />
        <BodyweightCard days={days} c={c} />
        <NutritionCard days={days} c={c} />
        <CaloriesVsWeightCard days={days} c={c} />
        <AdherenceCard from={from} today={today} c={c} />
      </div>
    </div>
  );
}

type C = ReturnType<typeof useChartColors>;

/** Tooltip values/labels arrive loosely typed from Recharts. */
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));
const weekLabel = (l: unknown) => (typeof l === 'string' ? `Week of ${dateTick(l)}` : '');

// ---------------------------------------------------------------------------------------------

function InsightsCard({ working, notWorking, enough, weeks }: { working: Insight[]; notWorking: Insight[]; enough: boolean; weeks: number }) {
  const item = (i: Insight, k: number) => (
    <li key={k} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
      <span className={`dot ${i.tone === 'good' ? 'good' : i.tone === 'warn' ? 'caution' : ''}`} style={{ marginTop: 6 }} />
      <span className="small">{i.text}</span>
    </li>
  );
  return (
    <ChartCard title="What’s working / what’s not" subtitle="Patterns in your logged data. Correlations aren’t proof." wide>
      {!enough ? (
        <Empty>
          Insights need at least {MIN_WEEKS_FOR_INSIGHTS} weeks of logged workouts, meals or weigh-ins. You have {weeks} so far.
        </Empty>
      ) : (
        <div className="grid cols-2">
          <div className="stack">
            <span className="label">Working</span>
            {working.length ? <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none' }}>{working.map(item)}</ul> : <p className="small muted">Nothing stands out yet.</p>}
          </div>
          <div className="stack">
            <span className="label">Worth a look</span>
            {notWorking.length ? <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none' }}>{notWorking.map(item)}</ul> : <p className="small muted">No red flags.</p>}
          </div>
        </div>
      )}
      <InsightsExplainer />
    </ChartCard>
  );
}

// Mirrors insights() and the helpers it uses in logic/analytics.ts. Keep the numbers in sync.
function InsightsExplainer() {
  const { settings } = useAppData();
  const n = settings.nutrition;
  const a = settings.adjustment;
  const u = settings.units;
  return (
    <Explainer title="How are these insights calculated?">
      <p>
        Each insight is a fixed rule applied to your logged data. Insights appear once you have at least {MIN_WEEKS_FOR_INSIGHTS} different
        weeks with logged sets, weigh-ins or calories. Only logged sets count: pending and “log later” sets are ignored, and custom workouts
        count like any other.
      </p>
      <ul>
        <li>
          <strong>Progressed:</strong> an exercise beat everything before it (heavier top set, more reps at that weight, or a higher
          estimated 1RM using the Epley formula, weight × (1 + reps ÷ 30)) in a session within the last 4 weeks.
        </li>
        <li>
          <strong>Stalled:</strong> an exercise with at least 4 sessions and no improvement in weight, reps or estimated 1RM for its last 3
          or more sessions. For assisted exercises, less assistance counts as better.
        </li>
        <li>
          <strong>Protein:</strong> needs 7 or more days with protein logged. The share of those days at or above {n.proteinMin} g: 60% or
          more is “working”, less is “worth a look”.
        </li>
        <li>
          <strong>Protein and strength:</strong> weeks with 3+ logged days are split into protein weeks (protein hit on 70%+ of days) and
          other weeks. The average weekly change in each exercise’s best estimated 1RM is compared between them. It needs 2+ weeks of each
          and a gap of at least 0.5 percentage points.
        </li>
        <li>
          <strong>Bodyweight rate:</strong> the same rule as Log → Weight. The weekly change comes from weekly averages, the target is +
          {a.gainMinPerWeek} to +{a.gainMaxPerWeek} {u}/week, and it needs 3+ weeks with 2+ weigh-ins each.
        </li>
        <li>
          <strong>Lower volume:</strong> sets per muscle group over the last 4 weeks. A group is flagged when it has fewer than half the sets
          of the median group. It needs 3+ groups trained.
        </li>
        <li>
          <strong>Calories and lifting:</strong> a correlation (Pearson’s r) between average calories and lifting change across weeks
          that have both, with at least {MIN_WEEKS_FOR_INSIGHTS} such weeks. |r| ≥ 0.5 is a “fairly clear” link, 0.3–0.5 is “weak”, and
          below that there is no clear link. A correlation is a pattern, not proof that one causes the other.
        </li>
        <li>
          <strong>Adherence chart:</strong> completed planned workouts per week, compared with the non-rest days in your weekly schedule.
          Custom workouts don’t count toward it.
        </li>
      </ul>
    </Explainer>
  );
}

// ---------------------------------------------------------------------------------------------

function StrengthCard({
  sets,
  allSets,
  today,
  units,
  c,
}: {
  sets: ReturnType<typeof loggedSets>;
  allSets: ReturnType<typeof loggedSets>;
  today: string;
  units: string;
  c: C;
}) {
  const exercises = useMemo(() => {
    const m = new Map<string, { name: string; assisted: boolean; n: number }>();
    for (const s of sets) m.set(s.exerciseId, { name: s.exerciseName, assisted: s.assisted, n: (m.get(s.exerciseId)?.n ?? 0) + 1 });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [sets]);
  const [picked, setPicked] = useState<string | null>(null);
  const id = picked && exercises.some(([e]) => e === picked) ? picked : (exercises[0]?.[0] ?? null);
  const info = exercises.find(([e]) => e === id)?.[1];
  const points = useMemo(() => (id ? exerciseHistory(sets, id) : []), [sets, id]);
  // Status is judged on full history, not just the visible range.
  const status = useMemo(() => (id && info ? exerciseStatus(exerciseHistory(allSets, id), info.assisted, today) : null), [allSets, id, info, today]);

  return (
    <ChartCard
      title="Strength"
      subtitle={info?.assisted ? `Assistance used (${units}): lower is better` : `Top-set weight and estimated 1RM (Epley), ${units}`}
      right={status && (status.stalled ? <span className="badge caution">Stalled</span> : status.progressed ? <span className="badge good">Improving</span> : null)}
      wide
    >
      {exercises.length === 0 ? (
        <Empty>Log a few sets in focus mode to see strength trends.</Empty>
      ) : (
        <>
          <select className="input" style={{ maxWidth: 320 }} value={id ?? ''} onChange={(e) => setPicked(e.target.value)} aria-label="Exercise">
            {exercises.map(([eid, e]) => (
              <option key={eid} value={eid}>
                {e.name}
              </option>
            ))}
          </select>
          {points.length < 2 ? (
            <Empty>One session logged. Log this exercise again to see a trend.</Empty>
          ) : (
            <>
              <Legend
                items={
                  info?.assisted
                    ? [{ label: 'Assistance', color: c['chart-top-set'] }]
                    : [
                        { label: 'Top set', color: c['chart-top-set'] },
                        { label: 'Estimated 1RM', color: c['chart-e1rm'] },
                      ]
                }
              />
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid vertical={false} stroke={c['chart-grid']} />
                  <XAxis dataKey="date" tickFormatter={dateTick} {...axisProps(c)} minTickGap={24} />
                  <YAxis {...axisProps(c)} domain={['auto', 'auto']} width={48} />
                  <Tooltip
                    {...tooltipProps(c)}
                    formatter={(v, name) => [`${num(v)} ${units}`, name]}
                  />
                  <Line type="monotone" dataKey="topWeight" name={info?.assisted ? 'Assistance' : 'Top set'} stroke={c['chart-top-set']} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  {!info?.assisted && (
                    <Line type="monotone" dataKey="e1rm" name="Estimated 1RM" stroke={c['chart-e1rm']} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------------------------

function VolumeCard({ sets, units, c }: { sets: ReturnType<typeof loggedSets>; units: string; c: C }) {
  const weeks = useMemo(() => weeklyVolume(sets), [sets]);
  const groups = useMemo(
    () => MUSCLE_GROUPS.filter((g) => weeks.some((w) => (w.setsByGroup[g] ?? 0) > 0)),
    [weeks],
  );
  const fmt = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));
  return (
    <ChartCard title="Weekly volume" subtitle={`Sets × reps × weight (${units}). Assisted sets excluded.`} wide>
      {weeks.length === 0 ? (
        <Empty>Log workouts to see weekly volume.</Empty>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeks} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke={c['chart-grid']} />
              <XAxis dataKey="week" tickFormatter={dateTick} {...axisProps(c)} minTickGap={16} />
              <YAxis {...axisProps(c)} tickFormatter={fmt} width={48} />
              <Tooltip {...tooltipProps(c)} cursor={{ fill: c['chart-grid'] }} labelFormatter={weekLabel} formatter={(v) => [`${Math.round(Number(v)).toLocaleString()} ${units}`, 'Volume']} />
              <Bar dataKey="total" fill={c['chart-volume']} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          <span className="label">By muscle group</span>
          <div className="small-multiples">
            {groups.map((g) => (
              <GroupSpark key={g} group={g} weeks={weeks} c={c} fmt={fmt} units={units} />
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}

function GroupSpark({ group, weeks, c, fmt, units }: { group: MuscleGroup; weeks: ReturnType<typeof weeklyVolume>; c: C; fmt: (v: number) => string; units: string }) {
  const data = weeks.map((w) => ({ week: w.week, v: w.byGroup[group] ?? 0, sets: w.setsByGroup[group] ?? 0 }));
  const avgSets = data.reduce((a, d) => a + d.sets, 0) / Math.max(1, data.length);
  const last = data[data.length - 1];
  return (
    <div className="spark">
      <div className="row spread">
        <span className="small" style={{ fontWeight: 600, textTransform: 'capitalize' }}>
          {group}
        </span>
        <span className="xs muted">{avgSets.toFixed(1)} sets/wk</span>
      </div>
      <ResponsiveContainer width="100%" height={56}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Tooltip {...tooltipProps(c)} cursor={{ fill: c['chart-grid'] }} labelFormatter={weekLabel} formatter={(v) => [`${fmt(Number(v))} ${units}`, 'Volume']} />
          <Bar dataKey="v" fill={c['chart-volume']} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <span className="xs muted">This week: {fmt(last?.v ?? 0)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function BodyweightCard({ days, c }: { days: DayEntry[]; c: C }) {
  const { settings } = useAppData();
  const u = settings.units;
  const { gainMinPerWeek: lo, gainMaxPerWeek: hi } = settings.adjustment;
  const data = useMemo(() => {
    const pts = rollingAverage(days);
    if (!pts.length) return [];
    const anchor = pts[0];
    return pts.map((p) => {
      const wk = daysBetween(anchor.date, p.date) / 7;
      return { ...p, band: [Math.round((anchor.avg + lo * wk) * 10) / 10, Math.round((anchor.avg + hi * wk) * 10) / 10] };
    });
  }, [days, lo, hi]);

  return (
    <ChartCard title="Bodyweight" subtitle={`Morning weigh-ins and 7-day average, ${u}. Shaded: +${lo}–${hi} ${u}/week target.`}>
      {data.length < 3 ? (
        <Empty>Log your morning weight on a few days to see the trend.</Empty>
      ) : (
        <>
          <Legend
            items={[
              { label: 'Weigh-in', color: c['chart-bodyweight'], dashed: true },
              { label: '7-day average', color: c['chart-bodyweight'] },
              { label: 'Target band', color: c.good },
            ]}
          />
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke={c['chart-grid']} />
              <XAxis dataKey="date" tickFormatter={dateTick} {...axisProps(c)} minTickGap={24} />
              <YAxis {...axisProps(c)} domain={['dataMin - 1', 'dataMax + 1']} width={48} tickFormatter={(v: number) => v.toFixed(0)} />
              <Tooltip
                {...tooltipProps(c)}
                formatter={(v, name) => (Array.isArray(v) ? [`${num(v[0])}–${num(v[1])} ${u}`, name] : [`${num(v)} ${u}`, name])}
              />
              <Area dataKey="band" name="Target band" stroke="none" fill={c['chart-target-band']} isAnimationActive={false} activeDot={false} />
              <Line dataKey="weight" name="Weigh-in" stroke="none" dot={{ r: 3, fill: c['chart-bodyweight'], fillOpacity: 0.45, stroke: 'none' }} activeDot={{ r: 5 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="avg" name="7-day average" stroke={c['chart-bodyweight']} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------------------------

function NutritionCard({ days, c }: { days: DayEntry[]; c: C }) {
  const { settings } = useAppData();
  const t = settings.nutrition;
  const logged = useMemo(() => days.filter((d) => d.kcal !== null || d.protein !== null), [days]);
  const weekly = useMemo(() => weeklyNutrition(days, t), [days, t]);
  const onTarget = daysOnTarget(days, t);
  const recentWeek = weekly[weekly.length - 1];

  return (
    <ChartCard
      title="Nutrition"
      subtitle={`Days on target (calories in range and protein ≥ ${t.proteinMin} g)`}
      right={logged.length ? <span className={`badge ${onTarget.pct >= 70 ? 'good' : onTarget.pct >= 40 ? 'caution' : 'bad'}`}>{onTarget.pct}% on target</span> : null}
    >
      {logged.length < 3 ? (
        <Empty>Log daily calories and protein to see how you track against targets.</Empty>
      ) : (
        <>
          <p className="label">Calories (kcal) · shaded = target range</p>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={logged} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke={c['chart-grid']} />
              <ReferenceArea y1={t.kcalMin} y2={t.kcalMax} fill={c['chart-target-band']} stroke="none" ifOverflow="extendDomain" />
              <XAxis dataKey="date" tickFormatter={dateTick} {...axisProps(c)} minTickGap={24} />
              <YAxis {...axisProps(c)} domain={['auto', 'auto']} width={48} />
              <Tooltip {...tooltipProps(c)} formatter={(v) => [`${num(v)} kcal`, 'Calories']} />
              <Line type="monotone" dataKey="kcal" stroke={c['chart-calories']} strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="label">Protein (g) · dashed = minimum</p>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={logged} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke={c['chart-grid']} />
              <ReferenceLine y={t.proteinMin} stroke={c.good} strokeDasharray="4 4" ifOverflow="extendDomain" />
              <XAxis dataKey="date" tickFormatter={dateTick} {...axisProps(c)} minTickGap={24} />
              <YAxis {...axisProps(c)} domain={['auto', 'auto']} width={48} />
              <Tooltip {...tooltipProps(c)} formatter={(v) => [`${num(v)} g`, 'Protein']} />
              <Line type="monotone" dataKey="protein" stroke={c['chart-protein']} strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          {recentWeek && (
            <p className="small muted">
              This week: avg {recentWeek.avgKcal ?? '—'} kcal, {recentWeek.avgProtein ?? '—'} g protein · protein hit {recentWeek.proteinHitDays}/{recentWeek.days} days
            </p>
          )}
        </>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------------------------

function CaloriesVsWeightCard({ days, c }: { days: DayEntry[]; c: C }) {
  const { settings } = useAppData();
  const u = settings.units;
  const data = useMemo(() => caloriesVsWeight(days, settings.nutrition), [days, settings.nutrition]);
  return (
    <ChartCard title="Calories vs weight change" subtitle={`Each dot is a week: average calories vs change in weekly-average weight (${u}).`}>
      {data.length < 2 ? (
        <Empty>Needs 3+ consecutive weeks with both calories and weigh-ins logged.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
            <CartesianGrid stroke={c['chart-grid']} />
            <XAxis type="number" dataKey="avgKcal" name="Avg calories" unit=" kcal" domain={['auto', 'auto']} {...axisProps(c)} />
            <YAxis type="number" dataKey="weightChange" name="Weight change" unit={` ${u}`} domain={['auto', 'auto']} {...axisProps(c)} width={56} />
            <ReferenceArea y1={settings.adjustment.gainMinPerWeek} y2={settings.adjustment.gainMaxPerWeek} fill={c['chart-target-band']} stroke="none" ifOverflow="extendDomain" />
            <ReferenceLine y={0} stroke={c['chart-axis']} />
            <Tooltip {...tooltipProps(c)} cursor={{ strokeDasharray: '3 3' }} labelFormatter={() => ''} />
            <Scatter data={data} fill={c['chart-calories']} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------------------------

function AdherenceCard({ from, today, c }: { from: string; today: string; c: C }) {
  const { sessions, settings } = useAppData();
  const weeks = useMemo(() => weeklyAdherence(sessions, settings.plan.split, from, today), [sessions, settings.plan.split, from, today]);
  const streak = streakWeeks(weeks);
  const planned = weeks[0]?.planned ?? 0;
  const done = weeks.reduce((a, w) => a + w.completed, 0);
  return (
    <ChartCard
      title="Adherence"
      subtitle={`Planned workouts completed per week vs ${planned} planned (custom workouts not counted)`}
      right={<span className={`badge ${streak > 0 ? 'good' : ''}`}>{streak}-week streak</span>}
    >
      {done === 0 ? (
        <Empty>Finish a workout to start tracking consistency.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weeks} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke={c['chart-grid']} />
            <XAxis dataKey="week" tickFormatter={dateTick} {...axisProps(c)} minTickGap={16} />
            <YAxis {...axisProps(c)} allowDecimals={false} domain={[0, Math.max(planned, 1)]} width={40} />
            <ReferenceLine y={planned} stroke={c.good} strokeDasharray="4 4" />
            <Tooltip {...tooltipProps(c)} cursor={{ fill: c['chart-grid'] }} labelFormatter={weekLabel} formatter={(v) => [`${num(v)} of ${planned}`, 'Completed']} />
            <Bar dataKey="completed" fill={c['chart-workouts']} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
