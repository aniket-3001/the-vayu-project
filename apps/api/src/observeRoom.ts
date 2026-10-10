import type { RoomObservation } from '@vayu/contracts';
import { toIso, toMs } from '@vayu/core';
import { latestOutside, roomObservation, type RoomStore } from '@vayu/data';
import type { CacheReader } from './roomStores';

export interface RoomsDeps {
  readonly store: RoomStore;
  readonly cache: CacheReader;
}

const WINDOW_MS = 30 * 60_000;

/** A room as the unit sees it as of `asOf`, set against the outdoor air the harvest last recorded for a place. */
export async function observeRoom(
  roomId: string,
  placeId: string,
  asOf: string,
  deps: RoomsDeps,
  look: { readonly windowMs?: number; readonly after?: string } = {},
): Promise<RoomObservation> {
  const [readings, snapshot] = await Promise.all([
    deps.store.readingsSince(roomId, toIso(toMs(asOf) - (look.windowMs ?? WINDOW_MS))),
    deps.cache.latest(placeId, asOf),
  ]);
  return roomObservation({
    roomId,
    roomName: `Your room (${roomId})`,
    asOf,
    readings,
    outside: latestOutside(snapshot, asOf),
    ...(look.windowMs === undefined ? {} : { windowMs: look.windowMs }),
    ...(look.after === undefined ? {} : { after: look.after }),
  });
}
