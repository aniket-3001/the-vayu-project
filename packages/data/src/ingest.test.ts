import type { Reading } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { ingestReading, type RoomStore } from './ingest';

const RECEIVED = '2026-10-08T10:00:30.000Z';
const message = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemaVersion: 1,
  ts: '2026-10-08T10:00:20.000Z',
  seq: 7,
  pm25: 38.5,
  pm10: 61.2,
  rhPct: 52,
  tempC: 29,
  ...over,
});

function memoryStore(): RoomStore & { rows: Map<string, Reading> } {
  const rows = new Map<string, Reading>();
  return {
    rows,
    putReading: (_thingId, reading) => {
      if (rows.has(reading.id)) return Promise.resolve('duplicate');
      rows.set(reading.id, reading);
      return Promise.resolve('stored');
    },
    readingsSince: () => Promise.resolve([...rows.values()]),
  };
}

describe('ingestReading', () => {
  it('stores a good reading with no flags, and says which unit sent it', async () => {
    const store = memoryStore();
    const result = await ingestReading(message(), 'vayu-dev-01', store, RECEIVED);
    expect(result.status).toBe('stored');
    expect(result.status === 'stored' && result.reading).toMatchObject({
      thingId: 'vayu-dev-01',
      pm25: 38.5,
      flags: [],
      simulated: false,
    });
    expect(store.rows.size).toBe(1);
  });

  it('marks a dev-publisher reading as simulated, so nothing downstream can mistake it for a measurement', async () => {
    const result = await ingestReading(
      message({ simulated: true }),
      'dev',
      memoryStore(),
      RECEIVED,
    );
    expect(result.status === 'stored' && result.reading.flags).toEqual(['simulated']);
    expect(result.status === 'stored' && result.reading.simulated).toBe(true);
  });

  it('flags damp air (the sensor reads high when humid), keeping the reading', async () => {
    const result = await ingestReading(message({ rhPct: 85 }), 'dev', memoryStore(), RECEIVED);
    expect(result.status === 'stored' && result.reading.flags).toContain('damp');
  });

  it('flags a value no real air has (instrument fault) instead of clipping it', async () => {
    const result = await ingestReading(message({ pm25: 4000 }), 'dev', memoryStore(), RECEIVED);
    expect(result.status === 'stored' && result.reading.flags).toContain('out_of_range');
    expect(result.status === 'stored' && result.reading.pm25).toBe(4000);
  });

  it('flags a reading that arrives more than two minutes after it was taken as stale', async () => {
    const result = await ingestReading(
      message({ ts: '2026-10-08T09:55:00.000Z' }),
      'dev',
      memoryStore(),
      RECEIVED,
    );
    expect(result.status === 'stored' && result.reading.flags).toContain('stale');
  });

  it('is safe to deliver twice: the second copy is a duplicate and changes nothing', async () => {
    const store = memoryStore();
    await ingestReading(message(), 'dev', store, RECEIVED);
    expect((await ingestReading(message(), 'dev', store, RECEIVED)).status).toBe('duplicate');
    expect(store.rows.size).toBe(1);
  });

  it('keeps two units with the same sequence number apart', async () => {
    const store = memoryStore();
    await ingestReading(message(), 'unit-a', store, RECEIVED);
    expect((await ingestReading(message(), 'unit-b', store, RECEIVED)).status).toBe('stored');
  });

  it.each([
    ['a missing field', { pm25: undefined }],
    ['a negative value', { pm25: -3 }],
    ['an unknown schema version', { schemaVersion: 2 }],
    ['humidity over 100', { rhPct: 140 }],
  ])('rejects %s and stores nothing', async (_name, over) => {
    const store = memoryStore();
    const result = await ingestReading(message(over), 'dev', store, RECEIVED);
    expect(result.status).toBe('rejected');
    expect(store.rows.size).toBe(0);
  });

  it('rejects a time stamp from the future (a clock that is wrong)', async () => {
    const result = await ingestReading(
      message({ ts: '2026-10-08T10:30:00.000Z' }),
      'dev',
      memoryStore(),
      RECEIVED,
    );
    expect(result).toMatchObject({
      status: 'rejected',
      reason: expect.stringMatching(/future/) as string,
    });
  });

  it('rejects a unit name that could be used to reach another unit’s rows', async () => {
    for (const bad of ['', 'a#b', '../x', 'x'.repeat(80), 'a b']) {
      expect((await ingestReading(message(), bad, memoryStore(), RECEIVED)).status).toBe(
        'rejected',
      );
    }
  });
});
