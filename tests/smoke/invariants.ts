/**
 * Rules that must hold on every real API response, checked on live data by `live.ts` (08.2). Each
 * returns a list of problems; empty means it passes. Kept pure so the checks themselves are tested
 * without a network.
 */

const HOUR_MS = 3_600_000;
const MAX_LIVE_AGE_MINUTES = 6 * 60;

interface ProvLike {
  readonly mode: string;
  readonly label: string;
  readonly source: string;
  readonly ageMinutes: number;
  readonly simulated?: boolean | undefined;
  readonly stationName?: string | undefined;
  readonly distanceKm?: number | undefined;
}

export interface TimelineLike {
  readonly mode: string;
  readonly asOf: string;
  readonly hours: readonly {
    readonly hourStart: string;
    readonly kind: string;
    readonly prov: ProvLike;
  }[];
  readonly prov: ProvLike;
}

/** The trust hierarchy (08.1): a station is "Nearby station", everything modelled is "Estimate". */
const LABEL_FOR_SOURCE: Readonly<Record<string, string>> = {
  unit: 'Your room',
  station: 'Nearby station',
};

export function checkTimeline(timeline: TimelineLike): string[] {
  const problems: string[] = [];
  const asOfMs = new Date(timeline.asOf).getTime();
  const live = timeline.mode === 'live';

  for (const hour of timeline.hours) {
    const where = `${hour.kind} hour ${hour.hourStart}`;
    const expectedLabel = LABEL_FOR_SOURCE[hour.prov.source] ?? 'Estimate';
    if (hour.prov.label !== expectedLabel) {
      problems.push(
        `${where}: label "${hour.prov.label}" does not match source "${hour.prov.source}"`,
      );
    }
    if (hour.kind === 'observed') {
      if (new Date(hour.hourStart).getTime() + HOUR_MS > asOfMs) {
        problems.push(`${where}: observed hour had not ended by asOf (rule I1)`);
      }
    } else if (hour.prov.mode === 'live') {
      problems.push(`${where}: a ${hour.kind} is model output but is labelled live`);
    }
    if (hour.kind !== 'observed' && hour.prov.stationName !== undefined) {
      problems.push(`${where}: a ${hour.kind} carries a station name`);
    }
  }

  const observed = timeline.hours.filter((hour) => hour.kind === 'observed');
  if (live) {
    if (timeline.prov.source !== 'station')
      problems.push('live timeline is not sourced from a station');
    if (timeline.prov.stationName === undefined) problems.push('live timeline has no station name');
    if (timeline.prov.distanceKm === undefined)
      problems.push('live timeline has no station distance');
    if (observed.length === 0) problems.push('live timeline has no observed hours');
    const newest = observed.at(-1);
    if (newest !== undefined && newest.prov.ageMinutes > MAX_LIVE_AGE_MINUTES) {
      problems.push(`live timeline's newest reading is ${newest.prov.ageMinutes} minutes old`);
    }
  } else {
    if (timeline.prov.source !== 'model')
      problems.push(`non-live timeline claims source "${timeline.prov.source}"`);
    if (timeline.prov.simulated !== true)
      problems.push('non-live timeline is not marked simulated (rule I5)');
    if (observed.length > 0) problems.push('non-live timeline contains observed hours');
  }
  return problems;
}

export function checkFires(body: unknown): string[] {
  const problems: string[] = [];
  const fires = body as {
    asOf?: unknown;
    source?: unknown;
    counts?: { last24h?: unknown; last72h?: unknown };
  } | null;
  const a = fires?.counts?.last24h;
  const b = fires?.counts?.last72h;
  if (!Number.isInteger(a) || !Number.isInteger(b) || (a as number) < 0 || (b as number) < 0) {
    problems.push('fire counts are not non-negative integers');
  } else if ((a as number) > (b as number)) {
    problems.push('last 24 hours has more detections than the last 72 hours');
  }
  if (typeof fires?.asOf !== 'string') problems.push('fires has no asOf');
  if (typeof fires?.source !== 'string' || !/detections/i.test(fires.source)) {
    problems.push('fires source does not say these are detections');
  }
  if (JSON.stringify(body).toLowerCase().includes('pm2')) {
    problems.push('fires response mentions PM2.5, but a fire count is not a pollution reading');
  }
  return problems;
}

/** Every error has the same shape: a stable code and a message for a person. */
export function checkError(body: unknown): string[] {
  const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return typeof error?.code === 'string' && typeof error.message === 'string'
    ? []
    : ['error response is not { error: { code, message } }'];
}

/**
 * A replay timeline answers "as of" a past instant inside a prepared week. The rules that matter:
 * it says it is a replay, every hour is marked simulated (rule I5), nothing observed is later than
 * the asked instant (rule I1), nothing is labelled live, and the instant is inside the week.
 */
export function checkReplayTimeline(
  timeline: TimelineLike,
  week: { readonly start: string; readonly end: string },
): string[] {
  const problems: string[] = [];
  const asOfMs = new Date(timeline.asOf).getTime();
  if (timeline.mode !== 'replay') problems.push(`mode is "${timeline.mode}", expected "replay"`);
  if (asOfMs < new Date(week.start).getTime() || asOfMs > new Date(week.end).getTime()) {
    problems.push('asOf is outside the prepared week');
  }
  if (timeline.prov.simulated !== true) problems.push('replay is not marked simulated (rule I5)');
  if (timeline.hours.length === 0) problems.push('replay has no hours');
  for (const hour of timeline.hours) {
    const where = `${hour.kind} hour ${hour.hourStart}`;
    if (hour.prov.mode === 'live') problems.push(`${where}: labelled live in a replay`);
    if (hour.prov.simulated !== true) problems.push(`${where}: not marked simulated (rule I5)`);
    if (hour.kind === 'observed') {
      if (new Date(hour.hourStart).getTime() + HOUR_MS > asOfMs) {
        problems.push(`${where}: observed hour had not ended by asOf (rule I1)`);
      }
      if (hour.prov.stationName === undefined) problems.push(`${where}: no station name`);
    } else if (hour.prov.stationName !== undefined) {
      problems.push(`${where}: a ${hour.kind} carries a station name`);
    }
  }
  return problems;
}

/**
 * A room as the API knows it. An unknown reading is null with no time beside it (never a zero),
 * nothing is from after `asOf`, and a unit that was never seen has no inside number.
 */
export function checkRoom(body: unknown): string[] {
  const problems: string[] = [];
  const room = body as {
    asOf?: unknown;
    insidePm25?: unknown;
    insideObservedAt?: unknown;
    outsidePm25?: unknown;
    outsideObservedAt?: unknown;
    lastSeenMinutes?: unknown;
    simulated?: unknown;
  } | null;
  if (room === null || typeof room !== 'object') return ['room response is not an object'];
  if (typeof room.asOf !== 'string') problems.push('room has no asOf');
  if (typeof room.simulated !== 'boolean')
    problems.push('room does not say whether it is simulated');

  const pairs: [string, unknown, unknown][] = [
    ['inside', room.insidePm25, room.insideObservedAt],
    ['outside', room.outsidePm25, room.outsideObservedAt],
  ];
  for (const [name, value, observedAt] of pairs) {
    if ((value === null) !== (observedAt === null)) {
      problems.push(
        `${name}: a number and the time it was observed must both be present or both null`,
      );
    }
    if (value !== null && (typeof value !== 'number' || value < 0)) {
      problems.push(`${name}: PM2.5 is not a non-negative number`);
    }
    if (
      typeof observedAt === 'string' &&
      typeof room.asOf === 'string' &&
      new Date(observedAt).getTime() > new Date(room.asOf).getTime()
    ) {
      problems.push(`${name}: observed after asOf`);
    }
  }
  if (room.insidePm25 !== null && room.lastSeenMinutes === null) {
    problems.push('there is an inside number but the unit was never seen');
  }
  if (
    room.lastSeenMinutes !== null &&
    (typeof room.lastSeenMinutes !== 'number' || room.lastSeenMinutes < 0)
  ) {
    problems.push('lastSeenMinutes is not a non-negative number');
  }
  return problems;
}

// The routes the app reads (/v1/today, /v1/history, /v1/stations) and the site that serves it.

const MAX_AGE_MINUTES = 6 * 60;

export interface TodayLike {
  readonly mode: string;
  readonly asOf: string;
  readonly hours: readonly {
    readonly t: string;
    readonly pm25: number | null;
    readonly kind: string;
  }[];
  readonly windows: readonly unknown[];
  readonly weather?:
    | {
        readonly hours: readonly {
          readonly rhPct: number;
          readonly windKmh: number;
          readonly windFromDeg: number;
        }[];
      }
    | undefined;
  readonly prov: ProvLike & { readonly observedAt?: string | undefined };
}

const inRange = (value: number | null, high = 1000): boolean =>
  value === null || (Number.isFinite(value) && value >= 0 && value <= high);

/**
 * `/v1/today` on a real answer. Nothing observed is from after `asOf` (I1). A "Nearby station" says which, how
 * far, and is no more than six hours old (I3, I2); with no recent monitor it is an "Estimate" with no observed hours
 * and no advice. Every number is physically possible.
 */
export function checkToday(today: TodayLike): string[] {
  const problems: string[] = [];
  const asOfMs = new Date(today.asOf).getTime();
  const observed = today.hours.filter((h) => h.kind === 'observed');
  for (const hour of today.hours) {
    if (!inRange(hour.pm25))
      problems.push(`hour ${hour.t}: PM2.5 ${String(hour.pm25)} is not possible`);
  }
  for (const hour of observed) {
    if (new Date(hour.t).getTime() + HOUR_MS > asOfMs)
      problems.push(`observed hour ${hour.t} had not ended by asOf (rule I1)`);
  }
  const times = today.hours.map((h) => new Date(h.t).getTime());
  if (times.some((t, i) => i > 0 && t <= (times[i - 1] ?? 0)))
    problems.push('hours are not in order');
  if (today.mode === 'live') {
    if (today.prov.label !== 'Nearby station')
      problems.push(`live answer labelled "${today.prov.label}"`);
    if (today.prov.stationName === undefined)
      problems.push('live answer has no station name (rule I2)');
    if (today.prov.distanceKm === undefined)
      problems.push('live answer has no station distance (rule I2)');
    if (observed.length === 0) problems.push('live answer has no observed hours');
    if (today.prov.ageMinutes > MAX_AGE_MINUTES)
      problems.push(
        `live answer's newest reading is ${String(today.prov.ageMinutes)} minutes old (rule I3)`,
      );
    if (today.prov.observedAt === undefined)
      problems.push('live answer does not say when it was observed');
  } else {
    if (today.prov.label !== 'Estimate')
      problems.push(`model answer labelled "${today.prov.label}"`);
    if (observed.length > 0) problems.push('model answer contains observed hours');
    if (today.prov.stationName !== undefined) problems.push('model answer names a station');
    if (today.windows.length > 0) problems.push('model answer gives advice (rule I3)');
  }
  for (const w of today.weather?.hours ?? []) {
    if (w.rhPct < 0 || w.rhPct > 100 || w.windKmh < 0 || w.windFromDeg < 0 || w.windFromDeg > 360)
      problems.push('a weather hour has an impossible value');
  }
  return problems;
}

export interface HistoryLike {
  readonly mode: string;
  readonly asOf: string;
  readonly days: number;
  readonly hours: readonly { readonly t: string; readonly pm25: number | null }[];
  readonly prov: ProvLike;
}

/** `/v1/history`: only hours that had ended (I1), no more than asked for, in order, and labelled for what they are. */
export function checkHistory(history: HistoryLike): string[] {
  const problems: string[] = [];
  const asOfMs = new Date(history.asOf).getTime();
  if (history.hours.length > history.days * 24 + 1)
    problems.push(`${String(history.hours.length)} hours for ${String(history.days)} days`);
  for (const hour of history.hours) {
    if (new Date(hour.t).getTime() + HOUR_MS > asOfMs)
      problems.push(`hour ${hour.t} had not ended by asOf (rule I1)`);
    if (!inRange(hour.pm25))
      problems.push(`hour ${hour.t}: PM2.5 ${String(hour.pm25)} is not possible`);
  }
  const times = history.hours.map((h) => new Date(h.t).getTime());
  if (times.some((t, i) => i > 0 && t <= (times[i - 1] ?? 0)))
    problems.push('hours are not in order');
  if (
    history.mode === 'live' &&
    (history.prov.stationName === undefined || history.prov.label !== 'Nearby station')
  )
    problems.push('live history does not name its station');
  if (history.mode !== 'live' && history.prov.label !== 'Estimate')
    problems.push(`model history labelled "${history.prov.label}"`);
  return problems;
}

export interface StationsLike {
  readonly asOf: string;
  readonly mode: string;
  readonly stations: readonly {
    readonly id: string;
    readonly lat: number;
    readonly lng: number;
    readonly pm25: number;
    readonly at: string;
  }[];
}

/** `/v1/stations`: every monitor has a recent reading (I3), none from the future (I1), a possible value and a place. */
export function checkStations(body: StationsLike): string[] {
  const problems: string[] = [];
  const asOfMs = new Date(body.asOf).getTime();
  const seen = new Set<string>();
  for (const s of body.stations) {
    const age = asOfMs - new Date(s.at).getTime();
    if (age < 0) problems.push(`${s.id}: reading is from the future (rule I1)`);
    if (age > MAX_AGE_MINUTES * 60_000)
      problems.push(`${s.id}: reading is more than six hours old (rule I3)`);
    if (!inRange(s.pm25)) problems.push(`${s.id}: PM2.5 ${String(s.pm25)} is not possible`);
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) problems.push(`${s.id}: no place`);
    if (seen.has(s.id)) problems.push(`${s.id}: listed twice`);
    seen.add(s.id);
  }
  if (body.mode === 'live' && body.stations.length === 0)
    problems.push('says live but has no monitors');
  return problems;
}

/** What the public site must send with every page (and with the API under it). */
export function checkSecurityHeaders(headers: { get(name: string): string | null }): string[] {
  const problems: string[] = [];
  const csp = headers.get('content-security-policy') ?? '';
  if (!csp.includes("default-src 'self'"))
    problems.push("content policy does not say default-src 'self'");
  if (!csp.includes("frame-ancestors 'none'")) problems.push('the page may be put in a frame');
  if (/script-src[^;]*unsafe/u.test(csp)) problems.push('scripts are allowed to be inline or eval');
  if (!/max-age=\d{6,}/u.test(headers.get('strict-transport-security') ?? ''))
    problems.push('no HSTS');
  if (headers.get('x-content-type-options') !== 'nosniff') problems.push('no nosniff');
  if ((headers.get('x-frame-options') ?? '').toUpperCase() !== 'DENY')
    problems.push('no frame denial');
  return problems;
}
