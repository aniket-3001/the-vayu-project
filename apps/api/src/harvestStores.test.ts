import type { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { dynamoCacheStore, s3SnapshotStore } from './harvestStores';

describe('harvest stores', () => {
  it('writes a snapshot line file to the bucket under the given key', async () => {
    const sent: PutObjectCommand[] = [];
    const store = s3SnapshotStore('bucket-1', {
      send: (command: PutObjectCommand) => (sent.push(command), Promise.resolve({})),
    } as never);
    await store.put('harvest/station/dt=2026-10-08/x.jsonl', '{"a":1}\n');
    expect(sent[0]?.input).toMatchObject({
      Bucket: 'bucket-1',
      Key: 'harvest/station/dt=2026-10-08/x.jsonl',
      Body: '{"a":1}\n',
    });
  });

  it('writes the cache item with the TTL attribute the table expires on', async () => {
    const sent: PutCommand[] = [];
    const store = dynamoCacheStore('cache-1', {
      send: (command: PutCommand) => (sent.push(command), Promise.resolve({})),
    } as never);
    await store.put('LATEST#home', { placeId: 'home' }, 1_800_000_000);
    expect(sent[0]?.input).toMatchObject({
      TableName: 'cache-1',
      Item: { pk: 'LATEST#home', value: { placeId: 'home' }, expiresAt: 1_800_000_000 },
    });
  });
});
