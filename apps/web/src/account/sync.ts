/**
 * What the app keeps on a device, copied to the person's account and back. It is a copy of a few named items (places,
 * family, outdoor time, settings), as text, taken as they are. The account holds the latest copy; whichever device
 * saved last wins. Nothing here knows what the items mean.
 */
export const SYNC_KEYS: readonly string[] = [
  'vayu.pins.v1',
  'vayu.people.v1',
  'vayu.spots.v3',
  'vayu.outings.v1',
  'vayu.tasks.v1',
  'vayu.units.v1',
  'vayu.assistant.lang.v1',
  'vayu.voice.v1',
];

export type Profile = Readonly<Record<string, string>>;

export function snapshot(storage: Storage): Profile {
  const out: Record<string, string> = {};
  for (const key of SYNC_KEYS) {
    const value = storage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

/** Makes the device hold exactly this copy: items in it are set, and synced items not in it are removed. */
export function applyProfile(storage: Storage, profile: Profile): void {
  for (const key of SYNC_KEYS) {
    const value = profile[key];
    if (value === undefined) storage.removeItem(key);
    else storage.setItem(key, value);
  }
}

/**
 * Where a person has been, kept on the device but never sent to the account: the switch that follows the device, and
 * the log of its positions. They belong to whoever held the phone, so they end with a visit: signing in, signing out,
 * deleting an account and leaving guest mode all forget them. Otherwise the next person, guest or new account, would
 * open the app already on the last person's location.
 */
export const LOCATION_KEYS: readonly string[] = ['vayu.liveLocation.v1', 'vayu.live.v1'];

export function forgetLocation(storage: Storage): void {
  for (const key of LOCATION_KEYS) storage.removeItem(key);
}

/**
 * What this device last saved to (or took from) the account, kept on the device so it survives a restart. It tells the
 * next launch whether the device has changes the account has not seen yet. Never sent to the account.
 */
export const LAST_SYNCED_KEY = 'vayu.sync.last.v1';

export function clearProfile(storage: Storage): void {
  for (const key of SYNC_KEYS) storage.removeItem(key);
  storage.removeItem(LAST_SYNCED_KEY);
  forgetLocation(storage);
}

const text = (profile: Profile): string => JSON.stringify(Object.entries(profile).sort());
export const sameProfile = (a: Profile, b: Profile): boolean => text(a) === text(b);

export interface SavedCopy {
  readonly profile: Profile | null;
  readonly updatedAt?: string;
}

export interface SyncApi {
  readonly get: () => Promise<SavedCopy>;
  readonly put: (profile: Profile) => Promise<{ readonly updatedAt: string }>;
  readonly remove: () => Promise<void>;
}

export interface SyncStatus {
  readonly state: 'idle' | 'saving' | 'saved' | 'error';
  /** When the account last got a copy, as the API said. */
  readonly savedAt?: string;
}

export interface Sync {
  /** The first meeting of this device and the account. `reload` means the device took the account's copy. */
  readonly start: () => Promise<'ready' | 'reload'>;
  /** Sends the device's copy if it has changed since the last time. */
  readonly flush: () => Promise<void>;
  /** Looks for a newer copy from another device. */
  readonly pull: () => Promise<'ready' | 'reload'>;
}

export function accountSync(options: {
  readonly storage: Storage;
  readonly api: SyncApi;
  readonly onStatus?: (status: SyncStatus) => void;
}): Sync {
  const { storage, api } = options;
  const report = options.onStatus ?? ((): void => undefined);
  let lastSynced = '';
  let serverStamp: string | undefined;
  const remember = (copy: Profile): void => {
    lastSynced = text(copy);
    try {
      storage.setItem(LAST_SYNCED_KEY, lastSynced);
    } catch {
      // Best effort: without it the account's copy wins at the next launch, as it always did.
    }
  };

  const saved = (updatedAt: string | undefined): void => {
    serverStamp = updatedAt;
    report(updatedAt === undefined ? { state: 'saved' } : { state: 'saved', savedAt: updatedAt });
  };

  async function flush(): Promise<void> {
    const now = snapshot(storage);
    if (text(now) === lastSynced) return;
    report({ state: 'saving' });
    try {
      const out = await api.put(now);
      remember(now);
      saved(out.updatedAt);
    } catch {
      report({ state: 'error' });
    }
  }

  async function start(): Promise<'ready' | 'reload'> {
    const server = await api.get();
    const local = snapshot(storage);
    if (server.profile === null) {
      // A new account: what this device has becomes the account's copy.
      if (Object.keys(local).length > 0) {
        const out = await api.put(local);
        remember(local);
        saved(out.updatedAt);
      } else {
        remember(local);
        saved(undefined);
      }
      return 'ready';
    }
    if (sameProfile(server.profile, local)) {
      remember(local);
      saved(server.updatedAt);
      return 'ready';
    }
    // A change made here that the account has not seen (the app was closed before the save) is newer than the
    // account's copy, so it is kept and sent, not overwritten. Only a device that has synced before can say so.
    const before = storage.getItem(LAST_SYNCED_KEY);
    if (before !== null && before !== text(local)) {
      const out = await api.put(local);
      remember(local);
      saved(out.updatedAt);
      return 'ready';
    }
    // Nothing changed here since the last save, or this device has never synced: it takes the account's copy.
    applyProfile(storage, server.profile);
    remember(server.profile);
    saved(server.updatedAt);
    return 'reload';
  }

  async function pull(): Promise<'ready' | 'reload'> {
    const server = await api.get();
    if (server.profile === null || server.updatedAt === serverStamp) return 'ready';
    if (text(snapshot(storage)) !== lastSynced) {
      // This device changed too since the last save: its copy is the newer one.
      await flush();
      return 'ready';
    }
    if (text(server.profile) === lastSynced) {
      saved(server.updatedAt);
      return 'ready';
    }
    applyProfile(storage, server.profile);
    remember(server.profile);
    saved(server.updatedAt);
    return 'reload';
  }

  return { start, flush, pull };
}

/** The API calls, with the person's token. `getToken` refreshes it when it is about to stop. */
export function httpSyncApi(
  baseUrl: string,
  getToken: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
): SyncApi {
  const url = `${baseUrl.replace(/\/$/u, '')}/v1/me`;
  const send = async (method: string, body?: unknown): Promise<unknown> => {
    const token = await getToken();
    const res = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) throw new Error(`The account service answered ${String(res.status)}`);
    return res.json();
  };
  return {
    get: async () => (await send('GET')) as SavedCopy,
    put: async (profile) => (await send('PUT', { profile })) as { updatedAt: string },
    remove: async () => {
      await send('DELETE');
    },
  };
}
