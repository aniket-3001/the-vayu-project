import type { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Reading } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { dynamoCacheReader, dynamoRoomStore } from './roomStores';

const reading: Reading = {
  schemaVersion: 1,
  id: 'dev#2026-10-08T10:00:00.000Z#7',
  thingId: 'dev',
  ts: '2026-10-08T10:00:00.000Z',
  pm25: 40,
  pm10: 60,
  flags: [],
  simulated: false,
};

describe('dynamoRoomStore', () => {
  it('writes only if the row is new, keyed by unit and time, with the expiry the table uses', async () => {
    const sent: PutCommand[] = [];
    const store = dynamoRoomStore('rooms', {
      send: (c: PutCommand) => (sent.push(c), Promise.resolve({})),
    });
    expect(await store.putReading('dev', reading, 1_800_000_000)).toBe('stored');
    expect(sent[0]?.input).toMatchObject({
      TableName: 'rooms',
      ConditionExpression: 'attribute_not_exists(pk)',
      Item: {
        pk: 'ROOM#dev',
        sk: 'R#2026-10-08T10:00:00.000Z#000007',
        expiresAt: 1_800_000_000,
        reading,
      },
    });
  });

  it('calls a second delivery a duplicate instead of failing', async () => {
    const store = dynamoRoomStore('rooms', {
      send: () =>
        Promise.reject(Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' })),
    });
    expect(await store.putReading('dev', reading, 1)).toBe('duplicate');
  });

  it('lets any other failure through, so the schedule or rule shows it', async () => {
    const store = dynamoRoomStore('rooms', {
      send: () => Promise.reject(new Error('throttled')),
    });
    await expect(store.putReading('dev', reading, 1)).rejects.toThrow('throttled');
  });

  it('reads one unit’s rows from a time onward, newest first, and parses them against the contract', async () => {
    const sent: QueryCommand[] = [];
    const store = dynamoRoomStore('rooms', {
      send: (c: QueryCommand) => (sent.push(c), Promise.resolve({ Items: [{ reading }] })),
    });
    expect(await store.readingsSince('dev', '2026-10-08T09:30:00.000Z')).toEqual([reading]);
    expect(sent[0]?.input).toMatchObject({
      TableName: 'rooms',
      ScanIndexForward: false,
      ExpressionAttributeValues: { ':pk': 'ROOM#dev', ':from': 'R#2026-10-08T09:30:00.000Z' },
    });
  });

  it('refuses a stored row that no longer matches the contract', async () => {
    const store = dynamoRoomStore('rooms', {
      send: () => Promise.resolve({ Items: [{ reading: { nope: 1 } }] }),
    });
    await expect(store.readingsSince('dev', '2026-10-08T09:30:00.000Z')).rejects.toThrow();
  });
});

describe('dynamoCacheReader', () => {
  const snapshot = {
    schemaVersion: 1,
    harvestedAt: '2026-10-08T10:00:00.000Z',
    placeId: 'school',
    status: 'fresh',
    hours: [],
  };
  const reader = (item: unknown): ReturnType<typeof dynamoCacheReader> =>
    dynamoCacheReader('cache', { send: () => Promise.resolve({ Item: item }) });

  it('returns the harvest’s latest answer for a place', async () => {
    const out = await reader({
      pk: 'LATEST#school',
      value: snapshot,
      expiresAt: 4_000_000_000,
    }).latest('school', '2026-10-08T10:00:00.000Z');
    expect(out?.placeId).toBe('school');
  });
  it('treats an expired row as absent (DynamoDB deletes lazily, up to two days late)', async () => {
    const out = await reader({ pk: 'LATEST#school', value: snapshot, expiresAt: 1_000 }).latest(
      'school',
      '2026-10-08T10:00:00.000Z',
    );
    expect(out).toBeUndefined();
  });
  it('is absent when nothing was harvested', async () => {
    expect(await reader(undefined).latest('school', '2026-10-08T10:00:00.000Z')).toBeUndefined();
  });
});

describe('dynamoCacheReader forecast', () => {
  const line = {
    schemaVersion: 1,
    harvestedAt: '2026-10-08T10:00:00.000Z',
    placeId: 'school',
    status: 'ok',
    hours: [],
  };
  it('reads the harvest forecast for a place from its own key', async () => {
    const keys: unknown[] = [];
    const reader = dynamoCacheReader('cache', {
      send: (c: { input: { Key: unknown } }) => {
        keys.push(c.input.Key);
        return Promise.resolve({
          Item: { pk: 'FORECAST#school', value: line, expiresAt: 4_000_000_000 },
        });
      },
    });
    expect((await reader.latestForecast('school', '2026-10-08T10:00:00.000Z'))?.status).toBe('ok');
    expect(keys).toEqual([{ pk: 'FORECAST#school' }]);
  });
  it('treats an expired forecast as absent', async () => {
    const reader = dynamoCacheReader('cache', {
      send: () => Promise.resolve({ Item: { pk: 'FORECAST#school', value: line, expiresAt: 5 } }),
    });
    expect(await reader.latestForecast('school', '2026-10-08T10:00:00.000Z')).toBeUndefined();
  });
});
