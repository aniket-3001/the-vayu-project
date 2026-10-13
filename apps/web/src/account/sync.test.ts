import { describe, expect, it } from 'vitest';
import { AuthError } from './cognito';
import { clearSession, freshIdToken, loadSession, saveSession } from './session';
import {
  accountSync,
  applyProfile,
  clearProfile,
  httpSyncApi,
  snapshot,
  SYNC_KEYS,
  type Profile,
  type SavedCopy,
  type SyncApi,
  type SyncStatus,
} from './sync';

const memoryStorage = (initial: Record<string, string> = {}): Storage => {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
};

const fakeServer = (
  initial: SavedCopy = { profile: null },
): SyncApi & { copy: SavedCopy; puts: number; gets: number } => {
  const server = {
    copy: initial,
    puts: 0,
    gets: 0,
    get: () => {
      server.gets += 1;
      return Promise.resolve(server.copy);
    },
    put: (profile: Profile) => {
      server.puts += 1;
      const updatedAt = `2026-10-12T10:00:0${String(server.puts)}.000Z`;
      server.copy = { profile, updatedAt };
      return Promise.resolve({ updatedAt });
    },
    remove: () => {
      server.copy = { profile: null };
      return Promise.resolve();
    },
  };
  return server;
};

describe('which items are copied to an account', () => {
  it('copies places, family, outdoor time and settings, and nothing about where the device is or its sign-in', () => {
    expect(SYNC_KEYS).toContain('vayu.pins.v1');
    expect(SYNC_KEYS).toContain('vayu.people.v1');
    for (const key of SYNC_KEYS) {
      expect(key).toMatch(/^vayu\./u);
      expect(key).not.toMatch(
        /live|gps|location|auth|device|measured|mapdata|request|fireReports/iu,
      );
    }
    const storage = memoryStorage({
      'vayu.pins.v1': 'p',
      'vayu.live.v1': 'where I am',
      'vayu-auth.v1': 'token',
    });
    expect(snapshot(storage)).toEqual({ 'vayu.pins.v1': 'p' });
  });

  it('applies a copy exactly: items in it are set, and synced items not in it are removed', () => {
    const storage = memoryStorage({
      'vayu.pins.v1': 'old',
      'vayu.people.v1': 'gone',
      'vayu.live.v1': 'keep',
    });
    applyProfile(storage, { 'vayu.pins.v1': 'new' });
    expect(storage.getItem('vayu.pins.v1')).toBe('new');
    expect(storage.getItem('vayu.people.v1')).toBeNull();
    expect(storage.getItem('vayu.live.v1')).toBe('keep');
    clearProfile(storage);
    expect(storage.getItem('vayu.pins.v1')).toBeNull();
    // Where the device has been is not the account's, but it goes with the visit: see forgetLocation.
    expect(storage.getItem('vayu.live.v1')).toBeNull();
  });
});

describe('the device meeting the account', () => {
  it('gives a new account what the device already holds', async () => {
    const storage = memoryStorage({ 'vayu.pins.v1': 'mine' });
    const api = fakeServer();
    const sync = accountSync({ storage, api });
    expect(await sync.start()).toBe('ready');
    expect(api.copy.profile).toEqual({ 'vayu.pins.v1': 'mine' });
    expect(api.puts).toBe(1);
  });

  it('sends nothing for a new account on an empty device', async () => {
    const api = fakeServer();
    expect(await accountSync({ storage: memoryStorage(), api }).start()).toBe('ready');
    expect(api.puts).toBe(0);
  });

  it("takes the account's copy on a device that held something else, and says to reload", async () => {
    const storage = memoryStorage({ 'vayu.pins.v1': 'this device', 'vayu.people.v1': 'only here' });
    const api = fakeServer({ profile: { 'vayu.pins.v1': 'account' }, updatedAt: 't1' });
    expect(await accountSync({ storage, api }).start()).toBe('reload');
    expect(storage.getItem('vayu.pins.v1')).toBe('account');
    expect(storage.getItem('vayu.people.v1')).toBeNull();
    expect(api.puts).toBe(0);
  });

  it('does nothing when they already agree', async () => {
    const storage = memoryStorage({ 'vayu.pins.v1': 'same' });
    const api = fakeServer({ profile: { 'vayu.pins.v1': 'same' }, updatedAt: 't1' });
    expect(await accountSync({ storage, api }).start()).toBe('ready');
    expect(api.puts).toBe(0);
  });
});

describe('keeping the account up to date', () => {
  it('sends a change once, then nothing until there is another, and reports it', async () => {
    const storage = memoryStorage({ 'vayu.pins.v1': 'a' });
    const api = fakeServer();
    const seen: SyncStatus[] = [];
    const sync = accountSync({ storage, api, onStatus: (s) => seen.push(s) });
    await sync.start();
    expect(api.puts).toBe(1);
    await sync.flush();
    expect(api.puts).toBe(1);
    storage.setItem('vayu.pins.v1', 'b');
    await sync.flush();
    expect(api.puts).toBe(2);
    expect(api.copy.profile).toEqual({ 'vayu.pins.v1': 'b' });
    expect(seen.map((s) => s.state)).toContain('saving');
    expect(seen.at(-1)?.state).toBe('saved');
  });

  it('says so when a save fails, and tries again next time', async () => {
    const storage = memoryStorage({ 'vayu.pins.v1': 'a' });
    const api = fakeServer({ profile: { 'vayu.pins.v1': 'a' }, updatedAt: 't1' });
    const seen: SyncStatus[] = [];
    const sync = accountSync({ storage, api, onStatus: (s) => seen.push(s) });
    await sync.start();
    storage.setItem('vayu.pins.v1', 'b');
    const real = api.put;
    (api as { put: SyncApi['put'] }).put = () => Promise.reject(new Error('offline'));
    await sync.flush();
    expect(seen.at(-1)?.state).toBe('error');
    (api as { put: SyncApi['put'] }).put = real;
    await sync.flush();
    expect(seen.at(-1)?.state).toBe('saved');
    expect(api.copy.profile).toEqual({ 'vayu.pins.v1': 'b' });
  });

  it('takes a newer copy from another device when the tab is looked at again, and says to reload', async () => {
    const storage = memoryStorage({ 'vayu.pins.v1': 'a' });
    const api = fakeServer();
    const sync = accountSync({ storage, api });
    await sync.start();
    api.copy = { profile: { 'vayu.pins.v1': 'from the phone' }, updatedAt: 'later' };
    expect(await sync.pull()).toBe('reload');
    expect(storage.getItem('vayu.pins.v1')).toBe('from the phone');
  });

  it("keeps this device's change when both changed, because it is the newer one", async () => {
    const storage = memoryStorage({ 'vayu.pins.v1': 'a' });
    const api = fakeServer();
    const sync = accountSync({ storage, api });
    await sync.start();
    storage.setItem('vayu.pins.v1', 'edited here');
    api.copy = { profile: { 'vayu.pins.v1': 'edited there' }, updatedAt: 'later' };
    expect(await sync.pull()).toBe('ready');
    expect(api.copy.profile).toEqual({ 'vayu.pins.v1': 'edited here' });
  });

  it('asks nothing of the device when there is no newer copy', async () => {
    const storage = memoryStorage({ 'vayu.pins.v1': 'a' });
    const api = fakeServer();
    const sync = accountSync({ storage, api });
    await sync.start();
    expect(await sync.pull()).toBe('ready');
    expect(storage.getItem('vayu.pins.v1')).toBe('a');
  });
});

describe('the account calls', () => {
  it("sends the person's token and the copy, and reads it back", async () => {
    const calls: { method: string; headers: Record<string, string>; body?: string }[] = [];
    const fetchImpl = ((_url: string, init: RequestInit) => {
      calls.push({
        method: init.method ?? 'GET',
        headers: init.headers as Record<string, string>,
        ...(init.body === undefined ? {} : { body: init.body as string }),
      });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ profile: { 'vayu.pins.v1': 'x' }, updatedAt: 't' }),
      } as Response);
    }) as typeof fetch;
    const api = httpSyncApi('https://example.org/', () => Promise.resolve('TOKEN'), fetchImpl);
    await api.get();
    await api.put({ 'vayu.pins.v1': 'x' });
    await api.remove();
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'DELETE']);
    expect(calls[0]?.headers.authorization).toBe('Bearer TOKEN');
    expect(JSON.parse(calls[1]?.body ?? '{}')).toEqual({ profile: { 'vayu.pins.v1': 'x' } });
  });

  it('turns a refusal into an error', async () => {
    const fetchImpl = (() =>
      Promise.resolve({ ok: false, status: 401 } as Response)) as typeof fetch;
    const api = httpSyncApi('', () => Promise.resolve('t'), fetchImpl);
    await expect(api.get()).rejects.toThrow(/401/u);
  });
});

describe('the sign-in kept on a device', () => {
  const tokens = { idToken: 'id', accessToken: 'ac', refreshToken: 'rf', expiresAt: 10_000_000 };

  it('keeps, reads and clears a session, and ignores a damaged one', () => {
    const storage = memoryStorage();
    expect(loadSession(storage)).toBeUndefined();
    saveSession(storage, { email: 'a@b.in', tokens });
    expect(loadSession(storage)).toEqual({ email: 'a@b.in', tokens });
    clearSession(storage);
    expect(loadSession(storage)).toBeUndefined();
    storage.setItem('vayu-auth.v1', '{"email":3}');
    expect(loadSession(storage)).toBeUndefined();
    storage.setItem('vayu-auth.v1', 'nope');
    expect(loadSession(storage)).toBeUndefined();
  });

  it('uses the token it has while it has time, and a fresh one when it is about to stop', async () => {
    const storage = memoryStorage();
    saveSession(storage, { email: 'a@b.in', tokens });
    const refresh = (): Promise<typeof tokens> =>
      Promise.resolve({ ...tokens, idToken: 'id2', expiresAt: 99_000_000 });
    expect(await freshIdToken({ refresh }, storage, () => 1_000)).toBe('id');
    expect(await freshIdToken({ refresh }, storage, () => 9_990_000)).toBe('id2');
    expect(loadSession(storage)?.tokens.idToken).toBe('id2');
  });

  it('ends the session when the refresh token no longer works, but not when only the network is down', async () => {
    const storage = memoryStorage();
    saveSession(storage, { email: 'a@b.in', tokens });
    const offline = (): Promise<never> => Promise.reject(new AuthError('offline', 'down'));
    await expect(
      freshIdToken({ refresh: offline }, storage, () => 9_990_000),
    ).rejects.toMatchObject({
      code: 'offline',
    });
    expect(loadSession(storage)).toBeDefined();
    const refused = (): Promise<never> =>
      Promise.reject(new AuthError('NotAuthorizedException', 'no'));
    await expect(
      freshIdToken({ refresh: refused }, storage, () => 9_990_000),
    ).rejects.toMatchObject({
      code: 'signed_out',
    });
    expect(loadSession(storage)).toBeUndefined();
  });
});
