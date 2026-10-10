export const TASKS_STORAGE_KEY = 'vayu.tasks.v1';

/** For each India date, the ids of the tasks done that day. */
export type Done = Readonly<Record<string, readonly string[]>>;

export function loadDone(storage: Storage): Done {
  try {
    const raw = storage.getItem(TASKS_STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const done: Record<string, string[]> = {};
    for (const [date, ids] of Object.entries(parsed)) {
      if (Array.isArray(ids)) done[date] = ids.filter((id): id is string => typeof id === 'string');
    }
    return done;
  } catch {
    return {};
  }
}

export function saveDone(storage: Storage, done: Done): void {
  try {
    storage.setItem(TASKS_STORAGE_KEY, JSON.stringify(done));
  } catch {
    // Best effort.
  }
}

/** Marks a task done on a date, or undoes it. */
export function toggle(done: Done, date: string, id: string): Done {
  const today = done[date] ?? [];
  const next = today.includes(id) ? today.filter((x) => x !== id) : [...today, id];
  return { ...done, [date]: next };
}

const dayBefore = (date: string): string =>
  new Date(Date.parse(`${date}T12:00:00+05:30`) - 86_400_000).toISOString().slice(0, 10);

/** Days in a row, ending today, on which at least one task was done. Today counts once something is done. */
export function streak(done: Done, today: string): number {
  let count = 0;
  let day = (done[today]?.length ?? 0) > 0 ? today : dayBefore(today);
  while ((done[day]?.length ?? 0) > 0) {
    count += 1;
    day = dayBefore(day);
  }
  return count;
}

export interface Rank {
  readonly name: string;
  readonly from: number;
}

export const RANKS: readonly Rank[] = [
  { name: 'Getting started', from: 0 },
  { name: 'Steady', from: 100 },
  { name: 'Air-wise', from: 300 },
  { name: 'Clear-headed', from: 700 },
];

export const rankFor = (
  points: number,
): { readonly rank: Rank; readonly next: Rank | undefined } => {
  let index = 0;
  RANKS.forEach((rank, i) => {
    if (points >= rank.from) index = i;
  });
  return { rank: RANKS[index] ?? { name: 'Getting started', from: 0 }, next: RANKS[index + 1] };
};
