import { useEffect, useMemo, useState } from 'react';
import { firesAffecting, fetchFires, type Fire } from '../map/fires';
import { recall, remember } from '../map/live';
import { API_URL } from '../config';
import { weekScene } from '../week/active';

interface Seen {
  readonly count: number;
  readonly fires: readonly Fire[];
}

const isSeen = (value: unknown): value is Seen =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Seen).count === 'number' &&
  Array.isArray((value as Seen).fires);

/**
 * How many fires seen by satellite in the last day can reach this place: those within 100 km, and those upwind within
 * 300 km. Undefined while it loads or if our API cannot be reached, so nothing is said without a count.
 */
export function useFires(
  place?: { readonly lat: number; readonly lng: number },
  windFromDeg?: number,
  fetchImpl: typeof fetch = fetch,
): number | undefined {
  const [seen, setSeen] = useState<Seen | undefined>(() => {
    const saved = recall('firelist');
    return isSeen(saved) ? saved : undefined;
  });
  useEffect(() => {
    if (weekScene() !== undefined) return undefined;
    let current = true;
    fetchFires(API_URL, fetchImpl).then(
      (found) => {
        if (current && found !== undefined) {
          remember('firelist', found);
          setSeen(found);
        }
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [fetchImpl]);
  const lat = place?.lat;
  const lng = place?.lng;
  return useMemo(() => {
    // A recorded day counts the fires recorded for it, never today's.
    const recorded = weekScene()?.fires;
    if (recorded !== undefined && lat !== undefined && lng !== undefined)
      return firesAffecting(recorded, { lat, lng }, windFromDeg).length;
    if (seen === undefined || lat === undefined || lng === undefined) return undefined;
    return firesAffecting(seen.fires, { lat, lng }, windFromDeg).length;
  }, [seen, lat, lng, windFromDeg]);
}
