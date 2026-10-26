export const KINDS = [
  'session_start',
  'screen',
  'feature',
  'permission',
  'bluetooth',
  'error',
  'api',
  'active',
] as const;
export type Kind = (typeof KINDS)[number];

export const DIMENSIONS = ['all', 'platform', 'version', 'region', 'auth', 'visitor'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface AnalyticsEvent {
  readonly kind: Kind;
  readonly detail: string;
  readonly n: number;
  readonly at: string;
}
export interface DeviceInfo {
  readonly platform: 'web' | 'android' | 'ios';
  readonly appVersion: string;
  readonly os: string;
  readonly model: string;
  readonly screen: string;
  readonly lang: string;
  readonly cell?: { readonly lat: number; readonly lng: number };
}
export interface Batch {
  readonly deviceId: string;
  readonly sessionId: string;
  readonly device: DeviceInfo;
  readonly events: readonly AnalyticsEvent[];
}

export const MAX_EVENTS = 25;
const MAX_COUNT = 3600;

/** The only details an event of that kind may carry; anything else is refused, so counters cannot grow without bound. */
export const ALLOWED: Readonly<
  Record<'screen' | 'feature' | 'permission' | 'bluetooth', readonly string[]>
> = {
  screen: ['myair', 'place', 'account', 'exposure', 'map', 'lens', 'room', 'week', 'admin'],
  feature: [
    'detect_location',
    'add_place',
    'search',
    'air_lens',
    'assistant',
    'exposure',
    'map_layer',
    'recorded_days',
    'bluetooth_connect',
  ],
  permission: ['location:granted', 'location:denied'],
  bluetooth: ['connect:ok', 'connect:fail'],
};

export type Parsed =
  | { readonly ok: true; readonly batch: Batch }
  | { readonly ok: false; readonly code: string; readonly message: string };

const refuse = (code: string, message: string): Parsed => ({ ok: false, code, message });
const ID = /^[A-Za-z0-9-]{8,64}$/u;
const VERSION = /^[A-Za-z0-9._-]{1,30}$/u;
const LABEL = /^[A-Za-z0-9 ._()/-]{0,40}$/u;
const round1 = (x: number): number => Math.round(x * 10) / 10;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function parseEvent(raw: unknown): AnalyticsEvent | undefined {
  if (!isRecord(raw)) return undefined;
  const { kind, detail, n, at } = raw;
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) return undefined;
  const k = kind as Kind;
  let text = typeof detail === 'string' ? detail : '';
  if (k === 'screen' || k === 'feature' || k === 'permission' || k === 'bluetooth') {
    if (!ALLOWED[k].includes(text)) return undefined;
  } else if (k === 'error' || k === 'api') {
    text = text
      .replace(/[^A-Za-z0-9 :_./-]/gu, '')
      .trim()
      .slice(0, 80);
    if (text === '') text = 'unknown';
  } else text = '';
  const count = n === undefined ? 1 : n;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_COUNT)
    return undefined;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return undefined;
  return { kind: k, detail: text, n: count, at: new Date(at).toISOString() };
}

/** Checks a batch the app sent. Unknown fields (including any claim about who the person is) are dropped, never kept. */
export function parseBatch(raw: unknown): Parsed {
  if (!isRecord(raw)) return refuse('invalid_body', 'Send a JSON object.');
  const { deviceId, sessionId, device, events } = raw;
  if (
    typeof deviceId !== 'string' ||
    !ID.test(deviceId) ||
    typeof sessionId !== 'string' ||
    !ID.test(sessionId)
  )
    return refuse('bad_device_id', 'deviceId and sessionId must be short ids.');
  if (!isRecord(device)) return refuse('bad_device', 'device is missing.');
  const { platform, appVersion, os, model, screen, lang, cell } = device;
  if (platform !== 'web' && platform !== 'android' && platform !== 'ios')
    return refuse('bad_device', 'Unknown platform.');
  if (typeof appVersion !== 'string' || !VERSION.test(appVersion))
    return refuse('bad_device', 'Bad app version.');
  const labels: string[] = [];
  for (const value of [os, model, screen, lang]) {
    if (value !== undefined && (typeof value !== 'string' || !LABEL.test(value)))
      return refuse('bad_device', 'Bad device label.');
    labels.push(value === undefined || value === '' ? 'unknown' : (value));
  }
  let rounded: { lat: number; lng: number } | undefined;
  if (cell !== undefined) {
    if (
      !isRecord(cell) ||
      typeof cell.lat !== 'number' ||
      typeof cell.lng !== 'number' ||
      !Number.isFinite(cell.lat) ||
      !Number.isFinite(cell.lng)
    )
      return refuse('bad_device', 'Bad location cell.');
    rounded = { lat: round1(cell.lat), lng: round1(cell.lng) };
  }
  if (!Array.isArray(events) || events.length === 0)
    return refuse('no_events', 'Send at least one event.');
  if (events.length > MAX_EVENTS)
    return refuse('too_many_events', `At most ${String(MAX_EVENTS)} events.`);
  const parsed: AnalyticsEvent[] = [];
  for (const item of events) {
    const event = parseEvent(item);
    if (event === undefined) return refuse('bad_event', 'An event is not allowed.');
    parsed.push(event);
  }
  const [o = 'unknown', m = 'unknown', s = 'unknown', l = 'unknown'] = labels;
  return {
    ok: true,
    batch: {
      deviceId,
      sessionId,
      device: {
        platform,
        appVersion,
        os: o,
        model: m,
        screen: s,
        lang: l,
        ...(rounded ? { cell: rounded } : {}),
      },
      events: parsed,
    },
  };
}

const CITIES: readonly (readonly [string, number, number])[] = [
  ['Delhi', 28.61, 77.21],
  ['Gurugram', 28.46, 77.03],
  ['Noida', 28.57, 77.32],
  ['Ghaziabad', 28.67, 77.44],
  ['Faridabad', 28.41, 77.31],
  ['Chandigarh', 30.73, 76.78],
  ['Ludhiana', 30.9, 75.86],
  ['Amritsar', 31.63, 74.87],
  ['Jalandhar', 31.33, 75.58],
  ['Jaipur', 26.91, 75.79],
  ['Jodhpur', 26.24, 73.02],
  ['Udaipur', 24.59, 73.71],
  ['Agra', 27.18, 78.02],
  ['Lucknow', 26.85, 80.95],
  ['Kanpur', 26.45, 80.35],
  ['Varanasi', 25.32, 82.97],
  ['Prayagraj', 25.44, 81.85],
  ['Meerut', 28.98, 77.71],
  ['Dehradun', 30.32, 78.03],
  ['Haridwar', 29.95, 78.16],
  ['Shimla', 31.1, 77.17],
  ['Srinagar', 34.08, 74.8],
  ['Jammu', 32.73, 74.86],
  ['Patna', 25.59, 85.14],
  ['Ranchi', 23.34, 85.31],
  ['Bhopal', 23.26, 77.41],
  ['Indore', 22.72, 75.86],
  ['Ahmedabad', 23.02, 72.57],
  ['Kolkata', 22.57, 88.36],
  ['Nagpur', 21.15, 79.09],
  ['Bengaluru', 12.97, 77.59],
  ['Mumbai', 19.08, 72.88],
  ['Hyderabad', 17.39, 78.49],
  ['Chennai', 13.08, 80.27],
  ['Pune', 18.52, 73.86],
];

const km = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/** The name of the city within 60 km of a point, else "Other". Only the city is ever stored, never the point. */
export function cityOf(lat: number, lng: number): string {
  let best = 'Other';
  let bestKm = 60;
  for (const [name, cLat, cLng] of CITIES) {
    const d = km(lat, lng, cLat, cLng);
    if (d < bestKm) {
      best = name;
      bestKm = d;
    }
  }
  return best;
}
