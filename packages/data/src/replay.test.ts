import type { Place } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildReplayWeek,
  hourlyFromRows,
  parseArchiveCsv,
  parseArchiveStation,
  type ReplayStationInput,
} from './replay';

const HEADER = 'location_id,sensors_id,location,datetime,lat,lon,parameter,units,value';
const csv = (...rows: string[]): string => [HEADER, ...rows].join('\n');
const row = (datetime: string, parameter: string, value: string): string =>
  `7,70,Test Station,${datetime},28.6,77.2,${parameter},µg/m³,${value}`;

describe('the real archive format (every field quoted, commas inside names)', () => {
  const quoted = [
    '"location_id","sensors_id","location","datetime","lat","lon","parameter","units","value"',
    '1000,1803,"Anand Vihar, Delhi - DPCC","2025-12-01T01:00:00+05:30","28.6508","77.3152","pm25","µg/m³","180.5"',
  ].join('\n');
  it('parses rows and the station position', () => {
    expect(parseArchiveCsv(quoted)).toEqual([
      { at: '2025-11-30T19:30:00.000Z', parameter: 'pm25', value: 180.5 },
    ]);
    expect(parseArchiveStation(quoted)).toEqual({
      name: 'Anand Vihar, Delhi - DPCC',
      lat: 28.6508,
      lng: 77.3152,
    });
  });
});

describe('parseArchiveCsv', () => {
  it('reads rows, converts the time to UTC and drops invalid values', () => {
    const rows = parseArchiveCsv(
      csv(
        row('2025-12-12T05:30:00+05:30', 'pm25', '120.5'),
        row('2025-12-12T06:30:00+05:30', 'pm25', '-999'),
        row('2025-12-12T06:30:00+05:30', 'no2', '30'),
        row('2025-12-12T07:30:00+05:30', 'pm10', '300'),
        '',
      ),
    );
    expect(rows).toEqual([
      { at: '2025-12-12T00:00:00.000Z', parameter: 'pm25', value: 120.5 },
      { at: '2025-12-12T02:00:00.000Z', parameter: 'pm10', value: 300 },
    ]);
  });
  it('drops instrument faults instead of clipping them (10,000 µg/m³ is not a very bad day)', () => {
    const rows = parseArchiveCsv(
      csv(
        row('2025-12-12T05:30:00+05:30', 'pm25', '10000'),
        row('2025-12-12T06:30:00+05:30', 'pm25', '1000'),
        row('2025-12-12T07:30:00+05:30', 'pm10', '2500'),
      ),
    );
    expect(rows.map((r) => r.value)).toEqual([1000]);
  });
  it('refuses a file without the expected columns instead of guessing', () => {
    expect(() => parseArchiveCsv('a,b,c\n1,2,3')).toThrow(/datetime/);
  });
});

describe('parseArchiveStation', () => {
  it('reads the name and position from the first row', () => {
    expect(parseArchiveStation(csv(row('2025-12-12T05:30:00+05:30', 'pm25', '1')))).toEqual({
      name: 'Test Station',
      lat: 28.6,
      lng: 77.2,
    });
  });
  it('gives nothing for an empty file', () => {
    expect(parseArchiveStation(HEADER)).toBeUndefined();
  });
});

describe('hourlyFromRows', () => {
  const rows = parseArchiveCsv(
    csv(
      row('2025-12-12T10:00:00+00:00', 'pm25', '100'),
      row('2025-12-12T10:30:00+00:00', 'pm25', '200'),
      row('2025-12-12T10:30:00+00:00', 'pm10', '400'),
    ),
  );
  it('by default treats a time as the END of its hour, so no value is used early', () => {
    const hours = hourlyFromRows(rows);
    expect(hours.map((h) => h.hourStart)).toEqual([
      '2025-12-12T09:00:00.000Z',
      '2025-12-12T10:00:00.000Z',
    ]);
    expect(hours[0]).toMatchObject({ pm25: 100, pm10: null });
    expect(hours[1]).toMatchObject({ pm25: 200, pm10: 400 });
  });
  it('can treat a time as the start of its hour, and averages values inside one hour', () => {
    const hours = hourlyFromRows(rows, 'start');
    expect(hours).toEqual([{ hourStart: '2025-12-12T10:00:00.000Z', pm25: 150, pm10: 400 }]);
  });
});

describe('buildReplayWeek', () => {
  const places: Place[] = [
    { id: 'home', name: 'Home', kind: 'home', lat: 28.59, lng: 77.04 },
    { id: 'park', name: 'Park', kind: 'park', lat: 28.59, lng: 77.22 },
    { id: 'faraway', name: 'Far', kind: 'other', lat: 30.5, lng: 75.0 },
  ];
  const stationWith = (
    id: string,
    lat: number,
    lng: number,
    hours: number,
  ): ReplayStationInput => ({
    station: { id, name: `Station ${id}`, lat, lng },
    hours: Array.from({ length: hours }, (_, i) => ({
      hourStart: new Date(Date.UTC(2025, 11, 1) + i * 3_600_000).toISOString(),
      pm25: 100 + i,
      pm10: null,
    })),
  });
  const base = {
    weekId: 'W1',
    title: 'GRAP IV week',
    start: '2025-12-08T00:00:00.000Z',
    end: '2025-12-15T00:00:00.000Z',
    places,
    events: [],
    minValidHours: 100,
  };

  it('gives each place the nearest station that has enough data, and names the distance', () => {
    const { series } = buildReplayWeek({
      ...base,
      stations: [
        stationWith('thin', 28.591, 77.041, 10),
        stationWith('west', 28.6, 77.05, 300),
        stationWith('east', 28.6, 77.23, 300),
      ],
    });
    expect(series.get('home')?.station.id).toBe('west');
    expect(series.get('park')?.station.id).toBe('east');
    expect(series.get('home')?.station.distanceKm).toBeGreaterThan(0);
  });
  it('leaves a place out when no station is within reach, and says so in the note', () => {
    const { series, manifest } = buildReplayWeek({
      ...base,
      stations: [stationWith('west', 28.6, 77.05, 300)],
    });
    expect(series.has('faraway')).toBe(false);
    expect(manifest.note).toMatch(/faraway/);
  });
  it('keeps one week of history before the start and nothing after the end', () => {
    const { series } = buildReplayWeek({
      ...base,
      stations: [stationWith('west', 28.6, 77.05, 24 * 20)],
    });
    const hours = series.get('home')?.hours ?? [];
    expect(hours[0]?.hourStart).toBe('2025-12-01T00:00:00.000Z');
    expect(hours.at(-1)?.hourStart).toBe('2025-12-14T23:00:00.000Z');
  });
  it('lists the stations used in the manifest and passes events through with their source', () => {
    const { manifest } = buildReplayWeek({
      ...base,
      events: [{ date: '2025-12-12', label: 'GRAP IV order', source: 'CAQM order of 12 Dec 2025' }],
      stations: [stationWith('west', 28.6, 77.05, 300)],
    });
    expect(manifest).toMatchObject({
      weekId: 'W1',
      stationIds: ['west'],
      events: [{ source: 'CAQM order of 12 Dec 2025' }],
    });
  });
});
