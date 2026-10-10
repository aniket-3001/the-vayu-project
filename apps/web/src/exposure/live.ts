import { today, hoursSoFar, type LiveLog } from './model';

export const LIVE_STORAGE_KEY = 'vayu.live.v1';

export function loadLive(storage: Storage): LiveLog {
  try {
    const raw = storage.getItem(LIVE_STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as Record<string, { lat?: unknown; lng?: unknown }>;
    const log: Record<string, { lat: number; lng: number }> = {};
    for (const [hour, fix] of Object.entries(parsed)) {
      if (typeof fix.lat === 'number' && typeof fix.lng === 'number')
        log[hour] = { lat: fix.lat, lng: fix.lng };
    }
    return log;
  } catch {
    return {};
  }
}

export function saveLive(storage: Storage, log: LiveLog): void {
  try {
    storage.setItem(LIVE_STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Best effort.
  }
}

/** The hour a fix belongs to. All the prototype's data is for the sample moment, so a fix lands on its hour. */
export const currentHour = (): number => hoursSoFar(today());

/** Records where the person is for the current hour; a later fix in the same hour replaces the earlier one. */
export function recordFix(
  log: LiveLog,
  lat: number,
  lng: number,
  hour: number = currentHour(),
): LiveLog {
  return { ...log, [String(hour)]: { lat, lng } };
}
