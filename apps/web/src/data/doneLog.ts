import { HOUR_MS, toMs } from '@vayu/core';

export interface DoneEntry {
  readonly at: string;
  readonly kind: 'walk' | 'airing';
  readonly avoidedPct: number;
  readonly avoidedMicrogramHours: number;
}

export interface WeekSummary {
  readonly count: number;
  readonly avoidedMicrogramHours: number;
}

const STORAGE_KEY = 'vayu.doneLog.v1';
const WEEK_MS = 7 * 24 * HOUR_MS;

function readLog(storage: Storage): readonly DoneEntry[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DoneEntry[]) : [];
  } catch {
    // Guest-first and best-effort (rule-of-thumb: never let a storage quirk break the screen).
    return [];
  }
}

function writeLog(storage: Storage, entries: readonly DoneEntry[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Full or blocked storage just means no week summary; the Done tap itself still worked.
  }
}

/** Records one "Done" tap and returns the full log, newest last. */
export function addDoneEntry(storage: Storage, entry: DoneEntry): readonly DoneEntry[] {
  const next = [...readLog(storage), entry];
  writeLog(storage, next);
  return next;
}

/** How many times, and how much exposure, was avoided in the last 7 days from `nowIso`. */
export function weekSummary(storage: Storage, nowIso: string): WeekSummary {
  const cutoff = toMs(nowIso) - WEEK_MS;
  const entries = readLog(storage).filter((entry) => toMs(entry.at) >= cutoff);
  return {
    count: entries.length,
    avoidedMicrogramHours: entries.reduce((sum, entry) => sum + entry.avoidedMicrogramHours, 0),
  };
}
