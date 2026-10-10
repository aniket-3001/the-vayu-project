import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { dynamoLinkStore } from './dynamoLinkStore';

interface CommandLike {
  readonly input: {
    readonly Key?: Record<string, unknown>;
    readonly Item?: Record<string, unknown>;
  };
}

function fakeDocClient(responses: Record<string, unknown> = {}): {
  send: (command: unknown) => Promise<unknown>;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    calls,
    send: vi.fn((command: unknown) => {
      calls.push(command);
      if (command instanceof GetCommand) {
        const key = (command as unknown as CommandLike).input.Key;
        return Promise.resolve({ Item: responses[JSON.stringify(key)] });
      }
      if (command instanceof QueryCommand) {
        return Promise.resolve({ Items: responses.queryItems ?? [] });
      }
      return Promise.resolve({});
    }),
  };
}

describe('dynamoLinkStore', () => {
  it('writes a link code with both an ISO expiry (for app logic) and an epoch-seconds TTL', async () => {
    const client = fakeDocClient();
    const store = dynamoLinkStore({ tableName: 'Watch', docClient: client as never });

    await store.saveLinkCode({
      code: 'abc123',
      groupId: 'school-demo',
      role: 'principal',
      expiresAt: '2026-10-05T07:00:00.000Z',
    });

    const put = client.calls[0] as PutCommand;
    expect(put.input.Item).toMatchObject({
      pk: 'LINKCODE#abc123',
      sk: 'META',
      expiresAtIso: '2026-10-05T07:00:00.000Z',
      expiresAt: Math.floor(new Date('2026-10-05T07:00:00.000Z').getTime() / 1000),
    });
  });

  it('reads a link code back by its code', async () => {
    const client = fakeDocClient({
      [JSON.stringify({ pk: 'LINKCODE#abc123', sk: 'META' })]: {
        pk: 'LINKCODE#abc123',
        sk: 'META',
        groupId: 'school-demo',
        role: 'principal',
        expiresAtIso: '2026-10-05T07:00:00.000Z',
        expiresAt: 1_234_567,
      },
    });
    const store = dynamoLinkStore({ tableName: 'Watch', docClient: client as never });

    expect(await store.getLinkCode('abc123')).toEqual({
      code: 'abc123',
      groupId: 'school-demo',
      role: 'principal',
      expiresAt: '2026-10-05T07:00:00.000Z',
    });
  });

  it('returns null for a code that is not there', async () => {
    const client = fakeDocClient();
    const store = dynamoLinkStore({ tableName: 'Watch', docClient: client as never });
    expect(await store.getLinkCode('nope')).toBeNull();
  });

  it('consumes a link code with a delete', async () => {
    const client = fakeDocClient();
    const store = dynamoLinkStore({ tableName: 'Watch', docClient: client as never });

    await store.consumeLinkCode('abc123');

    const del = client.calls[0] as DeleteCommand;
    expect(del.input.Key).toEqual({ pk: 'LINKCODE#abc123', sk: 'META' });
  });

  it('writes both the direct link item and the role-index item on save', async () => {
    const client = fakeDocClient();
    const store = dynamoLinkStore({ tableName: 'Watch', docClient: client as never });

    await store.saveLink({
      chatId: 'chat-1',
      groupId: 'school-demo',
      role: 'principal',
      linkedAt: '2026-10-05T06:00:00.000Z',
    });

    const puts = client.calls as unknown as CommandLike[];
    expect(puts.map((command) => command.input.Item?.pk)).toEqual(
      expect.arrayContaining(['LINK#chat-1', 'ROLE#school-demo#principal']),
    );
  });

  it('records an ack with a conditional write and reports success', async () => {
    const client = fakeDocClient();
    const store = dynamoLinkStore({ tableName: 'Watch', docClient: client as never });

    const result = await store.recordAck({
      alertId: 'alert-1',
      chatId: 'chat-1',
      action: 'done',
      at: '2026-10-05T06:00:00.000Z',
    });

    expect(result).toBe(true);
    const put = client.calls[0] as PutCommand;
    expect(put.input.ConditionExpression).toBe('attribute_not_exists(pk)');
  });

  it('reports false, not an error, when the ack was already recorded (I8)', async () => {
    const client = {
      calls: [] as unknown[],
      send: vi.fn((): Promise<never> => {
        const error = new Error('conditional check failed');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }),
    };
    const store = dynamoLinkStore({ tableName: 'Watch', docClient: client as never });

    expect(
      await store.recordAck({
        alertId: 'alert-1',
        chatId: 'chat-1',
        action: 'done',
        at: '2026-10-05T06:00:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('dynamoLinkStore.claimSend', () => {
  it('claims a send once with a conditional write under its own SENDCLAIM# prefix', async () => {
    const client = fakeDocClient();
    const store = dynamoLinkStore({ tableName: 'Watch', docClient: client as never });

    expect(await store.claimSend('alert-1', 'chat-1', '0-send')).toBe(true);

    const put = client.calls[0] as PutCommand & {
      input: { Item: Record<string, unknown>; ConditionExpression: string };
    };
    expect(put.input.Item).toEqual({ pk: 'SENDCLAIM#alert-1', sk: 'chat-1#0-send' });
    expect(put.input.ConditionExpression).toBe('attribute_not_exists(pk)');
  });

  it('returns false when the claim already exists', async () => {
    const client = {
      send: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' }),
        ),
    };
    const store = dynamoLinkStore({ tableName: 'Watch', docClient: client as never });
    expect(await store.claimSend('alert-1', 'chat-1', '0-send')).toBe(false);
  });
});
