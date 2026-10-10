import { describe, expect, it, vi } from 'vitest';
import {
  NORTH_INDIA_BOX,
  countFires,
  firmsFireRepo,
  fixtureFireRepo,
  parseFirmsCsv,
} from './fires';

const HEADER =
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight';

describe('parseFirmsCsv', () => {
  it('parses a row, converting HHMM UTC and confidence letters', () => {
    const rows = parseFirmsCsv(
      `${HEADER}\n30.9,75.8,345,0.4,0.4,2026-10-05,0830,N20,VIIRS,h,2.0NRT,300,12.5,D`,
    );
    expect(rows).toEqual([
      {
        lat: 30.9,
        lng: 75.8,
        detectedAt: '2026-10-05T08:30:00.000Z',
        confidence: 'high',
        frp: 12.5,
      },
    ]);
  });

  it('pads short times and skips unparseable rows', () => {
    const rows = parseFirmsCsv(
      `${HEADER}\n30,75,1,1,1,2026-10-05,30,N20,VIIRS,n,v,1,,D\nbad,75,1,1,1,2026-10-05,0830,N20,VIIRS,n,v,1,1,D`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.detectedAt).toBe('2026-10-05T00:30:00.000Z');
    expect(rows[0]?.frp).toBeNull();
  });

  it('returns nothing for an empty body and throws on a missing column', () => {
    expect(parseFirmsCsv('')).toEqual([]);
    expect(() => parseFirmsCsv('latitude,longitude\n1,2')).toThrow(/missing/);
  });
});

describe('countFires', () => {
  it('counts by age and ignores low confidence', async () => {
    const all = await fixtureFireRepo().firesIn(NORTH_INDIA_BOX, '2026-10-05T21:00:00Z');
    expect(countFires(all, '2026-10-05T21:00:00Z')).toEqual({ last24h: 2, last72h: 3 });
  });
});

describe('fixtureFireRepo', () => {
  it('never returns detections after asOf (rule I1)', async () => {
    const early = await fixtureFireRepo().firesIn(NORTH_INDIA_BOX, '2026-10-05T09:00:00Z');
    expect(early.every((d) => d.detectedAt <= '2026-10-05T09:00:00.000Z')).toBe(true);
    expect(early).toHaveLength(3);
  });
});

describe('firmsFireRepo', () => {
  it('builds the documented URL and filters by asOf', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(`${HEADER}\n30,75,1,1,1,2026-10-05,2300,N20,VIIRS,n,v,1,1,D`),
    });
    const rows = await firmsFireRepo({ mapKey: 'KEY', fetchImpl }).firesIn(
      NORTH_INDIA_BOX,
      '2026-10-05T12:00:00Z',
    );
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toBe(
      'https://firms.modaps.eosdis.nasa.gov/api/area/csv/KEY/VIIRS_NOAA20_NRT/73.8,27.6,78,32.6/3',
    );
    expect(rows).toEqual([]);
  });

  it('throws a clear error without leaking the key', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
    const err = await firmsFireRepo({ mapKey: 'SECRET', fetchImpl })
      .firesIn(NORTH_INDIA_BOX, '2026-10-05T12:00:00Z')
      .catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/FIRMS request failed: 401/);
    expect((err as Error).message).not.toContain('SECRET');
  });
});
