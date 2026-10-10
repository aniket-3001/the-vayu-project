import { DeviceMessage, Reading, rules } from '@vayu/contracts';
import { toMs } from '@vayu/core';

/** Where room readings are kept. In AWS this is the Rooms table; in tests it is memory. */
export interface RoomStore {
  /** Keeps one reading. `duplicate` when this exact reading (same unit, time and sequence) is already there. */
  putReading(
    thingId: string,
    reading: Reading,
    expiresAtEpochSeconds: number,
  ): Promise<'stored' | 'duplicate'>;
  /** Readings from `sinceIso` onward, newest first. */
  readingsSince(thingId: string, sinceIso: string): Promise<readonly Reading[]>;
}

export type IngestResult =
  | { readonly status: 'stored'; readonly reading: Reading }
  | { readonly status: 'duplicate' }
  | { readonly status: 'rejected'; readonly reason: string };

/** No real air reads above these. Same limits as the archive reader: a fault is flagged, never clipped. */
const FAULT_ABOVE = { pm25: 1000, pm10: 2000 } as const;
/** A reading that took longer than this to arrive is old news. */
const STALE_AFTER_MS = 2 * 60_000;
/** A time stamp this far ahead of the cloud's clock means the unit's clock is wrong. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const KEEP_SECONDS = 24 * 3600;

/** Unit names end up in database keys, so only plain names are accepted. */
const THING_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Validates one message from a unit and keeps it, with flags that say what to distrust (damp,
 * out of range, stale, simulated). Bad messages are rejected with a reason and nothing is stored.
 * A message delivered twice is stored once.
 */
export async function ingestReading(
  raw: unknown,
  thingId: string,
  store: RoomStore,
  receivedAt: string,
): Promise<IngestResult> {
  if (!THING_ID.test(thingId)) return { status: 'rejected', reason: 'unit name is not allowed' };
  const parsed = DeviceMessage.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'rejected',
      reason: `message does not match the contract: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
    };
  }
  const message = parsed.data;
  const takenMs = Date.parse(message.ts);
  if (Number.isNaN(takenMs)) return { status: 'rejected', reason: 'ts is not a date' };
  const receivedMs = toMs(receivedAt);
  if (takenMs - receivedMs > FUTURE_TOLERANCE_MS) {
    return { status: 'rejected', reason: 'ts is in the future: the unit clock is wrong' };
  }

  const flags: Reading['flags'][number][] = [];
  if (message.simulated === true) flags.push('simulated');
  if (message.rhPct !== undefined && message.rhPct >= rules.verdict.maxRhPct) flags.push('damp');
  if (message.pm25 > FAULT_ABOVE.pm25 || message.pm10 > FAULT_ABOVE.pm10)
    flags.push('out_of_range');
  if (receivedMs - takenMs > STALE_AFTER_MS) flags.push('stale');

  const reading = Reading.parse({
    schemaVersion: 1,
    id: `${thingId}#${message.ts}#${message.seq}`,
    thingId,
    ts: new Date(takenMs).toISOString(),
    ...(message.pm1 === undefined ? {} : { pm1: message.pm1 }),
    pm25: message.pm25,
    ...(message.pm4 === undefined ? {} : { pm4: message.pm4 }),
    pm10: message.pm10,
    ...(message.tempC === undefined ? {} : { tempC: message.tempC }),
    ...(message.rhPct === undefined ? {} : { rhPct: message.rhPct }),
    flags,
    simulated: message.simulated === true,
  });
  const outcome = await store.putReading(
    thingId,
    reading,
    Math.floor(receivedMs / 1000) + KEEP_SECONDS,
  );
  return outcome === 'duplicate' ? { status: 'duplicate' } : { status: 'stored', reading };
}
