import type { Reading } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import type { RoomObservation } from '@vayu/contracts';
import { latestOutside, roomObservation, type OutsideReference } from './roomObservation';
import type { StationSnapshot } from './harvest';

const ASOF = '2026-10-08T10:00:00.000Z';
const at = (minutesAgo: number): string =>
  new Date(Date.parse(ASOF) - minutesAgo * 60_000).toISOString();
const reading = (minutesAgo: number, pm25: number, over: Partial<Reading> = {}): Reading => ({
  schemaVersion: 1,
  id: `r-${minutesAgo}`,
  thingId: 'dev',
  ts: at(minutesAgo),
  pm25,
  pm10: pm25 * 1.5,
  rhPct: 50,
  flags: [],
  simulated: false,
  ...over,
});
const outside: OutsideReference = { pm25: 120, observedAt: at(20) };
const observe = (readings: readonly Reading[], out: OutsideReference = outside): RoomObservation =>
  roomObservation({ roomId: 'dev', roomName: 'Room', asOf: ASOF, readings, outside: out });

describe('roomObservation', () => {
  it('takes the median of the last 30 minutes, so one wild reading does not move it', () => {
    const o = observe([
      reading(1, 40),
      reading(2, 41),
      reading(3, 39),
      reading(4, 5000, { flags: ['out_of_range'] }),
      reading(5, 40),
    ]);
    expect(o.insidePm25).toBe(40);
  });

  it('reports a tenth of a microgram, not floating-point noise', () => {
    const o = observe([reading(1, 284.6), reading(2, 284.5)]);
    expect(o.insidePm25).toBe(284.6); // the mean of the two middle values is 284.55, shown as 284.6
    expect(observe([reading(1, 0.1), reading(2, 0.2)]).insidePm25).toBe(0.2);
  });

  it('ignores readings older than 30 minutes and readings after the as-of time', () => {
    const o = observe([reading(45, 900), reading(2, 40), reading(-5, 700)]);
    expect(o.insidePm25).toBe(40);
  });

  it('leaves out stale and out-of-range readings but still counts them as the unit being seen', () => {
    const o = observe([reading(1, 3000, { flags: ['out_of_range'] })]);
    expect(o.insidePm25).toBeNull();
    expect(o.lastSeenMinutes).toBe(1);
  });

  it('reports when the newest reading was observed, and the humidity at that time', () => {
    const o = observe([reading(5, 40, { rhPct: 60 }), reading(1, 42, { rhPct: 88 })]);
    expect(o.insideObservedAt).toBe(at(1));
    expect(o.rhPct).toBe(88);
  });

  it('knows nothing when the unit has not reported: no inside number, not seen', () => {
    const o = observe([]);
    expect(o).toMatchObject({
      insidePm25: null,
      insideObservedAt: null,
      lastSeenMinutes: null,
      simulated: false,
    });
  });

  it('is simulated when any reading behind it is', () => {
    expect(observe([reading(1, 40), reading(2, 41, { simulated: true })]).simulated).toBe(true);
    expect(observe([reading(1, 40)]).simulated).toBe(false);
  });

  it('passes the outside reference through, or says there is none', () => {
    expect(observe([reading(1, 40)]).outsidePm25).toBe(120);
    const none = observe([reading(1, 40)], { pm25: null, observedAt: null });
    expect(none).toMatchObject({ outsidePm25: null, outsideObservedAt: null });
  });
});

describe('latestOutside', () => {
  const snapshot = (
    hours: StationSnapshot['hours'],
    status: StationSnapshot['status'] = 'fresh',
  ): StationSnapshot => ({
    schemaVersion: 1,
    harvestedAt: ASOF,
    placeId: 'school',
    status,
    hours,
  });

  it('uses the newest hour with a reading, observed at the end of that hour', () => {
    const out = latestOutside(
      snapshot([
        { hourStart: '2026-10-08T07:00:00.000Z', pm25: 90, pm10: null },
        { hourStart: '2026-10-08T08:00:00.000Z', pm25: 95, pm10: null },
        { hourStart: '2026-10-08T09:00:00.000Z', pm25: null, pm10: null },
      ]),
      ASOF,
    );
    expect(out).toEqual({ pm25: 95, observedAt: '2026-10-08T09:00:00.000Z' });
  });

  it('never uses an hour that had not ended by the as-of time', () => {
    const out = latestOutside(
      snapshot([{ hourStart: '2026-10-08T09:30:00.000Z', pm25: 400, pm10: null }]),
      ASOF,
    );
    expect(out).toEqual({ pm25: null, observedAt: null });
  });

  it('says there is no outside reference when nothing was harvested or no station was fresh', () => {
    expect(latestOutside(undefined, ASOF)).toEqual({ pm25: null, observedAt: null });
    expect(latestOutside(snapshot([], 'no_fresh_station'), ASOF)).toEqual({
      pm25: null,
      observedAt: null,
    });
  });
});
