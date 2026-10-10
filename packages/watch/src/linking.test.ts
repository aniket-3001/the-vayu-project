import { describe, expect, it } from 'vitest';
import { fixtureLinkStore, generateLinkCode } from './linking';

describe('generateLinkCode', () => {
  it('is six lowercase base-36 characters', () => {
    const code = generateLinkCode();
    expect(code).toMatch(/^[0-9a-z]{6}$/);
  });

  it('is deterministic for a given random source', () => {
    const sequence = (): (() => number) => {
      const values = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
      let i = 0;
      return () => values[i++ % values.length] ?? 0;
    };
    expect(generateLinkCode(sequence())).toBe(generateLinkCode(sequence()));
  });
});

describe('fixtureLinkStore', () => {
  it('round-trips a link code and consumes it', async () => {
    const store = fixtureLinkStore();
    await store.saveLinkCode({
      code: 'abc123',
      groupId: 'school-demo',
      role: 'principal',
      expiresAt: '2026-10-05T07:00:00.000Z',
    });

    expect(await store.getLinkCode('abc123')).toMatchObject({ role: 'principal' });

    await store.consumeLinkCode('abc123');
    expect(await store.getLinkCode('abc123')).toBeNull();
  });

  it('saves and deletes a link (delete-my-data)', async () => {
    const store = fixtureLinkStore();
    await store.saveLink({
      chatId: 'chat-1',
      groupId: 'school-demo',
      role: 'principal',
      linkedAt: '2026-10-05T06:00:00.000Z',
    });

    expect(await store.linksForRole('school-demo', 'principal')).toHaveLength(1);

    await store.deleteLink('chat-1');
    expect(await store.linksForRole('school-demo', 'principal')).toHaveLength(0);
  });

  it('filters links by group and role', async () => {
    const store = fixtureLinkStore();
    await store.saveLink({
      chatId: 'chat-1',
      groupId: 'walk-group',
      role: 'member',
      linkedAt: '2026-10-05T06:00:00.000Z',
    });
    await store.saveLink({
      chatId: 'chat-2',
      groupId: 'walk-group',
      role: 'member',
      linkedAt: '2026-10-05T06:00:00.000Z',
    });
    await store.saveLink({
      chatId: 'chat-3',
      groupId: 'school-demo',
      role: 'principal',
      linkedAt: '2026-10-05T06:00:00.000Z',
    });

    const members = await store.linksForRole('walk-group', 'member');
    expect(members.map((link) => link.chatId).sort()).toEqual(['chat-1', 'chat-2']);
  });

  it('records an ack once, and refuses the same alert+chat+action again (I8)', async () => {
    const store = fixtureLinkStore();
    const ack = {
      alertId: 'alert-1',
      chatId: 'chat-1',
      action: 'done' as const,
      at: '2026-10-05T06:00:00.000Z',
    };

    expect(await store.recordAck(ack)).toBe(true);
    expect(await store.recordAck(ack)).toBe(false);
  });
});

describe('fixtureLinkStore.claimSend', () => {
  it('claims an alert+chat+step once', async () => {
    const store = fixtureLinkStore();
    expect(await store.claimSend('a', 'c', 's')).toBe(true);
    expect(await store.claimSend('a', 'c', 's')).toBe(false);
    expect(await store.claimSend('a', 'c', 'other-step')).toBe(true);
  });
});
