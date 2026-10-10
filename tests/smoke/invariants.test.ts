import { describe, expect, it } from 'vitest';
import {
  checkError,
  checkFires,
  checkHistory,
  checkReplayTimeline,
  checkRoom,
  checkSecurityHeaders,
  checkStations,
  checkTimeline,
  checkToday,
  type TimelineLike,
} from './invariants';

const AS_OF = '2026-10-06T06:00:00.000Z';
const stationProv = {
  mode: 'live',
  label: 'Nearby station',
  source: 'station',
  ageMinutes: 20,
  stationName: 'Air Check',
  distanceKm: 3.6,
};
const forecastProv = { mode: 'model', label: 'Estimate', source: 'forecast', ageMinutes: 0 };

const hourAt = (t: TimelineLike, index: number): TimelineLike['hours'][number] => {
  const hour = t.hours[index];
  if (hour === undefined) throw new Error(`no hour at ${index}`);
  return hour;
};

const live = (): TimelineLike => ({
  mode: 'live',
  asOf: AS_OF,
  prov: stationProv,
  hours: [
    { hourStart: '2026-10-06T04:00:00.000Z', kind: 'observed', prov: stationProv },
    { hourStart: '2026-10-06T05:00:00.000Z', kind: 'observed', prov: stationProv },
    { hourStart: '2026-10-06T07:00:00.000Z', kind: 'forecast', prov: forecastProv },
  ],
});

const model = (): TimelineLike => ({
  mode: 'model',
  asOf: AS_OF,
  prov: { mode: 'model', label: 'Estimate', source: 'model', ageMinutes: 0, simulated: true },
  hours: [
    {
      hourStart: '2026-10-06T07:00:00.000Z',
      kind: 'pattern',
      prov: { mode: 'model', label: 'Estimate', source: 'pattern', ageMinutes: 0, simulated: true },
    },
  ],
});

describe('checkTimeline', () => {
  it('passes a well-formed live timeline and a well-formed model fallback', () => {
    expect(checkTimeline(live())).toEqual([]);
    expect(checkTimeline(model())).toEqual([]);
  });

  it('catches a forecast labelled live, the bug found by driving the real app', () => {
    const t = live();
    const bad = {
      ...t,
      hours: [...t.hours.slice(0, 2), { ...hourAt(t, 2), prov: { ...forecastProv, mode: 'live' } }],
    };
    expect(checkTimeline(bad).join()).toMatch(/forecast is model output but is labelled live/);
  });

  it('catches a forecast that carries a station name', () => {
    const t = live();
    const bad = {
      ...t,
      hours: [
        hourAt(t, 0),
        hourAt(t, 1),
        { ...hourAt(t, 2), prov: { ...forecastProv, stationName: 'Air Check' } },
      ],
    };
    expect(checkTimeline(bad).join()).toMatch(/forecast carries a station name/);
  });

  it('catches an observed hour that had not ended by asOf (rule I1)', () => {
    const t = live();
    const bad = {
      ...t,
      hours: [
        ...t.hours,
        { hourStart: '2026-10-06T05:30:00.000Z', kind: 'observed', prov: stationProv },
      ],
    };
    expect(checkTimeline(bad).join()).toMatch(/had not ended by asOf/);
  });

  it('catches a label that does not match its source (trust hierarchy)', () => {
    const t = live();
    const bad = {
      ...t,
      hours: [
        { ...hourAt(t, 0), prov: { ...stationProv, label: 'Estimate' } },
        ...t.hours.slice(1),
      ],
    };
    expect(checkTimeline(bad).join()).toMatch(/does not match source/);
  });

  it('catches a live timeline with stale readings or no station details', () => {
    const t = live();
    const stale = {
      ...t,
      hours: t.hours.map((h) =>
        h.kind === 'observed' ? { ...h, prov: { ...stationProv, ageMinutes: 600 } } : h,
      ),
    };
    expect(checkTimeline(stale).join()).toMatch(/600 minutes old/);
    const anonymous = {
      ...t,
      prov: { ...stationProv, stationName: undefined, distanceKm: undefined },
    };
    expect(checkTimeline(anonymous).join()).toMatch(/no station name/);
  });

  it('catches a model fallback that is not marked simulated or sneaks in observed hours (rule I5)', () => {
    const m = model();
    expect(checkTimeline({ ...m, prov: { ...m.prov, simulated: false } }).join()).toMatch(
      /not marked simulated/,
    );
    expect(
      checkTimeline({
        ...m,
        hours: [
          { hourStart: '2026-10-06T04:00:00.000Z', kind: 'observed', prov: stationProv },
          ...m.hours,
        ],
      }).join(),
    ).toMatch(/contains observed hours/);
  });
});

describe('checkFires', () => {
  const good = {
    asOf: AS_OF,
    source: 'NASA FIRMS satellite fire detections',
    counts: { last24h: 3, last72h: 9 },
  };

  it('passes real-looking counts', () => {
    expect(checkFires(good)).toEqual([]);
  });

  it('catches impossible counts, a missing label and any mention of PM2.5', () => {
    expect(checkFires({ ...good, counts: { last24h: 10, last72h: 9 } }).join()).toMatch(
      /more detections/,
    );
    expect(checkFires({ ...good, counts: { last24h: 1.5, last72h: 9 } }).join()).toMatch(
      /non-negative integers/,
    );
    expect(checkFires({ ...good, source: 'NASA FIRMS' }).join()).toMatch(/do not say|does not say/);
    expect(checkFires({ ...good, note: 'PM2.5 up' }).join()).toMatch(/not a pollution reading/);
  });
});

describe('checkError', () => {
  it('requires the one error shape', () => {
    expect(
      checkError({ error: { code: 'unknown_place', message: 'No place called "x"' } }),
    ).toEqual([]);
    expect(checkError({ error: 'nope' })).not.toEqual([]);
    expect(checkError(null)).not.toEqual([]);
  });
});

describe('checkReplayTimeline', () => {
  const WEEK = { start: '2025-12-08T00:00:00Z', end: '2025-12-15T00:00:00Z' };
  const replayProv = {
    mode: 'replay',
    label: 'Nearby station',
    source: 'station',
    ageMinutes: 20,
    stationName: 'R K Puram',
    distanceKm: 1.2,
    simulated: true,
  };
  const patternProv = {
    mode: 'replay',
    label: 'Estimate',
    source: 'pattern',
    ageMinutes: 0,
    simulated: true,
  };
  const replay = (): TimelineLike => ({
    mode: 'replay',
    asOf: '2025-12-12T06:00:00.000Z',
    prov: replayProv,
    hours: [
      { hourStart: '2025-12-12T04:00:00.000Z', kind: 'observed', prov: replayProv },
      { hourStart: '2025-12-12T05:00:00.000Z', kind: 'observed', prov: replayProv },
      { hourStart: '2025-12-12T07:00:00.000Z', kind: 'pattern', prov: patternProv },
    ],
  });

  it('passes a well-formed replay', () => {
    expect(checkReplayTimeline(replay(), WEEK)).toEqual([]);
  });
  it('fails an observed hour that had not ended by asOf (rule I1)', () => {
    const t = replay();
    expect(
      checkReplayTimeline(
        {
          ...t,
          hours: [{ hourStart: '2025-12-12T05:30:00.000Z', kind: 'observed', prov: replayProv }],
        },
        WEEK,
      ).join(' '),
    ).toMatch(/rule I1/);
  });
  it('fails a replay that says it is live, or is not marked simulated', () => {
    expect(checkReplayTimeline({ ...replay(), mode: 'live' }, WEEK).join(' ')).toMatch(
      /expected "replay"/,
    );
    expect(
      checkReplayTimeline({ ...replay(), prov: { ...replayProv, simulated: false } }, WEEK).join(
        ' ',
      ),
    ).toMatch(/rule I5/);
  });
  it('fails an instant outside the week', () => {
    expect(
      checkReplayTimeline({ ...replay(), asOf: '2025-12-20T00:00:00.000Z' }, WEEK).join(' '),
    ).toMatch(/outside the prepared week/);
  });
});

describe('checkRoom', () => {
  const room = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    asOf: '2026-10-08T10:00:00.000Z',
    insidePm25: 40,
    insideObservedAt: '2026-10-08T09:59:50.000Z',
    outsidePm25: 130,
    outsideObservedAt: '2026-10-08T09:00:00.000Z',
    lastSeenMinutes: 0,
    simulated: true,
    ...over,
  });
  it('passes a room with readings', () => {
    expect(checkRoom(room())).toEqual([]);
  });
  it('passes a unit that was never seen: everything unknown, nothing invented', () => {
    expect(
      checkRoom(
        room({ insidePm25: null, insideObservedAt: null, lastSeenMinutes: null, simulated: false }),
      ),
    ).toEqual([]);
  });
  it('fails a number with no time, a time with no number, and a zero standing in for unknown', () => {
    expect(checkRoom(room({ insideObservedAt: null })).join(' ')).toMatch(
      /both be present or both null/,
    );
    expect(checkRoom(room({ insidePm25: null })).join(' ')).toMatch(/both be present or both null/);
    expect(checkRoom(room({ insidePm25: -1 })).join(' ')).toMatch(/non-negative/);
  });
  it('fails a reading from after asOf, and a number from a unit never seen', () => {
    expect(checkRoom(room({ insideObservedAt: '2026-10-08T10:05:00.000Z' })).join(' ')).toMatch(
      /observed after asOf/,
    );
    expect(checkRoom(room({ lastSeenMinutes: null })).join(' ')).toMatch(/never seen/);
  });
  it('fails an answer that does not say whether it is simulated', () => {
    expect(checkRoom(room({ simulated: undefined })).join(' ')).toMatch(/simulated/);
  });
});

describe('checkToday', () => {
  const base = {
    mode: 'live',
    asOf: '2026-10-10T12:00:00.000Z',
    hours: [
      { t: '2026-10-10T09:30:00.000Z', pm25: 60, kind: 'observed' },
      { t: '2026-10-10T10:30:00.000Z', pm25: 62, kind: 'observed' },
      { t: '2026-10-10T12:30:00.000Z', pm25: 65, kind: 'forecast' },
    ],
    windows: [],
    prov: {
      mode: 'live',
      label: 'Nearby station',
      source: 'station',
      stationName: 'GK1',
      distanceKm: 4,
      ageMinutes: 30,
      observedAt: '2026-10-10T11:30:00.000Z',
    },
  };
  it('passes a good live answer and a good model answer', () => {
    expect(checkToday(base)).toEqual([]);
    expect(
      checkToday({
        ...base,
        mode: 'model',
        hours: [{ t: '2026-10-10T11:30:00.000Z', pm25: 65, kind: 'forecast' }],
        prov: { mode: 'model', label: 'Estimate', source: 'model', ageMinutes: 0 },
      }),
    ).toEqual([]);
  });
  it('catches an observed hour that had not ended, a stale reading, and an unnamed station (I1, I3, I2)', () => {
    const late = {
      ...base,
      hours: [...base.hours, { t: '2026-10-10T11:30:00.000Z', pm25: 70, kind: 'observed' }],
    };
    expect(checkToday(late).join()).toMatch(/had not ended/u);
    expect(checkToday({ ...base, prov: { ...base.prov, ageMinutes: 400 } }).join()).toMatch(
      /rule I3/u,
    );
    expect(checkToday({ ...base, prov: { ...base.prov, stationName: undefined } }).join()).toMatch(
      /station name/u,
    );
  });
  it('catches a model answer with no figure for the hour in progress, which leaves a place with no reading', () => {
    const model = {
      ...base,
      mode: 'model',
      hours: [{ t: '2026-10-10T12:30:00.000Z', pm25: 65, kind: 'forecast' }],
      prov: { mode: 'model', label: 'Estimate', source: 'model', ageMinutes: 0 },
    };
    expect(checkToday(model).join()).toMatch(/hour in progress/u);
  });
  it('catches a model answer that has observed hours, a station, or advice', () => {
    const model = {
      ...base,
      mode: 'model',
      prov: { mode: 'model', label: 'Estimate', source: 'model', ageMinutes: 0 },
    };
    expect(checkToday(model).join()).toMatch(/observed hours/u);
    expect(checkToday({ ...model, hours: [], windows: [{}] }).join()).toMatch(/advice/u);
  });
  it('catches impossible numbers and hours out of order', () => {
    expect(
      checkToday({
        ...base,
        hours: [{ t: '2026-10-10T09:30:00.000Z', pm25: -3, kind: 'observed' }],
      }).join(),
    ).toMatch(/not possible/u);
    expect(checkToday({ ...base, hours: [...base.hours].reverse() }).join()).toMatch(/order/u);
  });
});

describe('checkHistory', () => {
  const ok = {
    mode: 'live',
    asOf: '2026-10-10T12:00:00.000Z',
    days: 1,
    hours: [
      { t: '2026-10-10T09:30:00.000Z', pm25: 60 },
      { t: '2026-10-10T10:30:00.000Z', pm25: null },
    ],
    prov: {
      mode: 'live',
      label: 'Nearby station',
      source: 'station',
      stationName: 'GK1',
      ageMinutes: 30,
    },
  };
  it('passes good history, and catches an unended hour, too many hours, and a model answer wearing a station label', () => {
    expect(checkHistory(ok)).toEqual([]);
    expect(
      checkHistory({
        ...ok,
        hours: [...ok.hours, { t: '2026-10-10T11:30:00.000Z', pm25: 3 }],
      }).join(),
    ).toMatch(/had not ended/u);
    expect(
      checkHistory({
        ...ok,
        hours: Array.from({ length: 30 }, (_, i) => ({
          t: new Date(Date.UTC(2026, 9, 9, i)).toISOString(),
          pm25: 1,
        })),
      }).join(),
    ).toMatch(/for 1 days/u);
    expect(checkHistory({ ...ok, mode: 'model' }).join()).toMatch(/labelled/u);
  });
});

describe('checkStations', () => {
  const ok = {
    asOf: '2026-10-10T12:00:00.000Z',
    mode: 'live',
    stations: [{ id: 'a', lat: 28, lng: 77, pm25: 50, at: '2026-10-10T11:00:00.000Z' }],
  };
  it('passes recent monitors, and catches old, future, impossible, repeated, and a live answer with none', () => {
    expect(checkStations(ok)).toEqual([]);
    const s = ok.stations[0];
    if (s === undefined) throw new Error('no station');
    expect(
      checkStations({ ...ok, stations: [{ ...s, at: '2026-10-10T01:00:00.000Z' }] }).join(),
    ).toMatch(/six hours/u);
    expect(
      checkStations({ ...ok, stations: [{ ...s, at: '2026-10-10T13:00:00.000Z' }] }).join(),
    ).toMatch(/future/u);
    expect(checkStations({ ...ok, stations: [{ ...s, pm25: 5000 }] }).join()).toMatch(
      /not possible/u,
    );
    expect(checkStations({ ...ok, stations: [s, s] }).join()).toMatch(/twice/u);
    expect(checkStations({ ...ok, stations: [] }).join()).toMatch(/no monitors/u);
  });
});

describe('checkSecurityHeaders', () => {
  const headers = (over: Record<string, string> = {}): { get(name: string): string | null } => {
    const all: Record<string, string> = {
      'content-security-policy': "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      ...over,
    };
    return { get: (name) => all[name] ?? null };
  };
  it('passes the headers we send and catches each one missing or weakened', () => {
    expect(checkSecurityHeaders(headers())).toEqual([]);
    expect(checkSecurityHeaders(headers({ 'content-security-policy': '' })).length).toBeGreaterThan(
      1,
    );
    expect(
      checkSecurityHeaders(
        headers({
          'content-security-policy':
            "default-src 'self'; script-src 'unsafe-inline'; frame-ancestors 'none'",
        }),
      ).join(),
    ).toMatch(/inline/u);
    expect(checkSecurityHeaders(headers({ 'strict-transport-security': '' })).join()).toMatch(
      /HSTS/u,
    );
    expect(checkSecurityHeaders(headers({ 'x-content-type-options': '' })).join()).toMatch(
      /nosniff/u,
    );
    expect(checkSecurityHeaders(headers({ 'x-frame-options': 'SAMEORIGIN' })).join()).toMatch(
      /frame/u,
    );
  });
});
