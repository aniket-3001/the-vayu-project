import { describe, expect, it, vi } from 'vitest';
import { dayKey, dynamoQuota, memoryQuota } from './quota';

describe('a quota', () => {
  it('says yes until the limit is used up, then no, and counts each key on its own', async () => {
    const quota = memoryQuota();
    expect(await quota.take('a', 2, 60)).toBe(true);
    expect(await quota.take('a', 2, 60)).toBe(true);
    expect(await quota.take('a', 2, 60)).toBe(false);
    expect(await quota.take('b', 2, 60)).toBe(true);
  });

  it('in DynamoDB is one conditional update, which says no when the condition fails', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' }),
      )
      .mockRejectedValueOnce(new Error('throttled'));
    const quota = dynamoQuota('Watch', { send } as never, () => 1000);
    expect(await quota.take('k', 3, 60)).toBe(true);
    expect(await quota.take('k', 3, 60)).toBe(false);
    await expect(quota.take('k', 3, 60)).rejects.toThrow('throttled');
    const command = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Key: { pk: 'CAP#k', sk: 'CAP' },
      ConditionExpression: 'attribute_not_exists(used) OR used <= :room',
      ExpressionAttributeValues: { ':amount': 1, ':room': 2, ':expires': 1060 },
    });
  });

  it('can take an amount at a time, all or nothing', async () => {
    const memory = memoryQuota();
    expect(await memory.take('k', 1000, 60, 600)).toBe(true);
    expect(await memory.take('k', 1000, 60, 600)).toBe(false);
    expect(memory.used('k')).toBe(600);
    expect(await memory.take('k', 1000, 60, 400)).toBe(true);
    const send = vi.fn().mockResolvedValue({});
    await dynamoQuota('Watch', { send } as never, () => 1000).take('k', 1000, 60, 300);
    const command = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      ExpressionAttributeValues: { ':amount': 300, ':room': 700 },
    });
  });

  it('resets at midnight in India, not in UTC', () => {
    expect(dayKey('2026-10-10T18:29:00.000Z')).toBe('2026-10-10');
    expect(dayKey('2026-10-10T18:31:00.000Z')).toBe('2026-10-11');
  });
});
