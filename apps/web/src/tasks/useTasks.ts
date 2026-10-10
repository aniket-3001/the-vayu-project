import { useState } from 'react';
import { TODAY } from '../exposure/model';
import { POINTS } from './model';
import { loadDone, rankFor, saveDone, streak, toggle, type Done } from './store';

/** Which tasks are done, and what that adds up to. Kept on this device. */
export function useTasks(storage: Storage = window.localStorage): {
  readonly done: ReadonlySet<string>;
  readonly points: number;
  readonly streak: number;
  readonly rank: ReturnType<typeof rankFor>;
  readonly toggle: (id: string) => void;
} {
  const [all, setAll] = useState<Done>(() => loadDone(storage));
  const points = Object.values(all)
    .flat()
    .reduce(
      (sum, id) => sum + ((POINTS as Readonly<Record<string, number | undefined>>)[id] ?? 0),
      0,
    );
  return {
    done: new Set(all[TODAY] ?? []),
    points,
    streak: streak(all, TODAY),
    rank: rankFor(points),
    toggle: (id) => {
      const next = toggle(all, TODAY, id);
      saveDone(storage, next);
      setAll(next);
    },
  };
}
