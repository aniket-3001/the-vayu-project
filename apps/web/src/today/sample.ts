import { seededRandom, usAqi } from '@vayu/core';
import { hourOfDay, isoDate } from './time';
import type {
  Condition,
  DailyPoint,
  DaySky,
  HourlyPoint,
  Pollutants,
  TodayData,
  TodaySource,
  Weather,
} from './types';

/** The moment every sample day describes: 17:30 on a Saturday evening in Delhi, so most of today has happened. */
export const SAMPLE_AS_OF = '2026-10-10T12:00:00.000Z';
const AS_OF = SAMPLE_AS_OF;
const HOUR_MS = 3_600_000;
const SUNRISE = '2026-10-10T00:49:00.000Z'; // 06:19 India time
const SUNSET = '2026-10-10T12:29:00.000Z'; // 17:59 India time

export const SAMPLE_IDS = ['good', 'moderate', 'rainy', 'unhealthy', 'dusty', 'hazardous'] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];

/** Short names for the switcher. */
export const SAMPLE_LABELS: Readonly<Record<SampleId, string>> = {
  good: 'Clear and breezy',
  moderate: 'Mild and hazy',
  rainy: 'Rain clears the air',
  unhealthy: 'Hot and still',
  dusty: 'Dust storm',
  hazardous: 'Winter smog',
};

interface Spec {
  /** PM2.5 in µg/m³ at hour `i` from now (negative is the past) and hour of day `h`. */
  readonly pm: (i: number, h: number) => number;
  readonly temp: { readonly mean: number; readonly amp: number };
  /** Cooling or warming on top of the daily curve, at hour `i`. */
  readonly tempShift?: (i: number) => number;
  readonly humidity: (tempC: number, i: number, h: number) => number;
  readonly wind: (i: number, h: number) => { kmh: number; from: number };
  readonly rain: (i: number) => { chance: number; mm: number; storm?: boolean };
  readonly sky: (isDay: boolean, h: number) => Condition;
  readonly uvPeak: number;
  readonly pm10Ratio: number;
  readonly gases: {
    readonly o3: number;
    readonly no2: number;
    readonly so2: number;
    readonly co: number;
  };
  readonly seed: number;
  readonly station: string;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));
const wave = (h: number, peakAt: number): number => Math.cos(((h - peakAt) / 24) * 2 * Math.PI);
/** Whole calendar days from today (India time) that sample hour `i` falls on: 0 today, -1 yesterday, 1 tomorrow. */
const dayOffsetOf = (i: number): number => Math.floor((hourOfDay(AS_OF) + i) / 24);

/** Other days drift a little from today's recipe, so a week does not look stamped out of one mould. */
const drift = (seed: number, i: number, scale: number): number => {
  const day = dayOffsetOf(i);
  return day === 0 ? 0 : scale * Math.sin(day * 1.9 + seed * 2.7);
};
const round1 = (value: number): number => Math.round(value * 10) / 10;

const SPECS: Readonly<Record<SampleId, Spec>> = {
  good: {
    pm: (_i, h) => 6 + 2 * wave(h, 2),
    temp: { mean: 25, amp: 5 },
    humidity: (t) => 48 - 1.6 * (t - 25),
    wind: (_i, h) => ({ kmh: 17 + 3 * wave(h, 15), from: 315 }),
    rain: () => ({ chance: 4, mm: 0 }),
    sky: (isDay, h) => (isDay && h > 13 && h < 16 ? 'partly-cloudy' : 'clear'),
    uvPeak: 7,
    pm10Ratio: 1.7,
    gases: { o3: 48, no2: 9, so2: 4, co: 240 },
    seed: 1,
    station: 'Sample monitor, south Delhi',
  },
  moderate: {
    pm: (_i, h) => 24 + 5 * wave(h, 21),
    temp: { mean: 27, amp: 5 },
    humidity: (t) => 62 - 1.8 * (t - 27),
    wind: (_i, h) => ({ kmh: 8 + 2 * wave(h, 14), from: 290 }),
    rain: () => ({ chance: 8, mm: 0 }),
    sky: (isDay, h) => (isDay ? (h < 12 ? 'haze' : 'partly-cloudy') : 'haze'),
    uvPeak: 6,
    pm10Ratio: 2.1,
    gases: { o3: 61, no2: 21, so2: 9, co: 420 },
    seed: 2,
    station: 'Sample monitor, central Delhi',
  },
  rainy: {
    pm: (i, h) => {
      if (i < 4) return 47 + 8 * wave(h, 21);
      const washed = 12 + (47 - 12) * Math.exp(-(i - 4) / 3.5);
      return i < 16 ? washed : washed + 0.4 * Math.min(i - 16, 40);
    },
    temp: { mean: 26, amp: 3 },
    tempShift: (i) => (i >= 3 && i <= 12 ? -4 : 0),
    humidity: (t, i) => clamp(Math.round(92 - 2 * (t - 22) + (i >= 3 && i <= 12 ? 4 : 0)), 55, 96),
    wind: (i, h) => ({
      kmh: i >= 4 && i <= 8 ? 24 + 4 * wave(h, 12) : 11 + 2 * wave(h, 15),
      from: 135,
    }),
    rain: (i) => {
      if (i >= 3 && i <= 9)
        return {
          chance: 88,
          mm: [0.6, 1.8, 4.5, 4.9, 3.1, 1.4, 0.7][i - 3] ?? 0.5,
          storm: i === 5 || i === 6,
        };
      if (i >= 10 && i <= 11) return { chance: 35, mm: 0.2 };
      return { chance: i < 3 ? 40 : 14, mm: 0 };
    },
    sky: () => 'cloudy',
    uvPeak: 4,
    pm10Ratio: 1.9,
    gases: { o3: 38, no2: 14, so2: 6, co: 300 },
    seed: 3,
    station: 'Sample monitor, east Delhi',
  },
  unhealthy: {
    pm: (_i, h) => 74 + 10 * wave(h, 4),
    temp: { mean: 31, amp: 6 },
    humidity: (t) => 54 - 3.2 * (t - 28),
    wind: (_i, h) => ({ kmh: 12 - 5 * wave(h, 15), from: 320 }),
    rain: () => ({ chance: 3, mm: 0 }),
    sky: () => 'clear',
    uvPeak: 8,
    pm10Ratio: 3.1,
    gases: { o3: 52, no2: 18, so2: 26, co: 730 },
    seed: 4,
    station: 'Sample monitor, north-east Delhi',
  },
  dusty: {
    pm: (i) => 160 + 40 * Math.sin(i / 3),
    temp: { mean: 36, amp: 4 },
    humidity: (t) => 20 - 0.8 * (t - 36),
    wind: (i, h) => ({ kmh: 36 + 8 * Math.sin(i / 2) + 3 * wave(h, 16), from: 270 }),
    rain: () => ({ chance: 2, mm: 0 }),
    sky: (isDay, h) => (isDay && h > 10 && h < 17 ? 'dust' : 'windy'),
    uvPeak: 7,
    pm10Ratio: 4.2,
    gases: { o3: 70, no2: 27, so2: 15, co: 820 },
    seed: 5,
    station: 'Sample monitor, west Delhi',
  },
  hazardous: {
    pm: (_i, h) => 285 + 40 * wave(h, 3),
    temp: { mean: 9, amp: 3 },
    humidity: (t) => 88 - 1.5 * (t - 11),
    wind: (_i, h) => ({ kmh: 3 + 1.5 * wave(h, 14), from: 45 }),
    rain: () => ({ chance: 5, mm: 0 }),
    sky: (isDay, h) => (!isDay || h < 10 ? 'fog' : 'haze'),
    uvPeak: 2,
    pm10Ratio: 1.6,
    gases: { o3: 22, no2: 64, so2: 38, co: 1900 },
    seed: 6,
    station: 'Sample monitor, north Delhi',
  },
};

/** The sun is up from sunrise to sunset, India time. */
const sunUp = (h: number): boolean => h >= hourOfDay(SUNRISE) && h < hourOfDay(SUNSET);

function weatherAt(spec: Spec, i: number, at: string): Weather {
  const h = hourOfDay(at);
  const isDay = sunUp(h);
  const tempC = Math.round(
    spec.temp.mean +
      spec.temp.amp * wave(h, 15) +
      (spec.tempShift?.(i) ?? 0) +
      drift(spec.seed + 3, i, 2.2),
  );
  const wind = spec.wind(i, h);
  wind.kmh *= 1 + drift(spec.seed + 5, i, 0.3);
  const rain = spec.rain(i);
  // After today, some days turn cloudy or hold a chance of showers, so a week has weather in it.
  const mood = i < 24 ? 0 : Math.sin(Math.floor(i / 24) * 1.9 + spec.seed * 2.7);
  const sky = spec.sky(isDay, h);
  const calm = sky !== 'fog' && sky !== 'dust';
  const condition: Condition =
    rain.storm === true
      ? 'thunderstorm'
      : rain.mm >= 1
        ? 'rain'
        : rain.mm > 0
          ? 'drizzle'
          : calm && mood > 0.55
            ? isDay
              ? 'partly-cloudy'
              : 'cloudy'
            : calm && mood < -0.8
              ? 'cloudy'
              : sky;
  if (calm && mood < -0.8 && rain.chance < 25) rain.chance = 30;
  const rise = hourOfDay(SUNRISE);
  const set = hourOfDay(SUNSET);
  return {
    condition,
    isDay,
    tempC,
    humidityPct: clamp(Math.round(spec.humidity(tempC, i, h)), 8, 98),
    windKmh: Math.max(0, Math.round(wind.kmh)),
    windFromDeg: ((Math.round(wind.from) % 360) + 360) % 360,
    rainChancePct: rain.chance,
    rainMm: rain.mm,
    uvIndex: isDay
      ? Math.round(
          spec.uvPeak * Math.sin((Math.PI * (h - rise)) / (set - rise)) * (rain.mm > 0 ? 0.4 : 1),
        )
      : 0,
  };
}

const atHour = (i: number): string => new Date(Date.parse(AS_OF) + i * HOUR_MS).toISOString();

function pmAt(spec: Spec, i: number): number {
  const noise = (seededRandom(spec.seed * 1009 + i + 5000)() - 0.5) * 0.04;
  return round1(
    Math.max(1, spec.pm(i, hourOfDay(atHour(i))) * (1 + noise + drift(spec.seed, i, 0.14))),
  );
}
const aqiOf = (pm25: number): number => usAqi(pm25)?.value ?? 0;

/** One day, built from a recipe and the real US AQI scale. Repeatable: the same id always gives the same day. */
/** A made-up day always has everything: the weather, the sun and every gas. */
export type SampleDay = Omit<TodayData, 'weather' | 'sun' | 'hourly' | 'daily' | 'pollutants'> & {
  readonly weather: Weather;
  readonly sun: { readonly sunrise: string; readonly sunset: string };
  readonly hourly: readonly (HourlyPoint & { readonly weather: Weather })[];
  readonly daily: readonly (DailyPoint & { readonly sky: DaySky })[];
  readonly pollutants: Required<Pollutants>;
};

export function sampleDay(id: SampleId): SampleDay {
  const spec = SPECS[id];
  const hourly: (HourlyPoint & { weather: Weather })[] = Array.from({ length: 48 }, (_, i) => {
    const pm25 = pmAt(spec, i);
    return { at: atHour(i), aqi: aqiOf(pm25), pm25, weather: weatherAt(spec, i, atHour(i)) };
  });
  const history = Array.from({ length: 48 }, (_, k) => {
    const i = k - 47;
    const pm25 = pmAt(spec, i);
    return { at: atHour(i), aqi: aqiOf(pm25), pm25 };
  });

  // Seven calendar days in Delhi, from today, each from its own 24 hours of the recipe.
  const byDate = new Map<string, { at: string; i: number }[]>();
  for (let i = -9; i < 7 * 24 + 24; i++) {
    const at = atHour(i);
    byDate.set(isoDate(at), [...(byDate.get(isoDate(at)) ?? []), { at, i }]);
  }
  const todayKey = isoDate(AS_OF);
  const dayKeys = [...byDate.keys()].filter((key) => key >= todayKey).slice(0, 7);
  const daily: (DailyPoint & { sky: DaySky })[] = dayKeys.map((key) => {
    const hours = (byDate.get(key) ?? []).map(({ at, i }) => ({
      pm25: pmAt(spec, i),
      w: weatherAt(spec, i, at),
    }));
    const midday = hours.filter((hour) => hour.w.isDay);
    const mean = (values: readonly number[]): number =>
      values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    const noon = midday[Math.floor(midday.length / 2)]?.w ?? hours[0]?.w;
    const worst = hours.reduce(
      (a, b) => (b.w.rainMm > a.w.rainMm ? b : a),
      hours[0] ?? { pm25: 0, w: weatherAt(spec, 0, AS_OF) },
    );
    return {
      date: new Date(Date.parse(`${key}T00:00:00+05:30`)).toISOString(),
      aqi: aqiOf(mean(hours.map((hour) => hour.pm25))),
      sky: {
        hiC: Math.max(...hours.map((hour) => hour.w.tempC)),
        loC: Math.min(...hours.map((hour) => hour.w.tempC)),
        windKmh: Math.round(mean(hours.map((hour) => hour.w.windKmh))),
        windFromDeg: noon?.windFromDeg ?? 0,
        humidityPct: Math.round(mean(hours.map((hour) => hour.w.humidityPct))),
        rainChancePct: Math.max(...hours.map((hour) => hour.w.rainChancePct)),
        condition: worst.w.rainMm > 0 ? worst.w.condition : (noon?.condition ?? 'clear'),
      },
    };
  });

  const now = hourly[0];
  if (now === undefined) throw new Error('A sample day needs a first hour');
  const pollutants: Required<Pollutants> = {
    pm25: now.pm25,
    pm10: round1(now.pm25 * spec.pm10Ratio),
    ...spec.gases,
  };
  return {
    id,
    place: { name: 'Delhi', region: 'India' },
    asOf: AS_OF,
    aqi: now.aqi,
    pm25: now.pm25,
    weather: now.weather,
    pollutants,
    hourly,
    daily,
    history,
    sun: { sunrise: SUNRISE, sunset: SUNSET },
    provenance: {
      mode: 'sample',
      label: 'Sample',
      stationName: spec.station,
      distanceKm: 3.2,
      ageMinutes: 12,
    },
  };
}

/** A source that always answers with the same made-up day. The real one will have the same shape. */
export const sampleSource = (id: SampleId): TodaySource => ({
  load: () => Promise.resolve(sampleDay(id)),
});

/** How many whole days back the sample air reaches, not counting today. */
export const SAMPLE_HISTORY_DAYS = 14;

/**
 * PM2.5 for each hour of one India calendar date, for a made-up day, as far back as the sample reaches.
 * The hour in progress, hours that have not happened, and dates outside the window are `undefined`: we have
 * no finished reading for them.
 */
export function sampleAmbientPm25(id: SampleId, date: string): readonly (number | undefined)[] {
  const spec = SPECS[id];
  const hours: (number | undefined)[] = Array.from({ length: 24 }, () => undefined);
  for (let i = -(SAMPLE_HISTORY_DAYS + 1) * 24; i < 0; i++) {
    const at = atHour(i);
    if (isoDate(at) === date) hours[Math.floor(hourOfDay(at))] = pmAt(spec, i);
  }
  return hours;
}

/** The India calendar date of the sample moment, "2026-10-10". */
export const SAMPLE_TODAY = isoDate(SAMPLE_AS_OF);
