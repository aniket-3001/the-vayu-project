import { fixedClock } from '@vayu/core';
import { describe, expect, it } from 'vitest';
import { handleAccount } from './accountRoute';
import type { AccountStore, SavedProfile } from './accountStore';

const memory = (): AccountStore & { items: Map<string, SavedProfile> } => {
  const items = new Map<string, SavedProfile>();
  return {
    items,
    read: (id) => Promise.resolve(items.get(id)),
    write: (id, saved) => {
      items.set(id, saved);
      return Promise.resolve();
    },
    remove: (id) => {
      items.delete(id);
      return Promise.resolve();
    },
  };
};

const setup = (): {
  store: ReturnType<typeof memory>;
  call: (
    method: string,
    userId: string | undefined,
    body?: unknown,
  ) => ReturnType<typeof handleAccount>;
} => {
  const store = memory();
  const deps = { store, clock: fixedClock('2026-10-12T10:00:00.000Z') };
  return {
    store,
    call: (method, userId, body) =>
      handleAccount(
        {
          method,
          path: '/v1/me',
          query: {},
          headers: {},
          ...(userId === undefined ? {} : { userId }),
          ...(body === undefined
            ? {}
            : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
        },
        deps,
      ),
  };
};

describe('the saved account', () => {
  it('refuses anyone who is not signed in', async () => {
    const { call } = setup();
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await call(method, undefined, { profile: {} });
      expect(res.statusCode).toBe(401);
    }
    expect((await call('GET', '')).statusCode).toBe(401);
  });

  it('says nothing is saved yet, then keeps what was sent and gives it back', async () => {
    const { call } = setup();
    expect((await call('GET', 'u1')).body).toEqual({ profile: null });
    const put = await call('PUT', 'u1', { profile: { 'vayu.pins.v1': '[{"name":"Home"}]' } });
    expect(put.statusCode).toBe(200);
    expect(put.body).toEqual({
      profile: { 'vayu.pins.v1': '[{"name":"Home"}]' },
      updatedAt: '2026-10-12T10:00:00.000Z',
    });
    expect((await call('GET', 'u1')).body).toEqual(put.body);
  });

  it('keeps each person to their own item: the id comes from the token, never from the request', async () => {
    const { call, store } = setup();
    await call('PUT', 'u1', { profile: { 'vayu.pins.v1': 'a' } });
    await call('PUT', 'u2', { profile: { 'vayu.pins.v1': 'b' }, userId: 'u1' });
    expect(store.items.get('u1')?.profile['vayu.pins.v1']).toBe('a');
    expect(store.items.get('u2')?.profile['vayu.pins.v1']).toBe('b');
    expect((await call('GET', 'u3')).body).toEqual({ profile: null });
  });

  it('deletes what a person saved', async () => {
    const { call, store } = setup();
    await call('PUT', 'u1', { profile: { 'vayu.pins.v1': 'a' } });
    expect((await call('DELETE', 'u1')).body).toEqual({ deleted: true });
    expect(store.items.has('u1')).toBe(false);
  });

  it('refuses a key the app does not write, a value that is not text, a body that is too big, and bad JSON', async () => {
    const { call } = setup();
    expect((await call('PUT', 'u1', { profile: { 'other.key': 'x' } })).statusCode).toBe(400);
    expect((await call('PUT', 'u1', { profile: { 'vayu.pins.v1': 3 } })).statusCode).toBe(400);
    expect((await call('PUT', 'u1', { profile: ['x'] })).statusCode).toBe(400);
    expect((await call('PUT', 'u1', {})).statusCode).toBe(400);
    expect((await call('PUT', 'u1', '{nope')).statusCode).toBe(400);
    expect(
      (await call('PUT', 'u1', { profile: { 'vayu.pins.v1': 'x'.repeat(101_000) } })).statusCode,
    ).toBe(413);
    const many = Object.fromEntries(
      Array.from({ length: 41 }, (_, i) => [`vayu.k${String(i)}`, 'x']),
    );
    expect((await call('PUT', 'u1', { profile: many })).statusCode).toBe(400);
  });

  it('does not take other methods', async () => {
    const { call } = setup();
    expect((await call('POST', 'u1', { profile: {} })).statusCode).toBe(405);
  });
});

describe('account deletion hook', () => {
  it('calls onDelete once with the user id, and a failing hook never undoes the delete', async () => {
    const seen: string[] = [];
    const base = memory();
    const run = (onDelete: (id: string) => Promise<void>): ReturnType<typeof handleAccount> =>
      handleAccount(
        { method: 'DELETE', path: '/v1/me', query: {}, headers: {}, userId: 'u1' },
        { store: base, clock: fixedClock('2026-10-10T12:00:00.000Z'), onDelete },
      );
    expect((await run((id) => (seen.push(id), Promise.resolve()))).statusCode).toBe(200);
    expect(seen).toEqual(['u1']);
    expect((await run(() => Promise.reject(new Error('down')))).body).toEqual({ deleted: true });
  });
});
