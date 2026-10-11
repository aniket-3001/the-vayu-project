import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { alertsFor } from '../alerts/model';
import { NoAirError } from '../air/fromApi';
import { setClock } from '../clock';
import { firesAffecting } from '../map/fires';
import { SAMPLE_AS_OF } from '../today/sample';
import { grapStageFor } from '../tasks/model';
import { WEEK_PINS } from './storage';
import recordedJson from './recorded.json';
import { dayRainChanceFor, rainChanceFor, recordedSource } from './recordedSource';
import { sceneFor } from './scene';
import type { Recorded, RecordedDay } from './types';

const recorded = recordedJson as unknown as Recorded;
const dayOf = (date: string): RecordedDay => {
  const day = recorded.days.find((d) => d.date === date);
  if (day === undefined) throw new Error(`No recorded day ${date}`);
  return day;
};
const HOME = { id: '28.59,77.05', name: 'Home', lat: 28.5921, lng: 77.046 };
const PARK = { id: '28.59,77.22', name: 'Park', lat: 28.5931, lng: 77.2197 };
const MUMBAI = { id: '19.08,72.88', name: 'Mumbai', lat: 19.076, lng: 72.8777 };

afterEach(() => {
  setClock(() => SAMPLE_AS_OF);
});
beforeAll(() => {
  expect(recorded.days).toHaveLength(7);
});

describe('the recorded days', () => {
  it('are seven real days, each with the same hours and a moment that falls inside them', () => {
    for (const day of recorded.days) {
      expect(day.hours).toBeGreaterThan(24 * 8);
      const from = Date.parse(`${day.seriesFrom}T00:00:00+05:30`);
      const now = (Date.parse(day.asOf) - from) / 3_600_000;
      expect(now).toBeGreaterThan(24 * 7);
      expect(now).toBeLessThan(day.hours);
      for (const series of Object.values(day.air)) {
        expect(series.pm25).toHaveLength(day.hours);
        expect(series.pm10).toHaveLength(day.hours);
        // A sentinel or an impossible value never survives the recording.
        for (const v of series.pm25) if (v !== null) expect(v).toBeLessThan(999);
      }
      expect(day.weather.windKmh).toHaveLength(day.hours);
    }
  });
});

describe('the recorded source', () => {
  it('answers with the app’s own shapes: observed hours before the moment, recorded hours after it', async () => {
    const day = dayOf('2025-10-31');
    setClock(() => day.asOf);
    const data = await recordedSource(recorded, day).today(HOME);
    expect(data.asOf).toBe(day.asOf);
    expect(data.provenance.label).toBe('Nearby station');
    expect(data.provenance.stationName).toContain('NSIT Dwarka');
    expect(data.history.every((h) => Date.parse(h.at) < Date.parse(day.asOf))).toBe(true);
    expect(data.hourly.slice(1).every((h) => Date.parse(h.at) >= Date.parse(day.asOf))).toBe(true);
    // The app shows the next two days by the hour.
    expect(data.hourly).toHaveLength(48);
    expect(data.weather?.condition).toBeDefined();
    expect(data.pollutants.pm25).toBe(data.pm25);
  });

  it('shows a rain alert on the rainy day and none on a dry one', async () => {
    const rainy = dayOf('2025-10-07');
    setClock(() => rainy.asOf);
    const data = await recordedSource(recorded, rainy).today(HOME);
    expect(alertsFor(data, 0).map((a) => a.kind)).toContain('rain');
    const dry = dayOf('2025-12-22');
    const dryData = await recordedSource(recorded, dry).today(HOME);
    expect(alertsFor(dryData, 0).map((a) => a.kind)).not.toContain('rain');
  });

  it('counts the day’s own fires for the stubble alert', async () => {
    const day = dayOf('2025-10-31');
    const { fires } = sceneFor(day);
    const near = firesAffecting(fires, HOME, 300).length;
    expect(near).toBeGreaterThan(10);
    const data = await recordedSource(recorded, day).today(HOME);
    expect(alertsFor(data, near).map((a) => a.kind)).toContain('stubble');
    // The clean day had no fire in the box at all.
    expect(sceneFor(dayOf('2025-10-07')).fires).toHaveLength(0);
  });

  it('shows each GRAP stage on a real day, never one the monitor’s own PM10 does not support', async () => {
    const stageOn = async (date: string, pin: (typeof WEEK_PINS)[number]): Promise<number> => {
      const day = dayOf(date);
      setClock(() => day.asOf);
      return grapStageFor(await recordedSource(recorded, day).today(pin));
    };
    const [home, park] = WEEK_PINS;
    if (home === undefined || park === undefined) throw new Error('no pins');
    // The morning after Diwali: Stage IV at three of the four monitors, and at the nearest one with a reading.
    expect(await stageOn('2025-10-21', park)).toBe(4);
    // R K Puram's own 24-hour index on 9 November was 445, Stage III, and Lodhi Road's 319, Stage II.
    expect(await stageOn('2025-11-09', home)).toBe(3);
    expect(await stageOn('2025-11-09', park)).toBe(2);
    expect(await stageOn('2025-10-31', home)).toBe(2);
    expect(await stageOn('2025-10-31', park)).toBe(1);
    // A clean-ish day has none.
    expect(await stageOn('2025-10-07', home)).toBe(0);
    // 22 December: every monitor's own index was Stage II (325 to 398). It was once shown as IV, from one hour's PM10
    // ratio stretched over the day; the figure is now held to the PM2.5 and a ratio of at most two.
    expect(await stageOn('2025-12-22', home)).toBe(2);
    expect(await stageOn('2025-12-22', park)).toBe(2);
  });

  it('says the stage and what the 24-hour average was, in words that agree with an AQI of 500', async () => {
    const day = dayOf('2025-10-21');
    setClock(() => day.asOf);
    const [, park] = WEEK_PINS;
    if (park === undefined) throw new Error('no pin');
    const data = await recordedSource(recorded, day).today(park);
    expect(data.aqi).toBe(500);
    const grap = alertsFor(data, 0, { school: false }).find((a) => a.kind === 'grap');
    expect(grap?.title).toBe('Air here is in the GRAP Stage IV band today');
    expect(grap?.body).toContain('last 24 hours at this monitor average AQI 500');
    // No school among the places: no line about assembly.
    expect(grap?.body).not.toMatch(/assembly/iu);
  });

  it('says so when this hour is at a higher stage than the 24-hour average', async () => {
    const day = dayOf('2025-10-31');
    setClock(() => day.asOf);
    const [home] = WEEK_PINS;
    if (home === undefined) throw new Error('no pin');
    const hot = await recordedSource(recorded, day).today(home);
    // A made-up hour on top of the real day: only the wording of the rule is under test.
    const spiked = {
      ...hot,
      pm25: 400,
      aqi: 450,
      pollutants: { ...hot.pollutants, pm25: 400, pm10: 400 },
    };
    const grap = alertsFor(spiked, 0, { school: false }).find((a) => a.kind === 'grap');
    expect(grap?.body).toMatch(/This hour alone is at Stage (III|IV) levels/u);
  });

  it('shows a wind alert on the windy day', async () => {
    const windy = dayOf('2026-03-30');
    setClock(() => windy.asOf);
    const data = await recordedSource(recorded, windy).today(HOME);
    expect(alertsFor(data, 0).map((a) => a.kind)).toContain('wind');
  });

  it('uses the next nearest monitor when the nearest has stopped reporting, and none beyond 40 km', async () => {
    // Lodhi Road (the Park's monitor) has nothing after February 2026.
    const windy = dayOf('2026-03-30');
    const source = recordedSource(recorded, windy);
    const park = await source.today(PARK);
    expect(park.provenance.stationName).not.toContain('Lodhi');
    await expect(source.today(MUMBAI)).rejects.toBeInstanceOf(NoAirError);
    await expect(source.history(MUMBAI)).rejects.toBeInstanceOf(NoAirError);
  });

  it('gives the history up to the moment only, and the monitors that reported before it', async () => {
    const day = dayOf('2025-10-21');
    const source = recordedSource(recorded, day);
    const history = await source.history(HOME);
    expect(history.length).toBe(24 * 8 + 8);
    expect(history.every((h) => Date.parse(h.t) < Date.parse(day.asOf))).toBe(true);
    const stations = await source.stations();
    expect(stations.length).toBeGreaterThan(0);
    for (const s of stations) expect(Date.parse(s.at)).toBeLessThanOrEqual(Date.parse(day.asOf));
  });

  it('can answer at once, so no screen waits on a recorded day', () => {
    const source = recordedSource(recorded, dayOf('2025-10-07'));
    expect(source.peekToday?.(HOME)).toBeDefined();
    expect(source.peekHistory?.(HOME)?.length).toBeGreaterThan(0);
    expect(source.peekStations?.()?.length).toBeGreaterThan(0);
    expect(source.peekToday?.(MUMBAI)).toBeUndefined();
  });

  it('turns the rain that fell into a chance of rain, in steps', () => {
    expect(rainChanceFor(0)).toBe(5);
    expect(rainChanceFor(0.2)).toBe(40);
    expect(rainChanceFor(1)).toBe(65);
    expect(rainChanceFor(4)).toBe(90);
    expect(dayRainChanceFor(0)).toBe(5);
    expect(dayRainChanceFor(0.6)).toBe(65);
    expect(dayRainChanceFor(14)).toBe(95);
  });
});
