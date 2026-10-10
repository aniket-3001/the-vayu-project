import type { FixCheckStore } from './fixCheck';
import { dynamoFixCheckStore } from './fixCheckStore';
import type { RoomsDeps } from './observeRoom';
import { dynamoCacheReader, dynamoRoomStore } from './roomStores';

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

let rooms: RoomsDeps | undefined;
let store: FixCheckStore | undefined;

/** The room and cache stores, built from the function's environment on first use. */
export function roomsDeps(): RoomsDeps {
  rooms ??= {
    store: dynamoRoomStore(mustEnv('ROOMS_TABLE')),
    cache: dynamoCacheReader(mustEnv('CACHE_TABLE')),
  };
  return rooms;
}

export function fixCheckStore(): FixCheckStore {
  store ??= dynamoFixCheckStore(mustEnv('WATCH_TABLE'));
  return store;
}
