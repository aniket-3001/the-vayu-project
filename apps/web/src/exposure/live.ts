import { TODAY, hoursSoFar, type LiveLog } from './model';
import { sampleSpotsFor } from './spots';

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
export const currentHour = (): number => hoursSoFar(TODAY);

/** Records where the person is for the current hour; a later fix in the same hour replaces the earlier one. */
export function recordFix(
  log: LiveLog,
  lat: number,
  lng: number,
  hour: number = currentHour(),
): LiveLog {
  return { ...log, [String(hour)]: { lat, lng } };
}

const spotPin = (kind: 'work' | 'outdoor'): { lat: number; lng: number } => {
  const pin = sampleSpotsFor('adult')[kind]?.pin;
  return { lat: pin?.lat ?? 28.6, lng: pin?.lng ?? 77.2 };
};

/**
 * A made-up day of movement, so the live ring can be shown without waiting a day: a commute, a lunch
 * walk in the park, an errand across town, and the park again. It is labelled as a sample wherever it shows.
 */
export const SAMPLE_TRACK: LiveLog = {
  '8': { lat: 28.61, lng: 77.1 },
  '9': spotPin('work'),
  '10': spotPin('work'),
  '11': spotPin('work'),
  '12': spotPin('work'),
  '13': spotPin('outdoor'),
  '14': spotPin('work'),
  '15': { lat: 28.6139, lng: 77.209 },
  '16': { lat: 28.6139, lng: 77.209 },
  '17': spotPin('outdoor'),
};
