import { describe, expect, it } from 'vitest';
import type { Reading } from '@vayu/contracts';
import { ingestEvent } from './ingestHandler';

const NOW = '2026-10-08T10:00:30.000Z';
const store = (rows: Reading[] = []): Parameters<typeof ingestEvent>[1] => ({
  putReading: (_thing, reading) => {
    rows.push(reading);
    return Promise.resolve('stored');
  },
  readingsSince: () => Promise.resolve(rows),
});
const event = {
  thingId: 'vayu-dev-01',
  schemaVersion: 1,
  ts: '2026-10-08T10:00:20.000Z',
  seq: 1,
  pm25: 40,
  pm10: 60,
};

describe('ingestEvent (what the IoT rule sends)', () => {
  it('takes the unit name from the rule and the rest as the message', async () => {
    const rows: Reading[] = [];
    const result = await ingestEvent(event, store(rows), NOW);
    expect(result.status).toBe('stored');
    expect(rows[0]).toMatchObject({ thingId: 'vayu-dev-01', pm25: 40 });
  });

  it('rejects an event with no unit name, and one where the name is not a string', async () => {
    const withoutThing: Record<string, unknown> = { ...event };
    delete withoutThing.thingId;
    expect((await ingestEvent(withoutThing, store(), NOW)).status).toBe('rejected');
    expect((await ingestEvent({ ...event, thingId: 7 }, store(), NOW)).status).toBe('rejected');
  });

  it('does not let a message carry its own thingId into the stored reading', async () => {
    const rows: Reading[] = [];
    await ingestEvent({ ...event, thingId: 'real-unit', extra: 'x' }, store(rows), NOW);
    expect(rows[0]?.thingId).toBe('real-unit');
    expect(rows[0]).not.toHaveProperty('extra');
  });
});
