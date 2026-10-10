import type { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { FixCheckResult } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { dynamoFixCheckStore } from './fixCheckStore';

const result: FixCheckResult = {
  fixCheckId: 'dev-1',
  roomId: 'dev',
  startedAt: '2026-10-08T10:00:00.000Z',
  status: 'waiting',
  baselinePm25: 200,
  latestPm25: 200,
  dropPct: null,
  tries: 0,
  escalate: false,
  simulated: true,
};

describe('dynamoFixCheckStore', () => {
  it('creates a record only if it is new, in the Watch table, and lets DynamoDB expire it', async () => {
    const sent: PutCommand[] = [];
    const store = dynamoFixCheckStore('watch', {
      send: (c: PutCommand) => (sent.push(c), Promise.resolve({})),
    });
    expect(await store.create(result)).toBe('created');
    expect(sent[0]?.input).toMatchObject({
      TableName: 'watch',
      ConditionExpression: 'attribute_not_exists(pk)',
      Item: { pk: 'FIXCHECK#dev-1', sk: 'RESULT', result },
    });
    expect(typeof (sent[0]?.input.Item as { expiresAt: number }).expiresAt).toBe('number');
  });

  it('says exists, instead of failing, when the run is already there', async () => {
    const store = dynamoFixCheckStore('watch', {
      send: () =>
        Promise.reject(Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' })),
    });
    expect(await store.create(result)).toBe('exists');
  });

  it('lets any other failure through', async () => {
    const store = dynamoFixCheckStore('watch', {
      send: () => Promise.reject(new Error('throttled')),
    });
    await expect(store.create(result)).rejects.toThrow('throttled');
  });

  it('reads a record back and checks it against the contract', async () => {
    const sent: GetCommand[] = [];
    const store = dynamoFixCheckStore('watch', {
      send: (c: GetCommand) => (sent.push(c), Promise.resolve({ Item: { result } })),
    });
    expect(await store.get('dev-1')).toEqual(result);
    expect(sent[0]?.input.Key).toEqual({ pk: 'FIXCHECK#dev-1', sk: 'RESULT' });
    const bad = dynamoFixCheckStore('watch', {
      send: () => Promise.resolve({ Item: { result: { nope: 1 } } }),
    });
    await expect(bad.get('dev-1')).rejects.toThrow();
  });

  it('is absent when there is no such record', async () => {
    const store = dynamoFixCheckStore('watch', { send: () => Promise.resolve({}) });
    expect(await store.get('nope')).toBeUndefined();
  });

  it('saves an updated record over the old one, keeping its expiry rolling', async () => {
    const sent: PutCommand[] = [];
    const store = dynamoFixCheckStore('watch', {
      send: (c: PutCommand) => (sent.push(c), Promise.resolve({})),
    });
    await store.save({ ...result, status: 'improved' });
    expect(sent[0]?.input).toMatchObject({
      Item: { pk: 'FIXCHECK#dev-1', result: { status: 'improved' } },
    });
    expect(sent[0]?.input).not.toHaveProperty('ConditionExpression');
  });
});
