// Backup helpers: validate an import file and build CSV exports. Pure functions (no Firestore).

import type { DayEntry, ExportFile, WorkoutSession } from '../shared/types';

export function parseBackup(text: string): ExportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t valid JSON.');
  }
  const f = data as Partial<ExportFile>;
  if (f?.app !== 'gymplan' || f.version !== 1 || !f.settings || !Array.isArray(f.days) || !Array.isArray(f.sessions)) {
    throw new Error('That file isn’t a Gymplan backup.');
  }
  return f as ExportFile;
}

function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v === null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

export function workoutsCsv(sessions: WorkoutSession[], units: string): string {
  const rows: (string | number | null)[][] = [
    ['date', 'workout', 'exercise', 'muscle_group', 'round', 'status', `weight_${units}`, 'reps', 'rpe', 'assisted'],
  ];
  for (const s of [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const st of s.steps) {
      if (st.kind !== 'exercise') continue;
      rows.push([
        s.date, s.workoutName, st.exerciseName, st.muscleGroup, st.round, st.status,
        st.result?.weight ?? null, st.result?.reps ?? null, st.result?.rpe ?? null, st.assisted ? 'yes' : 'no',
      ]);
    }
  }
  return csv(rows);
}

export function nutritionCsv(days: DayEntry[]): string {
  const rows: (string | number | null)[][] = [['date', 'kcal', 'protein_g', 'fat_g', 'carbs_g']];
  for (const d of [...days].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (d.kcal === null && d.protein === null && d.fat === null && d.carbs === null) continue;
    rows.push([d.date, d.kcal, d.protein, d.fat, d.carbs]);
  }
  return csv(rows);
}

export function weightCsv(days: DayEntry[], units: string): string {
  const rows: (string | number | null)[][] = [['date', `weight_${units}`]];
  for (const d of [...days].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (d.weight !== null) rows.push([d.date, d.weight]);
  }
  return csv(rows);
}

/**
 * Save a file. In the iOS Home Screen app plain downloads are unreliable, so use the share
 * sheet (Save to Files) when it can share files; otherwise fall back to a download link.
 */
export async function saveFile(name: string, text: string, type: string): Promise<void> {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
