import type { SimResult } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { SYNTHETIC_SCENARIOS } from './scenarios';
import {
  DEFAULT_FLOWS,
  compareRooms,
  frameAt,
  particleCountFor,
  runRoom,
  type RoomSetup,
} from './worldModel';

const grap = SYNTHETIC_SCENARIOS.find((s) => s.id === 'grap4')?.build();
if (grap === undefined) throw new Error('missing scenario');
const setup = (over: Partial<RoomSetup> = {}): RoomSetup => ({
  windows: 'closed',
  purifier: 'none',
  units: 1,
  ...over,
});
const run = (over: Partial<RoomSetup> = {}, flows = DEFAULT_FLOWS): SimResult =>
  runRoom({ run: grap, setup: setup(over), flows, puffs: [] });
const lastOf = (r: SimResult): number => r.series.at(-1)?.pm25 ?? 0;

describe('runRoom', () => {
  it('a purifier lowers the room; more airflow lowers it more', () => {
    const none = lastOf(run());
    const ordinary = lastOf(run({ purifier: 'ordinary' }));
    const ours = lastOf(run({ purifier: 'ours' }));
    expect(ordinary).toBeLessThan(none);
    expect(ours).toBeLessThan(ordinary); // because 250 m³/h is assumed higher than 150
  });

  it('follows the airflow you give it, not the name on the box: raise the ordinary one past ours and it wins', () => {
    const flows = { ours: 250, ordinary: 400 };
    expect(lastOf(run({ purifier: 'ordinary' }, flows))).toBeLessThan(
      lastOf(run({ purifier: 'ours' }, flows)),
    );
  });

  it('two units clean more than one', () => {
    expect(lastOf(run({ purifier: 'ours', units: 2 }))).toBeLessThan(
      lastOf(run({ purifier: 'ours', units: 1 })),
    );
  });

  it('open windows let in more of the outside than closed ones', () => {
    expect(lastOf(run({ windows: 'open' }))).toBeGreaterThan(lastOf(run({ windows: 'closed' })));
  });

  it('with the windows open, a purifier struggles: the room sits closer to outside', () => {
    const closed = lastOf(run({ purifier: 'ours', windows: 'closed' }));
    const open = lastOf(run({ purifier: 'ours', windows: 'open' }));
    expect(open).toBeGreaterThan(closed * 2);
  });

  it('a smoke puff raises the room, and the room then clears', () => {
    const puffs = [
      { at: grap.outdoor[10]?.hourStart ?? '', kind: 'smoke' as const, pm25: 150, pm10: 180 },
    ];
    const withPuff = runRoom({
      run: grap,
      setup: setup({ purifier: 'ours' }),
      flows: DEFAULT_FLOWS,
      puffs,
    });
    const without = run({ purifier: 'ours' });
    const at = (r: typeof withPuff, hour: number): number =>
      r.series.find((p) => p.ts === grap.outdoor[hour]?.hourStart)?.pm25 ?? 0;
    expect(at(withPuff, 10)).toBeGreaterThan(at(without, 10) + 100);
    expect(at(withPuff, 14) - at(without, 14)).toBeLessThan(at(withPuff, 10) - at(without, 10));
  });

  it('opens the day with the rooms already settled: the purifier room is lower from the first reading', () => {
    expect(run({ purifier: 'ours' }).series[0]?.pm25 ?? 0).toBeLessThan(run().series[0]?.pm25 ?? 0);
  });

  it('shows the day only: the first reading is midnight, and there are 24 hours of steps', () => {
    const series = run().series;
    expect(series[0]?.ts).toBe(grap.startAt);
    expect(series.at(-1)?.ts).toBe(
      new Date(Date.parse(grap.startAt) + 24 * 3_600_000).toISOString(),
    );
    expect(series).toHaveLength(24 * 4 + 1);
  });

  it('is repeatable', () => {
    expect(run({ purifier: 'ours' })).toEqual(run({ purifier: 'ours' }));
  });
});

describe('frameAt', () => {
  const result = run({ purifier: 'ours' });
  it('reads the room and the outside at one moment, and says how much lower the room is', () => {
    const frame = frameAt(result, grap.outdoor, 12 * 3_600_000 + Date.parse(grap.startAt));
    expect(frame.insidePm25).toBeGreaterThan(0);
    expect(frame.outsidePm25).toBeGreaterThan(frame.insidePm25);
    expect(frame.lowerThanOutsidePct).toBeCloseTo(
      (1 - frame.insidePm25 / frame.outsidePm25) * 100,
      5,
    );
  });
  it('uses the last known step when asked between steps, never a later one (no look-ahead)', () => {
    const t = Date.parse(grap.startAt) + 7 * 60_000;
    const earlier = frameAt(result, grap.outdoor, t);
    const exact = result.series.find(
      (p) => Date.parse(p.ts) <= t && Date.parse(p.ts) > t - 31 * 60_000,
    );
    expect(earlier.insidePm25).toBe(exact?.pm25);
  });
  it('clamps to the day, so a clock past the end still shows the last step', () => {
    const after = frameAt(result, grap.outdoor, Date.parse(grap.startAt) + 99 * 3_600_000);
    expect(after.insidePm25).toBe(result.series.at(-1)?.pm25);
  });
});

describe('particleCountFor', () => {
  it('is none in clean air and grows with the concentration, but never past what the scene can draw', () => {
    expect(particleCountFor(0)).toBe(0);
    expect(particleCountFor(20)).toBeGreaterThan(0);
    expect(particleCountFor(300)).toBeGreaterThan(particleCountFor(100));
    expect(particleCountFor(10_000)).toBeLessThanOrEqual(260);
  });
  it('never goes negative or non-finite', () => {
    expect(particleCountFor(-5)).toBe(0);
    expect(particleCountFor(Number.NaN)).toBe(0);
  });
});

describe('compareRooms', () => {
  it('says which room is lower and by how much, in this model', () => {
    expect(compareRooms(200, 50)).toMatch(/Room B has 75% less PM2\.5 than Room A/);
    expect(compareRooms(50, 200)).toMatch(/Room A has 75% less PM2\.5 than Room B/);
  });
  it('says they are about the same when they are', () => {
    expect(compareRooms(100, 101)).toMatch(/about the same/);
  });
  it('says nothing is to compare when there is no air at all', () => {
    expect(compareRooms(0, 0)).toMatch(/about the same/);
  });
});
