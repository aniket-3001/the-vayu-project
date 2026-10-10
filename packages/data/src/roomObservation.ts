import type { Reading, RoomObservation } from '@vayu/contracts';
import { ageMinutes, availableHours, median, toIso, toMs } from '@vayu/core';
import type { StationSnapshot } from './harvest';

const WINDOW_MS = 30 * 60_000;
const HOUR_MS = 3_600_000;

export interface OutsideReference {
  readonly pm25: number | null;
  readonly observedAt: string | null;
}

/**
 * The unit's view of the room as of `asOf`: the median PM2.5 over the last 30 minutes (so one wild
 * reading does not move it), when it was last seen, and the humidity then. Readings flagged as
 * faults or stale are not used for the number but still show that the unit is alive. Nothing after
 * `asOf` is used.
 */
export function roomObservation(input: {
  readonly roomId: string;
  readonly roomName: string;
  readonly asOf: string;
  readonly readings: readonly Reading[];
  readonly outside: OutsideReference;
  /** How far back to look. The default is 30 minutes. */
  readonly windowMs?: number;
  /** Use only readings taken after this instant (for example, after a fix was started). */
  readonly after?: string;
}): RoomObservation {
  const asOfMs = toMs(input.asOf);
  const seen = input.readings
    .filter(
      (reading) =>
        toMs(reading.ts) <= asOfMs &&
        asOfMs - toMs(reading.ts) <= (input.windowMs ?? WINDOW_MS) &&
        (input.after === undefined || toMs(reading.ts) > toMs(input.after)),
    )
    .sort((a, b) => toMs(b.ts) - toMs(a.ts));
  const usable = seen.filter(
    (reading) =>
      reading.pm25 !== null &&
      !reading.flags.includes('out_of_range') &&
      !reading.flags.includes('stale'),
  );
  const values = usable.flatMap((reading) => (reading.pm25 === null ? [] : [reading.pm25]));
  const newest = usable[0];
  const newestWithHumidity = usable.find((reading) => reading.rhPct !== undefined);
  const newestSeen = seen[0];

  return {
    roomId: input.roomId,
    roomName: input.roomName,
    asOf: input.asOf,
    insidePm25: values.length === 0 ? null : Math.round(median(values) * 10) / 10,
    insideObservedAt: newest?.ts ?? null,
    rhPct: newestWithHumidity?.rhPct ?? null,
    outsidePm25: input.outside.pm25,
    outsideObservedAt: input.outside.observedAt,
    lastSeenMinutes: newestSeen === undefined ? null : ageMinutes(newestSeen.ts, input.asOf),
    simulated: seen.some((reading) => reading.simulated),
  };
}

/** The newest outdoor hour, from the harvest's latest answer for a place, that had ended by `asOf`. */
export function latestOutside(
  snapshot: StationSnapshot | undefined,
  asOf: string,
): OutsideReference {
  const none: OutsideReference = { pm25: null, observedAt: null };
  if (snapshot?.status !== 'fresh') return none;
  const newest = availableHours(snapshot.hours, asOf)
    .filter((hour) => hour.pm25 !== null)
    .at(-1);
  if (newest?.pm25 === undefined || newest.pm25 === null) return none;
  return { pm25: newest.pm25, observedAt: toIso(toMs(newest.hourStart) + HOUR_MS) };
}
