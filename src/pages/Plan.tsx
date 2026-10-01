import { ExerciseLibrary, WeeklySplitEditor, WorkoutsEditor } from '../components/SplitEditor';
import { Num, Section, SubNav } from '../components/ui';
import { useLocation } from '../router';
import type { AdjustmentRule, NutritionTargets, Settings } from '../shared/types';
import { useAppData } from '../state/AppData';

export function Plan() {
  const { sub } = useLocation();
  return (
    <div className="page">
      <div className="page-header">
        <h1>Plan</h1>
      </div>
      <SubNav
        label="Plan section"
        items={[
          { sub: 'workouts', label: 'Workouts' },
          { sub: 'library', label: 'Exercises' },
          { sub: 'nutrition', label: 'Nutrition' },
        ]}
      />
      {sub === 'library' ? (
        <Section title="Exercise library" subtitle="Rest type picks the default rest (Settings → Rest timings).">
          <ExerciseLibrary />
        </Section>
      ) : sub === 'nutrition' ? (
        <NutritionTargetsEditor />
      ) : (
        <>
          <Section title="Weekly schedule" subtitle="Which workout runs on each weekday.">
            <WeeklySplitEditor />
          </Section>
          <Section title="Workouts" subtitle="Blocks run top to bottom. Add a second exercise to a block to make a superset.">
            <WorkoutsEditor />
          </Section>
        </>
      )}
    </div>
  );
}

function NutritionTargetsEditor() {
  const { settings, updateSettings } = useAppData();
  const set = (fn: (s: Settings) => Settings) => updateSettings(fn);
  const setNutrition = (k: keyof NutritionTargets) => (v: number | null) =>
    v !== null && set((s) => ({ ...s, nutrition: { ...s.nutrition, [k]: v } }));
  const setRule = (k: keyof AdjustmentRule) => (v: number | null) =>
    v !== null && set((s) => ({ ...s, adjustment: { ...s.adjustment, [k]: v } }));
  const n = settings.nutrition;
  const a = settings.adjustment;

  return (
    <>
      <Section title="Nutrition targets">
        <div className="grid cols-2">
          <Num label="Maintenance kcal" value={n.maintenanceKcal} onCommit={setNutrition('maintenanceKcal')} />
          <Num label="Daily target kcal" value={n.kcalTarget} onCommit={setNutrition('kcalTarget')} />
          <Num label="Target range: min kcal" value={n.kcalMin} onCommit={setNutrition('kcalMin')} />
          <Num label="Target range: max kcal" value={n.kcalMax} onCommit={setNutrition('kcalMax')} />
          <Num label="Protein min (g)" value={n.proteinMin} onCommit={setNutrition('proteinMin')} />
          <Num label="Protein max (g)" value={n.proteinMax} onCommit={setNutrition('proteinMax')} />
          <Num label="Fat min (g)" value={n.fatMin} onCommit={setNutrition('fatMin')} />
          <Num label="Fat max (g)" value={n.fatMax} onCommit={setNutrition('fatMax')} />
        </div>
        <p className="xs muted">Carbs fill whatever calories remain.</p>
      </Section>
      <Section title={`Weight gain target (${settings.units}/week)`} subtitle="And how much to change calories when you're outside it.">
        <div className="grid cols-2">
          <Num label="Min gain" value={a.gainMinPerWeek} onCommit={setRule('gainMinPerWeek')} />
          <Num label="Max gain" value={a.gainMaxPerWeek} onCommit={setRule('gainMaxPerWeek')} />
          <Num label="Adjust by (min kcal)" value={a.kcalStepMin} onCommit={setRule('kcalStepMin')} />
          <Num label="Adjust by (max kcal)" value={a.kcalStepMax} onCommit={setRule('kcalStepMax')} />
        </div>
      </Section>
    </>
  );
}
